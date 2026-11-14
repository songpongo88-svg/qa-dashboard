import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import {
  signQaTicket, activateNewSession, requestTakeover, getTakeoverForOldBrowser,
  saveOwnedDraft, acknowledgeTakeover, commitTakeover, authorizeActiveSession,
} from "../server/qaSingleSessionAdmin.js";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
});
const originalEnv = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
const originalFetch = globalThis.fetch;
process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON = JSON.stringify({
  project_id: "qa-dashboard-b0b5d",
  private_key: privateKey,
  client_email: "fake-testing-service@qa-dashboard-b0b5d.iam.gserviceaccount.com",
});
const prefix = "projects/qa-dashboard-b0b5d/databases/(default)/documents/";
const db = new Map();
let revision = 0;
const stamp = () => new Date(1_500_000_000_000 + (++revision) * 1000).toISOString();
const docPayload = row => ({ fields: Object.fromEntries(Object.entries(row.values).map(([name, value]) => [
  name, value === null ? { nullValue: null } :
    typeof value === "number" ? { integerValue: String(value) } :
    typeof value === "boolean" ? { booleanValue: value } :
    { stringValue: String(value) },
])), updateTime: row.updateTime });
const fromFields = fields => Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [
  key, "integerValue" in value ? Number(value.integerValue) :
       "booleanValue" in value ? value.booleanValue :
       "stringValue" in value ? value.stringValue : null,
]));
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "content-type": "application/json" },
});
function precondition(previous, condition) {
  if (!condition) return true;
  if ("exists" in condition && Boolean(previous) !== condition.exists) return false;
  if ("updateTime" in condition && previous?.updateTime !== condition.updateTime) return false;
  return true;
}
globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  if (url === "https://oauth2.googleapis.com/token") return json({ access_token: "test-google-bearer", expires_in: 3600 });
  if (!url.startsWith("https://firestore.googleapis.com/v1/")) throw Error("Unmocked request " + url);
  const resource = decodeURIComponent(url.split("?")[0].replace("https://firestore.googleapis.com/v1/", ""));
  const method = options.method || "GET";
  if (resource === "projects/qa-dashboard-b0b5d/databases/(default)/documents:commit") {
    const writes = JSON.parse(options.body).writes;
    const pending = new Map(db);
    for (const write of writes) {
      const name = write.update?.name || write.delete;
      if (!name?.startsWith(prefix)) return json({ error: "Invalid document resource name" }, 400);
      const prior = pending.get(name);
      if (!precondition(prior, write.currentDocument)) return json({ error: "CAS conflict" }, 412);
      if (write.delete) pending.delete(name);
      else pending.set(name, { values: fromFields(write.update.fields), updateTime: stamp() });
    }
    db.clear(); for (const [key, val] of pending) db.set(key, val);
    return json({ writeResults: writes.map(() => ({})), commitTime: stamp() });
  }
  if (!resource.startsWith(prefix)) return json({ error: "Wrong collection path" }, 404);
  const prior = db.get(resource);
  if (method === "GET") return prior ? json(docPayload(prior)) : json({ error: "Not Found" }, 404);
  const u = new URL(url);
  const condition = u.searchParams.has("currentDocument.exists")
    ? { exists: u.searchParams.get("currentDocument.exists") === "true" }
    : u.searchParams.has("currentDocument.updateTime")
      ? { updateTime: u.searchParams.get("currentDocument.updateTime") } : null;
  if (!precondition(prior, condition)) return json({ error: "Conflict" }, 412);
  if (method === "DELETE") { db.delete(resource); return json({}); }
  if (method === "PATCH") {
    const values = fromFields(JSON.parse(options.body).fields);
    const saved = { values, updateTime: stamp() };
    db.set(resource, saved);
    return json(docPayload(saved));
  }
  return json({ error: "Unsupported" }, 405);
};
const ticketRequest = (type, username, sessionId = null) => {
  const expiresAt = Date.now() + 20 * 60 * 1000;
  const ticket = signQaTicket({ type, username, role: "Quality Assurance",
    ...(sessionId ? { sessionId } : {}), expiresAt });
  const cookieName = type === "session" ? "__Host-qa_single_session" : "__Host-qa_login_candidate";
  return { headers: { cookie: cookieName + "=" + encodeURIComponent(ticket) } };
};

