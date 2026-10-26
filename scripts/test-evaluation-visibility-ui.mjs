import { unlockedMonthlyResultFixture } from "./fixtures/unlocked-monthly-result.mjs";
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import ts from 'typescript';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
const temp = await fs.mkdtemp(path.join(rootDir, '.pending-appeal-test-'));
const dom = new JSDOM('<div id="root"></div>', {url:'https://qa.test', pretendToBeVisual:true});
for (const key of ['window','document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','Event','CustomEvent','MouseEvent','MutationObserver','sessionStorage','localStorage']) globalThis[key] = dom.window[key];
Object.defineProperty(globalThis, 'navigator', {value:dom.window.navigator, configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLDialogElement.prototype.showModal = function(){this.open=true;};
dom.window.HTMLDialogElement.prototype.close = function(){this.open=false;};
dom.window.HTMLElement.prototype.scrollIntoView = function(){};
dom.window.scrollTo = function(){};
const NativeDate=Date;let clock=NativeDate.parse('2026-10-26T08:00:00Z');globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};
const fixture = {events:[], fail:false, published:[], reads:[]};
globalThis.__pendingAppealFixture = fixture;
const topics = [
  {code:'1',label:'Process',score:31,max:35,comment:'Original process',wantsAppeal:true,appealReason:'Review process'},
  {code:'2',label:'Answer',score:19,max:20,comment:'Original answer',wantsAppeal:true,appealReason:'Review answer'},
  {code:'3',label:'Follow-up',score:23,max:25,comment:'Original follow-up',wantsAppeal:false,appealReason:'ไม่อุทธรณ์หัวข้อนี้'},
  {code:'4',label:'Communication',score:17,max:20,comment:'Original communication',wantsAppeal:false,appealReason:'ไม่อุทธรณ์หัวข้อนี้'},
];
const sample = (id,agent,score=90) => ({id:id+'-'+agent,caseId:id,agentName:agent,targetDisplayName:agent,
  auditDate:'2026-10-06',caseDate:'2026-10-06',auditTimestamp:'2026-10-07T01:00:00Z',submittedAt:'2026-10-07T01:00:00Z',
  evaluationMonthKey:'2026-10',finalScore:score,inquiry:'ข้อมูลทดสอบ',topics:topics.map(t=>({...t})),evidenceUrls:[]});
fixture.evaluations = Array.from({length:10},(_,i)=>sample('AA9910'+String(i).padStart(2,'0'),'Fixture Agent A'))
  .concat(Array.from({length:10},(_,i)=>sample('AA9920'+String(i).padStart(2,'0'),'Fixture Agent B',96)));
fixture.evaluations[7].caseDate='2026-10-01';fixture.evaluations[7].auditDate='2026-10-01';
const submit = n => ({id:'submission-'+n,event_type:'appeal_request_submitted',case_id:'AA9910'+String(n).padStart(2,'0'),target_agent:'Fixture Agent A',created_at:`2026-10-07T01:00:0${n}Z`,details:{requestId:'pending-fixture-'+n,agent:'Fixture Agent A',auditDate:'2026-10-06',finalScore:90,grade:'A',topics}});
const submissions = [submit(7),submit(8),submit(9)];
const review = (submission,decision='Partially Approved',version=1) => ({id:'review-'+submission.id+'-'+version,event_type:'appeal_request_reviewed',case_id:submission.case_id,created_at:`2026-10-07T02:0${version}:00Z`,details:{requestId:submission.details.requestId,reviewId:'revision-'+submission.id+'-'+version,reviewVersion:version,decision,reviewSummary:'Reviewed each item',topics:topics.slice(0,2).map((topic,i)=>({...topic,decision:decision==='Rejected'?'Rejected':i===1?'Rejected':'Approved',revisedScore:35,revisedComment:'Updated process',rejectReason:'Keep original answer'}))}});
fixture.events = submissions;
function replaceFunction(source,name,body) {
  const ast=ts.createSourceFile('test.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
  assert.ok(node?.body,name);
  return source.slice(0,node.body.pos)+' '+body+source.slice(node.body.end);
}
const sources = new Map(await Promise.all(['src/App.tsx','src/DashboardMockup.tsx','src/SummaryMockup.tsx'].map(async file=>[file,await fs.readFile(path.join(rootDir,file),'utf8')])));
const adapter = await fs.readFile(path.join(rootDir,'scripts/patch-analytics-dashboard-case-source-v24.mjs'),'utf8');
new Function('fs',adapter.replace(/^import fs from .*;\s*$/m,''))({readFileSync:file=>sources.get(file),writeFileSync:(file,source)=>sources.set(file,source)});
const bundle = await build({stdin:{contents:"import React,{act} from 'react';import {Simulate} from 'react-dom/test-utils';import {createRoot} from 'react-dom/client';import Dashboard from './src/DashboardMockup';import Summary from './src/SummaryMockup';import {withAppealScoreState,getAppealScoreHold} from './src/pendingAppealScore';import {buildAppealRequests} from './src/AppealRequestsMockup';import {EvaluationActivityContext} from './src/EvaluationActivityContext';import {normalizeEvaluationActivity} from './src/evaluationActivity';import {SlideOverCaseDetail} from './src/DashboardMockup';export {EvaluationActivityContext,normalizeEvaluationActivity,SlideOverCaseDetail,React,act,Simulate,createRoot,Dashboard,Summary,withAppealScoreState,getAppealScoreHold,buildAppealRequests};",resolveDir:rootDir,loader:'tsx'},bundle:true,jsx:'automatic',define:{'import.meta.env':'{}'},platform:'node',format:'esm',write:false,logLevel:'silent',loader:{'.css':'empty'},external:['react','react-dom','react-dom/*','jspdf'],banner:{js:"import {createRequire as testRequire} from 'node:module';const require=testRequire(import.meta.url);"},plugins:[unlockedMonthlyResultFixture(),{name:'pending-appeal-boundaries',setup(b){
  b.onLoad({filter:/\/(DashboardMockup|SummaryMockup)\.tsx$/},args=>({loader:'tsx',contents:sources.get('src/'+path.basename(args.path))+(args.path.endsWith('/DashboardMockup.tsx')?'\nexport {SlideOverCaseDetail};':'')}));
  b.onLoad({filter:/\/evaluationStore\.ts$/},async args=>({loader:'ts',contents:replaceFunction(await fs.readFile(args.path,'utf8'),'fetchStoredEvaluations','{ return globalThis.__pendingAppealFixture.evaluations; }')}));
  b.onLoad({filter:/\/appealStore\.ts$/},async args=>({loader:'ts',contents:replaceFunction(await fs.readFile(args.path,'utf8'),'fetchAppealEvents','{ const f=globalThis.__pendingAppealFixture;f.reads.push(eventTypes);if(f.fail)throw new Error("offline fixture");return f.events.filter(event=>eventTypes.includes(event.event_type)); }')}));
  b.onLoad({filter:/\/userRoleStore\.ts$/},async args=>{let source=await fs.readFile(args.path,'utf8');source=replaceFunction(source,'fetchStoredRolePermissions','{ return []; }');source=replaceFunction(source,'fetchStoredUserProfiles','{ return []; }');return{loader:'ts',contents:source};});
  b.onResolve({filter:/^\.\/PageHero$/},()=>({path:'hero',namespace:'fixture'}));
  b.onResolve({filter:/\?url$/},()=>({path:'asset',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='asset'?'export default "/test-worker.mjs";':'export default function Hero(){return null;}',loader:'js'}));
}}]});
const bundlePath=path.join(temp,'test.mjs');await fs.writeFile(bundlePath,bundle.outputFiles[0].text);
const {EvaluationActivityContext,normalizeEvaluationActivity,SlideOverCaseDetail,React,act,Simulate,createRoot,Dashboard,Summary,withAppealScoreState,getAppealScoreHold,buildAppealRequests}=await import(pathToFileURL(bundlePath));
const originalFetch=globalThis.fetch;
globalThis.fetch=async url=>{const fileName=decodeURIComponent(String(url).split('?')[0].replace(/^\//,''));try{return new Response(await fs.readFile(path.join(rootDir,'public',fileName)),{status:200});}catch{return new Response('',{status:404});}};
const waitFor=async(condition,label)=>{for(let i=0;i<160;i++){await act(async()=>{await new Promise(r=>setTimeout(r,10));});if(condition())return;}assert.fail(label+' '+JSON.stringify({rows:[...document.querySelectorAll('[data-analytics-agent-incentive-v92] tbody tr')].map(r=>r.textContent.slice(0,160)),cases:fixture.published.filter(r=>r.caseId.startsWith('AA991')).map(r=>({agent:r.agent,month:r.monthKey,pending:r.pendingAppealCaseCount,score:r.finalScore})),overview:document.querySelector('[data-analytics-overview-v89]')?.textContent.slice(0,250),metrics:metric('Quality Score (Avg.)')?.textContent}));};
const row=agent=>[...document.querySelectorAll('[data-analytics-agent-incentive-v92] tbody tr')].find(node=>node.textContent.includes(agent));
const metric=label=>document.querySelector(`[data-dashboard-metric="${label}"]`);
const qa={username:'qa-fixture',displayName:'QA Fixture',role:'Quality Assurance'};
let root=createRoot(document.getElementById('root'));
function Harness({agent='all',refresh=1,role=qa,scoped,week='all',month='2026-10',activity}) {
  const [effective,setEffective]=React.useState(null);
  const publish=React.useCallback(cases=>{fixture.published=cases;setEffective(cases);},[]);
  const summary=React.createElement(Summary,{currentUser:role,embedded:true,externalEffectiveCases:effective,externalSelectedAgent:agent,externalSelectedMonth:month,externalSelectedWeek:week,roleScopedAgentNames:scoped,canViewAllAgents:!scoped,canViewAllTeams:!scoped,canExportAnalytics:true,dataRefreshKey:refresh});
  return React.createElement(EvaluationActivityContext.Provider,{value:activity},React.createElement(Dashboard,{currentUser:role,dashboardSubTab:'overview',externalSelectedAgent:agent==='all'?'':agent,externalSelectedMonthKey:month,externalSelectedYear:'2026',externalSelectedWeek:week,roleScopedAgentNames:scoped,canViewAgentsInOverview:!scoped,canViewAnalytics:true,dataRefreshKey:refresh,onEffectiveCasesChange:publish,analyticsContent:summary}));
}
const render=async props=>{await act(async()=>root.render(React.createElement(Harness,props)));};
try {
  fixture.events=[];
  const empty={ready:true,error:false,records:[],now:Date.now()};
  const activity=normalizeEvaluationActivity({username:'agent-a',displayName:'Fixture Agent A',evaluatorUsername:'qa-fixture',mode:'evaluation',monthKey:'2026-10',expiresAt:new Date(Date.now()+600000).toISOString()},'fixture-lease');
  await render({activity:empty});
  await waitFor(()=>row('Fixture Agent A')?.textContent.includes('90.00'),'initial scores');
  await render({activity:{...empty,records:[activity]}});
  await waitFor(()=>row('Fixture Agent A')?.textContent.includes('Evaluation in Progress'),'live evaluation hold');
  assert.ok(!row('Fixture Agent A').textContent.includes('90.00'));
  assert.ok(row('Fixture Agent B').textContent.includes('96.00'));
  assert.ok(metric('Quality Score (Avg.)').textContent.includes('Evaluation in Progress'));
  assert.equal(metric('Cases Evaluated').dataset.appealScoreState,'ready');
  assert.equal(metric('KPI Status').dataset.appealScoreState,'held');
  assert.equal(metric('Overall Grade').dataset.appealScoreState,'held');
  assert.ok(!document.querySelector('svg[aria-label="Quality Score Trend"]'));
  const editingCase=fixture.published.find(item=>item.caseId==='AA991000');assert.ok(editingCase);
  const edit={...activity,id:'edit::fixture',persistent:true,mode:'edit',evaluationId:editingCase.key,caseId:'AA991000'};
  await render({activity:{...empty,records:[edit]}});
  await waitFor(()=>row('Fixture Agent A')?.textContent.includes('Editing in Progress'),'editing hold');
  await fs.mkdir(path.join(rootDir,'verification'),{recursive:true});
  await fs.writeFile(path.join(rootDir,'verification/evaluation-held.html'),document.body.outerHTML);
  for(const roleName of ['Admin Live Chat','Senior','Supervisor','System Admin']) {
    const detail=state=>React.createElement(EvaluationActivityContext.Provider,{value:state},React.createElement(SlideOverCaseDetail,{open:true,embedded:true,caseItem:editingCase,currentUser:{username:'viewer',role:roleName},onClose(){}}));
    await act(async()=>root.render(detail(empty)));assert.ok(document.body.textContent.includes('AA991000'));
    await act(async()=>root.render(detail({...empty,records:[edit]})));
    assert.ok(document.querySelector('[data-evaluation-case-blocked]'),roleName);
    assert.ok(!document.body.textContent.includes('Original process'),'private comment is removed even from an already opened case');
  }
  await act(async()=>root.render(React.createElement(EvaluationActivityContext.Provider,{value:{...empty,records:[edit]}},React.createElement(SlideOverCaseDetail,{open:true,embedded:true,caseItem:editingCase,currentUser:qa,onClose(){}}))));
  assert.equal(document.querySelector('[data-evaluation-case-blocked]'),null);
  assert.ok(document.body.textContent.includes('AA991000'));
  await act(async()=>root.unmount());sessionStorage.clear();root=createRoot(document.getElementById('root'));
  await render({activity:empty,agent:'Fixture Agent A'});
  await waitFor(()=>row('Fixture Agent A')?.textContent.includes('90.00'),'selected Agent');
  await render({activity:{...empty,records:[activity]},agent:'Fixture Agent A'});
  await waitFor(()=>metric('Quality Score (Avg.)')?.textContent.includes('Evaluation in Progress'),'selected monthly hold');
  fixture.evaluations[0].finalScore=98;
  await render({activity:empty,agent:'Fixture Agent A',refresh:2});
  await waitFor(()=>row('Fixture Agent A')?.textContent.includes('90.80'),'latest saved score restored');
  assert.equal(metric('Quality Score (Avg.)').dataset.appealScoreState,'ready');
  console.log('PASS real Dashboard/Summary: All Agents, selected Agent averages, KPI/grade/incentive/chart holds, unaffected counts and Agent, live edit, non-QA details removed, QA view retained, saved score restored');
} finally {
  await act(async()=>root.unmount());globalThis.fetch=originalFetch;globalThis.Date=NativeDate;
  dom.window.close();delete globalThis.__pendingAppealFixture;await fs.rm(temp,{recursive:true,force:true});
}
