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
const fixture = {events:[], fail:false, published:[]};
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
const bundle = await build({stdin:{contents:"import React,{act} from 'react';import {Simulate} from 'react-dom/test-utils';import {createRoot} from 'react-dom/client';import Dashboard from './src/DashboardMockup';import Summary from './src/SummaryMockup';import {withAppealScoreState,getAppealScoreHold} from './src/pendingAppealScore';import {buildAppealRequests} from './src/AppealRequestsMockup';export {React,act,Simulate,createRoot,Dashboard,Summary,withAppealScoreState,getAppealScoreHold,buildAppealRequests};",resolveDir:rootDir,loader:'tsx'},bundle:true,jsx:'automatic',define:{'import.meta.env':'{}'},platform:'node',format:'esm',write:false,logLevel:'silent',loader:{'.css':'empty'},external:['react','react-dom','react-dom/*','jspdf'],banner:{js:"import {createRequire as testRequire} from 'node:module';const require=testRequire(import.meta.url);"},plugins:[{name:'pending-appeal-boundaries',setup(b){
  b.onLoad({filter:/\/(DashboardMockup|SummaryMockup)\.tsx$/},args=>({loader:'tsx',contents:sources.get('src/'+path.basename(args.path))}));
  b.onLoad({filter:/\/evaluationStore\.ts$/},async args=>({loader:'ts',contents:replaceFunction(await fs.readFile(args.path,'utf8'),'fetchStoredEvaluations','{ return globalThis.__pendingAppealFixture.evaluations; }')}));
  b.onLoad({filter:/\/appealStore\.ts$/},async args=>({loader:'ts',contents:replaceFunction(await fs.readFile(args.path,'utf8'),'fetchAppealEvents','{ if(globalThis.__pendingAppealFixture.fail) throw new Error("offline fixture"); return globalThis.__pendingAppealFixture.events; }')}));
  b.onLoad({filter:/\/userRoleStore\.ts$/},async args=>{let source=await fs.readFile(args.path,'utf8');source=replaceFunction(source,'fetchStoredRolePermissions','{ return []; }');source=replaceFunction(source,'fetchStoredUserProfiles','{ return []; }');return{loader:'ts',contents:source};});
  b.onResolve({filter:/^\.\/PageHero$/},()=>({path:'hero',namespace:'fixture'}));
  b.onResolve({filter:/\?url$/},()=>({path:'asset',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='asset'?'export default "/test-worker.mjs";':'export default function Hero(){return null;}',loader:'js'}));
}}]});
const bundlePath=path.join(temp,'test.mjs');await fs.writeFile(bundlePath,bundle.outputFiles[0].text);
const {React,act,Simulate,createRoot,Dashboard,Summary,withAppealScoreState,getAppealScoreHold,buildAppealRequests}=await import(pathToFileURL(bundlePath));
const originalFetch=globalThis.fetch;
globalThis.fetch=async url=>{const fileName=decodeURIComponent(String(url).split('?')[0].replace(/^\//,''));try{return new Response(await fs.readFile(path.join(rootDir,'public',fileName)),{status:200});}catch{return new Response('',{status:404});}};
const waitFor=async(condition,label)=>{for(let i=0;i<160;i++){await act(async()=>{await new Promise(r=>setTimeout(r,10));});if(condition())return;}assert.fail(label+' '+JSON.stringify({rows:[...document.querySelectorAll('[data-analytics-agent-incentive-v92] tbody tr')].map(r=>r.textContent.slice(0,160)),cases:fixture.published.filter(r=>r.caseId.startsWith('AA991')).map(r=>({agent:r.agent,month:r.monthKey,pending:r.pendingAppealCaseCount,score:r.finalScore})),overview:document.querySelector('[data-analytics-overview-v89]')?.textContent.slice(0,250),metrics:metric('Quality Score (Avg.)')?.textContent}));};
const row=agent=>[...document.querySelectorAll('[data-analytics-agent-incentive-v92] tbody tr')].find(node=>node.textContent.includes(agent));
const metric=label=>document.querySelector(`[data-dashboard-metric="${label}"]`);
const qa={username:'qa-fixture',displayName:'QA Fixture',role:'Quality Assurance'};
let root=createRoot(document.getElementById('root'));
function Harness({agent='all',refresh=1,role=qa,scoped,week='all',month='2026-10'}) {
  const [effective,setEffective]=React.useState(null);
  const publish=React.useCallback(cases=>{fixture.published=cases;setEffective(cases);},[]);
  const summary=React.createElement(Summary,{currentUser:role,embedded:true,externalEffectiveCases:effective,externalSelectedAgent:agent,externalSelectedMonth:month,externalSelectedWeek:week,roleScopedAgentNames:scoped,canViewAllAgents:!scoped,canViewAllTeams:!scoped,canExportAnalytics:true,dataRefreshKey:refresh});
  return React.createElement(Dashboard,{currentUser:role,dashboardSubTab:'overview',externalSelectedAgent:agent==='all'?'':agent,externalSelectedMonthKey:month,externalSelectedYear:'2026',externalSelectedWeek:week,roleScopedAgentNames:scoped,canViewAgentsInOverview:!scoped,canViewAnalytics:true,dataRefreshKey:refresh,onEffectiveCasesChange:publish,analyticsContent:summary});
}
const render=async props=>{await act(async()=>root.render(React.createElement(Harness,props)));};
try {
  const directCases=[{agent:'Fixture Agent A',caseId:'AA991007',finalScore:90},{agent:'Fixture Agent A',caseId:'AA991008',finalScore:90},{agent:'Fixture Agent B',caseId:'AA991007',finalScore:96}];
  const annotated=withAppealScoreState(directCases,buildAppealRequests(submissions));
  assert.equal(getAppealScoreHold(annotated).pendingCount,3);
  assert.equal(getAppealScoreHold(annotated.filter(item=>item.agent==='Fixture Agent B')),null,'same Case ID belonging to another agent remains visible');
  assert.deepEqual(directCases.map(item=>item.finalScore),[90,90,96]);
  const testOnly=withAppealScoreState([{agent:'Fixture Agent A',caseId:'AA991007',isTestCase:true}],buildAppealRequests([submissions[0]]));
  assert.equal(getAppealScoreHold(testOnly),null);
  const omittedTopic=review(submissions[0]);omittedTopic.details.topics.pop();
  assert.equal(buildAppealRequests([omittedTopic,submissions[0]])[0].status,'Pending','a missing topic in a partial review cannot finalize the appeal');
  console.log('PASS pending count is deduplicated per agent/case; another owner and Test Case never inherit a score hold; original scores remain intact');

  await render({});
  await waitFor(()=>row('Fixture Agent A')?.dataset.agentScoreState==='held','pending A row');
  assert.ok(row('Fixture Agent A').textContent.includes('รอผลอุทธรณ์'));
  assert.ok(!row('Fixture Agent A').textContent.includes('90.00'));
  assert.ok(row('Fixture Agent B').textContent.includes('96.00'));
  assert.ok(metric('Quality Score (Avg.)').textContent.includes('รอผลอุทธรณ์'));
  assert.ok(metric('Quality Score (Avg.)').textContent.includes('3 เคส'));
  assert.equal(metric('Cases Evaluated').dataset.appealScoreState,'ready');
  assert.equal(metric('Overall Grade').dataset.appealScoreState,'held');
  assert.equal(document.querySelector('[data-analytics-overview-v89]').dataset.appealScoreState,'held');
  assert.ok(!document.querySelector('svg[aria-label="Quality Score Trend"]'));
  console.log('PASS real Dashboard and Agent Performance hide pending scores/grade/KPI/incentive, retain counts and show other agents normally');

  const narrowWeek=fixture.published.find(item=>item.caseId==='AA991000').weekLabel;
  await render({agent:'Fixture Agent A',week:narrowWeek});
  await waitFor(()=>document.querySelector('[data-analytics-agent-incentive-v92]')?.textContent.includes('Agent Performance — Fixture Agent A'),'selected A');
  await waitFor(()=>metric('Cases Evaluated')?.textContent.includes('9/10'),'week excludes another pending case');
  assert.ok(metric('Quality Score (Avg.)').textContent.includes('3 เคส'),'pending appeal outside the visible week still holds the score');
  const search=document.querySelector('[data-search-evaluation-primary-v166] input');
  await act(async()=>{search.value='AA991000';Simulate.change(search);});
  assert.equal(metric('Quality Score (Avg.)').dataset.appealScoreState,'held','searching a non-appealed case cannot unhide summary score');
  for(const role of [{username:'agent-a',agentName:'Fixture Agent A',displayName:'Fixture Agent A',role:'Admin Live Chat'},{username:'senior',displayName:'Senior Fixture',role:'Senior'}]) {
    await act(async()=>root.unmount());root=createRoot(document.getElementById('root'));
    await render({agent:'Fixture Agent A',role,scoped:['Fixture Agent A']});
    await waitFor(()=>row('Fixture Agent A')?.dataset.agentScoreState==='held','role pending hold');
    assert.ok(!row('Fixture Agent B'));
  }
  console.log('PASS week filter, case search and QA/Admin/Senior views preserve the hold and existing agent permissions');

  await act(async()=>root.unmount());root=createRoot(document.getElementById('root'));
  const incomplete=review(submissions[0]);delete incomplete.details.topics[1].decision;
  fixture.events=[incomplete,...submissions];await render({agent:'Fixture Agent A',refresh:2});
  await waitFor(()=>row('Fixture Agent A')?.dataset.agentScoreState==='held','incomplete topic remains pending');
  assert.ok(metric('Quality Score (Avg.)').textContent.includes('3 เคส'));
  fixture.events=[review(submissions[0],'Partially Approved',2),review(submissions[1],'Rejected'),...submissions];
  await render({agent:'Fixture Agent A',refresh:3});
  await waitFor(()=>metric('Quality Score (Avg.)')?.textContent.includes('1 เคส'),'one appeal still pending');
  assert.equal(row('Fixture Agent A').dataset.agentScoreState,'held');
  fixture.events=[review(submissions[2]),...fixture.events];await render({agent:'Fixture Agent A',refresh:4});
  await waitFor(()=>row('Fixture Agent A')?.dataset.agentScoreState==='ready'&&row('Fixture Agent A').textContent.includes('90.80'),'final review unlocks latest score');
  assert.ok(metric('Quality Score (Avg.)').textContent.includes('90.80'));
  assert.ok(row('Fixture Agent A').textContent.includes('Passed'));
  assert.ok(document.querySelector('svg[aria-label="Quality Score Trend"]'));
  assert.ok(fixture.published.find(item=>item.caseId==='AA991007').finalScore===94);
  assert.ok(fixture.published.find(item=>item.caseId==='AA991008').finalScore===90);
  console.log('PASS incomplete topic and two-of-three completed reviews stay held; the final mixed Approved/Reject review immediately reveals correctly recalculated 90.80');

  const reset={event_type:'appeal_request_reset',created_at:'2026-10-07T03:00:00Z',details:{requestId:submissions[2].details.requestId}};
  fixture.events=[reset,...fixture.events];await render({agent:'Fixture Agent A',refresh:5});
  await waitFor(()=>row('Fixture Agent A')?.textContent.includes('90.40'),'reset restores original contribution');
  const resubmit={...submissions[2],id:'resubmission',created_at:'2026-10-07T04:00:00Z',details:{...submissions[2].details,requestId:'resubmitted-fixture'}};
  fixture.events=[resubmit,...fixture.events];await render({agent:'Fixture Agent A',refresh:6});
  await waitFor(()=>row('Fixture Agent A')?.dataset.agentScoreState==='held','resubmit hides score again');
  fixture.fail=true;await render({agent:'Fixture Agent A',refresh:7});
  await waitFor(()=>metric('Quality Score (Avg.)')?.textContent.includes('ตรวจสอบผลอุทธรณ์ไม่สำเร็จ'),'offline status does not expose score');
  assert.ok(!row('Fixture Agent A').textContent.includes('90.40'));
  const resubmittedReview=review(resubmit);resubmittedReview.created_at='2026-10-07T05:00:00Z';
  fixture.fail=false;fixture.events=[resubmittedReview,...fixture.events];await render({agent:'Fixture Agent A',refresh:8});
  await waitFor(()=>row('Fixture Agent A')?.dataset.agentScoreState==='ready'&&row('Fixture Agent A').textContent.includes('90.80'),'retry rechecks events and unlocks');
  console.log('PASS Reset, resubmission, failed appeal-status read and successful retry never substitute zero or expose an unconfirmed summary');
} finally {
  await act(async()=>root.unmount());
  globalThis.fetch=originalFetch;
  dom.window.close();
  delete globalThis.__pendingAppealFixture;
  await fs.rm(temp,{recursive:true,force:true});
}
