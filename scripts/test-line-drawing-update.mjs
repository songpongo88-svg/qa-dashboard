import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { lineDrawingVersionFromProfile, LINE_DRAWING_THEME_ID } from '../src/lineDrawing/model.mjs';
import { normalizeLoginAppearance, resolveLoginTheme } from '../src/loginThemes/model.mjs';

for (const value of [undefined, null, 1, '2', true, 3, { version: 2 }]) {
  assert.equal(lineDrawingVersionFromProfile({ lineDrawingCollectionVersion: value }), 1);
}
assert.equal(lineDrawingVersionFromProfile({ lineDrawingCollectionVersion: 2 }), 2);
const skin = version => normalizeLoginAppearance({ version: 1, themeId: LINE_DRAWING_THEME_ID, lineDrawingAccount: 'Songpon', lineDrawingVersion: version });
assert.equal(resolveLoginTheme(skin(undefined)).image, '/line-drawing/scene.svg');
assert.equal(resolveLoginTheme(skin('2')).image, '/line-drawing/scene.svg');
assert.equal(resolveLoginTheme(skin(2)).image, '/line-drawing/colour-scene.svg');
assert.equal(resolveLoginTheme(skin(2), { loginUsername: 'another-user' }).collection, 'color');

const dom = new JSDOM('<div id="root"></div>', { url: 'https://qa.test', pretendToBeVisual: true });
for (const key of ['window', 'document', 'MutationObserver', 'Event', 'CustomEvent']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const f = globalThis.__inkUpdateFixture = { profiles: new Map(), reads: 0, transactions: 0, writes: [], fail: false, hold: null };
const fixture = `
export const doc=(_db,collection,id)=>collection+'/'+id;
export const serverTimestamp=()=> 'server-time';
export async function runTransaction(_db,callback){
 const f=globalThis.__inkUpdateFixture;
 f.transactions++;
 const writes=[], hold=f.hold, fail=f.fail;f.fail=false;
 await callback({get:async ref=>{f.reads++;return {data:()=>f.profiles.get(ref.split('/').at(-1))}},set:(ref,data,options)=>writes.push({ref,data,options})});
 if(hold)await hold;
 if(fail)throw new Error('fixture write rejected');
 for(const write of writes){f.writes.push(write);const id=write.ref.split('/').at(-1);f.profiles.set(id,{...f.profiles.get(id),...write.data});}
}`;
await mkdir(resolve('node_modules/.cache'), { recursive: true });
const temp = await mkdtemp(resolve('node_modules/.cache/ink-update-'));
let root, latest, selections = [], selected = 'ocean';
try {
  await build({
    stdin: { contents: "export * from './src/lineDrawing/account';export * from './src/lineDrawing/LineDrawing';", resolveDir: resolve('.'), loader: 'tsx' },
    outfile: resolve(temp, 'test.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', logLevel: 'silent',
    plugins: [{ name: 'account-fixture', setup(b) {
      b.onResolve({ filter: /^firebase\/firestore$/ }, () => ({ path: 'store', namespace: 'fixture' }));
      b.onResolve({ filter: /firebaseClient$/ }, () => ({ path: 'client', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: a.path === 'store' ? fixture : 'export const firebaseDb={}', loader: 'js' }));
    } }],
  });
  const app = await import(pathToFileURL(resolve(temp, 'test.mjs')).href);
  const release = { allowed: true, owner: false, ready: true, saving: false, error: '', published: true };
  function Probe({ username, allowed = true }) {
    latest = app.useLineDrawingCollectionAccount(username);
    return React.createElement(app.LineDrawingCollection, {
      release: { ...release, allowed }, version: latest, selectedTheme: selected,
      onUpgrade: app.upgradeLineDrawingCollection, onSelect: id => { selections.push(id); selected = id; },
    });
  }
  root = createRoot(document.getElementById('root'));
  const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  async function render(username, hydrate = true, allowed = true) {
    await act(async () => root.render(React.createElement(Probe, { username, allowed })));
    if (hydrate) await act(async () => app.restoreLineDrawingCollection(username, f.profiles.get(username)));
    await flush();
  }
  const clickUpdate = () => act(async () => { document.querySelector('[data-line-drawing-upgrade]').click(); });

  f.profiles.set('A', { themeId: 'ocean', role: 'Agent', score: 88, specialThemeQuest2026: { activeMs: 1234 } });
  await render('A', false);
  assert.equal(document.querySelector('[data-line-drawing-upgrade]').disabled, true);
  assert.equal(await app.upgradeLineDrawingCollection(), false);
  assert.equal(f.transactions, 0, 'account must be loaded before an upgrade');
  await act(async () => app.restoreLineDrawingCollection('A', f.profiles.get('A')));
  assert.equal(f.reads, 0, 'restoration adds no Firestore read');
  assert.equal(latest.version, 1);
  assert.equal(document.documentElement.dataset.qaLineDrawingVersion, '1');

  f.fail = true;
  await clickUpdate(); await flush();
  assert.equal(latest.version, 1);
  assert.equal(selected, 'ocean');
  assert.equal(f.writes.length, 0);
  assert.ok(document.querySelector('[role="alert"]'));

  let resume, pending;
  f.hold = new Promise(resolve => { resume = resolve; });
  await act(async () => { pending = app.upgradeLineDrawingCollection(); });
  assert.equal(latest.saving, true);
  assert.equal(latest.version, 1, 'unconfirmed persistence cannot enable V2');
  assert.equal(await app.upgradeLineDrawingCollection(), false);
  assert.equal(f.transactions, 2, 'a double click cannot start another transaction');
  f.profiles.set('B', { themeId: LINE_DRAWING_THEME_ID });
  await render('B');
  resume();
  let result;
  await act(async () => { result = await pending; });
  f.hold = null;
  assert.equal(result, false, 'a response for A cannot select a theme for B');
  assert.equal(latest.username, 'B'); assert.equal(latest.version, 1);
  assert.equal(document.documentElement.dataset.qaLineDrawingVersion, '1');
  assert.equal(f.profiles.get('A').lineDrawingCollectionVersion, 2);
  assert.equal(f.profiles.get('B').lineDrawingCollectionVersion, undefined);
  assert.deepEqual(selections, []);
  assert.equal(f.profiles.get('A').score, 88);
  assert.deepEqual(f.profiles.get('A').specialThemeQuest2026, { activeMs: 1234 });
  assert.equal(f.writes[0].ref, 'qa_user_profiles/A');
  assert.deepEqual(Object.keys(f.writes[0].data).sort(), ['lineDrawingCollectionUpdatedAt', 'lineDrawingCollectionVersion']);
  assert.deepEqual(f.writes[0].options, { merge: true });
  console.log('PASS opt-in gate, shared profile read, failed writes, delayed confirmation, duplicate click, account switch and unrelated data preservation');

  await render('B');
  await clickUpdate(); await flush();
  assert.equal(latest.version, 2);
  assert.equal(document.documentElement.dataset.qaLineDrawingVersion, '2');
  assert.equal(f.profiles.get('B').lineDrawingCollectionVersion, 2);
  assert.deepEqual(selections, [LINE_DRAWING_THEME_ID]);
  assert.equal(document.querySelector('[data-line-drawing-upgrade]'), null);
  assert.equal(document.querySelector('[data-line-drawing-select] img').getAttribute('src'), '/line-drawing/colour-scene.svg');
  const count = f.transactions;
  assert.equal(await app.upgradeLineDrawingCollection(), true);
  assert.equal(f.transactions, count, 'an already confirmed update is idempotent');

  await act(async () => root.unmount());
  app.activateLineDrawingAccount('');
  root = createRoot(document.getElementById('root'));
  await render('B');
  assert.equal(latest.version, 2, 'a confirmed update survives reload');
  await render('C');
  assert.equal(latest.version, 1, 'another account retains the original skin');
  await act(async () => app.restoreLineDrawingCollection('B', f.profiles.get('B')));
  assert.equal(latest.version, 1, 'a late restore cannot upgrade another account');
  await render('C', true, false);
  assert.equal(document.querySelector('[data-qa-theme-collection="line-drawing"]'), null);
  console.log('PASS real update button, saved per-account version, V2 artwork, idempotency, reload restoration and release visibility');
} finally {
  if (root) await act(async () => root.unmount());
  await rm(temp, { recursive: true, force: true });
  dom.window.close();
}
