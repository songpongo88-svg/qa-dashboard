// QA Preview build-time bridge preflight. No DB writes or QA case reads.
// Prints ONLY a status enum. Never prints URLs, credentials, or response bodies.
// Temporary quick-tunnel probe; it does not enable Production cutover.
const label = (status) => console.log('QA_TUNNEL_CHECK=' + status);
if (process.env.VERCEL_ENV !== 'preview' || process.env.QA_LOCAL_DIAGNOSTICS_ENABLED !== '1') {
  label('SKIPPED_NOT_QA_PREVIEW');
} else {
  const raw = process.env.QA_LOCAL_BRIDGE_URL;
  const token = process.env.QA_LOCAL_BRIDGE_TOKEN;
  let url = null;
  try {
    if (!raw || !token || token.length < 40) {
      label('MISSING_PREVIEW_CONFIG');
    } else {
      const parsed = new URL(raw);
      // Never send a privileged bridge token to a non-Cloudflare hostname or
      // to a URL containing credentials, unexpected paths, fragments or ports.
      const valid = parsed.protocol === 'https:' &&
        /^[a-z0-9-]+\.trycloudflare\.com$/.test(parsed.hostname) &&
        parsed.pathname === '/' && !parsed.search && !parsed.hash &&
        !parsed.username && !parsed.password && !parsed.port;
      if (!valid) {
        label('UNSUPPORTED_TEMPORARY_TUNNEL');
      } else {
        url = new URL('/ready', parsed);
        try {
          const response = await fetch(url, {
            method: 'GET',
            redirect: 'manual',
            cache: 'no-store',
            signal: AbortSignal.timeout(8000),
            headers: {Authorization: 'Bearer ' + token, Accept:'application/json'},
          });
          if (response.status === 401 || response.status === 403) {
            label('AUTH_DENIED');
          } else if (response.status !== 200) {
            label('BRIDGE_HTTP_FAILURE');
          } else if (!(response.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
            label('INVALID_RESPONSE');
          } else {
            const body = await response.text();
            if (body.length > 4096) {
              label('INVALID_RESPONSE');
            } else {
              let data = null;
              try { data = JSON.parse(body); } catch { /* invalid JSON */ }
              label(data?.ok === true && data?.readOnly === true && data?.databaseConnected === true
                ? 'PASS_REMOTE_POSTGRES_READONLY'
                : 'READINESS_NOT_CONFIRMED');
            }
          }
        } catch {
          label('TUNNEL_UNREACHABLE');
        }
      }
    }
  } catch {
    label('INVALID_PREVIEW_CONFIG');
  }
}
// This optional preflight never blocks a regular Preview build; it exists
// only to distinguish authenticated end-to-end connectivity from tunnel reachability.
