import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createQaStandaloneDataBridge} from '../server/qaStandbyBridgeRuntime.js';

const token='qa-standby-bridge-'+('p'.repeat(48));
const archiveToken='qa-archive-monitor-'+('a'.repeat(48));
const sessionId='qa_editor-8c11937f-01ab-4455-b6f2-620fb73e3e44';
const snapshotId='qa-standby-immutable-snapshot-01';
const now=()=>Date.now();
const ago=ms=>new Date(now()-ms).toISOString();
const future=ms=>new Date(now()+ms).toISOString();
const datasets=['qa_evaluations','qa_appeal_events','qa_signature_documents',
  'qa_user_profiles','qa_role_permissions','qa_user_sessions',
  'qa_user_session_controls','qa_role_definitions','qa_system_settings',
  'qa_signature_library','qa_evaluation_progress'];
let touched=0,readCount=0,writeCount=0,lockCount=0;
const readPool={
  async query(sql){
    readCount++;
    if(sql.includes('qa_failover_v1.outbox'))return {rows:[]};
    if(sql.includes('active_snapshot_id,source_snapshot_verified'))return {rows:[{
      mode:'standby',generation:2,active_snapshot_id:snapshotId,
      source_snapshot_verified:true,write_frozen:false,
    }]};
    throw Error('Unexpected source: '+sql);
  },
  async connect(){return {query:this.query.bind(this),release(){}};},
};
const writePool={async query(){throw Error('Not used by fake fixture');},
  async connect(){throw Error('Not used by fake fixture');}};
const sources={
  primaryHealth:async()=>({health:'quota-exhausted',verifiedByServer:true,
    checkedAt:ago(1000),outageStartedAt:ago(15000)}),
  mirrorProof:async()=>({sourceComplete:true,identityHashVerified:true,
    syncStatus:'validated',datasets,snapshotId,verifiedAt:ago(25000)}),
  bridgeProof:async()=>({databaseConnected:true,readOnly:false,authenticated:true,
    durableIngress:true,checkedAt:ago(1000)}),
  coordinatorLease:async()=>({owner:'qa-failover-coordinator',approved:true,
    generation:2,grantedAt:ago(1000),expiresAt:future(60000)}),
  signatureAndAppealLocks:async({scope})=>{
    lockCount++;
    return {source:'trusted-server',verified:true,agentName:scope.agentName,
      monthKey:scope.monthKey,signatureLocked:false,appealHold:false,checkedAt:ago(1000)};
  },
  editLease:async()=>null,
  productionAuthorization:async()=>true,
};
const verifySession=async(_,request)=>{
  touched++;
  if(request.sessionId!==sessionId)throw Error('unknown session');
  return {source:'verified-local-session',username:'qa_editor',
    role:'Quality Assurance',status:'active',verifiedAt:ago(1000),
    expiresAt:future(3600000),sourceSnapshotId:snapshotId,generation:2};
};
const writeEvaluation=async(_pool,request,trusted)=>{
  writeCount++;
  assert.equal(trusted.sourceSnapshotId,snapshotId);
  assert.equal(trusted.coordinatorGeneration,2);
  assert.equal(trusted.failover.identity.username,'qa_editor');
  assert.equal(request.record.finalScore,85);
  return {ok:true,operationId:request.operationId,evaluationId:request.evaluationId,
    version:1,queued:true,replay:false};
};
const env={QA_PG_ISOLATED_TEST:'1',QA_LOCAL_STANDBY_DATA_ENABLED:'1',
  QA_LOCAL_STANDBY_WRITES_ENABLED:'1',QA_STANDBY_CUTOVER_ENABLED:'1'};
const props={readPool,writePool,token,archiveToken,sources,env,verifySession,writeEvaluation};
const production={...props,verifySession:undefined,writeEvaluation:undefined,
  env:{...env,QA_PG_ISOLATED_TEST:''}};
assert.throws(()=>createQaStandaloneDataBridge({...production,archiveToken:undefined}),
  e=>e.code==='qa_data_bridge_separate_archive_token_required');
