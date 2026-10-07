import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import * as XLSX from 'xlsx';

let rootDir = new URL('../', import.meta.url).pathname;
const temp = await fs.mkdtemp(path.join(rootDir, '.deleted-case-appeal-test-'));
if(process.argv.includes('--production')){
  const originalRoot=rootDir;
  rootDir=path.join(temp,'project');await fs.mkdir(rootDir);
  for(const directory of ['src','scripts','public','build','docs','api'])await fs.cp(path.join(originalRoot,directory),path.join(rootDir,directory),{recursive:true});
  for(const file of ['package.json','package-lock.json','vite.config.js','index.html'])await fs.copyFile(path.join(originalRoot,file),path.join(rootDir,file));
  await fs.symlink(path.join(originalRoot,'node_modules'),path.join(rootDir,'node_modules'));
  const pkg=JSON.parse(await fs.readFile(path.join(rootDir,'package.json'),'utf8'));
  execFileSync('bash',['-c',pkg.scripts.prebuild.replace(/^npm run guide:check && /,'')],{cwd:rootDir,stdio:'pipe',maxBuffer:5_000_000});
  for(const script of ['patch-case-pdf-page-numbers-v7.mjs','patch-evaluate-workspace-edit-tabs-v85.mjs','patch-process-firestore-nested-arrays-v72.mjs'])
    execFileSync(process.execPath,['scripts/'+script],{cwd:rootDir,stdio:'pipe',maxBuffer:5_000_000});
}
const dom = new JSDOM('<div id="root"></div>', {url:'https://qa.test',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','MutationObserver','Event','CustomEvent','MouseEvent','sessionStorage','localStorage']) globalThis[key]=dom.window[key];
if(!globalThis.navigator) Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
dom.window.HTMLElement.prototype.scrollIntoView=function(){};
const fixture={events:new Map(),cases:new Map(),queries:[],writes:[],offline:false};
globalThis.__deletedAppealFixture=fixture;
const topics=[{code:'1',label:'Process',score:30,max:35,wantsAppeal:true,appealReason:'Review process',comment:'Original'}];
const submit=(caseId,requestId,agent='Fixture Agent A')=>({event_type:'appeal_request_submitted',case_id:caseId,target_agent:agent,created_at:'2026-10-07T01:00:00Z',details:{requestId,agent,finalScore:90,grade:'A',auditDate:'2026-10-06',topics}});
const record=(id,agent='Fixture Agent A',date='2026-10-06')=>({id,case_id:id,agent_name:agent,target_display_name:agent,audit_date:date,evaluation_month_key:date.slice(0,7),submitted_at:date+'T01:00:00Z',final_score:90,inquiry:'ข้อมูลตัวอย่าง',topics:[...topics,{code:'2',label:'Answer',score:20,max:20},{code:'3',label:'Follow-up',score:20,max:25},{code:'4',label:'Communication',score:20,max:20}]});
const deleted=submit('AA990801','deleted-request');
const alive=submit('AA990802','alive-request');
fixture.events.set('deleted-submission',deleted);fixture.events.set('alive-submission',alive);
fixture.cases.set('AA990802',record('AA990802'));fixture.cases.set('AA990803',record('AA990803'));
const originalFetch=globalThis.fetch;
globalThis.fetch=async url=>{
  const fileName=decodeURIComponent(String(url).split('?')[0].replace(/^\//,''));
  try{return new Response(await fs.readFile(path.join(rootDir,'public',fileName)),{status:200});}catch{return new Response('',{status:404});}
};
const firestore=`
 export const collection=(_db,name)=>({name}),doc=(_db,name,id)=>({name,id});
 export const query=(source,...constraints)=>({source,constraints}),where=(field,op,value)=>({field,op,value});
 export const orderBy=(field,direction)=>({field,direction}),limit=value=>({limit:value}),startAfter=()=>({});
 export const getFirestore=()=>({}),serverTimestamp=()=>new Date().toISOString();
 export const onSnapshot=()=>()=>{},writeBatch=()=>{throw new Error('Unexpected fixture batch')};
 export const runTransaction=()=>{throw new Error('Unexpected fixture transaction')},deleteField=()=>({});
 export const deleteDoc=async ref=>globalThis.__deletedAppealFixture.cases.delete(ref.id);
 export const getDoc=async()=>({exists:()=>false,data:()=>({})});
 export const addDoc=async()=>{throw new Error('Unexpected fixture write')};
 export async function setDoc(ref,data){const f=globalThis.__deletedAppealFixture;if(ref.name!=='qa_appeal_events')throw new Error('Unexpected fixture write');f.writes.push({ref,data});f.events.set(ref.id,structuredClone(data));}
 const snapshot=rows=>({docs:rows.map(([id,data])=>({id,data:()=>structuredClone(data)}))});
 export async function getDocs(ref){const f=globalThis.__deletedAppealFixture;let rows=[...(ref.source.name==='qa_appeal_events'?f.events:ref.source.name==='qa_evaluations'?f.cases:new Map()).entries()];rows.sort((a,b)=>String(b[1].created_at||b[1].submitted_at).localeCompare(String(a[1].created_at||a[1].submitted_at)));const n=ref.constraints.find(item=>item.limit)?.limit;return snapshot(n?rows.slice(0,n):rows);}
 export async function getDocsFromServer(ref){const f=globalThis.__deletedAppealFixture;if(f.offline)throw new Error('server unavailable');const filter=ref.constraints.find(item=>item.field==='case_id');if(!filter||filter.op!=='in')throw new Error('Expected exact case query');f.queries.push(filter.value);if(filter.value.length>30)throw new Error('Too many case IDs');return snapshot([...f.cases.entries()].filter(([,data])=>filter.value.includes(data.case_id)));}
`;
const output=path.join(temp,'bundle.mjs');
await build({stdin:{contents:"import React,{act} from 'react';import {Simulate} from 'react-dom/test-utils';import {createRoot} from 'react-dom/client';import Review,{buildAppealRequests} from './src/AppealRequestsMockup';import Dashboard from './src/DashboardMockup';import {fetchAppealEvents,writeAppealEvent,clearAppealEventReadCache} from './src/appealStore';import {checkAppealSourceCases} from './src/appealCaseAvailability';import {withAppealScoreState,getAppealScoreHold} from './src/pendingAppealScore';export {React,act,Simulate,createRoot,Review,Dashboard,buildAppealRequests,fetchAppealEvents,writeAppealEvent,clearAppealEventReadCache,checkAppealSourceCases,withAppealScoreState,getAppealScoreHold};",resolveDir:rootDir,loader:'tsx'},outfile:output,bundle:true,platform:'node',format:'esm',jsx:'automatic',logLevel:'silent',external:['react','react-dom','react-dom/*','jspdf'],loader:{'.css':'empty'},define:{'import.meta.env':JSON.stringify({VITE_FIREBASE_API_KEY:'fixture',VITE_FIREBASE_PROJECT_ID:'fixture',VITE_FIREBASE_APP_ID:'fixture'})},banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'deleted-case-database-boundaries',setup(b){
  b.onResolve({filter:/^(firebase\/|\.\/firebaseClient$|\.\/PageHero$)|\?url$/},args=>({path:args.path,namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'js',contents:args.path==='firebase/firestore'?firestore:args.path==='firebase/app'?'export const initializeApp=()=>({}),getApps=()=>[];':args.path==='firebase/storage'?'export const getDownloadURL=()=>{},getStorage=()=>{},ref=()=>{},uploadBytes=()=>{},uploadBytesResumable=()=>{};':args.path==='./firebaseClient'?'export const firebaseDb={};':args.path==='./PageHero'?'export default function Hero(){return null;}':'export default "/worker.mjs";'}));
}}]});
const app=await import(pathToFileURL(output));
const {React,act,Simulate,createRoot}=app;
const events=()=>app.fetchAppealEvents(['appeal_request_submitted','appeal_request_reviewed','appeal_request_reset'],{limit:2000,forceRefresh:true});
const button=(text)=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===text);
const click=async node=>{assert.ok(node,'button exists');await act(async()=>Simulate.click(node));};
const settle=async()=>{for(let i=0;i<30;i++)await act(async()=>new Promise(resolve=>setTimeout(resolve,10)));};
let root;
try{
  const original=structuredClone([...fixture.events.entries()]);
  let checked=await events();let requests=app.buildAppealRequests(checked);
  assert.deepEqual(requests.map(item=>item.caseId),['AA990802']);
  assert.equal(checked.find(item=>item.case_id===deleted.case_id).source_case_unavailable,true);
  const caseRows=[{agent:'Fixture Agent A',caseId:'AA990803',finalScore:90}];
  assert.equal(app.getAppealScoreHold(app.withAppealScoreState(caseRows,requests)).pendingCount,1);
  const approved={event_type:'appeal_request_reviewed',case_id:alive.case_id,target_agent:alive.target_agent,created_at:'2026-10-07T02:00:00Z',details:{requestId:alive.details.requestId,decision:'Approved',topics:topics.map(topic=>({...topic,decision:'Approved',revisedScore:32,revisedComment:'Corrected'}))}};
  fixture.events.set('alive-review',approved);
  requests=app.buildAppealRequests(await events());
  assert.equal(app.getAppealScoreHold(app.withAppealScoreState(caseRows,requests)),null,'a deleted request cannot keep the score held');
  assert.deepEqual([...fixture.events.entries()].filter(([id])=>id!=='alive-review'),original,'read checks retain original history and evidence');
  assert.equal(fixture.writes.length,0);
  console.log('PASS deleted source disappears from requests and Pending score count; remaining live appeal still holds; no Reject/Reset/history writes');

  fixture.cases.set('same-id-other-owner',record(deleted.case_id,'Fixture Agent B'));
  assert.equal((await events()).find(item=>item.case_id===deleted.case_id).source_case_unavailable,true,'another owner cannot revive the deleted appeal');
  const older=submit('AA990804','older-request');fixture.cases.set('older-source',record(older.case_id,'Fixture Agent A','2026-06-01'));
  const combined=submit('AA990805, AA990806','combined-request');fixture.cases.set('combined-source',record(combined.case_id));
  assert.equal((await app.checkAppealSourceCases([combined]))[0].source_case_unavailable,false,'combined Call Log IDs still find the original evaluation');
  fixture.cases.delete('combined-source');
  for(let i=0;i<301;i++)fixture.cases.set('recent-'+i,record('AA98'+String(i).padStart(4,'0'),'Fixture Agent B'));
  assert.equal((await app.checkAppealSourceCases([older]))[0].source_case_unavailable,false,'older than latest 300 remains available');
  const workbook=XLSX.read(await fs.readFile(path.join(rootDir,'public/QA_RawData_January-February2026.xlsx')),{type:'buffer'});
  const rows=XLSX.utils.sheet_to_json(workbook.Sheets.Raw_Data||workbook.Sheets[workbook.SheetNames[0]],{header:1});
  const hi=rows.findIndex(row=>row.some(cell=>String(cell).trim().toLowerCase()==='case id')&&row.some(cell=>String(cell).trim().toLowerCase()==='agent name'));
  const headers=rows[hi].map(cell=>String(cell).trim().toLowerCase());const ci=headers.indexOf('case id'),ai=headers.indexOf('agent name');
  const legacy=rows.slice(hi+1).find(row=>row[ci]&&row[ai]);
  assert.equal((await app.checkAppealSourceCases([submit(String(legacy[ci]),'legacy-request',String(legacy[ai]))]))[0].source_case_unavailable,false,'static original cases remain available');
  const many=Array.from({length:65},(_,i)=>submit('AA97'+String(i).padStart(4,'0'),'batch-'+i));
  await app.checkAppealSourceCases(many);assert.ok(fixture.queries.every(batch=>batch.length<=30));
  console.log('PASS owner matching, original workbook cases and old cases outside latest-result window survive; server queries stay within 30 IDs');

  fixture.offline=true;await assert.rejects(events(),/server unavailable/);
  fixture.offline=false;assert.equal((await events()).find(item=>item.case_id===deleted.case_id).source_case_unavailable,true,'failed reads are evicted and retry succeeds');
  await assert.rejects(app.writeAppealEvent({username:'fixture-qa'},'appeal_request_reviewed',{...approved,case_id:deleted.case_id,target_agent:deleted.target_agent}),/เคสต้นทางถูกลบ/);
  await assert.rejects(app.writeAppealEvent({username:'fixture-agent'},'appeal_request_submitted',deleted),/เคสต้นทางถูกลบ/);
  assert.equal(fixture.writes.length,0);
  console.log('PASS unavailable server never becomes a deletion; deleted source blocks fresh submissions and reviews without writes');

  fixture.events.delete('alive-review');
  window.history.replaceState({},'',`?tab=appeal-requests&workspace=${encodeURIComponent('appeal-review:deleted-request|'+deleted.case_id)}`);
  root=createRoot(document.getElementById('root'));
  const user={username:'fixture-qa',displayName:'Fixture Reviewer',role:'Quality Assurance'};
  await act(async()=>root.render(React.createElement(app.Review,{currentUser:user,externalRequestId:'deleted-request'})));await settle();
  assert.ok(document.body.textContent.includes('เคสต้นทางถูกลบแล้ว'));
  assert.ok(document.body.textContent.includes('ไม่พักคะแนน'));
  assert.ok(!document.querySelector('table')?.textContent.includes(deleted.case_id));
  assert.equal(button('Save Review'),undefined);
  window.history.replaceState({},'','?tab=appeal-requests');
  await act(async()=>root.render(React.createElement(app.Review,{currentUser:user,externalRequestId:'alive-request'})));
  await settle();
  if(!button('Save Review')){
    const caseButton=[...document.querySelectorAll('button')].find(node=>node.textContent.includes(alive.case_id));
    if(caseButton)await click(caseButton);
    await settle();
  }
  if(button('Review Appeal')){await click(button('Review Appeal'));await settle();}
  const choice=[...document.querySelectorAll('[role="group"] button')].find(node=>node.textContent.trim().endsWith('Reject'));
  await click(choice);
  const textareas=[...document.querySelectorAll('textarea')];
  for(const input of textareas){await act(async()=>{input.value='Fixture review reason';Simulate.change(input);});}
  await click(button('Save Review'));assert.ok(button('ยืนยันบันทึก'));
  fixture.cases.delete(alive.case_id);
  await click(button('ยืนยันบันทึก'));await settle();
  assert.ok(document.querySelector('[role="alertdialog"]')?.textContent.includes('เคสต้นทางถูกลบแล้ว'));
  assert.equal(fixture.writes.length,0);
  console.log('PASS real Review shows deleted source on old workspace; deleted rows/actions vanish and deleting during Save confirmation prevents a stale decision');

  await act(async()=>root.unmount());root=createRoot(document.getElementById('root'));
  for(const key of [...fixture.cases.keys()])if(key.startsWith('recent-')||key==='older-source')fixture.cases.delete(key);
  fixture.cases.delete('same-id-other-owner');
  await act(async()=>root.render(React.createElement(app.Dashboard,{currentUser:user,dashboardSubTab:'overview',externalSelectedAgent:'Fixture Agent A',externalSelectedMonthKey:'2026-10',externalSelectedYear:'2026',canViewAgentsInOverview:true,dataRefreshKey:91})));await settle();
  const metric=document.querySelector('[data-dashboard-metric="Quality Score (Avg.)"]');
  assert.ok(metric?.textContent.includes('90.00'));assert.ok(!metric?.textContent.includes('รอผลอุทธรณ์'));
  fixture.cases.set(alive.case_id,record(alive.case_id));
  await act(async()=>root.render(React.createElement(app.Dashboard,{currentUser:user,dashboardSubTab:'overview',externalSelectedAgent:'Fixture Agent A',externalSelectedMonthKey:'2026-10',externalSelectedYear:'2026',canViewAgentsInOverview:true,dataRefreshKey:92})));await settle();
  assert.ok(document.querySelector('[data-dashboard-metric="Quality Score (Avg.)"]')?.textContent.includes('รอผลอุทธรณ์'));
  assert.equal(await app.writeAppealEvent({username:'fixture-qa'},'appeal_request_reviewed',approved),true);
  assert.equal(fixture.writes.length,1,'the live source still permits a normal review');
  assert.ok(!Object.hasOwn(fixture.writes[0].data,'source_case_unavailable'),'view metadata never changes persisted history');
  console.log('PASS real Dashboard displays score after orphan removal and holds again if the actual source case returns with an active appeal');
}finally{
  try{if(root)await act(async()=>root.unmount());}catch{}
  globalThis.fetch=originalFetch;dom.window.close();delete globalThis.__deletedAppealFixture;await fs.rm(temp,{recursive:true,force:true});
}
