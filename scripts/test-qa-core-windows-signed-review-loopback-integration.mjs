// Full in-process QA Core -> Windows signed review loopback, using TWO
// independent connections to disposable PG17. This is NOT a real network
// receiver or source-commit event feed; never connects to Firestore/Windows.
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync} from 'node:crypto';
import pg from 'pg';
import {QA_SYNC_DATASETS,qaCanonicalDocumentHash}
 from '../server/qaLiveMirrorStage.js';
import {stageQaCoreSignedReviewEnvelope}
 from '../server/qaCoreSignedReviewSenderLab.js';
import {receiveQaWindowsSignedReviewEvent}
 from '../server/qaWindowsSignedReplayReceiverLab.js';
import {readFile} from 'node:fs/promises';

if(process.env.QA_PG_ISOLATED_TEST!=='1'||!process.env.QA_TEST_DATABASE_URL)
 throw Error('qa_review_loopback_disposable_pg_only');
const source=new pg.Pool({connectionString:process.env.QA_TEST_DATABASE_URL,max:5});
const windows=new pg.Pool({connectionString:process.env.QA_TEST_DATABASE_URL,max:5});
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const publicPem=publicKey.export({format:'pem',type:'spki'}).toString();
const fingerprint=createHash('sha256').update(
 publicKey.export({format:'der',type:'spki'})).digest('hex');
const streamId='qa-fixture-reviewed-loopback-20261120';
const env={QA_CORE_SIGNED_REVIEW_SENDER_LAB:'1',
 QA_WINDOWS_RECEIVER_LAB:'1',QA_PG_ISOLATED_TEST:'1',
 QA_FAILOVER:'OFF',QA_CORE_LAB_SIGNER_SPKI_SHA256:fingerprint,
 QA_WINDOWS_STAGE_SIGNER_SPKI_SHA256:fingerprint};
const send=operationId=>stageQaCoreSignedReviewEnvelope({
 pool:source,operationId,streamId,signingKey:privateKey,env});
const receive=packet=>receiveQaWindowsSignedReviewEvent({
 pool:windows,envelope:packet.envelope,
 signatureBase64:packet.signatureBase64,
 trustedPublicKeyPem:publicPem,env});
