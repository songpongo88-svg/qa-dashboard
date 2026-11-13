import { createPublicKey, createSign, createVerify, randomUUID } from "node:crypto";
import { googleAccessToken, normalizeQaUsername } from "./qaFirebaseCredentials.js";

const PROJECT_ID = "qa-dashboard-b0b5d";
const RESOURCE = "https://firestore.googleapis.com/v1/projects/" + PROJECT_ID +
  "/databases/(default)/documents/";
const SESSION_COLLECTION = "qa_single_session_active";
const DRAFT_COLLECTION = "qa_single_session_drafts";
const AUDIT_COLLECTION = "qa_single_session_audit";
const COOKIE_SESSION = "__Host-qa_single_session";
const COOKIE_CANDIDATE = "__Host-qa_login_candidate";
const TTL_MS = 30 * 60 * 1000;
const CANDIDATE_TTL_MS = 2 * 60 * 1000;
const TAKEOVER_TTL_MS = 30 * 1000;
const MAX_DRAFT_BYTES = 120_000;

export const sessionPolicyEnabled = () => process.env.QA_SINGLE_SESSION_ENABLED === "true";

function fail(message, status = 403, code = "QA_SESSION_REJECTED") {
  return Object.assign(new Error(message), { status, code });
}

function serviceKey() {
  let account;
  try { account = JSON.parse(process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON || ""); }
  catch { throw fail("QA session service unavailable", 503, "QA_AUTH_NOT_CONFIGURED"); }
  if (account.project_id !== PROJECT_ID || !account.private_key ||
      typeof account.private_key !== "string") {
    throw fail("QA session service unavailable", 503, "QA_AUTH_NOT_CONFIGURED");
  }
  return account.private_key;
}

function b64json(data) { return Buffer.from(JSON.stringify(data), "utf8").toString("base64url"); }

export function signQaTicket(input, privateKey = serviceKey()) {
  const payload = { ...input, audience: "qa-dashboard-single-session-v1" };
  const message = b64json(payload);
  const signer = createSign("RSA-SHA256");
  signer.update(message); signer.end();
  return message + "." + signer.sign(privateKey).toString("base64url");
}

export function verifyQaTicket(ticket, expectedType, privateKey = serviceKey(), now = Date.now()) {
  if (typeof ticket !== "string" || ticket.length > 6_000) return null;
  const [payload, signature, extra] = ticket.split(".");
  if (!payload || !signature || extra) return null;
  const verifier = createVerify("RSA-SHA256");
  verifier.update(payload); verifier.end();
  let valid = false;
  try { valid = verifier.verify(createPublicKey(privateKey), Buffer.from(signature, "base64url")); }
  catch { return null; }
  if (!valid) return null;
  let body;
  try { body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); }
  catch { return null; }
  if (!body || body.audience !== "qa-dashboard-single-session-v1" || body.type !== expectedType ||
      !normalizeQaUsername(body.username) || !Number.isFinite(body.expiresAt) ||
      body.expiresAt <= now || body.expiresAt > now + TTL_MS + 60_000) return null;
  if (expectedType === "session" && !/^[0-9a-f-]{36}$/i.test(body.sessionId || "")) return null;
  return body;
}

function cookies(req) {
  const out = new Map();
  for (const item of String(req.headers?.cookie || "").split(";")) {
    const at = item.indexOf("=");
    if (at < 0) continue;
    try { out.set(item.slice(0, at).trim(), decodeURIComponent(item.slice(at + 1).trim())); }
    catch { /* ignore invalid cookie */ }
  }
  return out;
}

function cookieHeader(name, value, seconds) {
  return name + "=" + encodeURIComponent(value) +
    "; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=" + seconds;
}
export function issueSessionCookie(res, actor, sessionId, now = Date.now()) {
  const ticket = signQaTicket({ type: "session", username: actor.username, role: actor.role,
    sessionId, issuedAt: now, expiresAt: now + TTL_MS });
  res.setHeader("Set-Cookie", cookieHeader(COOKIE_SESSION, ticket, 1800));
}
export function issueCandidateCookie(res, actor, now = Date.now()) {
  const ticket = signQaTicket({ type: "candidate", username: actor.username,
    role: actor.role, issuedAt: now, expiresAt: now + CANDIDATE_TTL_MS });
  res.setHeader("Set-Cookie", cookieHeader(COOKIE_CANDIDATE, ticket, 120));
}
export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", [
    cookieHeader(COOKIE_SESSION, "", 0), cookieHeader(COOKIE_CANDIDATE, "", 0),
  ]);
}
export function candidateFromRequest(req) {
  const ticket = verifyQaTicket(cookies(req).get(COOKIE_CANDIDATE), "candidate");
  if (!ticket) throw fail("Please verify your QA password again", 401, "LOGIN_EXPIRED");
  return ticket;
}
export function sessionFromRequest(req) {
  const ticket = verifyQaTicket(cookies(req).get(COOKIE_SESSION), "session");
  if (!ticket) throw fail("Your QA session is invalid or expired", 401, "SESSION_EXPIRED");
  return ticket;
}

