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
const fixture={events:new Map(),cases:new Map(),queries:[],writes:[],evaluationWrites:[],transactionReads:[],offline:false,writeDenied:false};
globalThis.__deletedAppealFixture=fixture;
const topics=[{code:'1',label:'Process',score:30,max:35,wantsAppeal:true,appealReason:'Review process',comment:'Original'}];
const submit=(caseId,requestId,agent='Fixture Agent A')=>({event_type:'appeal_request_submitted',case_id:caseId,target_agent:agent,created_at:'2026-10-07T01:00:00Z',details:{requestId,agent,finalScore:90,grade:'A',auditDate:'2026-10-06',topics}});
const record=(id,agent='Fixture Agent A',date='2026-10-06')=>({id,case_id:id,agent_name:agent,target_display_name:agent,audit_date:date,evaluation_month_key:date.slice(0,7),submitted_at:date+'T01:00:00Z',final_score:90,inquiry:'ข้อมูลตัวอย่าง',topics:[...topics,{code:'2',label:'Answer',score:20,max:20},{code:'3',label:'Follow-up',score:20,max:25},{code:'4',label:'Communication',score:20,max:20}]});
const deleted=submit('AA990801','deleted-request');
const alive=submit('AA990802','alive-request');
const deletedSourceId='AA990801-1791003944985';
const deletedSource={...record(deleted.case_id),id:deletedSourceId,evaluation_key:deletedSourceId,evidence_urls:['https://fixture.test/evidence.png'],call_logs:[{id:'call-1',recordingUrl:'https://fixture.test/one.mp3'},{id:'call-2',recordingUrl:'https://fixture.test/two.mp3'}]};
fixture.cases.set(deletedSourceId,structuredClone(deletedSource));
const deletedMarkersKey='qa-dashboard:create-evaluation:deleted-ids:v2';
localStorage.setItem(deletedMarkersKey,JSON.stringify([deletedSourceId,'case:'+deleted.case_id]));
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
 export const deleteField=()=>({});
 export async function runTransaction(_db,callback){const f=globalThis.__deletedAppealFixture;if(f.offline)throw new Error('server unavailable');const updates=[];const result=await callback({get:async ref=>{f.transactionReads.push(ref.id);const value=f.cases.get(ref.id);return{exists:()=>Boolean(value),data:()=>structuredClone(value)};},update:(ref,data)=>updates.push({ref,data})});if(f.writeDenied&&updates.length)throw new Error('permission-denied');for(const update of updates){if(update.ref.name!=='qa_evaluations'||Object.keys(update.data).some(key=>!['deleted_at','deletion_source','updated_at'].includes(key)))throw new Error('Unexpected recovery write');f.evaluationWrites.push(update);f.cases.set(update.ref.id,{...f.cases.get(update.ref.id),...structuredClone(update.data)});}return result;}
 export const deleteDoc=async()=>{throw new Error('History must not be physically deleted')};
 export const getDoc=async()=>({exists:()=>false,data:()=>({})});
 export const addDoc=async()=>{throw new Error('Unexpected fixture write')};
 export async function setDoc(ref,data,options){const f=globalThis.__deletedAppealFixture;if(f.offline||f.writeDenied)throw new Error('server unavailable');if(ref.name==='qa_evaluations'){f.evaluationWrites.push({ref,data});f.cases.set(ref.id,{...(options?.merge?f.cases.get(ref.id):{}),...structuredClone(data)});return;}if(ref.name!=='qa_appeal_events')throw new Error('Unexpected fixture write');f.writes.push({ref,data});f.events.set(ref.id,structuredClone(data));}
 const snapshot=rows=>({docs:rows.map(([id,data])=>({id,data:()=>structuredClone(data)}))});
 export async function getDocs(ref){const f=globalThis.__deletedAppealFixture;let rows=[...(ref.source.name==='qa_appeal_events'?f.events:ref.source.name==='qa_evaluations'?f.cases:new Map()).entries()];rows.sort((a,b)=>String(b[1].created_at||b[1].submitted_at).localeCompare(String(a[1].created_at||a[1].submitted_at)));const n=ref.constraints.find(item=>item.limit)?.limit;return snapshot(n?rows.slice(0,n):rows);}
 export async function getDocsFromServer(ref){const f=globalThis.__deletedAppealFixture;if(f.offline)throw new Error('server unavailable');const filter=ref.constraints.find(item=>item.field==='case_id');if(!filter||filter.op!=='in')throw new Error('Expected exact case query');f.queries.push(filter.value);if(filter.value.length>30)throw new Error('Too many case IDs');return snapshot([...f.cases.entries()].filter(([,data])=>filter.value.includes(data.case_id)));}
