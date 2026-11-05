import { createSign, createHash, timingSafeEqual, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Use the same explicit Firebase project as src/firebaseClient.ts. VITE_* build
// variables are not a reliable server-side source and may point elsewhere.
const FIRESTORE_PROJECT = "qa-dashboard-b0b5d";
const DOCUMENTS_RESOURCE = "projects/" + FIRESTORE_PROJECT + "/databases/(default)/documents";
const API_ROOT = "https://firestore.googleapis.com/v1/" + DOCUMENTS_RESOURCE;
const SESSION_POLICY = "qa-session-policy-2026-07-15-v1";
const ADMIN_USERNAME = "songpon";
const policyErrorCode = "SESSION_POLICY_OUTDATED";
const TYPING_RELIEF_PRICE = 150;
const TYPING_RELIEF_DISCOUNT_PERCENT = 60;
const TYPING_RELIEF_MAX_OWNED = 10;
const SPARKS_ANNUAL_EARN_CAP = 200000;
// Profile Quest: automatic credit only for a persisted custom profile photo.
const PROFILE_MAKEOVER = Object.freeze({id:"profile-makeover-2026",reward:150,end:"2026-12-15"});
// Catalog Manager changes availability only. Reward values and rules stay
// fixed to the announced terms, avoiding historical item-price inconsistencies.
const SPARKS_CATALOG_DEFAULT=Object.freeze({
  "daily-checkin-nov-2026":true,
  "profile-makeover-2026":true,
  "typing-relief":true,
  "truemoney-20":true,
});
const SPARKS_CATALOG_PATH="qa_sparks_settings/catalog_v1";
async function sparksCatalog(){
 const raw=recordValue(await readDoc(SPARKS_CATALOG_PATH));
 return Object.fromEntries(Object.keys(SPARKS_CATALOG_DEFAULT).map(k=>[
  k,typeof raw[k]==="boolean"?raw[k]:SPARKS_CATALOG_DEFAULT[k]]));
}
async function mustBeEnabled(id){
 const catalog=await sparksCatalog();
 if(catalog[id]===false)fail("ภารกิจหรือของรางวัลนี้ถูกปิดรับชั่วคราว กรุณาตรวจประกาศใน QA Sparks",400);
}
async function updateSparksCatalog(body,admin){
 const id=String(body.catalogItem||"");
 if(!Object.hasOwn(SPARKS_CATALOG_DEFAULT,id))fail("ชื่อ Quest หรือ Reward ไม่ถูกต้อง",400);
 if(typeof body.enabled!=="boolean")fail("กรุณาเลือกสถานะเปิดหรือปิด",400);
 const reason=String(body.reason||"").trim();
 if(reason.length<5||reason.length>250)fail("กรุณาระบุเหตุผลการปรับสถานะอย่างน้อย 5 ตัวอักษร",400);
 const row=await readDoc(SPARKS_CATALOG_PATH);
 const updates={[id]:body.enabled,updatedAt:new Date().toISOString(),
  updatedBy:admin.username,lastReason:reason};
 await firestoreRequest(":commit","POST",{writes:[updateWrite(SPARKS_CATALOG_PATH,updates,row)]});
 return {updated:true,items:await sparksCatalog()};
}

const TRUEMONEY_REWARD = Object.freeze({id:"truemoney-20",price:7000,amountBaht:20,validDays:30,deadlineBusinessDays:14});
function bangkokDate(now=new Date()){
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
  const val=(type)=>parts.find(x=>x.type===type)?.value||"";
  return val("year")+"-"+val("month")+"-"+val("day");
}
function addBusinessDaysBangkok(fromISO,count=14){
  // Our announced 14-day working window excludes Saturdays and Sundays.
  // Begin with the day *after* a member submits their redemption request.
  const date=new Date(fromISO);
  let remaining=count;
  while(remaining>0){
    date.setUTCDate(date.getUTCDate()+1);
    const wd=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Bangkok",weekday:"short"}).format(date);
    if(wd!=="Sat"&&wd!=="Sun")remaining--;
  }
  return bangkokDate(date);
}
function addThirtyDays(now=new Date()){
  return new Date(now.getTime()+TRUEMONEY_REWARD.validDays*86400000).toISOString();
}
/**
 * A receiving number is personal payout data. Encrypt it at rest. The key
 * defaults to a stable derivation of the existing server-only Firebase key;
 * production can override with SPARKS_PAYOUT_ENCRYPTION_KEY when configured.
 * Frontend and member inventory APIs NEVER receive the decrypted phone.
 */
function payoutKey(){
 const override=process.env.SPARKS_PAYOUT_ENCRYPTION_KEY;
 const source=process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON||process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
 let secret=String(override||"");
 if(!secret && source){
  try{secret=String(JSON.parse(source).private_key||"");}catch{}
 }
 if(!secret)fail("ตั้งค่าระบบความปลอดภัยสำหรับหมายเลขรับเงินไม่สำเร็จ",503);
 return createHash("sha256").update("qa-sparks-truemoney-receiver-v1:"+secret).digest();
}
function encryptReceivingPhone(value){
 const nonce=randomBytes(12),cipher=createCipheriv("aes-256-gcm",payoutKey(),nonce);
 const payload=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
 return [nonce.toString("base64url"),payload.toString("base64url"),cipher.getAuthTag().toString("base64url")].join(".");
}
function decryptReceivingPhone(encrypted){
 const parts=String(encrypted||"").split(".");
 if(parts.length!==3)throw new Error("Encrypted recipient phone is missing");
 const decipher=createDecipheriv("aes-256-gcm",payoutKey(),Buffer.from(parts[0],"base64url"));
 decipher.setAuthTag(Buffer.from(parts[2],"base64url"));
 return Buffer.concat([decipher.update(Buffer.from(parts[1],"base64url")),decipher.final()]).toString("utf8");
}
function safeItemId(raw){
  const id=String(raw||"");
  if(!/^tm20-[a-zA-Z0-9_-]{16,108}$/.test(id))fail("Item ID ไม่ถูกต้อง",400);
  return id;
}

// Fixed, publicly announced Quest #01. Dates are interpreted in Asia/Bangkok.
const DAILY_CHECKIN_QUEST = Object.freeze({
  id: "daily-checkin-nov-2026",
  start: "2026-11-09",
  end: "2026-11-22",
  reward: 50,
  walletField: "dailyCheckin202611Days",
});
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
    const firestoreStatus = String(result?.error?.status || "");
    if (firestoreStatus === "RESOURCE_EXHAUSTED" || response.status === 429) {
      // This is a database quota/capacity error, NOT an invalid QA session or key.
      // Keep writes blocked; never bypass the server checks or suggest adding keys.
      throw Object.assign(new Error("Firestore มีข้อจำกัดโควตาหรืออัตราการใช้งาน กรุณาตรวจที่ Firebase Console → Firestore → Usage และหลีกเลี่ยงการรีเฟรชซ้ำ"), {
        status: 429, code: "FIRESTORE_RESOURCE_EXHAUSTED", firestoreStatus,
      });
    }
    const detail = String(firestoreStatus || result?.error?.message || "Firestore request failed");
    const status = response.status === 403 ? 503 : response.status >= 500 ? 503 : response.status;
    throw Object.assign(new Error(detail), { status, firestoreStatus });
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

async function authorizeRewardUser(body) {
  const username = safeUsername(body.actorUsername);
  const sessionId = String(body.sessionId || "");
  if (!/^[a-zA-Z0-9_-]{10,180}$/.test(sessionId)) fail("กรุณาเข้าสู่ระบบ QA Dashboard ใหม่", 403);
  const sessionDoc = await readDoc(path("qa_user_sessions", sessionId));
  if (!sessionDoc) fail("ไม่พบ Session ที่ใช้งานอยู่", 403);
  const session = recordValue(sessionDoc);
  if (normalize(session.username) !== username || session.status !== "active"
      || !Number.isFinite(Date.parse(session.expiresAt || ""))
      || Date.parse(session.expiresAt || "") <= Date.now()) {
    fail("Session ไม่ถูกต้องหรือหมดอายุ กรุณา Login ใหม่", 403);
  }
  const revoked = recordValue(await readDoc(path("qa_user_session_controls", username)));
  const revokedAt = Date.parse(revoked.revokedBefore || "");
  if (Number.isFinite(revokedAt) && Date.parse(session.createdAt || "") <= revokedAt) {
    fail("Session นี้ถูกระงับ", 403);
  }
  const profile = await findProfileByUsername(username);
  if (isSuspendedProfile(profile) || normalize(profile.username) !== username) {
    fail("บัญชี QA ไม่พร้อมใช้งานหรือถูก Suspended", 403);
  }
  return { username, displayName: String(session.displayName || profile.displayName || username) };
}

const intCount = (value) => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
const currentMemberYear = () => Number(new Intl.DateTimeFormat("en-US", {
  year: "numeric", timeZone: "Asia/Bangkok",
}).format(new Date()));
function annualEarnedFromWallet(wallet, year = currentMemberYear()) {
  if (intCount(wallet.memberYear) === year && wallet.memberYearEarned !== undefined) {
    return Math.min(SPARKS_ANNUAL_EARN_CAP, intCount(wallet.memberYearEarned));
  }
  // QA Sparks launched in 2026. Existing wallet documents from that year lack
  // annual counters; backfill lazily from their stored cumulative earned totals.
  // No historical document is deleted or rewritten during a read.
  if (year === 2026 && intCount(wallet.memberYear) < 2026) {
    const prize = wallet.firstLogin;
    const prizeDate = new Date(String(prize?.claimedAt || ""));
    const prizeYear = Number.isFinite(prizeDate.getTime())
      ? Number(new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "Asia/Bangkok" }).format(prizeDate))
      : 0;
    return Math.min(SPARKS_ANNUAL_EARN_CAP, Math.max(intCount(wallet.totalEarned),
      prizeYear === 2026 ? intCount(prize?.amount) : 0));
  }
  return 0;
}
const walletDocumentPath = (username) => path("qa_sparks_wallets", walletKey(username));
const resourceName = (docPath) => DOCUMENTS_RESOURCE + "/" + docPath;
const updateWrite = (docPath, updates, snap) => ({
  update: { name: resourceName(docPath), fields: encodeFields(updates) },
  updateMask: { fieldPaths: Object.keys(updates) },
  currentDocument: snap?.updateTime ? { updateTime: snap.updateTime } : { exists: false },
});
const createWrite = (docPath, value) => ({
  update: { name: resourceName(docPath), fields: encodeFields(value) },
  currentDocument: { exists: false },
});

