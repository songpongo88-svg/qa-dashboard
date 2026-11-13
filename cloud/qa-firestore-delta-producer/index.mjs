// Isolated Google Cloud Run Functions CloudEvent entrypoint.
// DEPLOYMENT IS NOT AUTHORIZED BY COMMITTING THIS FILE.
import * as functions from '@google-cloud/functions-framework';
import protobuf from 'protobufjs';
import {CloudTasksClient} from '@google-cloud/tasks';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {enqueueQaEventarcDelta} from './producer.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const schema=await protobuf.load(join(here,'data.proto'));
const type=schema.lookupType('google.events.cloud.firestore.v1.DocumentEventData');
const client=new CloudTasksClient();
functions.cloudEvent('qaFirestoreDeltaProducer',async event=>{
 if(process.env.QA_SOURCE_PRODUCER_ENABLED!=='1')
  throw Error('qa_source_producer_disabled');
 if(!(event.data instanceof Uint8Array))
  throw Error('qa_eventarc_protobuf_payload_required');
 const decoded=type.toObject(type.decode(event.data),{
  longs:String,bytes:String,enums:String,defaults:false,oneofs:true,json:true,
 });
 await enqueueQaEventarcDelta({
  cloudEvent:event,decoded,
  projectId:process.env.QA_SOURCE_FIRESTORE_PROJECT,
  snapshotId:process.env.QA_SOURCE_PINNED_SNAPSHOT,
  queuePath:process.env.QA_SOURCE_CLOUD_TASKS_QUEUE,
  workerUrl:process.env.QA_SOURCE_WORKER_URL,
  serviceAccountEmail:process.env.QA_SOURCE_TASK_SA,
  sourceSecret:process.env.QA_SOURCE_EVENT_HMAC_SECRET,
  createTask:request=>client.createTask(request),
 });
 // Cloud Run acknowledges the Eventarc event only once Cloud Tasks has
 // confirmed the durable enqueue (or the same named task already exists).
 // Cloud Tasks retries private delivery and handles brief Windows downtime.
});
