import assert from 'node:assert/strict';
import {createQaPreviewStatusHandler} from '../server/qaPreviewStatusHandler.js';

const token='qa-secret-'+('z'.repeat(55));
const worker='https://robinhood-qa-standby-bridge.example.workers.dev/';
const preview={
  VERCEL_ENV:'preview',
  QA_LOCAL_BRIDGE_URL:worker,
  QA_LOCAL_BRIDGE_TOKEN:token,
  QA_STANDBY_DATA_PROXY_ENABLED:'0',
};
let fetchCount=0,responseMode='success';
const callFetch=async(url,init)=>{
  fetchCount++;
  assert.ok([worker+'ready',worker+'summary',worker+'readiness'].includes(url));
  assert.equal(init.headers.authorization,'Bearer '+token);
  assert.equal(init.method,'GET');
  assert.equal(init.redirect,'manual');
  if(responseMode==='offline')throw Error('private bridge password should not leak');
  if(url.endsWith('/readiness'))return new Response('',{status:404});
  const data=url.endsWith('/ready')
    ? {ok:true,readOnly:true,databaseConnected:responseMode==='unverified'?false:true,failoverReady:false}
    : {ok:true,readOnly:true,failoverReady:false,importedArchiveCountMatch:true,
      sourceDocumentCount:2081,secretUserData:'MUST_NOT_LEAK'};
  return new Response(JSON.stringify(data),{status:200,
    headers:{'content-type':'application/json; charset=utf-8'}});
};
const makeRes=()=>({
  code:200,headers:{},body:null,
  setHeader(name,value){this.headers[name.toLowerCase()]=value;return this;},
  status(n){this.code=n;return this;},
  json(data){this.body=data;return this;},
});
const makeReq=(extra={})=>({
  method:'GET',headers:{host:'qa-preview.vercel.app','sec-fetch-site':'same-origin'},
  query:{qaStatus:'1'},...extra,
});
async function get(handler,request=makeReq()){
  const res=makeRes();await handler(request,res);return res;
}
const handler=createQaPreviewStatusHandler({env:preview,fetchImpl:callFetch});
let r=await get(handler);
assert.equal(r.code,200);
assert.equal(r.body.primary,'firestore');
assert.equal(r.body.standbyRole,'archive-only');
assert.equal(r.body.bridgeStatus,'reachable_read_only');
assert.equal(r.body.archiveStatus,'archived_counts_match');
assert.equal(r.body.archivedDocuments,2081);
assert.equal(r.body.failoverEnabled,false);
assert.equal(r.body.writeEnabled,false);
assert.equal(r.body.syncBackVerified,false);
assert.equal(r.body.currentFirestoreParity,'not_verified');
assert.equal(r.body.dataProxyEnabled,false);
assert.equal(fetchCount,3);
assert.equal(r.headers['cache-control'],'no-store, max-age=0');
assert.equal(r.headers['access-control-allow-origin'],undefined);
assert.ok(!JSON.stringify(r.body).includes(token));
assert.ok(!JSON.stringify(r.body).includes('MUST_NOT_LEAK'));
r=await get(handler,makeReq({headers:{host:'qa-preview.vercel.app',
  'sec-fetch-site':'cross-site'}}));
assert.equal(r.code,403);
r=await get(handler,makeReq({method:'POST'}));assert.equal(r.code,405);
r=await get(createQaPreviewStatusHandler({
  env:{...preview,VERCEL_ENV:'production'},fetchImpl:callFetch
}));
assert.equal(r.code,404);
assert.equal(fetchCount,3);
r=await get(createQaPreviewStatusHandler({
  env:{...preview,QA_LOCAL_BRIDGE_URL:'https://evil.example/'},fetchImpl:callFetch
}));
assert.equal(r.code,200);
assert.equal(r.body.bridgeStatus,'not_configured');
assert.equal(fetchCount,3);
responseMode='offline';
r=await get(handler);
assert.equal(r.code,200);
assert.equal(r.body.bridgeStatus,'not_reachable');
assert.equal(r.body.failoverEnabled,false);
assert.equal(r.body.currentFirestoreParity,'not_verified');
responseMode='unverified';
r=await get(handler);
assert.equal(r.body.bridgeStatus,'not_reachable');
responseMode='success';
r=await get(createQaPreviewStatusHandler({
  env:{...preview,QA_STANDBY_DATA_PROXY_ENABLED:'1'},fetchImpl:callFetch
}));
assert.equal(r.body.dataProxyEnabled,true);
assert.equal(r.body.failoverEnabled,false);
assert.equal(r.body.writeEnabled,false);
console.log('PASS QA Preview System status: safe read-only proof, no Firestore reads, no secrets, production forbidden, live parity unverified, failover disabled');
