import { festivalThemeFor } from './model.mjs';

// Native, scalable artwork. These paths are owned application assets, never
// user-supplied SVG. Functional cues stay separate from the festival motif.
const drawings = {
  'water-gun': '<path fill="#12bfe5" d="M4 8h18v9H10l-3 10H2l3-12H2V9z"/><path fill="#ffd64f" d="M21 9h7v6h-7M6 5h12v4H6zM2 12h6v5H2z"/><path d="M11 17v3h6v-3M27 11h3"/>',
  'splash-person': '<circle fill="#ffc780" cx="9" cy="5" r="3"/><path fill="#0a9cb7" d="m6 10 6-1 6 5-2 3-6-3-1 6H4z"/><path d="m5 20-3 8m7-8 5 7m-3-15 7-3"/><path fill="#4ed9f0" d="m18 8 6 2-3 8-6-2z"/><path stroke="#08aaca" d="m25 6 3-3m-3 10h5m-5 4 3 3"/>',
  bucket: '<path fill="#31c7e9" d="m4 10 3 18h16l3-18z"/><ellipse fill="#a1efff" cx="15" cy="10" rx="11" ry="4"/><path d="M5 9V7a10 10 0 0 1 20 0v2M11 16v7"/>',
  droplets: '<path fill="#29c8ec" d="M12 2C9 7 5 10 5 14a7 7 0 0 0 14 0c0-4-4-8-7-12zM24 13c-2 4-5 6-5 10a5 5 0 0 0 10 0c0-4-3-6-5-10z"/><path stroke="#e8ffff" d="M9 13v3m13 6v2"/>',
  ripple: '<ellipse stroke="#0798c3" fill="#c5f4ff" cx="15" cy="23" rx="13" ry="5"/><ellipse stroke="#0798c3" fill="none" cx="15" cy="23" rx="7" ry="2.5"/><path fill="#27c4e4" d="M15 3c-3 5-5 7-5 10a5 5 0 0 0 10 0c0-3-2-5-5-10z"/>',
  heart: '<path fill="#f4577d" d="M16 28C10 23 2 17 2 10 2 1 12 0 16 7 20 0 30 1 30 10c0 7-8 13-14 18z"/><path stroke="#ffcad7" d="M6 9c0-3 3-4 5-3"/>',
  'linked-hearts': '<path fill="#ffc9da" d="M11 25C6 21 1 17 1 11c0-7 7-8 11-3 3-5 10-4 10 3 0 6-5 10-11 14z"/><path fill="#f66b91" fill-opacity=".65" d="M21 28c-5-4-10-8-10-14 0-7 7-8 10-3 4-5 10-4 10 3 0 6-5 10-10 14z"/>',
  letter: '<rect fill="#fff1f5" x="2" y="7" width="28" height="22" rx="3"/><path stroke="#df3767" d="m3 9 13 10L29 9M3 28l9-10m8 0 9 10"/><path fill="#ee4778" d="m16 22-5-5c-3-4 2-7 5-3 3-4 8-1 5 3z"/>',
  rose: '<path stroke="#25754a" d="M17 18v12m0-5c-7 0-9-4-10-6 6 0 9 1 10 6m0 2c7-1 9-5 10-7-6 0-9 2-10 7"/><path fill="#e83563" d="M7 10c-3-6 5-11 9-7 6-5 13 1 10 6 5 6-5 14-11 11C7 22 3 15 7 10z"/><path fill="none" stroke="#a50d3f" d="M8 10c3-6 12-6 16-1-3 6-9 9-14 5m5-7c-4 3-2 7 2 7"/>',
  gift: '<rect fill="#e8455c" x="4" y="13" width="24" height="16" rx="2"/><rect fill="#f66875" x="2" y="9" width="28" height="6" rx="1"/><path fill="#f4d26b" stroke="none" d="M13 9h6v20h-6z"/><path fill="#eb455c" d="M16 9C3 11 3-2 10 3l6 6c13 2 13-11 6-6z"/><path stroke="#f4d26b" d="M16 10v19"/>',
  'santa-hat': '<path fill="#d93042" d="M4 23C8 7 12 0 21 4l7 6-3 5-7-6 3 14z"/><rect fill="#fff9eb" x="2" y="21" width="23" height="8" rx="4"/><circle fill="#fff9eb" cx="27" cy="12" r="4"/>',
  sleigh: '<path fill="#c82735" d="M3 11h7l5 11h9l4-8v12H10L5 15H3z"/><path fill="none" stroke="#e7b651" stroke-width="2.3" d="M5 29h21c4 0 5-4 2-5M12 26v3m10-3v3"/><path stroke="#f3c865" d="M3 11h7l5 11h9"/>',
  reindeer: '<path fill="#c18a48" d="M4 15h14l3-7 6 1 2 5-5 2-2 7H8z"/><path stroke="#8f5b2f" d="M8 22 6 30m6-8 1 8m7-8 4 8m0-20-2-6m4 5 3-6m-6 2-4-2m9 2 3-2"/><circle fill="#3f3020" stroke="none" cx="27" cy="11" r="1"/><path stroke="#a72434" stroke-width="3" d="m20 13 5 3"/>',
  wreath: '<circle fill="none" stroke="#217149" stroke-width="7" cx="16" cy="17" r="11"/><path fill="#cc3146" d="m16 7-8-5-2 6 9 2 9-2-2-6z"/><circle fill="#e74957" stroke="none" cx="6" cy="18" r="2"/><circle fill="#e74957" stroke="none" cx="24" cy="24" r="2"/><circle fill="#f4cb65" stroke="none" cx="26" cy="13" r="2"/>',
  firework: '<g fill="none" stroke="#e9bc60"><path d="M16 2v8m0 12v8M2 16h8m12 0h8M6 6l6 6m8 8 6 6M6 26l6-6m8-8 6-6M10 2l3 8m6 12 3 8M2 10l8 3m12 6 8 3M2 22l8-3m12-6 8-3M10 30l3-8m6-12 3-8"/><circle cx="16" cy="16" r="2"/></g>',
  clock: '<circle fill="#fae4a7" stroke="#c79539" cx="16" cy="17" r="12"/><path stroke="#183449" d="M16 9v9l5 3M14 2h5m-3 0v3"/>',
  confetti: '<path fill="#e4b553" d="m7 19 7 7-11 4z"/><path stroke="#e7bc62" d="m13 18 4-6m0 9 7-3m-8-5-2-5m9 7 5-5"/><path stroke="#6fa6ca" d="m7 12-3-3m18 16 3 3M21 3l2 4"/><path fill="#eac46e" d="m9 2 1 3 3 1-3 1-1 3-1-3-3-1 3-1zM27 18l1 3 3 1-3 1-1 3-1-3-3-1 3-1z"/>',
  star: '<path fill="#edc56d" d="m16 2 4 10 11 1-8 7 2 11-9-6-9 6 2-11-8-7 11-1z"/><path fill="#ffeac0" stroke="none" d="m16 2 1 16-5-6z"/>',
  horn: '<path fill="#efc363" d="m15 11 7 7-20 12z"/><path fill="none" stroke="#e8bf6b" d="M19 10c-5-5 7-3 5-9M24 16c5-7 5 0 7-4M12 7 9 3"/>',
  pumpkin: '<path fill="#448b48" d="M14 8V3l5-2 1 3-4 2v3z"/><ellipse fill="#f68b29" cx="16" cy="19" rx="14" ry="12"/><ellipse fill="#ffab40" cx="16" cy="19" rx="7" ry="12"/><path fill="#543124" stroke="none" d="m8 16 5-4 1 5zm10 1 1-5 5 4zM7 21l5 2 4-2 4 2 5-2-4 6H11z"/>',
  bat: '<path fill="#4c4243" d="m16 11 3-7 2 7c4-1 7-5 9-8l1 18c-5-5-10-4-12 4h-6C10 17 6 16 1 21L3 3c3 5 6 8 10 8l2-7z"/>',
  candle: '<path fill="#f3d69d" d="M9 12h14v18H9z"/><path fill="#fff3d6" d="M9 12c3 4 3-3 6 1s3-3 8-1v6c-3-3-2 6-5 3s-2-6-5-3-2-2-4 0z"/><path fill="#ffa331" d="M16 1c-1 5-5 6-5 10a5 5 0 0 0 10 0c0-4-4-7-5-10z"/><path stroke="#9c652f" d="M16 13v3"/>',
  'witch-hat': '<path fill="#493f43" d="m9 24 9-23 10 5-8 2 3 16z"/><path fill="#a95622" d="m10 19 12 1 1 5-15-1z"/><ellipse fill="#493f43" cx="16" cy="27" rx="15" ry="4"/><rect fill="#efb44a" x="15" y="19" width="5" height="5" rx="1"/>',
  ghost: '<path fill="#fff9ee" d="M4 30V14C4-2 28-2 28 14v16l-5-4-5 4-5-4-5 4z"/><ellipse fill="#4c4244" stroke="none" cx="12" cy="12" rx="2" ry="3"/><ellipse fill="#4c4244" stroke="none" cx="21" cy="12" rx="2" ry="3"/>',
  krathong: '<path fill="#4b9849" d="M2 20 7 8l6 12 4-14 6 14 6-12 2 13-5 9H7z"/><path fill="#276841" d="m2 20 8 10 3-10 4 10 6-10 3 10 5-9"/><path fill="#e778a4" d="m6 19 5-7 5 7 5-7 5 7-10 7z"/><path fill="#f1c96c" d="M14 11h4v10h-4z"/><path fill="#ff9e29" d="M16 1c-4 4-4 8 0 9 4-1 4-5 0-9z"/>',
  lotus: '<path fill="#ee91ba" d="M16 28C2 27 1 16 2 12l9 4L16 2l5 14 9-4c1 4 0 15-14 16z"/><path fill="#f8b7d3" d="M16 28C7 24 5 15 6 8l10 9L26 8c1 7-1 16-10 20z"/><path stroke="#659bad" d="M2 30h28"/>',
  moon: '<circle fill="#fae8ad" stroke="#cfb269" cx="16" cy="16" r="14"/><g fill="#e5ca84" stroke="none"><circle cx="11" cy="11" r="4"/><circle cx="21" cy="9" r="2"/><circle cx="20" cy="23" r="4"/></g>',
};
const meaning = { dashboard: 0, chart: 0, score: 0, add: 1, evaluate: 1, kpi: 1, target: 0, access: 0,
  queue: 2, document: 2, cases: 2, list: 2, appeal: 4, appealResult: 4, review: 3, chat: 1,
  coaching: 1, check: 3, presentation: 0, signature: 2, users: 3, clock: 4, grade: 4, theme: 0 };
