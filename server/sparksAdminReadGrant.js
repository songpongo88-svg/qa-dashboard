import { createHmac, timingSafeEqual } from "node:crypto";

// A verified QA administrator may see Sparks data during a brief Firebase quota
// interruption. This grant CANNOT authorize writes, payouts, or changes to roles.
const PURPOSE = "qa-sparks-admin-readonly-grace-v1";
const TTL_MS = 5 * 60 * 1000;
const MAX_USERS = 500;
const MAX_TOKEN_LENGTH = 100000;
function secret() {
  const value = String(process.env.SPARKS_SUPABASE_BRIDGE_TOKEN || "");
  return value.length >= 40 ? value : "";
}
function cleanUsers(users) {
  if (!Array.isArray(users) || users.length > MAX_USERS) return null;
  const seen = new Set();
  const normalized = [];
  for (const user of users) {
    const username = String(user?.username || "").trim().toLowerCase();
    if (!/^[a-z0-9_-]{1,128}$/.test(username) || seen.has(username)) return null;
    if (String(user?.status || "").toLowerCase() === "suspended") return null;
    seen.add(username);
    normalized.push({
      username,
      displayName: String(user?.displayName || username).slice(0, 200),
      role: String(user?.role || "").slice(0, 100),
      status: String(user?.status || "Active").slice(0, 40),
    });
  }
  return normalized;
}
export function issueSparksAdminReadGrant(users, actorUsername, sessionId, now = Date.now()) {
  const key = secret();
  const roster = cleanUsers(users);
  if (!key || !roster || !actorUsername || !sessionId) return "";
  const payload = Buffer.from(JSON.stringify({
    purpose: PURPOSE,
    actor: String(actorUsername).trim().toLowerCase(),
    sessionId: String(sessionId),
    expiresAt: now + TTL_MS,
    users: roster,
  })).toString("base64url");
  const signature = createHmac("sha256", key).update(PURPOSE + "." + payload).digest("base64url");
  const token = payload + "." + signature;
  return token.length <= MAX_TOKEN_LENGTH ? token : "";
}
export function verifySparksAdminReadGrant(token, actorUsername, sessionId, now = Date.now()) {
  const key = secret();
  if (!key || typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = createHmac("sha256", key).update(PURPOSE + "." + parts[0]).digest();
  let received;
  try { received = Buffer.from(parts[1], "base64url"); } catch { return null; }
  if (received.length !== expected.length || !timingSafeEqual(expected, received)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (payload.purpose !== PURPOSE ||
        payload.actor !== String(actorUsername || "").trim().toLowerCase() ||
        payload.sessionId !== String(sessionId || "") ||
        !Number.isSafeInteger(payload.expiresAt) ||
        now >= payload.expiresAt ||
        payload.expiresAt > now + TTL_MS) return null;
    const users = cleanUsers(payload.users);
    return users ? { users, expiresAt: payload.expiresAt } : null;
  } catch { return null; }
}
