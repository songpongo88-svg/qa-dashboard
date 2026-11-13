import assert from 'node:assert/strict';
import {createServer as nodeCreateServer} from 'node:http';
import {createQaWindowsBridgeServer,validateQaWindowsBridgeConfig}
  from '../server/qaWindowsStandbyService.js';
const token='qa-archive-'+('a'.repeat(64));
const dataToken='qa-data-'+('d'.repeat(64));
const local='postgresql://qa_ro:fixture@127.0.0.1:5432/qa_dashboard_lab';
const writer='postgresql://qa_writer:fixture@127.0.0.1:5432/qa_dashboard_lab';
async function freePort(){
  const s=nodeCreateServer();
  await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));
  const port=s.address().port;
  await new Promise(resolve=>s.close(resolve));
  return port;
}
const port=await freePort();
const base={QA_LOCAL_DATABASE_URL:local,QA_LOCAL_BRIDGE_TOKEN:token,
  QA_LOCAL_STANDBY_PORT:String(port),QA_PG_ISOLATED_TEST:'1'};
const denied=code=>error=>error.code===code;
assert.throws(()=>validateQaWindowsBridgeConfig({...base,
  QA_LOCAL_STANDBY_PORT:'8788'}),denied('qa_candidate_port_must_not_replace_existing_bridge'));
assert.throws(()=>validateQaWindowsBridgeConfig({...base,
  QA_LOCAL_DATABASE_URL:'postgresql://qa:pw@remote.invalid/qa_dashboard_lab'}),
  denied('qa_candidate_requires_existing_local_read_only_connection'));
assert.throws(()=>validateQaWindowsBridgeConfig({...base,
  QA_LOCAL_STANDBY_WRITES_ENABLED:'1'}),
  denied('qa_candidate_data_disabled'));
assert.throws(()=>validateQaWindowsBridgeConfig({...base,
  QA_LOCAL_STANDBY_DATA_ENABLED:'1'}),
  denied('qa_candidate_distinct_data_token_required'));
assert.throws(()=>validateQaWindowsBridgeConfig({...base,
  QA_LOCAL_STANDBY_DATA_ENABLED:'1',QA_LOCAL_STANDBY_DATA_TOKEN:token}),
  denied('qa_candidate_distinct_data_token_required'));
const enabled={...base,QA_LOCAL_STANDBY_DATA_ENABLED:'1',
  QA_LOCAL_STANDBY_WRITES_ENABLED:'0',
  QA_LOCAL_STANDBY_DATA_TOKEN:dataToken,
  QA_LOCAL_STANDBY_WRITE_DATABASE_URL:writer,
  QA_LOCAL_STANDBY_PROOF_MODULE:'/test/qaStandbyProductionProofs.mjs',
  QA_LOCAL_STANDBY_PROOF_SHA256:'c'.repeat(64)};
assert.equal(validateQaWindowsBridgeConfig(enabled).writesEnabled,false);
assert.throws(()=>validateQaWindowsBridgeConfig({...enabled,
  QA_LOCAL_STANDBY_WRITES_ENABLED:'1'}),
  denied('qa_candidate_cutover_not_authorized'));
const readPool={ended:false,
  async query(sql){
    if(sql.includes('r.rolsuper AS superuser'))
      return {rows:[{db:'qa_cutover_ci_test',role:'qa_archive_ro',
        readonly:'on',superuser:false}]};
    throw Error('unrecognized_source_query');
  },
  async connect(){return {release(){},query:this.query.bind(this)};},
  async end(){this.ended=true;},
};
let writerReady=true;
const writePool={ended:false,
  async query(sql){
    if(sql.includes('eval_writer')){
      return {rows:[{db:'qa_cutover_ci_test',
        role:writerReady?'qa_dedicated_writer':'qa_archive_ro',
        readonly:'off',superuser:false,eval_writer:true,queue_writer:true}]};
    }
    throw Error('unrecognized_writer_query');
  },
  async connect(){return {release(){},query:this.query.bind(this)};},
  async end(){this.ended=true;},
};
const dataSources={
  primaryHealth:async()=>({health:'healthy',verifiedByServer:true}),
  mirrorProof:async()=>({sourceComplete:false}),
  bridgeProof:async()=>({databaseConnected:true,readOnly:true}),
  coordinatorLease:async()=>({approved:false}),
  signatureAndAppealLocks:async()=>({verified:false}),
  editLease:async()=>null,
  productionAuthorization:async()=>false,
};
const props={env:base,injectPools:{readPool},sourceOverrides:{
  createQaServerProofs:async()=>dataSources,
}};
const readonly=await createQaWindowsBridgeServer(props);
assert.equal(readonly.port,port);
assert.equal(readonly.writesEnabled,false);
assert.equal(readonly.dataEnabled,false);
try{
  let r=await fetch('http://127.0.0.1:'+port+'/v1/qa/evaluations',{
    headers:{authorization:'Bearer '+dataToken}});
  assert.equal(r.status,503);
  assert.equal((await r.json()).error,'standby_data_disabled');
  r=await fetch('http://127.0.0.1:'+port+'/ready');
  assert.equal(r.status,403);
}finally{await readonly.shutdown();}
assert.equal(readPool.ended,true);
const verified=await createQaWindowsBridgeServer({
  ...props,env:enabled,injectPools:{readPool:{...readPool,ended:false},writePool},
});
assert.equal(verified.dataEnabled,true);
assert.equal(verified.writesEnabled,false);
try{
  let r=await fetch('http://127.0.0.1:'+port+'/v1/qa/evaluations',
    {headers:{authorization:'Bearer '+token}});
  assert.equal(r.status,403,'archive token cannot access private QA data route');
  r=await fetch('http://127.0.0.1:'+port+'/v1/qa/evaluations',
    {headers:{authorization:'Bearer '+dataToken}});
  assert.equal(r.status,403,'a real QA user session is mandatory');
}finally{await verified.shutdown();}
assert.equal(writePool.ended,true);
writerReady=false;
await assert.rejects(createQaWindowsBridgeServer({
  ...props,env:enabled,injectPools:{readPool:{...readPool,ended:false},
    writePool:{...writePool,ended:false}}}),
  denied('qa_candidate_dedicated_write_role_unverified'));
writerReady=true;
await assert.rejects(createQaWindowsBridgeServer({
  ...props,env:{...enabled,QA_PG_ISOLATED_TEST:undefined},
}),denied('qa_candidate_production_injection_forbidden'));
console.log('PASS QA Windows candidate: isolated 8790 read-only startup, separate secrets, no browser access, no privileged DB role, no unreviewed production provider');