async function redeemTypingRelief(body, actor) {
  await mustBeEnabled("typing-relief");
  const requestId = checkRequestId(body.requestId);
  const walletPath = walletDocumentPath(actor.username);
  const historyPath = path("qa_sparks_wallets", walletKey(actor.username), "history", "redeem-" + requestId);
  for (let attempt = 0; attempt < 4; attempt++) {
    const begin = await firestoreRequest(":beginTransaction", "POST", { options: { readWrite: {} } });
    const transaction = begin?.transaction;
    if (!transaction) fail("ไม่สามารถเริ่มการแลกรางวัลได้", 503);
    try {
      const [walletDoc, duplicateDoc] = await Promise.all([
        readDoc(walletPath, transaction), readDoc(historyPath, transaction),
      ]);
      const wallet = recordValue(walletDoc);
      if (duplicateDoc) {
        const previous = recordValue(duplicateDoc);
        if (previous.source === "reward-redemption" && previous.rewardId === "typing-relief") {
          return { updated: false, alreadyApplied: true, balance: intCount(previous.balanceAfter), owned: intCount(previous.inventoryAfter) };
        }
        fail("รหัสรายการนี้เคยใช้งานแล้ว", 409);
      }
      const owned = intCount(wallet.typingReliefOwned);
      const current = intCount(wallet.balance);
      if (owned >= TYPING_RELIEF_MAX_OWNED) fail("สะสม Typing Relief ได้สูงสุด 10 สิทธิ์", 400);
      if (current < TYPING_RELIEF_PRICE) fail("QA Sparks ไม่เพียงพอ (ต้องใช้ 150 Sparks)", 400);
      const nextBalance = current - TYPING_RELIEF_PRICE;
      const now = new Date().toISOString();
      const nextOwned = owned + 1;
      const updates = {
        username: actor.username,
        balance: nextBalance,
        totalSpent: intCount(wallet.totalSpent) + TYPING_RELIEF_PRICE,
        rewardOrders: intCount(wallet.rewardOrders) + 1,
        typingReliefOwned: nextOwned,
        typingReliefPurchased: intCount(wallet.typingReliefPurchased) + 1,
        updatedAt: now,
      };
      const history = {
        createdAt: now, type: "spend", source: "reward-redemption",
        rewardId: "typing-relief", title: "Typing Relief Redeemed",
        detail: "แลก Typing Relief ลดจำนวนคำพิมพ์ 60% ของภารกิจ", amount: -TYPING_RELIEF_PRICE,
        balanceAfter: nextBalance, inventoryAfter: nextOwned,
        performedBy: actor.username, requestId, status: "Completed",
      };
      await firestoreRequest(":commit", "POST", {
        transaction,
        writes: [updateWrite(walletPath, updates, walletDoc), createWrite(historyPath, history)],
      });
      return { updated: true, balance: nextBalance, owned: nextOwned };
    } catch (error) {
      if (["ABORTED", "FAILED_PRECONDITION"].includes(error?.firestoreStatus) && attempt < 3) continue;
      throw error;
    }
  }
  fail("มีการทำรายการพร้อมกัน กรุณาลองใหม่อีกครั้ง", 409);
}

/**
 * Only the authenticated member can claim today's 50 Sparks, once per
 * Bangkok calendar day from Nov 9 through Nov 22. No catch-up, streak
 * dependence, auto-claim, browser-clock trust, or future-date selection.
 *
 * Wallet + fixed-ID history are committed in ONE Firestore transaction.
 * Two tabs/devices racing to claim the same day cannot both earn points.
 */
function bangkokQuestDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const extract = (type) => parts.find((part) => part.type === type)?.value || "";
  return extract("year") + "-" + extract("month") + "-" + extract("day");
}
function normalizedCheckinDays(wallet) {
  const input = wallet[DAILY_CHECKIN_QUEST.walletField];
  return Array.isArray(input)
    ? [...new Set(input.map(Number).filter((day) => Number.isInteger(day) && day >= 9 && day <= 22))].sort((a, b) => a - b)
    : [];
}
async function claimDailyCheckin(body, actor) {
  await mustBeEnabled("daily-checkin-nov-2026");
  // This must be checked on the server, never inferred from user device time.
  const today = bangkokQuestDate();
  if (today < DAILY_CHECKIN_QUEST.start) fail("Daily Check-in เปิดให้รับรางวัลตั้งแต่วันที่ 9 พฤศจิกายน 2026", 400);
  if (today > DAILY_CHECKIN_QUEST.end) fail("Daily Check-in สิ้นสุดแล้ว ไม่สามารถรับรางวัลย้อนหลังได้", 400);
  const selected = String(body.questDate || "");
  if (selected !== today) fail("รับรางวัลได้เฉพาะวันที่ปัจจุบัน (เวลาไทย) ไม่สามารถรับย้อนหลังหรือล่วงหน้าได้", 400);
  const dayNumber = Number(today.slice(-2));
  const walletPath = walletDocumentPath(actor.username);
  const historyPath = path("qa_sparks_wallets", walletKey(actor.username), "history", "quest-daily-checkin-" + today.replace(/-/g, ""));
  for (let attempt = 0; attempt < 4; attempt++) {
    const begin = await firestoreRequest(":beginTransaction", "POST", { options: { readWrite: {} } });
    const transaction = begin?.transaction;
    if (!transaction) fail("ไม่สามารถเริ่มรับรางวัลเช็กอินได้", 503);
    try {
      const [walletDoc, claimDoc] = await Promise.all([
        readDoc(walletPath, transaction), readDoc(historyPath, transaction),
      ]);
      const wallet = recordValue(walletDoc);
      const claimedDays = normalizedCheckinDays(wallet);
      if (claimDoc || claimedDays.includes(dayNumber)) {
        return { updated: false, alreadyClaimed: true, questDate: today,
          claimedDays: [...new Set([...claimedDays, dayNumber])].sort((a, b) => a - b),
          balance: intCount(wallet.balance), memberYearEarned: annualEarnedFromWallet(wallet) };
      }
      const memberYear = currentMemberYear();
      const earnedThisYear = annualEarnedFromWallet(wallet, memberYear);
      if (earnedThisYear + DAILY_CHECKIN_QUEST.reward > SPARKS_ANNUAL_EARN_CAP) {
        fail("รับรางวัลไม่ได้ เนื่องจากจะเกินเพดานสะสม 200,000 Sparks ต่อปี", 400);
      }
      const now = new Date().toISOString();
      // Never reduce earned levels when tickets are redeemed.
      const lifetimeEarned = Math.max(intCount(wallet.totalEarned), intCount(wallet.firstLogin?.amount));
      const nextBalance = intCount(wallet.balance) + DAILY_CHECKIN_QUEST.reward;
      const nextEarned = earnedThisYear + DAILY_CHECKIN_QUEST.reward;
      const nextDays = [...claimedDays, dayNumber].sort((a, b) => a - b);
      const updates = {
        username: actor.username,
        balance: nextBalance,
        totalEarned: lifetimeEarned + DAILY_CHECKIN_QUEST.reward,
        memberYear,
        memberYearEarned: nextEarned,
        [DAILY_CHECKIN_QUEST.walletField]: nextDays,
        updatedAt: now,
      };
      const history = {
        createdAt: now, type: "earn", source: "quest-daily-checkin",
        questId: DAILY_CHECKIN_QUEST.id, questDate: today,
        title: "Daily Check-in Reward", detail: "เช็กอินวันที่ " + dayNumber + " พฤศจิกายน 2026",
        amount: DAILY_CHECKIN_QUEST.reward, balanceAfter: nextBalance,
        performedBy: actor.username, status: "Completed",
      };
      await firestoreRequest(":commit", "POST", {
        transaction, writes: [updateWrite(walletPath, updates, walletDoc), createWrite(historyPath, history)],
      });
      return { updated: true, alreadyClaimed: false, questDate: today,
        claimedDays: nextDays, balance: nextBalance, memberYearEarned: nextEarned };
    } catch (error) {
      if (["ABORTED", "FAILED_PRECONDITION"].includes(error?.firestoreStatus) && attempt < 3) continue;
      throw error;
    }
  }
  fail("ไม่สามารถบันทึกเช็กอินที่ทำพร้อมกันได้ กรุณาลองใหม่", 409);
}

async function useTypingRelief(body, actor) {
  const challengeId = String(body.challengeId || "").trim();
  if (!challengeId || challengeId.length > 180 || challengeId.includes("/")) fail("ไม่พบ QA Access Check ที่ต้องการใช้สิทธิ์", 400);
  const walletPath = walletDocumentPath(actor.username);
  const challengePath = path("qa_typing_challenges", actor.username.replace(/\s+/g, "_"));
  // Stable per-assignment ID guards double spending, including concurrent tabs.
  const useId = "typing-relief-use-" + createHash("sha256").update(actor.username + "|" + challengeId).digest("hex").slice(0, 40);
  const historyPath = path("qa_sparks_wallets", walletKey(actor.username), "history", useId);
  for (let attempt = 0; attempt < 4; attempt++) {
    const begin = await firestoreRequest(":beginTransaction", "POST", { options: { readWrite: {} } });
    const transaction = begin?.transaction;
    if (!transaction) fail("ไม่สามารถเริ่มใช้สิทธิ์ได้", 503);
    try {
      const [walletDoc, challengeDoc, useDoc] = await Promise.all([
        readDoc(walletPath, transaction), readDoc(challengePath, transaction), readDoc(historyPath, transaction),
      ]);
      const wallet = recordValue(walletDoc);
      if (useDoc) {
        const used = recordValue(useDoc);
        if (used.source === "reward-activation" && used.rewardId === "typing-relief") {
          return { updated: false, alreadyApplied: true, balance: intCount(wallet.balance), owned: intCount(wallet.typingReliefOwned), remainingWords: intCount(used.remainingWords), appliedWords: intCount(used.appliedWords) };
        }
        fail("สิทธิ์นี้ถูกใช้กับรายการดังกล่าวแล้ว", 409);
      }
      if (!challengeDoc) fail("ไม่พบภารกิจพิมพ์ที่ยังค้างอยู่", 409);
      const challengeData = recordValue(challengeDoc);
      const entries = Array.isArray(challengeData.queue) ? challengeData.queue.map((item) => ({ ...item })) : [challengeData];
      const targetIndex = entries.findIndex((item) => String(item.id || "") === challengeId);
      if (targetIndex !== 0) fail("ใช้ Typing Relief ได้เฉพาะภารกิจปัจจุบัน", 409);
      const target = entries[targetIndex];
      if ((target.mode || (/\s/.test(String(target.word || "")) ? "sentence" : "word")) !== "word") {
        fail("Typing Relief ใช้ได้เฉพาะภารกิจแบบพิมพ์คำ (Word Mode)", 400);
      }
      const originalWords = Number(target.repeatCount);
      if (!Number.isSafeInteger(originalWords) || originalWords < 1 || originalWords > 500) fail("จำนวนคำของภารกิจไม่ถูกต้อง", 400);
      if (intCount(wallet.typingReliefOwned) < 1) fail("ไม่มี Typing Relief คงเหลือ กรุณาแลกก่อน", 400);
      // Round the remaining 40% UP so the actual reduction never exceeds 60%.
      const remainingWords = Math.max(1, Math.ceil(originalWords * (100 - TYPING_RELIEF_DISCOUNT_PERCENT) / 100));
      const appliedWords = originalWords - remainingWords;
      entries[targetIndex] = { ...target, repeatCount: remainingWords, typingReliefUsed: true };
      const nextOwned = intCount(wallet.typingReliefOwned) - 1;
      const now = new Date().toISOString();
      const updates = {
        username: actor.username,
        typingReliefOwned: nextOwned,
        typingReliefUsed: intCount(wallet.typingReliefUsed) + 1,
        updatedAt: now,
      };
      const history = {
        createdAt: now, type: "redeem", source: "reward-activation",
        rewardId: "typing-relief", title: "Typing Relief Activated",
        detail: "ใช้ Typing Relief กับ QA Access Check",
        challengeId, originalWords, remainingWords, appliedWords, reductionPercent: TYPING_RELIEF_DISCOUNT_PERCENT,
        amount: 0, balanceAfter: intCount(wallet.balance), inventoryAfter: nextOwned,
        performedBy: actor.username, status: "Completed",
      };
      const challengeUpdates = { queue: entries, queueCount: entries.length };
      await firestoreRequest(":commit", "POST", {
        transaction,
        writes: [
          updateWrite(walletPath, updates, walletDoc),
          updateWrite(challengePath, challengeUpdates, challengeDoc),
          createWrite(historyPath, history),
        ],
      });
      return { updated: true, balance: intCount(wallet.balance), owned: nextOwned, remainingWords, appliedWords };
    } catch (error) {
      if (["ABORTED", "FAILED_PRECONDITION"].includes(error?.firestoreStatus) && attempt < 3) continue;
      throw error;
    }
  }
  fail("มีการทำรายการพร้อมกัน กรุณาลองใหม่อีกครั้ง", 409);
}