const outbox='qa_core_replication_stage.change_outbox';
const candidates='qa_core_replication_stage.source_verification_candidates';
const sender='qa_core_replication_stage.review_sender_lab_outbox';
const receiver='qa_windows_receiver_lab.inbox';
const items=QA_SYNC_DATASETS.map((collection,i)=>{
 const documentId='QA_LAB_'+String(i+1).padStart(3,'0');
 const documentPath=collection+'/'+documentId;
 const rev='2026-11-20T08:51:'+String(i+1).padStart(2,'0')+'.123456Z';
 const fields={testCase:{stringValue:'synthetic-only'},
  ordinal:{integerValue:String(i+1)}};
 const intent={fields};
 const doc={fields,updateTime:rev,createTime:'2026-11-20T08:00:00Z'};
 return{collection,documentId,documentPath,rev,fields,
  operationId:'qa-cross-boundary-op-20261120-'+String(i+1).padStart(3,'0'),
  intent,doc};
});
async function persistSyntheticCandidate(item){
 const hash=qaCanonicalDocumentHash(item.intent);
 await source.query(
  'INSERT INTO '+outbox+
  ' (operation_id,collection_name,document_path,operation,document_json,payload_sha256)'+
  " VALUES ($1,$2,$3,'upsert',$4::jsonb,$5)",
  [item.operationId,item.collection,item.documentPath,
   JSON.stringify(item.intent),hash]);
 await source.query(
  'INSERT INTO '+candidates+
  ' (operation_id,project_id,collection_name,document_path,'+
  ' observed_revision,document_json,field_hash,document_hash)'+
  " VALUES ($1,'qa-dashboard-b0b5d',$2,$3,$4,$5::jsonb,$6,$7)",
  [item.operationId,item.collection,item.documentPath,item.rev,
   JSON.stringify(item.doc),qaCanonicalDocumentHash({fields:item.fields}),
   qaCanonicalDocumentHash(item.doc)]);
}
try{
 for(const pool of [source,windows]){
  const r=(await pool.query('SELECT current_database() AS db')).rows[0];
  assert.equal(r.db,'qa_cutover_ci_test');
 }
 const sql=await readFile(new URL(
  '../migration/qa-core-signed-review-sender-lab.sql',import.meta.url),'utf8');
 await source.query(sql);
 const first=items[0];
 await assert.rejects(send(first.operationId),
  /qa_sender_source_candidate_missing/);
 await assert.rejects(stageQaCoreSignedReviewEnvelope({
  pool:source,operationId:first.operationId,streamId,
  signingKey:privateKey,env:{...env,QA_FAILOVER:'ON'}}),
  /qa_sender_lab_disabled_or_invalid/);
 await assert.rejects(stageQaCoreSignedReviewEnvelope({
  pool:source,operationId:first.operationId,streamId,
  signingKey:privateKey,
  env:{...env,QA_CORE_LAB_SIGNER_SPKI_SHA256:'a'.repeat(64)}}),
  /qa_sender_signer_not_pinned/);
 assert.equal((await source.query('SELECT count(*)::int AS n FROM '+sender)).rows[0].n,0);
 for(const item of items)await persistSyntheticCandidate(item);

 // Two concurrent sends of the same ID produce one durable sequence.
 const same=await Promise.all([send(first.operationId),send(first.operationId)]);
 assert.deepEqual(same.map(r=>r.replay).sort(),[false,true]);
 const firstPacket=same.find(x=>!x.replay);
 assert.equal(firstPacket.envelope.sequence,1);
 assert.ok(same.every(x=>!x.deliveryAuthorized&&!x.deliveryAcknowledged&&!x.failoverReady));
 assert.equal((await windows.query('SELECT count(*)::int AS n FROM '+receiver)).rows[0].n,3);
 // Earlier receiver fixture saved 3 unrelated rows; no stream-scoped data yet.
 assert.equal((await windows.query('SELECT count(*)::int AS n FROM '+receiver+
  ' WHERE stream_id=$1',[streamId])).rows[0].n,0);
 assert.equal((await receive(firstPacket)).status,'SIGNED_REVIEW_EVENT_STAGED');

 // Stage the remaining QA collection envelopes but drop the supposed
 // outbound delivery: the sender journal must preserve sequence and bytes.
 const packets=[firstPacket];
 for(let i=1;i<items.length;i++){
  packets.push(await send(items[i].operationId));
  assert.equal(packets[i].envelope.sequence,i+1);
 }
 const persisted=(await source.query(
  'SELECT count(*)::int AS n FROM '+sender+' WHERE stream_id=$1',
  [streamId])).rows[0].n;
 assert.equal(persisted,11);
 const sourceCursor=(await source.query(
  'SELECT last_sequence FROM qa_core_replication_stage.review_sender_lab_streams'+
  ' WHERE stream_id=$1',[streamId])).rows[0];
 assert.equal(Number(sourceCursor.last_sequence),11);
 assert.equal((await receive(packets[0])).status,'DUPLICATE_REVIEW_EVENT_NO_CHANGE');
 await assert.rejects(receive(packets[2]),/qa_receiver_sequence_gap_requires_reconciliation/);
 assert.equal(Number((await windows.query(
  'SELECT last_sequence FROM qa_windows_receiver_lab.stream_cursor'+
  ' WHERE stream_id=$1',[streamId])).rows[0].last_sequence),1);
 // Simulate restart/retransmit of an unacknowledged source packet: no
 // source revision changes and no new sequence is allocated.
 const restarted=await send(items[1].operationId);
 assert.equal(restarted.replay,true);
 assert.deepEqual(restarted.envelope,packets[1].envelope);
 assert.equal(restarted.signatureBase64,packets[1].signatureBase64);
 await assert.rejects(receive({...packets[1],
  envelope:{...packets[1].envelope,sourceRevision:'2026-11-20T08:59:00.123456Z'}}),
  /qa_receiver_document_revision_mismatch/);
 for(let i=1;i<packets.length;i++){
  const ack=await receive(packets[i]);
  assert.equal(ack.status,'SIGNED_REVIEW_EVENT_STAGED');
  assert.equal(ack.failoverReady,false);
 }
 const dup=await receive(packets[10]);
 assert.equal(dup.status,'DUPLICATE_REVIEW_EVENT_NO_CHANGE');
 const inboxRows=(await windows.query(
  'SELECT sequence,collection_name,review_status,'+
  ' delivery_eligible,source_continuity_verified,failover_eligible'+
  ' FROM '+receiver+' WHERE stream_id=$1 ORDER BY sequence',
  [streamId])).rows;
 assert.deepEqual(inboxRows.map(r=>r.collection_name),QA_SYNC_DATASETS);
 assert.deepEqual(inboxRows.map(r=>Number(r.sequence)),
  QA_SYNC_DATASETS.map((_,i)=>i+1));
 assert.ok(inboxRows.every(r=>r.review_status==='review_required'&&
  r.delivery_eligible===false&&r.source_continuity_verified===false&&
  r.failover_eligible===false));
 const senderRows=(await source.query('SELECT delivery_authorized,'+
  ' delivery_acknowledged,source_continuity_certified,failover_eligible'+
  ' FROM '+sender+' WHERE stream_id=$1',[streamId])).rows;
 assert.equal(senderRows.length,11);
 assert.ok(senderRows.every(r=>r.delivery_authorized===false&&
  r.delivery_acknowledged===false&&r.source_continuity_certified===false&&
  r.failover_eligible===false));
 const statuses=(await source.query(
  'SELECT source_state,delivery_state FROM '+outbox+
  ' WHERE operation_id=ANY($1::text[])',[items.map(x=>x.operationId)])).rows;
 assert.equal(statuses.length,11);
 assert.ok(statuses.every(r=>r.source_state==='pending'&&r.delivery_state==='waiting'));
 await assert.rejects(send(items[0].operationId+'-missing'),
  /qa_sender_source_candidate_missing/);
 await assert.rejects(stageQaCoreSignedReviewEnvelope({
  pool:source,operationId:items[0].operationId,
  streamId:'qa-different-stream-20261120',
  signingKey:privateKey,env,
 }),/qa_sender_replay_mismatch/);
 // Uncertain source commits may not be signed, even if a review-only
 // document candidate already exists in the synthetic lab.
 const blocked={...items[0],operationId:'qa-cross-boundary-blocked-20261120'};
 await persistSyntheticCandidate(blocked);
 await source.query(
  'UPDATE '+outbox+" SET source_state='needs_reconcile',delivery_state='blocked'"+
  ' WHERE operation_id=$1',[blocked.operationId]);
 await assert.rejects(send(blocked.operationId),
  /qa_sender_candidate_not_review_only_or_corrupt/);
 await assert.rejects(source.query('UPDATE '+sender+
  ' SET delivery_acknowledged=true WHERE stream_id=$1',[streamId]),
  e=>e.code==='23514');
 await assert.rejects(windows.query('UPDATE '+receiver+
  ' SET failover_eligible=true WHERE stream_id=$1',[streamId]),
  e=>e.code==='23514');
 assert.equal((await source.query('SELECT count(*)::int AS n FROM '+sender+
  ' WHERE stream_id=$1',[streamId])).rows[0].n,11);
 console.log('PASS QA Core-to-Windows review-only loopback PG17: all 11 datasets, durable signing spool, lost/reordered replay, blocked uncertain source, zero real Firestore reads');
}finally{await Promise.allSettled([source.end(),windows.end()]);}
