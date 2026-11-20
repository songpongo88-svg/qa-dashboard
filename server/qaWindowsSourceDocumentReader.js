// Firestore REST source read for a *previously received* Windows listener
// metadata signal. Server-only, staged and OFF; no HTTP route is exported.
// Typed Firestore JSON is not reconstructed from the Node SDK's doc.data().
// Deletions/changed-again races require reconciliation, never false ACK.
import {QA_SYNC_DATASETS,qaCanonicalDocumentHash} from './qaLiveMirrorStage.js';
const PROJECT='qa-dashboard-b0b5d';
const DOC=/^[^\x00-\x1f\x7f/]{1,900}$/;
const REPO_REV=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{3}|\d{6}|\d{9}))?Z$/;
const err=code=>{throw Object.assign(new Error(code),{code});};
function revision(value){
 if(typeof value!=='string')err('qa_source_read_invalid_revision');
 const m=REPO_REV.exec(value);
 if(!m)err('qa_source_read_invalid_revision');
 const ms=Date.parse(m[1]+'Z');
 if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,19)!==m[1])
   err('qa_source_read_invalid_revision');
 const frac=(m[2]||'').padEnd(9,'0');
 if(frac.slice(6)!=='000')err('qa_source_read_submicrosecond_revision');
 return m[1]+'.'+frac.slice(0,6)+'Z';
}
export async function readQaWindowsVerifiedSourceChange({
 signal,oauthToken,reserveRead,fetchImpl=fetch,env=process.env,
}={}){
 if(env.QA_WINDOWS_SOURCE_READ_ENABLED!=='1'||env.QA_FAILOVER!=='OFF'||
    typeof reserveRead!=='function'||typeof fetchImpl!=='function')
   err('qa_source_read_disabled');
 if(typeof oauthToken!=='string'||oauthToken.length<20||oauthToken.length>8192||
    !/^[\x21-\x7e]+$/.test(oauthToken))
   err('qa_source_read_server_auth_missing');
 if(!signal||!QA_SYNC_DATASETS.includes(signal.collection)||
    typeof signal.documentId!=='string'||!DOC.test(signal.documentId)||
    !['added','modified','removed'].includes(signal.changeType)||
    signal.authoritativeDocument!==false||
    signal.sourceCommitVerified!==false||signal.requiresSourceRead!==true)
   err('qa_source_read_invalid_private_signal');
 if(signal.changeType==='removed'){
   if(signal.observedRevision!==null)
     err('qa_source_delete_not_authoritative');
 }else if(revision(signal.observedRevision)!==signal.observedRevision){
   err('qa_source_signal_revision_not_canonical');
 }
 const result=await reserveRead(Object.freeze({projectId:PROJECT,units:1,
   operation:'get_document',collection:signal.collection}));
 if(result?.reserved!==true||result?.projectId!==PROJECT||
    !Number.isSafeInteger(result?.units)||result.units<1)
   err('qa_source_read_budget_not_reserved');
 // There is exactly ONE source GET; no pagination, retry, follow-redirect,
 // index scan, or collection-wide read in this adapter.
 const path='projects/'+PROJECT+'/databases/(default)/documents/'+
   signal.collection+'/'+signal.documentId;
 const url='https://firestore.googleapis.com/v1/projects/'+PROJECT+
   '/databases/(default)/documents/'+signal.collection+'/'+
   encodeURIComponent(signal.documentId);
 let response;
 try{
  response=await fetchImpl(url,{
   method:'GET',headers:{authorization:'Bearer '+oauthToken,
     accept:'application/json'},redirect:'error',cache:'no-store',
   signal:AbortSignal.timeout(15000),
  });
 }catch{err('qa_source_read_unreachable');}
 if(response?.status===404) {
  // 404 demonstrates current absence, but not the original deletion
  // revision. Never fabricate a sourceChangedAt for a local tombstone.
  return Object.freeze({verifiedDocument:false,requiresReconciliation:true,
    reason:'source_missing_at_read',canDeliver:false});
 }
 if(response?.status===401||response?.status===403||response?.status===429)
   err('qa_source_read_quota_or_auth_blocked');
 if(response?.status!==200||
    !/application\/json/i.test(response.headers?.get?.('content-type')||''))
   err('qa_source_read_unverified_response');
 let body;
 try{body=await response.json();}catch{err('qa_source_read_invalid_json');}
 if(!body||body.name!==path||!body.fields||
    typeof body.fields!=='object'||Array.isArray(body.fields)||
    typeof body.updateTime!=='string')
   err('qa_source_read_wrong_document');
 const sourceRev=revision(body.updateTime);
 if(signal.changeType==='removed'||sourceRev!==signal.observedRevision)
   return Object.freeze({verifiedDocument:false,requiresReconciliation:true,
     reason:'source_revision_race',canDeliver:false});
 const documentJson=Object.freeze({
  fields:body.fields,createTime:body.createTime||null,
  updateTime:body.updateTime,
 });
 const hash=qaCanonicalDocumentHash(documentJson);
 return Object.freeze({
  verifiedDocument:true,requiresReconciliation:false,canDeliver:false,
  projectId:PROJECT,collection:signal.collection,documentId:signal.documentId,
  observedRevision:sourceRev,documentJson,hash,
  // A verified REST read is useful for an eventual local, authenticated
  // journal entry; it does not establish end-to-end source continuity.
  sourceContinuityCertified:false,failoverReady:false,
 });
}
