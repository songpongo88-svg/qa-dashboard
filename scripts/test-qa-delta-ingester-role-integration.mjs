// PostgreSQL 17 disposable database only; prove least-privilege delta role.
// NO_LOGIN prevents accidentally opening an unaudited Windows data channel.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
if(process.env.QA_PG_ISOLATED_TEST!=='1'||!process.env.QA_TEST_DATABASE_URL)
 throw Error('qa_role_test_disposable_only');
const pool=new pg.Pool({connectionString:process.env.QA_TEST_DATABASE_URL});
try{
 const db=(await pool.query('SELECT current_database() AS db')).rows[0]?.db;
 assert.equal(db,'qa_cutover_ci_test');
 const sql=(await readFile(new URL('../migration/qa-source-delta-ingester-role.sql',import.meta.url),'utf8'))
  .replace('GRANT CONNECT ON DATABASE qa_dashboard_lab',
    'GRANT CONNECT ON DATABASE qa_cutover_ci_test');
 await pool.query(sql);
 const proof=(await pool.query(
  "SELECT r.rolcanlogin,r.rolsuper,r.rolinherit,"+
  " has_table_privilege('qa_delta_ingester','qa_failover_v1.source_delta_events','INSERT') AS can_insert_events,"+
  " has_table_privilege('qa_delta_ingester','qa_failover_v1.source_delta_latest','UPDATE') AS can_update_latest,"+
  " has_table_privilege('qa_delta_ingester','qa_failover_v1.state','SELECT') AS can_read_state,"+
  " has_table_privilege('qa_delta_ingester','qa_failover_v1.state','UPDATE') AS can_update_state,"+
  " has_table_privilege('qa_delta_ingester','qa_failover_v1.evaluations','INSERT') AS can_insert_case,"+
  " has_table_privilege('qa_delta_ingester','qa_failover_v1.outbox','UPDATE') AS can_edit_queue"+
  " FROM pg_roles r WHERE rolname='qa_delta_ingester'"
 )).rows[0];
 assert.equal(proof.rolcanlogin,false);
 assert.equal(proof.rolsuper,false);
 assert.equal(proof.rolinherit,false);
 assert.equal(proof.can_insert_events,true);
 assert.equal(proof.can_update_latest,true);
 assert.equal(proof.can_read_state,true);
 assert.equal(proof.can_update_state,false);
 assert.equal(proof.can_insert_case,false);
 assert.equal(proof.can_edit_queue,false);
 console.log('PASS PostgreSQL delta ingester: NOLOGIN, NOINHERIT, journal-only grants, zero case/standby rights');
}finally{await pool.end();}
