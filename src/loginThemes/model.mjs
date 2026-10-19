import { characterThemeFor } from '../characterThemes/model.mjs';
import { festivalThemeFor } from '../festivalThemes/model.mjs';
import { specialThemeFor } from '../specialThemes/model.mjs';
import { WEEKDAY_IDS, getBangkokWeekdayTheme, isWeekdayPreference } from '../weekdayCollection.mjs';

// This cache contains appearance only. It is never an account, entitlement or
// Character Collection upgrade source; authenticated profile checks stay in App.
export const LOGIN_APPEARANCE_KEY = 'qa-dashboard:login-appearance-v1';
export const COLOR_LOGIN_THEMES = [
  ['robinhood', '#7027a9', '#4c1d78', '#faf5ff'],
  ['pink', '#db2777', '#9d174d', '#fff2f7'],
  ['yellow', '#a16b00', '#854d0e', '#fffbeb'],
  ['lilac', '#7562bd', '#51449a', '#f5f3ff'],
  ['ocean', '#0877a6', '#155e75', '#effaff'],
  ['emerald', '#0f8a78', '#115e59', '#effdf7'],
  ['midnight', '#634bc0', '#22164f', '#f4f1ff'],
  ['graphite', '#3f4653', '#20242c', '#f4f5f7'],
];
export const WEEKDAY_LOGIN_PALETTES = [
  ['#9b6a00', '#66500e', '#fff9e8'], ['#bd2466', '#851d49', '#fff0f6'],
  ['#187749', '#155537', '#f2faec'], ['#a45708', '#713b12', '#fff6e7'],
  ['#087bab', '#155775', '#eef9ff'], ['#7941bb', '#4d227b', '#f2eaff'],
  ['#c32949', '#821f38', '#fff0f0'],
];
export const LOGIN_WEATHER_SCENES = new Set(['clear', 'hot', 'partly-cloudy', 'cloudy', 'light-rain', 'rain', 'thunderstorm', 'fog', 'sunshower', 'night', 'night-cloudy', 'night-rain', 'night-thunderstorm', 'night-fog']);
const validTheme = id => COLOR_LOGIN_THEMES.some(row => row[0] === id) || characterThemeFor(id) || specialThemeFor(id) || festivalThemeFor(id) || WEEKDAY_IDS.includes(id);

export function normalizeLoginAppearance(value) {
  if (!value || value.version !== 1 || typeof value.themeId !== 'string' || !validTheme(value.themeId)) return null;
  return {
    version: 1, themeId: value.themeId,
    preference: value.preference === 'weather-auto' ? 'weather-auto' : isWeekdayPreference(value.preference) ? 'weekday-auto' : '',
    characterVersion: value.characterVersion === 2 ? 2 : 1,
  };
}
export function readLoginAppearance(storage) {
  try { return normalizeLoginAppearance(JSON.parse(storage.getItem(LOGIN_APPEARANCE_KEY) || 'null')); }
  catch { return null; }
}
export function initialLoginAppearance(storage) {
  const remembered = readLoginAppearance(storage);
  if (remembered) return remembered;
  // Legacy installations have no confirmed V2 appearance record yet.
  try {
    return normalizeLoginAppearance({ version: 1, themeId: storage.getItem('qa-dashboard:theme-v1') || 'robinhood', preference: storage.getItem('qa-dashboard:custom-theme-v1'), characterVersion: 1 }) || defaultLoginAppearance();
  } catch { return defaultLoginAppearance(); }
}
export const defaultLoginAppearance = () => ({ version: 1, themeId: 'robinhood', preference: '', characterVersion: 1 });
export function writeLoginAppearance(storage, appearance) {
  const safe = normalizeLoginAppearance(appearance);
  if (!safe) return null;
  try {
    const serialized = JSON.stringify(safe);
    if (storage.getItem(LOGIN_APPEARANCE_KEY) !== serialized) storage.setItem(LOGIN_APPEARANCE_KEY, serialized);
  } catch { /* The current page can still retain the appearance in memory. */ }
  return safe;
}

export function resolveLoginTheme(appearance, environment = {}) {
  const record = normalizeLoginAppearance(appearance) || defaultLoginAppearance();
  const festival = festivalThemeFor(environment.festivalId);
  if (festival) {
    const palettes = {
      'festival-new-year': ['#946617', '#16283d', '#fffaf0'],
      'festival-valentine': ['#c71347', '#871333', '#fff2f5'],
      'festival-songkran': ['#00768e', '#075361', '#effbff'],
      'festival-halloween': ['#ad460d', '#683817', '#fff7ec'],
      'festival-loy-krathong': ['#86601d', '#21455b', '#f0f9fd'],
      'festival-christmas': ['#13513b', '#12392d', '#f5f9ef'],
    };
    return skin(festival.id, 'festival', palettes[festival.id], { image: festival.image, label: festival.label });
  }
  if (record.preference === 'weather-auto') {
    const scene = LOGIN_WEATHER_SCENES.has(environment.weatherScene) ? environment.weatherScene : 'clear';
    const palette = scene.startsWith('night') ? ['#4161aa', '#152641', '#f1f5fc']
      : /rain|storm/.test(scene) ? ['#376789', '#23465b', '#f0f7fc']
      : /cloud|fog/.test(scene) ? ['#466e8a', '#344e63', '#f1f7fb']
      : ['#0877b8', '#155786', '#f4faff'];
    return skin('weather-' + scene, 'weather', palette, { image: `/weather/${scene}.webp`, weatherScene: scene });
  }
  const id = record.preference === 'weekday-auto' || WEEKDAY_IDS.includes(record.themeId) ? getBangkokWeekdayTheme(environment.now ? new Date(environment.now) : new Date()) : record.themeId;
  const weekday = WEEKDAY_IDS.indexOf(id);
  if (weekday >= 0) return skin(id, 'weekday', WEEKDAY_LOGIN_PALETTES[weekday], {
    image: '/login-themes/weekdays.webp', size: '400% 200%', position: `${(weekday % 4) * 100 / 3}% ${Math.floor(weekday / 4) * 100}%`, weekday,
  });
  const character = characterThemeFor(id);
  if (character) {
    return skin(id, 'character', [character.accent, character.deep, character.pale], {
      characterVersion: record.characterVersion, image: record.characterVersion === 2 ? character.art : `/theme-${id}.png`,
      size: record.characterVersion === 2 ? 'auto 70%' : 'cover', position: record.characterVersion === 2 ? 'center -25%' : 'center',
    });
  }
  const special = specialThemeFor(id);
  if (special) {
    const pale = { 'special-coastal': '#edfafa', 'special-volcanic': '#f1f8ff', 'special-misty': '#edf5f2' }[id];
    return skin(id, 'special', [special.swatches[0], special.swatches[1], pale], { image: special.image });
  }
  // A manually previewed/legacy Festival id cannot persist beyond its schedule.
  const color = COLOR_LOGIN_THEMES.find(row => row[0] === id) || COLOR_LOGIN_THEMES[0];
  return skin(color[0], 'color', color.slice(1), {});
}
function skin(id, collection, [accent, deep, pale], extra) {
  return { id, collection, accent, deep, pale, image: '', size: 'cover', position: '70% center', ...extra };
}
export function loginThemeStyle(theme) {
  return {
    '--login-accent': theme.accent, '--login-deep': theme.deep, '--login-pale': theme.pale,
    '--login-scene': theme.image ? `url("${theme.image}")` : 'none',
    '--login-scene-size': theme.size, '--login-scene-position': theme.position,
    fontFamily: "'QA Login Kanit', 'Kanit', sans-serif",
  };
}
