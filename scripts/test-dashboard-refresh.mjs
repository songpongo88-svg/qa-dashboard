import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import ts from 'typescript';
import {JSDOM} from 'jsdom';

const rootDir = new URL('../', import.meta.url).pathname;
const temp = await fs.mkdtemp(path.join(rootDir, '.refresh-test-'));
const dom = new JSDOM('<div id="root"></div>', {url:'https://qa.test', pretendToBeVisual:true});
for (const key of ['window','document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','Event','MouseEvent','MutationObserver','sessionStorage','localStorage']) globalThis[key] = dom.window[key];
if (!globalThis.navigator) Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator, configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
const fixture = {read:async()=>[], calls:0, publishes:[], mounts:0, unmounts:0};
globalThis.__dashboardRefreshFixture = fixture;
function replaceFunction(source,name,body) {
  const ast=ts.createSourceFile('test.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
  assert.ok(node?.body,name);
  return source.slice(0,node.body.pos)+' '+body+source.slice(node.body.end);
}
const bundle=await build({stdin:{contents:`import React,{act} from 'react'; import {Simulate} from 'react-dom/test-utils'; import {createRoot} from 'react-dom/client'; import Dashboard from './src/DashboardMockup'; export {React,act,Simulate,createRoot,Dashboard}; export * from './src/useDashboardAutoRefresh';`,resolveDir:rootDir,loader:'tsx'},bundle:true,jsx:'automatic',define:{'import.meta.env':'{}'},platform:'node',format:'esm',write:false,logLevel:'silent',loader:{'.css':'empty'},external:['react','react-dom','react-dom/*','jspdf'],banner:{js:"import {createRequire as testRequire} from 'node:module'; const require=testRequire(import.meta.url);"},plugins:[{name:'isolated-data',setup(b){
  b.onLoad({filter:/\/evaluationStore\.ts$/},async args=>({loader:'ts',contents:replaceFunction(await fs.readFile(args.path,'utf8'),'fetchStoredEvaluations',`{ globalThis.__dashboardRefreshFixture.calls++; return globalThis.__dashboardRefreshFixture.read(options); }`)}));
  b.onLoad({filter:/\/appealStore\.ts$/},async args=>({loader:'ts',contents:replaceFunction(await fs.readFile(args.path,'utf8'),'fetchAppealEvents','{ return []; }')}));
  b.onLoad({filter:/\/userRoleStore\.ts$/},async args=>({loader:'ts',contents:replaceFunction(await fs.readFile(args.path,'utf8'),'fetchStoredRolePermissions','{ return []; }')}));
  b.onResolve({filter:/^\.\/PageHero$/},()=>({path:'hero',namespace:'fixture'}));
  b.onResolve({filter:/\?url$/},()=>({path:'asset',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='asset'?'export default "/test-worker.mjs";':'export default function Hero(){return null;}',loader:'js'}));
}}]});
const bundlePath=path.join(temp,'test.mjs');await fs.writeFile(bundlePath,bundle.outputFiles[0].text);
const {React,act,Simulate,createRoot,Dashboard,useDashboardAutoRefresh}=await import(pathToFileURL(bundlePath));
const originalFetch=globalThis.fetch;
globalThis.fetch=async url=>{
  const fileName=decodeURIComponent(String(url).split('?')[0].replace(/^\//,''));
  try {return new Response(await fs.readFile(path.join(rootDir,'public',fileName)),{status:200});}catch{return new Response('',{status:404});}
};
const flush=()=>new Promise(r=>setTimeout(r,0));
const sample=(id,agent='Agent A')=>({id,caseId:id,agentName:agent,targetDisplayName:agent,auditDate:'2026-09-15',auditTimestamp:'2026-09-20T12:30:45Z',submittedAt:'2026-09-20T12:30:45Z',evaluationMonthKey:'2026-09',finalScore:90,inquiry:'ข้อมูลทดสอบ',topics:[{code:'1',score:30,max:30},{code:'2',score:20,max:20},{code:'3',score:20,max:25},{code:'4',score:20,max:25}],evidenceUrls:[]});
function Probe(){React.useEffect(()=>{fixture.mounts++;return()=>{fixture.unmounts++;};},[]);return React.createElement('div',{'data-summary-probe':true},'Summary stays open');}
let root=createRoot(document.getElementById('root'));
const base={currentUser:{username:'qa',displayName:'QA Reviewer',role:'Quality Assurance'},dashboardSubTab:'overview',externalSelectedMonthKey:'2026-09',externalSelectedYear:'2026',canViewAgentsInOverview:true,canViewAnalytics:true,analyticsContent:React.createElement(Probe),onEffectiveCasesChange:rows=>fixture.publishes.push(rows.map(r=>r.caseId))};
const render=async(key,extra={})=>act(async()=>{root.render(React.createElement(Dashboard,{...base,dataRefreshKey:key,...extra}));await flush();});
const settle=async()=>{for(let n=0;n<24;n++)await act(async()=>{await new Promise(r=>setTimeout(r,10));});};
const table=()=>document.querySelector('[data-unified-case-explorer-v160]')?.textContent||'';
const status=()=>document.querySelector('[data-dashboard-refresh-state]');
let resolveRead;
try {
  const remote={read:async()=>{throw new Error('offline');},calls:0,count:2,countCalls:0,queries:[]};globalThis.__refreshRemote=remote;
  const storeBundle=await build({stdin:{contents:"export {fetchStoredEvaluations,invalidateStoredEvaluationCache} from './src/evaluationStore';export {fetchDashboardRevision} from './src/dashboardRevision';",resolveDir:rootDir,loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env':JSON.stringify({VITE_FIREBASE_API_KEY:'test',VITE_FIREBASE_PROJECT_ID:'test',VITE_FIREBASE_APP_ID:'test'})},plugins:[{name:'fake-firestore',setup(b){
    b.onResolve({filter:/^(firebase\/|\.\/firebaseClient$)/},args=>({path:args.path,namespace:'remote-fixture'}));
    b.onLoad({filter:/.*/,namespace:'remote-fixture'},args=>({loader:'js',contents:args.path==='./firebaseClient'?'export const firebaseDb={};':args.path==='firebase/app'?'export const initializeApp=()=>({}),getApps=()=>[];':args.path==='firebase/storage'?'export const getDownloadURL=()=>{},getStorage=()=>{},ref=()=>{},uploadBytes=()=>{},uploadBytesResumable=()=>{};':`export const collection=(_,name)=>({name}),deleteDoc=()=>{},doc=()=>({}),getFirestore=()=>({}),limit=n=>n,orderBy=()=>({}),query=(source,...args)=>({source,args}),setDoc=()=>{},startAfter=()=>({}),where=()=>({});export async function getDocsFromServer(){throw new Error("Unexpected source-case query in refresh fixture");}export async function getDocs(ref){globalThis.__refreshRemote.calls++;globalThis.__refreshRemote.queries.push(ref);return globalThis.__refreshRemote.read();}export async function getCountFromServer(){globalThis.__refreshRemote.countCalls++;return{data:()=>({count:globalThis.__refreshRemote.count})};}`}));
  }}]});
  const storePath=path.join(temp,'store.mjs');await fs.writeFile(storePath,storeBundle.outputFiles[0].text);
  const store=await import(pathToFileURL(storePath));
  await assert.rejects(store.fetchStoredEvaluations(300,{strict:true}),/offline/);
  assert.deepEqual(await store.fetchStoredEvaluations(300),[],'legacy callers retain their fallback');
  assert.equal(remote.calls,2,'failed reads must be evicted so the next request retries');
  remote.read=async()=>({docs:[]});
  assert.deepEqual(await store.fetchStoredEvaluations(300,{strict:true}),[]);
  await store.fetchStoredEvaluations(300,{strict:true});assert.equal(remote.calls,3,'successful reads are deduplicated');
  remote.queries=[];let changedAt='2026-10-02T05:00:00Z';remote.read=async()=>({docs:[{id:'latest',data:()=>({updated_at:changedAt})}]});
  const firstRevision=await store.fetchDashboardRevision();changedAt='2026-10-02T05:10:00Z';
  const editedRevision=await store.fetchDashboardRevision();assert.notEqual(editedRevision,firstRevision,'an edit changes the revision');
  remote.count--;assert.notEqual(await store.fetchDashboardRevision(),editedRevision,'deleting an older record is detected by the count');
  assert.ok(remote.queries.every(ref=>ref.args.includes(1)),'change checks read at most one result per collection');assert.equal(remote.countCalls,6);
  console.log('PASS inexpensive change checks detect edits and deletions without reading the whole case/event history');
  store.invalidateStoredEvaluationCache();remote.read=()=>new Promise(()=>{});
  const actualSetTimeout=globalThis.setTimeout;globalThis.setTimeout=(fn,ms,...args)=>ms===20_000?(queueMicrotask(fn),0):actualSetTimeout(fn,ms,...args);
  try {await assert.rejects(store.fetchStoredEvaluations(300,{strict:true}),/20 วินาที/);}finally{globalThis.setTimeout=actualSetTimeout;store.invalidateStoredEvaluationCache();delete globalThis.__refreshRemote;}
  console.log('PASS real evaluation store propagates failures, evicts failed reads, deduplicates successes and bounds pending reads');

  fixture.read=async options=>{assert.equal(options.strict,true);return [sample('AA900001')];};
  await render(1);await settle();
  assert.ok(table().includes('AA900001'),'September cases load from evaluations: '+JSON.stringify({calls:fixture.calls,status:status()?.textContent,table:table().slice(0,300),page:document.body.textContent.slice(-800)}));
  assert.ok(table().includes('Gen All Case PDF (1)'),'PDF uses the same month snapshot');
  assert.equal(status().dataset.dashboardRefreshState,'idle');
  assert.equal(fixture.mounts,1);
  const latestPublish=fixture.publishes.at(-1);
  fixture.read=()=>new Promise(resolve=>{resolveRead=resolve;});
  await render(2);await settle();
  assert.equal(status().dataset.dashboardRefreshState,'loading');
  assert.ok(table().includes('AA900001'),'data stays visible during a refresh');
  assert.equal(fixture.unmounts,0,'refresh must not remount Summary');
  await act(async()=>{resolveRead([sample('AA900001'),sample('AA900002')]);await flush();});await settle();
  assert.ok(table().includes('AA900002'));assert.ok(table().includes('Gen All Case PDF (2)'));
  const originalWindowTimeout=window.setTimeout.bind(window);let retry;
  window.setTimeout=(fn,ms,...args)=>{const id=originalWindowTimeout(fn,ms,...args);if(ms===15_000)retry={id,fn};return id;};
  fixture.read=async()=>{throw new Error('temporary remote read failure');};
  await render(3);await settle();
  assert.equal(status().dataset.dashboardRefreshState,'error');
  assert.ok(table().includes('AA900002'),'failed remote read must not erase results');
  assert.ok(status().textContent.includes('ยังแสดงข้อมูลเดิมอยู่'));
  const retainedPublish=fixture.publishes.at(-1);
  assert.ok(retainedPublish.includes('AA900002'));
  assert.ok(retry,'failed reads schedule an automatic retry');
  fixture.read=async()=>[sample('AA900001'),sample('AA900002')];
  await act(async()=>{window.clearTimeout(retry.id);retry.fn();await flush();});await settle();
  assert.equal(status().dataset.dashboardRefreshState,'idle','automatic retry recovers without a page reload');
  fixture.read=async()=>{throw new Error('manual retry fixture');};await render(7);await settle();
  fixture.read=async()=>[sample('AA900001'),sample('AA900002')];
  await act(async()=>{Simulate.click([...status().querySelectorAll('button')].find(button=>button.textContent==='อัปเดตข้อมูล'));await flush();});await settle();
  assert.equal(status().dataset.dashboardRefreshState,'idle','manual data refresh recovers without a page reload');
  window.setTimeout=originalWindowTimeout;
  console.log('PASS refresh preserves September cases, PDF count, Summary and the last successful snapshot on failure');

  fixture.read=()=>new Promise(resolve=>{resolveRead=resolve;});
  await render(4);await settle();const staleResolve=resolveRead;
  fixture.read=async()=>[sample('AA900003')];
  await render(5);await settle();
  await act(async()=>{staleResolve([sample('AA900004')]);await flush();});await settle();
  assert.ok(table().includes('AA900003'));assert.ok(!table().includes('AA900004'));
  await act(async()=>root.unmount());root=createRoot(document.getElementById('root'));
  await render(5);await settle();assert.ok(table().includes('AA900003'),'tab return retains the current complete snapshot');
  assert.ok(!fixture.publishes.at(-1).includes('AA900004'),'stale requests cannot overwrite the cache');
  fixture.read=async()=>[sample('AA900003'),sample('AA900005','Agent B')];
  await render(6,{currentUser:{username:'a',displayName:'Agent A',agentName:'Agent A',role:'Admin Live Chat'},roleScopedAgentNames:['Agent A'],canViewAgentsInOverview:false});await settle();
  assert.ok(table().includes('AA900003'));assert.ok(!table().includes('AA900005'),'refresh respects logged-in Agent scope');
  console.log('PASS latest request wins, remount keeps results and Agent scope remains enforced');

  await act(async()=>root.unmount());root=createRoot(document.getElementById('root'));
  const originalNow=Date.now;let now=originalNow();Date.now=()=>now;
  const originalInterval=window.setInterval,originalClear=window.clearInterval;
  const intervals=new Map();let seq=0,refreshes=0,visible=true;
  window.setInterval=(fn,ms)=>{const id=++seq;intervals.set(id,{fn,ms});return id;};window.clearInterval=id=>intervals.delete(id);
  Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>visible?'visible':'hidden'});
  const doRefresh=()=>{refreshes++;};
  function Poller({active,keyValue,revisionReader,onChecked}){useDashboardAutoRefresh(active,keyValue,doRefresh,revisionReader,onChecked);return null;}
  const pollRender=async(active,keyValue,extra={})=>act(async()=>root.render(React.createElement(Poller,{active,keyValue,...extra})));
  await pollRender(true,now);now+=4*60_000;
  await act(async()=>window.dispatchEvent(new Event('focus')));assert.equal(refreshes,0,'frequent tab switches do not trigger extra reads');
  now+=60_000;await act(async()=>{for(const t of intervals.values())t.fn();});assert.equal(refreshes,1,'open Dashboard refreshes after five minutes');
  await act(async()=>window.dispatchEvent(new Event('focus')));assert.equal(refreshes,1);
  visible=false;now+=5*60_000;await act(async()=>{for(const t of intervals.values())t.fn();});assert.equal(refreshes,1);
  visible=true;await act(async()=>document.dispatchEvent(new Event('visibilitychange')));assert.equal(refreshes,2);
  await pollRender(false,now);assert.equal(intervals.size,0,'other work tabs do not poll Dashboard');
  let revisionCode='A',checks=0;const revisionReader=async()=>revisionCode;const onChecked=()=>checks++;
  await pollRender(true,now,{revisionReader,onChecked});
  const tick=async()=>act(async()=>{now+=5*60_000;for(const t of intervals.values())t.fn();await flush();});
  await tick();assert.equal(refreshes,3);await tick();assert.equal(refreshes,3,'unchanged records skip a full workbook/data reload');assert.equal(checks,2,'last checked time still updates when data is unchanged');
  revisionCode='B';await tick();assert.equal(refreshes,4,'changed results refresh the full snapshot');
  console.log('PASS five-minute checks skip unchanged snapshots and publish the actual check time');
  await act(async()=>root.unmount());window.setInterval=originalInterval;window.clearInterval=originalClear;Date.now=originalNow;
  console.log('PASS five-minute visible-page polling, focus throttling, hidden-tab pause and cleanup');
} finally {
  try {await act(async()=>root.unmount());}catch{}
  globalThis.fetch=originalFetch;dom.window.close();await fs.rm(temp,{recursive:true,force:true});delete globalThis.__dashboardRefreshFixture;
}
