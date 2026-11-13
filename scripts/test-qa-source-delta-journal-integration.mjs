// Disposable PostgreSQL 17 integration test for PRIVATE inactive delta staging.
// Never call Firestore, Windows or Production. Does not enable QA writes.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {appendQaSourceDelta} from '../server/qaSourceDeltaJournal.js';

if(process.env.QA_PG_ISOLATED_TEST!=='1'||!process.env.QA_TEST_DATABASE_URL)
  throw new Error('qa_disposable_postgres_required');
const pool=new pg.Pool({connectionString:process.env.QA_TEST_DATABASE_URL,max:3});
const snapshotId='qa-delta-'+randomUUID();
const stamp=Date.now(), at=ms=>new Date(stamp+ms).toISOString();
const base={snapshotId,documentPath:'qa_evaluations/synthetic-case-01',
  operation:'upsert',documentJson:{fields:{score:{integerValue:'85'}}}};
const event=(suffix,ms,changes={})=>({
  ...base,eventId:'qa-test-event-'+suffix+'-'+randomUUID(),
  sourceChangedAt:at(ms),...changes,
});
const attest=async e=>({
  authority:'verified-firestore-private-event',eventId:e.eventId,
  snapshotId:e.snapshotId,documentPath:e.documentPath,
  operation:e.operation,sourceChangedAt:e.sourceChangedAt,contentHash:e.hash,
});
try{
  const db=(await pool.query('SELECT current_database() AS db')).rows[0].db;
  assert.equal(db,'qa_cutover_ci_test');
  // All base migrations have been applied by the earlier disposable tests.
  await pool.query(await readFile(new URL('../migration/qa-source-delta-journal.sql',import.meta.url),'utf8'));
  await pool.query('INSERT INTO qa_failover_v1.live_snapshot_batches'+
    ' (snapshot_id,source_export_id,source_exported_at,source_provenance,status,'+
    ' source_documents,stored_documents,dataset_manifest,approved_for_failover)'+
    " VALUES ($1,'qa-test-source','" + at(-180000) + "','verified-firestore-server-export',"+
    " 'copy_verified',0,0,'[]'::jsonb,false)",[snapshotId]);
  await pool.query("UPDATE qa_failover_v1.state SET mode='disabled',"+
    ' write_frozen=true,source_snapshot_verified=false,'+
    ' active_snapshot_id=$1 WHERE id=1',[snapshotId]);
  const before=(await pool.query('SELECT count(*)::int AS n FROM qa_failover_v1.evaluations')).rows[0].n;
  const first=event('first',-60000);
  const result=await appendQaSourceDelta({pool,event:first,attestSourceEvent:attest});
  assert.equal(result.outcome,'applied');
  assert.equal((await appendQaSourceDelta({pool,event:first,attestSourceEvent:attest})).outcome,
    'duplicate');
  await assert.rejects(appendQaSourceDelta({pool,attestSourceEvent:attest,
    event:{...first,documentPath:'qa_evaluations/other'}}),
    e=>e.code==='qa_delta_event_id_collision');
  const stale=event('old',-120000);
  assert.equal((await appendQaSourceDelta({pool,event:stale,attestSourceEvent:attest})).outcome,
    'stale');
  const conflict=event('conflict',-60000);
  assert.equal((await appendQaSourceDelta({pool,event:conflict,attestSourceEvent:attest})).outcome,
    'conflict');
  assert.equal((await appendQaSourceDelta({pool,event:conflict,
    attestSourceEvent:attest})).outcome,'conflict',
    'quarantined conflicts must not become acknowledged duplicates on retry');
  // PostgreSQL must preserve both distinct revisions inside the same ms.
  const micro1=event('micro1',-30001,{
    sourceChangedAt:at(-30001).replace(/\.(\d{3})Z$/,'.$1'+'100Z'),
  });
  const micro2=event('micro2',-30001,{
    sourceChangedAt:at(-30001).replace(/\.(\d{3})Z$/,'.$1'+'900Z'),
  });
  assert.equal((await appendQaSourceDelta({pool,event:micro1,
    attestSourceEvent:attest})).outcome,'applied');
  assert.equal((await appendQaSourceDelta({pool,event:micro2,
    attestSourceEvent:attest})).outcome,'applied');
  const exact=(await pool.query(
    "SELECT to_char(source_changed_at AT TIME ZONE 'UTC',"+
    "'YYYY-MM-DD"+'"'+"T"+'"'+"HH24:MI:SS.US"+'"'+"Z"+'"'+"') AS exact_time FROM"+
    ' qa_failover_v1.source_delta_latest WHERE snapshot_id=$1 AND document_path=$2',
    [snapshotId,base.documentPath])).rows[0].exact_time;
  assert.equal(exact,micro2.sourceChangedAt);
  const tombstone=event('deleted',-30000,{operation:'delete',documentJson:null});
  assert.equal((await appendQaSourceDelta({pool,event:tombstone,attestSourceEvent:attest})).outcome,
    'applied');
  const latest=(await pool.query('SELECT operation,document_json,content_hash'+
    ' FROM qa_failover_v1.source_delta_latest'+
    ' WHERE snapshot_id=$1 AND document_path=$2',[snapshotId,base.documentPath])).rows[0];
  assert.equal(latest.operation,'delete');
  assert.equal(latest.document_json,null);
  assert.equal(latest.content_hash,null);
  assert.deepEqual((await pool.query('SELECT outcome FROM qa_failover_v1.source_delta_events'+
    ' WHERE snapshot_id=$1 ORDER BY source_changed_at,event_id',[snapshotId]))
    .rows.map(x=>x.outcome).sort(),['applied','applied','applied','applied','conflict','stale']);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM qa_failover_v1.evaluations')).rows[0].n,
    before,'fixture must never modify active QA case scores');
  await pool.query("UPDATE qa_failover_v1.state SET mode='standby' WHERE id=1");
  await assert.rejects(appendQaSourceDelta({pool,event:event('blocked',-20000),
    attestSourceEvent:attest}),e=>e.code==='qa_delta_requires_frozen_matched_snapshot');
  await pool.query("UPDATE qa_failover_v1.state SET mode='disabled' WHERE id=1");
  console.log('PASS PostgreSQL 17 private delta staging, dedup, stale, conflicts, tombstones, frozen gate, QA cases untouched');
}finally{await pool.end();}
