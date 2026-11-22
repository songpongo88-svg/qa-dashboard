// Isolated PostgreSQL 17 fixture. Never connects to Windows or Firestore.
// Executes the exact PowerShell one-GET atomic reservation SQL verbatim.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
if(process.env.QA_PG_ISOLATED_TEST!=='1'||!process.env.QA_TEST_DATABASE_URL)
 throw Error('fixture_only');
const pool=new pg.Pool({connectionString:process.env.QA_TEST_DATABASE_URL,max:2});
try{
 const name=(await pool.query('SELECT current_database() AS n')).rows[0].n;
 assert.equal(name,'qa_cutover_ci_test');
 const ps=await readFile(new URL('./Check-QA-Windows-Firestore-OneRead.ps1',
  import.meta.url),'utf8');
 const hit=ps.match(/\$reserveSql=@'\r?\n([\s\S]*?)\r?\n'@/);
 assert.ok(hit,'exact PowerShell SQL reservation block missing');
 const sql=hit[1];
 await pool.query('CREATE SCHEMA IF NOT EXISTS qa_failover_v1');
 await pool.query(
  'CREATE TABLE IF NOT EXISTS qa_failover_v1.source_read_budget_daily ('+
  'budget_day date NOT NULL,project_id text NOT NULL,'+
  'reserved_document_units int NOT NULL DEFAULT 0,'+
  'reserved_requests int NOT NULL DEFAULT 0,'+
  'updated_at timestamptz NOT NULL DEFAULT now(),'+
  'PRIMARY KEY (budget_day,project_id))');
 // Prior journal CI created the state table, but reset it to frozen to ensure
 // tests are order independent if other fixtures change the state.
 await pool.query("UPDATE qa_failover_v1.state SET mode='disabled',write_frozen=true,"+
  "source_snapshot_verified=false WHERE id=1");
 await pool.query("DELETE FROM qa_failover_v1.source_read_budget_daily"+
  " WHERE project_id='qa-dashboard-b0b5d'");
 const first=await pool.query(sql);
 assert.equal(first.rows[0].result,'RESERVED');
 const again=await pool.query(sql);
 assert.equal(again.rows[0].result,'RESERVED');
 const curr=(await pool.query(
  "SELECT reserved_document_units,reserved_requests FROM qa_failover_v1.source_read_budget_daily"+
  " WHERE project_id='qa-dashboard-b0b5d'")).rows[0];
 assert.equal(curr.reserved_document_units,2);
 assert.equal(curr.reserved_requests,2);
 await pool.query("UPDATE qa_failover_v1.source_read_budget_daily SET"+
  " reserved_document_units=3000 WHERE project_id='qa-dashboard-b0b5d'");
 assert.equal((await pool.query(sql)).rows[0].result,'BLOCKED');
 await pool.query("UPDATE qa_failover_v1.source_read_budget_daily SET"+
  " reserved_document_units=10,reserved_requests=80"+
  " WHERE project_id='qa-dashboard-b0b5d'");
 assert.equal((await pool.query(sql)).rows[0].result,'BLOCKED');
 await pool.query("UPDATE qa_failover_v1.state SET mode='standby' WHERE id=1");
 assert.equal((await pool.query(sql)).rows[0].result,'BLOCKED');
 await pool.query("UPDATE qa_failover_v1.state SET mode='disabled' WHERE id=1");
 console.log('PASS one-page Firestore probe reservation: atomic daily cap, request cap, frozen standby gate');
}finally{await pool.end();}
