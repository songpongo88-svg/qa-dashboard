import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import * as model from '../src/specialThemes/model.mjs';

const { activeInterval, mergeUsage, usageMs, SPECIAL_UNLOCK_MS: target, SPECIAL_IDLE_MS, SPECIAL_THEMES } = model;
assert.equal(usageMs(NaN), 0); assert.equal(usageMs(-1), 0); assert.equal(usageMs(Infinity), 0);
assert.equal(usageMs(target - 1), target - 1); assert.equal(usageMs(target), target);
const interval = { start: 1000, end: 6000, lastInteraction: 1000, visible: true, focused: true };
assert.equal(activeInterval(interval), 5000);
assert.equal(activeInterval({ ...interval, visible: false }), 0);
assert.equal(activeInterval({ ...interval, focused: false }), 0);
assert.equal(activeInterval({ ...interval, end: 900 }), 0);
assert.equal(activeInterval({ ...interval, end: 1000 + 3600000 }), 0);
assert.equal(activeInterval({ ...interval, start: SPECIAL_IDLE_MS, end: SPECIAL_IDLE_MS + 5000 }), 1000);
assert.equal(activeInterval({ ...interval, start: SPECIAL_IDLE_MS + 1001, end: SPECIAL_IDLE_MS + 6000 }), 0);
let merged = mergeUsage({}, 'browser-a', 60000);
assert.equal(merged.total, 60000);
const profile = { specialThemeUsageMs: merged.total, specialThemeUsageSources: merged.sources };
assert.equal(mergeUsage(profile, 'browser-a', 60000).total, 60000, 'same saved batch is idempotent');
assert.equal(mergeUsage(profile, 'browser-a', 30000).total, 60000, 'late retry cannot reduce or double usage');
assert.equal(mergeUsage(profile, 'browser-a', 90000).total, 90000);
assert.equal(mergeUsage(profile, 'browser-b', 90000).total, 150000, 'different devices add their own contribution');
assert.equal(mergeUsage({}, 'browser-a', target * 2).total, target);
console.log('PASS: exact 180-minute boundary, hidden/focus/idle/sleep exclusion, cumulative batch retry and device merge');

