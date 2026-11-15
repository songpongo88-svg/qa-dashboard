import { createSign } from "node:crypto";

const PROJECT = "qa-dashboard-b0b5d";
const FIRESTORE = "https://firestore.googleapis.com/v1/projects/" + PROJECT + "/databases/(default)/documents";
const POLICY = "qa-session-policy-2026-07-15-v1";
let googleToken = "";
let googleTokenExpires = 0;
const fail = (message, status = 403) => { throw Object.assign(new Error(message), { status }); };
const safeName = (value) => String(value || "").trim().toLowerCase();
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
  if (!/^[a-z0-9._-]{1,100}$/.test(username) || !/^[a-zA-Z0-9_-]{10,180}$/.test(sessionId))
    fail("Please sign in to QA Dashboard again", 401);
  const token = await getGoogleToken();
  const session = await readDoc("qa_user_sessions/" + encodeURIComponent(sessionId), token);
  if (!session || safeName(session.username) !== username || session.status !== "active" ||
      session.policyVersion !== POLICY || !Number.isFinite(Date.parse(session.expiresAt)) ||
      Date.parse(session.expiresAt) <= Date.now())
    fail("QA Dashboard session has expired", 401);
  const control = await readDoc("qa_user_session_controls/" + encodeURIComponent(username), token);
  const cutoff = Date.parse(control?.revokedBefore || "");
  if (Number.isFinite(cutoff) && Date.parse(session.createdAt) <= cutoff)
    fail("QA Dashboard session was revoked", 401);
  if (!requireAdmin) return { username, admin: false };
  if (username !== "songpon" || session.role !== "Quality Assurance")
    fail("Only the QA Dashboard administrator can manage Quick Access links", 403);
  const profile = await readDoc("qa_user_profiles/" + encodeURIComponent(username), token);
  if (!profile || safeName(profile.username) !== username ||
      profile.role !== "Quality Assurance" || profile.status === "Suspended")
    fail("The QA administrator profile is not active", 403);
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
    return res.status(response.status).json(answer);
  } catch (error) {
    const status = Number(error?.status) || 503;
    if (status >= 500) console.error("Quick Access API unavailable", error instanceof Error ? error.name : "unknown");
    return res.status(status).json({ error: status >= 500 ? "QUICK_ACCESS_UNAVAILABLE" : String(error?.message || "UNAUTHORIZED") });
  }
}
