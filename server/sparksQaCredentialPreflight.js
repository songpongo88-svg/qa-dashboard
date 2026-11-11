// Read-only preflight for the QA Sparks credential cutover.
// Never return, print, persist, or hash a password here; no Auth or wallet writes.
const userNamePattern = /^[a-z0-9._-]{2,64}$/;
const normalize = value => String(value ?? "").trim().toLowerCase();
const str = value => typeof value === "string" ? value.trim() : "";
const bangkokDate = date => new Intl.DateTimeFormat("en-CA",{
  timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit",
}).format(date);

export function auditQaCredentialSource(profiles, {
  now = new Date(), minActive = 21, expectedOwner = "songpon",
} = {}) {
  if (!Array.isArray(profiles) || profiles.length === 0 || profiles.length > 500)
    throw Error("SOURCE_INCOMPLETE");
  const today = bangkokDate(now);
  const nowMs = now.getTime();
  const usernames = new Set();
  const pending = [];
  const blocked = [];
  let active = 0;
  let suspended = 0;
  let ready = 0;
  let ownerFound = false;
  let ownerReady = false;
  for (const raw of profiles) {
    if (!raw || typeof raw !== "object") throw Error("INVALID_SOURCE_PROFILE");
    const username = normalize(raw.username);
    if (!userNamePattern.test(username) || usernames.has(username))
      throw Error("DUPLICATE_OR_INVALID_USERNAME");
    usernames.add(username);
    const status = normalize(raw.status);
    if (status === "suspended") { suspended++; continue; }
    if (status !== "active") {
      blocked.push({username, reason:"UNKNOWN_USER_STATUS"});
      continue;
    }
    active++;
    const role = str(raw.role);
    if (username === expectedOwner) {
      ownerFound = role === "Quality Assurance";
      if (!ownerFound) blocked.push({username,reason:"OWNER_ROLE_MISMATCH"});
    }
    const start = str(raw.suspendEffectiveDate), end = str(raw.suspendEndDate);
    const scheduledSuspension = Boolean(start && start <= today &&
      !(raw.suspendAutoReactivate === true && end && end <= today));
    if (scheduledSuspension) {
      blocked.push({username,reason:"SCHEDULED_SUSPENSION"});
      continue;
    }
    const rawPassword = raw.password;
    if (typeof rawPassword !== "string" || rawPassword.length === 0) {
      pending.push({username,reason:"QA_PASSWORD_NOT_SET"});
      continue;
    }
    if (rawPassword.length < 6 || rawPassword.length > 128) {
      blocked.push({username,reason:"PASSWORD_LENGTH_UNSUPPORTED"});
      continue;
    }
    const expiry = str(raw.passwordExpiresAt || raw.accessExpiresAt);
    if (expiry && (!Number.isFinite(Date.parse(expiry)) || Date.parse(expiry) <= nowMs)) {
      blocked.push({username,reason:"QA_PASSWORD_EXPIRED_OR_INVALID"});
      continue;
    }
    ready++;
    if (username === expectedOwner && ownerFound) ownerReady = true;
  }
  // A partial collection response or a missing owner is never considered eligible.
  if (active < minActive || !ownerFound || !ownerReady)
    throw Error("ACTIVE_ROSTER_OR_OWNER_INCOMPLETE");
  return {
    source:"fresh-firestore",
    checked:profiles.length,active,suspended,ready,
    pending:pending.sort((a,b)=>a.username.localeCompare(b.username)),
    blocked:blocked.sort((a,b)=>a.username.localeCompare(b.username)),
    canStartStagedMigration:blocked.length===0 && ready>0,
    // Intentionally no password material in the returned object.
  };
}
