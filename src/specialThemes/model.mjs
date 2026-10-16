export const SPECIAL_UNLOCK_MS = 180 * 60 * 1000;
export const SPECIAL_IDLE_MS = 5 * 60 * 1000;
export const SPECIAL_SAVE_MS = 5 * 60 * 1000;
export const SPECIAL_QUEST_DEADLINE = '2026-12-31T23:59:59.999+07:00';
export const SPECIAL_QUEST_DEADLINE_MS = Date.parse(SPECIAL_QUEST_DEADLINE);
export const isSpecialQuestOpen = (now = Date.now()) => Number.isFinite(now) && now <= SPECIAL_QUEST_DEADLINE_MS;
export const SPECIAL_THEMES = [
  { id: 'special-coastal', label: 'Coastal Serenity', thai: 'ทะเลชายหาด', image: '/special-themes/coastal.webp',
    swatches: ['#08758a', '#073c50', '#8ddde1'], description: 'กระจกสีทะเล · แสงสะท้อนน้ำ · โทนเทอร์ควอยซ์' },
  { id: 'special-volcanic', label: 'Volcanic Dusk', thai: 'ภูเขาไฟ', image: '/special-themes/volcanic.webp',
    swatches: ['#bf7048', '#171d24', '#efa16e'], description: 'หินภูเขาไฟ · ผิวดำด้าน · ขอบทองแดง' },
  { id: 'special-misty', label: 'Misty Highlands', thai: 'ทะเลหมอก', image: '/special-themes/misty.webp',
    swatches: ['#306960', '#173f3d', '#b9d4d5'], description: 'กระจกฝ้า · มิติแนวเขา · โทนเขียวสน' },
];
export const specialThemeFor = id => SPECIAL_THEMES.find(theme => theme.id === id) || null;
export const isSpecialTheme = id => Boolean(specialThemeFor(id));
export function usageMs(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(SPECIAL_UNLOCK_MS, Math.floor(number))) : 0;
}
// A long interval is a suspended device or a stalled page, not active usage.
export function activeInterval({ start, end, lastInteraction, visible, focused, maxInterval = 30000 }) {
  if (!visible || !focused || !Number.isFinite(start) || !Number.isFinite(end)
    || end <= start || end - start > maxInterval) return 0;
  return Math.max(0, Math.min(end, SPECIAL_QUEST_DEADLINE_MS, lastInteraction + SPECIAL_IDLE_MS) - start);
}

function timestampMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return Number(value.toMillis()) || 0;
  if (typeof value.seconds === 'number') return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}
export function isSpecialQuestCreditTime(value) {
  const ms = timestampMs(value);
  return ms > 0 && ms <= SPECIAL_QUEST_DEADLINE_MS;
}

// Freeze eligible campaign usage separately from legacy totals. An older client
// writing its unrestricted counter after the deadline cannot grant new access.
export function specialUsageSnapshot(profile, now = Date.now()) {
  const quest = profile?.specialThemeQuest2026;
  const legacyThrough = timestampMs(profile?.specialThemeUsageUpdatedAt);
  const legacyCompleted = timestampMs(profile?.specialThemeUnlockedAt);
  const legacyAccepted = isSpecialQuestOpen(now) || isSpecialQuestCreditTime(legacyThrough) || isSpecialQuestCreditTime(legacyCompleted);
  // Preserve valid progress from another device still running the earlier app.
  const current = quest?.version === 1 && !(legacyAccepted && usageMs(profile?.specialThemeUsageMs) > usageMs(quest.activeMs));
  const creditedThrough = timestampMs(current ? quest.creditedThrough : profile?.specialThemeUsageUpdatedAt);
  const completed = timestampMs(current ? quest.qualifiedAt : profile?.specialThemeUnlockedAt);
  const accepted = current || legacyAccepted;
  const total = accepted ? usageMs(current ? quest.activeMs : profile?.specialThemeUsageMs) : 0;
  const qualifiedAt = total >= SPECIAL_UNLOCK_MS
    ? [completed, creditedThrough, ...(isSpecialQuestOpen(now) ? [now] : [])].find(isSpecialQuestCreditTime) || 0
    : 0;
  return { total, sources: accepted ? (current ? quest.sources : profile?.specialThemeUsageSources) || {} : {},
    creditedThrough: isSpecialQuestCreditTime(creditedThrough) ? creditedThrough : 0, qualifiedAt };
}
export function hasSpecialThemeAccess(profile, now = Date.now()) {
  const snapshot = specialUsageSnapshot(profile, now);
  return snapshot.total >= SPECIAL_UNLOCK_MS && isSpecialQuestCreditTime(snapshot.qualifiedAt);
}
export function mergeSpecialThemeUsage(profile, sourceId, cumulativeMs, creditedThrough, now = Date.now()) {
  if (!isSpecialQuestCreditTime(creditedThrough)) return null;
  const previous = specialUsageSnapshot(profile, now);
  const next = mergeUsage({ specialThemeUsageMs: previous.total, specialThemeUsageSources: previous.sources }, sourceId, cumulativeMs);
  const through = Math.max(previous.creditedThrough, timestampMs(creditedThrough));
  return { ...next, creditedThrough: through,
    qualifiedAt: previous.qualifiedAt || (next.total >= SPECIAL_UNLOCK_MS ? through : 0) };
}
// Server source totals are cumulative, so retries and reloads cannot credit a batch twice.
export function mergeUsage(profile, sourceId, cumulativeMs) {
  const sources = profile?.specialThemeUsageSources || {};
  const previousSource = usageMs(sources[sourceId]);
  const nextSource = Math.max(previousSource, usageMs(cumulativeMs));
  const total = usageMs(usageMs(profile?.specialThemeUsageMs) + nextSource - previousSource);
  return { total, source: nextSource, sources: { ...sources, [sourceId]: nextSource } };
}
export function pendingUsage(ledger) {
  return Math.max(0, usageMs(ledger.contribution) - usageMs(ledger.serverSource));
}
export function displayedUsage(ledger) {
  return usageMs(usageMs(ledger.serverTotal) + pendingUsage(ledger));
}
