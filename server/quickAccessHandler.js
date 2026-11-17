import { createSign } from "node:crypto";

const PROJECT = "qa-dashboard-b0b5d";
const FIRESTORE = "https://firestore.googleapis.com/v1/projects/" + PROJECT + "/databases/(default)/documents";
const POLICY = "qa-session-policy-2026-07-15-v1";
let googleToken = "";
let googleTokenExpires = 0;
const fail = (message, status = 403, code = "") => { throw Object.assign(new Error(message), { status, code }); };
const safeName = (value) => String(value || "").trim().toLowerCase();
// The login creates session IDs with a normalized username prefix, which may
// legitimately contain "." or "@"; the previous ASCII-only check rejected them.
const sessionDocPrefix = (username) => safeName(username).replace(/\//g, "__").replace(/\s+/g, "_") + "-";
const isSafeDocumentId = (id) => id.length <= 240 && !/[\/#?\[\]\u0000-\u001f]/u.test(id);
const data = (document) => Object.fromEntries(Object.entries(document?.fields || {}).map(([key, field]) =>
  [key, field?.stringValue ?? field?.booleanValue ?? field?.integerValue ?? ""]));
const b64 = (object) => Buffer.from(JSON.stringify(object)).toString("base64url");

async function getGoogleToken() {
  if (googleToken && Date.now() < googleTokenExpires - 60_000) return googleToken;
  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) fail("QA session verification is not configured", 503);
  let account;
  try { account = JSON.parse(raw); } catch { fail("QA session credentials are invalid", 503); }
  if (!account?.client_email || !account?.private_key) fail("QA session credentials are incomplete", 503);
  const now = Math.floor(Date.now() / 1000);
  const assertion = b64({ alg: "RS256", typ: "JWT" }) + "." + b64({
    iss: account.client_email, scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  });
  const sign = createSign("RSA-SHA256");
  sign.update(assertion); sign.end();
  const jwt = assertion + "." + sign.sign(String(account.private_key).replace(/\\n/g, "\n")).toString("base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) fail("QA session provider is temporarily unavailable", 503);
  googleToken = result.access_token;
  googleTokenExpires = Date.now() + Number(result.expires_in || 3600) * 1000;
  return googleToken;
}

async function readDoc(path, token) {
  const response = await fetch(FIRESTORE + "/" + path, {
    headers: { authorization: "Bearer " + token }, cache: "no-store", signal: AbortSignal.timeout(10000),
  });
  if (response.status === 404) return null;
  if (response.status === 429) fail("QA session provider has reached its quota", 503);
  if (!response.ok) fail("QA session validation is unavailable", 503);
  return data(await response.json());
}
async function verifyQaSession(username, sessionId, requireAdmin) {
  const sessionPrefix = sessionDocPrefix(username);
  if (!username || username.length > 100 || !isSafeDocumentId(username) ||
      !sessionId.startsWith(sessionPrefix) || !isSafeDocumentId(sessionId) ||
      sessionId.length < sessionPrefix.length + 10)
    fail("QA Dashboard session identity is missing or malformed", 401, "SESSION_ID_MISSING");
  const token = await getGoogleToken();
  const session = await readDoc("qa_user_sessions/" + encodeURIComponent(sessionId), token);
  if (!session) fail("QA Dashboard session not found", 401, "SESSION_NOT_FOUND");
  if (safeName(session.username) !== username) fail("QA Dashboard session account mismatch", 401, "SESSION_MISMATCH");
  if (session.policyVersion !== POLICY) fail("QA Dashboard session policy is outdated", 401, "SESSION_POLICY");
  if (session.status !== "active") fail("QA Dashboard session is revoked", 401, "SESSION_REVOKED");
  const expiry = Date.parse(session.expiresAt);
  if (!Number.isFinite(expiry)) fail("QA Dashboard session expiry invalid", 401, "SESSION_INVALID");
  if (expiry <= Date.now()) fail("QA Dashboard session has expired", 401, "SESSION_EXPIRED");
  // Client sessionStore uses the normalized account ID for revocation control.
  const controlDocId = sessionDocPrefix(username).slice(0, -1);
  const control = await readDoc("qa_user_session_controls/" + encodeURIComponent(controlDocId), token);
  const cutoff = Date.parse(control?.revokedBefore || "");
  if (Number.isFinite(cutoff) && Date.parse(session.createdAt) <= cutoff)
    fail("QA Dashboard session was revoked", 401, "SESSION_REVOKED");
  if (!requireAdmin) return { username, admin: false };
  // Match the administrator identity recognized by the Dashboard UI while
  // verifying it against the server-read profile, never client-supplied names.
  const profile = await readDoc("qa_user_profiles/" + encodeURIComponent(username), token);
  const sessionQa = safeName(session.role) === "quality assurance";
  const profileQa = safeName(profile?.role) === "quality assurance";
  const trustedAdmin = username === "songpon" ||
    safeName(profile?.displayName) === "songpon phothong";
  if (!sessionQa || !profile || safeName(profile.username) !== username ||
      !profileQa || profile.status === "Suspended" || !trustedAdmin)
    fail("Only the active QA Dashboard administrator can manage Quick Access links", 403);
  return { username, admin: true };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }
  const fetchSite = String(req.headers["sec-fetch-site"] || "");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none")
    return res.status(403).json({ error: "CROSS_ORIGIN_BLOCKED" });
  if (req.headers.origin) {
    try {
      const origin = new URL(req.headers.origin);
      if (origin.protocol !== "https:" || origin.host !== req.headers.host)
        return res.status(403).json({ error: "ORIGIN_MISMATCH" });
    } catch { return res.status(403).json({ error: "ORIGIN_MISMATCH" }); }
  }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== "object") fail("INVALID_BODY", 400);
    const action = String(body.action || "");
    if (!["list", "create", "update", "delete", "reorder"].includes(action))
      fail("UNKNOWN_ACTION", 400);
    const username = safeName(body.actorUsername);
    const actor = await verifyQaSession(username, String(body.sessionId || ""), action !== "list");
    const bridgeUrl = String(process.env.SPARKS_SUPABASE_BRIDGE_URL || "");
    const bridgeToken = String(process.env.SPARKS_SUPABASE_BRIDGE_TOKEN || "");
    if (!/^https:\/\/[^\s]+\/functions\/v1\/qa-sparks-runtime(?:-preview|-test)?$/.test(bridgeUrl) || bridgeToken.length < 40)
      fail("Quick Access storage is not configured", 503);
    const url = bridgeUrl.replace(/qa-sparks-runtime(?:-preview|-test)?$/, "qa-dashboard-quick-access");
    const response = await fetch(url, {
      method: "POST", headers: { "content-type": "application/json", "x-qa-sparks-server-secret": bridgeToken },
      body: JSON.stringify({ action, actorUsername: actor.username, isAdmin: actor.admin,
        ...(action === "create" || action === "update" ? { link: body.link } : {}),
        ...(action === "update" || action === "delete" ? { id: body.id } : {}),
        ...(action === "reorder" ? { ids: body.ids } : {}) }),
      signal: AbortSignal.timeout(16000),
    });
    const answer = await response.json().catch(() => ({}));
    // A Supabase bridge rejection is not the user's QA Dashboard session expiring.
    if (response.status === 401 || response.status === 403) {
      console.error("Quick Access service-to-service authorization rejected", response.status);
      return res.status(503).json({ error: "QUICK_ACCESS_STORAGE_AUTH_UNAVAILABLE", code: "STORAGE_AUTH_UNAVAILABLE" });
    }
    return res.status(response.status).json(answer);
  } catch (error) {
    const status = Number(error?.status) || 503;
    if (status >= 500) console.error("Quick Access API unavailable", error instanceof Error ? error.name : "unknown");
    return res.status(status).json({ error: status >= 500 ? "QUICK_ACCESS_UNAVAILABLE" : String(error?.message || "UNAUTHORIZED"), ...(status === 401 && error?.code ? { code: error.code } : {}) });
  }
}

