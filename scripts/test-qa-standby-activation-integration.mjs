import assert from 'node:assert/strict';
import pg from 'pg';
import {activateQaStandbyFromVerifiedSource} from '../server/qaStandbyActivation.js';
if(process.env.QA_PG_ISOLATED_TEST!=='1'||!process.env.QA_TEST_DATABASE_URL)
  throw Error('Disposable PostgreSQL test only');
const pool=new pg.Pool({connectionString:process.env.QA_TEST_DATABASE_URL,max:2});
const denied=code=>e=>e.code===code;
try{
  const db=(await pool.query('SELECT current_database() AS db')).rows?.[0]?.db;
  assert.equal(db,'qa_cutover_ci_test');
  const state=(await pool.query(
    'SELECT active_snapshot_id,mode,write_frozen,source_snapshot_verified,generation'+
    ' FROM qa_failover_v1.state WHERE id=1'
  )).rows[0];
  assert.equal(state.mode,'disabled');
  assert.equal(state.write_frozen,true);
  assert.equal(state.source_snapshot_verified,false);
  const snapshotId=state.active_snapshot_id;
  assert.ok(snapshotId);
  const t=Date.now(),ago=ms=>new Date(t-ms).toISOString(),later=ms=>new Date(t+ms).toISOString();
  await pool.query('UPDATE qa_failover_v1.live_snapshot_batches SET source_exported_at=$2'+
    ' WHERE snapshot_id=$1',[snapshotId,ago(20000)]);
  const mirror={sourceComplete:true,identityHashVerified:true,syncStatus:'validated',
    snapshotId,datasets:['qa_evaluations','qa_appeal_events','qa_signature_documents',
      'qa_user_profiles','qa_role_permissions','qa_user_sessions',
      'qa_user_session_controls','qa_role_definitions','qa_system_settings',
      'qa_signature_library','qa_evaluation_progress'],verifiedAt:ago(20000)};
  const input={serverAuthority:'qa-server-verified',production:true,
    productionApprovedByServer:true,primary:{health:'quota-exhausted',
      verifiedByServer:true,checkedAt:ago(1000),outageStartedAt:ago(10000)},
    mirror,bridge:{databaseConnected:true,readOnly:false,authenticated:true,
      durableIngress:true,checkedAt:ago(1000)},
    identity:{serverAuthenticated:true,role:'Quality Assurance',status:'active',
      username:'qa_fixture',verifiedAt:ago(1000),expiresAt:later(3600000)},
    locks:{verifiedByServer:true,signatureLocked:false,appealHold:false,
      verifiedAt:ago(1000)},
    lease:{owner:'qa-failover-coordinator',approved:true,generation:2,
      grantedAt:ago(1000),expiresAt:later(60000)},
    backlog:{unresolvedConflicts:0},manualDisable:false};
  const call=(trusted=input,env={QA_PG_ISOLATED_TEST:'1',QA_STANDBY_CUTOVER_ENABLED:'1'})=>
    activateQaStandbyFromVerifiedSource({pool,snapshotId,trusted,env});
  await assert.rejects(call(input,{QA_PG_ISOLATED_TEST:'1'}),
    denied('cutover_disabled'));
  await assert.rejects(call({...input,productionApprovedByServer:false}),
    denied('cutover_missing_independent_authority'));
  await assert.rejects(call({...input,primary:{...input.primary,health:'healthy'}}),
    denied('cutover_not_authorized'));
  await assert.rejects(call({...input,mirror:{...mirror,snapshotId:'other-snapshot'}}),
    denied('cutover_missing_independent_authority'));
  const changed='qa_evaluations/fixture-doc-01';
  const original=(await pool.query(
    'SELECT content_hash FROM qa_failover_v1.live_snapshot_rows'+
    ' WHERE snapshot_id=$1 AND document_path=$2',[snapshotId,changed]
  )).rows[0];
  assert.ok(original);
  await pool.query(
    'UPDATE qa_failover_v1.live_snapshot_rows SET content_hash=$3'+
    ' WHERE snapshot_id=$1 AND document_path=$2',
    [snapshotId,changed,'0'.repeat(64)]);
  await assert.rejects(call(),denied('cutover_source_hash_mismatch'));
  assert.equal((await pool.query('SELECT mode FROM qa_failover_v1.state WHERE id=1')).rows[0].mode,'disabled');
  await pool.query(
    'UPDATE qa_failover_v1.live_snapshot_rows SET content_hash=$3'+
    ' WHERE snapshot_id=$1 AND document_path=$2',
    [snapshotId,changed,original.content_hash]);
  const result=await call();
  assert.deepEqual(result,{activated:true,snapshotId,generation:2,evaluations:2,
    domainDocuments:10,sourceDocumentCount:12,
    immutableSourceVerified:true,scoreParityVerified:true});
  const current=(await pool.query(
    'SELECT mode,source_snapshot_verified,write_frozen,generation,active_snapshot_id'+
    ' FROM qa_failover_v1.state WHERE id=1')).rows[0];
  assert.deepEqual(current,{mode:'standby',source_snapshot_verified:true,
    write_frozen:false,generation:'2',active_snapshot_id:snapshotId});
  await assert.rejects(call(),denied('cutover_not_frozen_or_snapshot_changed'));
  assert.equal((await pool.query(
    'SELECT count(*)::int AS n FROM qa_failover_v1.outbox'
  )).rows[0].n,0);
  console.log('PASS QA coordinator: independent outage and lease authorization, complete 11-set source hash+score parity, atomic activation and no historical changes');
}finally{await pool.end();}
