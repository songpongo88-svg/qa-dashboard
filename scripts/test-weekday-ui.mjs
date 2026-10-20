import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { WEEKDAY_IDS } from '../src/weekdayCollection.mjs';
import * as model from '../src/weekdayThemes/model.mjs';
import * as icons from '../src/weekdayThemes/icons.mjs';
import { WEEKDAY_ATLAS_SIZE, WEEKDAY_ICON_FRAMES } from '../src/weekdayThemes/iconGeometry.mjs';

assert.deepEqual(model.WEEKDAY_THEMES.map(t=>t.id),WEEKDAY_IDS);
assert.equal(new Set(model.WEEKDAY_THEMES.map(t=>t.image)).size,7);
assert.equal(new Set(model.WEEKDAY_THEMES.map(t=>t.art)).size,7);
for (const theme of model.WEEKDAY_THEMES) {
  for(const file of [theme.image,theme.atlas]) { const bytes=fs.statSync('public'+file).size;assert.ok(bytes>10000&&bytes<700000,file); }
  const frames=WEEKDAY_ICON_FRAMES[theme.id];assert.equal(frames.length,16);
  assert.equal(new Set(icons.WEEKDAY_ICON_KINDS.map(kind=>icons.weekdayIconPosition(kind,theme.id))).size,16);
  frames.forEach(([x,y,size],index) => {
    const left=Math.round(index%4*WEEKDAY_ATLAS_SIZE/4),right=Math.round((index%4+1)*WEEKDAY_ATLAS_SIZE/4);
    const top=Math.round(Math.floor(index/4)*WEEKDAY_ATLAS_SIZE/4),bottom=Math.round((Math.floor(index/4)+1)*WEEKDAY_ATLAS_SIZE/4);
    assert.ok(x-size/2>=left-.01&&y-size/2>=top-.01,'frame stays inside its atlas cell');
    assert.ok(x+size/2<=right+.01&&y+size/2<=bottom+.01,'neighboring props cannot bleed into this frame');
  });
}
assert.equal(model.weekdayThemeFor('festival-christmas'),null);
for(const label of ['Reject','Approve','Delete Case','Cancel','Close Tab','ลบ Slide','อนุมัติ','ปฏิเสธ','Not Passed','Pending']) assert.equal(icons.weekdayActionFor(label),'',label);
assert.equal(icons.weekdayNavigationIcon('case:AA123456'),'cases');
assert.equal(icons.weekdayNavigationIcon('create-evaluation'),'evaluate');
assert.equal(icons.weekdayNavigationIcon('admin-roles'),'security');
assert.equal(icons.weekdayHeadingIcon('Case Information'),'cases');
assert.equal(icons.weekdayHeadingIcon('ลูกค้าขอแก้ไขข้อมูลเคส'),'');
console.log('PASS: all seven scenes/materials/atlases, bounded geometry, size budgets, semantic actions and navigation');