const cache = new Map();
export const FESTIVAL_ACTIONS = ['search', 'reset', 'export', 'compare', 'refresh', 'save', 'add'];
export function festivalIconUrl(themeId, kind = 'dashboard') {
  const theme = festivalThemeFor(themeId);
  if (!theme) return '';
  const key = `${themeId}:${kind}`;
  if (cache.has(key)) return cache.get(key);
  const action = FESTIVAL_ACTIONS.includes(kind);
  const index = kind === 'search' ? 0 : ['reset', 'refresh'].includes(kind) ? 4 : kind === 'export' ? 2
    : kind === 'compare' ? 1 : kind === 'save' ? 2 : meaning[kind] ?? 3;
  const motif = theme.motifs[index];
  let drawing = drawings[motif];
  if (kind === 'reset' || kind === 'refresh') {
    drawing = theme.id === 'festival-songkran' || theme.id === 'festival-loy-krathong' ? drawings.ripple
      : theme.id === 'festival-new-year' ? drawings.clock : theme.id === 'festival-christmas' ? drawings.wreath
        : theme.id === 'festival-valentine' ? drawings.heart : drawings.candle;
  }
  const cues = {
    search: '<circle cx="23" cy="23" r="5"/><path d="m27 27 4 4"/>',
    reset: '<path d="M28 22a6 6 0 1 0 0 7m0-7v5h-5"/>',
    refresh: '<path d="M28 22a6 6 0 1 0 0 7m0-7v5h-5"/>',
    export: '<path d="M25 18v13m-5-5 5 5 5-5"/>',
    compare: '<path d="M18 21h13m-4-4 4 4-4 4M31 29H18m4-4-4 4 4 4"/>',
    save: '<path d="m19 26 4 4 8-10"/>',
    add: '<path d="M25 19v12m-6-6h12"/>',
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34" fill="none" stroke="#3b4149" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"><g${action ? ' transform="translate(0 0) scale(.82)"' : ''}>${drawing}</g>${action ? `<g fill="none" stroke="#fff" stroke-width="5">${cues[kind]}</g><g fill="none" stroke="#17485a" stroke-width="2.2">${cues[kind]}</g>` : ''}</svg>`;
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  cache.set(key, url);
  return url;
}
export function festivalIconVariables(id) {
  return Object.fromEntries(FESTIVAL_ACTIONS.map(action => [`--festival-icon-${action}`, `url("${festivalIconUrl(id, action)}")`]));
}
