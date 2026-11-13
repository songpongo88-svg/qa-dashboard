import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createQaFirestoreFailbackAdapter} from '../server/qaFirestoreFailbackAdapter.js';

const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
class FakeDb{
  constructor(){this.docs=new Map();this.commits=0;}
  collection(name){return {doc:id=>({key:name+'/'+id})};}
  async runTransaction(run){
    const changes=[];
    const tx={
      async get(ref){
        if(changes.length)throw Error('read_after_write');
        const data=thisDb.docs.get(ref.key);
        return {exists:data!==undefined,data:()=>structuredClone(data)};
      },
      create(ref,record){
        if(thisDb.docs.has(ref.key))throw Error('already_exists');
        changes.push({type:'create',key:ref.key,data:structuredClone(record)});
      },
      set(ref,record,{merge}={}){
        changes.push({type:merge?'merge':'set',key:ref.key,data:structuredClone(record)});
      },
    };
    const thisDb=this;
    const result=await run(tx);
    for(const c of changes){
      if(c.type==='create'&&this.docs.has(c.key))throw Error('collision');
      this.docs.set(c.key,c.type==='merge'?{...(this.docs.get(c.key)||{}),...c.data}:c.data);
    }
    if(changes.length)this.commits++;
    return result;
  }
}
const date=()=>new Date('2026-11-11T05:00:00Z');
const db=new FakeDb();
let allow=true,permission=true;
const can=()=>allow;
const verifier=async(tx,ctx)=>({
  authoritative:true,sessionValid:true,accountActive:permission,
  signatureUnlocked:true,appealHoldClear:true,scopeVerified:true,
});
const makeAdapter=(overrides={})=>createQaFirestoreFailbackAdapter({
  database:db,allowServerReplay:can,authorizeTransaction:verifier,
  serializeRecord:record=>({...record}),fingerprintExisting:hash,now:date,
  ...overrides,
});
const adapter=makeAdapter();
const original={id:'qa_001',caseId:'AA334880',finalScore:85,topics:[],agentName:'Sample QA'};
const create={
  operationId:'create-qa001',evaluationId:'qa_001',action:'create',
  actorUsername:'qa_editor',baseVersion:0,nextVersion:1,
  sourceBaseHash:null,record:original,
};
assert.deepEqual(await adapter.applyIfVersionMatches(create),{
  status:'applied',remoteRevision:'qa-failback:create-qa001',
});
assert.equal(db.docs.get('qa_evaluations/qa_001').finalScore,85);
assert.equal(db.docs.get('qa_evaluations/qa_001').qa_failover_version,1);
assert.equal(db.commits,1);
assert.equal((await adapter.applyIfVersionMatches(create)).status,'already_applied');
assert.equal(db.commits,1);
assert.equal((await adapter.applyIfVersionMatches({
  ...create,record:{...original,finalScore:99},
})).status,'conflict');
assert.equal(db.commits,1);
assert.equal((await adapter.applyIfVersionMatches({
  ...create,operationId:'another-create-qa001',
})).status,'conflict');
assert.equal(db.commits,1);
// A case created while Firebase was unavailable has no original Firestore
// hash. Once its create has replayed, the remote version is authoritative.
const offlineUpdate={
  ...create,operationId:'update-qa001-after-standby-create',
  action:'update',baseVersion:1,nextVersion:2,sourceBaseHash:null,
  record:{...original,finalScore:80},
};
assert.equal((await adapter.applyIfVersionMatches(offlineUpdate)).status,'applied');
assert.equal(db.docs.get('qa_evaluations/qa_001').finalScore,80);
assert.equal(db.docs.get('qa_evaluations/qa_001').qa_failover_version,2);
assert.equal((await adapter.applyIfVersionMatches(offlineUpdate)).status,'already_applied');
assert.equal((await adapter.applyIfVersionMatches({
  ...offlineUpdate,operationId:'stale-offline-case-v2',
})).status,'conflict');
const offlineDelete={
  ...offlineUpdate,operationId:'delete-qa001-after-standby-create',
  action:'delete',baseVersion:2,nextVersion:3,
};
assert.equal((await adapter.applyIfVersionMatches(offlineDelete)).status,'applied');
assert.equal(db.docs.get('qa_evaluations/qa_001').finalScore,80);
assert.ok(db.docs.get('qa_evaluations/qa_001').deleted_at);
const legacy={...original,id:'legacy-qa',finalScore:90,updated_at:'2026-11-10'};
db.docs.set('qa_evaluations/legacy-qa',legacy);
const update={
  operationId:'update-legacy-v2',evaluationId:'legacy-qa',action:'update',
  actorUsername:'qa_editor',baseVersion:1,nextVersion:2,
  sourceBaseHash:hash(legacy),record:{...legacy,finalScore:88},
};
assert.equal((await adapter.applyIfVersionMatches({...update,
  operationId:'legacy-without-original-hash',sourceBaseHash:null,
})).status,'conflict','Legacy cases need an exact original hash');
assert.equal((await adapter.applyIfVersionMatches(update)).status,'applied');
assert.equal(db.docs.get('qa_evaluations/legacy-qa').finalScore,88);
assert.equal(db.docs.get('qa_evaluations/legacy-qa').updated_at,'2026-11-10');
assert.equal((await adapter.applyIfVersionMatches(update)).status,'already_applied');
assert.equal((await adapter.applyIfVersionMatches({
  ...update,operationId:'stale-op',sourceBaseHash:'0'.repeat(64),
})).status,'conflict');
const after2={...update,operationId:'update-legacy-v3',baseVersion:2,nextVersion:3,record:{...legacy,finalScore:82}};
assert.equal((await adapter.applyIfVersionMatches(after2)).status,'applied');
assert.equal(db.docs.get('qa_evaluations/legacy-qa').finalScore,82);
const after3={...after2,operationId:'delete-legacy-v4',action:'delete',baseVersion:3,nextVersion:4,record:{...legacy,finalScore:82}};
assert.equal((await adapter.applyIfVersionMatches(after3)).status,'applied');
assert.ok(db.docs.get('qa_evaluations/legacy-qa').deleted_at);
assert.equal((await adapter.applyIfVersionMatches({...after3,operationId:'delete-again',baseVersion:4,nextVersion:5})).status,'conflict');
const userNotAllowed={...create,operationId:'no-permission',evaluationId:'new-case',record:{...original,id:'new-case'}};
permission=false;
assert.equal((await adapter.applyIfVersionMatches(userNotAllowed)).status,'conflict');
permission=true;
allow=false;
await assert.rejects(adapter.applyIfVersionMatches(userNotAllowed),/replay_not_authorized/);
allow=true;
await assert.rejects(adapter.applyIfVersionMatches({...userNotAllowed,sourceBaseHash:'1'.repeat(64)}),/invalid_replay_operation/);
await assert.rejects(adapter.applyIfVersionMatches({...userNotAllowed,nextVersion:9}),/invalid_replay_operation/);
const malicious=makeAdapter({serializeRecord:r=>({...r,qa_failover_version:999})});
await assert.rejects(malicious.applyIfVersionMatches(userNotAllowed),/unsafe_record_serializer/);
assert.equal(db.docs.has('qa_evaluations/new-case'),false);
assert.equal(db.docs.has('qa_failback_applied_operations/no-permission'),false);
assert.throws(()=>createQaFirestoreFailbackAdapter({database:db}),/server_adapter_not_configured/);
console.log('PASS QA Firestore failback: same-tx idempotency receipts, source version & hash, signature/account gate, replay security and conflict-safe writes');
