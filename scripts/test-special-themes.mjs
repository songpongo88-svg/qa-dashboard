import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import * as model from '../src/specialThemes/model.mjs';

const { activeInterval, mergeUsage, mergeSpecialThemeUsage, hasSpecialThemeAccess, isSpecialQuestOpen, usageMs, SPECIAL_QUEST_DEADLINE_MS: deadline, SPECIAL_UNLOCK_MS: target, SPECIAL_IDLE_MS, SPECIAL_THEMES } = model;
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

assert.equal(deadline, Date.parse('2026-12-31T16:59:59.999Z'), 'deadline is the end of December 31 in Bangkok, independently of host timezone');
assert.equal(isSpecialQuestOpen(deadline), true);
assert.equal(isSpecialQuestOpen(deadline + 1), false);
assert.equal(activeInterval({ start: deadline - 3000, end: deadline + 2000, lastInteraction: deadline - 3000, visible: true, focused: true }), 3000, 'a tick crossing midnight credits only the part before the deadline');
assert.equal(activeInterval({ start: deadline + 1, end: deadline + 5001, lastInteraction: deadline + 1, visible: true, focused: true }), 0);
assert.equal(hasSpecialThemeAccess({ specialThemeUsageMs: target, specialThemeUnlockedAt: { seconds: Math.floor(deadline / 1000), nanoseconds: 0 } }, deadline + 86400000), true, 'existing Firestore timestamp entitlements remain valid');
assert.equal(hasSpecialThemeAccess({ specialThemeUsageMs: target, specialThemeUnlockedAt: new Date(deadline + 1).toISOString(), specialThemeUsageUpdatedAt: new Date(deadline + 1).toISOString() }, deadline + 86400000), false, 'late legacy counter completion cannot unlock');
assert.equal(hasSpecialThemeAccess({ specialThemeUsageMs: target }, deadline + 1), false, 'an unproven legacy total cannot create access after closing');
const earned = mergeSpecialThemeUsage({ specialThemeUsageMs: target - 10000, specialThemeUsageUpdatedAt: new Date(deadline - 20000).toISOString() }, 'offline-device', 10000, deadline - 1, deadline + 86400000);
assert.equal(earned.total, target, 'eligible offline usage can finish syncing after the deadline');
assert.equal(earned.qualifiedAt, deadline - 1);
assert.equal(mergeSpecialThemeUsage({}, 'late-device', target, deadline + 1, deadline + 86400000), null, 'a late batch is rejected');
const frozen = { specialThemeQuest2026: { version: 1, activeMs: target - 60000, sources: {}, creditedThrough: new Date(deadline - 1).toISOString(), qualifiedAt: null }, specialThemeUsageMs: target, specialThemeUnlockedAt: new Date(deadline + 1000).toISOString() };
assert.equal(hasSpecialThemeAccess(frozen, deadline + 86400000), false, 'post-deadline writes to the old unrestricted counter cannot alter frozen campaign eligibility');
assert.equal(model.specialUsageSnapshot(frozen, deadline + 86400000).total, target - 60000);
assert.equal(hasSpecialThemeAccess({ ...frozen, specialThemeUsageUpdatedAt: new Date(deadline - 1).toISOString(), specialThemeUnlockedAt: new Date(deadline - 1).toISOString() }, deadline + 86400000), true, 'valid completion on a device using the earlier app is preserved');
console.log('PASS: Bangkok deadline, crossing-midnight clamp, durable prior eligibility, legacy late-completion denial and eligible offline batches');

