import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createQaLocalBridgeHandler, validateLocalQaConnectionString } from '../server/qaLocalBridgeServer.js';

const secret = 'qa-only-local-archive-bridge-' + 'b'.repeat(50);
let queries = 0;
const pool = {
  async query(sql) {
    queries++;
    if (sql.includes('current_database()')) return { rows: [{ db: 'qa_dashboard_lab' }] };
    if (sql.includes('root_collection,count(')) return { rows: [
      { root_collection: 'qa_evaluations', documents: 563 },
      { root_collection: 'qa_appeal_events', documents: 224 },
      { root_collection: 'qa_signature_documents', documents: 91 },
      { root_collection: 'qa_user_profiles', documents: 30 },
      { root_collection: 'qa_user_sessions', documents: 1134 },
      { root_collection: 'qa_other_a', documents: 10 },
      { root_collection: 'qa_other_b', documents: 9 },
      { root_collection: 'qa_other_c', documents: 8 },
      { root_collection: 'qa_other_d', documents: 6 },
      { root_collection: 'qa_other_e', documents: 4 },
      { root_collection: 'qa_other_f', documents: 2 },
    ]};
    if (sql.includes('mirror_import_audit')) return { rows: [
      { source_count: 2081, mirror_count: 2081, imported_at: '2026-11-10T00:00:00Z' },
    ]};
    if (sql.includes('qa_failover_v1.state')) return { rows: [
      { mode: 'disabled', write_frozen: true, source_snapshot_verified: false },
    ]};
    if (sql.includes('qa_failover_v1.outbox')) return { rows: [{ status: 'pending', documents: 2 }] };
    throw new Error('unexpected_sql');
  },
};
const server = createServer(createQaLocalBridgeHandler(pool, { token: secret }));
try {
  assert.equal(validateLocalQaConnectionString('postgresql://qa:secret@127.0.0.1:5432/qa_dashboard_lab'), true);
  for (const url of [
    'postgresql://qa:secret@remote.example.com/qa_dashboard_lab',
    'postgresql://qa:secret@127.0.0.1/another_db',
    'http://127.0.0.1:5432/qa_dashboard_lab',
  ]) assert.equal(validateLocalQaConnectionString(url), false);
  await assert.rejects(async () => createQaLocalBridgeHandler(pool, { token: 'short' }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const request = (path, opts = {}) => fetch(origin + path, opts);
  let r = await request('/ready');
  assert.equal(r.status, 403);
  assert.equal(queries, 0, 'unauthenticated access must not query PostgreSQL');
  r = await request('/summary', { method: 'POST', headers: { Authorization: 'Bearer ' + secret } });
  assert.equal(r.status, 405);
  r = await request('/qa_evaluations', { headers: { Authorization: 'Bearer ' + secret } });
  assert.equal(r.status, 404);
  r = await request('/ready', { headers: { Authorization: 'Bearer ' + secret } });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), {
    ok: true, readOnly: true, databaseConnected: true, standbyMode: 'disabled', failoverReady: false,
  });
  assert.equal(r.headers.get('cache-control'), 'no-store, max-age=0');
  assert.equal(r.headers.get('access-control-allow-origin'), null, 'no browser cross-origin permission');
  r = await request('/summary', { headers: { Authorization: 'Bearer ' + secret } });
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(data.collectionCount, 11);
  assert.equal(data.sourceDocumentCount, 2081);
  assert.equal(data.syncRuns, 0);
  assert.equal(data.sourceFreshness, 'unverified-archived-copy');
  assert.equal(data.importedArchiveCountMatch, true);
  assert.equal(data.standbyMode, 'disabled');
  assert.equal(data.failoverReady, false);
  assert.equal(data.pendingOperations, 2);
  for (const field of ['record', 'original_json', 'document_path', 'case_id', 'final_score', 'password']) {
    assert.ok(!JSON.stringify(data).includes(field), 'No private data: ' + field);
  }
  pool.query = async () => { throw new Error('secret_case_data_and_password'); };
  r = await request('/summary', { headers: { Authorization: 'Bearer ' + secret } });
  assert.equal(r.status, 503);
  assert.ok(!(await r.text()).includes('secret_case_data_and_password'));
  console.log('PASS: local QA bridge exposes authenticated archive counts, no case data, no writes, and never claims live failover');
} finally {
  if (server.listening) await new Promise(resolve => server.close(resolve));
}
