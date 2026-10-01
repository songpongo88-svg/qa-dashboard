import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const ActualDate=Date;let testNow='2026-09-30T12:00:00Z';globalThis.Date=class extends ActualDate { constructor(...args){super(...(args.length?args:[testNow]));} static now(){return new ActualDate(testNow).valueOf();} };
const rootDir = new URL('../', import.meta.url).pathname;
const fixture = { records: new Map(), evaluations: [], readError: false };
globalThis.__monthlyCoachingFixture = fixture;
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://coaching.test/' });
for (const key of ['window','document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','Event','MouseEvent','File','FileReader','sessionStorage','localStorage']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const temp = await fs.mkdtemp(path.join(rootDir, '.coaching-test-'));
const bundle = await build({ stdin: { contents: `import React, {act} from 'react'; import {Simulate} from 'react-dom/test-utils'; import {createRoot} from 'react-dom/client'; import Workspace from './src/MonthlyCoachingWorkspace'; export {React,act,Simulate,createRoot,Workspace}; export * from './src/monthlyCoachingModel'; export * from './src/coachingStore'; export * from './src/coachingAttachmentUpload';`, resolveDir: rootDir, loader: 'tsx' }, bundle: true, loader:{'.css':'empty'}, external: ['react', 'react-dom', 'react-dom/*'], platform: 'node', format: 'esm', write: false, banner: { js: "import { createRequire as testRequire } from 'node:module'; const require = testRequire(import.meta.url);" }, plugins: [{name:'test-services',setup(b){
  b.onResolve({filter:/^(firebase\/firestore|\.\/firebaseClient|\.\/coachingCanonicalStore|\.\/evaluationStore)$/},args=>({path:args.path,namespace:'test-service'}));
  b.onLoad({filter:/.*/,namespace:'test-service'},args=>({contents: args.path==='firebase/firestore' ? `const f=globalThis.__monthlyCoachingFixture; export const collection=(_,name)=>({name}); export const doc=(_,name,id)=>({name,id}); export const serverTimestamp=()=>0; export async function getDocs(){if(f.readError)throw new Error('offline');return {docs:[...f.records].map(([id,row])=>({id,data:()=>structuredClone(row)}))};} export async function setDoc(ref,row){f.records.set(ref.id,structuredClone(row));} export async function runTransaction(_,fn){const writes=[];const result=await fn({get:async ref=>({id:ref.id,exists:()=>f.records.has(ref.id),data:()=>structuredClone(f.records.get(ref.id))}),set:(ref,row)=>writes.push([ref.id,structuredClone(row)])});writes.forEach(([id,row])=>f.records.set(id,row));return result;}` : args.path==='./firebaseClient' ? `export const firebaseDb={};` : args.path==='./coachingCanonicalStore' ? `export const fetchCanonicalCoachingEvaluations=async()=>structuredClone(globalThis.__monthlyCoachingFixture.evaluations);` : `export const getStoredEvaluationMonthKey=row=>row.evaluationMonthKey;`, loader:'js'}));
}}] });
const bundlePath = path.join(temp,'test.mjs'); await fs.writeFile(bundlePath,bundle.outputFiles[0].text);
const m = await import(pathToFileURL(bundlePath));
const {React,act,Simulate,createRoot,Workspace} = m;
const accounts = [
  {username:'qa',displayName:'QA Reviewer',agentName:'QA Reviewer',role:'Quality Assurance'},
  {username:'lead-a',displayName:'Lead A',agentName:'Lead A',role:'Senior'},
  {username:'lead-ann',displayName:'Lead Ann',agentName:'Lead Ann',role:'Senior'},
  {username:'agent-a',displayName:'Agent A Full Name',agentName:'Agent A',role:'Admin Live Chat',teamLead:'Lead A',teamName:'Team A'},
  {username:'agent-b',displayName:'Agent B Full Name',agentName:'Agent B',role:'Admin Live Chat',teamLead:'Lead Ann',teamName:'Team B'},
  {username:'suspended',displayName:'Suspended',agentName:'Suspended',role:'Admin Live Chat',teamLead:'Lead A',status:'Suspended'},
];
const [qa,seniorA,seniorB,agentA,agentB]=accounts;
const month='2026-09';
fixture.evaluations=[{id:'a-1',caseId:'AA100',targetUsername:'agent-a',agentName:'Agent A',evaluationMonthKey:month,finalScore:80,criticalError:false,topics:[{code:'1',title:'Verify',score:20,max:30},{code:'2',title:'SLA',score:15,max:20}]},{id:'b-1',caseId:'BB100',targetUsername:'agent-b',agentName:'Agent B',evaluationMonthKey:month,finalScore:90,topics:[{code:'1',title:'Verify',score:30,max:30}]}];
const septemberRows=structuredClone(fixture.evaluations);
fixture.evaluations.push(...Array.from({length:8},(_,i)=>({...septemberRows[0],id:`legacy-${i}`,evaluationMonthKey:`2026-${String(i+1).padStart(2,'0')}`})));
accounts.push({username:'unevaluated',displayName:'No Results',agentName:'No Results',role:'Admin Live Chat',teamLead:'Lead A'});
const enabled={...agentA,username:'custom-role',agentName:'Custom',displayName:'Custom',role:'Support',qaEvaluationTarget:true};
const disabled={...agentA,username:'role-disabled',agentName:'Disabled Role',qaEvaluationTarget:false};
const allAccounts=[...accounts,enabled,disabled];
const noisy=[...fixture.evaluations,{...septemberRows[0],targetUsername:'custom-role'},{...septemberRows[0],targetUsername:'role-disabled'},{...septemberRows[0],targetUsername:'unevaluated',isTestCase:true},{...septemberRows[0],targetUsername:'unevaluated',evaluationType:'no_case_month'},{...septemberRows[0],targetUsername:'unevaluated',finalScore:NaN},{...septemberRows[0],targetUsername:'unknown'},{...septemberRows[0],evaluationMonthKey:'2026-10'},{...septemberRows[0],evaluationMonthKey:'2026-12'}];
const scoped=m.coachingEvaluationScope(allAccounts,qa,noisy,'2026-09');
assert.deepEqual(scoped.agents.map(a=>a.username),['agent-a','agent-b','custom-role']);
assert.deepEqual(scoped.months,Array.from({length:9},(_,i)=>`2026-${String(i+1).padStart(2,'0')}`));
assert.equal(scoped.rowsByAgent.get('agent-a').length,9);
assert.deepEqual(m.coachingEvaluationScope(allAccounts,seniorB,noisy,'2026-09').months,['2026-09']);
assert.equal(m.resolveCoachingMonth('2026-12',scoped.months,'2026-09'),'2026-09');
assert.equal(m.resolveCoachingMonth('2027-01',[],'2026-09'),'');
assert.equal(m.formFromRecord({mainIssues:'AUTO GENERATED CASE DESCRIPTION'}).summary,'');
assert.equal(m.manualCoachingSummary({qaSummary:'Manual note',mainIssues:'AUTO'}),'Manual note');
assert.equal(m.manualCoachingSummary({generalFeedback:'Manual legacy note',mainIssues:'AUTO'}),'Manual legacy note');
assert.equal(m.coachingEvaluationScope([...accounts,{...agentA,username:'duplicate-name'}],qa,[{...septemberRows[0],targetUsername:''}],'2026-09').agents.length,0,'ambiguous names excluded');
assert.deepEqual(m.visibleCoachingAgents(accounts,qa).map(a=>a.username),['agent-a','agent-b','unevaluated']);
assert.deepEqual(m.visibleCoachingAgents(accounts,seniorA).map(a=>a.username),['agent-a','unevaluated'],'partial Senior names must never grant another team');
assert.deepEqual(m.visibleCoachingAgents(accounts,seniorB).map(a=>a.username),['agent-b']);
assert.deepEqual(m.visibleCoachingAgents(accounts,{...agentA,role:'Quality Assurance'}),[]);
assert.deepEqual(m.visibleCoachingAgents(accounts.map(a=>a.username==='qa'?{...a,status:'Suspended'}:a),qa),[]);
assert.equal(m.belongsToAgent(agentA,'agent-b','Agent A'),false,'explicit IDs take precedence over matching names');
assert.notEqual(m.monthlyCoachingId('a.b',month),m.monthlyCoachingId('a_b',month));
assert.equal(m.coachingEndTime('23:30',60),'00:30 (+1 วัน)');
assert.equal(m.coachingAttachmentError({name:'note.exe',size:100}).length>0,true);
assert.equal(m.coachingAttachmentError({name:'note.pdf',size:100}),'');
let root;
const flush = () => new Promise(resolve=>setTimeout(resolve,0));
async function mount(user) { if(root) await act(async()=>root.unmount()); root=createRoot(document.getElementById('root')); await act(async()=>{root.render(React.createElement(Workspace,{currentUser:user,accounts}));await flush();}); }
const text = () => document.body.textContent;
const button = title => [...document.querySelectorAll('button')].find(e=>e.textContent.trim()===title);
async function click(element) { assert.ok(element,'button exists'); assert.equal(element.disabled,false,'button enabled'); await act(async()=>{Simulate.click(element);await flush();}); }
async function fill(element,value) { assert.ok(element,'field exists'); await act(async()=>{element.value=value;Simulate.change(element);await flush();}); }
const named = name => document.querySelector(`[aria-label="${name}"]`);
const field = (label,index=0) => [...document.querySelectorAll('label')].filter(e=>e.querySelector('input,select,textarea')&&e.textContent.trim().startsWith(label))[index]?.querySelector('input,select,textarea');
async function chooseAgent(name='Agent A Full Name') { const row=[...document.querySelectorAll('aside button')].find(e=>e.textContent.includes(name)); await click(row); }
async function tickTopic(topic) {const checkbox=[...document.querySelectorAll('label')].find(e=>e.textContent.startsWith(topic)&&e.querySelector('input[type=checkbox]')&&!e.querySelector('input').disabled)?.querySelector('input');assert.ok(checkbox);await act(async()=>{checkbox.checked=true;Simulate.change(checkbox);await flush();});}
try {
  sessionStorage.setItem('qa-dashboard:monthly-coaching:view:qa',JSON.stringify({periodVersion:2,month}));
  await mount(qa); await chooseAgent();
  assert.ok(!text().includes('No Results'));assert.deepEqual([...named('เดือน Coaching').options].map(o=>o.value),scoped.months);
  fixture.records.set('legacy-record',{id:'legacy-record',agentId:'agent-a',agent:'Agent A',monthKey:'2026-08',status:'Completed',mainIssues:'AUTO GENERATED CASE DESCRIPTION',updatedAt:'2026-08-31T00:00:00Z'});await click(button('โหลดข้อมูลล่าสุด'));assert.ok(!text().includes('AUTO GENERATED CASE DESCRIPTION'));
  await fill(named('QA Summary'),'QA summary retained across tabs'); await tickTopic('Verify'); await tickTopic('SLA');
  await fill(field('วันที่นัดหมาย'),'2026-09-28'); await fill(field('เวลาเริ่ม (24 ชั่วโมง)'),'14:00');
  await fill(named('Agenda 1'),'Review Verify'); await click(button('+ เพิ่ม Agenda')); await fill(named('Agenda 2'),'Review SLA');
  await mount(qa);
  assert.equal(named('QA Summary').value,'QA summary retained across tabs','unsaved text survives tab unmount and remount');
  assert.equal(named('Agenda 2').value,'Review SLA');
  await click(button('บันทึก Draft')); assert.equal(fixture.records.size,2);
  const id=m.monthlyCoachingId(agentA.username,month);
  assert.equal(fixture.records.get(id).qaSummary,'QA summary retained across tabs');
  await click(button('นัดหมาย')); await click(button('ส่งให้ Senior'));
  assert.equal(fixture.records.get(id).status,'Waiting Senior'); assert.equal(fixture.records.size,2,'one monthly record reused through transitions');
  sessionStorage.setItem('qa-dashboard:monthly-coaching:view:lead-a',JSON.stringify({periodVersion:2,month}));
  await mount(seniorA); assert.ok(!text().includes('Agent B Full Name')); await chooseAgent();
  assert.equal(named('QA Summary').readOnly,true); assert.equal(field('วันที่นัดหมาย').disabled,true);
  await fill(field('วันที่ Coaching จริง'),'2026-09-28');await fill(field('เวลาเริ่มจริง'),'14:00');await fill(field('เวลาสิ้นสุดจริง'),'15:00');
  await fill(named('Senior Final Note'),'Discussed both topics');await tickTopic('Verify');await tickTopic('SLA');
  await click(button('ส่ง Action Plan ให้ QA')); assert.equal(fixture.records.get(id).status,'Waiting Senior','missing plans cannot submit');
  for(let i=0;i<2;i++){await click(button('+ เพิ่ม Action Plan'));await fill(field('Action Plan',i),`Plan ${i+1}`);await fill(field('กำหนดส่ง',i),'2026-10-15');}
  await mount(seniorA); assert.equal(field('Action Plan',1).value,'Plan 2','Senior plan survives switching tabs');
  await click(button('ส่ง Action Plan ให้ QA')); assert.equal(fixture.records.get(id).status,'Action Plan Submitted');
  await mount(qa); await click(button('ส่งคืน Senior')); assert.equal(fixture.records.get(id).status,'Action Plan Submitted','return requires a review comment');
  await fill(named('QA Review Comment'),'Add measurable follow-up'); await click(button('ส่งคืน Senior')); assert.equal(fixture.records.get(id).status,'QA Reviewed');
  await mount(seniorA); assert.equal(named('QA Review Comment').value,'Add measurable follow-up');await click(button('ส่ง Action Plan ให้ QA'));
  await mount(qa); await click(button('รับแผน'));assert.equal(fixture.records.get(id).status,'Follow-up Next Month');
  const previous=structuredClone(fixture.records.get(id));
  testNow='2026-10-15T12:00:00Z';fixture.evaluations.push({...septemberRows[0],id:'october-1',evaluationMonthKey:'2026-10'});await click(button('โหลดข้อมูลล่าสุด'));await fill(named('เดือน Coaching'),'2026-10');assert.ok(text().includes('ประวัติการ Coaching ล่าสุด (September 2026)'));assert.ok(text().includes('Plan 1'));assert.equal(named('QA Summary').value,'');
  await fill(named('QA Summary'),'October new record');await click(button('บันทึก Draft'));assert.equal(fixture.records.size,3);assert.deepEqual(fixture.records.get(id),previous,'next month must not modify previous month');
  await click(button('ประวัติ Coaching'));assert.ok(text().includes('Plan 2'));assert.ok(text().includes('September 2026'));
  const latest = await m.fetchStoredCoachingRecords({allowCache:false});const old=latest.find(r=>r.id===id);
  await assert.rejects(()=>m.saveMonthlyCoachingRecord({...old,status:'Closed'},qa,accounts,'stale-version'),/ข้อมูลใหม่/);
  await assert.rejects(()=>m.saveMonthlyCoachingRecord({...old,status:'Coaching In Progress'},seniorB,accounts,old.updatedAt),/ไม่มีสิทธิ์/);
  const malicious={...old,qaSummary:'altered by senior',agentId:'agent-b',team:'Wrong Team',seniorId:'lead-ann',actions:[{id:'x',plan:'New plan'}]};
  const merged=m.mergeMonthlyCoachingSave(old,malicious,'Senior');assert.equal(merged.qaSummary,old.qaSummary);assert.equal(merged.agentId,'agent-a');assert.equal(merged.team,'Team A');assert.equal(merged.seniorId,'lead-a');
  fixture.readError=true;await assert.rejects(()=>m.fetchStoredCoachingRecords({allowCache:false}),/offline/);fixture.readError=false;
  assert.equal(m.currentCoachingMonth(new Date('2026-08-31T17:00:00Z')),'2026-09','Bangkok midnight uses the new Gregorian month');
  assert.equal(m.initialCoachingMonth({month:'2025-08'},month),month,'migrate the old cached year once');
  assert.equal(m.initialCoachingMonth({periodVersion:2,month:'2026-08'},month),'2026-08','keep intentional period selections');
  const beforeArchive=JSON.stringify([...fixture.records]);
  for (const legacyMonth of m.HISTORICAL_COACHING_MONTHS) {
    await fill(named('เดือน Coaching'),legacyMonth);
    await click(button('ข้อมูล Coaching'));
    assert.equal(named('QA Summary'),null,'historical period has no new workflow form');
    assert.equal(button('บันทึก Draft'),undefined);
    assert.ok([...document.querySelectorAll('aside button')].filter(e=>e.textContent.includes('Full Name')).every(e=>e.textContent.includes('Coaching แล้ว')));
    await mount(qa);assert.equal(named('เดือน Coaching').value,legacyMonth,'history selection survives tab navigation');
    assert.match(m.coachingSaveError(qa.role,null,{...old,monthKey:legacyMonth,status:'Draft'}),/กันยายน 2026/);
    await assert.rejects(()=>m.saveMonthlyCoachingRecord({...old,id:m.monthlyCoachingId(agentA.username,legacyMonth),monthKey:legacyMonth,status:'Draft'},qa,accounts,null),/กันยายน 2026/);
  }
  assert.equal(JSON.stringify([...fixture.records]),beforeArchive,'historical display must not rewrite stored coaching, scores or notes');
  assert.equal(m.isHistoricalCoachingMonth('2025-08'),false);
  assert.equal(m.isHistoricalCoachingMonth('2026-09'),false);
  await fill(field('สถานะ'),'Coaching แล้ว');assert.ok(text().includes('Agent A Full Name'));
  await click(button('เดือนปัจจุบัน'));assert.equal(named('เดือน Coaching').value,'2026-10');
  assert.deepEqual([...named('เดือน Coaching').options].map(o=>o.value),[...scoped.months,'2026-10']);
  await fill(named('เดือน Coaching'),'2026-09');assert.ok(named('QA Summary'));
  await mount(seniorA);await fill(named('เดือน Coaching'),'2026-08');assert.ok(!text().includes('Agent B Full Name'));assert.equal(named('QA Summary'),null);
  await mount(seniorB);assert.deepEqual([...named('เดือน Coaching').options].map(o=>o.value),['2026-09']);assert.ok(!text().includes('Agent A Full Name'));
  console.log('PASS evaluated-role scope, empty/test/no-case/future exclusion, exact identity, scoped month options, manual-only QA text');
  console.log('PASS January–August 2026 historical completion, read-only save guards, September boundary, Gregorian month order, current-month reset and Senior scope');
  console.log('PASS Monthly Coaching: QA draft, unsaved tab restore, appointment, Senior team isolation, read-only QA fields, multiple plans, return/accept, next-month follow-up, history, duplicate prevention, stale-write rejection and ownership preservation');
} finally { if(root)await act(async()=>root.unmount());dom.window.close();globalThis.Date=ActualDate;await fs.rm(temp,{recursive:true,force:true});delete globalThis.__monthlyCoachingFixture; }
