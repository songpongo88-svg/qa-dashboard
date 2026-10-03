import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import ts from 'typescript';
import {JSDOM} from 'jsdom';
import {dashboardResetPreservesEvaluationPatch} from '../build/dashboardResetPreservesEvaluationPatch.js';

const rootDir = new URL('../', import.meta.url).pathname;
const temp = await fs.mkdtemp(path.join(rootDir, '.case-navigation-test-'));
const dom = new JSDOM('<div id="root"></div>', {url:'https://qa.test', pretendToBeVisual:true});
for (const key of ['window','document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','Event','CustomEvent','MouseEvent','MutationObserver','sessionStorage','localStorage']) globalThis[key] = dom.window[key];
if (!globalThis.navigator) Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator, configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
dom.window.HTMLElement.prototype.scrollIntoView=function(){};
dom.window.scrollTo=function(){};
const browserErrors=[];dom.virtualConsole.on('jsdomError',error=>browserErrors.push(error.message));
const fixture={read:async()=>[],profiles:[],route:null};
globalThis.__caseNavigationFixture=fixture;
function replaceFunction(source,name,body) {
  const ast=ts.createSourceFile('test.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
  assert.ok(node?.body,name);
  return source.slice(0,node.body.pos)+' '+body+source.slice(node.body.end);
}
const appSource=await fs.readFile(path.join(rootDir,'src/App.tsx'),'utf8');
const appAst=ts.createSourceFile('App.tsx',appSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function findNode(predicate) {
  let result;
  function visit(node){if(result)return;if(predicate(node)){result=node;return;}ts.forEachChild(node,visit);}
  visit(appAst);assert.ok(result,'App wiring exists');return result;
}
const appHandlers={};
for(const [name,tag,attr] of [['agent','SummaryMockup','onAgentPerformanceCaseSelect'],['open','DashboardMockup','onOpenCaseDetail']]){
  const tagNode=findNode(node=>(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node))&&node.tagName.getText(appAst)===tag&&node.attributes.properties.some(p=>p.name?.getText(appAst)===attr));
  appHandlers[name]=tagNode.attributes.properties.find(p=>p.name?.getText(appAst)===attr).initializer.expression.getText(appAst);
}
for(const name of ['resetDashboardCaseFilters','activateWorkspaceTab']){
  const declaration=findNode(node=>ts.isVariableDeclaration(node)&&node.name.getText(appAst)===name);
  appHandlers[name]=declaration.initializer.arguments[0].getText(appAst);
}
const helperNames=['buildCaseWorkspaceKey','isCaseWorkspaceTabKey','parseCaseWorkspaceKey',
  ...['isEditWorkspaceTabKey','parseEditWorkspaceKey','isAppealReviewWorkspaceTabKey','parseAppealReviewWorkspaceKey'].filter(name=>appAst.statements.some(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name))];
for(const name of helperNames)appHandlers[name]=findNode(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name).getText(appAst);
function bindActual(source,bindings={}) {
  const compiled=ts.transpileModule('return ('+source+');',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  return new Function(...Object.keys(bindings),compiled)(...Object.values(bindings));
}
const workspaceHelpers=new Function(ts.transpileModule(helperNames.map(name=>appHandlers[name]).join('\n')+'\nreturn {'+helperNames.join(',')+'};',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)();
// Apply the actual production source adapter in memory; never mutate the checkout.
const productionSources=new Map(await Promise.all(['src/App.tsx','src/DashboardMockup.tsx','src/SummaryMockup.tsx'].map(async file=>[file,await fs.readFile(path.join(rootDir,file),'utf8')])));
const adapter=await fs.readFile(path.join(rootDir,'scripts/patch-analytics-dashboard-case-source-v24.mjs'),'utf8');
new Function('fs',adapter.replace(/^import fs from .*;\s*$/m,''))({readFileSync:file=>productionSources.get(file),writeFileSync:(file,source)=>productionSources.set(file,source)});
const bundle=await build({stdin:{contents:"import React,{act} from 'react';import {Simulate} from 'react-dom/test-utils';import {createRoot} from 'react-dom/client';import Dashboard from './src/DashboardMockup';import Summary from './src/SummaryMockup';export {React,act,Simulate,createRoot,Dashboard,Summary};",resolveDir:rootDir,loader:'tsx'},bundle:true,jsx:'automatic',define:{'import.meta.env':'{}'},platform:'node',format:'esm',write:false,logLevel:'silent',loader:{'.css':'empty'},external:['react','react-dom','react-dom/*','jspdf'],banner:{js:"import {createRequire as testRequire} from 'node:module';const require=testRequire(import.meta.url);"},plugins:[{name:'isolated-case-navigation',setup(b){
  b.onLoad({filter:/\/SummaryMockup\.tsx$/},()=>({loader:'tsx',contents:productionSources.get('src/SummaryMockup.tsx')}));
  b.onLoad({filter:/\/evaluationStore\.ts$/},async args=>({loader:'ts',contents:replaceFunction(await fs.readFile(args.path,'utf8'),'fetchStoredEvaluations','{ return globalThis.__caseNavigationFixture.read(); }')}));
  b.onLoad({filter:/\/appealStore\.ts$/},async args=>({loader:'ts',contents:replaceFunction(await fs.readFile(args.path,'utf8'),'fetchAppealEvents','{ return []; }')}));
  b.onLoad({filter:/\/userRoleStore\.ts$/},async args=>{let source=await fs.readFile(args.path,'utf8');source=replaceFunction(source,'fetchStoredRolePermissions','{ return []; }');source=replaceFunction(source,'fetchStoredUserProfiles','{ return globalThis.__caseNavigationFixture.profiles; }');return{loader:'ts',contents:source};});
  b.onResolve({filter:/^\.\/PageHero$/},()=>({path:'hero',namespace:'fixture'}));
  b.onResolve({filter:/\?url$/},()=>({path:'asset',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='asset'?'export default "/test-worker.mjs";':'export default function Hero(){return null;}',loader:'js'}));
}}]});
const bundlePath=path.join(temp,'test.mjs');await fs.writeFile(bundlePath,bundle.outputFiles[0].text);
const {React,act,Simulate,createRoot,Dashboard,Summary}=await import(pathToFileURL(bundlePath));
const originalFetch=globalThis.fetch;
globalThis.fetch=async url=>{
  const fileName=decodeURIComponent(String(url).split('?')[0].replace(/^\//,''));
  try{return new Response(await fs.readFile(path.join(rootDir,'public',fileName)),{status:200});}catch{return new Response('',{status:404});}
};
const sample=(id,agent='Agent A',month='2026-09')=>({id:id+'-'+agent,caseId:id,agentName:agent,targetDisplayName:agent,auditDate:month+'-15',auditTimestamp:month+'-20T12:30:45Z',submittedAt:month+'-20T12:30:45Z',evaluationMonthKey:month,finalScore:90,inquiry:'ข้อมูลทดสอบ',topics:[{code:'1',score:30,max:30},{code:'2',score:20,max:20},{code:'3',score:20,max:25},{code:'4',score:20,max:25}],evidenceUrls:[]});
fixture.read=async()=>[sample('AA900001'),sample('AA900002'),sample('AA900003','Agent B')];
const flush=()=>new Promise(r=>setTimeout(r,0));
const settle=async()=>{for(let n=0;n<35;n++)await act(async()=>{await new Promise(r=>setTimeout(r,10));});};
const table=()=>document.querySelector('[data-unified-case-explorer-v160]')?.textContent||'';
const search=()=>document.querySelector('[data-search-evaluation-primary-v166] input');
const button=(text,scope=document)=>[...scope.querySelectorAll('button')].find(node=>node.textContent.trim()===text);
const click=async node=>{assert.ok(node,'button exists');await act(async()=>{Simulate.click(node);await flush();});await settle();};
const typeSearch=async value=>{assert.ok(search(),'editable search exists');await act(async()=>{search().value=value;Simulate.change(search());await flush();});await act(async()=>{await new Promise(r=>setTimeout(r,400));});await settle();};
const qaUser={username:'qa',displayName:'QA Reviewer',role:'Quality Assurance'};
let root=createRoot(document.getElementById('root'));
let caseScope,nonce;
function Harness(){
  const [agent,setAgent]=React.useState('Agent A');
  const [summaryAgent,setSummaryAgent]=React.useState('');
  const [month,setMonth]=React.useState('2026-09');
  const [week,setWeek]=React.useState('all');
  const [year,setYear]=React.useState('2026');
  const [targetId,setTargetId]=React.useState('');
  const [targetAgent,setTargetAgent]=React.useState('');
  const [subTab,setSubTab]=React.useState('overview');
  const [workspace,setWorkspace]=React.useState('dashboard');
  const [resetKey,setResetKey]=React.useState(0);
  const [effectiveCases,setEffectiveCases]=React.useState(null);
  caseScope={agent,month,week,year};nonce=resetKey;
  const publish=React.useCallback(rows=>setEffectiveCases(rows),[]);
  const resetCases=bindActual(appHandlers.resetDashboardCaseFilters,{setCaseFilterResetKey:setResetKey});
  const selectAgent=bindActual(appHandlers.agent,{setDashboardSummarySelectedAgent:setSummaryAgent,setCaseSelectedAgent:setAgent,resetDashboardCaseFilters:resetCases});
  const navigate=(tab,options={})=>{
    fixture.route=options;setWorkspace(options.workspaceKey||'dashboard');
    const id=options.params?.caseId||'';setTargetId(id);setSubTab(id?'case-detail':'overview');
  };
  const openCase=bindActual(appHandlers.open,{...workspaceHelpers,setDashboardSubTab:setSubTab,setSelectedDashboardCaseId:setTargetId,setSelectedAgentGlobal:setTargetAgent,setCaseSelectedAgent:setAgent,navigateToTab:navigate,logUsageEvent:()=>{},currentUser:qaUser});
  const activate=bindActual(appHandlers.activateWorkspaceTab,{...workspaceHelpers,setDashboardSubTab:setSubTab,setSelectedDashboardCaseId:setTargetId,setSelectedAgentGlobal:setTargetAgent,setCaseSelectedAgent:setAgent,navigateToTab:navigate});
  const summary=React.createElement(Summary,{embedded:true,currentUser:qaUser,externalEffectiveCases:effectiveCases,externalSelectedAgent:summaryAgent,externalSelectedMonth:month,externalSelectedWeek:week,canViewAllAgents:true,canViewAllTeams:true,onAgentPerformanceCaseSelect:selectAgent,onSelectedAgentChange:value=>{setSummaryAgent(value==='all'?'':value);setAgent(value==='all'?'':value);resetCases();},onResetCaseFilters:resetCases,onSelectedMonthChange:setMonth,onSelectedWeekChange:setWeek,onSelectedYearChange:setYear});
  return React.createElement(React.Fragment,null,
    React.createElement('button',{onClick:()=>activate('dashboard')},'กลับ Dashboard'),
    React.createElement(Dashboard,{currentUser:qaUser,dashboardSubTab:subTab,caseDetailWorkspaceMode:workspace!=='dashboard',externalSelectedAgent:agent,externalSelectedMonthKey:month,externalSelectedWeek:week,externalSelectedYear:year,externalSelectedCaseId:targetId,externalSelectedCaseAgent:targetAgent,caseFilterResetKey:resetKey,canViewAgentsInOverview:true,canViewAnalytics:true,analyticsContent:summary,dataRefreshKey:41,onSelectedAgentChange:setAgent,onEffectiveCasesChange:publish,onOpenCaseDetail:openCase,onCloseCaseDetail:()=>activate('dashboard')}));
}
try{
  const plugin=dashboardResetPreservesEvaluationPatch();
  for(const file of ['src/DashboardMockup.tsx','src/SummaryMockup.tsx']){
    const source=await fs.readFile(path.join(rootDir,file),'utf8');
    assert.equal(plugin.transform(source,path.join(rootDir,file)),null,'legacy build adapter must preserve current case navigation');
  }
  await act(async()=>{root.render(React.createElement(Harness));await flush();});await settle();await settle();
  assert.ok(table().includes('AA900001'));assert.ok(table().includes('AA900002'));
  const agentRow=()=>[...document.querySelectorAll('[data-analytics-agent-incentive-v92] tbody tr')].find(row=>row.querySelector('button')?.textContent.includes('Agent A'));
  assert.ok(agentRow(),'actual Agent Performance table is rendered: '+JSON.stringify({rows:[...document.querySelectorAll('[data-analytics-agent-incentive-v92] tbody tr')].map(row=>row.textContent.slice(0,120)),summary:document.querySelector('[data-analytics-embedded-v162]')?.textContent.slice(0,1500)}));
  await typeSearch('AA900003');assert.equal(search().value,'AA900003');assert.ok(table().includes('AA900003'));
  const beforeNonce=nonce;
  await click(button('View Details',agentRow()));
  assert.ok(nonce>beforeNonce,'actual App callback signals a repeated selection of Agent A');
  assert.ok(document.querySelector('[data-analytics-agent-incentive-v92]')?.textContent.includes('Agent Performance — Agent A'),'Agent Performance shows the same active Agent as Dashboard KPI scope');
  assert.ok(button('View All Agents',document.querySelector('[data-analytics-agent-incentive-v92]')),'individual Agent view exposes a direct return to All Agents');
  assert.equal(search().value,'');assert.ok(table().includes('AA900001'));assert.ok(table().includes('AA900002'));assert.ok(!table().includes('AA900003'));
  await typeSearch('AA900003');await click(agentRow().querySelector('button'));
  assert.equal(search().value,'');assert.ok(table().includes('AA900002'),'Agent name also clears the old case filter');
  const originalScope={...caseScope};
  const teamBefore=sessionStorage.getItem('qa_analytics_team_v134');
  await typeSearch('AA900001');await click(button('Reset',document.querySelector('[data-search-evaluation-primary-v166]')));
  assert.equal(search().value,'');assert.deepEqual(caseScope,originalScope);assert.equal(sessionStorage.getItem('qa_analytics_team_v134'),teamBefore);
  assert.ok(table().includes('Gen All Case PDF (2)'));assert.ok(!browserErrors.some(error=>/navigation/i.test(error)),'Reset must not reload');
  console.log('PASS real Reset, View Details and Agent name keep the selected period and clear stale filters even for repeated Agent clicks');

  await click([...document.querySelectorAll('[data-unified-case-explorer-v160] [role="button"]')].find(node=>node.textContent.includes('AA900001')));
  await click(button('Open Full Case Detail'));
  assert.ok(document.querySelector('[data-case-detail-workspace-v54]')?.textContent.includes('AA900001'),'actual detail opens');
  assert.deepEqual(caseScope,originalScope,'opening a case must not change Dashboard filters');
  await click(button('กลับ Dashboard'));assert.equal(search().value,'');assert.ok(table().includes('AA900002'));
  await typeSearch('AA900002');assert.equal(search().value,'AA900002','the search remains editable after returning');
  await click(button('Reset',document.querySelector('[data-search-evaluation-primary-v166]')));
  console.log('PASS opening and returning from Case Detail preserves Dashboard scope and leaves search editable');

  await act(async()=>root.unmount());root=createRoot(document.getElementById('root'));
  const detailProps={currentUser:qaUser,dashboardSubTab:'case-detail',caseDetailWorkspaceMode:true,externalSelectedMonthKey:'2026-08',externalSelectedYear:'2026',externalSelectedAgent:'Agent B',externalSelectedCaseId:'AA900001',externalSelectedCaseAgent:'Agent A',canViewAgentsInOverview:true,dataRefreshKey:41};
  const renderDetail=async extra=>{await act(async()=>root.render(React.createElement(Dashboard,{...detailProps,...extra})));await settle();};
  await renderDetail({});
  assert.ok(document.querySelector('[data-case-detail-workspace-v54]')?.textContent.includes('AA900001'),'detail target is independent of selected Month and Agent');
  await renderDetail({externalSelectedCaseId:'UNKNOWN'});
  assert.ok(document.body.textContent.includes('ไม่พบเคสนี้ภายใต้สิทธิ์'),'unknown case stops showing an endless loader');
  await renderDetail({currentUser:{username:'a',displayName:'Agent A',agentName:'Agent A',role:'Admin Live Chat'},roleScopedAgentNames:['Agent A'],canViewAgentsInOverview:false,externalSelectedCaseId:'AA900003',externalSelectedCaseAgent:'Agent B'});
  assert.ok(document.body.textContent.includes('ไม่พบเคสนี้ภายใต้สิทธิ์'),'detail lookup respects Agent scope');
  assert.ok(!document.querySelector('[data-case-detail-workspace-v54]')?.textContent.includes('ข้อมูลทดสอบ'),'unauthorized detail contents stay hidden');
  await renderDetail({currentUser:{username:'senior',displayName:'Team Lead',role:'Senior'},roleScopedAgentNames:['Agent A'],externalSelectedCaseId:'AA900003',externalSelectedCaseAgent:'Agent B'});
  assert.ok(document.body.textContent.includes('ไม่พบเคสนี้ภายใต้สิทธิ์'),'Senior detail lookup stays inside the assigned team');
  fixture.read=async()=>[sample('AA900004','Agent A'),sample('AA900004','Agent B')];
  await renderDetail({dataRefreshKey:42,externalSelectedCaseId:'AA900004',externalSelectedCaseAgent:'Agent B'});
  const sameIdDetail=document.querySelector('[data-case-detail-workspace-v54]')?.textContent||'';
  assert.ok(sameIdDetail.includes('Agent B'));assert.ok(!sameIdDetail.includes('Agent A'),'same Case ID resolves using the link owner');
  console.log('PASS shared/detail links work outside active filters while unauthorized and unknown targets remain blocked');

  await act(async()=>root.unmount());root=createRoot(document.getElementById('root'));
  const nowForMonthDefault=new Date();
  const currentMonthKey=`${nowForMonthDefault.getFullYear()}-${String(nowForMonthDefault.getMonth()+1).padStart(2,'0')}`;
  const previousMonthDate=new Date(nowForMonthDefault.getFullYear(),nowForMonthDefault.getMonth()-1,1);
  const previousMonthKey=`${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth()+1).padStart(2,'0')}`;
  const currentMonthLabel=new Date(nowForMonthDefault.getFullYear(),nowForMonthDefault.getMonth(),1).toLocaleString('en-US',{month:'long',year:'numeric'});
  fixture.read=async()=>[sample('AA900006','Agent A',previousMonthKey)];
  await act(async()=>{root.render(React.createElement(Summary,{currentUser:qaUser,externalSelectedMonth:currentMonthKey,externalSelectedWeek:'all',canViewAllAgents:true,canViewAllTeams:true,dataRefreshKey:99}));await flush();});await settle();await settle();
  const monthOptionLabels=[...document.querySelectorAll('option')].map(node=>node.textContent.trim());
  assert.ok(monthOptionLabels.includes(currentMonthLabel),'current month remains selectable even when it has zero evaluated cases: '+JSON.stringify(monthOptionLabels));
  assert.ok(document.body.textContent.includes(currentMonthLabel),'current month remains the active monthly view instead of falling back to the latest month with cases');
  console.log('PASS current calendar month remains visible and active with zero evaluated cases');
}finally{
  try{await act(async()=>root.unmount());}catch{}
  globalThis.fetch=originalFetch;dom.window.close();await fs.rm(temp,{recursive:true,force:true});delete globalThis.__caseNavigationFixture;
}
