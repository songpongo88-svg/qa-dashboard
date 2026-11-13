import { createHash, createSign, timingSafeEqual } from "node:crypto";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";
const AUTH_PROJECT = "qa-dashboard-b0b5d";
let tokenCache = { value: "", expiresAt: 0 };

export function normalizeQaUsername(value) {
  const username = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,64}$/.test(username)) return "";
  return username;
}

export function constantTimePasswordMatch(actual, expected) {
  if (typeof actual !== "string" || typeof expected !== "string") return false;
  if (!actual || !expected || actual.length > 256 || expected.length > 256) return false;
  const left = createHash("sha256").update(actual, "utf8").digest();
  const right = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(left, right);
}

export function firestoreFieldsToObject(fields = {}) {
  const parsed = {};
  for (const [name, field] of Object.entries(fields || {})) {
    if (field && typeof field === "object") {
      if (typeof field.stringValue === "string") parsed[name] = field.stringValue;
      else if (typeof field.booleanValue === "boolean") parsed[name] = field.booleanValue;
      else if (field.integerValue != null) parsed[name] = Number(field.integerValue);
      else if (field.nullValue !== undefined) parsed[name] = null;
    }
  }
  return parsed;
}

function serviceAccount() {
  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("QA server authentication is not configured");
  let account;
  try { account = JSON.parse(raw); } catch { throw new Error("QA server authentication configuration is invalid"); }
  if (account.project_id !== AUTH_PROJECT ||
      typeof account.client_email !== "string" ||
      typeof account.private_key !== "string" ||
      !account.private_key.includes("PRIVATE KEY")) {
    throw new Error("QA server authentication is not configured for the expected project");
  }
  return account;
}

function b64url(data) {
  return Buffer.from(data).toString("base64url");
}

export function createGoogleServiceJwt(account, issuedAtSeconds) {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss: account.client_email,
    sub: account.client_email,
    aud: GOOGLE_TOKEN_URL,
    scope: FIRESTORE_SCOPE,
    iat: issuedAtSeconds,
    exp: issuedAtSeconds + 3600,
  }));
  const signingInput = header + "." + payload;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  return signingInput + "." + signer.sign(account.private_key).toString("base64url");
}

async function googleAccessToken() {
  if (tokenCache.value && Date.now() < tokenCache.expiresAt) return tokenCache.value;
  const account = serviceAccount();
  const issuedAtSeconds = Math.floor(Date.now() / 1000);
  const assertion = createGoogleServiceJwt(account, issuedAtSeconds);
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(10_000),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token || !Number.isFinite(Number(data.expires_in))) {
    throw new Error("QA profile verification backend is unavailable");
  }
  tokenCache = {
    value: String(data.access_token),
    expiresAt: Date.now() + Math.max(1, Number(data.expires_in) - 180) * 1000,
  };
  return tokenCache.value;
}

export async function readQaFirebaseProfile(username) {
  const normalized = normalizeQaUsername(username);
  if (!normalized) return null;
  const bearer = await googleAccessToken();
  const resource = [
    "https://firestore.googleapis.com/v1/projects",
    AUTH_PROJECT, "databases/(default)/documents/qa_user_profiles", encodeURIComponent(normalized),
  ].join("/");
  const response = await fetch(resource, {
    headers: { authorization: "Bearer " + bearer },
    cache: "no-store", signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("QA profile verification backend is unavailable");
  const doc = await response.json();
  const profile = firestoreFieldsToObject(doc.fields);
  if (normalizeQaUsername(profile.username || normalized) !== normalized) return null;
  return profile;
}

export function profileActiveNow(profile, todayBangkok) {
  if (!profile || String(profile.status || "Active").toLowerCase() !== "active") return false;
  const effective = String(profile.suspendEffectiveDate || "").slice(0, 10);
  const end = String(profile.suspendEndDate || "").slice(0, 10);
  if (effective && effective <= todayBangkok) {
    if (profile.suspendAutoReactivate === true && end && end <= todayBangkok) return true;
    return false;
  }
  const expires = String(profile.passwordExpiresAt || profile.accessExpiresAt || "");
  if (expires && Date.parse(expires) <= Date.now()) return false;
  return true;
}

export async function verifyQaUsernamePassword(username, password) {
  const normalized = normalizeQaUsername(username);
  if (!normalized || typeof password !== "string" || password.length > 256) return null;
  const profile = await readQaFirebaseProfile(normalized);
  const todayBangkok = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  if (!profileActiveNow(profile, todayBangkok)) return null;
  if (!constantTimePasswordMatch(profile.password, password)) return null;
  return {
    username: normalized,
    displayName: String(profile.displayName || profile.agentName || normalized),
    role: String(profile.role || "Admin Live Chat"),
    agentName: String(profile.agentName || profile.displayName || normalized),
    email: String(profile.email || ""),
  };
}
