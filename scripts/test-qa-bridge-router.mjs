import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createQaBridgeRouter } from '../server/qaLocalBridgeServer.js';
import { createQaStandbyDataHandler } from '../server/qaStandbyDataHandler.js';

const token='qa-auth-token-'+('z'.repeat(52));
const sessionId='qa_editor-8c11937f-01ab-4455-b6f2-620fb73e3e44';
let sqlReads=0,handlerReads=0,sessionVerifications=0;
const pool={
  async query(sql){
    sqlReads++;
    if(sql.includes('current_database()'))return {rows:[{db:'qa_dashboard_lab'}]};
    if(sql.includes('source_mirror GROUP BY'))return {rows:[{root_collection:'qa_evaluations',documents:1}]};
    if(sql.includes('mirror_import_audit'))return {rows:[{source_count:1,mirror_count:1}]};
    if(sql.includes('qa_failover_v1.state'))return {rows:[{mode:'disabled',write_frozen:true,source_snapshot_verified:false}]};
    if(sql.includes('qa_failover_v1.outbox'))return {rows:[]};
    throw Error('unexpected_sql');
  },
};
async function launch(handler){
  const server=createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {server,base:'http://127.0.0.1:'+server.address().port};
}
async function close(server){await new Promise(resolve=>server.close(resolve));}
let server,base;
({server,base}=await launch(createQaBridgeRouter(pool,{token})));
try{
  let r=await fetch(base+'/v1/qa/evaluations',{headers:{authorization:'Bearer '+token}});
  assert.equal(r.status,503);
  assert.deepEqual(await r.json(),{ok:false,error:'standby_data_disabled'});
  assert.equal(sqlReads,0,'disabled data requests cannot query PostgreSQL');
  r=await fetch(base+'/ready',{headers:{authorization:'Bearer '+token}});
  assert.equal(r.status,200);
  assert.equal((await r.json()).failoverReady,false);
  r=await fetch(base+'/summary',{headers:{authorization:'Bearer '+token}});
  assert.equal(r.status,200);
  assert.equal((await r.json()).sourceDocumentCount,1);
  r=await fetch(base+'/ready');
  assert.equal(r.status,403);
  r=await fetch(base+'/v1/qa/user_profiles',{headers:{authorization:'Bearer '+token}});
  assert.equal(r.status,404,'other QA paths never route to unmounted data API');
}finally{await close(server);}
const handler=createQaStandbyDataHandler({
  readPool:pool,token,dataEnabled:true,writesEnabled:false,
  verifySession:async (_pool,{sessionId:value})=>{
    sessionVerifications++;
    if(value!==sessionId)throw Error('unknown_session');
    return {source:'verified-local-session',role:'Quality Assurance',status:'active',username:'qa_editor'};
  },
  makeTrustedContext:async()=>({contextSource:'server-owned-not-request-body'}),
  listEvaluations:async()=>{handlerReads++;return {source:'verified-local-fixture',rows:[]};},
});
({server,base}=await launch(createQaBridgeRouter(pool,{token,standbyDataHandler:handler})));
try{
  const auth={authorization:'Bearer '+token,'x-qa-user-session':sessionId};
  let r=await fetch(base+'/v1/qa/evaluations',{headers:auth});
  assert.equal(r.status,200);
  assert.equal((await r.json()).rows.length,0);
  assert.equal(handlerReads,1);
  r=await fetch(base+'/v1/qa/evaluations',{headers:{authorization:'Bearer '+token}});
  assert.equal(r.status,403);
  r=await fetch(base+'/v1/qa/evaluations',{headers:{...auth,origin:'https://evil.example'}});
  assert.equal(r.status,403);
  r=await fetch(base+'/v1/qa/evaluations',{method:'POST',headers:{...auth,'content-type':'application/json'},body:'{}'});
  assert.equal(r.status,503);
  assert.equal(handlerReads,1,'no write permitted');
  assert.equal(r.headers.get('access-control-allow-origin'),null);
  assert.equal(sessionVerifications,1,'rejected requests must not trigger session lookups');
}finally{await close(server);}
console.log('PASS QA bridge router: same 8788 read-only archive plus secure session-bound future data path, default-disabled, no score writes');
