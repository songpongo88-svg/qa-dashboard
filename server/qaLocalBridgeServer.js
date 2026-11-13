// QA-only Windows PostgreSQL archive probe. READ-ONLY, loopback only.
// This is not the production failover router and must not change QA scores.
// Standalone mode uses 8788 by default to avoid replacing an existing 8787 API.
import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { getQaArchiveStatus } from './qaStandbyArchiveStatus.js';
import { qaStandbySnapshotReadiness } from './qaStandbySnapshotReadiness.js';

const secureMatch = (given, expected) => {
  if (typeof given !== 'string' || !given || typeof expected !== 'string' || expected.length < 40) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
};

const respond = (res, status, data) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(JSON.stringify(data));
};

export function createQaLocalBridgeHandler(pool, { token } = {}) {
  if (!pool || typeof pool.query !== 'function' || typeof token !== 'string' || token.length < 40)
    throw new Error('qa_bridge_configuration_missing');
  let busy = false;
  return async (req, res) => {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return respond(res, 405, { ok: false, error: 'method_not_allowed' });
    }
    const header = req.headers.authorization;
    if (!secureMatch(header, 'Bearer ' + token))
      return respond(res, 403, { ok: false, error: 'forbidden' });
    let url;
    try { url = new URL(req.url, 'http://127.0.0.1'); }
    catch { return respond(res, 400, { ok: false, error: 'invalid_request' }); }
    if (url.search || !['/ready', '/summary', '/readiness'].includes(url.pathname))
      return respond(res, 404, { ok: false, error: 'not_found' });
    // Avoid unbounded concurrent status probes from a tunnel.
    if (busy) return respond(res, 503, { ok: false, error: 'busy' });
    busy = true;
    try {
      if (url.pathname === '/readiness') {
        const readiness = await qaStandbySnapshotReadiness(pool);
        return respond(res, 200, readiness);
      }
      const archive = await getQaArchiveStatus(pool);
      if (url.pathname === '/ready') {
        return respond(res, 200, {
          ok: true, readOnly: true, databaseConnected: true,
          standbyMode: archive.standby.mode, failoverReady: false,
        });
      }
      // Public API responses must never return source paths, document bodies,
      // user profiles, evaluation scores or archive row identifiers.
      return respond(res, 200, {
        ok: true, readOnly: true,
        collectionCount: archive.collections.length,
        sourceDocumentCount: archive.backupDocumentCount,
        syncRuns: 0, // An imported archive is NOT a verified live Firebase sync.
        sourceFreshness: 'unverified-archived-copy',
        importedArchiveCountMatch: archive.importedArchiveCountMatch,
        standbyMode: archive.standby.mode,
        failoverReady: false,
        pendingOperations: archive.pendingOperations,
      });
    } catch {
      return respond(res, 503, { ok: false, error: 'archive_unavailable' });
    } finally { busy = false; }
  };
}


// Multiplex the existing archive-only status API and the future authenticated
// QA DATA handler on ONE existing loopback port. No backend data handler is
// installed by default. The injected handler MUST revalidate local QA sessions
// and supply server-side parity/locks, never trusting user-supplied flags.
export function createQaBridgeRouter(pool, { token, standbyDataHandler } = {}) {
  const archive = createQaLocalBridgeHandler(pool, { token });
  return (req, res) => {
    const path = String(req.url || '').split('?')[0];
    if (path === '/v1/qa/evaluations' || path.startsWith('/v1/qa/evaluations/')) {
      if (typeof standbyDataHandler !== 'function')
        return respond(res, 503, { ok: false, error: 'standby_data_disabled' });
      return standbyDataHandler(req, res);
    }
    return archive(req, res);
  };
}

export function validateLocalQaConnectionString(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return ['postgres:', 'postgresql:'].includes(url.protocol) &&
      ['127.0.0.1', 'localhost'].includes(url.hostname) &&
      url.pathname === '/qa_dashboard_lab' &&
      !url.hash && !url.search;
  } catch { return false; }
}

async function start() {
  const dbUrl = process.env.QA_LOCAL_DATABASE_URL;
  const token = process.env.QA_LOCAL_BRIDGE_TOKEN;
  if (!validateLocalQaConnectionString(dbUrl) || !token || token.length < 40)
    throw new Error('qa_bridge_requires_local_database_and_private_token');
  const port = Number(process.env.QA_LOCAL_BRIDGE_PORT || 8788);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535)
    throw new Error('qa_bridge_invalid_port');
  // Only a separately installed local driver is loaded in standalone mode.
  // The Vercel web build and QA Sparks do not need the pg package.
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({
    connectionString: dbUrl, max: 2, connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000, statement_timeout: 3000,
    options: '-c default_transaction_read_only=on',
  });
  // Production still runs archive-only until a trusted data handler exists.
  const handler = createQaBridgeRouter(pool, { token });
  const server = createServer((req, res) => { void handler(req, res); });
  server.requestTimeout = 5000;
  server.headersTimeout = 6000;
  server.listen(port, '127.0.0.1', () => {
    console.log('QA_LOCAL_ARCHIVE_BRIDGE=READ_ONLY_LOOPBACK');
    console.log('QA_LOCAL_ARCHIVE_PORT=' + port);
    console.log('QA_FAILOVER=OFF');
  });
  const stop = () => server.close(() => { void pool.end(); });
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  start().catch(() => { console.error('QA_LOCAL_ARCHIVE_BRIDGE=START_FAILED'); process.exitCode = 1; });
}
