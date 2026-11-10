// Disposable PostgreSQL 17 integration: never points at qa_dashboard_lab.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { writeQaStandbyEvaluation, getQaStandbyOutboxCounts, QaStandbyBlocked } from '../server/qaStandbyPgJournal.js';
import { qaFailoverDecision,qaFailbackDecision } from '../server/qaFailoverDecision.js';

if(process.env.QA_PG_ISOLATED_TEST!=='1' || !process.env.QA_TEST_DATABASE_URL)
  throw Error('Refuse non-disposable PostgreSQL integration test');
const pool=new pg.Pool({connectionString:process.env.QA_TEST_DATABASE_URL,max:4,connectionTimeoutMillis:5000});
const blocked=code=>error=>error instanceof QaStandbyBlocked && error.code===code;
try{
  const db=await pool.query('SELECT current_database() AS db');
  assert.equal(db.rows[0].db,'qa_cutover_ci_test','Refuse any real database');
  await pool.query('DROP SCHEMA IF EXISTS qa_failover_v1 CASCADE');
  await pool.query(await readFile(new URL('../migration/qa-local-failover-postgres17.sql',import.meta.url),'utf8'));
  assert.deepEqual(await getQaStandbyOutboxCounts(pool),{pending:0,in_flight:0,synced:0,conflict:0});
  const now=()=>new Date().toISOString();
  const trusted=()=>({
    mode:'isolated-fixture',fixtureAuthorizedByServer:true,production:false,
    session:{verified:true,role:'Quality Assurance',status:'active',username:'qa_test',
      expiresAt:new Date(Date.now()+3600000).toISOString()},
    authoritativeScope:{agentName:'Synthetic Agent',monthKey:'2026-11'},
    authoritativeLocks:{source:'trusted-server',verified:true,monthKey:'2026-11',agentName:'Synthetic Agent',
      signatureLocked:false,appealHold:false,checkedAt:now()},
    editLease:{source:'trusted-server',verified:true,evaluationId:'qa-test-1',username:'qa_test',valid:true},
  });
  const doc={id:'qa-test-1',caseId:'AA000001',agentName:'Synthetic Agent',evaluationMonthKey:'2026-11',
    finalScore:85,topics:[{code:'1',score:85}],evaluatorUsername:'qa_test',evaluationType:'case'};
  const create={action:'create',operationId:'qa-create-1',evaluationId:doc.id,expectedVersion:0,record:doc};
  // A ready database alone must not permit writes.
  await assert.rejects(writeQaStandbyEvaluation(pool,create,trusted()),blocked('standby_not_activated'));
  await pool.query("UPDATE qa_failover_v1.state SET mode='standby',generation=1,source_snapshot_verified=true,write_frozen=false WHERE id=1");
  const created=await writeQaStandbyEvaluation(pool,create,trusted());
  assert.deepEqual(created,{ok:true,operationId:'qa-create-1',evaluationId:doc.id,version:1,queued:true,replay:false});
  assert.equal((await writeQaStandbyEvaluation(pool,create,trusted())).replay,true);
  await assert.rejects(writeQaStandbyEvaluation(pool,{...create,record:{...doc,finalScore:100}},trusted()),blocked('idempotency_key_reused'));
  assert.deepEqual(await getQaStandbyOutboxCounts(pool),{pending:1,in_flight:0,synced:0,conflict:0});
  const update={action:'update',operationId:'qa-update-1',evaluationId:doc.id,expectedVersion:1,
    record:{...doc,finalScore:82}};
  assert.equal((await writeQaStandbyEvaluation(pool,update,trusted())).version,2);
  await assert.rejects(writeQaStandbyEvaluation(pool,{...update,operationId:'qa-stale-1'},trusted()),blocked('missing_deleted_or_stale_record'));
  await assert.rejects(writeQaStandbyEvaluation(pool,{...update,operationId:'qa-locked-1',expectedVersion:2},{
    ...trusted(),authoritativeLocks:{...trusted().authoritativeLocks,signatureLocked:true},
  }),blocked('monthly_locks_unverified'));
  await assert.rejects(writeQaStandbyEvaluation(pool,{...update,operationId:'qa-change-id-1',expectedVersion:2,
    record:{...doc,caseId:'AA999999'}},trusted()),blocked('immutable_identity_changed'));
  await assert.rejects(writeQaStandbyEvaluation(pool,{...create,operationId:'bad-unauthorized'},{
    ...trusted(),session:{...trusted().session,role:'Admin Live Chat'},
  }),blocked('session_not_verified'));
  // Live mode always refuses a browser-provided context.
  await assert.rejects(writeQaStandbyEvaluation(pool,{...create,operationId:'untrusted'},{
    ...trusted(),mode:'server-approved-failover',production:true,
  }),blocked('production_writer_disabled'));
  const del={action:'delete',operationId:'qa-delete-1',evaluationId:doc.id,expectedVersion:2};
  assert.equal((await writeQaStandbyEvaluation(pool,del,trusted())).version,3);
  assert.equal((await writeQaStandbyEvaluation(pool,del,trusted())).replay,true);
  const row=await pool.query('SELECT record,version,deleted_at FROM qa_failover_v1.evaluations WHERE evaluation_id=$1',[doc.id]);
  assert.equal(Number(row.rows[0].version),3);
  assert.equal(row.rows[0].record.finalScore,82,'score must remain unchanged by soft delete');
  assert.ok(row.rows[0].deleted_at);
  assert.ok(row.rows[0].record.deletedAt);
  assert.deepEqual(await getQaStandbyOutboxCounts(pool),{pending:3,in_flight:0,synced:0,conflict:0});
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM qa_failover_v1.audit')).rows[0].n,3);
  // Unreplayed standby writes prohibit switching primary back even if quota recovers.
  assert.equal(qaFailbackDecision({serverAuthority:'qa-server-verified',
    primary:{health:'healthy',verifiedByServer:true},
    outbox:{pending:3,inFlight:0,conflicts:0},parity:{complete:false,verified:false,mismatches:0},
    lease:{frozenWrites:true}}).canFailback,false);
  await pool.query("UPDATE qa_failover_v1.state SET write_frozen=true WHERE id=1");
  await assert.rejects(writeQaStandbyEvaluation(pool,{...create,operationId:'qa-no-write-after-freeze',evaluationId:'qa-test-2',
    record:{...doc,id:'qa-test-2',caseId:'AA000002'}},trusted()),blocked('standby_not_activated'));
  // Concurrent attempts for a new ID serialize and never duplicate audit/outbox.
  await pool.query("UPDATE qa_failover_v1.state SET write_frozen=false WHERE id=1");
  const cdoc={...doc,id:'qa-race-1',caseId:'AA000003'};
  const req={action:'create',evaluationId:cdoc.id,expectedVersion:0,record:cdoc,operationId:'race-one-op'};
  const attempts=await Promise.all([
    writeQaStandbyEvaluation(pool,req,trusted()),writeQaStandbyEvaluation(pool,req,trusted()),
  ]);
  assert.equal(attempts.filter(x=>x.replay).length,1);
  assert.equal(attempts.filter(x=>!x.replay).length,1);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM qa_failover_v1.outbox WHERE operation_id='race-one-op'")).rows[0].n,1);
  const noCase={...doc,id:'qa-no-case-1',caseId:'',evaluationType:'no_case_month',finalScore:0};
  const zero=await writeQaStandbyEvaluation(pool,{
    action:'create',operationId:'qa-no-case-create-1',evaluationId:noCase.id,
    expectedVersion:0,record:noCase,
  },trusted());
  assert.equal(zero.version,1);
  const noCaseSaved=await pool.query(
    'SELECT record FROM qa_failover_v1.evaluations WHERE evaluation_id=$1',[noCase.id]);
  assert.equal(noCaseSaved.rows[0].record.finalScore,0);
  assert.equal(noCaseSaved.rows[0].record.caseId,'');
  console.log('PASS: PostgreSQL standby atomic create/update/tombstone + durable outbox, replay, lock, role, freeze, stale version and concurrent ID safety; Firestore untouched');
}finally{await pool.end();}
