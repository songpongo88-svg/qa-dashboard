// Real disposable PG17 outbox + transactional in-memory Firestore adapter.
// Models an outage with offline case create/edit/delete, lost Firestore ACK,
// idempotent retry and unchanged historical score.
import assert from 'node:assert/strict';
import pg from 'pg';
import {writeQaStandbyEvaluation,getQaStandbyOutboxCounts} from '../server/qaStandbyPgJournal.js';
import {replayOneQaStandbyOperation,replayQaStandbyBatch}
  from '../server/qaStandbyReplayWorker.js';
import {createQaFirestoreFailbackAdapter} from '../server/qaFirestoreFailbackAdapter.js';
import {createHash} from 'node:crypto';
if(process.env.QA_PG_ISOLATED_TEST!=='1'||!process.env.QA_TEST_DATABASE_URL)
  throw Error('Disposable PG17 only');

class SimulatedFirestore {
  constructor(){this.docs=new Map();this.transactions=0;}
  collection(name){return {doc:id=>({key:name+'/'+id})};}
  async runTransaction(fn){
    const writes=[];
    const db=this;
    const tx={
      async get(ref){
        if(writes.length)throw Error('firestore_reads_must_precede_writes');
        const data=db.docs.get(ref.key);
        return {exists:data!==undefined,data:()=>structuredClone(data)};
      },
      create(ref,record){writes.push({kind:'create',key:ref.key,value:structuredClone(record)});},
      set(ref,record,{merge}={}){writes.push({kind:merge?'merge':'set',
        key:ref.key,value:structuredClone(record)});},
    };
    const result=await fn(tx);
    for(const w of writes){
      if(w.kind==='create'&&db.docs.has(w.key))throw Error('firestore_duplicate_create');
      db.docs.set(w.key,w.kind==='merge'
        ?{...(db.docs.get(w.key)||{}),...w.value}:w.value);
    }
    if(writes.length)this.transactions++;
    return result;
  }
}
const pool=new pg.Pool({connectionString:process.env.QA_TEST_DATABASE_URL,max:3});
try{
  assert.equal((await pool.query('SELECT current_database() AS db')).rows[0].db,
    'qa_cutover_ci_test');
  const oldRows=(await pool.query(
    'SELECT evaluation_id,record FROM qa_failover_v1.evaluations'+
    ' ORDER BY evaluation_id')).rows;
  assert.equal(oldRows.length,2,'previously seeded evaluation fixture required');
  const previous=oldRows.map(r=>({id:r.evaluation_id,score:r.record.finalScore}));
  await pool.query("UPDATE qa_failover_v1.state SET mode='standby',generation=1,"+
    "source_snapshot_verified=true,write_frozen=false WHERE id=1");
  const now=()=>new Date().toISOString();
  const authorized=()=>({
    mode:'isolated-fixture',fixtureAuthorizedByServer:true,production:false,
    session:{verified:true,role:'Quality Assurance',status:'active',
      username:'qa_editor',expiresAt:new Date(Date.now()+3600000).toISOString()},
    authoritativeScope:{agentName:'Synthetic Agent',monthKey:'2026-11'},
    authoritativeLocks:{source:'trusted-server',verified:true,
      signatureLocked:false,appealHold:false,agentName:'Synthetic Agent',
      monthKey:'2026-11',checkedAt:now()},
    editLease:{source:'trusted-server',verified:true,valid:true,
      username:'qa_editor',evaluationId:'qa-offline-001'},
  });
  const doc={id:'qa-offline-001',caseId:'AA000019',agentName:'Synthetic Agent',
    evaluationMonthKey:'2026-11',evaluatorUsername:'qa_editor',
    evaluationType:'case',finalScore:85,topics:[{code:'1',score:8}]};
  await writeQaStandbyEvaluation(pool,{
    action:'create',operationId:'qa-offline-create-01',evaluationId:doc.id,
    expectedVersion:0,record:doc,
  },authorized());
  await writeQaStandbyEvaluation(pool,{
    action:'update',operationId:'qa-offline-edit-01',evaluationId:doc.id,
    expectedVersion:1,record:{...doc,finalScore:82},
  },authorized());
  await writeQaStandbyEvaluation(pool,{
    action:'delete',operationId:'qa-offline-delete-01',evaluationId:doc.id,
    expectedVersion:2,
  },authorized());
  assert.deepEqual(await getQaStandbyOutboxCounts(pool),
    {pending:3,in_flight:0,synced:0,conflict:0});
  const current=(await pool.query(
    'SELECT record,version,deleted_at FROM qa_failover_v1.evaluations'+
    ' WHERE evaluation_id=$1',[doc.id])).rows[0];
  assert.equal(current.record.finalScore,82);
  assert.equal(Number(current.version),3);
  assert.ok(current.deleted_at);
  await pool.query("UPDATE qa_failover_v1.state SET mode='reconciling',"+
    "write_frozen=true WHERE id=1");
  const primary=new SimulatedFirestore();
  const makeAdapter=()=>createQaFirestoreFailbackAdapter({
    database:primary,allowServerReplay:async()=>true,
    serializeRecord:row=>structuredClone(row),
    fingerprintExisting:row=>createHash('sha256').update(JSON.stringify(row))
      .digest('hex'),
    authorizeTransaction:async()=>({
      authoritative:true,sessionValid:true,accountActive:true,
      signatureUnlocked:true,appealHoldClear:true,scopeVerified:true,
    }),
  });
  const firestore=makeAdapter();
  let first=true;
  const unstable={
    async applyIfVersionMatches(op){
      const result=await firestore.applyIfVersionMatches(op);
      if(first){first=false;throw Error('lost_network_ack_after_firestore_commit');}
      return result;
    },
  };
  const auth={mode:'isolated-fixture',fixtureAuthorizedByServer:true};
  const retry=await replayOneQaStandbyOperation(pool,unstable,auth);
  assert.equal(retry.retry,true,'unknown remote commit must stay queued');
  assert.equal(primary.docs.get('qa_evaluations/'+doc.id).finalScore,85);
  assert.equal(primary.transactions,1);
  assert.deepEqual(await getQaStandbyOutboxCounts(pool),
    {pending:3,in_flight:0,synced:0,conflict:0});
  const result=await replayQaStandbyBatch(pool,firestore,auth,{maxOperations:10});
  assert.deepEqual(result,{
    processed:3,synced:3,conflicts:0,
    retryRequired:false,noEligibleOperations:true,
  });
  assert.deepEqual(await getQaStandbyOutboxCounts(pool),
    {pending:0,in_flight:0,synced:3,conflict:0});
  const final=primary.docs.get('qa_evaluations/'+doc.id);
  assert.equal(final.finalScore,82);
  assert.equal(final.qa_failover_version,3);
  assert.ok(final.deleted_at,'offline delete remains a tombstone in Firestore');
  assert.equal(primary.transactions,3,'lost ACK must not commit duplicate');
  assert.equal([...primary.docs.keys()].filter(k=>
    k.startsWith('qa_failback_applied_operations/')).length,3);
  const unchanged=(await pool.query(
    'SELECT evaluation_id,record FROM qa_failover_v1.evaluations'+
    " WHERE evaluation_id!='qa-offline-001' ORDER BY evaluation_id")).rows;
  assert.deepEqual(unchanged.map(r=>({id:r.evaluation_id,score:r.record.finalScore})),
    previous,'historical QA scores must stay untouched');
  console.log('PASS QA full simulated failback: real PostgreSQL create/edit/delete, lost remote ACK, Firestore transactional idempotency, unchanged historical scores');
}finally{await pool.end();}
