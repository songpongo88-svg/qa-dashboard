import { createSign, createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createFruitMatchService } from "../server/fruitMatchService.js";
import { createQaLotteryService } from "../server/qaLotteryService.js";
import { createQaRewardsService } from "../server/qaRewardsService.js";
import { createSnakesService } from "../server/snakesLaddersService.js";
import { createHiddenTreasureService } from "../server/hiddenTreasureService.js";

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
const TRUE_MONEY = Object.freeze({
  id:"truemoney-20-thb", price:10000, valueTHB:20,
  validityMs:30*24*60*60*1000, paymentBusinessDays:14,
});
const TRUE_MONEY_SETTINGS_PATH = "qa_sparks_reward_settings/truemoney-20-thb";
const PROFILE_QUEST = Object.freeze({
  id: "profile-makeover-2026", start: "2026-11-05", end: "2026-12-15",
  reward: 150, historyId: "quest-profile-makeover-2026",
});
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
const adminReadCache = new Map();
const ADMIN_READ_CACHE_MS = 60_000;
const FIRESTORE_QUOTA_COOLDOWN_MS = 5 * 60_000;
let firestoreQuotaLimitedUntil = 0;
function firestoreQuotaError() {
  return Object.assign(new Error("Firestore มีข้อจำกัดโควตาหรืออัตราการใช้งาน กรุณาตรวจที่ Firebase Console → Firestore → Usage และหลีกเลี่ยงการรีเฟรชซ้ำ"), {
    status: 429, code: "FIRESTORE_RESOURCE_EXHAUSTED", firestoreStatus: "RESOURCE_EXHAUSTED",
  });
}
function cachedAdminRead(key, load, forceRefresh = false) {
  const cached = adminReadCache.get(key);
  if (cached?.pending) return cached.pending;
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return Promise.resolve(structuredClone(cached.value));
  const entry = { expiresAt: 0 };
  const pending = Promise.resolve().then(load).then(value => {
    if (adminReadCache.get(key) === entry) {
      entry.value = structuredClone(value);
      entry.expiresAt = Date.now() + ADMIN_READ_CACHE_MS;
      entry.pending = undefined;
    }
    return structuredClone(value);
  }, error => { if (adminReadCache.get(key) === entry) adminReadCache.delete(key); throw error; });
  entry.pending = pending;
  adminReadCache.set(key, entry);
  if (adminReadCache.size > 100) for (const [oldKey, old] of adminReadCache) {
    if (!old.pending && old.expiresAt < Date.now()) adminReadCache.delete(oldKey);
  }
  return pending;
}

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
function trueMoneyPrice(doc) {
  const price = recordValue(doc).price;
  return Number.isSafeInteger(price) && price >= 1 && price <= 1000000 ? price : TRUE_MONEY.price;
}
async function getTrueMoneyPrice() {
  const doc = await cachedAdminRead("truemoney-price", () => readDoc(TRUE_MONEY_SETTINGS_PATH));
  return {price:trueMoneyPrice(doc)};
}
async function setTrueMoneyPrice(body, admin) {
  const price = Number(body.price);
  if (!Number.isSafeInteger(price) || price < 1 || price > 1000000) fail("ราคาต้องเป็นจำนวนเต็มตั้งแต่ 1–1,000,000 Sparks",400);
  for (let attempt=0; attempt<4; attempt++) {
    const begin=await firestoreRequest(":beginTransaction","POST",{options:{readWrite:{}}});
    const transaction=begin?.transaction;
    if (!transaction) fail("ไม่สามารถบันทึกราคารางวัลได้",503);
    try {
      const doc=await readDoc(TRUE_MONEY_SETTINGS_PATH,transaction);
      const previousPrice=trueMoneyPrice(doc);
      if (price===previousPrice) {
        await firestoreRequest(":rollback","POST",{transaction}).catch(()=>{});
        return {updated:false,price,previousPrice};
      }
      const now=new Date().toISOString();
      await firestoreRequest(":commit","POST",{transaction,writes:[
        updateWrite(TRUE_MONEY_SETTINGS_PATH,{price,previousPrice,updatedAt:now,updatedBy:admin.username},doc),
        createWrite(path("qa_sparks_reward_settings","truemoney-20-thb","history",randomUUID()),{
          previousPrice,price,updatedAt:now,updatedBy:admin.username,
          updatedByName:admin.displayName,
        }),
      ]});
      adminReadCache.delete("truemoney-price");
      return {updated:true,price,previousPrice};
    } catch(error) {
      if (["ABORTED","FAILED_PRECONDITION"].includes(error?.firestoreStatus) && attempt<3) continue;
      throw error;
    }
  }
  fail("มีการแก้ไขราคาพร้อมกัน กรุณาลองใหม่",409);
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
    scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform",
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
  // A quota response is shared by this function instance. Reject repeated
  // display reads locally instead of contacting an already limited database.
  // Authentication and all mutations still require normal server verification.
  if (method === "GET" && Date.now() < firestoreQuotaLimitedUntil) throw firestoreQuotaError();
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
      firestoreQuotaLimitedUntil = Date.now() + FIRESTORE_QUOTA_COOLDOWN_MS;
      throw firestoreQuotaError();
    }
    const detail = String(firestoreStatus || result?.error?.message || "Firestore request failed");
    const status = response.status === 403 ? 503 : response.status >= 500 ? 503 : response.status;
    throw Object.assign(new Error(detail), { status, firestoreStatus });
  }
  if (method === "POST" && endpoint.endsWith(":commit")) adminReadCache.clear();
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
    return intCount(wallet.memberYearEarned);
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
    return Math.max(intCount(wallet.totalEarned),
      prizeYear === 2026 ? intCount(prize?.amount) : 0);
  }
  return 0;
}
// Old wallets with no balanceYear were first created in 2026. Never carry them
// into another calendar year. Reading balances does not write to Firestore.
function spendableBalance(wallet, year = currentMemberYear()) {
  const balanceYear = intCount(wallet.balanceYear) || 2026;
  return balanceYear === year ? intCount(wallet.balance) : 0;
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
      const current = spendableBalance(wallet);
      if (owned >= TYPING_RELIEF_MAX_OWNED) fail("สะสม Typing Relief ได้สูงสุด 10 สิทธิ์", 400);
      if (current < TYPING_RELIEF_PRICE) fail("QA Sparks ไม่เพียงพอ (ต้องใช้ 150 Sparks)", 400);
      const nextBalance = current - TYPING_RELIEF_PRICE;
      const now = new Date().toISOString();
      const nextOwned = owned + 1;
      const updates = {
        username: actor.username,
        balance: nextBalance,
        balanceYear: currentMemberYear(),
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
/**
 * Quest #02: all members with a *stored*, non-default profile photo qualify,
 * including those who uploaded before the event. No button/claim date choice.
 * The client only initiates a check; this server enforces every condition.
 */
async function claimProfileMakeover(actor) {
  const today = bangkokQuestDate();
  if (today < PROFILE_QUEST.start) fail("Profile Makeover ยังไม่เปิดกิจกรรม", 400);
  if (today > PROFILE_QUEST.end) fail("Profile Makeover สิ้นสุดวันที่ 15 ธันวาคม 2026", 400);
  const savedProfile = await findProfileByUsername(actor.username);
  const candidates = [...new Set([String(savedProfile.username || ""), actor.username,
    actor.username.charAt(0).toUpperCase() + actor.username.slice(1)].filter(Boolean))];
  const walletPath = walletDocumentPath(actor.username);
  const historyPath = path("qa_sparks_wallets", walletKey(actor.username), "history", PROFILE_QUEST.historyId);
  for (let attempt = 0; attempt < 4; attempt++) {
    const begun = await firestoreRequest(":beginTransaction", "POST", { options: { readWrite: {} } });
    const transaction = begun?.transaction;
    if (!transaction) fail("ไม่สามารถตรวจสอบ Quest ได้", 503);
    try {
      const [walletDoc, historyDoc, ...photoDocs] = await Promise.all([
        readDoc(walletPath, transaction), readDoc(historyPath, transaction),
        ...candidates.map((name) => readDoc(path("qa_user_profile_photos", name.replace(/\//g, "__").replace(/\s+/g, " ")), transaction)),
      ]);
      const wallet = recordValue(walletDoc);
      if (historyDoc || wallet.profileMakeoverClaimedAt) {
        return { updated: false, alreadyClaimed: true,
          balance: spendableBalance(wallet), memberYearEarned: annualEarnedFromWallet(wallet),
          claimedAt: String(wallet.profileMakeoverClaimedAt || recordValue(historyDoc).createdAt || "") };
      }
      const hasCustomPhoto = photoDocs.some((document) => {
        const photo = recordValue(document);
        return Boolean(document && normalize(photo.username) === actor.username
          && typeof photo.photoDataUrl === "string"
          && (/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(photo.photoDataUrl)
            || /^https:\/\//i.test(photo.photoDataUrl)));
      });
      if (!hasCustomPhoto) fail("ยังไม่พบรูปโปรไฟล์ที่เปลี่ยนเองในระบบ", 409);
      const year = currentMemberYear();
      const annualEarned = annualEarnedFromWallet(wallet, year);
      const now = new Date().toISOString();
      const nextBalance = spendableBalance(wallet,year) + PROFILE_QUEST.reward;
      const nextAnnual = annualEarned + PROFILE_QUEST.reward;
      const earnedLifetime = Math.max(intCount(wallet.totalEarned), intCount(wallet.firstLogin?.amount));
      await firestoreRequest(":commit", "POST", { transaction, writes: [
        updateWrite(walletPath, {
          username: actor.username, balance: nextBalance, balanceYear: year,
          totalEarned: earnedLifetime + PROFILE_QUEST.reward,
          memberYear: year, memberYearEarned: nextAnnual,
          profileMakeoverClaimedAt: now, updatedAt: now,
        }, walletDoc),
        createWrite(historyPath, {
          createdAt: now, type: "earn", source: "quest-profile-makeover",
          questId: PROFILE_QUEST.id, title: "Profile Makeover Reward",
          detail: "เปลี่ยนรูปโปรไฟล์จากค่าเริ่มต้น รับอัตโนมัติ 1 ครั้ง",
          amount: PROFILE_QUEST.reward, balanceAfter: nextBalance,
          performedBy: actor.username, status: "Completed",
        }),
      ] });
      return { updated: true, alreadyClaimed: false, balance: nextBalance,
        memberYearEarned: nextAnnual, claimedAt: now };
    } catch (error) {
      if (["ABORTED", "FAILED_PRECONDITION"].includes(error?.firestoreStatus) && attempt < 3) continue;
      throw error;
    }
  }
  fail("มีการรับรางวัลพร้อมกัน กรุณาตรวจสอบยอด Sparks อีกครั้ง", 409);
}


function ownTrueMoneyItems(wallet){
  const values=Array.isArray(wallet.trueMoneyItems)?wallet.trueMoneyItems:[];
  return values.filter(item=>item&&typeof item.itemId==="string"
    && item.rewardId===TRUE_MONEY.id).slice(-150);
}
function bangkokDateAt(now=new Date()){
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Bangkok",year:"numeric",
    month:"2-digit",day:"2-digit"}).formatToParts(now);
  const part=key=>parts.find(x=>x.type===key)?.value||"";
  return part("year")+"-"+part("month")+"-"+part("day");
}
function paymentDueDate(requestedAt){
  // Only Monday–Friday are excluded, per the agreed policy;
  // no unsupported local holiday calendar is assumed.
  const localDate=bangkokDateAt(new Date(requestedAt));
  const date=new Date(localDate+"T12:00:00.000Z");
  let days=0;
  while(days<TRUE_MONEY.paymentBusinessDays){
    date.setUTCDate(date.getUTCDate()+1);
    const weekday=date.getUTCDay();
    if(weekday!==0&&weekday!==6)days++;
  }
  return date.toISOString().slice(0,10);
}
function validateTrueMoneyItemId(id){
  const value=String(id||"").trim();
  if(!/^tm-[a-zA-Z0-9_-]{12,110}$/.test(value)) fail("ไม่พบ Item TrueMoney ที่เลือก",400);
  return value;
}
async function redeemTrueMoney(body,actor){
  const requestId=checkRequestId(body.requestId);
  const walletPath=walletDocumentPath(actor.username);
  const historyPath=path("qa_sparks_wallets",walletKey(actor.username),"history","tm-redeem-"+requestId);
  for(let retry=0;retry<4;retry++){
    const started=await firestoreRequest(":beginTransaction","POST",{options:{readWrite:{}}});
    if(!started?.transaction)fail("ไม่สามารถเริ่มการแลกรางวัล TrueMoney ได้",503);
    const transaction=started.transaction;
    try{
      const [walletDoc,historyDoc,settingsDoc]=await Promise.all([
        readDoc(walletPath,transaction),readDoc(historyPath,transaction),readDoc(TRUE_MONEY_SETTINGS_PATH,transaction),
      ]);
      const wallet=recordValue(walletDoc);
      if(historyDoc){
        const previous=recordValue(historyDoc);
        if(previous.source==="reward-redemption"&&previous.rewardId===TRUE_MONEY.id){
          return {updated:false,alreadyApplied:true,balance:intCount(previous.balanceAfter),
            itemId:String(previous.itemId||"")};
        }
        fail("รหัสการแลกนี้ถูกใช้งานแล้ว",409);
      }
      const balance=spendableBalance(wallet);
      const price=trueMoneyPrice(settingsDoc);
      if(Number(body.expectedPrice)!==price)fail("ราคาแลกรางวัลมีการเปลี่ยนแปลง กรุณาเปิดรายละเอียด Item ใหม่อีกครั้ง",409);
      if(balance<price)fail("ต้องมี "+price.toLocaleString("en-US")+" QA Sparks เพื่อแลก TrueMoney 20 บาท",400);
      const items=ownTrueMoneyItems(wallet);
      if(items.length>=100)fail("เก็บ TrueMoney Item ได้สูงสุด 100 รายการต่อบัญชี",400);
      const now=new Date(),itemId="tm-"+requestId;
      const item={
        itemId,rewardId:TRUE_MONEY.id,status:"unused",
        redeemedAt:now.toISOString(),expiresAt:new Date(now.getTime()+TRUE_MONEY.validityMs).toISOString(),
        valueTHB:TRUE_MONEY.valueTHB,
      };
      const nextBalance=balance-price;
      await firestoreRequest(":commit","POST",{transaction,writes:[
        updateWrite(walletPath,{
          username:actor.username,balance:nextBalance,balanceYear:currentMemberYear(),
          totalSpent:intCount(wallet.totalSpent)+price,
          rewardOrders:intCount(wallet.rewardOrders)+1,
          trueMoneyItems:[...items,item],
          updatedAt:now.toISOString(),
        },walletDoc),
        createWrite(historyPath,{
          createdAt:now.toISOString(),type:"spend",source:"reward-redemption",
          rewardId:TRUE_MONEY.id,title:"TrueMoney 20 THB Redeemed",
          detail:"แลก "+price.toLocaleString("en-US")+" Sparks รับ Item TrueMoney 20 บาท อายุ 30 วัน",
          price,itemId,amount:-price,balanceAfter:nextBalance,
          performedBy:actor.username,status:"Completed",
        }),
      ]});
      return {updated:true,balance:nextBalance,item};
    }catch(error){
      if(["ABORTED","FAILED_PRECONDITION"].includes(error?.firestoreStatus)&&retry<3)continue;
      throw error;
    }
  }
  fail("มีการแลกรางวัลพร้อมกัน กรุณาลองใหม่",409);
}
async function requestTrueMoneyPayout(body,actor){
  const itemId=validateTrueMoneyItemId(body.itemId);
  const phone=String(body.phone||"").trim();
  if(!/^0[0-9]{9}$/.test(phone))fail("กรุณากรอกเบอร์ TrueMoney 10 หลัก โดยขึ้นต้นด้วย 0",400);
  const walletPath=walletDocumentPath(actor.username);
  const requestPath=path("qa_sparks_true_money_requests",itemId);
  const historyPath=path("qa_sparks_wallets",walletKey(actor.username),"history","tm-use-"+itemId);
  for(let retry=0;retry<4;retry++){
    const started=await firestoreRequest(":beginTransaction","POST",{options:{readWrite:{}}});
    const transaction=started?.transaction;
    if(!transaction)fail("ไม่สามารถเริ่มส่งคำขอ TrueMoney ได้",503);
    try{
      const [walletDoc,requestDoc,historyDoc]=await Promise.all([
        readDoc(walletPath,transaction),readDoc(requestPath,transaction),readDoc(historyPath,transaction),
      ]);
      const wallet=recordValue(walletDoc);
      const items=ownTrueMoneyItems(wallet);
      const position=items.findIndex(item=>item.itemId===itemId);
      if(position<0)fail("Item ไม่อยู่ในบัญชีผู้ใช้นี้",403);
      const item=items[position];
      if(requestDoc||historyDoc||item.status==="requested"){
        const existing=recordValue(requestDoc);
        if(requestDoc&&normalize(existing.username)===actor.username){
          return {updated:false,alreadyApplied:true,requestId:itemId,
            dueDate:String(existing.dueDate||""),status:String(existing.status||"pending")};
        }
        fail("Item นี้เคยถูกใช้งานแล้ว",409);
      }
      if(item.status!=="unused")fail("Item นี้ไม่พร้อมใช้งาน",409);
      const now=new Date();
      if(!Number.isFinite(Date.parse(item.expiresAt))||now.getTime()>=Date.parse(item.expiresAt)){
        fail("Item นี้หมดอายุ 30 วันแล้ว ไม่สามารถขอรับเงินได้",400);
      }
      const dueDate=paymentDueDate(now.toISOString());
      const nextItems=[...items];nextItems[position]={...item,status:"requested",requestedAt:now.toISOString(),requestId:itemId};
      const request={
        requestId:itemId,itemId,rewardId:TRUE_MONEY.id,
        username:actor.username,displayName:actor.displayName,
        phone,amountTHB:TRUE_MONEY.valueTHB,status:"pending",
        createdAt:now.toISOString(),dueDate,redeemedAt:item.redeemedAt,
        payoutConfirmedAt:"",payoutConfirmedBy:"",
      };
      await firestoreRequest(":commit","POST",{transaction,writes:[
        updateWrite(walletPath,{
          trueMoneyItems:nextItems,updatedAt:now.toISOString(),
        },walletDoc),
        createWrite(requestPath,request),
        createWrite(historyPath,{
          createdAt:now.toISOString(),type:"earn",source:"reward-activation",
          rewardId:TRUE_MONEY.id,itemId,title:"TrueMoney Payout Requested",
          detail:"ส่งคำขอรับเงิน TrueMoney 20 บาท กำหนดภายใน "+dueDate,
          amount:0,balanceAfter:spendableBalance(wallet),status:"Completed",performedBy:actor.username,
        }),
      ]});
      return {updated:true,requestId:itemId,dueDate,status:"pending"};
    }catch(error){
      if(["ABORTED","FAILED_PRECONDITION"].includes(error?.firestoreStatus)&&retry<3)continue;
      throw error;
    }
  }
  fail("มีการใช้ Item พร้อมกัน กรุณาลองใหม่",409);
}
async function listMemberTrueMoney(actor){
  const wallet=recordValue(await readDoc(walletDocumentPath(actor.username)));
  const items=ownTrueMoneyItems(wallet);
  const requests=await Promise.all(items.filter(item=>item.status==="requested")
    .map(item=>readDoc(path("qa_sparks_true_money_requests",item.itemId))));
  const mine=requests.filter(Boolean).map(row=>recordValue(row)).filter(row=>normalize(row.username)===actor.username)
    .map(row=>({
      requestId:row.requestId,itemId:row.itemId,status:row.status,
      dueDate:row.dueDate,createdAt:row.createdAt,amountTHB:row.amountTHB,
      phoneMasked:"******"+String(row.phone||"").slice(-4),payoutConfirmedAt:row.payoutConfirmedAt||"",
    }));
  return {items,requests:mine};
}
async function listTrueMoneyTracker(){
  const pages=await listCollection("qa_sparks_true_money_requests",[
    "requestId","username","displayName","phone","amountTHB","status",
    "createdAt","dueDate","payoutConfirmedAt","payoutConfirmedBy",
  ]);
  return {requests:pages.documents.map(recordValue)
    .filter(row=>row.rewardId===TRUE_MONEY.id||row.amountTHB===20)
    .sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))),
    truncated:pages.truncated};
}
async function markTrueMoneyPaid(body,admin){
  const itemId=validateTrueMoneyItemId(body.itemId);
  const requestPath=path("qa_sparks_true_money_requests",itemId);
  for(let retry=0;retry<4;retry++){
    const started=await firestoreRequest(":beginTransaction","POST",{options:{readWrite:{}}});
    const transaction=started?.transaction;
    if(!transaction)fail("ไม่สามารถยืนยันโอนเงินได้",503);
    try{
      const requestDoc=await readDoc(requestPath,transaction);
      if(!requestDoc)fail("ไม่พบคำขอโอน TrueMoney",404);
      const request=recordValue(requestDoc);
      if(request.status==="paid")return {updated:false,alreadyApplied:true,status:"paid"};
      if(request.status!=="pending"||request.amountTHB!==20)fail("สถานะคำขอไม่พร้อมยืนยัน",409);
      const paidHistoryPath=path("qa_sparks_wallets",walletKey(request.username),"history","tm-paid-"+itemId);
      const [historyDoc,walletDoc]=await Promise.all([
        readDoc(paidHistoryPath,transaction),readDoc(walletDocumentPath(request.username),transaction),
      ]);
      if(historyDoc)fail("พบประวัติยืนยันโอนซ้ำ กรุณารีเฟรช Tracker",409);
      const now=new Date().toISOString();
      await firestoreRequest(":commit","POST",{transaction,writes:[
        updateWrite(requestPath,{
          status:"paid",payoutConfirmedAt:now,payoutConfirmedBy:admin.username,
          payoutConfirmedByName:admin.displayName,
        },requestDoc),
        createWrite(paidHistoryPath,{
          createdAt:now,type:"earn",source:"reward-payout",
          rewardId:TRUE_MONEY.id,itemId,title:"TrueMoney 20 THB Paid",
          detail:"Admin ยืนยันโอน TrueMoney 20 บาทสำเร็จ",
          amount:0,balanceAfter:spendableBalance(recordValue(walletDoc)),
          performedBy:admin.username,status:"Completed",
        }),
      ]});
      return {updated:true,status:"paid",paidAt:now};
    }catch(error){
      if(["ABORTED","FAILED_PRECONDITION"].includes(error?.firestoreStatus)&&retry<3)continue;
      throw error;
    }
  }
  fail("รายการนี้ถูกยืนยันพร้อมกันแล้ว กรุณารีเฟรช Tracker",409);
}
async function claimDailyCheckin(body, actor) {
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
          balance: spendableBalance(wallet), memberYearEarned: annualEarnedFromWallet(wallet) };
      }
      const memberYear = currentMemberYear();
      const earnedThisYear = annualEarnedFromWallet(wallet, memberYear);
      const now = new Date().toISOString();
      // Never reduce earned levels when tickets are redeemed.
      const lifetimeEarned = Math.max(intCount(wallet.totalEarned), intCount(wallet.firstLogin?.amount));
      const nextBalance = spendableBalance(wallet,memberYear) + DAILY_CHECKIN_QUEST.reward;
      const nextEarned = earnedThisYear + DAILY_CHECKIN_QUEST.reward;
      const nextDays = [...claimedDays, dayNumber].sort((a, b) => a - b);
      const updates = {
        username: actor.username,
        balance: nextBalance,
        balanceYear: memberYear,
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
          return { updated: false, alreadyApplied: true, balance: spendableBalance(wallet), owned: intCount(wallet.typingReliefOwned), remainingWords: intCount(used.remainingWords), appliedWords: intCount(used.appliedWords) };
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
        balance: spendableBalance(wallet),
        balanceYear: currentMemberYear(),
        typingReliefOwned: nextOwned,
        typingReliefUsed: intCount(wallet.typingReliefUsed) + 1,
        updatedAt: now,
      };
      const history = {
        createdAt: now, type: "redeem", source: "reward-activation",
        rewardId: "typing-relief", title: "Typing Relief Activated",
        detail: "ใช้ Typing Relief กับ QA Access Check",
        challengeId, originalWords, remainingWords, appliedWords, reductionPercent: TYPING_RELIEF_DISCOUNT_PERCENT,
        amount: 0, balanceAfter: spendableBalance(wallet), inventoryAfter: nextOwned,
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
      return { updated: true, balance: spendableBalance(wallet), owned: nextOwned, remainingWords, appliedWords };
    } catch (error) {
      if (["ABORTED", "FAILED_PRECONDITION"].includes(error?.firestoreStatus) && attempt < 3) continue;
      throw error;
    }
  }
  fail("มีการทำรายการพร้อมกัน กรุณาลองใหม่อีกครั้ง", 409);
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
    balance: spendableBalance(wallet),
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
function listUsers(forceRefresh = false) {
  return cachedAdminRead("list", loadUsers, forceRefresh);
}
async function loadUsers() {
  const [profilePages, walletPages] = await Promise.all([
    listCollection("qa_user_profiles", ["username", "displayName", "agentName", "role", "status", "suspendEffectiveDate", "suspendEndDate", "suspendAutoReactivate"]),
    listCollection("qa_sparks_wallets", ["username", "balance", "totalEarned", "totalSpent", "rewardOrders", "firstLogin", "memberYear", "memberYearEarned", "balanceYear"]),
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
async function loadHistory(username, forceRefresh = false) {
  await requireActiveTarget(username);
  return cachedAdminRead("history:" + username, () => loadUserHistory(username), forceRefresh);
}
async function loadUserHistory(username) {
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
          balance: 150, balanceYear: 2026, totalEarned: 150, totalSpent: 0,
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
          balance: 500, balanceYear: 2026, totalEarned: 500, totalSpent: 0, rewardOrders: 0,
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
        // A redeemed reward may remain usable, but expired Sparks cannot be
        // refunded into a new year's wallet. Preserve the old audit entry.
        const redeemedAt = new Date(String(originalRow.createdAt || ""));
        if (!Number.isFinite(redeemedAt.getTime()) ||
            Number(bangkokDateAt(redeemedAt).slice(0,4)) !== currentMemberYear()) {
          fail("ไม่สามารถคืน Sparks ของรายการแลกจากปีก่อน เพราะคะแนนหมดอายุแล้ว",400);
        }
        signedAmount = -Number(originalRow.amount);
        if (originalRow.rewardId === "typing-relief") {
          if (intCount(data.typingReliefOwned) < 1) fail("ไม่สามารถคืนคะแนน Typing Relief ที่ใช้ไปแล้วได้", 400);
          typingReliefRefund = true;
        }
      }
      const oldBalance = spendableBalance(data);
      if (signedAmount < 0 && oldBalance < -signedAmount) fail("Sparks คงเหลือไม่พอสำหรับปรับลด", 400);
      const nextBalance = oldBalance + signedAmount;
      if (!Number.isSafeInteger(nextBalance)) fail("Sparks balance overflow", 400);
      const now = new Date().toISOString();
      const memberYear = currentMemberYear();
      const earnedThisYear = annualEarnedFromWallet(data, memberYear);
      const earning = Math.max(balance(data.totalEarned), balance(data.firstLogin?.amount));
      const spending = balance(data.totalSpent);
      const title = operation === "add" ? "Admin Added Sparks" : operation === "deduct" ? "Admin Deducted Sparks" : "Reward Sparks Refunded";
      const source = operation === "refund" ? "reward-refund" : "admin-" + operation;
      const updated = {
        username,
        balance: nextBalance,
        balanceYear: memberYear,
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
const fruitMatch = createFruitMatchService({firestoreRequest,readDoc,recordValue,path,updateWrite,createWrite,
  walletDocumentPath,currentMemberYear,annualEarnedFromWallet,spendableBalance});
const qaLottery = createQaLotteryService({firestoreRequest,readDoc,listCollection,recordValue,path,updateWrite,createWrite,
  walletDocumentPath,currentMemberYear,annualEarnedFromWallet,spendableBalance});
const qaSpecialRewards=createQaRewardsService({firestoreRequest,readDoc,listCollection,recordValue,path,
  updateWrite,createWrite,walletDocumentPath,currentMemberYear,annualEarnedFromWallet,
  spendableBalance,getAccessToken});
const snakes=createSnakesService({firestoreRequest,readDoc,recordValue,path,updateWrite,createWrite,
  walletDocumentPath,currentMemberYear,annualEarnedFromWallet,spendableBalance,
  findProfileByUsername,isSuspendedProfile});
const hiddenTreasure=createHiddenTreasureService({firestoreRequest,readDoc,recordValue,path,updateWrite,createWrite,
  walletDocumentPath,currentMemberYear,annualEarnedFromWallet,spendableBalance});

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method === "GET" && req.url?.startsWith("/api/sparks-admin")) return res.status(405).json({error:"Method not allowed"});
  if (req.method === "GET") {
    const expected = String(process.env.CRON_SECRET || "").trim();
    if (!expected || req.headers.authorization !== "Bearer "+expected) return res.status(401).json({error:"Unauthorized cron request"});
    try {return res.status(200).json(await qaLottery.settle());}
    catch(e){console.error("QA Lottery cron failed:",String(e?.message||"Unknown"));return res.status(Number(e?.status)||503).json({error:"QA Lottery automatic settlement unavailable"});}
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    if (["get-truemoney-price","redeem-truemoney","use-truemoney-item","list-my-truemoney"].includes(body.action)) {
      const actor=await authorizeRewardUser(body);
      const result=body.action==="get-truemoney-price"
        ? await getTrueMoneyPrice()
        : body.action==="redeem-truemoney"
        ? await redeemTrueMoney(body,actor)
        : body.action==="use-truemoney-item"
        ? await requestTrueMoneyPayout(body,actor)
        : await listMemberTrueMoney(actor);
      return res.status(200).json(result);
    }
    if (["qa-lottery-state","qa-lottery-buy","qa-lottery-my-tickets"].includes(body.action)) {
      const actor=await authorizeRewardUser(body);
      const result=body.action==="qa-lottery-state"?await qaLottery.state(actor)
        :body.action==="qa-lottery-my-tickets"?await qaLottery.listTickets(actor)
        :await qaLottery.purchase(body,actor);
      return res.status(200).json(result);
    }
    if (["special-rewards-mine","special-rewards-redeem","special-rewards-activate",
      "special-rewards-receipt-check","special-rewards-receipt-scan","special-rewards-submit"].includes(body.action)) {
      const actor=await authorizeRewardUser(body);
      const action=body.action;
      const data=action==="special-rewards-mine"?await qaSpecialRewards.mine(actor)
        :action==="special-rewards-redeem"?await qaSpecialRewards.redeem(body,actor)
        :action==="special-rewards-activate"?await qaSpecialRewards.activate(body,actor)
        :action==="special-rewards-receipt-check"?await qaSpecialRewards.receiptCheck(body,actor)
        :action==="special-rewards-receipt-scan"?await qaSpecialRewards.scanReceipt(body,actor)
        :await qaSpecialRewards.submit(body,actor);
      return res.status(200).json(data);
    }
    if (["treasure-state","treasure-start","treasure-find","treasure-open"].includes(body.action)) {
      const actor=await authorizeRewardUser(body);
      const result=body.action==="treasure-state"?await hiddenTreasure.state(actor)
        :body.action==="treasure-start"?await hiddenTreasure.start(body,actor)
        :body.action==="treasure-find"?await hiddenTreasure.find(body,actor)
        :await hiddenTreasure.open(body,actor);
      return res.status(200).json(result);
    }
    if (["fruit-match-data","fruit-match-start","fruit-match-finish"].includes(body.action)) {
      const actor = await authorizeRewardUser(body);
      const result = body.action === "fruit-match-data" ? await fruitMatch.data(actor)
        : body.action === "fruit-match-start" ? await fruitMatch.start(body,actor) : await fruitMatch.finish(body,actor);
      return res.status(200).json(result);
    }
    if (typeof body.action==="string"&&body.action.startsWith("snakes-")) {
      // Unpublished: validate the real QA owner session server-side for every operation.
      // The client-only Private Test card is not an authorization mechanism.
      const actor=await authorizeAdmin(body);
      // Private test rewards must never be paid into the production wallet.
      if(body.action==="snakes-claim")return res.status(403).json({error:"โหมดทดสอบไม่สามารถรับ Sparks เข้ากระเป๋าจริงได้"});
      // Do not invite real users into an unreleased game.
      if(body.action==="snakes-invite"||body.action==="snakes-respond")
        return res.status(403).json({error:"โหมดทดสอบสำหรับเจ้าของระบบและ Bot เท่านั้น"});
      const action={
        "snakes-state":()=>snakes.state(actor,body.includeHistory===true),
        "snakes-create":()=>snakes.create(body,actor),
        "snakes-invite":()=>snakes.invite(body,actor),
        "snakes-add-bot":()=>snakes.addBot(body,actor),
        "snakes-cancel":()=>snakes.cancelRoom(body,actor),
        "snakes-respond":()=>snakes.respond(body,actor),
        "snakes-start":()=>snakes.start(body,actor),
        "snakes-roll":()=>snakes.roll(body,actor),
        "snakes-target":()=>snakes.target(body,actor),
        "snakes-claim":()=>snakes.claim(body,actor),
      }[body.action];
      if(!action)fail("Unknown Snakes & Ladders action",400);
      return res.status(200).json(await action());
    }
    if (body.action === "claim-profile-makeover") {
      const actor = await authorizeRewardUser(body);
      return res.status(200).json(await claimProfileMakeover(actor));
    }
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
    if (body.action === "reauth") return res.status(200).json(await reauthorizeAdminSession(body));
    const admin = await authorizeAdmin(body);
    if (body.action === "set-truemoney-price") {
      return res.status(200).json(await setTrueMoneyPrice(body,admin));
    }
    if (body.action === "list-truemoney-tracker") {
      return res.status(200).json(await listTrueMoneyTracker());
    }
    if (["special-rewards-admin-list","special-rewards-admin-receipt","special-rewards-admin-action"].includes(body.action)) {
      const data=body.action==="special-rewards-admin-list"?await qaSpecialRewards.adminList()
        :body.action==="special-rewards-admin-receipt"?await qaSpecialRewards.adminReceipt(body)
        :await qaSpecialRewards.adminAction(body,admin);
      return res.status(200).json(data);
    }
    if (body.action === "mark-truemoney-paid") {
      return res.status(200).json(await markTrueMoneyPaid(body,admin));
    }
    if (body.action === "void-chachiya-test-pair") {
      return res.status(200).json(await voidChachiyaTestPair(body, admin));
    }
    if (body.action === "void-suphitcha-typing-test") {
      return res.status(200).json(await voidSuphitchaTypingTest(body, admin));
    }
    let data;
    if (body.action === "list") data = await listUsers(body.forceRefresh === true);
    else if (body.action === "history") data = await loadHistory(safeUsername(body.targetUsername), body.forceRefresh === true);
    else if (body.action === "adjust") data = await adjustBalance(body, admin);
    else fail("Unsupported Sparks Admin action");
    return res.status(200).json(data);
  } catch (error) {
    const status = Number(error?.status) || 500;
    if (status === 429) res.setHeader("Retry-After", String(Math.max(1, Math.ceil((firestoreQuotaLimitedUntil - Date.now()) / 1000)) || 300));
    // Never return service-account details, raw credentials or Firestore internal stack traces.
    const message = status === 500 ? "Sparks Admin could not complete this request" : String(error?.message || "Request failed");
    if (status >= 500) console.error("Sparks admin request error:", String(error?.message || "Unknown"));
    return res.status(status).json({ error: message, ...(error?.code ? { code: error.code } : {}) });
  }
}

