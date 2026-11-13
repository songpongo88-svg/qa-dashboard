// Synthetic Eventarc typed-data and Cloud Tasks dry-run; no GCP or Firestore.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {QA_SYNC_DATASETS} from '../server/qaLiveMirrorStage.js';
import {QA_EVENT_COLLECTIONS,qaEventarcToDelta,qaEventToCloudTask,enqueueQaEventarcDelta}
 from '../cloud/qa-firestore-delta-producer/producer.mjs';
assert.deepEqual(QA_EVENT_COLLECTIONS,QA_SYNC_DATASETS);
const projectId='qa-fixture-2026',snapshotId='qa-live-snapshot-fixture',
 source='//firestore.googleapis.com/projects/'+projectId+'/databases/(default)';
const name='projects/'+projectId+'/databases/(default)/documents/qa_evaluations/AA100001';
const event={type:'google.cloud.firestore.document.v1.written',
 source,subject:'documents/qa_evaluations/AA100001',
 id:'99999999999999999999999',time:'2026-11-14T01:00:00Z'};
const decoded={value:{name,
 createTime:{seconds:'1794618000',nanos:0},
 updateTime:{seconds:'1794618001',nanos:123456000},
 fields:{score:{integerValue:'85'},name:{stringValue:'QA'},
 active:{booleanValue:true},deleted:{nullValue:'NULL_VALUE'},
 details:{mapValue:{fields:{level:{integerValue:'2'}}}},
 scores:{arrayValue:{values:[{integerValue:'1'},{integerValue:'2'}]}},
 }}};
const envelope=qaEventarcToDelta({cloudEvent:event,decoded,projectId,snapshotId});
assert.equal(envelope.operation,'upsert');
assert.equal(envelope.documentPath,'qa_evaluations/AA100001');
assert.equal(envelope.documentJson.fields.score.integerValue,'85');
assert.equal(envelope.documentJson.fields.details.mapValue.fields.level.integerValue,'2');
assert.equal(envelope.documentJson.fields.scores.arrayValue.values[1].integerValue,'2');
assert.ok(envelope.documentJson.updateTime.endsWith('.123456Z'));
const del=qaEventarcToDelta({cloudEvent:event,decoded:{
 oldValue:decoded.value},projectId,snapshotId});
assert.equal(del.operation,'delete');
assert.equal(del.documentJson,null);
const ignored=qaEventarcToDelta({cloudEvent:{...event,subject:'documents/other/doc'},
 decoded:{value:{...decoded.value,name:name.replace('qa_evaluations','other')}},
 projectId,snapshotId});
assert.equal(ignored,null);
for(const [ce,data] of [
 [{...event,type:'google.cloud.firestore.document.v1.updated'},decoded],
 [{...event,source:'//firestore.googleapis.com/projects/other/databases/(default)'},decoded],
 [{...event,subject:'documents/qa_evaluations/other'},decoded],
 [event,{value:{...decoded.value,name:name+'/nested'}}],
 ])assert.throws(()=>qaEventarcToDelta({cloudEvent:ce,decoded:data,projectId,snapshotId}));
const workerUrl='https://qa-delta.workers.dev/v1/qa/source-delta';
const sourceSecret='source-private-key-'.repeat(5);
const queuePath='projects/qa-fixture-2026/locations/asia-southeast1/queues/qa-source-delta';
const sa='qa-source-tasks@qa-fixture-2026.iam.gserviceaccount.com';
const now=Date.parse('2026-11-14T02:00:00Z');
const task=qaEventToCloudTask({envelope,queuePath,workerUrl,
 serviceAccountEmail:sa,sourceSecret,now});
assert.equal(task.task.httpRequest.oidcToken.audience,workerUrl);
const body=task.task.httpRequest.body;
assert.equal(JSON.parse(body.toString('utf8')).documentPath,envelope.documentPath);
const stamp=task.task.httpRequest.headers['x-qa-source-timestamp'];
const expected='v1='+createHmac('sha256',sourceSecret)
 .update('qa-source-delta-v1\n'+stamp+'\n').update(body).digest('hex');
assert.equal(task.task.httpRequest.headers['x-qa-source-signature'],expected);
let count=0;
const created=await enqueueQaEventarcDelta({cloudEvent:event,decoded,
 projectId,snapshotId,queuePath,workerUrl,serviceAccountEmail:sa,sourceSecret,
 now,createTask:async ()=>{count++;}});
assert.equal(created.queued,true);assert.equal(count,1);
const duplicate=await enqueueQaEventarcDelta({cloudEvent:event,decoded,
 projectId,snapshotId,queuePath,workerUrl,serviceAccountEmail:sa,sourceSecret,
 now,createTask:async()=>{throw Object.assign(Error('already exists'),{code:6});}});
assert.equal(duplicate.duplicate,true);
await assert.rejects(enqueueQaEventarcDelta({cloudEvent:event,decoded,
 projectId,snapshotId,queuePath,workerUrl,serviceAccountEmail:sa,sourceSecret,
 now,createTask:async()=>{throw Object.assign(Error('down'),{code:14});}}),
 /qa_event_task_enqueue_failed/);
assert.ok(!JSON.stringify(created).includes('AA100001'));
console.log('PASS QA Eventarc to Cloud Tasks: typed Firestore document, no reads, OIDC task, HMAC, dedup and fail-closed enqueue');
