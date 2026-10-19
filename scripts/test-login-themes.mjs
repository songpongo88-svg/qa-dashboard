import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { CHARACTER_THEMES } from '../src/characterThemes/model.mjs';
import { SPECIAL_THEMES } from '../src/specialThemes/model.mjs';
import { FESTIVAL_THEMES } from '../src/festivalThemes/model.mjs';
import { WEEKDAY_IDS } from '../src/weekdayCollection.mjs';
import * as model from '../src/loginThemes/model.mjs';

const appearance = (themeId = 'robinhood', extra = {}) => ({ version: 1, themeId, preference: '', characterVersion: 1, ...extra });
for (const bad of [null, {}, { version: 2, themeId: 'ocean' }, appearance('url(javascript:alert(1))'), appearance('../private'), appearance('not-a-theme')]) assert.equal(model.normalizeLoginAppearance(bad), null);
const sanitized = model.normalizeLoginAppearance({ ...appearance('doraemon-blue', { characterVersion: 2 }), username: 'private', password: 'secret', role: 'QA', unlocked: true });
assert.deepEqual(Object.keys(sanitized).sort(), ['version', 'themeId', 'preference', 'characterVersion'].sort());
assert.equal(model.normalizeLoginAppearance(appearance('doraemon-blue', { characterVersion: '2' })).characterVersion, 1);
const brokenStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
assert.deepEqual(model.initialLoginAppearance(brokenStorage), model.defaultLoginAppearance());
assert.deepEqual(model.writeLoginAppearance(brokenStorage, sanitized), sanitized);
console.log('PASS malformed/unknown appearance is rejected; cache stores no account, password, permission or entitlement data; blocked storage has a safe fallback');

for (const [id] of model.COLOR_LOGIN_THEMES) assert.equal(model.resolveLoginTheme(appearance(id)).collection, 'color');
for (const theme of CHARACTER_THEMES) {
  const v1 = model.resolveLoginTheme(appearance(theme.id)), v2 = model.resolveLoginTheme(appearance(theme.id, { characterVersion: 2 }));
  assert.equal(v1.characterVersion, 1); assert.equal(v2.characterVersion, 2);
  assert.equal(v1.image, `/theme-${theme.id}.png`); assert.equal(v2.image, theme.art);
  for (const image of [v1.image, v2.image]) assert.ok(fs.statSync(resolve('public' + image)).size > 1000);
}
for (const theme of SPECIAL_THEMES) assert.equal(model.resolveLoginTheme(appearance(theme.id)).image, theme.image);
for (const theme of FESTIVAL_THEMES) {
  const changed = model.resolveLoginTheme(appearance('special-coastal'), { festivalId: theme.id });
  assert.equal(changed.id, theme.id); assert.equal(changed.image, theme.image);
  assert.equal(model.resolveLoginTheme(appearance(theme.id)).id, 'robinhood', 'a stale calendar preview cannot remain active');
}
for (const weatherScene of model.LOGIN_WEATHER_SCENES) {
  const changed = model.resolveLoginTheme(appearance('ocean', { preference: 'weather-auto' }), { weatherScene });
  assert.equal(changed.image, `/weather/${weatherScene}.webp`);
  assert.ok(fs.statSync(resolve('public' + changed.image)).size > 1000);
}
assert.equal(model.resolveLoginTheme(appearance('ocean', { preference: 'weather-auto' }), { weatherScene: '../../private' }).weatherScene, 'clear');
for (let index = 0; index < 7; index++) assert.equal(model.resolveLoginTheme(appearance('ocean', { preference: 'weekday-auto' }), { now: Date.parse(`2026-10-${19 + index}T05:00:00Z`) }).id, WEEKDAY_IDS[index]);
assert.equal(model.resolveLoginTheme(appearance('ocean', { preference: 'weekday-auto' }), { now: Date.parse('2026-10-19T16:59:59Z') }).id, 'weekday-monday');
assert.equal(model.resolveLoginTheme(appearance('ocean', { preference: 'weekday-auto' }), { now: Date.parse('2026-10-19T17:00:00Z') }).id, 'weekday-tuesday');
console.log('PASS 8 colors, 6 characters in both versions, 3 Special themes, 6 scheduled festivals, 14 weather scenes, and 7 weekdays at Bangkok midnight');

