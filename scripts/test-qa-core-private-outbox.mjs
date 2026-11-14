// Private stage-only unit tests. Never use a production DB or Firestore.
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {normalizeQaCoreIntent,stageQaCorePendingIntent}
 from '../server/qaCorePrivateOutbox.js';
const base={
 operationId:'qa-stage-operation-00001',
 documentPath:'qa_evaluations/AA100001',
 operation:'upsert',
 documentJson:{fields:{finalScore:{integerValue:'85'}}},
};
const e=normalizeQaCoreIntent(base);
assert.equal(e.collection,'qa_evaluations');
assert.match(e.payloadHash,/^[0-9a-f]{64}$/);
assert.throws(()=>normalizeQaCoreIntent({...base,
 documentPath:'qa_sparks/user'}),/qa_outbox_invalid_path/);
assert.throws(()=>normalizeQaCoreIntent({...base,
 documentPath:'qa_evaluations/x/nested'}),/qa_outbox_invalid_path/);
assert.throws(()=>normalizeQaCoreIntent({...base,
 operation:'delete'}),/qa_outbox_delete_requires_null/);
let queries=0,stored=null;
const pool={async connect(){
 return {release(){},async query(sql,args=[]){
  queries++;
  if(sql==='SELECT current_database() AS db')
   return {rows:[{db:'qa_cutover_ci_test'}]};
  if(sql.startsWith('INSERT INTO qa_core_replication_stage.change_outbox')){
   if(stored)return {rows:[]};
   stored={collection_name:args[1],document_path:args[2],
    operation:args[3],document_json:JSON.parse(args[4]),
    payload_sha256:args[5]};
   return {rows:[{seq:1}]};
  }
  if(sql.startsWith('SELECT collection_name'))
   return {rows:stored?[{...stored,
     payload_equal:isDeepStrictEqual(stored.document_json,args[1]===null?null:JSON.parse(args[1])),
     source_state:'pending',delivery_state:'waiting'}]:[]};
  throw Error('unexpected sql');
 }};
}};
const auth=async v=>({
 authority:'qa-core-private-authorized-mutation',
 operationId:v.operationId,documentPath:v.documentPath,
 operation:v.operation,payloadHash:v.payloadHash,
});
const env={QA_PG_ISOLATED_TEST:'1',QA_CORE_PRIVATE_OUTBOX_STAGING:'1'};
await assert.rejects(stageQaCorePendingIntent({pool,event:base,
 authorizeServerMutation:auth,env:{...env,QA_CORE_PRIVATE_OUTBOX_STAGING:'0'}}),
 /qa_outbox_private_stage_disabled/);
assert.equal(queries,0);
await assert.rejects(stageQaCorePendingIntent({pool,event:base,
 authorizeServerMutation:async()=>({authority:'browser'}),env}),
 /qa_outbox_trusted_mutation_required/);
assert.equal(queries,0);
const first=await stageQaCorePendingIntent({pool,event:base,
 authorizeServerMutation:auth,env});
assert.equal(first.staged,true);
assert.equal(first.sourceConfirmed,false);
assert.equal(first.failoverReady,false);
const duplicate=await stageQaCorePendingIntent({pool,event:base,
 authorizeServerMutation:auth,env});
assert.equal(duplicate.replay,true);
const semanticallySame=await stageQaCorePendingIntent({pool,event:{
 ...base,documentJson:{fields:{finalScore:{integerValue:'85'}},extra:undefined}
},authorizeServerMutation:auth,env});
assert.equal(semanticallySame.replay,true);
// JSONB equality ignores JSON object key order, unlike JSON.stringify.
stored.document_json={fields:{finalScore:{integerValue:'85'}}};
const sameOrderIndependent=await stageQaCorePendingIntent({pool,event:{
 ...base,documentJson:{fields:{finalScore:{integerValue:'85'}}}
},authorizeServerMutation:auth,env});
assert.equal(sameOrderIndependent.replay,true);
await assert.rejects(stageQaCorePendingIntent({pool,event:{
 ...base,documentJson:{fields:{finalScore:{integerValue:'84'}}}
},authorizeServerMutation:auth,env}),/qa_outbox_idempotency_collision/);

await assert.rejects(stageQaCorePendingIntent({pool,
 event:{...base,documentPath:'qa_evaluations/AA100002'},
 authorizeServerMutation:auth,env}),/qa_outbox_idempotency_collision/);
console.log('PASS QA private outbox pending-intent only: no browser bypass, no source claim, no production writes');
