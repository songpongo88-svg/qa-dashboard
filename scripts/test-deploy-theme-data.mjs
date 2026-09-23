import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import XLSX from 'xlsx';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { createBuildMetadata, buildMetadataPlugin } from '../build/buildMetadata.js';
import { WEEKDAY_IDS } from '../src/weekdayCollection.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
function run(source, deps = {}) {
  const js = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
  }}).outputText;
  const exports = {};
  return Function('exports', ...Object.keys(deps), `${js}\nreturn exports;`)(exports, ...Object.values(deps));
}
function functions(file, names, deps = {}) {
  const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = new Map();
  function visit(node) { if (ts.isFunctionDeclaration(node) && node.name) found.set(node.name.text, node.getText()); ts.forEachChild(node, visit); }
  visit(ast);
  return run(names.map(name => { assert.ok(found.has(name), name); return found.get(name).replace(/^export\s+(default\s+)?/, ''); }).join('\n') + `\nexport { ${names.join(',')} };`, deps);
}
const meta = createBuildMetadata(root, { VERCEL_GIT_COMMIT_SHA: 'abcdef1234567', VERCEL_GIT_COMMIT_MESSAGE: 'Fix deployment notice' }, new Date('2026-09-23T02:30:00Z'));
assert.equal(meta.commitHash, 'abcdef1234567');
assert.equal(meta.updatedAt, '23/09/2026 09:30:00');
const next = createBuildMetadata(root, { VERCEL_GIT_COMMIT_SHA: 'abcdef1234567' }, new Date('2026-09-23T02:30:01Z'));
assert.notEqual(meta.buildId, next.buildId, 'redeploy of the same commit must still be visible');
const plugin = buildMetadataPlugin(meta); let emitted;
plugin.generateBundle.call({ emitFile: value => { emitted = value; } });
assert.equal(emitted.fileName, 'build-meta.json'); assert.deepEqual(JSON.parse(emitted.source), meta);
console.log('PASS metadata is generated per build, including same-commit redeploys');

const identity = run(read('src/lib/agentIdentity.ts'));
const mapping = functions('src/DashboardMockup.tsx', ['readWorkbookWithSerialDates', 'normalizeText', 'normalizeHeaderComparable', 'buildHeaderHelpers', 'getFirstAvailableHeaderValue', 'roundExcelLikeMinute', 'excelDateToJSDate', 'parseMonthLabelDate', 'getReportingMonthDate', 'getMonthKey', 'normalizeEvaluationKeyPart', 'buildCaseMergeKey', 'mergeRawAndStoredEvaluationCases'], { XLSX, ...identity, RAW_DATA_JAN_FEB_FILE_NAME: 'QA_RawData_January-February2026.xlsx' });
function rawCases(fileName) {
  const workbook = mapping.readWorkbookWithSerialDates(fs.readFileSync(path.join(root, 'public', fileName)));
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Raw_Data, { header: 1, defval: null, raw: true });
  const hi = rows.findIndex(row => row.includes('Agent Name') && row.includes('Case ID'));
  const helper = mapping.buildHeaderHelpers(rows[hi]);
  return rows.slice(hi + 1).filter(row => helper.getValue(row, 'Agent Name') && helper.getValue(row, 'Case ID')).map(row => {
    const date = mapping.excelDateToJSDate(mapping.getFirstAvailableHeaderValue(helper, row, ['Case Date', 'Audit Date']));
    return { agent: helper.getValue(row, 'Agent Name'), caseId: helper.getValue(row, 'Case ID'), auditDateObj: date,
      monthKey: mapping.getMonthKey(mapping.getReportingMonthDate(helper.getValue(row, 'Month Start'), helper.getValue(row, 'Month Label'), date)),
      rawDataFileName: fileName, rawDataSourceName: 'untrusted display label' };
  });
}
const historical = rawCases('QA_RawData_January-February2026.xlsx');
const recent = rawCases('QA_RawData_March-May2026.xlsx');
const cases = mapping.mergeRawAndStoredEvaluationCases([...historical, ...recent, { ...historical[0], caseId: 'EXTRA-RAW', rawDataFileName: 'other.xlsx' }], [
  { ...historical[0], caseId: 'EXTRA-STORED' }, { ...historical[0], monthKey: '2026-03' },
]);
for (const month of ['2026-01', '2026-02']) {
  const selected = cases.filter(item => item.monthKey === month);
  assert.equal(selected.length, 100);
  const counts = new Map(); for (const item of selected) counts.set(item.agent, (counts.get(item.agent) || 0) + 1);
  assert.equal(counts.size, 10); for (const count of counts.values()) assert.equal(count, 10);
}
assert.equal(cases.filter(item => item.monthKey === '2026-03').length, 120);
assert.equal(cases.length, 560);
console.log('PASS real workbooks: January 100, February 100, ten cases per Agent; later months and Case Date preserved');

