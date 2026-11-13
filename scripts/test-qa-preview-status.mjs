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
let fetchCount=0,responseMode='success',readinessEnabled=false,newReadinessEnabled=false,private8790Healthy=true;
const callFetch=async(url,init)=>{
  fetchCount++;
  assert.ok([worker+'ready',worker+'summary',worker+'readiness',worker+'qa-bridge-8790-status',worker+'qa-bridge-8790-readiness'].includes(url));
  assert.equal(init.headers.authorization,'Bearer '+token);
  assert.equal(init.method,'GET');
  assert.equal(init.redirect,'manual');
  if(responseMode==='offline')throw Error('private bridge password should not leak');
  if(url.endsWith('/qa-bridge-8790-readiness')){
    if(!newReadinessEnabled)return new Response('',{status:404});
    return new Response(JSON.stringify({
      ok:true,source:'windows-8790-inactive-replica',
      readOnly:true,failoverReady:false,canAcceptWrites:false,firestorePrimary:true,
      snapshot:{present:true,copied:true,candidateVerified:true,
        sourceDocuments:2226,sourceEvaluations:582,
        candidateEvaluations:582,datasetCount:11,withinFreshnessWindow:false},
      remainingChecks:['source_snapshot_not_fresh',
        'independent_live_parity_not_certified',
        'local_login_and_roles_not_certified',
        'qa_write_and_failback_not_certified'],
      privateScore:'NEW_SECRET_NOT_TO_LEAK',
    }),{status:200,headers:{'content-type':'application/json'}});
  }
  if(url.endsWith('/qa-bridge-8790-status')){
    return new Response(JSON.stringify({ok:true,
      privateBridgeConnected:private8790Healthy,port:8790,
      readOnly:true,failoverReady:false,
      check:'private-network-reachability-only',privateScore:'SECRET_MUST_NOT_LEAK',
    }),{status:200,headers:{'content-type':'application/json'}});
  }
  if(url.endsWith('/readiness')){
    if(!readinessEnabled)return new Response('',{status:404});
    return new Response(JSON.stringify({ok:true,readOnly:true,failoverReady:false,
      canAcceptWrites:false,firestorePrimary:true,
      snapshot:{copied:true,candidateVerified:true,sourceDocuments:2197,
        candidateEvaluations:578,datasetCount:11,withinFreshnessWindow:false},
      remainingChecks:['source_snapshot_not_fresh','independent_live_parity_not_certified',
        'local_login_and_roles_not_certified','qa_write_and_failback_not_certified']}),
      {status:200,headers:{'content-type':'application/json'}});
  }
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
assert.equal(r.body.privateBridge8790Status,'reachable_read_only');
assert.equal(r.body.archiveStatus,'archived_counts_match');
assert.equal(r.body.archivedDocuments,2081);
assert.equal(r.body.failoverEnabled,false);
assert.equal(r.body.writeEnabled,false);
assert.equal(r.body.syncBackVerified,false);
assert.equal(r.body.currentFirestoreParity,'not_verified');
assert.equal(r.body.dataProxyEnabled,false);
assert.equal(fetchCount,5);
readinessEnabled=true;
r=await get(handler);
assert.equal(r.body.snapshotReadiness?.documentCount,2197);
assert.equal(r.body.snapshotReadiness?.candidateEvaluations,578);
assert.equal(r.body.snapshotReadiness?.sourceEvaluations,578);
assert.equal(r.body.snapshotReadiness?.freshnessVerified,false);
assert.equal(r.body.failoverEnabled,false);
newReadinessEnabled=true;
r=await get(handler);
assert.equal(r.body.snapshotReadiness?.documentCount,2226);
assert.equal(r.body.snapshotReadiness?.sourceEvaluations,582);
assert.equal(r.body.snapshotReadiness?.candidateEvaluations,582);
assert.equal(r.body.snapshotReadiness?.datasetCount,11);
assert.equal(r.body.snapshotReadiness?.verifiedVia,'windows-8790-read-only');
assert.equal(r.body.failoverEnabled,false);
assert.equal(r.body.writeEnabled,false);
assert.ok(!JSON.stringify(r.body).includes('NEW_SECRET_NOT_TO_LEAK'));
newReadinessEnabled=false;
readinessEnabled=false;
assert.equal(fetchCount,15);
assert.equal(r.headers['cache-control'],'no-store, max-age=0');
assert.equal(r.headers['access-control-allow-origin'],undefined);
assert.ok(!JSON.stringify(r.body).includes(token));
assert.ok(!JSON.stringify(r.body).includes('MUST_NOT_LEAK'));
assert.ok(!JSON.stringify(r.body).includes('SECRET_MUST_NOT_LEAK'));
private8790Healthy=false;
r=await get(handler);
assert.equal(r.body.bridgeStatus,'reachable_read_only');
assert.equal(r.body.privateBridge8790Status,'not_reachable');
assert.equal(r.body.writeEnabled,false);
private8790Healthy=true;
r=await get(handler,makeReq({headers:{host:'qa-preview.vercel.app',
  'sec-fetch-site':'cross-site'}}));
assert.equal(r.code,403);
r=await get(handler,makeReq({method:'POST'}));assert.equal(r.code,405);
r=await get(createQaPreviewStatusHandler({
  env:{...preview,VERCEL_ENV:'production'},fetchImpl:callFetch
}));
assert.equal(r.code,404);
assert.equal(fetchCount,20);
r=await get(createQaPreviewStatusHandler({
  env:{...preview,QA_LOCAL_BRIDGE_URL:'https://evil.example/'},fetchImpl:callFetch
}));
assert.equal(r.code,200);
assert.equal(r.body.bridgeStatus,'not_configured');
assert.equal(fetchCount,20);
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
