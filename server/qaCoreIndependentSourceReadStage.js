// Disabled-by-default QA Core independent Firestore REST document inspector.
// This is a SOURCE-READ ADAPTER, not a source commit authority, an event feed,
// a Windows sender or a proof that all writes were intercepted.
// Intentionally restricted to isolated CI. No route or scheduled process.
import {QA_SYNC_DATASETS} from './qaLiveMirrorStage.js';
const PROJECT='qa-dashboard-b0b5d';
const REV=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{6})Z$/;
const ID=/^[A-Za-z0-9_.:@-]{16,180}$/;
const DOCUMENT=/^[^\x00-\x1f\x7f/]{1,900}$/;
const MAX_BODY_BYTES=1024*1024;
const fail=code=>{throw Object.assign(new Error(code),{code});};
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function canonicalRevision(value){
 const m=typeof value==='string'?REV.exec(value):null;
 if(!m)fail('qa_rest_source_revision_not_microsecond_canonical');
 const epoch=Date.parse(m[1]+'Z');
 if(!Number.isFinite(epoch)||new Date(epoch).toISOString().slice(0,19)!==m[1])
  fail('qa_rest_source_revision_invalid');
 return value;
}
export function createQaCoreIndependentSourceRead({
 oauthToken, reserveRead, fetchImpl, env=process.env,
}={}){
 if(env.QA_CORE_SOURCE_READ_ADAPTER_TEST!=='1'||
    env.QA_CORE_SOURCE_VERIFICATION_STAGE!=='1'||
    env.QA_PG_ISOLATED_TEST!=='1'||
    env.QA_FAILOVER!=='OFF'||
    typeof reserveRead!=='function'||typeof fetchImpl!=='function')
  fail('qa_rest_source_reader_disabled');
 // The mock fetch function is required explicitly: this isolated stage
 // has no network-capable default and cannot call Firestore accidentally.
 // This token must come from the isolated backend test runner. NEVER accept
 // an access token, expected revision, or read receipt supplied by a browser.
 if(typeof oauthToken!=='string'||oauthToken.length<20||
    oauthToken.length>8192||!/^[\x21-\x7e]+$/.test(oauthToken))
  fail('qa_rest_source_reader_missing_server_credentials');
 return async function readIndependentSource({
  projectId,operationId,documentPath,expectedUpdateTime,
 }={}){
  if(projectId!==PROJECT||typeof operationId!=='string'||!ID.test(operationId)||
     typeof documentPath!=='string'||documentPath.length>950)
   fail('qa_rest_source_invalid_identity');
  const parts=documentPath.split('/');
  if(parts.length!==2||!QA_SYNC_DATASETS.includes(parts[0])||
     !DOCUMENT.test(parts[1]))
   fail('qa_rest_source_invalid_document_path');
  canonicalRevision(expectedUpdateTime);
  // Reservation MUST be durable. It is never refunded after a failed GET.
  // No network request is allowed until the durable budget receipt arrives.
  let receipt;
  try{
   receipt=await reserveRead(Object.freeze({
    projectId:PROJECT,collection:parts[0],operationId,documentPath,
    requestedPageSize:1,
   }));
  }catch{fail('qa_rest_source_budget_unavailable');}
  if(receipt?.estimatedNotBilledReads!==true||
     !/^\d{4}-\d{2}-\d{2}$/.test(receipt.budgetDayUtc||'')||
     !Number.isSafeInteger(receipt.reservedDocumentUnits)||
     receipt.reservedDocumentUnits<1||receipt.reservedDocumentUnits>3000||
     !Number.isSafeInteger(receipt.reservedRequests)||
     receipt.reservedRequests<1||receipt.reservedRequests>80)
   fail('qa_rest_source_budget_unverified');
  const name='projects/'+PROJECT+'/databases/(default)/documents/'+documentPath;
  const url='https://firestore.googleapis.com/v1/projects/'+PROJECT+
   '/databases/(default)/documents/'+parts[0]+'/'+encodeURIComponent(parts[1]);
  let res;
  try{
   res=await fetchImpl(url,{
    method:'GET',
    headers:{authorization:'Bearer '+oauthToken,accept:'application/json'},
    redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000),
   });
  }catch{fail('qa_rest_source_unreachable_no_retry');}
  if(res?.status===404)fail('qa_rest_source_missing_not_a_deletion_proof');
  if([401,403,429].includes(res?.status))fail('qa_rest_source_auth_or_quota_blocked');
  if(res?.status!==200||!/application\/json/i.test(res?.headers?.get?.('content-type')||''))
   fail('qa_rest_source_unverified_response');
  const length=Number(res.headers?.get?.('content-length'));
  if(Number.isFinite(length)&&length>MAX_BODY_BYTES)
   fail('qa_rest_source_document_too_large');
  let source;
  try{source=await res.json();}catch{fail('qa_rest_source_invalid_json');}
  if(!plain(source)||source.name!==name||!plain(source.fields)||
     typeof source.updateTime!=='string')
   fail('qa_rest_source_wrong_document');
  canonicalRevision(source.updateTime);
  if(source.updateTime!==expectedUpdateTime)
   fail('qa_rest_source_revision_changed_requires_reconciliation');
  if(source.createTime!=null){
   // Firestore may return 0,3,6 or 9 digits. Verify legal date but do not
   // manufacture timestamps or allow missing updateTime.
   if(typeof source.createTime!=='string'||!Number.isFinite(Date.parse(source.createTime)))
    fail('qa_rest_source_invalid_create_time');
  }
  if(Buffer.byteLength(JSON.stringify(source),'utf8')>MAX_BODY_BYTES)
   fail('qa_rest_source_document_too_large');
  return Object.freeze({
   authority:'qa-core-independent-server-source-read',
   projectId:PROJECT,documentPath,
   authenticatedServerRead:true,readBudgetReserved:true,
   sourceReadVerified:true,
   documentJson:Object.freeze({
    name,fields:source.fields,updateTime:source.updateTime,
    createTime:source.createTime||null,
   }),
   // Reading the right document once cannot prove the originating write,
   // the completeness of the feed, or permission to deliver to Windows.
   sourceContinuityCertified:false,deliveryEligible:false,
   failoverReady:false,
  });
 };
}
