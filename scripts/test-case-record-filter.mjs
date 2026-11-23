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
const fixture = {read:async()=>[], events:[], calls:0, publishes:[], mounts:0, unmounts:0};
globalThis.__dashboardRefreshFixture = fixture;
function replaceFunction(source,name,body) {
  const ast=ts.createSourceFile('test.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
  assert.ok(node?.body,name);
  return source.slice(0,node.body.pos)+' '+body+source.slice(node.body.end);
}
const bundle=await build({stdin:{contents:`import React,{act} from 'react'; import {Simulate} from 'react-dom/test-utils'; import {createRoot} from 'react-dom/client'; import Dashboard from './src/DashboardMockup'; export {React,act,Simulate,createRoot,Dashboard}; export * from './src/useDashboardAutoRefresh'; export * from './src/caseRecordFilter';`,resolveDir:rootDir,loader:'tsx'},bundle:true,jsx:'automatic',define:{'import.meta.env':'{}'},platform:'node',format:'esm',write:false,logLevel:'silent',loader:{'.css':'empty'},external:['react','react-dom','react-dom/*','jspdf'],banner:{js:"import {createRequire as testRequire} from 'node:module'; const require=testRequire(import.meta.url);"},plugins:[{name:'isolated-data',setup(b){
  b.onLoad({filter:/\/evaluationStore\.ts$/},async args=>({loader:'ts',contents:replaceFunction(await fs.readFile(args.path,'utf8'),'fetchStoredEvaluations',`{ globalThis.__dashboardRefreshFixture.calls++; return globalThis.__dashboardRefreshFixture.read(options); }`)}));
  b.onLoad({filter:/\/appealStore\.ts$/},async args=>({loader:'ts',contents:replaceFunction(await fs.readFile(args.path,'utf8'),'fetchAppealEvents','{ return globalThis.__dashboardRefreshFixture.events.filter(e=>eventTypes.includes(e.event_type)); }')}));
  b.onLoad({filter:/\/userRoleStore\.ts$/},async args=>({loader:'ts',contents:replaceFunction(replaceFunction(await fs.readFile(args.path,'utf8'),'fetchStoredRolePermissions','{ return []; }'),'fetchStoredUserProfiles','{ return []; }')}));
  b.onResolve({filter:/^\.\/PageHero$/},()=>({path:'hero',namespace:'fixture'}));
  b.onResolve({filter:/\?url$/},()=>({path:'asset',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='asset'?'export default "/test-worker.mjs";':'export default function Hero(){return null;}',loader:'js'}));
}}]});
const bundlePath=path.join(temp,'test.mjs');await fs.writeFile(bundlePath,bundle.outputFiles[0].text);
const {React,act,Simulate,createRoot,Dashboard,useDashboardAutoRefresh,isAppealCaseRecord,filterCaseRecords,filterCaseVoiceRecordings,hasCaseVoiceRecording}=await import(pathToFileURL(bundlePath));

const originalFetch=globalThis.fetch;
globalThis.fetch=async url=>{try{return new Response(await fs.readFile(path.join(rootDir,'public',decodeURIComponent(String(url).split('?')[0].replace(/^\//,'')))),{status:200});}catch{return new Response('',{status:404});}};
dom.window.HTMLElement.prototype.scrollIntoView=function(){};
for(const data of [{hasAppealHistory:true},{appealStatus:'Pending'},{appealStatus:'Approved'},{appealStatus:'Partially Approved'},{appealStatus:'Rejected'},{appealAdditionalActive:{submitted:false}},{appealAdditionalActive:{submitted:true}},{reviewStatus:'Revised'},{appealReviewedTopics:[{}]}])assert.equal(isAppealCaseRecord(data),true);
for(const data of [{},{reviewStatus:'Original'},{pendingAppealCaseCount:3},{appealScoreUnverified:true},{appealStatus:'Reset',hasAppealHistory:true}])assert.equal(isAppealCaseRecord(data),false);
const immutable=Object.freeze([Object.freeze({key:'normal'}),Object.freeze({key:'appeal',hasAppealHistory:true})]);assert.equal(filterCaseRecords(immutable,'all'),immutable);assert.deepEqual(filterCaseRecords(immutable,'appeals').map(i=>i.key),['appeal']);
const voiceFixture=Object.freeze([
 Object.freeze({key:'merchant',callLogs:[{contactType:'Merchant',recordingUrl:'https://audio.test/m.wav'}]}),
 Object.freeze({key:'rider',callLogs:[{contactType:'Rider',recordingUrl:'https://audio.test/r.wav'}]}),
 Object.freeze({key:'empty',callLogs:[{contactType:'Customer',recordingUrl:''}]}),
 Object.freeze({key:'missing',callLogs:[]}),
 Object.freeze({key:'multi',callLogs:[{contactType:'Merchant',recordingUrl:'https://audio.test/m2.wav'},{contactType:'Customer',recordingUrl:'https://audio.test/c.wav'}]})
]);
assert.equal(filterCaseVoiceRecordings(voiceFixture,'none'),voiceFixture);
assert.deepEqual(filterCaseVoiceRecordings(voiceFixture,'all').map(x=>x.key),['merchant','rider','multi']);
assert.deepEqual(filterCaseVoiceRecordings(voiceFixture,'Merchant').map(x=>x.key),['merchant','multi']);
assert.deepEqual(filterCaseVoiceRecordings(voiceFixture,'Customer').map(x=>x.key),['multi']);
assert.deepEqual(filterCaseVoiceRecordings(voiceFixture,'Rider').map(x=>x.key),['rider']);
assert.equal(hasCaseVoiceRecording(voiceFixture[2]),false);
console.log('PASS actual voice recordings only; recording Contact Type filters include multi-type cases and exclude empty call logs');
const topics=[{code:'1',label:'Process',score:25,max:30,wantsAppeal:true,appealReason:'Please review'},{code:'2',label:'Answer',score:20,max:20,wantsAppeal:false},{code:'3',label:'Follow-up',score:25,max:25,wantsAppeal:false},{code:'4',label:'Communication',score:20,max:25,wantsAppeal:false}];
const sample=(n,agent='Filter Agent A',month='09')=>({id:'filter-'+n,caseId:'AA99700'+n,agentName:agent,targetDisplayName:agent,auditDate:`2026-${month}-15`,caseDate:`2026-${month}-15`,auditTimestamp:`2026-${month}-16T02:30:45Z`,submittedAt:`2026-${month}-16T02:30:45Z`,evaluationMonthKey:`2026-${month}`,finalScore:n===1?70:90,inquiry:'ข้อมูลทดสอบ (Order inquiry)',topics,evidenceUrls:[]});
fixture.read=async()=>[
 {...sample(1),callLogs:[{id:'merchant-1',contactType:'Merchant',recordingUrl:'https://audio.test/m1.wav'},{id:'merchant-1b',contactType:'Merchant',recordingUrl:'https://audio.test/m1b.wav'},{id:'customer-1',contactType:'Customer',recordingUrl:'https://audio.test/c1.wav'}]},
 {...sample(2),callLogs:[{id:'rider-2',contactType:'Rider',recordingUrl:'https://audio.test/r2.wav'},{id:'unknown-2',recordingUrl:'https://audio.test/u2.wav'}]},
 {...sample(3),callLogs:[{id:'empty-3',contactType:'Customer',recordingUrl:''}]},
 {...sample(4),callLogs:[{id:'merchant-4',contactType:'Merchant',recordingUrl:'https://audio.test/m4.wav'}]},
 {...sample(5,'Filter Agent B'),callLogs:[{id:'customer-5',contactType:'Customer',recordingUrl:'https://audio.test/c5.wav'}]},
 sample(6,'Filter Agent A','10')
];
const submit=n=>({id:'submit-'+n,event_type:'appeal_request_submitted',case_id:'AA99700'+n,target_agent:'Filter Agent A',created_at:'2026-09-17T01:00:00Z',details:{requestId:'filter-request-'+n,agent:'Filter Agent A',auditDate:'2026-09-15',finalScore:90,grade:'A',topics}});
fixture.events=[submit(2),submit(3),submit(4),{id:'reject-3',event_type:'appeal_request_reviewed',case_id:'AA997003',target_agent:'Filter Agent A',created_at:'2026-09-18T01:00:00Z',details:{requestId:'filter-request-3',decision:'Rejected',reviewId:'review-3',topics:[{...topics[0],decision:'Rejected',rejectReason:'Keep original score'}]}},{id:'reset-4',event_type:'appeal_request_reset',case_id:'AA997004',target_agent:'Filter Agent A',created_at:'2026-09-18T01:00:00Z',details:{requestId:'filter-request-4'}}];
const columns=['case-id','case-date','audit-date','agent','intent','score','grade','kpi-status'];
const audioColumns=['case-id','case-date','audit-date','agent','intent','recordings','score','grade','kpi-status'];
const checkColumns=expected=>{assert.deepEqual([...document.querySelector('[data-case-record-header-v163]').querySelectorAll('[data-case-record-column]')].map(e=>e.dataset.caseRecordColumn),expected);for(const row of rows())assert.deepEqual([...row.querySelectorAll('[data-case-record-column]')].map(e=>e.dataset.caseRecordColumn),expected);};
const base={currentUser:{username:'qa-filter',displayName:'QA Filter',role:'Quality Assurance'},dashboardSubTab:'overview',externalSelectedMonthKey:'2026-09',externalSelectedYear:'2026',canViewAgentsInOverview:true,canViewAnalytics:true,analyticsContent:React.createElement('div',null,'Analytics'),roleScopedAgentNames:['Filter Agent A','Filter Agent B'],onEffectiveCasesChange:cases=>{fixture.lastCases=cases;}};
let root=createRoot(document.getElementById('root'));
const render=async(extra={})=>act(async()=>root.render(React.createElement(Dashboard,{...base,dataRefreshKey:1,...extra})));
const rows=()=>[...document.querySelectorAll('[data-case-record-id]')];const ids=()=>rows().map(e=>e.dataset.caseRecordId);
const wait=async(check,label)=>{for(let i=0;i<160;i++){await act(async()=>{await new Promise(r=>setTimeout(r,15));});if(check())return;}assert.fail(label+' '+document.querySelector('[data-unified-case-explorer-v160]')?.textContent.slice(0,450));};
const click=async node=>{assert.ok(node);await act(async()=>Simulate.click(node));};
try{
 await render();await wait(()=>ids().includes('AA997001'),'load');const all=ids();assert.equal(all.length,5);assert.ok(!all.includes('AA997006'));
 checkColumns(columns);
 const badges=(caseId)=>[...document.querySelectorAll('[data-case-record-id="'+caseId+'"] [data-case-record-voice-type]')].map(el=>[el.dataset.caseRecordVoiceType,Number(el.dataset.caseRecordVoiceCount)]);
 assert.deepEqual(badges('AA997001'),[],'voice icons are hidden from normal All cases');
 assert.equal(document.querySelector('[data-case-record-voice-empty]'),null,'no extra voice indicators in normal list');
 assert.match(rows()[0].querySelector('[data-case-record-column="audit-date"]').textContent,/16\/09\/2026/);assert.equal(rows()[0].querySelector('[data-case-record-column="case-date"]').textContent,fixture.lastCases.find(item=>item.caseId===ids()[0]).caseDate);
 const metrics=()=>[...document.querySelectorAll('[data-dashboard-metric]')].map(e=>e.textContent);const snapshot=metrics();const pdf=()=>[...document.querySelectorAll('button')].find(e=>e.textContent.includes('Gen All Case PDF'))?.textContent;const beforePdf=pdf();
 const chooseAudio=async mode=>{await click(document.querySelector('[data-case-record-audio-trigger]'));await click(document.querySelector('[data-case-record-audio-mode="'+mode+'"]'));};
 assert.match(document.querySelector('[data-case-record-audio-trigger]').textContent,/เคสมีไฟล์เสียง/);
 await chooseAudio('all');assert.deepEqual(ids(),all.filter(id=>['AA997001','AA997002','AA997004','AA997005'].includes(id)));checkColumns(audioColumns);
 assert.deepEqual(badges('AA997001'),[['Merchant',2],['Customer',1]],'voice badges show accurate recordings only when audio filter selected');
 assert.deepEqual(badges('AA997002'),[['Rider',1],['Unknown',1]],'unclassified recordings are explicitly marked');
 assert.match(document.querySelector('[data-case-record-id="AA997001"] [data-case-record-voice-type="Merchant"]').getAttribute('title'),/2 ไฟล์เสียง/);
 await chooseAudio('Merchant');assert.deepEqual(ids(),all.filter(id=>['AA997001','AA997004'].includes(id)));checkColumns(audioColumns);
 await click(document.querySelector('[data-case-record-mode="appeals"]'));assert.deepEqual(ids(),[]);checkColumns(audioColumns);
 await chooseAudio('Rider');assert.deepEqual(ids(),['AA997002']);checkColumns(audioColumns);
 await click(document.querySelector('[data-case-record-mode="all"]'));assert.deepEqual(ids(),all);checkColumns(columns);
 assert.deepEqual(badges('AA997001'),[],'all cases return to original 8-column table');
 assert.equal(document.querySelector('[data-case-record-header-v163] [data-case-record-column="recordings"]'),null);
 assert.deepEqual(metrics(),snapshot);assert.equal(pdf(),beforePdf);
 await click(document.querySelector('[data-case-record-id="AA997001"]'));await click(document.querySelector('[data-case-record-mode="appeals"]'));assert.deepEqual(ids(),all.filter(id=>['AA997002','AA997003'].includes(id)));checkColumns(columns);assert.deepEqual(metrics(),snapshot);assert.equal(pdf(),beforePdf);assert.equal(document.querySelector('[data-case-record-count]').textContent,'2 Cases');
 await click(document.querySelector('[data-case-record-id="AA997003"]'));assert.ok(document.querySelector('[data-unified-case-explorer-v160] aside').textContent.includes('AA997003'));
 await click(document.querySelector('[data-case-record-mode="all"]'));assert.deepEqual(ids(),all);
 await click(document.querySelector('[data-case-record-mode="appeals"]'));const input=document.querySelector('[data-search-evaluation-primary-v166] input')||document.querySelector('input[placeholder="Search any case ID"]');assert.ok(input);await act(async()=>Simulate.change(input,{target:{value:'AA997001'}}));await wait(()=>ids().length===1&&ids()[0]==='AA997001','search bypasses stale filter');assert.equal(document.querySelector('[data-case-record-mode="all"]').getAttribute('aria-pressed'),'true');
 await click([...document.querySelectorAll('button')].find(e=>e.textContent==='Clear'||e.textContent==='Reset'));await wait(()=>ids().length===all.length,'clear');
 await render({currentUser:{username:'filter-b',displayName:'Filter Agent B',agentName:'Filter Agent B',role:'Admin Live Chat'},roleScopedAgentNames:['Filter Agent B'],canViewAgentsInOverview:false,dataRefreshKey:2});await wait(()=>ids().length===1&&ids()[0]==='AA997005','Agent authorization');await click(document.querySelector('[data-case-record-mode="appeals"]'));assert.deepEqual(ids(),[]);assert.ok(document.querySelector('[data-unified-case-explorer-v160]').textContent.includes('ไม่พบเคสอุทธรณ์ตามตัวกรองปัจจุบัน'));
 console.log('PASS actual Dashboard: voice badge column visible only under audio filters, original 8 columns otherwise, correct counts, appeal combinations, unchanged KPI/PDF, ID search and role scope');
}finally{await act(async()=>root.unmount());globalThis.fetch=originalFetch;delete globalThis.__dashboardRefreshFixture;dom.window.close();await fs.rm(temp,{recursive:true,force:true});}
