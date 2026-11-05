import { createSign, createHash, timingSafeEqual } from "node:crypto";

// Use the same explicit Firebase project as src/firebaseClient.ts. VITE_* build
// variables are not a reliable server-side source and may point elsewhere.
const FIRESTORE_PROJECT = "qa-dashboard-b0b5d";
const API_ROOT = "https://firestore.googleapis.com/v1/projects/" + encodeURIComponent(FIRESTORE_PROJECT) + "/databases/(default)/documents";
const SESSION_POLICY = "qa-session-policy-2026-07-15-v1";
const ADMIN_USERNAME = "songpon";
const policyErrorCode = "SESSION_POLICY_OUTDATED";
let accessToken = "";
let tokenExpiry = 0;

const normalize = (value) => String(value || "").trim().toLowerCase();
const safeUsername = (value) => {
  const name = normalize(value);
  if (!name || name.length > 100 || /[\/\\]/.test(name)) throw Object.assign(new Error("Invalid username"), { status: 400 });
  return name;
};
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const docPart = (v) => encodeURIComponent(String(v || ""));
const walletKey = (username) => encodeURIComponent(safeUsername(username));
const path = (...parts) => parts.map(docPart).join("/");

function decodeValue(v) {
  if (!v || v.nullValue !== undefined) return null;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("mapValue" in v) return decodeFields(v.mapValue.fields || {});
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(decodeValue);
  return null;
}
function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields || {}).map(([k, v]) => [k, decodeValue(v)]));
}
function encodeValue(v) {
  if (v == null) return { nullValue: "NULL_VALUE" };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  if (typeof v === "object") return { mapValue: { fields: encodeFields(v) } };
  fail("Invalid Firestore value", 500);
}
function encodeFields(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, encodeValue(v)]));
}
function recordValue(doc) {
  return doc?.fields ? decodeFields(doc.fields) : {};
}
function base64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}
async function getAccessToken() {
  if (accessToken && Date.now() + 60000 < tokenExpiry) return accessToken;
  const source = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!source) fail("กรุณาตั้งค่า FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON (Firebase Service Account) ใน Vercel Production", 503);
  let account;
  try { account = JSON.parse(source); } catch { fail("ข้อมูล Service Account JSON ไม่ถูกต้อง กรุณาตรวจสอบการตั้งค่า Vercel", 503); }
  if (!account?.client_email || !account?.private_key) fail("Service Account JSON ขาด client_email หรือ private_key", 503);
  const now = Math.floor(Date.now() / 1000);
  const header = base64url({ alg: "RS256", typ: "JWT" });
  const payload = base64url({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });
  const signingInput = header + "." + payload;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const jwt = signingInput + "." + signer.sign(String(account.private_key).replace(/\\n/g, "\n")).toString("base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    // Expose only the OAuth error category, never a token or credential.
    const code = /^[a-z_]{3,40}$/.test(String(data.error || "")) ? data.error : "authentication_failed";
    console.error("Sparks Admin Google OAuth failed:", response.status, code);
    fail("Google Cloud ไม่ยอมรับ Service Account (" + code + ") กรุณาตั้งค่า Firebase Admin Service Account ใหม่ใน Vercel", 503);
  }
  accessToken = data.access_token;
  tokenExpiry = Date.now() + (Number(data.expires_in) || 3600) * 1000;
  return accessToken;
}
async function firestoreRequest(endpoint, method = "GET", body) {
  const token = await getAccessToken();
  const response = await fetch(endpoint.startsWith("https:") ? endpoint : API_ROOT + endpoint, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      "content-type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json().catch(() => ({}));
  if (response.status === 404) return null;
  if (!response.ok) {
    const detail = String(result?.error?.status || result?.error?.message || "Firestore request failed");
    const status = response.status === 403 ? 503 : response.status >= 500 ? 503 : response.status;
    throw Object.assign(new Error(detail), { status, firestoreStatus: result?.error?.status || "" });
  }
  return result;
}
async function readDoc(documentPath, transaction = "") {
  const suffix = transaction ? "?transaction=" + encodeURIComponent(transaction) : "";
  return firestoreRequest("/" + documentPath + suffix);
}
async function listCollection(collectionPath, mask = []) {
  const out = [];
  let pageToken = "";
  for (let page = 0; page < 15; page++) {
    const url = new URL(API_ROOT + "/" + collectionPath);
    url.searchParams.set("pageSize", "200");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    for (const field of mask) url.searchParams.append("mask.fieldPaths", field);
    const result = await firestoreRequest(url.toString());
    out.push(...(result?.documents || []));
    pageToken = result?.nextPageToken || "";
    if (!pageToken) return { documents: out, truncated: false };
  }
  return { documents: out, truncated: true };
}
async function authorizeAdmin(body, { allowLegacyPolicy = false } = {}) {
  const username = safeUsername(body.actorUsername);
  const sessionId = String(body.sessionId || "");
  if (username !== ADMIN_USERNAME || !/^[a-zA-Z0-9_-]{10,180}$/.test(sessionId)) fail("Unauthorized", 403);
  const sessionDocument = await readDoc(path("qa_user_sessions", sessionId));
  if (!sessionDocument) fail("QA session not found in the configured Firestore project. Please sign in to QA Dashboard again.", 403);
  const session = recordValue(sessionDocument);
  if (normalize(session.username) !== ADMIN_USERNAME) fail("QA session account does not match the administrator.", 403);
  if (session.role !== "Quality Assurance") fail("QA session does not have the Quality Assurance role.", 403);
  if (session.status !== "active") fail("QA session was revoked. Please sign in again.", 403);
  if (!Number.isFinite(Date.parse(session.expiresAt || "")) || Date.parse(session.expiresAt || "") <= Date.now()) {
    fail("QA session has expired. Please sign in again.", 403);
  }
  const revoked = recordValue(await readDoc(path("qa_user_session_controls", ADMIN_USERNAME)));
  const revokedAt = Date.parse(revoked.revokedBefore || "");
  if (Number.isFinite(revokedAt) && Date.parse(session.createdAt || "") <= revokedAt) fail("Session revoked", 403);
  const profileData = await findProfileByUsername(ADMIN_USERNAME);
  if (normalize(profileData.username) !== ADMIN_USERNAME || profileData.role !== "Quality Assurance" || isSuspendedProfile(profileData)) {
    fail("Sparks Admin account is not active in QA User Management or lacks the Quality Assurance role.", 403);
  }
  if (!allowLegacyPolicy && session.policyVersion !== SESSION_POLICY) {
    const grant = recordValue(await readDoc(path("qa_sparks_admin_session_grants", sessionId)));
    const approved = grant.username === ADMIN_USERNAME
      && grant.sessionCreatedAt === session.createdAt
      && grant.policyVersion === SESSION_POLICY
      && grant.method === "qa-password"
      && Number.isFinite(Date.parse(grant.expiresAt || ""))
      && Date.parse(grant.expiresAt || "") > Date.now();
    if (!approved) throw Object.assign(new Error("QA session policy needs administrator verification."), { status: 403, code: policyErrorCode });
  }
  return { username: ADMIN_USERNAME, displayName: String(session.displayName || "Songpon Phothong") };
}
function bangkokToday() {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Bangkok" }).format(new Date());
}
function isSuspendedProfile(profile) {
  const status = normalize(profile?.status);
  const effective = String(profile?.suspendEffectiveDate || profile?.suspend_effective_date || profile?.suspendDate || profile?.suspend_date || "");
  const end = String(profile?.suspendEndDate || profile?.suspend_end_date || "");
  const autoReactivate = profile?.suspendAutoReactivate === true || profile?.suspend_auto_reactivate === true;
  const today = bangkokToday();
  let suspended = status === "suspended" || (effective && effective <= today);
  if (suspended && autoReactivate && end && end <= today) suspended = false;
  return Boolean(suspended);
}
async function findProfileByUsername(username) {
  const name = safeUsername(username);
  for (const id of [name.charAt(0).toUpperCase() + name.slice(1), name]) {
    const row = await readDoc(path("qa_user_profiles", id));
    const profile = recordValue(row);
    if (normalize(profile.username) === name) return profile;
  }
  const all = await listCollection("qa_user_profiles", ["username", "role", "status", "suspendEffectiveDate", "suspendEndDate", "suspendAutoReactivate"]);
  const match = all.documents.map(recordValue).find((profile) => normalize(profile.username) === name);
  if (!match) fail("User not found in QA User Management", 404);
  return match;
}
async function requireActiveTarget(username) {
  const profile = await findProfileByUsername(username);
  if (isSuspendedProfile(profile)) fail("ไม่สามารถจัดการ Sparks ของบัญชี Suspended ได้", 403);
  return profile;
}
async function reauthorizeAdminSession(body) {
  // A stale policy is repaired only with a live QA session, the active QA role
  // and the current QA account password. Do not silently accept old policies.
  const admin = await authorizeAdmin(body, { allowLegacyPolicy: true });
  const profile = await findProfileByUsername(admin.username);
  const typedPassword = String(body.password || "");
  const storedPassword = String(profile.password || "");
  if (!storedPassword || !typedPassword || typedPassword.length > 512) fail("กรุณากรอกรหัสผ่านบัญชี QA ที่ใช้งานปัจจุบัน", 403);
  const supplied = createHash("sha256").update(typedPassword).digest();
  const expected = createHash("sha256").update(storedPassword).digest();
  if (!timingSafeEqual(supplied, expected)) fail("รหัสผ่าน QA ไม่ถูกต้อง", 403);
  const sessionId = String(body.sessionId || "");
  const sessionPath = path("qa_user_sessions", sessionId);
  const sessionDocument = await readDoc(sessionPath);
  if (!sessionDocument) fail("QA session not found", 403);
  const session = recordValue(sessionDocument);
  // Keep QA's original central-session policy untouched. The server grants only
  // a short-lived Sparks-specific permission after password verification.
  const expiresAt = new Date(Math.min(Date.now() + 60 * 60 * 1000, Date.parse(session.expiresAt || "")));
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) fail("QA session has expired", 403);
  await firestoreRequest("/" + path("qa_sparks_admin_session_grants", sessionId), "PATCH", {
    fields: encodeFields({
      username: ADMIN_USERNAME,
      sessionCreatedAt: String(session.createdAt || ""),
      policyVersion: SESSION_POLICY,
      method: "qa-password",
      verifiedAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
    }),
  });
  return { verified: true };
}
const balance = (x) => Number.isSafeInteger(Number(x)) ? Math.max(0, Number(x)) : 0;
function summary(wallet) {
  const initialEarn = Math.max(0, Number(wallet.firstLogin?.amount || 0));
  return {
    balance: balance(wallet.balance),
    rewardOrders: balance(wallet.rewardOrders),
    earned: Math.max(initialEarn, balance(wallet.totalEarned)),
    spent: balance(wallet.totalSpent),
    firstLogin: wallet.firstLogin ? {
      cardId: String(wallet.firstLogin.cardId || ""),
      cardName: String(wallet.firstLogin.cardName || ""),
      amount: balance(wallet.firstLogin.amount),
      claimedAt: String(wallet.firstLogin.claimedAt || ""),
    } : null,
  };
}
function toHistory(doc) {
  const row = recordValue(doc);
  return {
    id: decodeURIComponent(String(doc.name || "").split("/").pop() || ""),
    createdAt: String(row.createdAt || ""),
    type: Number(row.amount) < 0 ? "spend" : "earn",
    title: String(row.title || ""),
    detail: String(row.detail || ""),
    source: String(row.source || ""),
    amount: Number(row.amount) || 0,
    balanceAfter: balance(row.balanceAfter),
    performedBy: String(row.performedBy || ""),
    reason: String(row.reason || ""),
    referenceId: String(row.referenceId || ""),
    status: String(row.status || ""),
  };
}
async function listUsers() {
  const [profilePages, walletPages] = await Promise.all([
    listCollection("qa_user_profiles", ["username", "displayName", "agentName", "role", "status", "suspendEffectiveDate", "suspendEndDate", "suspendAutoReactivate"]),
    listCollection("qa_sparks_wallets", ["username", "balance", "totalEarned", "totalSpent", "rewardOrders", "firstLogin"]),
  ]);
  const wallets = new Map(walletPages.documents.map((doc) => {
    const v = recordValue(doc);
    const name = normalize(v.username) || normalize(decodeURIComponent(doc.name.split("/").pop()));
    return [name, summary(v)];
  }));
  const users = profilePages.documents.filter((doc) => !isSuspendedProfile(recordValue(doc))).map((doc) => {
    const profile = recordValue(doc);
    const username = String(profile.username || decodeURIComponent(doc.name.split("/").pop()) || "").trim();
    const wallet = wallets.get(normalize(username)) || summary({});
    return {
      username, displayName: String(profile.displayName || profile.agentName || username),
      role: String(profile.role || ""), status: String(profile.status || "Active"),
      ...wallet,
    };
  }).filter((x) => x.username);
  users.sort((a, b) => a.displayName.localeCompare(b.displayName, "th"));
  return { users, truncated: profilePages.truncated || walletPages.truncated };
}
async function loadHistory(username) {
  await requireActiveTarget(username);
  const id = walletKey(username);
  const [walletDoc, rows] = await Promise.all([
    readDoc(path("qa_sparks_wallets", id)),
    listCollection(path("qa_sparks_wallets", id, "history")),
  ]);
  const history = rows.documents.map(toHistory).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const refunded = new Set(history.filter((x) => x.source === "reward-refund").map((x) => x.referenceId));
  const enriched = history.map((entry) => entry.source === "reward-redemption" && refunded.has(entry.id)
    ? { ...entry, status: "Refunded" } : entry);
  const calculatedEarned = enriched.filter((x) => x.amount > 0).reduce((a, x) => a + x.amount, 0);
  const calculatedSpent = enriched.filter((x) => x.amount < 0).reduce((a, x) => a - x.amount, 0);
  return {
    username,
    wallet: { ...summary(recordValue(walletDoc)), earned: calculatedEarned, spent: calculatedSpent },
    history: enriched,
    truncated: rows.truncated,
  };
}
function checkRequestId(raw) {
  const id = String(raw || "");
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(id)) fail("Invalid request ID");
  return id;
}
async function adjustBalance(body, admin) {
  const username = safeUsername(body.targetUsername);
  await requireActiveTarget(username);
  const operation = String(body.operation || "");
  if (!["add", "deduct", "refund"].includes(operation)) fail("Invalid adjustment type");
  const reason = String(body.reason || "").trim();
  if (reason.length < 5 || reason.length > 500) fail("กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร (สูงสุด 500)");
  const requestId = checkRequestId(body.requestId);
  const quantity = Number(body.amount);
  if (operation !== "refund" && (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100000)) fail("จำนวน Sparks ต้องอยู่ระหว่าง 1–100,000");
  const referenceId = String(body.referenceId || "");
  if (operation === "refund" && !/^[a-zA-Z0-9_-]{3,100}$/.test(referenceId)) fail("กรุณาเลือกรายการแลกรางวัลที่ต้องการคืนคะแนน");

  const walletPath = path("qa_sparks_wallets", walletKey(username));
  const documentId = operation === "refund" ? "refund-" + referenceId : "admin-" + requestId;
  const historyPath = path("qa_sparks_wallets", walletKey(username), "history", documentId);
  const sourcePath = operation === "refund" ? path("qa_sparks_wallets", walletKey(username), "history", referenceId) : "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const begin = await firestoreRequest(":beginTransaction", "POST", { options: { readWrite: {} } });
    const transaction = begin?.transaction;
    if (!transaction) fail("Could not begin Sparks transaction", 503);
    try {
      const [walletDoc, previous, original] = await Promise.all([
        readDoc(walletPath, transaction),
        readDoc(historyPath, transaction),
        sourcePath ? readDoc(sourcePath, transaction) : Promise.resolve(null),
      ]);
      if (previous) {
        const already = recordValue(previous);
        if (already.performedBy === admin.username && already.source === "admin-" + operation || (operation === "refund" && already.source === "reward-refund")) {
          return { updated: false, alreadyApplied: true, balance: balance(already.balanceAfter) };
        }
        fail("This request has already been used", 409);
      }
      const data = recordValue(walletDoc);
      let signedAmount = operation === "add" ? quantity : -quantity;
      if (operation === "refund") {
        const originalRow = recordValue(original);
        if (originalRow.source !== "reward-redemption" || !Number.isSafeInteger(Number(originalRow.amount)) || Number(originalRow.amount) >= 0) {
          fail("ไม่พบรายการแลกรางวัลที่สามารถคืนคะแนนได้", 400);
        }
        signedAmount = -Number(originalRow.amount);
      }
      const oldBalance = balance(data.balance);
      if (signedAmount < 0 && oldBalance < -signedAmount) fail("Sparks คงเหลือไม่พอสำหรับปรับลด", 400);
      const nextBalance = oldBalance + signedAmount;
      if (!Number.isSafeInteger(nextBalance)) fail("Sparks balance overflow", 400);
      const now = new Date().toISOString();
      const earning = Math.max(0, balance(data.totalEarned) || balance(data.firstLogin?.amount));
      const spending = balance(data.totalSpent);
      const title = operation === "add" ? "Admin Added Sparks" : operation === "deduct" ? "Admin Deducted Sparks" : "Reward Sparks Refunded";
      const source = operation === "refund" ? "reward-refund" : "admin-" + operation;
      const updated = {
        username,
        balance: nextBalance,
        totalEarned: earning + Math.max(0, signedAmount),
        totalSpent: spending + Math.max(0, -signedAmount),
        updatedAt: now,
      };
      const fields = encodeFields(updated);
      const history = {
        createdAt: now, type: signedAmount < 0 ? "spend" : "earn",
        source, title, detail: reason, reason, amount: signedAmount,
        balanceAfter: nextBalance, performedBy: admin.username,
        performedByName: admin.displayName, referenceId: operation === "refund" ? referenceId : "",
        requestId,
        status: "Completed",
      };
      const writes = [
        {
          update: { name: API_ROOT + "/" + walletPath, fields },
          updateMask: { fieldPaths: Object.keys(updated) },
          currentDocument: walletDoc?.updateTime ? { updateTime: walletDoc.updateTime } : { exists: false },
        },
        {
          update: { name: API_ROOT + "/" + historyPath, fields: encodeFields(history) },
          currentDocument: { exists: false },
        },
      ];
      await firestoreRequest(":commit", "POST", { transaction, writes });
      return { updated: true, alreadyApplied: false, balance: nextBalance, item: { id: documentId, ...history } };
    } catch (error) {
      if (["ABORTED", "FAILED_PRECONDITION"].includes(error?.firestoreStatus) && attempt < 3) continue;
      throw error;
    }
  }
  fail("Concurrent Sparks change; please retry", 409);
}
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    if (body.action === "reauth") return res.status(200).json(await reauthorizeAdminSession(body));
    const admin = await authorizeAdmin(body);
    let data;
    if (body.action === "list") data = await listUsers();
    else if (body.action === "history") data = await loadHistory(safeUsername(body.targetUsername));
    else if (body.action === "adjust") data = await adjustBalance(body, admin);
    else fail("Unsupported Sparks Admin action");
    return res.status(200).json(data);
  } catch (error) {
    const status = Number(error?.status) || 500;
    // Never return service-account details, raw credentials or Firestore internal stack traces.
    const message = status === 500 ? "Sparks Admin could not complete this request" : String(error?.message || "Request failed");
    if (status >= 500) console.error("Sparks admin request error:", String(error?.message || "Unknown"));
    return res.status(status).json({ error: message, ...(error?.code ? { code: error.code } : {}) });
  }
}