/** Crediting is checked on the server against the *actual Firestore saved*
 * user-uploaded image. The user cannot forge a custom-photo flag in requests.
 */
async function claimProfileMakeover(actor){
 await mustBeEnabled("profile-makeover-2026");
 const today=bangkokDate();
 const walletPath=walletDocumentPath(actor.username);
 const historyPath=path("qa_sparks_wallets",walletKey(actor.username),"history","quest-profile-makeover-2026");
 if(today>PROFILE_MAKEOVER.end)return {eligible:false,expired:true,credited:false};
 const profile=await findProfileByUsername(actor.username);
 // Profile photo document IDs retain username casing from the upload form.
 const ids=[String(profile.username||""),actor.username];
 let actualPhoto=null;
 for(const id of [...new Set(ids)].filter(Boolean)){
   const candidate=await readDoc(path("qa_user_profile_photos",id));
   const photo=recordValue(candidate);
   if(normalize(photo.username)===actor.username && typeof photo.photoDataUrl==="string" &&
      /^data:image\/(?:jpeg|png|webp|gif);base64,[a-zA-Z0-9+/=]{100,}$/.test(photo.photoDataUrl)){
     actualPhoto=photo;break;
   }
 }
 if(!actualPhoto)return {eligible:false,credited:false,reason:"default-photo"};
 for(let attempt=0;attempt<4;attempt++){
  const begin=await firestoreRequest(":beginTransaction","POST",{options:{readWrite:{}}});
  const tx=begin?.transaction;
  if(!tx)fail("ไม่สามารถบันทึกรางวัลรูปโปรไฟล์ได้",503);
  try{
   const [walletDoc,earnedDoc]=await Promise.all([readDoc(walletPath,tx),readDoc(historyPath,tx)]);
   const wallet=recordValue(walletDoc);
   if(earnedDoc)return {eligible:true,credited:true,alreadyApplied:true,balance:intCount(wallet.balance)};
   if(bangkokDate()>PROFILE_MAKEOVER.end)return {eligible:true,expired:true,credited:false};
   const year=currentMemberYear(),yearEarned=annualEarnedFromWallet(wallet,year);
   if(yearEarned+PROFILE_MAKEOVER.reward>SPARKS_ANNUAL_EARN_CAP)
     return {eligible:true,credited:false,capReached:true};
   const now=new Date().toISOString(),balanceAfter=intCount(wallet.balance)+PROFILE_MAKEOVER.reward;
   const updates={username:actor.username,balance:balanceAfter,
     totalEarned:Math.max(intCount(wallet.totalEarned),intCount(wallet.firstLogin?.amount))+PROFILE_MAKEOVER.reward,
     memberYear:year,memberYearEarned:yearEarned+PROFILE_MAKEOVER.reward,
     profileMakeover2026ClaimedAt:now,updatedAt:now};
   const history={createdAt:now,type:"earn",source:"quest-profile-makeover",
     questId:PROFILE_MAKEOVER.id,title:"Profile Makeover Reward",
     detail:"ตั้งรูปโปรไฟล์ของตัวเอง · Quest #02",amount:PROFILE_MAKEOVER.reward,
     balanceAfter,performedBy:actor.username,status:"Completed"};
   await firestoreRequest(":commit","POST",{transaction:tx,writes:[
     updateWrite(walletPath,updates,walletDoc),createWrite(historyPath,history)]});
   return {eligible:true,credited:true,alreadyApplied:false,balance:balanceAfter};
  }catch(e){if(["ABORTED","FAILED_PRECONDITION"].includes(e?.firestoreStatus)&&attempt<3)continue;throw e;}
 }
 fail("มีการทำรายการพร้อมกัน กรุณาลองใหม่",409);
}
async function getProfileMakeoverStatus(actor){
 const wallet=recordValue(await readDoc(walletDocumentPath(actor.username)));
 return {credited:Boolean(wallet.profileMakeover2026ClaimedAt),
  expired:bangkokDate()>PROFILE_MAKEOVER.end,deadline:PROFILE_MAKEOVER.end,reward:PROFILE_MAKEOVER.reward};
}
/** New reward items are separate immutable identities with separate expiry. */
async function redeemTrueMoney(body,actor){
 await mustBeEnabled("truemoney-20");
 const token=checkRequestId(body.requestId);
 const itemId="tm20-"+token;
 const walletPath=walletDocumentPath(actor.username);
 const itemPath=path("qa_sparks_wallets",walletKey(actor.username),"items",itemId);
 const historyPath=path("qa_sparks_wallets",walletKey(actor.username),"history","redeem-"+itemId);
 for(let attempt=0;attempt<4;attempt++){
  const begin=await firestoreRequest(":beginTransaction","POST",{options:{readWrite:{}}}),tx=begin?.transaction;
  if(!tx)fail("เริ่มแลกรางวัลไม่ได้",503);
  try{
   const [walletDoc,itemDoc,historyDoc]=await Promise.all([
     readDoc(walletPath,tx),readDoc(itemPath,tx),readDoc(historyPath,tx)]);
   if(itemDoc||historyDoc){
     const item=recordValue(itemDoc);
     if(item.rewardId===TRUEMONEY_REWARD.id)return {updated:false,alreadyApplied:true,item:publicTrueMoneyItem(item)};
     fail("รายการแลกซ้ำกับรายการอื่น",409);
   }
   const wallet=recordValue(walletDoc),balanceBefore=intCount(wallet.balance);
   if(balanceBefore<TRUEMONEY_REWARD.price)fail("Sparks ไม่เพียงพอสำหรับแลก TrueMoney (7,000 Sparks)",400);
   const now=new Date(),timestamp=now.toISOString(),expiresAt=addThirtyDays(now);
   const balanceAfter=balanceBefore-TRUEMONEY_REWARD.price;
   const item={id:itemId,owner:actor.username,rewardId:TRUEMONEY_REWARD.id,
    name:"TrueMoney 20 บาท",amountBaht:20,price:TRUEMONEY_REWARD.price,
    redeemedAt:timestamp,expiresAt,status:"available",createdAt:timestamp};
   const hist={createdAt:timestamp,type:"spend",source:"reward-redemption",rewardId:TRUEMONEY_REWARD.id,
    itemId,title:"TrueMoney 20 THB Redeemed",
    detail:"แลกรับ Item TrueMoney 20 บาท (ใช้ได้ภายใน 30 วัน)",amount:-TRUEMONEY_REWARD.price,
    balanceAfter,performedBy:actor.username,status:"Completed"};
   const updates={username:actor.username,balance:balanceAfter,
    totalSpent:intCount(wallet.totalSpent)+TRUEMONEY_REWARD.price,
    rewardOrders:intCount(wallet.rewardOrders)+1,updatedAt:timestamp};
   await firestoreRequest(":commit","POST",{transaction:tx,writes:[
    updateWrite(walletPath,updates,walletDoc),createWrite(itemPath,item),createWrite(historyPath,hist)]});
   return {updated:true,balance:balanceAfter,item:publicTrueMoneyItem(item)};
  }catch(e){if(["ABORTED","FAILED_PRECONDITION"].includes(e?.firestoreStatus)&&attempt<3)continue;throw e;}
 }
 fail("รายการแลกเกิดพร้อมกัน กรุณาลองใหม่",409);
}
function publicTrueMoneyItem(item){
 // Do not leak a recipient phone number in general reward summaries.
 return {id:String(item.id||""),rewardId:TRUEMONEY_REWARD.id,
  name:"TrueMoney 20 บาท",amountBaht:20,price:7000,
  redeemedAt:String(item.redeemedAt||""),expiresAt:String(item.expiresAt||""),
  status:String(item.status||""),submittedAt:String(item.submittedAt||""),
  dueDate:String(item.dueDate||""),paidAt:String(item.paidAt||"")};
}
async function listMyTrueMoneyItems(actor){
 const root=path("qa_sparks_wallets",walletKey(actor.username),"items");
 const records=await listCollection(root);
 const items=records.documents.map(recordValue)
  .filter(item=>item.rewardId===TRUEMONEY_REWARD.id && normalize(item.owner)===actor.username)
  .map(item=>({...publicTrueMoneyItem(item),
     status:item.status==="available"&&Date.parse(item.expiresAt)<=Date.now()?"expired":item.status}))
  .sort((a,b)=>b.redeemedAt.localeCompare(a.redeemedAt));
 return {items,truncated:records.truncated};
}
/** Convert a valid inventory item to a payout request exactly once. */
async function useTrueMoneyItem(body,actor){
 const itemId=safeItemId(body.itemId);
 const phone=String(body.receivingPhone||"").trim();
 if(!/^0\d{9}$/.test(phone))fail("กรุณากรอกหมายเลข TrueMoney 10 หลักให้ถูกต้อง",400);
 const itemPath=path("qa_sparks_wallets",walletKey(actor.username),"items",itemId);
 const requestPath=path("qa_sparks_redemption_requests",itemId);
 const historyPath=path("qa_sparks_wallets",walletKey(actor.username),"history","request-"+itemId);
 for(let attempt=0;attempt<4;attempt++){
  const started=await firestoreRequest(":beginTransaction","POST",{options:{readWrite:{}}}),tx=started?.transaction;
  if(!tx)fail("ไม่สามารถเริ่มคำขอรับเงินได้",503);
  try{
   const [itemDoc,requestDoc,historyDoc]=await Promise.all([
    readDoc(itemPath,tx),readDoc(requestPath,tx),readDoc(historyPath,tx)]);
   const item=recordValue(itemDoc);
   if(item.rewardId!==TRUEMONEY_REWARD.id||normalize(item.owner)!==actor.username)
      fail("ไม่พบ Item TrueMoney ในบัญชีของคุณ",404);
   if(requestDoc||historyDoc||item.status==="submitted"||item.status==="paid"){
      if(normalize(item.owner)===actor.username && requestDoc)
       return {updated:false,alreadyApplied:true,item:publicTrueMoneyItem(item)};
      fail("Item นี้มีคำขออยู่แล้ว ไม่สามารถใช้ซ้ำได้",409);
   }
   if(item.status!=="available")fail("Item นี้ไม่พร้อมใช้งาน",400);
   if(!item.expiresAt||Date.parse(item.expiresAt)<=Date.now())
      fail("Item หมดอายุแล้ว ไม่สามารถส่งคำขอรับเงินได้",400);
   const now=new Date().toISOString(),dueDate=addBusinessDaysBangkok(now,14);
   const request={id:itemId,rewardId:TRUEMONEY_REWARD.id,username:actor.username,
      displayName:actor.displayName,receivingPhoneEncrypted:encryptReceivingPhone(phone),amountBaht:20,
      submittedAt:now,dueDate,status:"pending",itemId};
   const history={createdAt:now,type:"earn",source:"reward-activation",
      rewardId:TRUEMONEY_REWARD.id,itemId,title:"TrueMoney 20 THB Requested",
      detail:"ส่งคำขอรับเงิน 20 บาท · กำหนดภายใน "+dueDate,
      amount:0,performedBy:actor.username,status:"Pending"};
   await firestoreRequest(":commit","POST",{transaction:tx,writes:[
    updateWrite(itemPath,{status:"submitted",submittedAt:now,dueDate},itemDoc),
    createWrite(requestPath,request),createWrite(historyPath,history)]});
   return {updated:true,alreadyApplied:false,item:publicTrueMoneyItem({...item,status:"submitted",submittedAt:now,dueDate})};
  }catch(e){if(["ABORTED","FAILED_PRECONDITION"].includes(e?.firestoreStatus)&&attempt<3)continue;throw e;}
 }
 fail("รายการส่งคำขอเกิดพร้อมกัน กรุณาลองใหม่",409);
}
async function listPayoutRequests(){
 const data=await listCollection("qa_sparks_redemption_requests");
 return {requests:data.documents.map(recordValue)
   .filter(r=>r.rewardId===TRUEMONEY_REWARD.id)
   .map(r=>({id:String(r.id||""),username:String(r.username||""),
    displayName:String(r.displayName||""),receivingPhone:decryptReceivingPhone(r.receivingPhoneEncrypted),
    amountBaht:20,submittedAt:String(r.submittedAt||""),
    dueDate:String(r.dueDate||""),status:String(r.status||""),
    paidAt:String(r.paidAt||""),paidBy:String(r.paidBy||"")}))
   .sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt)),
   truncated:data.truncated};
}
async function completeTrueMoneyPayout(body,admin){
 const itemId=safeItemId(body.itemId);
 const requestPath=path("qa_sparks_redemption_requests",itemId);
 for(let attempt=0;attempt<4;attempt++){
  const began=await firestoreRequest(":beginTransaction","POST",{options:{readWrite:{}}}),tx=began?.transaction;
  if(!tx)fail("ไม่สามารถเริ่มยืนยันการโอนเงินได้",503);
  try{
   const requestDoc=await readDoc(requestPath,tx),request=recordValue(requestDoc);
   if(!requestDoc||request.rewardId!==TRUEMONEY_REWARD.id)fail("ไม่พบคำขอ TrueMoney",404);
   const owner=safeUsername(request.username);
   const itemPath=path("qa_sparks_wallets",walletKey(owner),"items",itemId);
   const historyPath=path("qa_sparks_wallets",walletKey(owner),"history","paid-"+itemId);
   const [itemDoc,historyDoc]=await Promise.all([readDoc(itemPath,tx),readDoc(historyPath,tx)]);
   const item=recordValue(itemDoc);
   if(request.status==="paid"&&item.status==="paid")return {updated:false,alreadyApplied:true};
   if(request.status!=="pending"||item.status!=="submitted"||historyDoc)
     fail("คำขอไม่อยู่ในสถานะรอโอน หรือเคยดำเนินการแล้ว",409);
   if(normalize(item.owner)!==owner)fail("เจ้าของ Item ไม่ตรงกับคำขอ",409);
   const now=new Date().toISOString();
   const history={createdAt:now,type:"earn",source:"reward-payout",
     title:"TrueMoney 20 THB Paid",detail:"Admin ยืนยันโอน TrueMoney 20 บาทแล้ว",
     rewardId:TRUEMONEY_REWARD.id,itemId,amount:0,performedBy:admin.username,
     status:"Completed"};
   await firestoreRequest(":commit","POST",{transaction:tx,writes:[
    updateWrite(requestPath,{status:"paid",paidAt:now,paidBy:admin.username},requestDoc),
    updateWrite(itemPath,{status:"paid",paidAt:now,paidBy:admin.username},itemDoc),
    createWrite(historyPath,history)]});
   return {updated:true,alreadyApplied:false};
  }catch(e){if(["ABORTED","FAILED_PRECONDITION"].includes(e?.firestoreStatus)&&attempt<3)continue;throw e;}
 }
 fail("มีการยืนยันรายการพร้อมกัน กรุณาลองใหม่",409);
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
    memberYear: currentMemberYear(),
    memberYearEarned: annualEarnedFromWallet(wallet),
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
  const voided = Boolean(row.voidedAt);
  const originalAmount = Number(row.amount) || 0;
  return {
    id: decodeURIComponent(String(doc.name || "").split("/").pop() || ""),
    createdAt: String(row.createdAt || ""),
    type: originalAmount < 0 ? "spend" : "earn",
    title: String(row.title || ""),
    detail: voided ? "รายการทดลองถูกยกเลิก (เดิม " + (originalAmount > 0 ? "+" : "") + originalAmount.toLocaleString("en-US") + " Sparks)" : String(row.detail || ""),
    source: String(row.source || ""),
    amount: voided ? 0 : originalAmount,
    voided,
    originalAmount,
    balanceAfter: balance(row.balanceAfter),
    performedBy: String(row.performedBy || ""),
    reason: String(row.reason || ""),
    referenceId: String(row.referenceId || ""),
    status: voided ? "Voided" : String(row.status || ""),
  };
}
async function listUsers() {
  const [profilePages, walletPages] = await Promise.all([
    listCollection("qa_user_profiles", ["username", "displayName", "agentName", "role", "status", "suspendEffectiveDate", "suspendEndDate", "suspendAutoReactivate"]),
    listCollection("qa_sparks_wallets", ["username", "balance", "totalEarned", "totalSpent", "rewardOrders", "firstLogin", "memberYear", "memberYearEarned"]),
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
/**
 * One-time audited cancellation of Chachiya's two mistaken admin TEST entries.
 * The +99,800 grant and −99,800 deduction net to zero, so the legitimate
 * 150-Sparks First Login prize and current balance must remain untouched.
 *
 * NEVER delete Firestore history, never reset unrelated wallets, and never
 * let a generic admin call choose the values. All four records are protected
 * by Firestore transaction preconditions and checked server-side.
 */
async function voidChachiyaTestPair(body, admin) {
  const username = safeUsername(body.targetUsername);
  if (username !== "chachiya") fail("อนุญาตให้แก้ไขเฉพาะรายการทดสอบของ Chachiya เท่านั้น", 403);
  await requireActiveTarget(username);
  const addId = String(body.addHistoryId || "").trim();
  const deductId = String(body.deductHistoryId || "").trim();
  if (!/^admin-[a-zA-Z0-9_-]{16,108}$/.test(addId) || !/^admin-[a-zA-Z0-9_-]{16,108}$/.test(deductId) || addId === deductId) {
    fail("กรุณาเลือกประวัติเพิ่มและปรับลด Sparks ที่ถูกต้อง", 400);
  }
  const correctionId = "admin-correction-chachiya-void-99800-nov2026";
  const walletPath = walletDocumentPath(username);
  const historyRoot = path("qa_sparks_wallets", walletKey(username), "history");
  const correctionPath = historyRoot + "/" + correctionId;
  const addPath = historyRoot + "/" + addId;
  const deductPath = historyRoot + "/" + deductId;
  for (let attempt = 0; attempt < 4; attempt++) {
    const started = await firestoreRequest(":beginTransaction", "POST", { options: { readWrite: {} } });
    const transaction = started?.transaction;
    if (!transaction) fail("ไม่สามารถเริ่มตรวจสอบการแก้ไข Sparks ได้", 503);
    try {
      const [walletDoc, correctionDoc, addDoc, deductDoc] = await Promise.all([
        readDoc(walletPath, transaction), readDoc(correctionPath, transaction),
        readDoc(addPath, transaction), readDoc(deductPath, transaction),
      ]);
      if (correctionDoc) {
        const done = recordValue(correctionDoc);
        if (done.source === "admin-test-correction" && normalize(done.targetUsername) === "chachiya") {
          return { updated: false, alreadyApplied: true, balance: balance(recordValue(walletDoc).balance) };
        }
        fail("รายการแก้ไขนี้ถูกใช้งานแล้ว", 409);
      }
      const wallet = recordValue(walletDoc);
      const grant = recordValue(addDoc);
      const deduction = recordValue(deductDoc);
      const cleanWallet = balance(wallet.balance) === 150 && balance(wallet.totalEarned) === 99950
        && balance(wallet.totalSpent) === 99800 && balance(wallet.firstLogin?.amount) === 150;
      const validPair = addDoc && deductDoc
        && grant.source === "admin-add" && Number(grant.amount) === 99800
        && deduction.source === "admin-deduct" && Number(deduction.amount) === -99800
        && !grant.voidedAt && !deduction.voidedAt;
      if (!cleanWallet || !validPair) {
        fail("ยอดหรือรายการไม่ตรงกับรายการทดลองที่ต้องยกเลิก ระบบไม่ได้เปลี่ยนคะแนนใด ๆ", 409);
      }
      const now = new Date().toISOString();
      const reason = "ยกเลิก 2 รายการทดลอง +99,800 และ -99,800 ที่บันทึกผิด โดยคง First Login 150 Sparks";
      const memberYear = currentMemberYear();
      const writes = [
        updateWrite(walletPath, {
          balance: 150, totalEarned: 150, totalSpent: 0,
          memberYear, memberYearEarned: memberYear === 2026 ? 150 : 0,
          updatedAt: now, lastCorrectionAt: now,
        }, walletDoc),
        updateWrite(addPath, { voidedAt: now, voidedBy: admin.username, voidedReason: reason,
          voidedCorrectionId: correctionId }, addDoc),
        updateWrite(deductPath, { voidedAt: now, voidedBy: admin.username, voidedReason: reason,
          voidedCorrectionId: correctionId }, deductDoc),
        createWrite(correctionPath, {
          createdAt: now, type: "earn", source: "admin-test-correction",
          title: "Sparks Test Adjustments Voided",
          targetUsername: username, detail: reason, reason, amount: 0,
          balanceAfter: 150, originalAddId: addId, originalDeductId: deductId,
          performedBy: admin.username, performedByName: admin.displayName, status: "Completed",
        }),
      ];
      await firestoreRequest(":commit", "POST", { transaction, writes });
      return { updated: true, alreadyApplied: false, balance: 150, earned: 150, spent: 0,
        memberYearEarned: memberYear === 2026 ? 150 : 0 };
    } catch (error) {
      if (["ABORTED", "FAILED_PRECONDITION"].includes(error?.firestoreStatus) && attempt < 3) continue;
      throw error;
    }
  }
  fail("มีการเปลี่ยนคะแนนพร้อมกัน กรุณารีเฟรชข้อมูลก่อนแก้ไข", 409);
}

/**
 * Explicit, admin-confirmed one-time correction for Suphitcha's three Typing
 * Relief test records. This cancels only their Sparks accounting effects.
 * NEVER undo an actual QA Access challenge or delete its audit trail.
 */
async function voidSuphitchaTypingTest(body, admin) {
  const username = safeUsername(body.targetUsername);
  if (username !== "suphitcha") fail("อนุญาตให้แก้ไขเฉพาะรายการทดลองของ Suphitcha เท่านั้น", 403);
  await requireActiveTarget(username);
  const redemptionId = String(body.redemptionHistoryId || "").trim();
  const activationId = String(body.activationHistoryId || "").trim();
  const deductionId = String(body.deductionHistoryId || "").trim();
  if (!/^redeem-[a-zA-Z0-9_-]{16,100}$/.test(redemptionId)
    || !/^typing-relief-use-[a-f0-9]{40}$/.test(activationId)
    || !/^admin-[a-zA-Z0-9_-]{16,108}$/.test(deductionId)) {
    fail("รหัสรายการทดสอบ Typing Relief ไม่ถูกต้อง", 400);
  }
  const correctionId = "admin-correction-suphitcha-typing-test-20261105";
  const walletPath = walletDocumentPath(username);
  const historyRoot = path("qa_sparks_wallets", walletKey(username), "history");
  const correctionPath = historyRoot + "/" + correctionId;
  const redemptionPath = historyRoot + "/" + redemptionId;
  const activationPath = historyRoot + "/" + activationId;
  const deductionPath = historyRoot + "/" + deductionId;
  for (let attempt = 0; attempt < 4; attempt++) {
    const started = await firestoreRequest(":beginTransaction", "POST", { options: { readWrite: {} } });
    const transaction = started?.transaction;
    if (!transaction) fail("ไม่สามารถเริ่มตรวจสอบการแก้ไข Sparks ได้", 503);
    try {
      const [walletDoc, correctionDoc, redemptionDoc, activationDoc, deductionDoc] = await Promise.all([
        readDoc(walletPath, transaction), readDoc(correctionPath, transaction),
        readDoc(redemptionPath, transaction), readDoc(activationPath, transaction),
        readDoc(deductionPath, transaction),
      ]);
      if (correctionDoc) {
        const prior = recordValue(correctionDoc);
        if (prior.source === "admin-test-correction" && normalize(prior.targetUsername) === "suphitcha") {
          return { updated: false, alreadyApplied: true,
            balance: balance(recordValue(walletDoc).balance) };
        }
        fail("รายการนี้มีข้อมูลแก้ไขอยู่แล้ว", 409);
      }
      const wallet = recordValue(walletDoc);
      const redemption = recordValue(redemptionDoc);
      const activation = recordValue(activationDoc);
      const deduction = recordValue(deductionDoc);
      const correctState = balance(wallet.balance) === 200
        && balance(wallet.totalEarned) === 500
        && balance(wallet.totalSpent) === 300
        && balance(wallet.rewardOrders) === 1
        && balance(wallet.typingReliefOwned) === 0
        && balance(wallet.typingReliefPurchased) === 1
        && balance(wallet.typingReliefUsed) === 1
        && balance(wallet.firstLogin?.amount) === 500;
      const correctRecords = redemptionDoc && activationDoc && deductionDoc
        && redemption.source === "reward-redemption"
        && redemption.rewardId === "typing-relief" && Number(redemption.amount) === -150
        && activation.source === "reward-activation"
        && activation.rewardId === "typing-relief" && Number(activation.amount) === 0
        && deduction.source === "admin-deduct" && Number(deduction.amount) === -150
        && !redemption.voidedAt && !activation.voidedAt && !deduction.voidedAt;
      if (!correctState || !correctRecords) {
        fail("ยอดหรือประวัติไม่ตรงกับการทดลองที่ต้องแก้ไข ระบบยังไม่ได้เปลี่ยนคะแนน", 409);
      }
      const now = new Date().toISOString();
      const reason = "ยกเลิกผลต่อยอดคะแนนของรายการทดสอบ Typing Relief (แลก −150, ใช้สิทธิ์ 0, Admin ลด −150) และคง First Login 500 Sparks โดยไม่ย้อนแก้ภารกิจ QA Access";
      const memberYear = currentMemberYear();
      const writes = [
        updateWrite(walletPath, {
          balance: 500, totalEarned: 500, totalSpent: 0, rewardOrders: 0,
          typingReliefOwned: 0, typingReliefPurchased: 0, typingReliefUsed: 0,
          memberYear, memberYearEarned: memberYear === 2026 ? 500 : 0,
          updatedAt: now, lastCorrectionAt: now,
        }, walletDoc),
        updateWrite(redemptionPath, {
          voidedAt: now, voidedBy: admin.username, voidedReason: reason,
          voidedCorrectionId: correctionId,
        }, redemptionDoc),
        updateWrite(activationPath, {
          voidedAt: now, voidedBy: admin.username, voidedReason: reason,
          voidedCorrectionId: correctionId,
        }, activationDoc),
        updateWrite(deductionPath, {
          voidedAt: now, voidedBy: admin.username, voidedReason: reason,
          voidedCorrectionId: correctionId,
        }, deductionDoc),
        createWrite(correctionPath, {
          createdAt: now, type: "earn", source: "admin-test-correction",
          title: "Typing Relief Test Records Voided",
          targetUsername: username, detail: reason, reason, amount: 0,
          balanceAfter: 500, originalRedemptionId: redemptionId,
          originalActivationId: activationId, originalDeductionId: deductionId,
          performedBy: admin.username, performedByName: admin.displayName,
          status: "Completed",
        }),
      ];
      await firestoreRequest(":commit", "POST", { transaction, writes });
      return { updated: true, alreadyApplied: false, balance: 500,
        earned: 500, spent: 0, rewardOrders: 0, memberYearEarned: memberYear === 2026 ? 500 : 0 };
    } catch (error) {
      if (["ABORTED", "FAILED_PRECONDITION"].includes(error?.firestoreStatus) && attempt < 3) continue;
      throw error;
    }
  }
  fail("มีการทำรายการพร้อมกัน กรุณารีเฟรชก่อนแก้ไข", 409);
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
      let typingReliefRefund = false;
      if (operation === "refund") {
        const originalRow = recordValue(original);
        if (originalRow.source !== "reward-redemption" || !Number.isSafeInteger(Number(originalRow.amount)) || Number(originalRow.amount) >= 0) {
          fail("ไม่พบรายการแลกรางวัลที่สามารถคืนคะแนนได้", 400);
        }
        // TrueMoney may already have an associated payable/paid request.
        // Generic refund must never restore 7,000 Sparks for a cash reward.
        if (originalRow.rewardId !== "typing-relief")
          fail("TrueMoney ไม่รองรับการคืนแต้มผ่านปุ่มทั่วไป ต้องตรวจสอบสถานะ Item/การโอนก่อน", 400);
        signedAmount = -Number(originalRow.amount);
        if (originalRow.rewardId === "typing-relief") {
          if (intCount(data.typingReliefOwned) < 1) fail("ไม่สามารถคืนคะแนน Typing Relief ที่ใช้ไปแล้วได้", 400);
          typingReliefRefund = true;
        }
      }
      const oldBalance = balance(data.balance);
      if (signedAmount < 0 && oldBalance < -signedAmount) fail("Sparks คงเหลือไม่พอสำหรับปรับลด", 400);
      const nextBalance = oldBalance + signedAmount;
      if (!Number.isSafeInteger(nextBalance)) fail("Sparks balance overflow", 400);
      const now = new Date().toISOString();
      const memberYear = currentMemberYear();
      const earnedThisYear = annualEarnedFromWallet(data, memberYear);
      if (operation === "add" && earnedThisYear + quantity > SPARKS_ANNUAL_EARN_CAP) {
        fail("ไม่สามารถเพิ่ม Sparks ได้ เนื่องจากจะเกินโควตาสะสม 200,000 คะแนนต่อปี", 400);
      }
      const earning = Math.max(balance(data.totalEarned), balance(data.firstLogin?.amount));
      const spending = balance(data.totalSpent);
      const title = operation === "add" ? "Admin Added Sparks" : operation === "deduct" ? "Admin Deducted Sparks" : "Reward Sparks Refunded";
      const source = operation === "refund" ? "reward-refund" : "admin-" + operation;
      const updated = {
        username,
        balance: nextBalance,
        totalEarned: earning + (operation === "add" ? quantity : 0),
        memberYear,
        memberYearEarned: earnedThisYear + (operation === "add" ? quantity : 0),
        totalSpent: spending + Math.max(0, -signedAmount),
        updatedAt: now,
      };
      if (typingReliefRefund) {
        updated.typingReliefOwned = intCount(data.typingReliefOwned) - 1;
        updated.typingReliefRefunded = intCount(data.typingReliefRefunded) + 1;
      }
      const fields = encodeFields(updated);
      const history = {
        createdAt: now, type: signedAmount < 0 ? "spend" : "earn",
        source, title, detail: reason, reason, amount: signedAmount,
        balanceAfter: nextBalance, performedBy: admin.username,
        performedByName: admin.displayName, referenceId: operation === "refund" ? referenceId : "",
        requestId,
        status: "Completed",
        ...(typingReliefRefund ? { rewardId: "typing-relief" } : {}),
      };
      const writes = [
        {
          update: { name: DOCUMENTS_RESOURCE + "/" + walletPath, fields },
          updateMask: { fieldPaths: Object.keys(updated) },
          currentDocument: walletDoc?.updateTime ? { updateTime: walletDoc.updateTime } : { exists: false },
        },
        {
          update: { name: DOCUMENTS_RESOURCE + "/" + historyPath, fields: encodeFields(history) },
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
    if (body.action === "claim-daily-checkin") {
      const actor = await authorizeRewardUser(body);
      return res.status(200).json(await claimDailyCheckin(body, actor));
    }
    if (body.action === "redeem-typing-relief" || body.action === "use-typing-relief") {
      const actor = await authorizeRewardUser(body);
      const result = body.action === "redeem-typing-relief"
        ? await redeemTypingRelief(body, actor)
        : await useTypingRelief(body, actor);
      return res.status(200).json(result);
    }
    if (body.action === "get-sparks-catalog") {
      await authorizeRewardUser(body);
      return res.status(200).json({items:await sparksCatalog()});
    }
    if (body.action === "claim-profile-makeover" || body.action === "profile-makeover-status"
      || body.action === "redeem-truemoney" || body.action === "list-truemoney-items"
      || body.action === "use-truemoney-item") {
      const actor = await authorizeRewardUser(body);
      let result;
      if (body.action === "claim-profile-makeover") result = await claimProfileMakeover(actor);
      else if (body.action === "profile-makeover-status") result = await getProfileMakeoverStatus(actor);
      else if (body.action === "redeem-truemoney") result = await redeemTrueMoney(body,actor);
      else if (body.action === "list-truemoney-items") result = await listMyTrueMoneyItems(actor);
      else result = await useTrueMoneyItem(body,actor);
      return res.status(200).json(result);
    }
    if (body.action === "reauth") return res.status(200).json(await reauthorizeAdminSession(body));
    const admin = await authorizeAdmin(body);
    if (body.action === "admin-sparks-catalog") return res.status(200).json({items:await sparksCatalog()});
    if (body.action === "update-sparks-catalog")
      return res.status(200).json(await updateSparksCatalog(body,admin));
    if (body.action === "list-truemoney-requests") return res.status(200).json(await listPayoutRequests());
    if (body.action === "complete-truemoney-payout")
      return res.status(200).json(await completeTrueMoneyPayout(body,admin));
    if (body.action === "void-chachiya-test-pair") {
      return res.status(200).json(await voidChachiyaTestPair(body, admin));
    }
    if (body.action === "void-suphitcha-typing-test") {
      return res.status(200).json(await voidSuphitchaTypingTest(body, admin));
    }
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
