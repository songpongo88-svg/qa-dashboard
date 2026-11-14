// A visual-only percentage used by the Theme Collection picker.
// Authentication, account suspension and role permissions MUST NOT consume
// this cache; their existing authoritative checks are unchanged.
export const THEME_USAGE_READ_TTL_MS = 30 * 60_000;

export function isThemeUsageReadFresh(raw: string | null, now = Date.now()): boolean {
  if (!raw || !Number.isFinite(now)) return false;
  try {
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== "object" ||
      !saved.percent || typeof saved.percent !== "object" ||
      Array.isArray(saved.percent)) return false;
    const updatedAt = Date.parse(String(saved.updatedAt || ""));
    return Number.isFinite(updatedAt) && updatedAt <= now &&
      now - updatedAt < THEME_USAGE_READ_TTL_MS;
  } catch {
    return false;
  }
}