try {
  const actor = { username: "test-agent", role: "Quality Assurance" };
  const started = await activateNewSession(actor, "Old Chrome");
  assert.equal(started.status, "active");
  assert.equal((await activateNewSession(actor, "Other browser")).status, "conflict");
  const oldBrowser = ticketRequest("session", actor.username, started.sessionId);
  const candidate = { username: actor.username, role: actor.role,
    candidateId: "123e4567-e89b-12d3-a456-426614174010" };
  const differentCandidate = { ...candidate,
    candidateId: "123e4567-e89b-12d3-a456-426614174011" };
  const proposed = await requestTakeover(candidate);
  assert.equal(proposed.status, "pending");
  // A retry must be idempotent, and cannot reset the 30-second draft deadline
  // or create another audit write. Another candidate must not take over this
  // in-progress handoff even when authenticated for the same QA account.
  const beforeRetryAuditCount = [...db.keys()].filter(key => key.includes("qa_single_session_audit/")).length;
  assert.deepEqual(await requestTakeover(candidate), proposed);
  assert.equal([...db.keys()].filter(key => key.includes("qa_single_session_audit/")).length,
    beforeRetryAuditCount, "Repeated takeover must not add a Firestore audit/write");
  await assert.rejects(requestTakeover(differentCandidate),
    error => error.code === "TAKEOVER_ALREADY_PENDING");
  assert.equal((await getTakeoverForOldBrowser(oldBrowser)).status, "flush_required");
  await assert.rejects(
    commitTakeover(differentCandidate, proposed.pendingId),
    error => error.code === "DRAFT_NOT_READY",
  );
  await assert.rejects(
    commitTakeover(candidate, proposed.pendingId),
    error => error.code === "DRAFT_NOT_READY",
  );
  const revisionId = Date.now();
  const draft = await saveOwnedDraft(oldBrowser, "evaluation-form", revisionId, {
    caseId: "AA123456", caseDescription: "Pending evaluation",
  });
  assert.equal(draft.revision, revisionId);
  const acknowledged = await acknowledgeTakeover(oldBrowser, proposed.pendingId, "evaluation-form", revisionId);
  assert.equal(acknowledged.status, "ready");
  await assert.rejects(commitTakeover(differentCandidate, proposed.pendingId),
    error => error.code === "DRAFT_NOT_READY");
  const replaced = await commitTakeover(candidate, proposed.pendingId);
  assert.equal(replaced.status, "active");
  assert.notEqual(replaced.sessionId, started.sessionId);
  assert.equal(db.get(prefix + "qa_single_session_active/test-agent").values.pendingCandidateId, "");
  await assert.rejects(authorizeActiveSession(oldBrowser), error => error.code === "SESSION_REPLACED");
  await assert.rejects(
    saveOwnedDraft(oldBrowser, "evaluation-form", revisionId + 1, { caseId: "AA123456" }),
    error => error.code === "SESSION_REPLACED",
  );
  const currentBrowser = ticketRequest("session", actor.username, replaced.sessionId);
  assert.equal((await authorizeActiveSession(currentBrowser)).ticket.sessionId, replaced.sessionId);
  // A browser cookie that is still cryptographically valid must not retain
  // privileged access after the authoritative session role/identity changes
  // or after the numeric deadline enforced by Firebase Rules has expired.
  const activeKey = prefix + "qa_single_session_active/test-agent";
  const originalActive = db.get(activeKey);
  for (const changes of [
    { role: "Suspended" },
    { username: "another-agent" },
    { expiresAtEpochMs: Date.now() - 1_000 },
  ]) {
    db.set(activeKey, {
      values: { ...originalActive.values, ...changes },
      updateTime: stamp(),
    });
    await assert.rejects(
      authorizeActiveSession(currentBrowser),
      error => error.code === "SESSION_REPLACED",
    );
  }
  db.set(activeKey, { ...originalActive, updateTime: stamp() });
  assert.equal((await authorizeActiveSession(currentBrowser)).ticket.sessionId, replaced.sessionId);
  assert.equal(db.get(prefix + "qa_single_session_drafts/test-agent_evaluation-form").values.revision, revisionId);
  assert.ok([...db.keys()].some(name => name.includes("qa_single_session_audit/")));
  console.log("PASS atomic QA takeover, saved draft, active-session switch and old-session rejection");
} finally {
  globalThis.fetch = originalFetch;
  if (originalEnv === undefined) delete process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
  else process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON = originalEnv;
}