function encodeField(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number" && Number.isSafeInteger(value)) return { integerValue: String(value) };
  return { stringValue: String(value) };
}
function fieldsFor(row) {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, encodeField(v)]));
}
function parseFields(fields = {}) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if ("stringValue" in v) out[k] = v.stringValue;
    else if ("integerValue" in v) out[k] = Number(v.integerValue);
    else if ("booleanValue" in v) out[k] = v.booleanValue;
    else if ("nullValue" in v) out[k] = null;
  }
  return out;
}
async function rest(method, collection, id, data = null, expectedUpdateTime = undefined) {
  if (!/^[a-z0-9_-]{3,64}$/.test(collection) || !/^[a-z0-9._-]{2,120}$/i.test(id)) {
    throw fail("Invalid QA document identifier", 400);
  }
  const url = new URL(RESOURCE + collection + "/" + encodeURIComponent(id));
  if (method !== "GET" && method !== "POST") {
    if (expectedUpdateTime === null) url.searchParams.set("currentDocument.exists", "false");
    else if (expectedUpdateTime) url.searchParams.set("currentDocument.updateTime", expectedUpdateTime);
  }
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: "Bearer " + await googleAccessToken(),
      ...(data ? { "content-type": "application/json" } : {}),
    },
    body: data ? JSON.stringify({ fields: fieldsFor(data) }) : undefined,
    cache: "no-store", signal: AbortSignal.timeout(10_000),
  });
  if (method === "GET" && response.status === 404) return null;
  if (response.status === 409 || response.status === 412 || response.status === 400) {
    if (method !== "GET") throw fail("Session was changed by another browser", 409, "SESSION_RACE");
  }
  if (!response.ok) throw fail("QA session service temporarily unavailable", 503, "SESSION_BACKEND_UNAVAILABLE");
  if (method === "DELETE") return null;
  const document = await response.json();
  return { ...parseFields(document.fields), updateTime: document.updateTime };
}
export const readActive = username => rest("GET", SESSION_COLLECTION, normalizeQaUsername(username));
async function writeActive(username, row, updateTime) {
  return rest("PATCH", SESSION_COLLECTION, normalizeQaUsername(username), row, updateTime);
}
async function deleteActive(username, updateTime) {
  return rest("DELETE", SESSION_COLLECTION, normalizeQaUsername(username), null, updateTime);
}
async function audit(username, sessionId, action) {
  try {
    await rest("PATCH", AUDIT_COLLECTION, randomUUID(), {
      username, sessionId, action, createdAt: new Date().toISOString(),
    }, null);
  } catch (error) { console.warn("QA session audit unavailable", error?.code || "write"); }
}
function activeNow(row, now = Date.now()) {
  return Boolean(row && Number.isFinite(Date.parse(row.expiresAt)) &&
    Date.parse(row.expiresAt) > now);
}
export function visibleSessionState(row, now = Date.now()) {
  if (!activeNow(row, now)) return { status: "none" };
  return { status: "conflict", deviceLabel: String(row.deviceLabel || "Other browser").slice(0, 60) };
}
export async function activateNewSession(actor, deviceLabel = "Browser") {
  const current = await readActive(actor.username);
  if (activeNow(current)) return visibleSessionState(current);
  const sessionId = randomUUID();
  const row = { username: actor.username, sessionId, role: actor.role,
    deviceLabel: String(deviceLabel).slice(0, 60),
    createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
    pendingId: "", pendingSessionId: "", pendingAt: "", pendingDeadline: "", ackRevision: -1,
  };
  await writeActive(actor.username, row, current?.updateTime || null);
  await audit(actor.username, sessionId, "login");
  return { status: "active", sessionId };
}
export async function authorizeActiveSession(req) {
  const ticket = sessionFromRequest(req);
  const current = await readActive(ticket.username);
  if (!activeNow(current) || current.sessionId !== ticket.sessionId) {
    throw fail("Session has moved to another browser", 401, "SESSION_REPLACED");
  }
  return { ticket, current };
}
export async function requestTakeover(candidate) {
  const current = await readActive(candidate.username);
  if (!activeNow(current)) return { status: "retry_login" };
  const pendingId = randomUUID();
  const sessionId = randomUUID();
  const now = Date.now();
  const next = { ...current, pendingId, pendingSessionId: sessionId,
    pendingAt: new Date(now).toISOString(),
    pendingDeadline: new Date(now + TAKEOVER_TTL_MS).toISOString(), ackRevision: -1 };
  delete next.updateTime;
  await writeActive(candidate.username, next, current.updateTime);
  await audit(candidate.username, sessionId, "takeover_requested");
  return { status: "pending", pendingId, deadline: next.pendingDeadline };
}
export async function getTakeoverForOldBrowser(req) {
  const { current } = await authorizeActiveSession(req);
  if (!current.pendingId || Date.parse(current.pendingDeadline) < Date.now()) return { status: "none" };
  return { status: "flush_required", pendingId: current.pendingId,
    deadline: current.pendingDeadline };
}
export async function saveOwnedDraft(req, documentKey, revision, snapshot) {
  const { ticket } = await authorizeActiveSession(req);
  if (!/^[a-zA-Z0-9._-]{2,90}$/.test(documentKey || "") ||
      !Number.isSafeInteger(revision) || revision < 0 ||
      !snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw fail("Invalid recovery draft", 400);
  }
  const serialized = JSON.stringify(snapshot);
  if (Buffer.byteLength(serialized, "utf8") > MAX_DRAFT_BYTES) throw fail("Draft too large", 413);
  const id = ticket.username + "_" + documentKey.toLowerCase();
  const previous = await rest("GET", DRAFT_COLLECTION, id);
  if (previous && previous.revision > revision) throw fail("Newer draft exists", 409);
  const updated = await rest("PATCH", DRAFT_COLLECTION, id,
    { username: ticket.username, sessionId: ticket.sessionId, documentKey,
      revision, snapshot: serialized, savedAt: new Date().toISOString() },
    previous?.updateTime || null);
  return { revision: updated.revision, savedAt: updated.savedAt };
}
export async function acknowledgeTakeover(req, pendingId, documentKey, revision) {
  const { ticket, current } = await authorizeActiveSession(req);
  if (!pendingId || current.pendingId !== pendingId || Date.parse(current.pendingDeadline) <= Date.now()) {
    throw fail("Takeover acknowledgment expired", 409);
  }
  const draft = await rest("GET", DRAFT_COLLECTION, ticket.username + "_" + documentKey.toLowerCase());
  if (!draft || draft.sessionId !== ticket.sessionId || draft.revision < revision ||
      Date.parse(draft.savedAt) < Date.parse(current.pendingAt)) {
    throw fail("Server has not confirmed the final draft", 409, "DRAFT_NOT_SAVED");
  }
  const updated = { ...current, ackRevision: revision }; delete updated.updateTime;
  await writeActive(ticket.username, updated, current.updateTime);
  return { status: "ready" };
}
export async function commitTakeover(candidate, pendingId) {
  const current = await readActive(candidate.username);
  if (!activeNow(current) || !pendingId || current.pendingId !== pendingId ||
      current.ackRevision < 0 || Date.parse(current.pendingDeadline) <= Date.now()) {
    throw fail("Draft saving has not finished", 409, "DRAFT_NOT_READY");
  }
  const next = { ...current, sessionId: current.pendingSessionId, role: candidate.role,
    deviceLabel: "New browser", createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
    pendingId: "", pendingSessionId: "", pendingAt: "", pendingDeadline: "", ackRevision: -1 };
  delete next.updateTime;
  await writeActive(candidate.username, next, current.updateTime);
  await audit(candidate.username, next.sessionId, "takeover");
  return { status: "active", sessionId: next.sessionId };
}
export async function renewActiveSession(req) {
  const { ticket, current } = await authorizeActiveSession(req);
  const next = { ...current, expiresAt: new Date(Date.now() + TTL_MS).toISOString() };
  delete next.updateTime;
  await writeActive(ticket.username, next, current.updateTime);
  return { sessionId: ticket.sessionId, username: ticket.username, role: ticket.role };
}
export async function revokeOwnSession(req) {
  const { ticket, current } = await authorizeActiveSession(req);
  await deleteActive(ticket.username, current.updateTime);
  await audit(ticket.username, ticket.sessionId, "logout");
}
export async function clearOwnedDraft(req, documentKey) {
  const { ticket } = await authorizeActiveSession(req);
  if (!/^[a-zA-Z0-9._-]{2,90}$/.test(documentKey || "")) throw fail("Invalid draft", 400);
  const id = ticket.username + "_" + documentKey.toLowerCase();
  const draft = await rest("GET", DRAFT_COLLECTION, id);
  if (!draft) return { status: "cleared" };
  await rest("DELETE", DRAFT_COLLECTION, id, null, draft.updateTime);
  return { status: "cleared" };
}
export async function fetchOwnedDraft(req, documentKey) {
  const { ticket } = await authorizeActiveSession(req);
  if (!/^[a-zA-Z0-9._-]{2,90}$/.test(documentKey || "")) throw fail("Invalid draft", 400);
  const draft = await rest("GET", DRAFT_COLLECTION, ticket.username + "_" + documentKey.toLowerCase());
  if (!draft) return null;
  return { revision: draft.revision, savedAt: draft.savedAt, snapshot: JSON.parse(draft.snapshot) };
}
