import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mkdtemp, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import ts from 'typescript';
import {isSpecialTheme} from '../src/specialThemes/model.mjs';
import * as weekday from '../src/weekdayCollection.mjs';

const dom = new JSDOM('<div id="root"></div><div id="controls"><button id="search"><svg></svg>Search</button><button id="export" disabled>Download PDF</button><button id="danger">Reset This Task</button><input value="AA990501"></div><div data-rich-text-toolbar="true"><button id="format-table" aria-label="Add table"><svg></svg></button></div><button id="wrapped-view"><span><svg></svg></span>View Detail</button>', {url:'https://qa.test/',pretendToBeVisual:true});
for (const key of ['window','document','MutationObserver','Event','MouseEvent','CustomEvent','HTMLElement','HTMLDialogElement','localStorage']) globalThis[key]=dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
const f=globalThis.__characterFixture={profiles:new Map(),writes:[],transactions:0,reads:0,fail:false,hold:null};
const temp=await mkdtemp(resolve('node_modules/.cache/character-themes-'));
const fixture=`export const doc=(_db,_collection,id)=>id;export const serverTimestamp=()=> 'server-time';export async function runTransaction(_db,callback){const f=globalThis.__characterFixture;f.transactions++;const buffer=[];const hold=f.hold,fail=f.fail;f.fail=false;await callback({get:async id=>{f.reads++;return {data:()=>f.profiles.get(id)}},set:(id,data,options)=>buffer.push({id,data,options})});if(hold)await hold;if(fail)throw new Error('fixture write rejected');for(const w of buffer){f.writes.push(w);f.profiles.set(w.id,{...f.profiles.get(w.id),...w.data})}}`;
let root,dispose,latest,selected='kitty-pink';
const flush=()=>act(async()=>{await new Promise(r=>setTimeout(r,0));});
try {
  const entry=`export * from './src/characterThemes/model.mjs';export * from './src/characterThemes/account';export * from './src/characterThemes/Character';export * from './src/characterThemes/CharacterCollection';export * from './src/characterThemes/store';export * from './src/characterThemes/runtime';export * from './src/characterThemes/icons.mjs';`;
  await build({stdin:{contents:entry,resolveDir:resolve('.'),loader:'tsx'},outfile:resolve(temp,'test.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',logLevel:'silent',loader:{'.css':'empty'},plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^firebase\/firestore$/},()=>({path:'store',namespace:'fixture'}));b.onResolve({filter:/firebaseClient$/},()=>({path:'client',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='store'?fixture:'export const firebaseDb={}',loader:'js'}));}}]});
  const app=await import(pathToFileURL(resolve(temp,'test.mjs')).href);
  assert.equal(app.characterActionFor('🗑 Delete Evaluation'),'');assert.equal(app.characterActionFor('✕ Reject Appeal'),'');
  dispose=app.installCharacterThemeRuntime();
  let searchClicks=0;const search=document.getElementById('search'),svg=search.querySelector('svg');search.addEventListener('click',()=>searchClicks++);
  function Probe({username}) {
    latest=app.useCharacterCollectionAccount(username);
    const [theme,setTheme]=React.useState(selected);
    React.useLayoutEffect(()=>{document.documentElement.dataset.qaTheme=theme;},[theme]);
    const active=app.useCharacterTheme();
    return React.createElement(React.Fragment,null,
      active?React.createElement(app.CharacterHero,{theme:active,title:'QA Dashboard',eyebrow:'QA PERFORMANCE'}):React.createElement('header',{'data-legacy-hero':true},'V1'),
      React.createElement('div',{className:'qa-theme-collection-panel','data-qa-picker-collection':'character'},React.createElement(app.CharacterCollection,{version:latest,selectedTheme:theme,onSelect:id=>{selected=id;setTheme(id);}})));
  }
  root=createRoot(document.getElementById('root'));
  async function render(username,hydrate=true){await act(async()=>root.render(React.createElement(Probe,{username})));if(hydrate)await act(async()=>app.restoreCharacterCollection(username,f.profiles.get(username)||{}));await flush();}
  const click=selector=>act(async()=>document.querySelector(selector).click());
  f.profiles.set('A',{themeId:'kitty-pink',role:'Agent',specialThemeQuest2026:{activeMs:1234},other:'keep'});
  f.profiles.set('B',{themeId:'doraemon-blue'});
  for(const value of [undefined,null,1,'2',3,{version:2}])assert.equal(app.characterVersionFromProfile({characterCollectionVersion:value}),1);
  assert.equal(app.characterVersionFromProfile({characterCollectionVersion:2}),2);
  await render('A',false);await act(async()=>app.upgradeCharacterCollection());assert.equal(f.transactions,0,'no update before the account profile is ready');
  await act(async()=>app.restoreCharacterCollection('A',f.profiles.get('A')));await flush();
  assert.equal(latest.version,1);assert.equal(document.documentElement.dataset.qaCharacterTheme,undefined);
  assert.equal(document.querySelectorAll('[data-character-card]').length,0);assert.equal(f.reads,0,'uses the existing App profile read');
  const before=JSON.stringify({profile:f.profiles.get('A'),theme:document.documentElement.dataset.qaTheme,version:document.documentElement.dataset.qaCharacterVersion});
  await click('.qa-character-update-actions button:first-child');assert.ok(document.querySelector('dialog').open);
  for(const theme of app.CHARACTER_THEMES){await act(async()=>[...document.querySelectorAll('.qa-character-preview-dialog nav button')].find(b=>b.textContent===theme.label).click());assert.ok(document.querySelector(`[data-qa-character-preview="${theme.id}"]`));assert.ok(document.querySelector(`[data-character-hero="${theme.id}"] img[src="${theme.art}"]`));}
  await act(async()=>document.querySelector('dialog').dispatchEvent(new Event('cancel',{cancelable:true})));
  assert.equal(document.querySelector('dialog'),null);assert.equal(f.writes.length,0);
  assert.equal(JSON.stringify({profile:f.profiles.get('A'),theme:document.documentElement.dataset.qaTheme,version:document.documentElement.dataset.qaCharacterVersion}),before);
  console.log('PASS missing/invalid versions stay V1, preview all six themes without persistence or changing the active theme');

  f.fail=true;await click('.qa-character-update-actions button:nth-child(2)');await flush();
  assert.equal(latest.version,1);assert.ok(document.querySelector('[role="alert"]'));assert.equal(f.writes.length,0);
  let release;f.hold=new Promise(resolve=>{release=resolve;});let pending;
  await act(async()=>{pending=app.upgradeCharacterCollection();void app.upgradeCharacterCollection();});await flush();
  assert.equal(latest.saving,true);assert.equal(latest.version,1,'no optimistic upgrade before server confirmation');assert.equal(f.transactions,2,'duplicate clicks issue only one retry transaction');
  await act(async()=>{release();await pending;});f.hold=null;await flush();
  assert.equal(latest.version,2);assert.equal(latest.saving,false);assert.equal(f.writes.length,1);
  assert.deepEqual(Object.keys(f.writes[0].data).sort(),['characterCollectionUpdatedAt','characterCollectionVersion']);assert.equal(f.writes[0].options.merge,true);
  assert.equal(f.profiles.get('A').themeId,'kitty-pink');assert.equal(f.profiles.get('A').other,'keep');assert.deepEqual(f.profiles.get('A').specialThemeQuest2026,{activeMs:1234});
  assert.equal(f.profiles.get('B').characterCollectionVersion,undefined);assert.equal(document.querySelectorAll('[data-character-card]').length,6);
  console.log('PASS rejected writes retain V1, retry applies only after confirmation, duplicate clicks deduplicate, and profile fields/other accounts remain intact');

  for(const theme of app.CHARACTER_THEMES){
    assert.ok(fs.statSync(resolve('public'+theme.art)).size>20000);assert.equal(fs.readFileSync(resolve('public'+theme.art)).subarray(8,12).toString(),'WEBP');
    await click(`[data-character-card="${theme.id}"] .qa-character-card-actions button:last-child`);await flush();
    assert.equal(document.documentElement.dataset.qaCharacterTheme,theme.id);assert.ok(document.querySelector(`[data-character-hero="${theme.id}"]`));
    assert.equal(document.querySelector('#format-table svg').dataset.characterProp,undefined,'rich text format tools retain their own icons');assert.equal(document.querySelector('#wrapped-view svg').dataset.characterProp,'view','existing wrapper icon stays in its original slot');
  assert.equal(search.dataset.characterAction,'search');assert.equal(svg.dataset.characterProp,'search');assert.ok(svg.style.getPropertyValue('--character-prop-position'));assert.equal(search.style.paddingInlineStart,'','existing control padding stays intact');
    const icons=['search','export','appeal','coaching','score'].map(kind=>app.characterIconUrl(theme.id,kind));assert.equal(new Set(icons).size,icons.length);const atlas=fs.readFileSync(resolve(`public/characters-v2/icons/${theme.id}.webp`));assert.equal(atlas.subarray(8,12).toString(),'WEBP');assert.ok(atlas.length>20000,'real 3D prop atlas exists');
  }
  await click('#search');assert.equal(searchClicks,1);assert.equal(search.querySelector('svg'),svg,'original handlers and child nodes preserved');
  assert.equal(document.getElementById('export').disabled,true);assert.equal(document.getElementById('danger').hasAttribute('data-character-action'),false);assert.equal(document.querySelector('#controls input').value,'AA990501');
  await act(async()=>{search.lastChild.textContent='Reject';});await flush();assert.equal(search.dataset.characterAction,undefined,'reused controls lose an obsolete decorative action');
  await act(async()=>{search.lastChild.textContent='Search';});await flush();assert.equal(search.dataset.characterAction,'search');
  console.log('PASS six real artwork assets, live hero/skin/icon switching, recognizable action cues and original control behavior');

  await act(async()=>root.unmount());root=createRoot(document.getElementById('root'));app.activateCharacterAccount('');await render('A');
  assert.equal(latest.version,2,'confirmed per-account version survives reload');
  await render('B');assert.equal(latest.version,1);assert.equal(document.documentElement.dataset.qaCharacterTheme,undefined);assert.equal(search.dataset.characterAction,undefined);
  await act(async()=>app.restoreCharacterCollection('A',f.profiles.get('A')));assert.equal(latest.version,1,'late A hydration cannot upgrade B');
  f.profiles.set('C',{themeId:'kitty-pink'});await render('C');f.hold=new Promise(resolve=>{release=resolve;});
  await act(async()=>{pending=app.upgradeCharacterCollection();});await render('B');await act(async()=>{release();await pending;});f.hold=null;
  assert.equal(latest.version,1);assert.equal(f.profiles.get('C').characterCollectionVersion,2);assert.equal(f.profiles.get('B').characterCollectionVersion,undefined);
  await render('C');assert.equal(latest.version,2);
  await act(async()=>{document.documentElement.dataset.qaTheme='festival-songkran';});await flush();assert.equal(document.documentElement.dataset.qaCharacterTheme,undefined);
  await act(async()=>{document.documentElement.dataset.qaTheme='kitty-pink';document.documentElement.dataset.qaWeatherCollection='auto';});await flush();assert.equal(document.documentElement.dataset.qaCharacterTheme,undefined);
  await act(async()=>{delete document.documentElement.dataset.qaWeatherCollection;});await flush();assert.equal(document.documentElement.dataset.qaCharacterTheme,'kitty-pink');
  await render(undefined);assert.equal(document.documentElement.dataset.qaCharacterTheme,undefined);
  console.log('PASS reload, account switching, stale responses, pending upgrade isolation, and clean exit to weather/festival/logout');

  const actions=await import('../src/characterThemes/actions.mjs');
  assert.equal(actions.characterActionFor('Appeal Review'),'history');
  assert.equal(actions.characterActionFor('View Detail'),'view');
  for(const label of ['Approve','Reject','Delete','🗑 Delete','Collapse Sidebar','Not Passed'])assert.equal(actions.characterActionFor(label),'',label+' keeps its original semantic icon');
  for(const [key,value]of Object.entries({'dashboard':'overview','create-evaluation':'edit','appeal-requests':'history','coaching':'coaching','signature-center':'edit','user-guide':'library','schedule':'clock','admin-roles':'security'}))assert.equal(actions.characterNavigationAction(key),value);
  const css=fs.readFileSync('src/characterThemes/character.css','utf8');assert.doesNotMatch(css,/padding-inline-start|button\[data-character-action\]::after/,'no inserted icons or geometry changes');assert.doesNotMatch(css,/button\[class\*=["']bg-white/,'hover class cannot select every sidebar row');
  console.log('PASS exact navigation purpose, untouched danger/expansion icons, real prop atlases and no layout-changing button decoration');
  const source=fs.readFileSync('src/App.tsx','utf8');assert.match(source,/restoreCharacterCollection\(username, profile\)/);assert.match(source,/useCharacterCollectionAccount\(currentUser\?\.username\)/);assert.match(source,/characterVersion=\{characterVersion\}/);
  assert.match(fs.readFileSync('src/PageHero.tsx','utf8'),/if \(characterTheme\) return <CharacterHero/);
  console.log('PASS actual App hydration, picker version and all-workspace PageHero are connected to the production feature');

  const seasonalSource=fs.readFileSync('src/seasonalThemeRuntime2.ts','utf8');
  const seasonalAst=ts.createSourceFile('seasonal.ts',seasonalSource,ts.ScriptTarget.Latest,true);
  const seasonalFunctions=seasonalAst.statements.filter(n=>ts.isFunctionDeclaration(n)&&['getCustomPreference','getPreferredTheme','applyEffectiveTheme'].includes(n.name?.text)).map(n=>n.getText()).join('\n');
  const seasonalJs=ts.transpileModule(`const CUSTOM_THEME_STORAGE_KEY='qa-dashboard:custom-theme-v1',BASE_THEME_STORAGE_KEY='qa-dashboard:theme-v1';let sessionCustomTheme,applyingTheme=false;${seasonalFunctions};export {applyEffectiveTheme}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const deps={...weekday,isSpecialTheme,characterThemeFor:app.characterThemeFor,getActiveFestival:()=>({id:'festival-halloween'}),festivalThemeFor:()=>null,requestThemePickerRefresh:()=>{}};
  const calendar=Function('exports',...Object.keys(deps),seasonalJs+';return exports;')({},...Object.values(deps));
  localStorage.setItem('qa-dashboard:theme-v1','kitty-pink');localStorage.removeItem('qa-dashboard:custom-theme-v1');
  await act(async()=>{document.documentElement.dataset.qaCharacterVersion='1';calendar.applyEffectiveTheme();});assert.equal(document.documentElement.dataset.qaTheme,'festival-halloween','V1 retains its original seasonal behavior');
  for(const theme of app.CHARACTER_THEMES){localStorage.setItem('qa-dashboard:theme-v1',theme.id);await act(async()=>{document.documentElement.dataset.qaCharacterVersion='2';calendar.applyEffectiveTheme();});assert.equal(document.documentElement.dataset.qaTheme,theme.id,'explicit V2 character choice stays active during festivals');}
  localStorage.setItem('qa-dashboard:custom-theme-v1','weather-auto');await act(async()=>calendar.applyEffectiveTheme());assert.equal(document.documentElement.dataset.qaTheme,'robinhood','weather collection still takes priority');
  console.log('PASS V1 seasonal behavior, every explicit V2 choice during festivals, and weather preference priority');
} finally {if(root)await act(async()=>root.unmount());dispose?.();dom.window.close();delete globalThis.__characterFixture;await rm(temp,{recursive:true,force:true});}
