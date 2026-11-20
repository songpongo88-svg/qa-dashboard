// Disposable PostgreSQL 17 fixture: no production, Windows credentials,
// Firestore requests, Cloudflare sender or switch to standby.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {qaCanonicalDocumentHash} from '../server/qaLiveMirrorStage.js';
import {stageQaWindowsVerifiedSourceCandidate}
 from '../server/qaWindowsVerifiedCandidateJournal.js';
if(process.env.QA_PG_ISOLATED_TEST!=='1'||!process.env.QA_TEST_DATABASE_URL)
 throw Error('isolated_candidate_test_only');
const pool=new pg.Pool({connectionString:process.env.QA_TEST_DATABASE_URL,max:3});
const snapshotId='qa-candidate-test-20261120';
const eventId='qa-candidate-test-event-000001';
const rev='2026-11-20T02:12:03.123456Z';
const data={fields:{finalScore:{integerValue:'85'}},
 createTime:'2026-11-20T02:00:00Z',updateTime:rev};
const hash=qaCanonicalDocumentHash(data);
const signal={snapshotId,eventId,collection:'qa_evaluations',documentId:'AA000001',
 changeType:'modified',observedRevision:rev};
const verified={verifiedDocument:true,requiresReconciliation:false,
 canDeliver:false,sourceContinuityCertified:false,
 projectId:'qa-dashboard-b0b5d',collection:signal.collection,
 documentId:signal.documentId,observedRevision:rev,documentJson:data,hash};
const env={QA_WINDOWS_VERIFIED_CANDIDATE_STAGE:'1',QA_FAILOVER:'OFF',
 QA_PG_ISOLATED_TEST:'1'};
const attestSourceRead=async e=>({...e,authority:'qa-local-server-budgeted-document-reader',
 projectId:'qa-dashboard-b0b5d',credentialAttested:true,
 readBudgetReserved:true,documentReadVerified:true});
const call=(overrides={})=>stageQaWindowsVerifiedSourceCandidate({
 pool,signal,verified,env,attestSourceRead,...overrides});
try{
 assert.equal((await pool.query('SELECT current_database() AS db')).rows[0].db,
  'qa_cutover_ci_test');
 await pool.query('CREATE SCHEMA qa_failover_v1');
 await pool.query('CREATE TABLE qa_failover_v1.live_snapshot_batches'+
  '(snapshot_id text primary key,status text,approved_for_failover boolean)');
 await pool.query('CREATE TABLE qa_failover_v1.state'+
  '(id int primary key,mode text,write_frozen boolean,'+
  ' source_snapshot_verified boolean,active_snapshot_id text)');
 await pool.query('INSERT INTO qa_failover_v1.live_snapshot_batches'+
  " VALUES ($1,'copy_verified',false)",[snapshotId]);
 await pool.query('INSERT INTO qa_failover_v1.state VALUES'+
  "(1,'disabled',true,false,$1)",[snapshotId]);
 await pool.query(await readFile(new URL(
  '../migration/qa-windows-source-signal-stage.sql',import.meta.url),'utf8'));
 await pool.query(await readFile(new URL(
  '../migration/qa-windows-verified-source-candidate-stage.sql',import.meta.url),'utf8'));
 await pool.query('INSERT INTO qa_windows_probe_v1.source_signals'+
  '(event_id,snapshot_id,collection_name,document_id,change_type,observed_revision)'+
  'VALUES ($1,$2,$3,$4,$5,$6)',
  [eventId,snapshotId,signal.collection,signal.documentId,signal.changeType,rev]);
 await assert.rejects(call({env:{...env,QA_WINDOWS_VERIFIED_CANDIDATE_STAGE:'0'}}),
  /qa_candidate_private_stage_disabled/);
 await assert.rejects(call({signal:{...signal,changeType:'removed'}}),
  /qa_candidate_signal_requires_verified_upsert/);
 await assert.rejects(call({verified:{...verified,hash:'f'.repeat(64)}}),
  /qa_candidate_source_hash_mismatch/);
 await assert.rejects(call({attestSourceRead:async()=>({authority:'browser'})}),
  /qa_candidate_trusted_source_attestation_missing/);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM'+
  ' qa_windows_probe_v1.verified_source_candidates')).rows[0].n,0);
 const one=await call();
 assert.equal(one.staged,true);assert.equal(one.replay,false);
 assert.equal(one.failoverReady,false);assert.equal(one.standbyWritesEnabled,false);
 assert.equal((await call()).replay,true);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM'+
  ' qa_windows_probe_v1.verified_source_candidates')).rows[0].n,1);
 await assert.rejects(call({verified:{...verified,documentJson:{...data,fields:{
   finalScore:{integerValue:'84'}}},hash}}),/qa_candidate_source_hash_mismatch/);
 await pool.query("UPDATE qa_failover_v1.state SET mode='standby' WHERE id=1");
 await assert.rejects(call(),/qa_candidate_frozen_state_changed/);
 await pool.query("UPDATE qa_failover_v1.state SET mode='disabled' WHERE id=1");
 const existing=(await pool.query('SELECT promotion_status,failover_eligible,'+
   ' source_continuity_verified FROM qa_windows_probe_v1.verified_source_candidates'+
   ' WHERE event_id=$1',[eventId])).rows[0];
 assert.deepEqual(existing,{promotion_status:'review_required',
  failover_eligible:false,source_continuity_verified:false});
 await assert.rejects(pool.query('UPDATE qa_windows_probe_v1.verified_source_candidates'+
  ' SET failover_eligible=true'),e=>e.code==='23514');
 await assert.rejects(pool.query('UPDATE qa_windows_probe_v1.verified_source_candidates'+
  " SET promotion_status='ready'"),e=>e.code==='23514');
 await pool.query('CREATE ROLE qa_ci_verified_candidate_no_access NOLOGIN');
 const access=(await pool.query("SELECT c.relrowsecurity,c.relforcerowsecurity,"+
  " has_schema_privilege('qa_ci_verified_candidate_no_access','qa_windows_probe_v1','USAGE') AS unauth_usage"+
  " FROM pg_class c WHERE c.oid='qa_windows_probe_v1.verified_source_candidates'::regclass")).rows[0];
 assert.equal(access.relrowsecurity,true);
 assert.equal(access.relforcerowsecurity,true);
 assert.equal(access.unauth_usage,false);
 // Public role privileges are already revoked; no production credentials involved.
 console.log('PASS verified point-read candidate stage: source attestation, exact revision, frozen snapshot, idempotency, no promote or writes');
}finally{await pool.end();}