const dom = new JSDOM('<div id="root"></div>', { url: 'https://login.test/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'localStorage', 'MutationObserver', 'Event', 'CustomEvent']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const temp = await mkdtemp(resolve('node_modules/.cache/login-themes-'));
let root, latest;
try {
  await build({ entryPoints: ['src/loginThemes/appearance.ts'], outfile: resolve(temp, 'hook.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
  const { useLoginAppearance } = await import(pathToFileURL(resolve(temp, 'hook.mjs')).href);
  const setAppearance = value => localStorage.setItem(model.LOGIN_APPEARANCE_KEY, JSON.stringify(value));
  const props = { authenticated: false, ready: false, themeId: 'robinhood', preference: '', characterVersion: 1 };
  function Probe(options) { latest = useLoginAppearance(options); return React.createElement('div', { 'data-theme': latest.id }); }
  root = createRoot(document.getElementById('root'));
  const render = async extra => act(async () => { root.render(React.createElement(Probe, { ...props, ...extra })); await new Promise(r => setTimeout(r, 0)); });
  const event = async patch => act(async () => { Object.assign(document.documentElement.dataset, patch); window.dispatchEvent(new CustomEvent('qa-appearance-change')); await new Promise(r => setTimeout(r, 0)); });
  setAppearance(appearance('doraemon-blue', { characterVersion: 2 }));
  document.documentElement.dataset.qaCharacterVersion = '1'; document.documentElement.dataset.qaSpecialUnlocked = 'false';
  await render(); assert.equal(latest.id, 'doraemon-blue'); assert.equal(latest.characterVersion, 2);
  assert.equal(document.documentElement.dataset.qaCharacterVersion, '1', 'cosmetic login cache cannot upgrade the active account');
  const rememberedA = localStorage.getItem(model.LOGIN_APPEARANCE_KEY);
  await render({ authenticated: true, ready: false, themeId: 'pink' });
  assert.equal(localStorage.getItem(model.LOGIN_APPEARANCE_KEY), rememberedA, 'do not replace the last appearance with a temporary account default');
  await render({ authenticated: true, ready: true, themeId: 'kitty-pink', characterVersion: 1 });
  await render(); assert.equal(latest.id, 'kitty-pink'); assert.equal(latest.characterVersion, 1);
  await render({ authenticated: true, ready: true, themeId: 'special-misty' });
  await render(); assert.equal(latest.id, 'special-misty');
  assert.equal(document.documentElement.dataset.qaSpecialUnlocked, 'false', 'displaying the remembered art cannot grant Special access');
  await event({ qaFestivalOverride: 'festival-christmas' }); assert.equal(latest.id, 'festival-christmas');
  await event({ qaFestivalOverride: 'festival-new-year' }); assert.equal(latest.id, 'festival-new-year');
  await event({ qaFestivalOverride: '' }); assert.equal(latest.id, 'special-misty', 'calendar restores the remembered selected theme');
  await render({ authenticated: true, ready: true, themeId: 'ocean', preference: 'weather-auto' });
  await render(); await event({ qaWeatherState: 'weather-night', qaWeatherNight: 'weather-rain' }); assert.equal(latest.id, 'weather-night-rain');
  const cache = JSON.parse(localStorage.getItem(model.LOGIN_APPEARANCE_KEY));
  await event({ qaFestivalOverride: 'festival-halloween' }); assert.equal(latest.id, 'festival-halloween');
  assert.deepEqual(JSON.parse(localStorage.getItem(model.LOGIN_APPEARANCE_KEY)), cache, 'calendar never writes over the account preference');
  await event({ qaFestivalOverride: '' }); assert.equal(latest.id, 'weather-night-rain');
  setAppearance(appearance('graphite')); await act(async () => window.dispatchEvent(new Event('storage'))); assert.equal(latest.id, 'graphite');
  await act(async () => root.unmount()); root = createRoot(document.getElementById('root')); await render(); assert.equal(latest.id, 'graphite', 'appearance survives an actual remount');
  console.log('PASS initial/reload appearance, hydration gate, account V2→V1 isolation, logout, Special cosmetic-only cache, festival override/restore, live weather and cross-tab storage');
} finally { if (root) await act(async () => root.unmount()); dom.window.close(); await rm(temp, { recursive: true, force: true }); }
