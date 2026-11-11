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
assert.equal(source.metadata.manifests.length,6);
assert.equal(source.metadata.immutableSnapshotVerified,true);
assert.equal(source.metadata.allCollectionsIncluded,true);
assert.equal(calls.length,7);
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
console.log('PASS QA Firestore source: six collections at fixed readTime, paginated, aborts on quota/duplicates, no secrets or writes');
