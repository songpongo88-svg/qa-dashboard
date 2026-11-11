import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';

if(process.env.QA_PG_ISOLATED_TEST!=='1'||!process.env.QA_TEST_DATABASE_URL)
  throw Error('Mirror test requires PostgreSQL disposable CI fixture');
const pool=new pg.Pool({connectionString:process.env.QA_TEST_DATABASE_URL,max:2,connectionTimeoutMillis:5000});
const a={id:'test-doc-1',case_id:'SYNTHETIC_00001',agent_name:'QA Fixture',final_score:85};
const b={id:'test-appeal-1',case_id:'SYNTHETIC_00001',note:'original score remains unchanged'};
try{
  const current=(await pool.query('SELECT current_database() AS db')).rows[0]?.db;
  assert.equal(current,'qa_cutover_ci_test','Refuse non-disposable DB');
  // The preceding journal/replay tests used the same DISPOSABLE database.
  // Restore its inactive state before testing import safety.
  await pool.query("UPDATE qa_failover_v1.state SET mode='disabled',write_frozen=true,source_snapshot_verified=false WHERE id=1");
  // The preceding journal test already created qa_failover_v1.
  await pool.query('CREATE SCHEMA IF NOT EXISTS qa_migration_lab');
  await pool.query(`CREATE TABLE IF NOT EXISTS qa_migration_lab.source_documents(
    document_path text PRIMARY KEY,original_json text NOT NULL,
    parsed_json jsonb NOT NULL,source_system text,
    export_batch text,original_hash text
  )`);
  await pool.query('TRUNCATE qa_migration_lab.source_documents');
  for(const [path,data] of [['qa_evaluations/test-doc-1',a],['qa_appeal_events/test-appeal-1',b]]){
    await pool.query(`INSERT INTO qa_migration_lab.source_documents
      (document_path,original_json,parsed_json,source_system,export_batch,original_hash)
      VALUES($1,$2,$3::jsonb,'firestore','fixture-20261110',$4)`,
      [path,JSON.stringify(data),JSON.stringify(data),'f'.repeat(64)]);
  }
  const originalSource=await pool.query(
    'SELECT document_path,original_json,parsed_json FROM qa_migration_lab.source_documents ORDER BY document_path');
  const migration=await readFile(new URL('../migration/qa-local-import-existing-snapshot.sql',import.meta.url),'utf8');
  const old="current_database()<>'qa_dashboard_lab'",replacement="current_database()<>'qa_cutover_ci_test'";
  assert.equal(migration.split(old).length,2,'live DB guard unexpectedly changed');
  const fixtureSql=migration.replace(old,replacement);
  await pool.query(fixtureSql);
  const mirror=await pool.query(`SELECT document_path,original_json,parsed_json
    FROM qa_failover_v1.source_mirror ORDER BY document_path`);
  assert.deepEqual(mirror.rows,originalSource.rows,'source JSON and paths MUST be exactly preserved');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM qa_failover_v1.source_mirror')).rows[0].n,2);
  assert.equal((await pool.query("SELECT mode FROM qa_failover_v1.state WHERE id=1")).rows[0].mode,'disabled');
  await pool.query(fixtureSql);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM qa_failover_v1.source_mirror')).rows[0].n,2,
    'repeating the same archive must be idempotent');
  const next={...a,final_score:92};
  await pool.query(`UPDATE qa_migration_lab.source_documents SET parsed_json=$2::jsonb,
    original_json=$3 WHERE document_path=$1`,
    ['qa_evaluations/test-doc-1',JSON.stringify(next),JSON.stringify(next)]);
  await assert.rejects(pool.query(fixtureSql),error=>String(error.message).includes('Source mirror differs'),
    'changed source must never overwrite a mirrored score');
  const after=await pool.query(`SELECT parsed_json FROM qa_failover_v1.source_mirror
    WHERE document_path='qa_evaluations/test-doc-1'`);
  assert.equal(after.rows[0].parsed_json.final_score,85,'existing QA score must not change');
  assert.equal((await pool.query("SELECT source_snapshot_verified FROM qa_failover_v1.state WHERE id=1")).rows[0].source_snapshot_verified,false);
  console.log('PASS: immutable QA mirror import preserves exact source bytes, refuses changed score, idempotent retry, standby stays disabled.');
}finally{await pool.end();}