const dom = new JSDOM('<!doctype html><html><body><div id="test"></div></body></html>', { url: 'https://test.invalid/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'localStorage', 'MutationObserver', 'CustomEvent', 'Event', 'HTMLElement']) globalThis[key] = dom.window[key];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let hidden = false, focused = true;
Object.defineProperty(document, 'hidden', { get: () => hidden });
document.hasFocus = () => focused;
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
const initialNow = Date.parse('2026-10-16T10:00:00+07:00');
let now = initialNow;
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
let rejectWrites = false, rejectReads = false;
const firestore = {
  doc: (_db, _collection, account) => account,
  getDoc: async ref => { if (rejectReads) throw new Error('offline read'); return { data: () => accounts.get(ref) || {} }; },
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
now = deadline - 10000;
accounts.set('deadline-partial', { specialThemeUsageMs: target - 15000, specialThemeUsageUpdatedAt: new Date(now - 60000).toISOString() });
await render('deadline-partial');
await step(); await step(10000);
assert.equal(latest.activeMs, target - 5000, 'the five seconds after closing are not credited');
assert.equal(latest.unlocked, false); assert.equal(latest.expired, true);
assert.equal(document.querySelectorAll('[data-qa-special-apply]:disabled').length, 3);
assert.equal(document.querySelector('[data-qa-special-quest-state]').dataset.qaSpecialQuestState, 'expired');
assert.ok(document.body.textContent.includes('หมดเวลาปลดล็อก'));
assert.ok(document.querySelector('time').textContent.includes('31 ธันวาคม 2026'));
await step(60000);
assert.equal(latest.activeMs, target - 5000, 'incomplete usage is frozen after the quest ends');
await click('[data-qa-custom-theme-card="special-preview"]');
assert.ok(document.querySelector('.qa-special-preview-dialog').open, 'expired users can still preview');
await click('[aria-label="ปิดภาพตัวอย่าง"]');
await render(undefined); await render('deadline-partial');
assert.equal(latest.activeMs, target - 5000); assert.equal(latest.expired, true, 'refresh cannot reopen the quest');
console.log('PASS: actual tracker stops at midnight, freezes incomplete progress across reload and keeps previews available');

await render(undefined);
now = deadline - 10000;
accounts.set('deadline-exact', { specialThemeUsageMs: target - 10000, specialThemeUsageUpdatedAt: new Date(now - 60000).toISOString() });
await render('deadline-exact'); await step(); await step();
await act(async () => window.dispatchEvent(new Event('online')));
assert.equal(latest.unlocked, true, 'finishing at the final eligible millisecond qualifies');
assert.equal(accounts.get('deadline-exact').specialThemeQuest2026.qualifiedAt, new Date(deadline).toISOString());
await step(1, false);
assert.equal(latest.unlocked, true); assert.equal(latest.expired, false);
await render(undefined); await render('deadline-exact');
assert.equal(latest.unlocked, true, 'earned access survives a fresh session after the deadline');
assert.equal(document.querySelectorAll('[data-qa-special-apply]:disabled').length, 0);
assert.ok(document.body.textContent.includes('ใช้ธีมต่อได้หลังหมดเขต'));
console.log('PASS: final-millisecond completion, persisted qualification, permanent access and all three usable themes after closing');

await render(undefined);
now = deadline + 1000;
const writesBeforeLate = writes.length;
await render('late-new-account'); await step();
assert.equal(latest.activeMs, 0); assert.equal(latest.expired, true); assert.equal(writes.length, writesBeforeLate);
accounts.set('late-old-client', { specialThemeUsageMs: target, specialThemeUsageUpdatedAt: new Date(now).toISOString(), specialThemeUnlockedAt: new Date(now).toISOString() });
localStorage.setItem('qa-dashboard:special-usage-v1:late-old-client', JSON.stringify({ contribution: target, serverSource: 0, serverTotal: target, lastCreditedAt: now }));
await render('late-old-client'); await step();
assert.equal(latest.unlocked, false); assert.equal(latest.expired, true); assert.equal(latest.activeMs, 0);
assert.equal(writes.filter(row => row.ref === 'late-old-client').length, 0, 'late old-client storage is not migrated into earned campaign access');
console.log('PASS: fresh users and old clients completing after the deadline cannot unlock through counters, reload or local queues');

await render(undefined);
now = deadline - 30000;
accounts.set('deadline-offline', { specialThemeUsageMs: target - 20000, specialThemeUsageUpdatedAt: new Date(now - 60000).toISOString() });
await render('deadline-offline'); rejectWrites = true;
for (let i = 0; i < 4; i++) await step();
assert.equal(latest.activeMs, target); assert.equal(latest.unlocked, false); assert.equal(latest.syncPending, true);
await step(20000, false);
assert.equal(latest.expired, false, 'a completed eligible offline batch waits for confirmation rather than losing its right at midnight');
rejectWrites = false;
await act(async () => window.dispatchEvent(new Event('online')));
assert.equal(latest.unlocked, true);
assert.equal(accounts.get('deadline-offline').specialThemeQuest2026.qualifiedAt, new Date(deadline - 10000).toISOString());
const savedOffline = accounts.get('deadline-offline').specialThemeQuest2026;
await act(async () => window.dispatchEvent(new Event('online')));
assert.deepEqual(accounts.get('deadline-offline').specialThemeQuest2026, savedOffline, 'late retry cannot add time or duplicate qualification');
await render(undefined); await render('deadline-offline'); assert.equal(latest.unlocked, true);
accounts.set('legacy-earned', { specialThemeUsageMs: target, specialThemeUnlockedAt: { seconds: Math.floor((deadline - 86400000) / 1000), nanoseconds: 0 } });
await render('legacy-earned'); assert.equal(latest.unlocked, true);
assert.ok(accounts.get('legacy-earned').specialThemeQuest2026.qualifiedAt, 'existing earned profiles migrate without choosing or reclaiming a theme');
console.log('PASS: offline completion before closing syncs afterward exactly once, and existing earned users keep their rights without selecting a theme first');

await render(undefined); rejectReads = true;
accounts.set('earned-read-retry', { specialThemeUsageMs: target, specialThemeUnlockedAt: new Date(deadline - 60000).toISOString() });
await render('earned-read-retry');
assert.equal(latest.ready, false, 'an unavailable profile must not be reported as an expired or confirmed account');
assert.equal(document.querySelector('[data-qa-special-quest-state]').dataset.qaSpecialQuestState, 'loading');
rejectReads = false;
await act(async () => window.dispatchEvent(new Event('online')));
assert.equal(latest.ready, true); assert.equal(latest.unlocked, true, 'reconnection retries the profile check and restores earned rights');
console.log('PASS: failed account check remains unconfirmed and reconnecting restores prior access without a refresh');

await render(undefined);
now = initialNow;
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
