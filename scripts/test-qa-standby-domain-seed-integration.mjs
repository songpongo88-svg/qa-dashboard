import assert from 'node:assert/strict';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {seedQaInactiveStandbyDomains} from '../server/qaStandbyDomainSeed.js';

if(process.env.QA_PG_ISOLATED_TEST!=='1'||!process.env.QA_TEST_DATABASE_URL)
  throw Error('Disposable PostgreSQL fixture required');
const pool=new pg.Pool({connectionString:process.env.QA_TEST_DATABASE_URL,max:2});
const reject=code=>e=>e.code===code;
try{
  const db=(await pool.query('SELECT current_database() AS db')).rows[0].db;
  assert.equal(db,'qa_cutover_ci_test','DO NOT run against Windows or Production');
  const sql=await readFile(new URL('../migration/qa-local-domain-replica.sql',import.meta.url),'utf8');
  await pool.query(sql);
  const state=(await pool.query(
    'SELECT active_snapshot_id,mode,write_frozen,source_snapshot_verified'+
    ' FROM qa_failover_v1.state WHERE id=1')).rows[0];
  assert.equal(state.mode,'disabled');
  assert.equal(state.write_frozen,true);
  assert.equal(state.source_snapshot_verified,false);
  const snapshotId=state.active_snapshot_id;
  assert.ok(snapshotId);
  const before=await pool.query(
    'SELECT count(*)::integer AS n FROM qa_failover_v1.outbox'
  );
  assert.equal(before.rows[0].n,0);
  const target='qa_appeal_events/fixture-doc-01';
  const original=(await pool.query(
    'SELECT content_hash FROM qa_failover_v1.live_snapshot_rows'+
    ' WHERE snapshot_id=$1 AND document_path=$2',[snapshotId,target]
  )).rows[0].content_hash;
  await pool.query(
    'UPDATE qa_failover_v1.live_snapshot_rows SET content_hash=$3'+
    ' WHERE snapshot_id=$1 AND document_path=$2',
    [snapshotId,target,'0'.repeat(64)]
  );
  await assert.rejects(seedQaInactiveStandbyDomains({pool,snapshotId}),
    reject('domain_seed_untrusted_source_row'));
  assert.equal(Number((await pool.query(
    'SELECT count(*) AS n FROM qa_failover_v1.inactive_domain_documents')).rows[0].n),0);
  await pool.query(
    'UPDATE qa_failover_v1.live_snapshot_rows SET content_hash=$3'+
    ' WHERE snapshot_id=$1 AND document_path=$2',[snapshotId,target,original]
  );
  const result=await seedQaInactiveStandbyDomains({pool,snapshotId});
  assert.deepEqual(result,{snapshotId,domainDocuments:10,datasets:10,
    allSourceHashesVerified:true,originalAppealsAndSignaturesPreserved:true,
    failoverEnabled:false,writeEnabled:false});
  const docs=(await pool.query(
    'SELECT document_path,root_collection,original_json,original_hash'+
    ' FROM qa_failover_v1.inactive_domain_documents ORDER BY document_path')).rows;
  assert.equal(docs.length,10);
  assert.deepEqual(new Set(docs.map(x=>x.root_collection)).size,10);
  assert.equal(docs.find(x=>x.root_collection==='qa_appeal_events')
    .original_json.fields.id.stringValue,'fixture-doc-01');
  assert.equal(docs.every(x=>x.original_hash.length===64),true);
  const audit=(await pool.query(
    'SELECT seeded_documents,manifest_digest,approved_for_live_writes'+
    ' FROM qa_failover_v1.inactive_domain_seed_audit WHERE snapshot_id=$1',
    [snapshotId])).rows[0];
  assert.equal(Number(audit.seeded_documents),10);
  assert.equal(audit.manifest_digest.length,64);
  assert.equal(audit.approved_for_live_writes,false);
  await assert.rejects(seedQaInactiveStandbyDomains({pool,snapshotId}),
    reject('domain_seed_already_completed'));
  const stateAfter=(await pool.query(
    'SELECT mode,source_snapshot_verified,write_frozen,active_snapshot_id'+
    ' FROM qa_failover_v1.state WHERE id=1')).rows[0];
  assert.deepEqual(stateAfter,state);
  assert.equal((await pool.query(
    'SELECT count(*)::integer AS n FROM qa_failover_v1.outbox')).rows[0].n,0);
  console.log('PASS QA domain standby: complete 10-dataset exact original appeal/signature/session/lock copies, rollback on hash tampering and writes OFF');
}finally{await pool.end();}