`;
const output=path.join(temp,'bundle.mjs');
await build({stdin:{contents:"import React,{act} from 'react';import {Simulate} from 'react-dom/test-utils';import {createRoot} from 'react-dom/client';import Review,{buildAppealRequests} from './src/AppealRequestsMockup';import Dashboard from './src/DashboardMockup';import {fetchAppealEvents,writeAppealEvent,clearAppealEventReadCache} from './src/appealStore';import {checkAppealSourceCases} from './src/appealCaseAvailability';import {withAppealScoreState,getAppealScoreHold} from './src/pendingAppealScore';import {deleteStoredEvaluation,fetchStoredEvaluations,fetchStoredEvaluationsForCases,reconcileDeletedEvaluations,invalidateStoredEvaluationCache,upsertStoredEvaluation} from './src/evaluationStore';import {useDeletedEvaluationRecovery} from './src/useDeletedEvaluationRecovery';export {React,act,Simulate,createRoot,Review,Dashboard,buildAppealRequests,fetchAppealEvents,writeAppealEvent,clearAppealEventReadCache,checkAppealSourceCases,withAppealScoreState,getAppealScoreHold,deleteStoredEvaluation,fetchStoredEvaluations,fetchStoredEvaluationsForCases,reconcileDeletedEvaluations,invalidateStoredEvaluationCache,upsertStoredEvaluation,useDeletedEvaluationRecovery};",resolveDir:rootDir,loader:'tsx'},outfile:output,bundle:true,platform:'node',format:'esm',jsx:'automatic',logLevel:'silent',external:['react','react-dom','react-dom/*','jspdf'],loader:{'.css':'empty'},define:{'import.meta.env':JSON.stringify({VITE_FIREBASE_API_KEY:'fixture',VITE_FIREBASE_PROJECT_ID:'fixture',VITE_FIREBASE_APP_ID:'fixture'})},banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'deleted-case-database-boundaries',setup(b){
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
  assert.equal((await events()).find(item=>item.case_id===deleted.case_id).source_case_unavailable,false,'reproduce production: the old source still exists centrally despite browser delete markers');
  fixture.writeDenied=true;
  assert.deepEqual(await app.reconcileDeletedEvaluations(),{changed:0,pending:1});
  assert.equal((await events()).find(item=>item.case_id===deleted.case_id).source_case_unavailable,false,'failed central deletion cannot remove Pending');
  assert.ok(JSON.parse(localStorage.getItem(deletedMarkersKey)).includes(deletedSourceId),'failed confirmation remains retryable');
  let recovered=0;
  const onRecovered=()=>{recovered++;app.clearAppealEventReadCache();window.dispatchEvent(new CustomEvent('qa-dashboard-data-refresh'));};
  function Recovery({enabled}){const state=app.useDeletedEvaluationRecovery(enabled,onRecovered);return React.createElement('button',{onClick:state.retry},state.error||'Recovery ready');}
  root=createRoot(document.getElementById('root'));
  await act(async()=>root.render(React.createElement(Recovery,{enabled:false})));await settle();
  assert.equal(fixture.evaluationWrites.length,0,'no recovery runs without the signed-in permission gate');
  await act(async()=>root.render(React.createElement(Recovery,{enabled:true})));await settle();
  assert.ok(document.body.textContent.includes('ยังยืนยันการลบเคสเดิมไม่สำเร็จ'));
  fixture.writeDenied=false;
  await click(document.querySelector('button'));await settle();
  assert.equal(recovered,1,'successful recovery refreshes all data exactly once');
  assert.equal(fixture.evaluationWrites.length,1);
  assert.deepEqual(fixture.cases.get(deletedSourceId),{...deletedSource,deleted_at:fixture.cases.get(deletedSourceId).deleted_at,deletion_source:'legacy_browser_delete',updated_at:fixture.cases.get(deletedSourceId).deleted_at},'only deletion metadata and change timestamp update; both audio files and evidence remain stored');
  assert.deepEqual(JSON.parse(localStorage.getItem(deletedMarkersKey)),[],'confirmed legacy markers are consumed');
  assert.equal(fixture.writes.length,0,'recovery never writes Appeal Approved/Reject/Reset');
  await act(async()=>root.unmount());root=undefined;
  console.log('PASS actual legacy failure reproduced: surviving central source, exact browser marker, permission gate, failed write + retry, one global refresh and preserved appeal/audio history');
  // Another browser may still have the source evaluation in both legacy history keys.
  for(const key of ['qa-dashboard:create-evaluation:history','qa-dashboard:create-evaluation:history:v2'])localStorage.setItem(key,JSON.stringify([deletedSource]));
  app.invalidateStoredEvaluationCache();
  assert.ok(!(await app.fetchStoredEvaluations(1000,{strict:true})).some(item=>item.id===deletedSourceId),'central deletion overrides stale backups on another browser');
  localStorage.removeItem('qa-dashboard:create-evaluation:history');localStorage.removeItem('qa-dashboard:create-evaluation:history:v2');
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

  await act(async()=>root.unmount());root=undefined;
  const freshId='AA990807-1791000000000';
  const fresh={...record('AA990807'),id:'legacy-row-id',evaluation_key:freshId,call_logs:deletedSource.call_logs};
  fixture.cases.set(freshId,structuredClone(fresh));
  const historyKeys=['qa-dashboard:create-evaluation:history','qa-dashboard:create-evaluation:history:v2'];
  for(const key of historyKeys)localStorage.setItem(key,JSON.stringify([{...fresh,id:freshId}]));
  const beforeMarkers=localStorage.getItem(deletedMarkersKey);
  fixture.offline=true;
  await assert.rejects(app.deleteStoredEvaluation(freshId,fresh.case_id),/ลบเคสไม่สำเร็จ ข้อมูลเดิมยังอยู่/);
  assert.equal(localStorage.getItem(deletedMarkersKey),beforeMarkers);
  for(const key of historyKeys)assert.equal(JSON.parse(localStorage.getItem(key)).length,1,'failed delete retains both local histories');
  assert.deepEqual(fixture.cases.get(freshId),fresh);
  fixture.offline=false;
  await assert.rejects(app.deleteStoredEvaluation('wrong-record-id',fresh.case_id),/ลบเคสไม่สำเร็จ/);
  assert.equal(localStorage.getItem(deletedMarkersKey),beforeMarkers,'an unmatched document cannot report a successful deletion');
  const active=(await app.fetchStoredEvaluationsForCases([fresh.case_id]))[0];
  assert.equal(active.id,freshId,'the actual Firestore document ID wins over a legacy stored ID');
  await app.deleteStoredEvaluation(active.id,active.caseId);
  for(const key of historyKeys)assert.deepEqual(JSON.parse(localStorage.getItem(key)),[],'successful delete removes both local history versions');
  assert.deepEqual(await app.fetchStoredEvaluationsForCases([fresh.case_id]),[]);
  assert.ok(fixture.cases.get(freshId).deleted_at,'central soft deletion is confirmed before local success');
  assert.deepEqual(fixture.cases.get(freshId).call_logs,fresh.call_logs);
  const writeCount=fixture.evaluationWrites.length;
  await app.deleteStoredEvaluation(active.id,active.caseId);assert.equal(fixture.evaluationWrites.length,writeCount,'repeated delete is idempotent');
  const replacementId='AA990807-1792000000000';
  fixture.cases.set(replacementId,{...fresh,id:replacementId,evaluation_key:replacementId});
  await app.reconcileDeletedEvaluations();
  assert.ok(!fixture.cases.get(replacementId).deleted_at,'replaying an exact old marker never deletes a newer evaluation with the same Case ID');
  assert.deepEqual((await app.fetchStoredEvaluationsForCases([fresh.case_id])).map(item=>item.id),[replacementId]);
  localStorage.setItem(deletedMarkersKey,JSON.stringify(['case:'+fresh.case_id]));
  assert.deepEqual(await app.reconcileDeletedEvaluations(),{changed:0,pending:0},'broad case-only markers are never replayed centrally');
  assert.ok(!fixture.cases.get(replacementId).deleted_at);
  localStorage.setItem(deletedMarkersKey,'[]');
  await app.upsertStoredEvaluation(active);
  assert.equal(fixture.cases.get(freshId).deleted_at,null,'an explicit evaluation save can restore archived data');
  assert.deepEqual(fixture.cases.get(freshId).call_logs,active.callLogs);
  assert.ok(JSON.parse(localStorage.getItem(historyKeys[1])).some(item=>item.id===freshId),'saving uses a defined local history key');
  for(const [id,data] of original)assert.deepEqual(fixture.events.get(id),data,'all original appeal records and evidence are retained throughout');
  console.log('PASS central-first delete retains local data on failure, clears both history keys on success, preserves audio, uses actual document ID, ignores broad markers/newer records and permits explicit restoration');

  const exportRows=[{id:'active',case_id:'AA990810'},{id:'deleted',case_id:'AA990811',deleted_at:'2026-10-07T07:00:00Z'},{id:'restored',case_id:'AA990812',deleted_at:null}];
  for(const script of ['cloud-sync-v13-graph.mjs','sync-v13-excel-data-only.mjs','sync-v13-rowdata.mjs']){
    const source=await fs.readFile(path.join(rootDir,'scripts',script),'utf8');
    const fn=source.match(/async function fetchEvaluations\(\) \{[\s\S]*?\n\}/)?.[0];assert.ok(fn,script+' exports evaluations');
    const bindings={fetchCollectionRows:async()=>exportRows,getApps:()=>[],initializeApp:()=>({}),firebaseConfig:{},getFirestore:()=>({}),getDocs:async()=>({docs:exportRows.map(row=>({id:row.id,data:()=>row}))}),query:()=>({}),collection:()=>({}),orderBy:()=>({}),limit:()=>({}),MAX_FETCH:1000,normalizeEvaluation:row=>({...row,caseId:row.case_id}),normalizeKey:String,normalizeCaseId:String};
    const rows=await Function(...Object.keys(bindings),fn+'; return fetchEvaluations();')(...Object.values(bindings));
    assert.deepEqual(rows.map(row=>row.id),['active','restored'],script+' must never re-export deleted evaluations');
  }
  const appSource=await fs.readFile(path.join(rootDir,'src/App.tsx'),'utf8');
  assert.match(appSource,/useDeletedEvaluationRecovery\(\s*Boolean\(currentUser && accessRulesReady && !sessionValidationPending && createEvaluationAllowed\),\s*refreshQaDashboardData/,'actual built App gates recovery by a valid signed-in session and resolved permission');
  assert.ok(appSource.includes('deletedEvaluationRecovery.retry'),'App exposes recovery retry after failure');
  console.log('PASS production App wires recovery after session/permission checks and all three workbook exporters exclude archived records while allowing restored evaluations');
}finally{
  try{if(root)await act(async()=>root.unmount());}catch{}
  globalThis.fetch=originalFetch;dom.window.close();delete globalThis.__deletedAppealFixture;await fs.rm(temp,{recursive:true,force:true});
}
