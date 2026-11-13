// Opt-in Eventarc Firestore -> durable Cloud Tasks producer. No Firestore
// reads, no QA Sparks, no scoring writes. Cloud Run must be IAM-authenticated;
// never allow browser submissions to impersonate CloudEvents.
import {createHash,createHmac} from 'node:crypto';
const allowed=Object.freeze([
 'qa_evaluations','qa_appeal_events','qa_signature_documents',
 'qa_user_profiles','qa_role_permissions','qa_user_sessions',
 'qa_user_session_controls','qa_role_definitions','qa_system_settings',
 'qa_signature_library','qa_evaluation_progress',
]);
export const QA_EVENT_COLLECTIONS=allowed;
const PROJECT=/^[a-z][a-z0-9-]{4,62}$/;
const SNAP=/^[a-zA-Z0-9_.:-]{12,128}$/;
const EMAIL=/^[a-zA-Z0-9._+-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/;
const URL=/^https:\/\/[a-z0-9.-]+\/v1\/qa\/source-delta$/;
const fail=code=>{throw Object.assign(new Error(code),{code});};
const digest=s=>createHash('sha256').update(s).digest('hex');
function isoTimestamp(value){
 if(typeof value==='string'){
  const n=Date.parse(value);
  if(!Number.isFinite(n)||!value.endsWith('Z'))fail('qa_event_timestamp_invalid');
  return value;
 }
 if(!value||typeof value!=='object')fail('qa_event_timestamp_invalid');
 const s=String(value.seconds??''),n=Number(value.nanos??0);
 if(!/^-?\d{1,15}$/.test(s)||!Number.isInteger(n)||n<0||n>999999999)
  fail('qa_event_timestamp_invalid');
 const seconds=Number(s),milliseconds=seconds*1000;
 if(!Number.isSafeInteger(milliseconds))fail('qa_event_timestamp_invalid');
 const d=new Date(milliseconds);
 if(!Number.isFinite(d.getTime()))fail('qa_event_timestamp_invalid');
 const fraction=n?'.'+String(n).padStart(9,'0').replace(/0+$/,''):'';
 return d.toISOString().slice(0,19)+fraction+'Z';
}
function typedValue(v,depth=0){
 if(depth>45||!v||typeof v!=='object'||Array.isArray(v))
  fail('qa_event_invalid_typed_value');
 const options=['nullValue','booleanValue','integerValue','doubleValue',
  'timestampValue','stringValue','bytesValue','referenceValue',
  'geoPointValue','arrayValue','mapValue'].filter(x=>Object.hasOwn(v,x));
 if(options.length!==1)fail('qa_event_invalid_typed_value');
 const k=options[0],value=v[k];
 switch(k){
  case 'nullValue':return {nullValue:'NULL_VALUE'};
  case 'booleanValue':
   if(typeof value!=='boolean')break;
   return {booleanValue:value};
  case 'integerValue':
   if(!/^-?\d+$/.test(String(value)))break;
   return {integerValue:String(value)};
  case 'doubleValue':
   if(!(typeof value==='number'&&Number.isFinite(value))&&
      !['NaN','Infinity','-Infinity'].includes(value))break;
   return {doubleValue:value};
  case 'timestampValue':return {timestampValue:isoTimestamp(value)};
  case 'stringValue':
   if(typeof value!=='string')break;
   return {stringValue:value};
  case 'bytesValue':
   if(typeof value!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))break;
   return {bytesValue:value};
  case 'referenceValue':
   if(typeof value!=='string'||!value.startsWith('projects/'))break;
   return {referenceValue:value};
  case 'geoPointValue':
   if(!value||!Number.isFinite(Number(value.latitude))||
       !Number.isFinite(Number(value.longitude)))break;
   return {geoPointValue:{latitude:Number(value.latitude),longitude:Number(value.longitude)}};
  case 'arrayValue':
   if(!value||typeof value!=='object'||!Array.isArray(value.values??[]))break;
   return {arrayValue:{values:(value.values||[]).map(x=>typedValue(x,depth+1))}};
  case 'mapValue':
   if(!value||typeof value!=='object'||!value.fields||
      typeof value.fields!=='object'||Array.isArray(value.fields))break;
   return {mapValue:{fields:Object.fromEntries(Object.entries(value.fields)
     .map(([name,x])=>[name,typedValue(x,depth+1)]))}};
 }
 fail('qa_event_invalid_typed_value');
}
function fieldsOf(fields){
 if(!fields||typeof fields!=='object'||Array.isArray(fields))
  fail('qa_event_invalid_document_fields');
 return Object.fromEntries(Object.entries(fields).map(([k,v])=>
  [k,typedValue(v)]));
}
export function qaEventarcToDelta({cloudEvent,decoded,projectId,snapshotId}={}){
 if(!PROJECT.test(projectId||'')||!SNAP.test(snapshotId||'')||
    !cloudEvent||typeof cloudEvent!=='object'||!decoded||typeof decoded!=='object')
  fail('qa_event_source_configuration_invalid');
 if(cloudEvent.type!=='google.cloud.firestore.document.v1.written')
  fail('qa_event_wrong_type');
 const source='//firestore.googleapis.com/projects/'+projectId+
   '/databases/(default)';
 if(cloudEvent.source!==source||typeof cloudEvent.id!=='string'||
    cloudEvent.id.length<5||cloudEvent.id.length>256)
  fail('qa_event_source_not_verified');
 const prefix='projects/'+projectId+'/databases/(default)/documents/';
 const resource=decoded.value?.name||decoded.oldValue?.name;
 if(typeof resource!=='string'||!resource.startsWith(prefix))
  fail('qa_event_document_identity_invalid');
 const path=resource.slice(prefix.length),segments=path.split('/');
 if(segments.length!==2||!segments[0]||!segments[1])
  fail('qa_event_nested_document_not_supported');
 if(!allowed.includes(segments[0]))return null;
 if(cloudEvent.subject!==undefined&&
    cloudEvent.subject!=='documents/'+path)
  fail('qa_event_subject_mismatch');
 if(decoded.value?.name&&decoded.value.name!==resource||
    decoded.oldValue?.name&&decoded.oldValue.name!==resource)
  fail('qa_event_document_identity_changed');
 const upsert=Boolean(decoded.value?.name);
 const documentJson=upsert?{
  fields:fieldsOf(decoded.value.fields||{}),
  createTime:decoded.value.createTime?isoTimestamp(decoded.value.createTime):null,
  updateTime:decoded.value.updateTime?isoTimestamp(decoded.value.updateTime):null,
 }:null;
 if(upsert&&!documentJson.updateTime)fail('qa_event_updated_time_missing');
 const sourceChangedAt=upsert?documentJson.updateTime:
   isoTimestamp(cloudEvent.time);
 const eventId='gce-'+digest(source+'\0'+cloudEvent.id);
 return Object.freeze({eventId,snapshotId,documentPath:path,
  operation:upsert?'upsert':'delete',sourceChangedAt,documentJson});
}
function configValid({queuePath,workerUrl,serviceAccountEmail,sourceSecret}={}){
 return typeof queuePath==='string'&&
   /^projects\/[a-z][a-z0-9-]{4,62}\/locations\/[a-z0-9-]+\/queues\/[a-zA-Z0-9_-]{1,100}$/.test(queuePath)&&
   URL.test(workerUrl||'')&&EMAIL.test(serviceAccountEmail||'')&&
   typeof sourceSecret==='string'&&sourceSecret.length>=64&&
   sourceSecret.length<=512&&/^[\x21-\x7e]+$/.test(sourceSecret);
}
export function qaEventToCloudTask({
 envelope,queuePath,workerUrl,serviceAccountEmail,sourceSecret,
 now=Date.now(),
}={}){
 if(!configValid({queuePath,workerUrl,serviceAccountEmail,sourceSecret})||
    !envelope||typeof envelope!=='object'||!Number.isFinite(now))
  fail('qa_event_task_configuration_invalid');
 const body=Buffer.from(JSON.stringify(envelope),'utf8');
 if(body.length<20||body.length>512*1024)
  fail('qa_event_task_body_size_invalid');
 const stamp=String(Math.floor(now/1000));
 const signature='v1='+createHmac('sha256',sourceSecret)
   .update('qa-source-delta-v1\n'+stamp+'\n','utf8')
   .update(body).digest('hex');
 // Named tasks make duplicate Eventarc deliveries idempotent at the queue.
 const taskName=queuePath+'/tasks/qa-'+digest(envelope.eventId).slice(0,48);
 return Object.freeze({
  parent:queuePath,
  task:{name:taskName,httpRequest:{
   httpMethod:'POST',url:workerUrl,
   headers:{'content-type':'application/json',
    'x-qa-source-timestamp':stamp,
    'x-qa-source-signature':signature},
   oidcToken:{serviceAccountEmail,audience:workerUrl},
   body,
  }},
 });
}
export async function enqueueQaEventarcDelta({
 cloudEvent,decoded,projectId,snapshotId,queuePath,
 workerUrl,serviceAccountEmail,sourceSecret,
 createTask,now=Date.now(),
}={}){
 if(typeof createTask!=='function')fail('qa_event_task_adapter_missing');
 const envelope=qaEventarcToDelta({cloudEvent,decoded,projectId,snapshotId});
 if(!envelope)return Object.freeze({queued:false,ignoredCollection:true});
 const task=qaEventToCloudTask({
  envelope,queuePath,workerUrl,serviceAccountEmail,sourceSecret,now,
 });
 try{
  await createTask(task);
  return Object.freeze({queued:true,duplicate:false});
 }catch(error){
  // gRPC ALREADY_EXISTS=6 means an identical deterministic Cloud Task name
  // has been accepted already. Do not suppress any other queue errors.
  if(Number(error?.code)===6)return Object.freeze({queued:true,duplicate:true});
  throw fail('qa_event_task_enqueue_failed');
 }
}
