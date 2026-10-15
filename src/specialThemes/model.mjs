export const SPECIAL_UNLOCK_MS = 180 * 60 * 1000;
export const SPECIAL_IDLE_MS = 5 * 60 * 1000;
export const SPECIAL_SAVE_MS = 5 * 60 * 1000;
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
  return Math.max(0, Math.min(end, lastInteraction + SPECIAL_IDLE_MS) - start);
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
