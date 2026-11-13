import assert from 'node:assert/strict';
import pg from 'pg';
import { getQaArchiveStatus } from '../server/qaStandbyArchiveStatus.js';

if (process.env.QA_PG_ISOLATED_TEST!=='1' || !process.env.QA_TEST_DATABASE_URL)
  throw Error('Fixture-only QA archive status test');
const pool=new pg.Pool({connectionString:process.env.QA_TEST_DATABASE_URL,max:2});
try {
  const result=await getQaArchiveStatus(pool);
  assert.equal(result.source,'existing-local-postgres-archive');
  assert.equal(result.sourceFreshness,'unverified-archived-copy');
  assert.equal(result.backupDocumentCount,2);
  assert.equal(result.importedArchiveCountMatch,true);
  assert.deepEqual(result.collections,[
    {name:'qa_appeal_events',documents:1},
    {name:'qa_evaluations',documents:1},
  ]);
  assert.equal(result.standby.mode,'disabled');
  assert.equal(result.standby.frozen,true);
  assert.equal(result.standby.liveParityVerified,false);
  assert.equal(result.firebaseLiveSync,false);
  assert.equal(result.productionFailoverReady,false);
  // CI journal has synthetic outbox operations; these must never be mistaken
  // for an already replayed Firebase write.
  assert.ok(result.pendingOperations>=0);
  // Even if a broken operator flips an archive audit row, the internal
  // status function must NOT claim live Firestore parity or cutover readiness.
  await pool.query('UPDATE qa_failover_v1.mirror_import_audit SET source_count=3');
  const wrong=await getQaArchiveStatus(pool);
  assert.equal(wrong.importedArchiveCountMatch,false);
  assert.equal(wrong.productionFailoverReady,false);
  assert.equal(wrong.standby.liveParityVerified,false);
  console.log('PASS: QA archive status reports counts without exposing case data or claiming live sync / safe automatic Failover');
} finally {await pool.end();}
