import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<main id="root"></main><section aria-labelledby="qa-theme-picker-title"><button id="opener">ดูตัวอย่าง</button></section><div id="controls"><button id="search" aria-label="Search cases"><svg></svg>Search</button><button id="export" disabled>Export</button><button id="reset-task">Reset This Task</button><button id="close">ปิด</button><input value="AA990501"></div>', { url:'https://qa.test/',pretendToBeVisual:true });
for (const key of ['window','document','Node','HTMLElement','MutationObserver','Event','MouseEvent','CustomEvent','DOMParser','localStorage']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const temp = await mkdtemp(resolve('.festival-theme-test-'));
let root, dispose;
const flush = async() => { await new Promise(resolve => setTimeout(resolve,0)); };
try {
  const output = resolve(temp,'test.mjs');
  await build({stdin:{contents:`export * from './src/festivalThemes/model.mjs';export * from './src/festivalThemes/icons.mjs';export * from './src/festivalThemes/controlIcons';export * from './src/festivalThemes/preview';export * from './src/festivalThemes/Festival';`,resolveDir:resolve('.'),loader:'tsx'},outfile:output,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',logLevel:'silent'});
  const app = await import(pathToFileURL(output).href);
  let clicked = 0;
  const search = document.getElementById('search'); const originalSvg = search.querySelector('svg');
  search.addEventListener('click',()=>clicked++);
  dispose = app.installFestivalControlIcons();
  root = createRoot(document.getElementById('root'));
  localStorage.setItem('qa-dashboard:theme-v1','ocean');
  const storageBefore = JSON.stringify({...localStorage});
  for (const theme of app.FESTIVAL_THEMES) {
    assert.ok((await stat(resolve('public'+theme.image))).size>20000,'durable production photo exists');
    await act(async()=>{
      document.documentElement.dataset.qaTheme=theme.id;
      document.documentElement.dataset.qaFestivalTheme=theme.id;
      root.render(React.createElement(React.Fragment,null,
        React.createElement(app.FestivalHero,{theme,title:'QA Dashboard',eyebrow:'QA Performance Center',subtitle:'ภาพรวมการประเมิน'}),
        React.createElement(app.FestivalMetricIcon,{kind:'Quality Score',fallback:'original icon'})));
      await flush();
    });
    assert.equal(search.dataset.festivalAction,'search');
    assert.equal(search.querySelector('svg'),originalSvg,'native React child nodes are never replaced');
    assert.equal(search.getAttribute('aria-label'),'Search cases');
    assert.equal(document.getElementById('export').disabled,true,'decoration cannot enable a locked export');
    assert.equal(document.getElementById('reset-task').dataset.festivalAction,undefined,'destructive reset keeps its warning treatment');
    assert.equal(document.querySelector('input').value,'AA990501');
    assert.equal(document.querySelector('[data-festival-hero]').dataset.festivalHero,theme.id);
    assert.equal(document.querySelector('.qa-festival-hero-brand > img').getAttribute('src'),'/robinhood-logo.png');
    assert.ok(document.querySelector('[data-festival-icon="score"]').src.startsWith('data:image/svg+xml,'));
    const svg = decodeURIComponent(app.festivalIconUrl(theme.id,'compare').split(',').slice(1).join(','));
    assert.equal(new DOMParser().parseFromString(svg,'image/svg+xml').querySelector('parsererror'),null,'native icon is valid SVG');
    search.click();assert.equal(clicked,app.FESTIVAL_THEMES.indexOf(theme)+1,'original action still fires once');

    const opener=document.getElementById('opener'),picker=opener.parentElement;
    opener.focus();const current=document.documentElement.dataset.qaTheme;
    app.openFestivalPreview(theme.id,opener);
    const preview=document.querySelector('.qa-festival-preview-dialog');
    assert.equal(preview.getAttribute('aria-modal'),'true');
    assert.equal(preview.querySelector('[data-qa-festival-preview]').dataset.qaFestivalPreview,theme.id);
    assert.equal(preview.querySelectorAll('[data-festival-action]').length,4);
    assert.equal(preview.querySelectorAll('[data-festival-icon]').length,14);
    assert.equal(picker.inert,true);
    assert.equal(document.documentElement.dataset.qaTheme,current,'preview cannot activate a festival');
    assert.equal(JSON.stringify({...localStorage}),storageBefore,'preview cannot rewrite the selected preference');
    const buttons=preview.querySelectorAll('button');buttons[buttons.length-1].focus();
    document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
    assert.equal(document.activeElement,buttons[0]);
    document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    assert.equal(document.querySelector('.qa-festival-preview-overlay'),null);
    assert.equal(picker.inert,false);assert.equal(document.activeElement,opener);
  }
  console.log('PASS six live festival heroes, vector icons and isolated full-UI previews share the same production assets without changing preferences or protected actions');
  const late=document.createElement('button');late.textContent='⇄ Compare';document.getElementById('controls').append(late);await flush();
  assert.equal(late.dataset.festivalAction,'compare','newly mounted workspace controls receive themed icons');
  late.textContent='กำลังประมวลผล';await flush();assert.equal(late.dataset.festivalAction,undefined,'loading labels retain their own feedback');
  await act(async()=>{document.documentElement.dataset.qaTheme='ocean';delete document.documentElement.dataset.qaFestivalTheme;await flush();});
  assert.equal(document.querySelector('[data-festival-action]'),null);
  assert.equal(document.documentElement.style.getPropertyValue('--festival-icon-search'),'');
  assert.ok(document.getElementById('root').textContent.includes('original icon'),'leaving festival restores the regular metric icon');
  assert.equal(search.querySelector('svg'),originalSvg);
  console.log('PASS dynamic controls, keyboard/focus, disabled buttons, brand identity and clean return to regular themes');
} finally {
  dispose?.();if(root)await act(async()=>root.unmount());dom.window.close();await rm(temp,{recursive:true,force:true});
}