// Temporary, public-safe connectivity probe. Returns only service health,
// never user data, credentials, Firestore documents or link contents.
let quickAccessProbe = { until: 0, value: null };
export async function probeQuickAccessConnections() {
  if (quickAccessProbe.value && Date.now() < quickAccessProbe.until) return quickAccessProbe.value;
  const checks = { identityProvider: "unknown", sessionCollection: "unknown", linkStorage: "unknown" };
  try {
    const authToken = await getGoogleToken();
    checks.identityProvider = "available";
    await readDoc("qa_user_sessions/__quick_access_health_check__", authToken);
    checks.sessionCollection = "available";
  } catch (error) {
    checks.identityProvider = checks.identityProvider === "available" ? "available" : "unavailable";
    checks.sessionCollection = "unavailable";
  }
  try {
    const bridgeUrl = String(process.env.SPARKS_SUPABASE_BRIDGE_URL || "");
    const bridgeToken = String(process.env.SPARKS_SUPABASE_BRIDGE_TOKEN || "");
    if (!/^https:\/\/[^\s]+\/functions\/v1\/qa-sparks-runtime(?:-preview|-test)?$/.test(bridgeUrl) || bridgeToken.length < 40)
      throw new Error("STORAGE_SETTINGS_UNAVAILABLE");
    const bridge = bridgeUrl.replace(/qa-sparks-runtime(?:-preview|-test)?$/, "qa-dashboard-quick-access");
    const answer = await fetch(bridge, {
      method: "POST",
      headers: { "content-type": "application/json", "x-qa-sparks-server-secret": bridgeToken },
      body: JSON.stringify({ action:"list", actorUsername:"health-probe", isAdmin:false }),
      signal: AbortSignal.timeout(12000),
    });
    const body = await answer.json().catch(() => ({}));
    checks.linkStorage = answer.ok && Array.isArray(body.links) ? "available" : "unavailable";
  } catch {
    checks.linkStorage = "unavailable";
  }
  quickAccessProbe = { until: Date.now() + 120000, value: checks };
  return checks;
}
