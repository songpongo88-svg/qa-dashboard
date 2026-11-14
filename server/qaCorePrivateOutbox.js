// QA Core private outbox STAGING ONLY. Deliberately no HTTP route,
// scheduled worker, Firestore writes, or Windows sender. A durable pending
// intent is NOT proof that Firestore accepted the corresponding QA mutation.
// Only a separately authorized server mutation service may use this module.
import {QA_SYNC_DATASETS,qaCanonicalDocumentHash} from './qaLiveMirrorStage.js';

const id=/^[A-Za-z0-9_.:@-]{16,180}$/;
const err=code=>{throw Object.assign(new Error(code),{code});};
export function normalizeQaCoreIntent(event){
 if(!event||typeof event!=='object'||!id.test(event.operationId||''))
  err('qa_outbox_invalid_operation_id');
 const path=event.documentPath;
 if(typeof path!=='string'||path.length>950||!path.includes('/'))
  err('qa_outbox_invalid_path');
 const segs=path.split('/');
 if(segs.length!==2||!QA_SYNC_DATASETS.includes(segs[0])||
  !segs[1]||/[\x00-\x1f\x7f]/.test(segs[1]))
  err('qa_outbox_invalid_path');
 if(event.operation!=='upsert'&&event.operation!=='delete')
  err('qa_outbox_invalid_operation');
 if(event.operation==='delete'&&event.documentJson!==null)
  err('qa_outbox_delete_requires_null');
 if(event.operation==='upsert'&&
    (!event.documentJson||typeof event.documentJson!=='object'||
    Array.isArray(event.documentJson)||
    !event.documentJson.fields||typeof event.documentJson.fields!=='object'||
    Array.isArray(event.documentJson.fields)))
  err('qa_outbox_requires_typed_firestore_document');
 const json=event.operation==='delete'?null:event.documentJson;
 return Object.freeze({
  operationId:event.operationId,collection:segs[0],
  documentPath:path,operation:event.operation,
  documentJson:json,payloadHash:json?qaCanonicalDocumentHash(json):null,
 });
}
function approvedProof(proof,e){
 return proof?.authority==='qa-core-private-authorized-mutation'&&
   proof?.operationId===e.operationId&&
   proof?.documentPath===e.documentPath&&
   proof?.operation===e.operation&&proof?.payloadHash===e.payloadHash;
}
export async function stageQaCorePendingIntent({
 pool,event,authorizeServerMutation,env=process.env,
}={}){
 // This is NOT used by the QA Dashboard. Explicit internal opt-in plus
 // a private Postgres database connection is mandatory before any query.
 if(env.QA_CORE_PRIVATE_OUTBOX_STAGING!=='1'||
    typeof pool?.connect!=='function'||typeof authorizeServerMutation!=='function')
  err('qa_outbox_private_stage_disabled');
 const e=normalizeQaCoreIntent(event);
 const proof=await authorizeServerMutation(e);
 if(!approvedProof(proof,e))err('qa_outbox_trusted_mutation_required');
 const c=await pool.connect();
 try {
  const db=(await c.query('SELECT current_database() AS db')).rows?.[0]?.db;
  if(!(env.QA_PG_ISOLATED_TEST==='1'&&db==='qa_cutover_ci_test')&&
    !(env.QA_CORE_PRIVATE_OUTBOX_DATABASE==='postgres'&&db==='postgres'))
    err('qa_outbox_wrong_database');
  const args=[e.operationId,e.collection,e.documentPath,e.operation,
    e.documentJson===null?null:JSON.stringify(e.documentJson),e.payloadHash];
  const inserted=await c.query(
    'INSERT INTO qa_core_replication_stage.change_outbox'+
    ' (operation_id,collection_name,document_path,operation,document_json,payload_sha256)'+
    ' VALUES ($1,$2,$3,$4,$5::jsonb,$6)'+
    ' ON CONFLICT (operation_id) DO NOTHING RETURNING seq',args);
  if(inserted.rows?.[0])return Object.freeze({
    staged:true,replay:false,sourceConfirmed:false,
    delivered:false,failoverReady:false,
  });
  const prev=(await c.query(
    'SELECT collection_name,document_path,operation,payload_sha256,'+
    ' (document_json = $2::jsonb) AS payload_equal,source_state,delivery_state'+
    ' FROM qa_core_replication_stage.change_outbox WHERE operation_id=$1',
    [e.operationId,e.documentJson===null?null:JSON.stringify(e.documentJson)])).rows?.[0];
  if(!prev||prev.collection_name!==e.collection||
    prev.document_path!==e.documentPath||prev.operation!==e.operation||
    prev.payload_sha256!==e.payloadHash||
    (e.operation==='upsert'&&prev.payload_equal!==true))
    
    err('qa_outbox_idempotency_collision');
  return Object.freeze({
    staged:true,replay:true,sourceConfirmed:false,
    requiresReconciliation:prev.source_state==='needs_reconcile',
    delivered:false,failoverReady:false,
  });
 }finally{c.release();}
}
// No "confirm source write" helper exists in this module by design.
// Confirming Firestore's source commit needs separate authenticated backend
// evidence and reconciliation of uncertain dual-write outcomes.
