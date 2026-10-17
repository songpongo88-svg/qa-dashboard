import { characterThemeFor } from './model.mjs';
const cues = {
  search: '<circle cx="13" cy="12" r="6"/><path d="m18 17 7 7"/>',
  export: '<path d="M16 5v15m-5-5 5 5 5-5M7 23v4h18v-4"/>',
  save: '<path d="m7 17 6 6L26 8"/>',
  refresh: '<path d="M25 12a10 10 0 1 0-1 12M25 5v7h-7"/>',
  reset: '<path d="M7 12a10 10 0 1 1 1 12M7 5v7h7"/>',
  compare: '<path d="M7 10h19m-5-5 5 5-5 5M25 23H6m5-5-5 5 5 5"/>',
  cases: '<path d="M9 4h11l5 6v18H7V4zm10 0v7h6M11 16h10m-10 5h7"/>',
  appeal: '<path d="M6 5h20v17H15l-7 5v-5H6zM11 10h10m-10 6h7"/>',
  coaching: '<circle cx="16" cy="10" r="5"/><path d="M6 28v-3c0-9 20-9 20 0v3M6 10a10 10 0 0 1 20 0M6 11v6h4v-6m12 0v6h4v-6"/>',
  users: '<circle cx="12" cy="10" r="4"/><path d="M3 27v-3c0-8 18-8 18 0v3m0-21c6 0 6 8 0 8m3 5c5 1 6 4 6 8"/>',
  clock: '<circle cx="16" cy="16" r="11"/><path d="M16 9v8l5 3"/>',
  signature: '<path d="m8 23-2 5 6-2L28 10l-5-5zM19 9l5 5M4 30h24"/>',
  grade: '<path d="m16 3 4 8 9 2-6 7 1 9-8-4-8 4 1-9-6-7 9-2z"/>',
  score: '<path d="M5 27V16h5v11m3 0V7h5v20m3 0V12h5v15"/>',
  add: '<path d="M16 5v22M5 16h22"/>',
  theme: '<path d="M5 6h22v20H5zM5 12h22m-14 0v14"/>',
};
const motifs = {
  bow: '<path d="M5 15C-1 3 12 3 16 11 20 3 33 3 27 15c6 12-7 12-11 4-4 8-17 8-11-4z"/><circle cx="16" cy="15" r="4"/>',
  bell: '<path d="M7 20V14a9 9 0 0 1 18 0v6l3 4H4zM12 27h8M13 3h6"/><circle cx="16" cy="15" r="2"/>',
  honey: '<path d="m16 2 12 7v14l-12 7-12-7V9z"/><path d="M9 12c3 5 2-3 5 1s3-3 7 0M10 18h12"/>',
  flower: '<path d="M16 11C5-3-3 13 10 16-3 21 8 35 16 22c8 13 19-1 6-6C35 13 27-3 16 11z"/><circle cx="16" cy="17" r="4"/>',
  leaf: '<path d="M28 4C9 0-3 17 9 27c10 9 22-4 19-23zM8 26l16-17m-13 9h8m-4-5v8"/>',
  moon: '<path d="M24 4A13 13 0 1 0 29 25C13 29 8 13 24 4z"/><path d="m27 8 1 4 4 1-4 1-1 4-1-4-4-1 4-1z"/>',
};
const cache = new Map();
export function characterIconUrl(id, kind = 'theme') {
  const theme = characterThemeFor(id); if (!theme) return '';
  const key = id + ':' + kind; if (cache.has(key)) return cache.get(key);
  const cue = cues[kind] || cues.cases;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><defs><linearGradient id="g" x2=".6" y2="1"><stop stop-color="#fff"/><stop offset="1" stop-color="${theme.line}"/></linearGradient><filter id="s"><feDropShadow dx="0" dy="1" stdDeviation=".8" flood-color="${theme.deep}" flood-opacity=".22"/></filter></defs><rect x="2" y="2" width="36" height="36" rx="11" fill="url(#g)" stroke="${theme.line}" filter="url(#s)"/><g transform="translate(4 4) scale(.79)" fill="none" stroke="${theme.deep}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${cue}</g><g transform="translate(26 1) scale(.4)" fill="${theme.line}" stroke="${theme.accent}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" filter="url(#s)">${motifs[theme.motif]}</g></svg>`;
  const url = 'data:image/svg+xml,' + encodeURIComponent(svg); cache.set(key, url); return url;
}
