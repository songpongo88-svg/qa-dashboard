// Disposable PostgreSQL 17 integration only. No Windows, Firestore, or Production.
import assert from 'node:assert/strict';
import pg from 'pg';
import {refreshQaInactiveReplica} from '../server/qaStandbyInactiveRefresh.js';
import {auditQaInactiveReplica} from '../server/qaStandbyInactiveAudit.js';

if(process.env.QA_PG_ISOLATED_TEST!=='1'||!process.env.QA_TEST_DATABASE_URL)
  throw Error('QA disposable PostgreSQL test required');
const pool=new pg.Pool({connectionString:process.env.QA_TEST_DATABASE_URL,max:2});
const denied=code=>error=>error.code===code;
const next='qa-refresh-ci-20261113-000001';
try{
  assert.equal((await pool.query('SELECT current_database() AS db')).rows[0].db,
    'qa_cutover_ci_test');
  const previous=await auditQaInactiveReplica(pool);
  assert.equal(previous.inactiveReplicaStaged,true);
  assert.equal(previous.documentCount,12);
  const oldId=(await pool.query(
    'SELECT active_snapshot_id FROM qa_failover_v1.state WHERE id=1'
  )).rows[0].active_snapshot_id;
  assert.ok(oldId);
  const before=(await pool.query('SELECT evaluation_id,record FROM qa_failover_v1.evaluations'+
    ' ORDER BY evaluation_id')).rows;
  const preTime=new Date(Date.now()-30_000).toISOString();
  // Copy an independently verified disposable fixture to a NEW immutable ID.
  await pool.query(
    'INSERT INTO qa_failover_v1.live_snapshot_batches'+
    ' (snapshot_id,source_export_id,source_exported_at,source_provenance,'+
    ' status,source_documents,stored_documents,dataset_manifest,verified_at,approved_for_failover)'+
    ' SELECT $2,source_export_id,$3,source_provenance,status,'+
    ' source_documents,stored_documents,dataset_manifest,now(),false'+
    ' FROM qa_failover_v1.live_snapshot_batches WHERE snapshot_id=$1',
    [oldId,next,preTime]);
  await pool.query(
    'INSERT INTO qa_failover_v1.live_snapshot_rows'+
    ' (snapshot_id,document_path,root_collection,document_json,content_hash)'+
    ' SELECT $2,document_path,root_collection,document_json,content_hash'+
    ' FROM qa_failover_v1.live_snapshot_rows WHERE snapshot_id=$1',[oldId,next]);
  await pool.query(
    'INSERT INTO qa_failover_v1.live_candidate_evaluations'+
    ' (snapshot_id,evaluation_id,record,source_hash,original_score,deleted_at)'+
    ' SELECT $2,evaluation_id,record,source_hash,original_score,deleted_at'+
    ' FROM qa_failover_v1.live_candidate_evaluations WHERE snapshot_id=$1',[oldId,next]);
  await pool.query(
    'INSERT INTO qa_failover_v1.live_candidate_audit'+
    ' (snapshot_id,evaluation_count,eligible_for_failover)'+
    ' SELECT $2,evaluation_count,false'+
    ' FROM qa_failover_v1.live_candidate_audit WHERE snapshot_id=$1',[oldId,next]);
  const sameState=async()=>assert.equal((await pool.query(
    'SELECT active_snapshot_id FROM qa_failover_v1.state WHERE id=1'
  )).rows[0].active_snapshot_id,oldId);
  // Tampering in a candidate must fail before ANY evaluator records change.
  await pool.query('UPDATE qa_failover_v1.live_candidate_evaluations'+
    ' SET original_score=7 WHERE snapshot_id=$1 AND evaluation_id=$2',
    [next,'eval-test-01']);
  await assert.rejects(refreshQaInactiveReplica({pool,snapshotId:next}),
    denied('inactive_refresh_score_or_topic_changed'));
  await sameState();
  assert.equal(Number((await pool.query('SELECT count(*) AS n'+
    ' FROM qa_failover_v1.inactive_domain_seed_audit WHERE snapshot_id=$1',
    [next])).rows[0].n),0);
  await pool.query('UPDATE qa_failover_v1.live_candidate_evaluations'+
    ' SET original_score=85 WHERE snapshot_id=$1 AND evaluation_id=$2',
    [next,'eval-test-01']);
  await pool.query('UPDATE qa_failover_v1.live_snapshot_batches'+
    ' SET source_exported_at=$2 WHERE snapshot_id=$1',
    [next,new Date(Date.now()-3600_000).toISOString()]);
  await assert.rejects(refreshQaInactiveReplica({pool,snapshotId:next}),
    denied('inactive_refresh_snapshot_stale'));
  await sameState();
  await pool.query('UPDATE qa_failover_v1.live_snapshot_batches'+
    ' SET source_exported_at=$2 WHERE snapshot_id=$1',
    [next,new Date(Date.now()-15_000).toISOString()]);
  const done=await refreshQaInactiveReplica({pool,snapshotId:next});
  assert.equal(done.refreshed,true);
  assert.equal(done.snapshotId,next);
  assert.equal(done.previousSnapshotId,oldId);
  assert.equal(done.evaluations,2);
  assert.equal(done.otherDocuments,10);
  assert.equal(done.documents,12);
  assert.equal(done.writeEnabled,false);
  assert.equal(done.failoverReady,false);
  assert.equal(done.firestoreReads,0);
  const after=await auditQaInactiveReplica(pool);
  assert.equal(after.inactiveReplicaStaged,true);
  assert.equal(after.documentCount,12);
  const items=(await pool.query('SELECT evaluation_id,record'+
    ' FROM qa_failover_v1.evaluations ORDER BY evaluation_id')).rows;
  assert.deepEqual(items,before,'preserve exact original scores and topics');
  assert.equal(Number((await pool.query('SELECT count(*) AS n'+
    ' FROM qa_failover_v1.inactive_domain_documents WHERE snapshot_id=$1',
    [oldId])).rows[0].n),10,'retain old immutable domain archive');
  assert.equal(Number((await pool.query('SELECT count(*) AS n'+
    ' FROM qa_failover_v1.inactive_domain_documents WHERE snapshot_id=$1',
    [next])).rows[0].n),10,'copy all new non-evaluation datasets');
  assert.equal((await pool.query('SELECT mode,write_frozen,source_snapshot_verified'+
    ' FROM qa_failover_v1.state WHERE id=1')).rows[0].mode,'disabled');
  await assert.rejects(refreshQaInactiveReplica({pool,snapshotId:next}),
    denied('inactive_refresh_requires_frozen_existing_replica'));
  console.log('PASS QA frozen replica atomic rebase: 11 datasets, 12 documents, 2 evaluations, no partial data after tamper/stale snapshot, old copy retained, writes OFF');
}finally{await pool.end();}
