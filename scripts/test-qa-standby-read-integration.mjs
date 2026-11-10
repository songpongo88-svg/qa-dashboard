import assert from 'node:assert/strict';
import pg from 'pg';
import { readQaStandbyEvaluation, listQaStandbyEvaluations } from '../server/qaStandbyRead.js';
import { QaStandbyBlocked } from '../server/qaStandbyPgJournal.js';

if(process.env.QA_PG_ISOLATED_TEST!=='1'||!process.env.QA_TEST_DATABASE_URL)
  throw Error('No live QA DB allowed in read integration tests');
const pool=new pg.Pool({connectionString:process.env.QA_TEST_DATABASE_URL,max:2,connectionTimeoutMillis:5000});
const fixture=()=>({mode:'isolated-fixture',fixtureAuthorizedByServer:true,production:false,
  session:{verified:true,role:'Quality Assurance',username:'qa_test',
    expiresAt:new Date(Date.now()+3600000).toISOString()}});
const blocked=code=>error=>error instanceof QaStandbyBlocked&&error.code===code;
try {
  const database=await pool.query('SELECT current_database() AS db');
  assert.equal(database.rows[0].db,'qa_cutover_ci_test');
  const found=await readQaStandbyEvaluation(pool,'qa-race-1',fixture());
  assert.equal(found.found,true);
  assert.equal(found.record.finalScore,85);
  assert.equal(found.source,'local-postgres-standby');
  const deleted=await readQaStandbyEvaluation(pool,'qa-test-1',fixture());
  assert.equal(deleted.found,false,'a local soft delete must not appear active');
  const page=await listQaStandbyEvaluations(pool,{limit:1,month:'2026-11'},fixture());
  assert.equal(page.rows.length,1);
  assert.equal(page.rows[0].evaluationId,'qa-no-case-1');
  assert.equal(page.hasMore,true);
  const secondPage=await listQaStandbyEvaluations(pool,{limit:1,month:'2026-11',afterId:page.nextAfterId},fixture());
  assert.equal(secondPage.rows[0].evaluationId,'qa-race-1');
  assert.equal(secondPage.hasMore,false);
  const noCase=await readQaStandbyEvaluation(pool,'qa-no-case-1',fixture());
  assert.equal(noCase.record.evaluationType,'no_case_month');
  assert.equal(noCase.record.finalScore,0);
  assert.deepEqual((await listQaStandbyEvaluations(pool,{limit:10,month:'2026-10'},fixture())).rows,[]);
  await assert.rejects(readQaStandbyEvaluation(pool,'qa-race-1',{
    ...fixture(),session:{...fixture().session,role:'Admin Live Chat'},
  }),blocked('session_not_verified'));
  await assert.rejects(listQaStandbyEvaluations(pool,{limit:1000},fixture()),blocked('invalid_limit'));
  await assert.rejects(listQaStandbyEvaluations(pool,{month:'2026-99'},fixture()),blocked('invalid_month'));
  await pool.query("UPDATE qa_failover_v1.state SET source_snapshot_verified=false WHERE id=1");
  await assert.rejects(readQaStandbyEvaluation(pool,'qa-race-1',fixture()),blocked('backup_not_verified'));
  await pool.query("UPDATE qa_failover_v1.state SET source_snapshot_verified=true WHERE id=1");
  console.log('PASS: standby reads show only authorized active QA records and refuse unverified/incomplete local backups');
}finally {await pool.end();}
