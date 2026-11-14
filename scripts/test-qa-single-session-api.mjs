import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { generateKeyPairSync } from "node:crypto";
import handler from "../server/qaSingleSessionEndpoint.js";
import { qaSingleSessionReleaseApproved, SINGLE_SESSION_RELEASE_REQUIREMENTS } from "../server/qaSingleSessionReleaseGate.js";
import { signQaTicket, verifyQaTicket, visibleSessionState, issueSessionCookie, issueCandidateCookie, candidateFromRequest } from "../server/qaSingleSessionAdmin.js";


// Vercel Hobby capacity: QA session routing reuses one existing serverless function.
const vercelConfig = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
assert.ok(vercelConfig.rewrites?.some(rule =>
  rule.source === "/api/qa-single-session" &&
  rule.destination === "/api/sparks-auth?__qa_single_session=1"),
  "QA session requests must be rewritten to the shared auth function");

function response() {
  return {
    code: 200, headers: {}, body: null,
    setHeader(key, value) { this.headers[key] = value; return this; },
    status(value) { this.code = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

// A Firestore Commit write requires a relative document resource name,
// NOT the full https://firestore.googleapis.com REST URL.
const sessionBackend = await readFile(new URL("../server/qaSingleSessionAdmin.js", import.meta.url), "utf8");
assert.ok(sessionBackend.includes('const DOCUMENT_PATH = "projects/"'), "Firestore Commit path must be relative");
assert.ok(sessionBackend.includes("const sessionName = DOCUMENT_PATH + SESSION_COLLECTION"),
  "Session CAS must use a Firestore resource name");
assert.ok(sessionBackend.includes("const auditName = DOCUMENT_PATH + AUDIT_COLLECTION"),
  "Atomic session audit must use a Firestore resource name");
assert.ok(sessionBackend.includes("const draftName = DOCUMENT_PATH + DRAFT_COLLECTION"),
  "Atomic draft write must use a Firestore resource name");
assert.ok(sessionBackend.includes("currentDocument: { updateTime: current.updateTime }"),
  "Draft commit must reject a session version that changed");

// Guard against silently decoupling the QA Sparks identity from the active QA
// Dashboard session on the server. These checks prevent accidental regressions
// while direct Supabase RPC/RLS enforcement is being migrated separately.
const sparksAuthBackend = await readFile(new URL("../server/sparksSupabaseAuth.js", import.meta.url), "utf8");
assert.match(sparksAuthBackend, /async function enforceSparksQaSessionBinding\(actor, req\)/,
  "QA Sparks must bind its verified actor to the QA Dashboard session");
assert.match(sparksAuthBackend, /if \(!sessionPolicyEnabled\(\)\) return;/,
  "Sparks session gate must follow the QA rollout flag");
assert.match(sparksAuthBackend, /const \{ ticket \} = await authorizeActiveSession\(req\);/,
  "Sparks must validate the active server-side QA session");
assert.match(sparksAuthBackend, /ticket\.username\)\.toLowerCase\(\) !== String\(actor\?\.username/,
  "Sparks and QA must have the same trusted username");
assert.match(sparksAuthBackend, /ticket\.role\)\.toLowerCase\(\) !== String\(actor\?\.role/,
  "Sparks and QA must have the same trusted role");
assert.match(sparksAuthBackend, /await enforceSparksQaSessionBinding\(actor, ctx\.req\);/,
  "Sparks identity binding must run before the request actor is cached");
assert.ok(sparksAuthBackend.indexOf("await enforceSparksQaSessionBinding(actor, ctx.req);") <
  sparksAuthBackend.indexOf("ctx.actor = actor;"),
  "Sparks must never cache a trusted actor before session validation");
assert.ok(sparksAuthBackend.indexOf("await enforceSparksQaSessionBinding(actor, ctx.req);") <
  sparksAuthBackend.indexOf("if (refreshedSession) setCookies(ctx.res, refreshedSession);"),
  "Sparks must not rotate refresh cookies before active-session verification");
assert.match(sparksAuthBackend, /if \(req\) await enforceSparksQaSessionBinding\(actor, req\);/,
  "Sparks login exchange must verify the QA browser session before issuing cookies");

// Sparks browser actions must not fall back to legacy Firebase identity when
// QA Single Active Session is enabled. Cron GET requests remain separately signed.
const sparksAdminBackend = await readFile(new URL("../api/sparks-admin.js", import.meta.url), "utf8");
assert.ok(sparksAdminBackend.includes("sessionPolicyEnabled() ||"), "Sparks hybrid auth must not bypass unified QA sessions");
assert.ok(sparksAdminBackend.includes("if (sessionPolicyEnabled()) await authorizeActiveSession(req);"),
  "Every Sparks browser API action must validate the current QA session");
assert.ok(sparksAdminBackend.indexOf("if (sessionPolicyEnabled()) await authorizeActiveSession(req);") >
  sparksAdminBackend.indexOf('if (req.method !== "POST") return res.status(405)'),
  "The browser guard must not break separately authenticated cron GET requests");
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048,
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
});
const now = 1_000_000;
const signed = signQaTicket({
  type: "session", username: "agent", sessionId: "123e4567-e89b-12d3-a456-426614174000",
  expiresAt: now + 30_000,
}, privateKey);
assert.equal(verifyQaTicket(signed, "session", privateKey, now)?.username, "agent");
assert.equal(verifyQaTicket(signed, "candidate", privateKey, now), null);
assert.equal(verifyQaTicket(signed, "session", privateKey, now + 30_001), null);
assert.equal(verifyQaTicket(signed.slice(0, -3) + "xyz", "session", privateKey, now), null);
assert.equal(verifyQaTicket("", "session", privateKey, now), null);
assert.equal(verifyQaTicket("", "session"), null);
// Cookie rotation must revoke the short-lived takeover candidate ticket.
const responseHeaders = { setHeader(name, value) { this[name] = value; } };
const oldQaServiceEnv = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON = JSON.stringify({
  project_id: "qa-dashboard-b0b5d", private_key: privateKey,
});
issueCandidateCookie(responseHeaders, { username: "agent", role: "Quality Assurance" });
const candidateSetCookie = responseHeaders["Set-Cookie"];
const candidateCookie = String(candidateSetCookie).split(";")[0];
const issuedCandidate = candidateFromRequest({ headers: { cookie: candidateCookie } });
assert.match(issuedCandidate.candidateId, /^[0-9a-f-]{36}$/i);
assert.equal(issuedCandidate.username, "agent");
const legacyCandidate = signQaTicket({ type: "candidate", username: "agent",
  role: "Quality Assurance", expiresAt: Date.now() + 30_000 });
assert.equal(verifyQaTicket(legacyCandidate, "candidate"), null,
  "An old candidate ticket without a unique request ID must be rejected");
issueSessionCookie(responseHeaders, { username: "agent", role: "Quality Assurance" },
  "123e4567-e89b-12d3-a456-426614174000");
assert.equal(responseHeaders["Set-Cookie"].length, 2);
assert.match(responseHeaders["Set-Cookie"][0], /^__Host-qa_single_session=/);
assert.match(responseHeaders["Set-Cookie"][1], /^__Host-qa_login_candidate=;.*Max-Age=0/);
if (oldQaServiceEnv === undefined) delete process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
else process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON = oldQaServiceEnv;

assert.equal(visibleSessionState({ expiresAt: new Date(now + 30_000).toISOString(),
  deviceLabel: "Chrome" }, now).status, "conflict");
assert.equal(visibleSessionState({ expiresAt: new Date(now - 30_000).toISOString() }, now).status, "none");

const previousFlag = process.env.QA_SINGLE_SESSION_ENABLED;
const previousApprovals = Object.fromEntries(
  SINGLE_SESSION_RELEASE_REQUIREMENTS.map(key => [key, process.env[key]]),
);
try {
  delete process.env.QA_SINGLE_SESSION_ENABLED;
  for (const key of SINGLE_SESSION_RELEASE_REQUIREMENTS) delete process.env[key];
  let res = response();
  await handler({ method: "POST", headers: {}, body: { action: "login" } }, res);
  assert.equal(res.code, 503);
  assert.equal(res.body.code, "QA_SINGLE_SESSION_NOT_READY");

  process.env.QA_SINGLE_SESSION_ENABLED = "true";
  assert.equal(qaSingleSessionReleaseApproved(), false);
  res = response();
  await handler({ method: "POST", headers: {}, body: { action: "validate" } }, res);
  assert.equal(res.code, 503);
  assert.equal(res.body.code, "QA_SINGLE_SESSION_SECURITY_REVIEW_REQUIRED");
  for (const key of SINGLE_SESSION_RELEASE_REQUIREMENTS.slice(0, -1)) {
    process.env[key] = "true";
  }
  assert.equal(qaSingleSessionReleaseApproved(), false);
  res = response();
  await handler({ method: "POST", headers: {}, body: { action: "login", username: "agent", password: "wrong" } }, res);
  assert.equal(res.code, 503);
  assert.equal(res.body.code, "QA_SINGLE_SESSION_SECURITY_REVIEW_REQUIRED");
  // Emergency logout still clears expired/replaced cookies without signoff.
  res = response();
  await handler({ method: "POST", headers: {}, body: { action: "logout" } }, res);
  assert.equal(res.code, 200);
  assert.ok(res.headers["Set-Cookie"].every(value => value.includes("Max-Age=0")));
  for (const key of SINGLE_SESSION_RELEASE_REQUIREMENTS) process.env[key] = "true";
  assert.equal(qaSingleSessionReleaseApproved(), true);
  res = response();
  await handler({ method: "GET", headers: {} }, res);
  assert.equal(res.code, 405);

  res = response();
  await handler({
    method: "POST",
    headers: { origin: "https://evil.example", host: "qa.example", "sec-fetch-site": "cross-site" },
    body: { action: "login" },
  }, res);
  assert.equal(res.code, 403);

  res = response();
  await handler({ method: "POST", headers: { host: "qa.example", origin: "https://qa.example" }, body: "{" }, res);
  assert.equal(res.code, 400);

  res = response();
  await handler({ method: "POST", headers: {}, body: { action: "unknown" } }, res);
  assert.equal(res.code, 400);

  res = response();
  await handler({ method: "POST", headers: {}, body: { action: "login", username: "../invalid", password: "x" } }, res);
  assert.equal(res.code, 401);
  assert.equal(res.body.code, "INVALID_QA_LOGIN");

  res = response();
  await handler({ method: "POST", headers: {}, body: { action: "validate" } }, res);
  assert.equal(res.code, 401);
  assert.equal(res.body.code, "SESSION_EXPIRED");

  // Logout is idempotent after expiry/replacement and clears both browser
  // cookies, without deleting another browser's active session pointer.
  res = response();
  await handler({ method: "POST", headers: {}, body: { action: "logout" } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.status, "logged_out");
  assert.equal(res.headers["Set-Cookie"].length, 2);
  assert.ok(res.headers["Set-Cookie"].every(value => value.includes("Max-Age=0")));
  console.log("single QA server login and cookie security tests passed");
} finally {
  if (previousFlag === undefined) delete process.env.QA_SINGLE_SESSION_ENABLED;
  else process.env.QA_SINGLE_SESSION_ENABLED = previousFlag;
  for (const [key, value] of Object.entries(previousApprovals)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
