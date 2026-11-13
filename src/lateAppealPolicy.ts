// Late Appeal is the first appeal submitted after the normal monthly deadline.
// It is separate from the Additional Appeal review workflow, which also uses 72h.
export const LATE_APPEAL_WINDOW_MS = 72 * 60 * 60 * 1000;

export function lateAppealExpiresAt(addedAt: string): string {
  const grantedAt = Date.parse(String(addedAt || ""));
  return Number.isFinite(grantedAt) ? new Date(grantedAt + LATE_APPEAL_WINDOW_MS).toISOString() : "";
}

export function isLateAppealOpen(expiresAt: string, asOf = Date.now()): boolean {
  const deadline = Date.parse(String(expiresAt || ""));
  return Number.isFinite(deadline) && Number.isFinite(asOf) && asOf < deadline;
}

export function lateAppealTimeRemaining(expiresAt: string, asOf = Date.now()): string {
  if (!isLateAppealOpen(expiresAt, asOf)) return "สิทธิ์หมดอายุ";
  const remaining = Math.max(0, Math.ceil((Date.parse(expiresAt) - asOf) / 1000));
  const days = Math.floor(remaining / 86400);
  const h = Math.floor((remaining % 86400) / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  return [days ? days + " วัน" : "", [h,m,s].map(n => String(n).padStart(2,"0")).join(":")].filter(Boolean).join(" ");
}