const dom = new JSDOM('<!doctype html><html><body><div id="test"></div></body></html>', { url: 'https://test.invalid/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'localStorage', 'MutationObserver', 'CustomEvent', 'Event', 'HTMLElement']) globalThis[key] = dom.window[key];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let hidden = false, focused = true;
Object.defineProperty(document, 'hidden', { get: () => hidden });
document.hasFocus = () => focused;
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
let now = 1800000000000;
const originalNow = Date.now; Date.now = () => now;
let timerId = 0;
const timers = new Map();
window.setInterval = callback => { timers.set(++timerId, callback); return timerId; };
window.clearInterval = id => timers.delete(id);
let lockHeld = false;
Object.defineProperty(navigator, 'locks', { value: { request: async (_name, _options, callback) => {
  if (lockHeld) return callback(null);
  lockHeld = true; try { return await callback({}); } finally { lockHeld = false; }
} } });
const accounts = new Map(), writes = [];
let rejectWrites = false;
const firestore = {
  doc: (_db, _collection, account) => account,
  getDoc: async ref => ({ data: () => accounts.get(ref) || {} }),
  serverTimestamp: () => 'SERVER_TIME',
  runTransaction: async (_db, callback) => {
    if (rejectWrites) throw new Error('offline');
    return callback({ get: async ref => ({ data: () => accounts.get(ref) || {} }),
      set: (ref, data) => { accounts.set(ref, { ...accounts.get(ref), ...data }); writes.push({ ref, data }); } });
  },
};
function load(file, dependencies) {
  const source = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const output = {};
  Function('require', 'exports', js)(name => {
    if (name.endsWith('.css')) return {};
    if (name in dependencies) return dependencies[name];
    throw new Error('Unexpected dependency ' + name);
  }, output);
  return output;
}
const usage = load('src/specialThemes/usage.ts', { react: React, 'firebase/firestore': firestore, '../firebaseClient': { firebaseDb: {} }, './model.mjs': model });
const ui = load('src/specialThemes/SpecialCollection.tsx', { react: React, './model.mjs': model });
let latest, selections = [];
function Probe({ username, copies = 1 }) {
  latest = usage.useSpecialThemeUsage(username);
  return React.createElement(ui.SpecialCollection, { usage: latest, selectedTheme: 'robinhood', onSelect: id => selections.push(id) });
}
const root = createRoot(document.getElementById('test'));
async function render(username) { await act(async () => root.render(React.createElement(Probe, { username }))); }
async function step(ms = 5000, interact = true) {
  await act(async () => {
    now += ms;
    if (interact) document.dispatchEvent(new Event('pointerdown'));
    for (const callback of [...timers.values()]) callback();
    await Promise.resolve();
  });
}
function click(selector) { return act(async () => document.querySelector(selector).click()); }
accounts.set('near-boundary', { specialThemeUsageMs: target - 20000 });
await render('near-boundary');
assert.equal(latest.unlocked, false);
assert.equal(document.querySelectorAll('[data-qa-special-apply]:disabled').length, 3);
document.documentElement.dataset.qaTheme = 'robinhood';
await click('[data-qa-custom-theme-card="special-preview"]');
assert.ok(document.querySelector('.qa-special-preview-dialog').open);
assert.equal(document.documentElement.dataset.qaTheme, 'robinhood', 'preview never changes the active theme');
await click('[aria-label="ปิดภาพตัวอย่าง"]');
assert.equal(document.querySelector('.qa-special-preview-dialog'), null);
await click('[data-qa-special-apply]'); assert.equal(selections.length, 0);
for (let i = 0; i < 3; i++) await step();
assert.equal(latest.unlocked, false, '179 minutes 55 seconds is still locked');
await step();
assert.equal(latest.unlocked, true, 'exactly 180 minutes unlocks after persistence');
assert.equal(accounts.get('near-boundary').specialThemeUsageMs, target);
assert.equal(document.querySelectorAll('[data-qa-special-apply]:disabled').length, 0);
await click('[data-qa-special-apply="special-volcanic"]'); assert.deepEqual(selections, ['special-volcanic']);
console.log('PASS: actual React picker, locked preview isolation, disabled apply, exact threshold persistence and enabled apply');

await render('fresh-account');
assert.equal(latest.unlocked, false); assert.equal(latest.activeMs, 0, 'switching accounts does not inherit an unlock');
await step();
focused = false;
await act(async () => window.dispatchEvent(new Event('blur')));
await step(10000, false);
hidden = true; focused = true;
await step(10000, false);
hidden = false;
await act(async () => window.dispatchEvent(new Event('focus')));
await step();
const key = 'qa-dashboard:special-usage-v1:fresh-account';
assert.equal(JSON.parse(localStorage.getItem(key)).contribution, 10000, 'hidden and unfocused time is not credited');
await step(3600000, false);
assert.equal(JSON.parse(localStorage.getItem(key)).contribution, 10000, 'suspended-hour gap is not credited');
await render(undefined); await render('fresh-account');
assert.equal(latest.activeMs, 10000, 'unfinished usage survives reload and session changes');
assert.equal(latest.unlocked, false);
console.log('PASS: account isolation, active-only browser tracking, suspended-device exclusion and reload persistence');

accounts.set('offline-account', { specialThemeUsageMs: target - 20000 });
rejectWrites = true; await render('offline-account');
for (let i = 0; i < 4; i++) await step();
assert.equal(latest.activeMs, target); assert.equal(latest.unlocked, false); assert.equal(latest.syncPending, true);
rejectWrites = false;
await act(async () => window.dispatchEvent(new Event('online')));
assert.equal(latest.unlocked, true);
const confirmed = accounts.get('offline-account').specialThemeUsageMs;
await act(async () => window.dispatchEvent(new Event('online')));
assert.equal(accounts.get('offline-account').specialThemeUsageMs, confirmed);
console.log('PASS: offline batch retained, server confirmation required, reconnection and retry do not double-credit');

await render(undefined);
let values = [];
function PairMember() { values.push(usage.useSpecialThemeUsage('two-tabs')); return null; }
await act(async () => root.render(React.createElement(React.Fragment, null, React.createElement(PairMember), React.createElement(PairMember))));
await step(5000, false); await step(5000, false);
assert.equal(JSON.parse(localStorage.getItem('qa-dashboard:special-usage-v1:two-tabs')).contribution, 10000, 'two trackers share one credited time interval');
await act(async () => root.unmount());
assert.equal(timers.size, 0, 'unmount removes tracking timers');
for (const theme of SPECIAL_THEMES) assert.ok(fs.existsSync(new URL('../public' + theme.image, import.meta.url)), theme.image);
Date.now = originalNow;
console.log('PASS: concurrent tab deduplication, listener/timer teardown and all three production scene assets');