const dom=new JSDOM('<div id="root"><div id="fixture"></div></div>',{url:'https://qa.test/',pretendToBeVisual:true});
for(const key of ['window','document','MutationObserver','HTMLElement','SVGElement','Event'])globalThis[key]=dom.window[key];
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
class AtlasImage {complete=true;naturalWidth=1254;set src(value){this.value=value;queueMicrotask(()=>this.onload?.());}get src(){return this.value;}}
window.Image=AtlasImage;
function load(file,deps) {
  const source=fs.readFileSync(file,'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
  const exports={};Function('require','exports',js)(name=>{if(name.endsWith('.css'))return {};if(name in deps)return deps[name];throw Error('Unexpected dependency '+name);},exports);return exports;
}
const {installWeekdayThemeRuntime}=load('src/weekdayThemes/runtime.ts',{'./model.mjs':model,'./icons.mjs':icons});
const fixture=document.getElementById('fixture');
fixture.innerHTML='<div class="qa-workspace-tabs-v36"><button role="tab" data-qa-nav-key="case-detail">AA123456</button></div><button id="save"><svg><path d="M0 0" /></svg>Save</button><button id="disabled" disabled>Export</button><div data-case-information-unified class="rounded-xl border bg-white"><h2>Case Information</h2></div><button id="reject"><svg><path /></svg>Reject</button><div data-rich-text-toolbar><button>Save</button></div><div contenteditable="true"><button>Preview Image</button></div><div data-theme-picker-v1><button>Export</button></div>';
const original=document.getElementById('save'),path=original.querySelector('path');let saves=0;original.onclick=()=>saves++;
const root=document.documentElement;root.dataset.qaTheme='weekday-monday';
const dispose=installWeekdayThemeRuntime();
const tick=async()=>{await Promise.resolve();await Promise.resolve();await new Promise(r=>setTimeout(r,0));};await tick();
for(const theme of model.WEEKDAY_THEMES) {
  root.dataset.qaTheme=theme.id;await tick();assert.equal(root.dataset.qaWeekdayTheme,theme.id);assert.equal(root.dataset.qaWeekdayIconsReady,theme.id);
  assert.ok(root.style.getPropertyValue('--weekday-icon-atlas').includes(theme.atlas));
  assert.equal(original.querySelector('path'),path);assert.equal(original.querySelector('svg').dataset.weekdayIconKind,'save');
  assert.equal(fixture.querySelector('[data-case-information-unified]').dataset.weekdaySurface,'card');
}
original.click();assert.equal(saves,1);assert.equal(document.getElementById('disabled').disabled,true);
for(const selector of ['#reject svg','[data-rich-text-toolbar] button','[contenteditable] button','[data-theme-picker-v1] button'])assert.equal(fixture.querySelector(selector).hasAttribute('data-weekday-icon-kind'),false,selector);
const late=document.createElement('button');late.textContent='Preview Image';fixture.append(late);await tick();assert.equal(late.dataset.weekdayIconKind,'preview');
late.textContent='Cancel';await tick();assert.equal(late.hasAttribute('data-weekday-icon-kind'),false);
root.dataset.qaTheme='festival-christmas';await tick();assert.equal(root.hasAttribute('data-qa-weekday-theme'),false);assert.equal(root.hasAttribute('data-qa-weekday-icons-ready'),false);assert.equal(fixture.querySelectorAll('[data-weekday-icon-kind],[data-weekday-surface]').length,0);
root.dataset.qaTheme='weekday-tuesday';await tick();assert.equal(root.dataset.qaWeekdayIconsReady,'weekday-tuesday');
dispose();assert.equal(fixture.querySelectorAll('[data-weekday-icon-kind]').length,0);assert.equal(original.querySelector('path'),path);
console.log('PASS: all day transitions, late-mounted tabs, safe exclusions, original handlers/disabled/children, Festival cleanup and restore');

// Extract the original KPI map, rather than reimplementing those components in the test.
const source=fs.readFileSync('src/DashboardMockup.tsx','utf8');
const sf=ts.createSourceFile('DashboardMockup.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let metric;function visit(node){if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.getText(sf)==='displayedOverviewKpiItems.map')metric=node.getText(sf);ts.forEachChild(node,visit);}visit(sf);assert.ok(metric);
const {useWeekdayScene}=load('src/WeekdayScene.tsx',{react:React,'./weekdayThemes/model.mjs':model});
const {WeekdayIcon}=load('src/weekdayThemes/WeekdayIcon.tsx',{react:React,'./icons.mjs':icons});
const {FestivalMetricIcon}=load('src/festivalThemes/Festival.tsx',{react:React,'./store':{useFestivalTheme:()=>null},'./icons.mjs':{festivalIconUrl:()=>''},'../characterThemes/store':{useCharacterTheme:()=>null},'../characterThemes/Character':{CharacterIcon:()=>null},'../specialThemes/state':{useSpecialTheme:()=>null},'../specialThemes/SpecialIcon':{SpecialIcon:()=>null},'../WeekdayScene':{useWeekdayScene},'../weekdayThemes/WeekdayIcon':{WeekdayIcon}});
const js=ts.transpileModule('const NativeMetrics=()=> <>'+ '{'+metric+'}' +'</>;', {compilerOptions:{jsx:ts.JsxEmit.React}}).outputText;
const items=['Quality Score (Avg.)','KPI Status','Cases Evaluated','Appeal Results','Overall Grade'].map((label,i)=>({label,value:i===1?'Not Passed':'85',valueTone:i===1?'text-rose-700':'text-emerald-700',iconTone:'text-violet-700',icon:'old',note:'Original note'}));
const NativeMetrics=Function('React','FestivalMetricIcon','displayedOverviewKpiItems','appealScoreHold',js+';return NativeMetrics;')(React,FestivalMetricIcon,items,null);
fixture.innerHTML='';const {createRoot}=await import('react-dom/client');const mount=createRoot(fixture);
root.dataset.qaTheme='weekday-friday';await act(async()=>{mount.render(React.createElement(NativeMetrics));await tick();});
assert.equal(fixture.querySelectorAll('[data-dashboard-metric] .qa-weekday-icon').length,5);
assert.equal(fixture.querySelector('[data-dashboard-metric="KPI Status"] .text-rose-700').textContent,'Not Passed');
assert.equal(fixture.querySelectorAll('.qa-weekday-icon[data-weekday-icon-ready="true"]').length,5);
await act(async()=>mount.unmount());dom.window.close();
console.log('PASS: actual five KPI cards use daily icons and preserve original KPI values/colors');
