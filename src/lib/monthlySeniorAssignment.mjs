// The Senior assigned to Darunee's October 2026 evaluation is the named
// responsible Senior, not whoever is the current teamLead on a new User account.
// No previously captured signedBy or signature images are modified here.
const normal = (value) => String(value ?? "").replace(/\s+/g, "").toLowerCase();
export const isDaruneeOctober = (month, agent) =>
  month === "2026-10" && normal(agent) === "daruneeteparsa";
export function assignedMonthlySenior(month, agent, candidate) {
  return isDaruneeOctober(month, agent) ? "Suphitcha Keawliam" : candidate;
}
export function isAssignedSeniorSignature(doc, signed) {
  if (!isDaruneeOctober(doc?.monthKey, doc?.agentName)) return true;
  return Boolean(signed && normal(signed.signedBy) === normal("Suphitcha Keawliam"));
}
