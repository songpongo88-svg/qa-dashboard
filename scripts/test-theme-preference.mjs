import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import * as model from '../src/specialThemes/model.mjs';
import * as weekday from '../src/weekdayCollection.mjs';

// Exercise the production hook and preference snapshot against delayed profile reads.
const source = fs.readFileSync(process.env.THEME_PREFERENCE_SOURCE || new URL('../src/App.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functionNames = ['readStoredQaTheme', 'themeCollectionFromProfile', 'getCurrentThemePreferenceSnapshot', 'persistUserThemePreference', 'useUserThemePreference'];
const constantNames = ['QA_THEME_STORAGE_KEY', 'QA_CUSTOM_THEME_STORAGE_KEY', 'QA_THEME_COLLECTION_IDS', 'QA_THEME_OPTIONS'];
const parts = ast.statements.filter(node => ts.isFunctionDeclaration(node) ? functionNames.includes(node.name?.text) : ts.isVariableStatement(node) && node.declarationList.declarations.some(d => constantNames.includes(d.name.getText()))).map(n => n.getText());
for (const name of functionNames) assert.ok(parts.some(p => p.includes(`function ${name}(`)), name);
const runtimeSource = fs.readFileSync(new URL('../src/seasonalThemeRuntime2.ts', import.meta.url), 'utf8');
const runtimeAst = ts.createSourceFile('runtime.ts', runtimeSource, ts.ScriptTarget.Latest, true);
const runtimeFunctions = ['getCustomPreference', 'getPreferredTheme', 'applyEffectiveTheme'];
const runtimeParts = runtimeAst.statements.filter(n => ts.isFunctionDeclaration(n) && runtimeFunctions.includes(n.name?.text)).map(n => n.getText());
function evaluate(code, deps) {
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  return Function('exports', ...Object.keys(deps), js + '\nreturn exports;')(exports, ...Object.values(deps));
}
const dom = new JSDOM('<div id="root"></div>', { url: 'https://qa.test', pretendToBeVisual: true });
for (const key of ['window', 'document', 'MutationObserver', 'Event', 'CustomEvent', 'localStorage']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const profiles = new Map(), reads = [], writes = [];
let failWrite = false;
const db = {
  doc: (_db, _collection, username) => username,
  getDoc: username => new Promise((resolve, reject) => reads.push({ username, resolve: () => resolve({ data: () => profiles.get(username) }), reject })),
  setDoc: async (username, data) => {
    if (failWrite) { failWrite = false; throw Error('offline write'); }
    writes.push({ username, ...data });
    profiles.set(username, { ...profiles.get(username), ...data });
  },
  serverTimestamp: () => 'server-time', firebaseDb: {},
};
const app = evaluate(parts.join('\n') + '\nexport { useUserThemePreference };', { ...React, ...model, ...db });
let root, latest, stopRuntime;
const usage = (unlocked = false, ready = true) => ({ ready, unlocked, activeMs: unlocked ? model.SPECIAL_UNLOCK_MS : 0 });
function Probe({ username, specialUsage }) { latest = app.useUserThemePreference(username, specialUsage); return null; }
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
async function render(username, specialUsage) { await act(async () => root.render(React.createElement(Probe, { username, specialUsage }))); await flush(); }
async function resolveRead(username) {
  const index = reads.findIndex(r => r.username === username); assert.ok(index >= 0, `pending read: ${username}`);
  await act(async () => reads.splice(index, 1)[0].resolve()); await flush();
}
async function start(theme = 'special-coastal') {
  if (root) await act(async () => root.unmount());
  stopRuntime?.(); reads.length = writes.length = 0; profiles.clear(); localStorage.clear();
  for (const name of Object.keys(document.documentElement.dataset)) delete document.documentElement.dataset[name];
  localStorage.setItem('qa-dashboard:theme-v1', theme);
  const runtime = evaluate(`const CUSTOM_THEME_STORAGE_KEY='qa-dashboard:custom-theme-v1', BASE_THEME_STORAGE_KEY='qa-dashboard:theme-v1'; let sessionCustomTheme, applyingTheme=false; ${runtimeParts.join('\n')} export { applyEffectiveTheme };`, {
    ...model, ...weekday, getActiveFestival: () => null, festivalThemeFor: () => null, requestThemePickerRefresh: () => {},
  });
  const onAppearance = event => { if (!event.detail?.applied) runtime.applyEffectiveTheme(); };
  const observer = new MutationObserver(() => runtime.applyEffectiveTheme());
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-qa-theme', 'data-qa-special-unlocked'] });
  window.addEventListener('qa-appearance-change', onAppearance);
  stopRuntime = () => { observer.disconnect(); window.removeEventListener('qa-appearance-change', onAppearance); };
  root = createRoot(document.getElementById('root'));
}
const earned = themeId => ({ themeId, themePreference: '', themeCollection: 'special', specialThemeQuest2026: { version: 1, activeMs: model.SPECIAL_UNLOCK_MS, qualifiedAt: '2026-10-15T03:00:00Z', sources: {} } });
const currentTheme = () => document.documentElement.dataset.qaTheme;
const emit = () => act(async () => window.dispatchEvent(new CustomEvent('qa-appearance-change', { detail: { applied: true } })));
const originalWarn = console.warn;
console.warn = (...args) => { if (!/User theme preference/.test(args[0])) originalWarn(...args); };
try {
  for (const { id } of model.SPECIAL_THEMES) {
    for (const profileFirst of [true, false]) {
      await start(id); profiles.set('earned', earned(id));
      await render('earned', usage(false, false)); await emit(); await flush();
      assert.equal(localStorage.getItem('qa-dashboard:theme-v1'), id, 'boot fallback must not destroy the saved preference');
      assert.deepEqual(writes, [], 'no save before profile restoration');
      if (profileFirst) {
        await resolveRead('earned'); await emit(); await flush();
        assert.deepEqual(writes, [], 'no save of the fallback while entitlement is pending');
        await render('earned', usage(true));
      } else {
        await render('earned', usage(true)); await emit(); await flush();
        assert.deepEqual(writes, [], 'confirmed access alone must not replace an unread profile');
        await resolveRead('earned');
      }
      assert.equal(latest[0], id); assert.equal(currentTheme(), id);
      assert.equal(document.documentElement.dataset.qaSpecialTheme, id);
      assert.equal(localStorage.getItem('qa-dashboard:theme-v1'), id);
      assert.equal(profiles.get('earned').themeId, id);
      assert.ok(writes.every(w => w.themeId === id), 'transient defaults never reach the account');
      await act(async () => root.unmount()); root = undefined;
      root = createRoot(document.getElementById('root'));
      await render('earned', usage(false, false)); await resolveRead('earned'); await render('earned', usage(true));
      assert.equal(currentTheme(), id, 'the saved theme survives another refresh');
    }
  }
  console.log('PASS all three Special themes survive repeated refresh with both profile/entitlement load orders');

  await start(); profiles.set('slow', earned('special-coastal'));
  await render('slow', usage(true));
  await act(async () => latest[1]('special-volcanic')); await flush();
  await resolveRead('slow');
  assert.equal(currentTheme(), 'special-volcanic'); assert.equal(profiles.get('slow').themeId, 'special-volcanic');
  await act(async () => latest[1]('pink')); await flush();
  assert.equal(profiles.get('slow').themeId, 'pink');
  console.log('PASS a user choice during a slow profile read wins and later color selections persist');

  await start(); profiles.set('old-account', earned('special-misty'));
  await render('old-account', usage(false, false)); await render('new-account', usage(false));
  await resolveRead('old-account'); await resolveRead('new-account');
  assert.equal(currentTheme(), 'robinhood'); assert.equal(document.documentElement.dataset.qaSpecialTheme, undefined);
  assert.ok(writes.every(w => w.username === 'new-account' && w.themeId === 'robinhood'));
  await act(async () => latest[1]('special-misty')); await flush(); assert.equal(currentTheme(), 'robinhood');
  console.log('PASS account switches discard stale restores and locked users cannot inherit or select Special');

  await start(); profiles.set('offline', earned('special-misty'));
  await render('offline', usage(true));
  await act(async () => reads.shift().reject(Error('offline read'))); await emit(); await flush();
  assert.deepEqual(writes, []); assert.equal(profiles.get('offline').themeId, 'special-misty');
  await act(async () => window.dispatchEvent(new Event('online'))); await resolveRead('offline');
  assert.equal(currentTheme(), 'special-misty');
  failWrite = true; await act(async () => latest[1]('ocean')); await flush();
  assert.equal(profiles.get('offline').themeId, 'special-misty');
  await act(async () => window.dispatchEvent(new Event('online'))); await flush();
  assert.equal(profiles.get('offline').themeId, 'ocean');
  const count = writes.length; await emit(); await emit(); await flush(); assert.equal(writes.length, count);
  console.log('PASS failed reads preserve preference; reconnect restores/retries writes and repeated runtime events deduplicate');

  for (const preference of ['weather-auto', 'weekday-auto']) {
    await start('ocean'); profiles.set('auto', { themeId: 'ocean', themePreference: preference, themeCollection: preference.split('-')[0] });
    await render('auto', usage(false)); await resolveRead('auto');
    assert.equal(localStorage.getItem('qa-dashboard:custom-theme-v1'), preference);
    await act(async () => latest[1]('ocean')); await flush();
    assert.equal(localStorage.getItem('qa-dashboard:custom-theme-v1'), null);
    assert.equal(profiles.get('auto').themePreference, '', 'selecting the same base theme exits an automatic collection');
  }
  console.log('PASS weather/weekday choices restore, and selecting the same base theme clears the automatic choice');
} finally {
  console.warn = originalWarn;
  if (root) await act(async () => root.unmount());
  stopRuntime?.(); dom.window.close();
}
