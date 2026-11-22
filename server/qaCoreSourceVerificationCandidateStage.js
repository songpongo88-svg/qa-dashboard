// Isolated PostgreSQL 17 STAGING ONLY, intentionally not a production gateway.
// Requires two separate trusted server attestations and stores a review-only
// source candidate. No Firestore requests, schedules, credentials or sender.
// Never marks change_outbox ready, confirmed, delivered or failover-eligible.
import {normalizeQaCoreIntent} from './qaCorePrivateOutbox.js';
import {qaCanonicalDocumentHash} from './qaLiveMirrorStage.js';
const PROJECT='qa-dashboard-b0b5d';
const FAIL=code=>{throw Object.assign(new Error(code),{code});};
const REV=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{6})Z$/;
function validRevision(value){
 const m=typeof value==='string'?REV.exec(value):null;
 if(!m)return false;
 const epoch=Date.parse(m[1]+'Z');
 return Number.isFinite(epoch)&&new Date(epoch).toISOString().slice(0,19)===m[1];
}
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=x=>qaCanonicalDocumentHash(x);
export async function stageQaCoreSourceVerificationCandidate({
 pool,event,attestServerCommit,readIndependentSource,
 env=process.env,
}={}){
 if(env.QA_CORE_SOURCE_VERIFICATION_STAGE!=='1'||
    env.QA_CORE_PRIVATE_OUTBOX_STAGING!=='1'||
    env.QA_FAILOVER!=='OFF'||env.QA_PG_ISOLATED_TEST!=='1'||
    typeof pool?.connect!=='function'||typeof pool?.query!=='function'||
    typeof attestServerCommit!=='function'||
    typeof readIndependentSource!=='function')
  FAIL('qa_source_candidate_disabled');
 const e=normalizeQaCoreIntent(event);
 // Without an authoritative deletion revision the system cannot safely
 // create a tombstone from an observed missing document.
 if(e.operation!=='upsert')FAIL('qa_source_candidate_delete_not_verified');
 const db=(await pool.query('SELECT current_database() AS db')).rows?.[0]?.db;
 if(db!=='qa_cutover_ci_test')FAIL('qa_source_candidate_isolated_database_required');
 // Both callbacks are injected only by disposable tests at this stage.
 // NEVER attach them to a browser route. String "authority" is not security.
 const commit=await attestServerCommit(Object.freeze({
  projectId:PROJECT,operationId:e.operationId,documentPath:e.documentPath,
  payloadHash:e.payloadHash,
 }));
 if(!commit||commit.authority!=='qa-core-internal-firestore-commit'||
   commit.projectId!==PROJECT||commit.operationId!==e.operationId||
   commit.documentPath!==e.documentPath||
   commit.payloadHash!==e.payloadHash||
   commit.authenticatedServerWrite!==true||
   commit.serverAuthorizationEnforced!==true||
   commit.writePreconditionVerified!==true||
   commit.commitAcknowledged!==true||
   !validRevision(commit.updateTime))
  FAIL('qa_source_candidate_trusted_commit_missing');
 const source=await readIndependentSource(Object.freeze({
  projectId:PROJECT,operationId:e.operationId,documentPath:e.documentPath,
  expectedUpdateTime:commit.updateTime,
 }));
 const expectedName='projects/'+PROJECT+'/databases/(default)/documents/'+e.documentPath;
 const src=source?.documentJson;
 if(source?.authority!=='qa-core-independent-server-source-read'||
    source.projectId!==PROJECT||source.documentPath!==e.documentPath||
    source.authenticatedServerRead!==true||
    source.readBudgetReserved!==true||
    source.sourceReadVerified!==true||
    !object(src)||src.name!==expectedName||
    !object(src.fields)||src.updateTime!==commit.updateTime||
    !validRevision(src.updateTime))
  FAIL('qa_source_candidate_independent_read_missing');
 // The entire Firestore typed fields map must match the intended fields.
 // This deliberately fails closed on merge writes, serverTimestamp transforms
 // or an intervening write; it does not guess source completion.
 const expectedFieldsHash=exact({fields:e.documentJson.fields});
 if(exact({fields:src.fields})!==expectedFieldsHash)
  FAIL('qa_source_candidate_source_fields_differ');
 const stored=Object.freeze({
  fields:src.fields,createTime:src.createTime||null,updateTime:src.updateTime,
 });
 const contentHash=exact(stored);
 const client=await pool.connect();let tx=false;
 try{
  const localDb=(await client.query('SELECT current_database() AS db')).rows?.[0]?.db;
  if(localDb!=='qa_cutover_ci_test')
   FAIL('qa_source_candidate_wrong_transaction_database');
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');tx=true;
  await client.query("SET LOCAL lock_timeout='3s'");
  const priorIntent=(await client.query(
   'SELECT collection_name,document_path,operation,document_json,payload_sha256,'+
   ' source_state,delivery_state FROM qa_core_replication_stage.change_outbox'+
   ' WHERE operation_id=$1 FOR UPDATE',[e.operationId])).rows?.[0];
  if(!priorIntent||priorIntent.collection_name!==e.collection||
     priorIntent.document_path!==e.documentPath||
     priorIntent.operation!=='upsert'||
     priorIntent.payload_sha256!==e.payloadHash||
     !object(priorIntent.document_json)||
     exact(priorIntent.document_json)!==e.payloadHash||
     priorIntent.source_state!=='pending'||
     priorIntent.delivery_state!=='waiting')
   FAIL('qa_source_candidate_intent_not_pending');
  const params=[e.operationId,PROJECT,e.collection,e.documentPath,
   commit.updateTime,JSON.stringify(stored),expectedFieldsHash,contentHash];
  const inserted=(await client.query(
   'INSERT INTO qa_core_replication_stage.source_verification_candidates'+
   ' (operation_id,project_id,collection_name,document_path,observed_revision,'+
   ' document_json,field_hash,document_hash)'+
   ' VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)'+
   ' ON CONFLICT (operation_id) DO NOTHING RETURNING operation_id',params)).rows||[];
  if(inserted.length===0){
   const previous=(await client.query(
    'SELECT project_id,collection_name,document_path,observed_revision,'+
    ' field_hash,document_hash,review_status,delivery_eligible,'+
    ' source_continuity_certified,(document_json=$2::jsonb) AS identical'+
    ' FROM qa_core_replication_stage.source_verification_candidates'+
    ' WHERE operation_id=$1',[e.operationId,JSON.stringify(stored)])).rows?.[0];
   if(!previous||previous.project_id!==PROJECT||
      previous.collection_name!==e.collection||
      previous.document_path!==e.documentPath||
      previous.observed_revision!==commit.updateTime||
      previous.field_hash!==expectedFieldsHash||
      previous.document_hash!==contentHash||
      previous.identical!==true||
      previous.review_status!=='review_required'||
      previous.delivery_eligible!==false||
      previous.source_continuity_certified!==false)
    FAIL('qa_source_candidate_replay_conflict');
  }
  await client.query('COMMIT');tx=false;
  return Object.freeze({
   status:'SOURCE_READ_PROOF_STAGED_REVIEW_REQUIRED',
   replay:inserted.length===0,sourceCommitClaimChecked:true,
   independentDocumentChecked:true,
   sourceConfirmed:false,sourceContinuityCertified:false,
   deliveryEligible:false,delivered:false,failoverReady:false,
  });
 }catch(error){
  if(tx)await client.query('ROLLBACK').catch(()=>{});
  throw error;
 }finally{client.release();}
}
