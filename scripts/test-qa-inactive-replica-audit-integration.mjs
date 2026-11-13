// Disposable PostgreSQL 17 only; never use a real Windows or Firestore DB.
import assert from 'node:assert/strict';
import pg from 'pg';
import {auditQaInactiveReplica} from '../server/qaStandbyInactiveAudit.js';

if(process.env.QA_PG_ISOLATED_TEST!=='1'||!process.env.QA_TEST_DATABASE_URL)
  throw Error('Disposable PostgreSQL environment required');
const pool=new pg.Pool({connectionString:process.env.QA_TEST_DATABASE_URL,max:2});
try{
  assert.equal((await pool.query('SELECT current_database() AS db')).rows[0]?.db,
    'qa_cutover_ci_test');
  const first=await auditQaInactiveReplica(pool);
  assert.equal(first.ok,true);
  assert.equal(first.readOnly,true);
  assert.equal(first.inactiveReplicaStaged,true);
  assert.equal(first.failoverReady,false);
  assert.equal(first.canAcceptWrites,false);
  assert.equal(first.datasetCount,11);
  assert.equal(first.evaluationCount,2);
  assert.equal(first.otherDocumentCount,10);
  assert.equal(first.documentCount,12);
  assert.ok(!JSON.stringify(first).includes('fixture-doc-01'));
  const state=(await pool.query('SELECT mode,write_frozen,source_snapshot_verified'+
    ' FROM qa_failover_v1.state WHERE id=1')).rows[0];
  assert.equal(state.mode,'disabled');
  assert.equal(state.write_frozen,true);
  assert.equal(state.source_snapshot_verified,false);
  const target='qa_appeal_events/fixture-doc-01';
  const original=(await pool.query(
    'SELECT original_hash FROM qa_failover_v1.inactive_domain_documents'+
    ' WHERE document_path=$1',[target])).rows[0]?.original_hash;
  assert.ok(original);
  try {
    await pool.query('UPDATE qa_failover_v1.inactive_domain_documents'+
      ' SET original_hash=$2 WHERE document_path=$1',[target,'0'.repeat(64)]);
    const corrupted=await auditQaInactiveReplica(pool);
    assert.equal(corrupted.inactiveReplicaStaged,false);
    assert.equal(corrupted.reason,'replica_domain_changed');
    assert.equal(corrupted.canAcceptWrites,false);
  }finally{
    await pool.query('UPDATE qa_failover_v1.inactive_domain_documents'+
      ' SET original_hash=$2 WHERE document_path=$1',[target,original]);
  }
  const restored=await auditQaInactiveReplica(pool);
  assert.equal(restored.inactiveReplicaStaged,true);
  assert.equal(restored.failoverReady,false);
  console.log('PASS QA inactive replica: 11 datasets, evaluation scores, appeals and signatures digest verification; tampering blocked; no Firestore reads or activation');
}finally{await pool.end();}
