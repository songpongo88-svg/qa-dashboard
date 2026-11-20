// Mock HTTP only. Never calls Firestore, reads QA data or starts a listener.
import assert from 'node:assert/strict';
import {createQaCoreIndependentSourceRead}
 from '../server/qaCoreIndependentSourceReadStage.js';
const env={QA_CORE_SOURCE_READ_ADAPTER_TEST:'1',
 QA_CORE_SOURCE_VERIFICATION_STAGE:'1',
 QA_PG_ISOLATED_TEST:'1',QA_FAILOVER:'OFF'};
const PROJECT='qa-dashboard-b0b5d';
const documentPath='qa_evaluations/AA-ISOLATED-001';
const rev='2026-11-20T08:10:02.123456Z';
const request={projectId:PROJECT,operationId:'qa-rest-fixture-00000000001',
 documentPath,expectedUpdateTime:rev};
const data={name:'projects/'+PROJECT+'/databases/(default)/documents/'+documentPath,
 fields:{finalScore:{integerValue:'85'}},updateTime:rev,
 createTime:'2026-11-20T08:00:00Z'};
const token='mock-token-not-a-real-google-credential-1234';
let budgetCalls=0, httpCalls=0;
const reserveRead=async x=>{
 budgetCalls++;
 assert.equal(x.requestedPageSize,1);
 assert.equal(x.documentPath,documentPath);
 return{budgetDayUtc:'2026-11-20',reservedDocumentUnits:1,
  reservedRequests:1,estimatedNotBilledReads:true};
};
const fetchImpl=async (url,options)=>{
 httpCalls++;
 assert.equal(url,'https://firestore.googleapis.com/v1/projects/'+PROJECT+
  '/databases/(default)/documents/'+documentPath);
 assert.equal(options.method,'GET');
 assert.equal(options.redirect,'error');
 assert.equal(options.cache,'no-store');
 assert.equal(options.headers.authorization,'Bearer '+token);
 return{status:200,headers:{get:()=> 'application/json'},json:async()=>data};
};
const adapter=()=>createQaCoreIndependentSourceRead({oauthToken:token,
 reserveRead,fetchImpl,env});
assert.throws(()=>createQaCoreIndependentSourceRead({
 oauthToken:token,reserveRead,fetchImpl,
 env:{...env,QA_PG_ISOLATED_TEST:'0'}}),/qa_rest_source_reader_disabled/);
assert.equal(budgetCalls,0);
await assert.rejects(adapter()({...request,projectId:'wrong'}),
 /qa_rest_source_invalid_identity/);
await assert.rejects(adapter()({...request,documentPath:'qa_sparks/AA-001'}),
 /qa_rest_source_invalid_document_path/);
await assert.rejects(adapter()({...request,documentPath:'qa_evaluations/AA/001'}),
 /qa_rest_source_invalid_document_path/);
await assert.rejects(adapter()({...request,expectedUpdateTime:rev.replace('.123456','.123')}),
 /qa_rest_source_revision_not_microsecond_canonical/);
assert.equal(budgetCalls,0);assert.equal(httpCalls,0);
const good=await adapter()(request);
assert.equal(good.sourceReadVerified,true);
assert.equal(good.documentJson.updateTime,rev);
assert.equal(good.deliveryEligible,false);
assert.equal(good.sourceContinuityCertified,false);
assert.equal(good.failoverReady,false);
assert.equal(budgetCalls,1);assert.equal(httpCalls,1);
await assert.rejects(createQaCoreIndependentSourceRead({oauthToken:token,
 env,fetchImpl,reserveRead:async()=>{throw Error('budget offline')}})(request),
 /qa_rest_source_budget_unavailable/);
await assert.rejects(createQaCoreIndependentSourceRead({oauthToken:token,
 env,fetchImpl,reserveRead:async()=>({budgetDayUtc:'2026-11-20',
 estimatedNotBilledReads:false,reservedDocumentUnits:1,reservedRequests:1})})(request),
 /qa_rest_source_budget_unverified/);
assert.equal(httpCalls,1);
const response=(body,status=200,type='application/json')=>async()=>{
 httpCalls++;return{status,headers:{get:n=>n==='content-type'?type:null},
  json:async()=>body};
};
const failFetch=async(fetchFn,code)=>assert.rejects(
 createQaCoreIndependentSourceRead({oauthToken:token,
  reserveRead,fetchImpl:fetchFn,env})(request),new RegExp(code));
await failFetch(response(null,404),'qa_rest_source_missing_not_a_deletion_proof');
await failFetch(response({},429),'qa_rest_source_auth_or_quota_blocked');
await failFetch(response({},200,'text/html'),'qa_rest_source_unverified_response');
await failFetch(response({...data,name:data.name+'-wrong'}),'qa_rest_source_wrong_document');
await failFetch(response({...data,updateTime:'2026-11-20T08:10:03.123456Z'}),
 'qa_rest_source_revision_changed_requires_reconciliation');
await failFetch(response({...data,fields:null}),'qa_rest_source_wrong_document');
await failFetch(async()=>{throw Error('network timeout')},
 'qa_rest_source_unreachable_no_retry');
await failFetch(async()=>{httpCalls++;return{
 status:200,headers:{get:key=>key==='content-type'?'application/json':'2000000'},
 json:async()=>{throw Error('must not parse large doc');}}},
 'qa_rest_source_document_too_large');
assert.equal(httpCalls,9); // one good GET and eight failure GETs
assert.equal(budgetCalls,11); // one good, two failed budget attempts, eight failed HTTP
console.log('PASS QA isolated Firestore REST one-GET adapter: budget first, exact revision, wrong IDs/races rejected, zero real reads');
