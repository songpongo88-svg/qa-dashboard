// CI-only signed Windows replay receiver: synthetic QA records, disposable PG17.
// Never accesses Firestore, Windows computer, Supabase or production.
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {qaCanonicalDocumentHash} from '../server/qaLiveMirrorStage.js';
import {receiveQaWindowsSignedReviewEvent,qaWindowsEnvelopeMessage}
 from '../server/qaWindowsSignedReplayReceiverLab.js';
if(process.env.QA_PG_ISOLATED_TEST!=='1'||!process.env.QA_TEST_DATABASE_URL)
 throw Error('qa_disposable_pg17_required');
const pool=new pg.Pool({connectionString:process.env.QA_TEST_DATABASE_URL,max:5});
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const pubPem=publicKey.export({type:'spki',format:'pem'}).toString();
const fingerprint=createHash('sha256')
 .update(publicKey.export({type:'spki',format:'der'})).digest('hex');
const env={QA_WINDOWS_RECEIVER_LAB:'1',QA_PG_ISOLATED_TEST:'1',
 QA_FAILOVER:'OFF',QA_WINDOWS_STAGE_SIGNER_SPKI_SHA256:fingerprint};
const streamId='qa-fixture-stream-20261120';
const mkEvent=(sequence,{docId='AA_SYNTH_0001',
 rev='2026-11-20T08:40:00.123456Z',value='85'}={})=>{
 const documentJson={fields:{finalScore:{integerValue:value}},
  createTime:'2026-11-20T08:00:00Z',updateTime:rev};
 return {version:'qa-windows-review-envelope-v1',
  projectId:'qa-dashboard-b0b5d',streamId,sequence,
  operationId:'qa-lab-event-20261120-'+String(sequence).padStart(4,'0'),
  collection:'qa_evaluations',documentId:docId,operation:'upsert',
  sourceRevision:rev,documentJson,
  payloadHash:qaCanonicalDocumentHash(documentJson)};
};
const run=async(envelope,opts={})=>receiveQaWindowsSignedReviewEvent({
 pool,envelope,signatureBase64:sign(null,qaWindowsEnvelopeMessage(envelope),privateKey).toString('base64'),
 trustedPublicKeyPem:pubPem,env,...opts,
});
const inbox='qa_windows_receiver_lab.inbox';
try{
 assert.equal((await pool.query('SELECT current_database() AS db')).rows[0].db,'qa_cutover_ci_test');
 const sql=await readFile(new URL('../migration/qa-windows-signed-replay-receiver-lab.sql',import.meta.url),'utf8');
 await pool.query(sql);
 const first=mkEvent(1);
 await assert.rejects(run(first,{env:{...env,QA_FAILOVER:'ON'}}),
  /qa_receiver_lab_disabled/);
 await assert.rejects(run({...first,operation:'delete'}),
  /qa_receiver_untrusted_identity/);
 await assert.rejects(run({...first,documentId:'bad/doc'}),
  /qa_receiver_untrusted_identity/);
 await assert.rejects(run({...first,sequence:3.5}),
  /qa_receiver_untrusted_identity/);
 await assert.rejects(run({...first,projectId:'another-project'}),
  /qa_receiver_untrusted_identity/);
 await assert.rejects(run({...first,unexpected:'unsigned'}),
  /qa_receiver_invalid_envelope/);
 await assert.rejects(run({...first,payloadHash:'0'.repeat(64)}),
  /qa_receiver_document_hash_mismatch/);
 const badTimestamp={...first,sourceRevision:'2026-11-20T08:40:00.123Z'};
 await assert.rejects(run(badTimestamp),/qa_receiver_invalid_revision/);
 const bogusSignature=Buffer.alloc(64).toString('base64');
 await assert.rejects(receiveQaWindowsSignedReviewEvent({
  pool,envelope:first,signatureBase64:bogusSignature,
  trustedPublicKeyPem:pubPem,env}),/qa_receiver_signature_not_verified/);
 const impostor=generateKeyPairSync('ed25519');
 await assert.rejects(receiveQaWindowsSignedReviewEvent({
  pool,envelope:first,
  signatureBase64:sign(null,qaWindowsEnvelopeMessage(first),impostor.privateKey).toString('base64'),
  trustedPublicKeyPem:impostor.publicKey.export({type:'spki',format:'pem'}).toString(),
  env}),/qa_receiver_signer_not_pinned/);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM '+inbox)).rows[0].n,0);
 // Two parallel identical deliveries must result in exactly one insert.
 const both=await Promise.all([run(first),run(first)]);
 assert.deepEqual(both.map(x=>x.status).sort(),[
  'DUPLICATE_REVIEW_EVENT_NO_CHANGE','SIGNED_REVIEW_EVENT_STAGED']);
 assert.equal(both.filter(x=>x.stored).length,1);
 assert.ok(both.every(x=>!x.deliveryEligible&&!x.failoverReady&&!x.sourceContinuityVerified));
 const gap=mkEvent(3,{docId:'AA_SYNTH_0003',rev:'2026-11-20T08:43:00.123456Z'});
 await assert.rejects(run(gap),/qa_receiver_sequence_gap_requires_reconciliation/);
 assert.equal((await pool.query('SELECT last_sequence FROM qa_windows_receiver_lab.stream_cursor'+
  ' WHERE stream_id=$1',[streamId])).rows[0].last_sequence,'1');
 const sameSequenceChanged=mkEvent(1,{rev:'2026-11-20T08:41:00.123456Z',value:'90'});
 await assert.rejects(run(sameSequenceChanged),/qa_receiver_replay_collision/);
 const stale=mkEvent(2,{rev:'2026-11-20T08:40:00.123456Z',value:'89'});
 await assert.rejects(run(stale),/qa_receiver_stale_document_revision/);
 const newer=mkEvent(2,{rev:'2026-11-20T08:42:00.123456Z',value:'89'});
 assert.equal((await run(newer)).status,'SIGNED_REVIEW_EVENT_STAGED');
 assert.equal((await run(gap)).status,'SIGNED_REVIEW_EVENT_STAGED');
 assert.equal((await run(gap)).status,'DUPLICATE_REVIEW_EVENT_NO_CHANGE');
 const rows=(await pool.query(
  'SELECT sequence,review_status,source_continuity_verified,'+
  ' delivery_eligible,failover_eligible FROM '+inbox+
  ' WHERE stream_id=$1 ORDER BY sequence',[streamId])).rows;
 assert.equal(rows.length,3);
 assert.deepEqual(rows.map(x=>Number(x.sequence)),[1,2,3]);
 assert.ok(rows.every(x=>x.review_status==='review_required'&&
  x.source_continuity_verified===false&&x.delivery_eligible===false&&
  x.failover_eligible===false));
 const cursor=(await pool.query('SELECT last_sequence FROM qa_windows_receiver_lab.stream_cursor'+
  ' WHERE stream_id=$1',[streamId])).rows[0];
 assert.equal(Number(cursor.last_sequence),3);
 await assert.rejects(pool.query('UPDATE '+inbox+" SET review_status='delivered'"),e=>e.code==='23514');
 await assert.rejects(pool.query('UPDATE '+inbox+' SET delivery_eligible=true'),e=>e.code==='23514');
 await assert.rejects(pool.query('UPDATE '+inbox+' SET failover_eligible=true'),e=>e.code==='23514');
 await pool.query("DO $x$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='qa_receiver_ci_unprivileged') THEN CREATE ROLE qa_receiver_ci_unprivileged NOLOGIN; END IF; END $x$;");
 const access=(await pool.query(
  "SELECT c.relrowsecurity,c.relforcerowsecurity,"+
  " has_schema_privilege('qa_receiver_ci_unprivileged','qa_windows_receiver_lab','USAGE') AS schema_usage,"+
  " has_table_privilege('qa_receiver_ci_unprivileged',c.oid,'SELECT') AS public_table_access"+
  " FROM pg_class c WHERE c.oid=$1::regclass",[inbox])).rows[0];
 assert.equal(access.relrowsecurity,true);
 assert.equal(access.relforcerowsecurity,true);
 assert.equal(access.schema_usage,false);
 assert.equal(access.public_table_access,false);
 console.log('PASS Windows signed replay lab PG17: Ed25519 pinned signer, gap/stale rejection, parallel idempotence, review-only SQL, 0 Firestore requests');
}finally{await pool.end();}
