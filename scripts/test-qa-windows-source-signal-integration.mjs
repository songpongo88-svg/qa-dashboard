// Disposable PostgreSQL 17 only. Never opens Firebase, QA Production or Windows.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {appendQaWindowsSourceSignal,normalizeQaWindowsSourceSignal}
 from '../server/qaWindowsSourceSignalJournal.js';
if(process.env.QA_PG_ISOLATED_TEST!=='1'||!process.env.QA_TEST_DATABASE_URL)
 throw Error('ci_fixture_only');
const pool=new pg.Pool({connectionString:process.env.QA_TEST_DATABASE_URL,max:3});
const snapshotId='qa-stage-snapshot-20261114';
const eventId='qa-stage-source-event-000001';
const signal={collection:'qa_evaluations',documentId:'fixture-case',
 changeType:'modified',observedRevision:'2026-11-14T09:00:00.123456Z',
 authoritativeDocument:false,sourceCommitVerified:false,requiresSourceRead:true};
const env={QA_PG_ISOLATED_TEST:'1',QA_WINDOWS_SOURCE_SIGNAL_STAGE:'1',QA_FAILOVER:'OFF'};
const attestLocalProbe=async e=>({authority:'qa-local-readonly-probe',
 snapshotId:e.snapshotId,eventId:e.eventId,collection:e.collection,
 documentId:e.documentId,changeType:e.changeType,
 observedRevision:e.observedRevision,sourceCommitVerified:false});
const args={pool,snapshotId,eventId,signal,env,attestLocalProbe};
try{
 assert.equal((await pool.query('SELECT current_database() AS db')).rows[0].db,'qa_cutover_ci_test');
 assert.throws(()=>normalizeQaWindowsSourceSignal({...args,
  signal:{...signal,collection:'qa_sparks'}}),/qa_signal_invalid_event/);
 await pool.query('CREATE SCHEMA qa_failover_v1');
 await pool.query('CREATE TABLE qa_failover_v1.live_snapshot_batches(snapshot_id text primary key,status text,approved_for_failover boolean)');
 await pool.query('CREATE TABLE qa_failover_v1.state(id int primary key,mode text,write_frozen boolean,source_snapshot_verified boolean,active_snapshot_id text)');
 await pool.query("INSERT INTO qa_failover_v1.live_snapshot_batches VALUES ($1,'copy_verified',false)",[snapshotId]);
 await pool.query("INSERT INTO qa_failover_v1.state VALUES(1,'disabled',true,false,$1)",[snapshotId]);
 const sql=await readFile(new URL('../migration/qa-windows-source-signal-stage.sql',import.meta.url),'utf8');
 await pool.query(sql);
 await assert.rejects(appendQaWindowsSourceSignal({...args,
  attestLocalProbe:async()=>({authority:'browser'})}),/qa_signal_source_not_attested/);
 const one=await appendQaWindowsSourceSignal(args);
 assert.equal(one.durable,true);assert.equal(one.sourceCommitVerified,false);
 assert.equal(one.failoverReady,false);
 const again=await appendQaWindowsSourceSignal(args);
 assert.equal(again.duplicate,true);
 await assert.rejects(appendQaWindowsSourceSignal({...args,
  signal:{...signal,documentId:'different'}}),/qa_signal_event_id_collision/);
 const table='qa_windows_probe_v1.source_signals';
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM '+table)).rows[0].n,1);
 await assert.rejects(pool.query('UPDATE '+table+' SET source_commit_verified=true'),e=>e.code==='23514');
 await assert.rejects(pool.query('UPDATE '+table+' SET needs_reconciliation=false'),e=>e.code==='23514');
 await pool.query("UPDATE qa_failover_v1.state SET mode='standby' WHERE id=1");
 await assert.rejects(appendQaWindowsSourceSignal({...args,
  eventId:'qa-stage-source-event-000002'}),/qa_signal_not_frozen/);
 await pool.query("UPDATE qa_failover_v1.state SET mode='disabled',active_snapshot_id='other-id' WHERE id=1");
 await assert.rejects(appendQaWindowsSourceSignal({...args,
  eventId:'qa-stage-source-event-000002'}),/qa_signal_not_frozen/);
 await pool.query("UPDATE qa_failover_v1.state SET active_snapshot_id=$1 WHERE id=1",[snapshotId]);
 const deletion=await appendQaWindowsSourceSignal({...args,
  eventId:'qa-stage-source-event-000002',
  signal:{...signal,changeType:'removed',observedRevision:null}});
 assert.equal(deletion.durable,true);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM '+table)).rows[0].n,2);
 await pool.query('CREATE ROLE qa_ci_source_no_access NOLOGIN');
 const access=(await pool.query("SELECT has_schema_privilege('qa_ci_source_no_access','qa_windows_probe_v1','USAGE') AS allowed")).rows[0].allowed;
 assert.equal(access,false);
 console.log('PASS staging metadata journal: frozen snapshot, dedup, quarantine, no browser access');
}finally{await pool.end();}
