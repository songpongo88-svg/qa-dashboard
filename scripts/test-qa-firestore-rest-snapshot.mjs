import assert from 'node:assert/strict';
import {QA_SYNC_DATASETS} from '../server/qaLiveMirrorStage.js';
import {captureQaFirestorePointInTime} from '../server/qaFirestoreRestSnapshot.js';
const token='fixture-server-oauth-token-not-a-real-secret';
const projectId='qa-fixture-2026';
const readTime=new Date(Date.now()-25000).toISOString();
let calls=[],failure=null;
function service(url,{method,headers,cache}){
  const u=new URL(url);
  assert.equal(u.hostname,'firestore.googleapis.com');
  assert.equal(method,'GET');
  assert.equal(cache,'no-store');
  assert.equal(headers.authorization,'Bearer '+token);
  assert.equal(u.searchParams.get('readTime'),readTime);
  const collection=u.pathname.split('/').at(-1);
  assert.ok(QA_SYNC_DATASETS.includes(collection));
  calls.push({collection,cursor:u.searchParams.get('pageToken')});
  if(failure==='quota'&&collection==='qa_appeal_events')
    return Promise.resolve(new Response('quota',{status:429,headers:{'content-type':'text/plain'}}));
  if(failure==='duplicate'&&collection==='qa_evaluations')
    return Promise.resolve(new Response(JSON.stringify({documents:[
      {name:'projects/'+projectId+'/databases/(default)/documents/qa_evaluations/sample',
       fields:{final_score:{integerValue:'85'}}},
      {name:'projects/'+projectId+'/databases/(default)/documents/qa_evaluations/sample',
       fields:{final_score:{integerValue:'85'}}},
    ]}),{status:200,headers:{'content-type':'application/json'}}));
  const records=collection==='qa_evaluations'
    ? u.searchParams.has('pageToken')?
      [{name:'projects/'+projectId+'/databases/(default)/documents/'+collection+'/qa-2',
        fields:{final_score:{integerValue:'90'}}}]
      :[{name:'projects/'+projectId+'/databases/(default)/documents/'+collection+'/qa-1',
         fields:{final_score:{integerValue:'85'}}}]
    :[];
  return Promise.resolve(new Response(JSON.stringify({
    documents:records,
    ...(collection==='qa_evaluations'&&!u.searchParams.has('pageToken')
      ?{nextPageToken:'fixture-next-page'}:{}),
  }),{status:200,headers:{'content-type':'application/json'}}));
}
const args={projectId,accessToken:token,readTime,fetchImpl:service,pageSize:100};
const source=await captureQaFirestorePointInTime(args);
assert.equal(source.sourceCount,2);
assert.equal(source.metadata.manifests.length,QA_SYNC_DATASETS.length);
assert.equal(source.metadata.immutableSnapshotVerified,true);
assert.equal(source.metadata.allCollectionsIncluded,true);
assert.equal(calls.length,QA_SYNC_DATASETS.length+1);
assert.equal(source.readBudgetReceipt.apiRequests,QA_SYNC_DATASETS.length+1);
assert.equal(source.readBudgetReceipt.documentReadEstimate,QA_SYNC_DATASETS.length+1);
assert.equal(source.readBudgetReceipt.maxDocumentReads,3000);
assert.equal(calls[1].cursor,'fixture-next-page');
assert.equal(calls.every(row=>QA_SYNC_DATASETS.includes(row.collection)),true);
const pages=await source.readCollection('qa_evaluations');
const ids=[];
for await (const item of pages)ids.push(item.id);
assert.deepEqual(ids,['qa-1','qa-2']);
assert.ok(!JSON.stringify(source.metadata).includes(token));
await assert.rejects(source.readCollection('qa_not_ours'),e=>e.code==='unrecognized_source_dataset');
calls=[];failure='quota';
await assert.rejects(captureQaFirestorePointInTime(args),
  e=>e.code==='firestore_quota_or_permission_blocked');
failure='duplicate';
await assert.rejects(captureQaFirestorePointInTime(args),
  e=>e.code==='firestore_duplicate_document');
failure=null;
await assert.rejects(captureQaFirestorePointInTime({...args,
  readTime:new Date(Date.now()-2*3600000).toISOString()}),
  e=>e.code==='read_time_outside_verified_window');
// Test absolute per-run ceilings. No attempted query may exceed limits,
// and incomplete 11-dataset snapshots must never be accepted.
calls=[];failure=null;
await assert.rejects(captureQaFirestorePointInTime({...args,maxDocumentReads:11}),
  e=>e.code==='firestore_snapshot_read_budget_exhausted');
assert.equal(calls.length,11,'never issue read 12 when budget allows 11');
calls=[];
await assert.rejects(captureQaFirestorePointInTime({...args,maxApiRequests:11}),
  e=>e.code==='firestore_snapshot_read_budget_exhausted');
assert.equal(calls.length,11,'never issue request 12 when budget allows 11');
calls=[];
await assert.rejects(captureQaFirestorePointInTime({...args,maxDocumentReads:10}),
  e=>e.code==='snapshot_read_budget_invalid');
assert.equal(calls.length,0,'invalid budget must fail before any read');
let budgetPages=[];
const budgeted=await captureQaFirestorePointInTime({
  ...args,maxDocumentReads:12,maxApiRequests:12,
  fetchImpl:(url,options)=>{
    budgetPages.push(new URL(url).searchParams.get('pageSize'));
    return service(url,options);
  },
});
assert.equal(budgeted.sourceCount,2);
assert.equal(budgeted.readBudgetReceipt.documentReadEstimate,12);
assert.equal(budgeted.readBudgetReceipt.apiRequests,12);
assert.equal(budgetPages.at(-1),'1','bound last request to remaining document budget');
assert.ok(!JSON.stringify(budgeted).includes(token));
// Durable reservation callback is awaited BEFORE every Firestore GET.
// A rejected reservation cannot reach Firestore or return a partial export.
let authorizations=0,sourceGets=0;
await assert.rejects(captureQaFirestorePointInTime({
  ...args,
  beforeRequest:async ({requestedPageSize,dataset,apiRequestNumber})=>{
    authorizations++;
    assert.ok(QA_SYNC_DATASETS.includes(dataset));
    assert.ok(Number.isSafeInteger(requestedPageSize));
    assert.equal(apiRequestNumber,authorizations);
    if(authorizations===3)throw Object.assign(new Error('source_daily_budget_exhausted'),
      {code:'source_daily_budget_exhausted'});
  },
  fetchImpl:(url,options)=>{sourceGets++;return service(url,options);},
}),e=>e.code==='source_daily_budget_exhausted');
assert.equal(authorizations,3);
assert.equal(sourceGets,2,'denied request must never consume source reads');
sourceGets=0;
await assert.rejects(captureQaFirestorePointInTime({
  ...args,beforeRequest:'not-a-function',
  fetchImpl:()=>{sourceGets++;throw new Error('should never call');},
}),e=>e.code==='source_read_reserver_invalid');
assert.equal(sourceGets,0);
console.log('PASS QA Firestore source: all required QA collections at fixed readTime, paginated, aborts on quota/duplicates, no secrets or writes');
