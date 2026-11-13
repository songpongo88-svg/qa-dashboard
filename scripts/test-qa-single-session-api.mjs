import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { generateKeyPairSync } from "node:crypto";
import handler from "../server/qaSingleSessionEndpoint.js";
import { signQaTicket, verifyQaTicket, visibleSessionState, issueSessionCookie } from "../server/qaSingleSessionAdmin.js";


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
try {
  delete process.env.QA_SINGLE_SESSION_ENABLED;
  let res = response();
  await handler({ method: "POST", headers: {}, body: { action: "login" } }, res);
  assert.equal(res.code, 503);
  assert.equal(res.body.code, "QA_SINGLE_SESSION_NOT_READY");

  process.env.QA_SINGLE_SESSION_ENABLED = "true";
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
  console.log("single QA server login and cookie security tests passed");
} finally {
  if (previousFlag === undefined) delete process.env.QA_SINGLE_SESSION_ENABLED;
  else process.env.QA_SINGLE_SESSION_ENABLED = previousFlag;
}