const preview = run(read('src/ThemePreview.tsx').replace(/^import .*;\n/gm, ''), { React, WEEKDAY_IDS });
for (let i = 0; i < WEEKDAY_IDS.length; i++) {
  const html = renderToStaticMarkup(React.createElement(preview.default, { themeId: WEEKDAY_IDS[i], option: { swatches: ['#111', '#222', '#333'] } }));
  assert.ok(html.includes('weekday-scenes-v3.png')); assert.ok(html.includes(`78% ${i / 6 * 100}%`)); assert.ok(!html.includes('#111'));
}
const character = renderToStaticMarkup(React.createElement(preview.default, { themeId: 'kitty', option: { patternImage: '/theme-kitty-pink.png', swatches: ['#111','#222','#333'] } }));
assert.ok(character.includes('/theme-kitty-pink.png'));
console.log('PASS sidebar thumbnails follow every actual weekday and character theme');

let fetches = 0; const urls = [];
const cache = run(read('src/staticFileCache.ts').replace('import.meta.env.VITE_DEPLOY_COMMIT_SHA', '"abcdef1"'), {
  fetch: async url => { urls.push(url); fetches++; return fetches === 1 ? new Response('', { status: 503 }) : new Response('workbook'); }, Response,
});
await assert.rejects(cache.fetchCachedStaticResponse('/data.xlsx'));
assert.equal(await (await cache.fetchCachedStaticResponse('/data.xlsx')).text(), 'workbook');
assert.equal(await (await cache.fetchCachedStaticResponse('/data.xlsx')).text(), 'workbook');
assert.equal(fetches, 2); assert.equal(urls[0], '/data.xlsx?deploy=abcdef1');
console.log('PASS failed downloads are retried and successful assets are shared within the deployed version');

const dom = new JSDOM('<div id="root"></div>', { url: 'https://qa.test', pretendToBeVisual: true });
const intervals = new Map(); let timerId = 0;
dom.window.setInterval = (fn, ms) => { const id = ++timerId; intervals.set(id, { fn, ms }); return id; };
dom.window.clearInterval = id => intervals.delete(id);
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement, HTMLTextAreaElement: dom.window.HTMLTextAreaElement, HTMLSelectElement: dom.window.HTMLSelectElement, IS_REACT_ACT_ENVIRONMENT: true });
const noticeSource = read('src/AutoDeployRefresh.tsx').replace(/^import .*;\n/gm, '').replace('import.meta.env.VITE_BUILD_META', JSON.stringify(meta));
let served = next; let reloads = 0; let visibility = 'visible';
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
const runtimeWindow = Object.fromEntries(['setTimeout','clearTimeout','setInterval','clearInterval','addEventListener','removeEventListener'].map(key => [key, dom.window[key].bind(dom.window)]));
runtimeWindow.location = { reload() { reloads++; } };
Object.defineProperty(runtimeWindow, 'sessionStorage', { get() { throw Error('Storage disabled'); } });
const notice = run(noticeSource, { React, ...React, createPortal, window: runtimeWindow, fetch: async () => new Response(JSON.stringify(served)) });
const reactRoot = createRoot(document.getElementById('root'));
await React.act(async () => { reactRoot.render(React.createElement(React.StrictMode, null, React.createElement(notice.default))); });
assert.ok(document.body.textContent.includes('มีเวอร์ชันใหม่พร้อมใช้งาน'), 'first request must compare against embedded bundle identity');
const tick = async ms => { await React.act(async () => { for (const entry of [...intervals.values()]) if (entry.ms === ms) entry.fn(); }); };
await tick(1000); assert.ok(document.body.textContent.includes('9 วินาที'));
await tick(30000); assert.ok(document.body.textContent.includes('9 วินาที'), 'same pending build must not restart the timer');
const dirty = document.createElement('div'); dirty.dataset.unsavedChanges = 'true'; document.body.append(dirty);
await tick(750); await tick(1000); assert.ok(document.body.textContent.includes('พักการรีเฟรชไว้'));
dirty.remove(); visibility = 'hidden'; await tick(750); await tick(1000); assert.ok(document.body.textContent.includes('พักการรีเฟรชไว้'));
visibility = 'visible'; await tick(750);
await React.act(async () => { [...document.querySelectorAll('button')].find(button => button.textContent === 'เลื่อนการรีเฟรช').click(); });
await tick(1000); assert.ok(document.body.textContent.includes('พักการรีเฟรชไว้แล้ว'));
served = meta; await tick(30000); assert.ok(!document.querySelector('[data-deploy-notice]'), 'withdraw pending notice if deployed version returns to baseline');
served = next; await tick(30000); for (let i = 0; i < 10; i++) await tick(1000); assert.equal(reloads, 1, 'countdown reloads once even when sessionStorage is blocked');
await React.act(async () => reactRoot.unmount()); assert.equal(intervals.size, 0);
dom.window.close();
console.log('PASS React notice: stale first load, deduplicated checks, dirty form pause, defer, rollback and cleanup');
