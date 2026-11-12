// Disposable PG17 only: seed live snapshot candidates into inactive standby.
// Never access Windows qa_dashboard_lab, Firestore, or production accounts.
import assert from 'node:assert/strict';
import pg from 'pg';
import {seedQaInactiveStandbyEvaluations} from '../server/qaStandbyInactiveSeed.js';

if(process.env.QA_PG_ISOLATED_TEST!=='1'||!process.env.QA_TEST_DATABASE_URL)
  throw Error('Disposable PostgreSQL environment required');
const pool=new pg.Pool({connectionString:process.env.QA_TEST_DATABASE_URL,max:2});
const reject=code=>e=>e.code===code;
try{
  const db=(await pool.query('SELECT current_database() AS db')).rows[0].db;
  assert.equal(db,'qa_cutover_ci_test');
  // Previous fixture tests leave active evaluation writes and a durable outbox.
  const source=(await pool.query(
    'SELECT snapshot_id,evaluation_count FROM qa_failover_v1.live_candidate_audit'+
    ' ORDER BY verified_at DESC LIMIT 1')).rows[0];
  assert.equal(Number(source.evaluation_count),2);
  await assert.rejects(seedQaInactiveStandbyEvaluations({
    pool,snapshotId:source.snapshot_id,
  }),reject('standby_seed_requires_empty_writer_and_outbox'));
  // Clearing disposable fixture outbox MUST NEVER be done in production.
  await pool.query('TRUNCATE qa_failover_v1.audit,qa_failover_v1.outbox,qa_failover_v1.evaluations');
  await pool.query("UPDATE qa_failover_v1.state SET mode='disabled',write_frozen=true,"+
    " source_snapshot_verified=false,active_snapshot_id=NULL WHERE id=1");
  // Wrong original score must block and roll back without partial writes.
  await pool.query(
    'UPDATE qa_failover_v1.live_candidate_evaluations SET original_score=99'+
    ' WHERE snapshot_id=$1 AND evaluation_id=$2',[source.snapshot_id,'eval-test-01']);
  await assert.rejects(seedQaInactiveStandbyEvaluations({
    pool,snapshotId:source.snapshot_id,
  }),reject('standby_seed_score_or_topic_mismatch'));
  assert.equal(Number((await pool.query(
    'SELECT count(*) AS n FROM qa_failover_v1.evaluations')).rows[0].n),0);
  await pool.query(
    'UPDATE qa_failover_v1.live_candidate_evaluations SET original_score=85'+
    ' WHERE snapshot_id=$1 AND evaluation_id=$2',[source.snapshot_id,'eval-test-01']);
  const result=await seedQaInactiveStandbyEvaluations({
    pool,snapshotId:source.snapshot_id,
  });
  assert.deepEqual(result,{seeded:true,snapshotId:source.snapshot_id,
    evaluations:2,sourceScoresUnchanged:true,writeEnabled:false,failoverEnabled:false});
  const items=(await pool.query(
    'SELECT evaluation_id,version,origin,record,deleted_at,source_hash'+
    ' FROM qa_failover_v1.evaluations ORDER BY evaluation_id')).rows;
  assert.deepEqual(items.map(x=>x.evaluation_id),['eval-test-01','eval-test-02']);
  assert.deepEqual(items.map(x=>x.record.finalScore),[85,90]);
  assert.deepEqual(items.map(x=>x.record.topics[0].score),[8,8]);
  assert.ok(items.every(x=>Number(x.version)===1&&
    x.origin==='firebase_snapshot'&&x.source_hash.length===64));
  assert.ok(items[1].deleted_at,'tombstoned historical evaluation remains tombstoned');
  const state=(await pool.query(
    'SELECT mode,source_snapshot_verified,write_frozen,active_snapshot_id'+
    ' FROM qa_failover_v1.state WHERE id=1')).rows[0];
  assert.deepEqual({
    mode:state.mode,source_snapshot_verified:state.source_snapshot_verified,
    write_frozen:state.write_frozen,active_snapshot_id:state.active_snapshot_id,
  },{mode:'disabled',source_snapshot_verified:false,
      write_frozen:true,active_snapshot_id:source.snapshot_id});
  await assert.rejects(seedQaInactiveStandbyEvaluations({
    pool,snapshotId:source.snapshot_id,
  }),reject('standby_seed_requires_inactive_empty_state'));
  assert.equal(Number((await pool.query(
    'SELECT count(*) AS n FROM qa_failover_v1.outbox')).rows[0].n),0);
  console.log('PASS QA inactive seed: exact scores/topics/tombstones, atomic copy from immutable snapshot, pinned snapshot and no failover writes');
}finally{await pool.end();}
