import { createHash, timingSafeEqual } from 'node:crypto';

// Internal-only QA local diagnostics handler (NOT mapped to an HTTP route).
// Keep outside /api to fit the Vercel Hobby serverless-function limit.
// Never returns QA case contents or opens DB writes.
const send = (res, status, data) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  return res.status(status).json(data);
};

const constantTimeMatch = (given, expected) => {
  if (typeof given !== 'string' || !given || typeof expected !== 'string' || expected.length < 32) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
};

const bridgeBase = (raw) => {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    if (url.port || !/^[a-z0-9.-]+$/i.test(url.hostname) || !url.hostname.includes('.')) return null;
    if (url.hostname === 'localhost' || url.hostname.endsWith('.localhost') ||
        url.hostname.endsWith('.local') || url.hostname.endsWith('.internal') ||
        /(?:^|\.)(?:127|10|192|172|169|0)(?:\.|$)/.test(url.hostname)) return null;
    return url.origin;
  } catch { return null; }
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { ok: false, error: 'method_not_allowed' });
  }
  if (process.env.VERCEL_ENV === 'production' || process.env.QA_LOCAL_DIAGNOSTICS_ENABLED !== '1')
    return send(res, 404, { ok: false, error: 'not_enabled' });
  if (!constantTimeMatch(req.headers?.['x-qa-diagnostic-key'], process.env.QA_LOCAL_DIAGNOSTIC_KEY))
    return send(res, 403, { ok: false, error: 'forbidden' });

  const check = req.query?.check;
  if (typeof check !== 'string' || !['ready', 'summary'].includes(check))
    return send(res, 400, { ok: false, error: 'unsupported_check' });
  const baseUrl = bridgeBase(process.env.QA_LOCAL_BRIDGE_URL);
  const bridgeToken = process.env.QA_LOCAL_BRIDGE_TOKEN;
  if (!baseUrl || !bridgeToken || bridgeToken.length < 40)
    return send(res, 503, { ok: false, error: 'bridge_not_configured' });

  try {
    const response = await fetch(baseUrl + '/' + check, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${bridgeToken}`,
        Accept: 'application/json',
        ...(process.env.QA_CF_ACCESS_CLIENT_ID && process.env.QA_CF_ACCESS_CLIENT_SECRET
          ? {
            'CF-Access-Client-Id': process.env.QA_CF_ACCESS_CLIENT_ID,
            'CF-Access-Client-Secret': process.env.QA_CF_ACCESS_CLIENT_SECRET,
          } : {}),
      },
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return send(res, 502, { ok: false, error: 'bridge_unavailable' });
    const type = response.headers.get('content-type') || '';
    if (!type.toLowerCase().includes('application/json')) return send(res, 502, { ok: false, error: 'invalid_bridge_response' });
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > 16384) return send(res, 502, { ok: false, error: 'invalid_bridge_response' });
    const responseText = await response.text();
    if (responseText.length > 16384) return send(res, 502, { ok: false, error: 'invalid_bridge_response' });
    const data = JSON.parse(responseText);
    if (data?.ok !== true || data?.readOnly !== true) return send(res, 502, { ok: false, error: 'read_only_verification_failed' });
    if (check === 'ready') {
      if (data.databaseConnected !== true) return send(res, 502, { ok: false, error: 'database_unavailable' });
      return send(res, 200, { ok: true, mode: 'non-production-diagnostic', databaseConnected: true, readOnly: true });
    }
    const safeCount = (n) => Number.isSafeInteger(n) && n >= 0 ? n : null;
    const counts = {
      collectionCount: safeCount(data.collectionCount),
      sourceDocumentCount: safeCount(data.sourceDocumentCount),
      syncRuns: safeCount(data.syncRuns),
    };
    if (Object.values(counts).some(n => n === null)) return send(res, 502, { ok: false, error: 'invalid_bridge_response' });
    return send(res, 200, { ok: true, readOnly: true, mode: 'non-production-diagnostic', ...counts });
  } catch {
    return send(res, 502, { ok: false, error: 'bridge_unreachable' });
  }
}
