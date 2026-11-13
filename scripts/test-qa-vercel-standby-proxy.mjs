import assert from 'node:assert/strict';
import {createQaVercelStandbyProxy} from '../server/qaVercelStandbyProxy.js';

const token='qa-private-token-'+('z'.repeat(52));
const monitorToken='qa-archive-'+('a'.repeat(52));
const session='qa_editor-8c11937f-01ab-4455-b6f2-620fb73e3e44';
const host='qa-preview.vercel.app';
const base='https://robinhood-qa-standby-bridge.qa-team.workers.dev';
let requests=[],status=200;
let upstream={ok:true,source:'local-postgres-standby',dataStatus:'verified-snapshot',
  rows:[{evaluationId:'QA-001',record:{id:'QA-001',finalScore:85}}]};
const mockFetch=async(url,init)=>{
  requests.push({url,init});
  assert.ok(url.startsWith(base+'/v1/qa/evaluations'));
  assert.equal(init.headers.authorization,'Bearer '+token);
  assert.equal(init.headers['x-qa-user-session'],session);
  assert.equal(init.redirect,'manual');
  assert.equal(init.cache,'no-store');
  return new Response(JSON.stringify(upstream),{status,headers:{'content-type':'application/json'}});
};
const env={VERCEL_ENV:'preview',QA_STANDBY_DATA_PROXY_ENABLED:'1',
  QA_LOCAL_BRIDGE_URL:base+'/',QA_LOCAL_BRIDGE_TOKEN:monitorToken,QA_LOCAL_STANDBY_DATA_TOKEN:token};
const handler=createQaVercelStandbyProxy({env,fetchImpl:mockFetch});
const makeReq=(action,overrides={})=>({
  method:'GET',query:{qaData:'1',action},
  headers:{'x-qa-user-session':session,host},...overrides,
});
function response(){
  return {statusCode:200,headers:{},body:null,
    setHeader(key,value){this.headers[key.toLowerCase()]=value;},
    status(value){this.statusCode=value;return this;},
    json(value){this.body=value;return this;},
  };
}
const call=async(req,callback=handler)=>{
  const res=response();await callback(req,res);return res;
};
async function denied(req,statusCode,fn=handler){
  const res=await call(req,fn);
  assert.equal(res.statusCode,statusCode);
  assert.equal(res.body.ok,false);
  assert.equal(res.headers['access-control-allow-origin'],undefined);
  assert.equal(res.headers['cache-control'],'no-store, max-age=0');
  return res;
}
await denied(makeReq('list'),503,createQaVercelStandbyProxy({env:{...env,QA_STANDBY_DATA_PROXY_ENABLED:'0'},fetchImpl:mockFetch}));
await denied(makeReq('list'),503,createQaVercelStandbyProxy({env:{...env,VERCEL_ENV:'production'},fetchImpl:mockFetch}));
await denied(makeReq('list'),503,createQaVercelStandbyProxy({
  env:{...env,VERCEL_ENV:'production',QA_STANDBY_PRODUCTION_PROXY_APPROVED:'1'},
  fetchImpl:mockFetch,
}));
await denied(makeReq('list'),503,createQaVercelStandbyProxy({
  env:{...env,VERCEL_ENV:'production',QA_STANDBY_CUTOVER_APPROVED:'1'},
  fetchImpl:mockFetch,
}));
await denied(makeReq('list',{headers:{host}}),403);
await denied(makeReq('list',{headers:{...makeReq('list').headers,authorization:'Bearer evil'}}),403);
await denied(makeReq('list',{headers:{...makeReq('list').headers,origin:'https://evil.example'}}),403);
await denied(makeReq('list',{query:{qaData:'1',action:'list',evil:'1'}}),400);
await denied(makeReq('get',{query:{qaData:'1',action:'get',evaluationId:'../bad'}}),400);
await denied(makeReq('list',{query:{qaData:'1',action:'list',month:'2026-13'}}),400);
await denied(makeReq('list',{query:{qaData:'1',action:'list',limit:'101'}}),400);
await denied(makeReq('erase',{method:'DELETE'}),405);
assert.equal(requests.length,0);
let res=await call(makeReq('list',{query:{qaData:'1',action:'list',month:'2026-11',limit:'50'}}));
assert.equal(res.statusCode,200);
assert.equal(res.body.rows[0].record.finalScore,85);
assert.equal(requests.length,1);
assert.equal(requests[0].url,base+'/v1/qa/evaluations?month=2026-11&limit=50');
res=await call(makeReq('get',{query:{qaData:'1',action:'get',evaluationId:'QA-001'}}));
assert.equal(res.statusCode,200);
assert.equal(requests[1].url,base+'/v1/qa/evaluations/QA-001');
assert.equal(res.headers['x-content-type-options'],'nosniff');
upstream={ok:true,source:'unverified-archive',dataStatus:'archived',rows:[]};
await denied(makeReq('list'),502);
upstream={ok:true,source:'local-postgres-standby',dataStatus:'verified-snapshot',rows:[]};
const item={operationId:'qa-op-7',evaluationId:'QA-001',action:'update',
 expectedVersion:1,record:{id:'QA-001',finalScore:83}};
const post=makeReq('write',{
  method:'POST',query:{qaData:'1',action:'write'},
  headers:{'x-qa-user-session':session,host,origin:'https://'+host,
    'sec-fetch-site':'same-origin','idempotency-key':'qa-op-7'},
  body:item,
});
await denied({...post,headers:{...post.headers,origin:'https://evil.example'}},403);
await denied({...post,headers:{...post.headers,origin:undefined}},403);
await denied({...post,headers:{...post.headers,'idempotency-key':'other'}},400);
await denied({...post,body:{...item,expectedVersion:-1}},400);
assert.equal(requests.length,3);
upstream={ok:true,operationId:'qa-op-7',version:2,queued:true};
res=await call(post);
assert.equal(res.statusCode,200);
assert.equal(res.body.queued,true);
assert.equal(requests[3].init.headers['idempotency-key'],'qa-op-7');
assert.equal(JSON.parse(requests[3].init.body).record.finalScore,83);
const del={operationId:'qa-del-8',evaluationId:'QA-001',action:'delete',expectedVersion:2};
await denied({...post,body:{...del,record:{id:'QA-001',finalScore:0}},
  headers:{...post.headers,'idempotency-key':'qa-del-8'}},400);
upstream={ok:true,operationId:'qa-del-8',evaluationId:'QA-001',version:3,queued:true,replay:false};
const deleteResponse=await call({...post,body:del,
  headers:{...post.headers,'idempotency-key':'qa-del-8'}});
assert.equal(deleteResponse.statusCode,200);
assert.equal(deleteResponse.body.version,3);
assert.equal(JSON.parse(requests.at(-1).init.body).record,undefined);
upstream={ok:true,operationId:'qa-op-7',queued:true};
await denied(post,502);
status=503;
upstream={ok:false,error:'private-postgres-password-secret'};
res=await call(makeReq('list'));
assert.equal(res.statusCode,503);
assert.ok(!JSON.stringify(res.body).includes('private-postgres-password-secret'));
status=200;
await denied(makeReq('list'),503,createQaVercelStandbyProxy({env:{...env,QA_LOCAL_BRIDGE_URL:'https://evil.example/'},fetchImpl:mockFetch}));
await denied(makeReq('list'),503,createQaVercelStandbyProxy({env:{...env,QA_LOCAL_STANDBY_DATA_TOKEN:'short'},fetchImpl:mockFetch}));
console.log('PASS QA Vercel preview private proxy: session-only app relay, origin gate, no leaked bridge token, limited QA paths, strict confirmation, production off');
