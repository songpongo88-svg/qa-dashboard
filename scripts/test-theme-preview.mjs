import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { resolveThemePreview } from '../src/themePreview.mjs';
import { WEEKDAY_THEMES } from '../src/weekdayThemes/model.mjs';
import { FESTIVAL_THEMES } from '../src/festivalThemes/model.mjs';
import { SPECIAL_THEMES } from '../src/specialThemes/model.mjs';
import { CHARACTER_THEMES } from '../src/characterThemes/model.mjs';
import { LINE_DRAWING_THEME, LINE_DRAWING_THEME_ID } from '../src/lineDrawing/model.mjs';

const staleInkOption = { ...LINE_DRAWING_THEME, sceneImage: LINE_DRAWING_THEME.image };
const cases = [
  ...WEEKDAY_THEMES.map(t => ({ id: t.id, image: t.image })),
  ...FESTIVAL_THEMES.map(t => ({ id: t.id, image: t.image })),
  ...SPECIAL_THEMES.map(t => ({ id: t.id, image: t.image })),
  ...CHARACTER_THEMES.flatMap(t => [{ id: t.id, image: `/theme-${t.id}.png` }, { id: t.id, image: t.art, characterVersion: 2 }]),
];
for (const sample of cases) {
  const p = resolveThemePreview(sample.id, staleInkOption, { characterVersion: sample.characterVersion });
  assert.equal(p.image, sample.image, `${sample.id} must never inherit the saved Ink & Paper artwork`);
  assert.ok(fs.existsSync('public' + p.image));
}
assert.equal(resolveThemePreview(LINE_DRAWING_THEME_ID, staleInkOption).image, '/line-drawing/scene.svg');
assert.equal(resolveThemePreview(LINE_DRAWING_THEME_ID, staleInkOption, { lineDrawingVersion: 2 }).image, '/line-drawing/colour-scene.svg');
assert.equal(resolveThemePreview('pink', staleInkOption).image, '', 'an unrelated option cannot supply an image');

const dom = new JSDOM('<div id="root"></div>', { url: 'https://qa.test', pretendToBeVisual: true });
for (const key of ['window', 'document', 'Event']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const source = fs.readFileSync(new URL('../src/ThemePreview.tsx', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
const exports = {};
Function('require', 'exports', js)(name => {
  if (name === 'react') return React;
  if (name === './themePreview.mjs') return { resolveThemePreview };
  throw new Error('Unexpected dependency: ' + name);
}, exports);
const root = createRoot(document.getElementById('root'));
try {
  const render = props => act(async () => root.render(React.createElement(exports.default, { option: staleInkOption, ...props })));
  for (const sample of cases) {
    await render({ themeId: LINE_DRAWING_THEME_ID, lineDrawingVersion: 2 });
    await render({ themeId: sample.id, characterVersion: sample.characterVersion });
    const thumbnail = document.querySelector('.qa-active-theme-preview');
    assert.equal(thumbnail.dataset.themePreview, sample.id);
    assert.ok(thumbnail.firstElementChild.style.backgroundImage.includes(sample.image));
    assert.equal(thumbnail.firstElementChild.style.backgroundImage.includes('line-drawing'), false);
  }
  await render({ themeId: 'pink', option: { id: 'pink', swatches: ['#db2777', '#9d174d', '#fb72b6'] } });
  assert.ok(document.querySelector('.qa-active-theme-swatches'));
  assert.equal(document.querySelector('.qa-active-theme-preview').firstElementChild.style.backgroundImage, '');
  await render({ themeId: LINE_DRAWING_THEME_ID, lineDrawingVersion: 1 });
  assert.ok(document.querySelector('.qa-active-theme-preview > span').style.backgroundImage.includes('/line-drawing/scene.svg'));
  console.log('PASS mounted sidebar switches from Ink V2 to all seven weekdays, six festivals, special/character themes and solid colors without stale artwork');
} finally {
  await act(async () => root.unmount());
  dom.window.close();
}
