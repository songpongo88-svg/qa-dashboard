// QA Windows signed replay receiver LAB: no network, server, scheduler,
// real Windows writes, real Firestore or source-commit claims.
// Isolated qa_cutover_ci_test PostgreSQL 17 ONLY. A signed envelope from
// a fixture is NOT evidence that Firestore committed a mutation.
import {createHash,createPublicKey,verify} from 'node:crypto';
import {QA_SYNC_DATASETS,qaCanonicalDocumentHash}
 from './qaLiveMirrorStage.js';
const PROJECT='qa-dashboard-b0b5d';
const STREAM=/^[A-Za-z0-9_.:-]{12,128}$/;
const OP_ID=/^[A-Za-z0-9_.:@-]{16,180}$/;
const DOC=/^[^\x00-\x1f\x7f/]{1,900}$/;
const HASH=/^[0-9a-f]{64}$/;
const REV=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{6})Z$/;
const SIG=/^[A-Za-z0-9+/]{86}==$/;
const MESSAGE_PREFIX='QA-WINDOWS-REVIEW-ONLY-ENVELOPE-V1\n';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 Object.getPrototypeOf(x)===Object.prototype;
function checkRevision(value){
 const m=typeof value==='string'?REV.exec(value):null;
 if(!m)fail('qa_receiver_invalid_revision');
 const parsed=Date.parse(m[1]+'Z');
 if(!Number.isFinite(parsed)||new Date(parsed).toISOString().slice(0,19)!==m[1])
  fail('qa_receiver_invalid_revision');
}
export function normalizeQaWindowsSignedEnvelope(raw){
 const required=['version','projectId','streamId','sequence','operationId',
  'collection','documentId','operation','sourceRevision','documentJson','payloadHash'];
 if(!plain(raw)||Object.keys(raw).length!==required.length||
    required.some(k=>!Object.hasOwn(raw,k)))
  fail('qa_receiver_invalid_envelope');
 if(raw.version!=='qa-windows-review-envelope-v1'||raw.projectId!==PROJECT||
   !STREAM.test(raw.streamId||'')||
   !Number.isSafeInteger(raw.sequence)||raw.sequence<1||raw.sequence>1e12||
   !OP_ID.test(raw.operationId||'')||
   !QA_SYNC_DATASETS.includes(raw.collection)||!DOC.test(raw.documentId||'')||
   raw.operation!=='upsert')
  fail('qa_receiver_untrusted_identity');
 checkRevision(raw.sourceRevision);
 if(!plain(raw.documentJson)||!plain(raw.documentJson.fields)||
    raw.documentJson.updateTime!==raw.sourceRevision)
  fail('qa_receiver_document_revision_mismatch');
 if(!HASH.test(raw.payloadHash||'')||
    qaCanonicalDocumentHash(raw.documentJson)!==raw.payloadHash)
  fail('qa_receiver_document_hash_mismatch');
 if(Buffer.byteLength(JSON.stringify(raw),'utf8')>512*1024)
  fail('qa_receiver_envelope_too_large');
 // Return the normalized canonical shape; disallow unsigned extra keys.
 return Object.freeze({...raw});
}
export const qaWindowsEnvelopeMessage=envelope=>{
 const e=normalizeQaWindowsSignedEnvelope(envelope);
 return Buffer.from(MESSAGE_PREFIX+qaCanonicalDocumentHash(e),'utf8');
};
export async function receiveQaWindowsSignedReviewEvent({
 pool,envelope,signatureBase64,trustedPublicKeyPem,env=process.env,
}={}){
 if(env.QA_WINDOWS_RECEIVER_LAB!=='1'||env.QA_PG_ISOLATED_TEST!=='1'||
    env.QA_FAILOVER!=='OFF'||typeof pool?.connect!=='function')
  fail('qa_receiver_lab_disabled');
 const e=normalizeQaWindowsSignedEnvelope(envelope);
 if(typeof trustedPublicKeyPem!=='string'||trustedPublicKeyPem.length>10000||
    typeof env.QA_WINDOWS_STAGE_SIGNER_SPKI_SHA256!=='string'||
    !HASH.test(env.QA_WINDOWS_STAGE_SIGNER_SPKI_SHA256)||
    typeof signatureBase64!=='string'||!SIG.test(signatureBase64))
  fail('qa_receiver_signature_missing_or_invalid');
 let pubKey,spki;
 try{
  pubKey=createPublicKey(trustedPublicKeyPem);
  if(pubKey.asymmetricKeyType!=='ed25519')
   fail('qa_receiver_key_not_ed25519');
  spki=pubKey.export({type:'spki',format:'der'});
 }catch{fail('qa_receiver_untrusted_public_key');}
 const fingerprint=createHash('sha256').update(spki).digest('hex');
 if(fingerprint!==env.QA_WINDOWS_STAGE_SIGNER_SPKI_SHA256)
  fail('qa_receiver_signer_not_pinned');
 const envelopeHash=qaCanonicalDocumentHash(e);
 const bytes=Buffer.from(signatureBase64,'base64');
 if(bytes.length!==64||bytes.toString('base64')!==signatureBase64||
    !verify(null,qaWindowsEnvelopeMessage(e),pubKey,bytes))
  fail('qa_receiver_signature_not_verified');
 const c=await pool.connect();
 let tx=false;
 try{
  const database=(await c.query('SELECT current_database() AS db')).rows?.[0]?.db;
  if(database!=='qa_cutover_ci_test')
   fail('qa_receiver_disposable_database_only');
  // The per-stream cursor row lock provides deterministic sequential
  // admission across concurrent duplicate deliveries (no serializable
  // retries that might themselves be interpreted as a second event).
  await c.query('BEGIN ISOLATION LEVEL READ COMMITTED');tx=true;
  await c.query("SET LOCAL lock_timeout='3s'");
  // One cursor per stream, protected by row lock across the entire append.
  await c.query('INSERT INTO qa_windows_receiver_lab.stream_cursor'+
   ' (stream_id,signer_spki_sha256) VALUES ($1,$2)'+
   ' ON CONFLICT (stream_id) DO NOTHING',[e.streamId,fingerprint]);
  const cursor=(await c.query(
   'SELECT last_sequence,signer_spki_sha256 FROM qa_windows_receiver_lab.stream_cursor'+
   ' WHERE stream_id=$1 FOR UPDATE',[e.streamId])).rows?.[0];
  if(!cursor||cursor.signer_spki_sha256!==fingerprint||
    !Number.isSafeInteger(Number(cursor.last_sequence)))
   fail('qa_receiver_stream_key_mismatch');
  const last=Number(cursor.last_sequence);
  if(e.sequence<=last){
   const old=(await c.query(
    'SELECT operation_id,envelope_sha256,payload_sha256,signer_spki_sha256,'+
    ' review_status,delivery_eligible,source_continuity_verified,failover_eligible'+
    ' FROM qa_windows_receiver_lab.inbox WHERE stream_id=$1 AND sequence=$2',
    [e.streamId,e.sequence])).rows?.[0];
   if(!old||old.operation_id!==e.operationId||
      old.envelope_sha256!==envelopeHash||
      old.payload_sha256!==e.payloadHash||
      old.signer_spki_sha256!==fingerprint||
      old.review_status!=='review_required'||old.delivery_eligible!==false||
      old.source_continuity_verified!==false||old.failover_eligible!==false)
    fail('qa_receiver_replay_collision');
   await c.query('COMMIT');tx=false;
   return Object.freeze({status:'DUPLICATE_REVIEW_EVENT_NO_CHANGE',
    replay:true,stored:false,sourceContinuityVerified:false,
    deliveryEligible:false,failoverReady:false});
  }
  if(e.sequence!==last+1)
   fail('qa_receiver_sequence_gap_requires_reconciliation');
  // Only upserts may be staged: a missing document is NOT a source
  // tombstone and must never be converted into an inferred deletion.
  const previous=(await c.query(
   'SELECT observed_revision FROM qa_windows_receiver_lab.inbox'+
   ' WHERE stream_id=$1 AND document_path=$2 ORDER BY sequence DESC LIMIT 1',
   [e.streamId,e.collection+'/'+e.documentId])).rows?.[0];
  if(previous&&previous.observed_revision>=e.sourceRevision)
   fail('qa_receiver_stale_document_revision');
  await c.query('INSERT INTO qa_windows_receiver_lab.inbox'+
   ' (stream_id,sequence,operation_id,collection_name,document_path,'+
   ' operation,observed_revision,document_json,payload_sha256,'+
   ' envelope_sha256,signer_spki_sha256)'+
   ' VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)',
   [e.streamId,e.sequence,e.operationId,e.collection,
    e.collection+'/'+e.documentId,e.operation,e.sourceRevision,
    JSON.stringify(e.documentJson),e.payloadHash,envelopeHash,fingerprint]);
  const advanced=(await c.query(
   'UPDATE qa_windows_receiver_lab.stream_cursor'+
   ' SET last_sequence=$2,updated_at=now()'+
   ' WHERE stream_id=$1 AND last_sequence=$3 RETURNING last_sequence',
   [e.streamId,e.sequence,last])).rows||[];
  if(advanced.length!==1)
   fail('qa_receiver_cursor_race');
  await c.query('COMMIT');tx=false;
  return Object.freeze({status:'SIGNED_REVIEW_EVENT_STAGED',
   replay:false,stored:true,sourceContinuityVerified:false,
   deliveryEligible:false,failoverReady:false});
 }catch(error){
  if(tx)await c.query('ROLLBACK').catch(()=>{});
  throw error;
 }finally{c.release();}
}