assert.throws(()=>createQaStandaloneDataBridge({...production,archiveToken:token}),
  e=>e.code==='qa_data_bridge_separate_archive_token_required');
assert.equal(typeof createQaStandaloneDataBridge(production),'function');
assert.throws(()=>createQaStandaloneDataBridge({...props,
  env:{...env,QA_LOCAL_STANDBY_DATA_ENABLED:''}}),
  e=>e.code==='qa_data_bridge_not_enabled');
assert.throws(()=>createQaStandaloneDataBridge({...props,
  env:{...env,QA_STANDBY_CUTOVER_ENABLED:''}}),
  e=>e.code==='qa_data_bridge_write_activation_missing');
assert.throws(()=>createQaStandaloneDataBridge({...props,
  env:{...env,QA_PG_ISOLATED_TEST:''}}),
  e=>e.code==='qa_data_bridge_session_override_forbidden');
assert.throws(()=>createQaStandaloneDataBridge({...props,
  sources:{...sources,primaryHealth:undefined}}),
  e=>e.code==='qa_data_bridge_independent_authority_missing');
async function serve(handler){
  const server=createServer((req,res)=>{void handler(req,res);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {server,url:'http://127.0.0.1:'+server.address().port};
}
const sample={action:'create',operationId:'qa-new-operation-01',
  evaluationId:'qa-new-001',expectedVersion:0,
  record:{id:'qa-new-001',agentName:'Synthetic Agent',
    evaluationMonthKey:'2026-11',finalScore:85,
    evaluatorUsername:'qa_editor',topics:[{code:'1',score:85}],
    evaluationType:'case',caseId:'AA000001'}};
const headers={authorization:'Bearer '+token,'x-qa-user-session':sessionId,
  'content-type':'application/json','idempotency-key':sample.operationId};
const router=createQaStandaloneDataBridge(props);
const fixture=await serve(router);
try{
  let denied=await fetch(fixture.url+'/ready',{
    headers:{authorization:'Bearer '+token}});
  assert.equal(denied.status,403,'data secret may not access the separate archive API');
  denied=await fetch(fixture.url+'/v1/qa/evaluations',{method:'POST',
    headers:{...headers,authorization:'Bearer '+archiveToken},
    body:JSON.stringify(sample)});
  assert.equal(denied.status,403,'archive probe secret may not submit a QA evaluation');
  assert.equal(touched,0);
  let r=await fetch(fixture.url+'/v1/qa/evaluations',{method:'POST',
    headers,body:JSON.stringify(sample)});
  assert.equal(r.status,200);
  const response=await r.json();
  assert.equal(response.version,1);
  assert.equal(writeCount,1);
  assert.equal(lockCount,1);
  r=await fetch(fixture.url+'/v1/qa/evaluations',{method:'POST',
    headers:{...headers,origin:'https://evil.invalid'},body:JSON.stringify(sample)});
  assert.equal(r.status,403);
  r=await fetch(fixture.url+'/v1/qa/evaluations',{method:'POST',
    headers:{...headers,'idempotency-key':'wrong-operation'},body:JSON.stringify(sample)});
  assert.equal(r.status,400);
  assert.equal(writeCount,1);
  assert.equal(touched,2,'rejected origin never revalidates session');
}finally{await new Promise(resolve=>fixture.server.close(resolve));}
const readOnly=await serve(createQaStandaloneDataBridge({...props,
  env:{...env,QA_LOCAL_STANDBY_WRITES_ENABLED:''}}));
try{
  const r=await fetch(readOnly.url+'/v1/qa/evaluations',{method:'POST',
    headers,body:JSON.stringify(sample)});
  assert.equal(r.status,503);
  assert.equal(writeCount,1);
}finally{await new Promise(resolve=>readOnly.server.close(resolve));}
assert.ok(readCount>=2);
console.log('PASS QA standby bridge: real loopback HTTP verified write path, independent QA proof, origin/idempotency checks and write-disable gate');
