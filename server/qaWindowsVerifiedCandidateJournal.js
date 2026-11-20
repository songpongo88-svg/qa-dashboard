// Windows-local, disabled-by-default staging for a separately budgeted
// Firestore REST *document read*. It does not certify continuous sync,
// deletes, Firestore history, snapshots, user roles, or failover readiness.
// No HTTP route, browser access, scheduler, provider request or credentials.
import {QA_SYNC_DATASETS,qaCanonicalDocumentHash} from './qaLiveMirrorStage.js';
const PROJECT='qa-dashboard-b0b5d';
const ID=/^[A-Za-z0-9_.:@-]{16,180}$/;
const SNAP=/^[A-Za-z0-9_.:-]{12,128}$/;
const DOC=/^[^\x00-\x1f\x7f/]{1,900}$/;
const REV=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const bad=code=>{throw Object.assign(new Error(code),{code});};

function normalize(signal,verified){
 if(!signal||!ID.test(signal.eventId||'')||!SNAP.test(signal.snapshotId||'')||
   !QA_SYNC_DATASETS.includes(signal.collection)||!DOC.test(signal.documentId||'')||
   !['added','modified'].includes(signal.changeType)||!REV.test(signal.observedRevision||''))
  bad('qa_candidate_signal_requires_verified_upsert');
 if(!verified||verified.verifiedDocument!==true||
   verified.requiresReconciliation!==false||
   verified.canDeliver!==false||verified.sourceContinuityCertified!==false||
   verified.projectId!==PROJECT||verified.collection!==signal.collection||
   verified.documentId!==signal.documentId||
   verified.observedRevision!==signal.observedRevision||
   !verified.documentJson||typeof verified.documentJson!=='object'||
   Array.isArray(verified.documentJson)||
   !verified.documentJson.fields||
   typeof verified.documentJson.fields!=='object'||
   Array.isArray(verified.documentJson.fields)||
   verified.documentJson.updateTime!==signal.observedRevision)
  bad('qa_candidate_source_read_not_verified');
 let hash;
 try{hash=qaCanonicalDocumentHash(verified.documentJson);}catch{
  bad('qa_candidate_source_document_invalid');
 }
 if(hash!==verified.hash)bad('qa_candidate_source_hash_mismatch');
 return Object.freeze({...signal,documentJson:verified.documentJson,hash});
}

export async function stageQaWindowsVerifiedSourceCandidate({
 pool,signal,verified,attestSourceRead,env=process.env,
}={}){
 if(env.QA_WINDOWS_VERIFIED_CANDIDATE_STAGE!=='1'||
    env.QA_FAILOVER!=='OFF'||typeof pool?.connect!=='function'||
    typeof attestSourceRead!=='function')
  bad('qa_candidate_private_stage_disabled');
 const e=normalize(signal,verified);
 // This proof is supplied by an eventual trusted server adapter, NOT a
 // client-provided JSON request. No external adapter is wired in this PR.
 const proof=await attestSourceRead(Object.freeze({
  snapshotId:e.snapshotId,eventId:e.eventId,collection:e.collection,
  documentId:e.documentId,observedRevision:e.observedRevision,contentHash:e.hash,
 }));
 if(proof?.authority!=='qa-local-server-budgeted-document-reader'||
    proof.snapshotId!==e.snapshotId||proof.eventId!==e.eventId||
    proof.collection!==e.collection||proof.documentId!==e.documentId||
    proof.observedRevision!==e.observedRevision||
    proof.contentHash!==e.hash||proof.projectId!==PROJECT||
    proof.credentialAttested!==true||proof.readBudgetReserved!==true||
    proof.documentReadVerified!==true)
  bad('qa_candidate_trusted_source_attestation_missing');
 const client=await pool.connect();let tx=false;
 try{
  const db=(await client.query('SELECT current_database() AS db')).rows?.[0]?.db;
  if(db!=='qa_dashboard_lab'&&
    !(db==='qa_cutover_ci_test'&&env.QA_PG_ISOLATED_TEST==='1'))
   bad('qa_candidate_wrong_local_database');
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');tx=true;
  await client.query("SET LOCAL lock_timeout = '3s'");
  const state=(await client.query(
   'SELECT mode,write_frozen,source_snapshot_verified,active_snapshot_id'+
   ' FROM qa_failover_v1.state WHERE id=1 FOR SHARE')).rows?.[0];
  if(state?.mode!=='disabled'||state.write_frozen!==true||
     state.source_snapshot_verified!==false||state.active_snapshot_id!==e.snapshotId)
   bad('qa_candidate_frozen_state_changed');
  const batch=(await client.query('SELECT status,approved_for_failover'+
   ' FROM qa_failover_v1.live_snapshot_batches WHERE snapshot_id=$1 FOR SHARE',
   [e.snapshotId])).rows?.[0];
  if(batch?.status!=='copy_verified'||batch.approved_for_failover!==false)
   bad('qa_candidate_snapshot_unverified');
  const receipt=(await client.query(
   'SELECT snapshot_id,collection_name,document_id,change_type,observed_revision,'+
   ' source_commit_verified,needs_reconciliation FROM qa_windows_probe_v1.source_signals'+
   ' WHERE event_id=$1 FOR SHARE',[e.eventId])).rows?.[0];
  if(!receipt||receipt.snapshot_id!==e.snapshotId||
     receipt.collection_name!==e.collection||receipt.document_id!==e.documentId||
     receipt.change_type!==e.changeType||receipt.observed_revision!==e.observedRevision||
     receipt.source_commit_verified!==false||receipt.needs_reconciliation!==true)
   bad('qa_candidate_metadata_signal_mismatch');
  const fields=[e.eventId,e.snapshotId,e.collection,e.documentId,
    e.observedRevision,JSON.stringify(e.documentJson),e.hash];
  const inserted=(await client.query(
   'INSERT INTO qa_windows_probe_v1.verified_source_candidates'+
   ' (event_id,snapshot_id,collection_name,document_id,observed_revision,'+
   ' document_json,content_hash) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)'+
   ' ON CONFLICT (event_id) DO NOTHING RETURNING event_id',fields)).rows||[];
  if(inserted.length===0){
   const prior=(await client.query(
    'SELECT snapshot_id,collection_name,document_id,observed_revision,'+
    ' content_hash,(document_json = $2::jsonb) AS payload_equal,'+
    ' promotion_status,source_continuity_verified,failover_eligible'+
    ' FROM qa_windows_probe_v1.verified_source_candidates WHERE event_id=$1',
    [e.eventId,JSON.stringify(e.documentJson)])).rows?.[0];
   if(!prior||prior.snapshot_id!==e.snapshotId||
      prior.collection_name!==e.collection||prior.document_id!==e.documentId||
      prior.observed_revision!==e.observedRevision||prior.content_hash!==e.hash||
      prior.payload_equal!==true||prior.promotion_status!=='review_required'||
      prior.source_continuity_verified!==false||prior.failover_eligible!==false)
    bad('qa_candidate_idempotency_conflict');
  }
  await client.query('COMMIT');tx=false;
  return Object.freeze({staged:true,replay:inserted.length===0,
   verifiedPointRead:true,sourceContinuityCertified:false,
   failoverReady:false,standbyWritesEnabled:false,
   reconciliationRequired:true});
 }catch(error){
  if(tx)await client.query('ROLLBACK').catch(()=>{});
  throw error;
 }finally{client.release();}
}
