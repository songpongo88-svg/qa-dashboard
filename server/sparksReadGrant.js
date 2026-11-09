import { createHmac, timingSafeEqual } from "node:crypto";

// Short-lived, server-verified read grant. This never authorizes mutations.
// Issued ONLY after the existing Firebase QA session check has succeeded.
const TTL_MS = 15 * 60 * 1000;
const PURPOSE = "qa-sparks-cloud-wallet-read-v1";
function secret() {
  const value = String(process.env.SPARKS_SUPABASE_BRIDGE_TOKEN || "");
  return value.length >= 40 ? value : "";
}
export function issueSparksReadGrant(username, sessionId, now = Date.now()) {
  const key = secret();
  if (!key || !username || !sessionId) return "";
  const payload = Buffer.from(JSON.stringify({
    purpose: PURPOSE, username: String(username).trim().toLowerCase(),
    sessionId: String(sessionId), expires: now + TTL_MS,
  })).toString("base64url");
  const mac = createHmac("sha256", key).update(PURPOSE + "." + payload).digest("base64url");
  return payload + "." + mac;
}
export function verifySparksReadGrant(value, username, sessionId, now = Date.now()) {
  const key = secret();
  if (!key || typeof value !== "string" || value.length > 2048) return false;
  const parts = value.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  const expected = createHmac("sha256", key).update(PURPOSE + "." + parts[0]).digest();
  let received;
  try { received = Buffer.from(parts[1], "base64url"); }
  catch { return false; }
  if (received.length !== expected.length || !timingSafeEqual(expected, received)) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    return payload.purpose === PURPOSE
      && payload.username === String(username || "").trim().toLowerCase()
      && payload.sessionId === String(sessionId || "")
      && Number.isSafeInteger(payload.expires)
      && now < payload.expires && payload.expires <= now + TTL_MS;
  } catch { return false; }
}
