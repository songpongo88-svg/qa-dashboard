// QA Core -> Windows signed review sender LAB. NO external network,
// scheduler, browser entrypoint, live Firestore, real Windows receiver or
// production database connection. A source review candidate is not an
// authoritative committed Firestore event; delivery remains forbidden.
import {createHash,createPublicKey,sign,verify}
 from 'node:crypto';
import {qaCanonicalDocumentHash} from './qaLiveMirrorStage.js';
import {normalizeQaWindowsSignedEnvelope,qaWindowsEnvelopeMessage}
 from './qaWindowsSignedReplayReceiverLab.js';
const PROJECT='qa-dashboard-b0b5d';
const OP=/^[A-Za-z0-9_.:@-]{16,180}$/;
const STREAM=/^[A-Za-z0-9_.:-]{12,128}$/;
const HASH=/^[0-9a-f]{64}$/;
const fail=code=>{throw Object.assign(new Error(code),{code});};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function fingerprintFor(key){
 if(key?.type!=='private'||key.asymmetricKeyType!=='ed25519')
  fail('qa_sender_private_signing_key_required');
 const pub=createPublicKey(key);
 return {
  pub,fingerprint:createHash('sha256')
   .update(pub.export({type:'spki',format:'der'})).digest('hex'),
 };
}
function verifiedCandidate(r,e){
 if(!r||r.project_id!==PROJECT||r.operation_id!==e.operationId||
    r.collection_name!==e.collection||r.document_path!==e.documentPath||
    r.operation!=='upsert'||r.source_state!=='pending'||
    r.delivery_state!=='waiting'||
    r.review_status!=='review_required'||
    r.delivery_eligible!==false||r.source_continuity_certified!==false||
    typeof r.observed_revision!=='string'||!object(r.document_json)||
    !object(r.document_json.fields)||r.document_json.updateTime!==r.observed_revision||
    !HASH.test(r.document_hash||'')||
    qaCanonicalDocumentHash(r.document_json)!==r.document_hash||
    !HASH.test(r.field_hash||'')||
    qaCanonicalDocumentHash({fields:r.document_json.fields})!==r.field_hash)
  fail('qa_sender_candidate_not_review_only_or_corrupt');
}
export async function stageQaCoreSignedReviewEnvelope({
 pool,operationId,streamId,signingKey,env=process.env,
}={}){
 if(env.QA_CORE_SIGNED_REVIEW_SENDER_LAB!=='1'||
    env.QA_PG_ISOLATED_TEST!=='1'||env.QA_FAILOVER!=='OFF'||
    typeof pool?.connect!=='function'||
    !OP.test(operationId||'')||!STREAM.test(streamId||''))
  fail('qa_sender_lab_disabled_or_invalid');
 const {pub,fingerprint}=fingerprintFor(signingKey);
 if(!HASH.test(env.QA_CORE_LAB_SIGNER_SPKI_SHA256||'')||
    env.QA_CORE_LAB_SIGNER_SPKI_SHA256!==fingerprint||
    env.QA_WINDOWS_STAGE_SIGNER_SPKI_SHA256!==fingerprint)
  fail('qa_sender_signer_not_pinned');
 const c=await pool.connect();let tx=false;
 try{
  const db=(await c.query('SELECT current_database() AS db')).rows?.[0]?.db;
  if(db!=='qa_cutover_ci_test')fail('qa_sender_disposable_pg_only');
  await c.query('BEGIN ISOLATION LEVEL READ COMMITTED');tx=true;
  await c.query("SET LOCAL lock_timeout='3s'");
  await c.query(
   'INSERT INTO qa_core_replication_stage.review_sender_lab_streams'+
   ' (stream_id,signer_spki_sha256) VALUES ($1,$2)'+
   ' ON CONFLICT (stream_id) DO NOTHING',[streamId,fingerprint]);
  const cursor=(await c.query(
   'SELECT last_sequence,signer_spki_sha256 FROM'+
   ' qa_core_replication_stage.review_sender_lab_streams'+
   ' WHERE stream_id=$1 FOR UPDATE',[streamId])).rows?.[0];
  if(!cursor||cursor.signer_spki_sha256!==fingerprint||
     !Number.isSafeInteger(Number(cursor.last_sequence)))
   fail('qa_sender_stream_key_changed');
  const proof=(await c.query(
   'SELECT v.operation_id,v.project_id,v.collection_name,'+
   ' v.document_path,v.observed_revision,v.document_json,'+
   ' v.field_hash,v.document_hash,v.review_status,'+
   ' v.delivery_eligible,v.source_continuity_certified,'+
   ' o.operation,o.source_state,o.delivery_state'+
   ' FROM qa_core_replication_stage.source_verification_candidates v'+
   ' INNER JOIN qa_core_replication_stage.change_outbox o'+
   ' ON o.operation_id=v.operation_id'+
   ' WHERE v.operation_id=$1 FOR SHARE OF v,o',[operationId])).rows?.[0];
  if(!proof||typeof proof.document_path!=='string')
   fail('qa_sender_source_candidate_missing');
  const [collection,documentId,...rest]=proof.document_path.split('/');
  if(rest.length||!documentId||collection!==proof.collection_name)
   fail('qa_sender_candidate_path_invalid');
  verifiedCandidate(proof,{operationId,documentPath:proof.document_path,collection});
  const prior=(await c.query(
   'SELECT stream_id,sequence,envelope_json,envelope_sha256,signature_base64,'+
   ' signer_spki_sha256,source_continuity_certified,delivery_authorized,'+
   ' delivery_acknowledged,failover_eligible FROM'+
   ' qa_core_replication_stage.review_sender_lab_outbox'+
   ' WHERE operation_id=$1',[operationId])).rows?.[0];
  if(prior){
   if(prior.stream_id!==streamId||
      prior.signer_spki_sha256!==fingerprint||
      prior.source_continuity_certified!==false||
      prior.delivery_authorized!==false||
      prior.delivery_acknowledged!==false||
      prior.failover_eligible!==false||
      qaCanonicalDocumentHash(prior.envelope_json)!==prior.envelope_sha256||
      prior.envelope_json?.operationId!==operationId||
      prior.envelope_json?.streamId!==streamId||
      prior.envelope_json?.sourceRevision!==proof.observed_revision||
      qaCanonicalDocumentHash(prior.envelope_json?.documentJson)!==proof.document_hash||
      !verify(null,qaWindowsEnvelopeMessage(prior.envelope_json),pub,
       Buffer.from(prior.signature_base64,'base64')))
    fail('qa_sender_replay_mismatch');
   await c.query('COMMIT');tx=false;
   return Object.freeze({status:'SIGNED_REVIEW_ENVELOPE_REPLAY',
    replay:true,envelope:prior.envelope_json,
    signatureBase64:prior.signature_base64,
    sourceContinuityCertified:false,deliveryAuthorized:false,
    deliveryAcknowledged:false,failoverReady:false});
  }
  const sequence=Number(cursor.last_sequence)+1;
  if(!Number.isSafeInteger(sequence)||sequence>1e12)
   fail('qa_sender_sequence_limit');
  const envelope=normalizeQaWindowsSignedEnvelope({
   version:'qa-windows-review-envelope-v1',
   projectId:PROJECT,streamId,sequence,
   operationId,collection,documentId,operation:'upsert',
   sourceRevision:proof.observed_revision,
   documentJson:proof.document_json,payloadHash:proof.document_hash,
  });
  const signatureBase64=sign(null,qaWindowsEnvelopeMessage(envelope),signingKey)
   .toString('base64');
  const digest=qaCanonicalDocumentHash(envelope);
  await c.query(
   'INSERT INTO qa_core_replication_stage.review_sender_lab_outbox'+
   ' (stream_id,sequence,operation_id,document_path,observed_revision,'+
   ' envelope_json,envelope_sha256,signature_base64,signer_spki_sha256)'+
   ' VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)',
   [streamId,sequence,operationId,proof.document_path,
    proof.observed_revision,JSON.stringify(envelope),digest,
    signatureBase64,fingerprint]);
  const progressed=(await c.query(
   'UPDATE qa_core_replication_stage.review_sender_lab_streams'+
   ' SET last_sequence=$2,updated_at=now()'+
   ' WHERE stream_id=$1 AND last_sequence=$3 RETURNING last_sequence',
   [streamId,sequence,sequence-1])).rows||[];
  if(progressed.length!==1)fail('qa_sender_cursor_collision');
  await c.query('COMMIT');tx=false;
  return Object.freeze({status:'SIGNED_REVIEW_ENVELOPE_STAGED',
   replay:false,envelope,signatureBase64,
   sourceContinuityCertified:false,deliveryAuthorized:false,
   deliveryAcknowledged:false,failoverReady:false});
 }catch(e){
  if(tx)await c.query('ROLLBACK').catch(()=>{});
  throw e;
 }finally{c.release();}
}
