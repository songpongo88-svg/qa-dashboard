import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const rootDir = new URL('../', import.meta.url).pathname;
const fixture = { records: new Map(), evaluations: [], readError: false };
globalThis.__monthlyCoachingFixture = fixture;
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://coaching.test/' });
for (const key of ['window','document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','Event','MouseEvent','File','FileReader','sessionStorage','localStorage']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const temp = await fs.mkdtemp(path.join(rootDir, '.coaching-test-'));
const bundle = await build({ stdin: { contents: `import React, {act} from 'react'; import {Simulate} from 'react-dom/test-utils'; import {createRoot} from 'react-dom/client'; import Workspace from './src/MonthlyCoachingWorkspace'; export {React,act,Simulate,createRoot,Workspace}; export * from './src/monthlyCoachingModel'; export * from './src/coachingStore'; export * from './src/coachingAttachmentUpload';`, resolveDir: rootDir, loader: 'tsx' }, bundle: true, external: ['react', 'react-dom', 'react-dom/*'], platform: 'node', format: 'esm', write: false, banner: { js: "import { createRequire as testRequire } from 'node:module'; const require = testRequire(import.meta.url);" }, plugins: [{name:'test-services',setup(b){
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
assert.deepEqual(m.visibleCoachingAgents(accounts,qa).map(a=>a.username),['agent-a','agent-b']);
assert.deepEqual(m.visibleCoachingAgents(accounts,seniorA).map(a=>a.username),['agent-a'],'partial Senior names must never grant another team');
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
  sessionStorage.setItem('qa-dashboard:monthly-coaching:view:qa',JSON.stringify({month}));
  await mount(qa); await chooseAgent();
  await fill(named('QA Summary'),'QA summary retained across tabs'); await tickTopic('Verify'); await tickTopic('SLA');
  await fill(field('วันที่นัดหมาย'),'2026-09-28'); await fill(field('เวลาเริ่ม (24 ชั่วโมง)'),'14:00');
  await fill(named('Agenda 1'),'Review Verify'); await click(button('+ เพิ่ม Agenda')); await fill(named('Agenda 2'),'Review SLA');
  await mount(qa);
  assert.equal(named('QA Summary').value,'QA summary retained across tabs','unsaved text survives tab unmount and remount');
  assert.equal(named('Agenda 2').value,'Review SLA');
  await click(button('บันทึก Draft')); assert.equal(fixture.records.size,1);
  const id=m.monthlyCoachingId(agentA.username,month);
  assert.equal(fixture.records.get(id).qaSummary,'QA summary retained across tabs');
  await click(button('นัดหมาย')); await click(button('ส่งให้ Senior'));
  assert.equal(fixture.records.get(id).status,'Waiting Senior'); assert.equal(fixture.records.size,1,'one monthly record reused through transitions');
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
  await fill(named('เดือน Coaching'),'10');assert.ok(text().includes('Coaching ล่าสุด · 2026-09'));assert.ok(text().includes('Plan 1'));assert.equal(named('QA Summary').value,'');
  await fill(named('QA Summary'),'October new record');await click(button('บันทึก Draft'));assert.equal(fixture.records.size,2);assert.deepEqual(fixture.records.get(id),previous,'next month must not modify previous month');
  await click(button('ประวัติ Coaching'));assert.ok(text().includes('Plan 2'));assert.ok(text().includes('2026-09'));
  const latest = await m.fetchStoredCoachingRecords({allowCache:false});const old=latest.find(r=>r.id===id);
  await assert.rejects(()=>m.saveMonthlyCoachingRecord({...old,status:'Closed'},qa,accounts,'stale-version'),/ข้อมูลใหม่/);
  await assert.rejects(()=>m.saveMonthlyCoachingRecord({...old,status:'Coaching In Progress'},seniorB,accounts,old.updatedAt),/ไม่มีสิทธิ์/);
  const malicious={...old,qaSummary:'altered by senior',agentId:'agent-b',team:'Wrong Team',seniorId:'lead-ann',actions:[{id:'x',plan:'New plan'}]};
  const merged=m.mergeMonthlyCoachingSave(old,malicious,'Senior');assert.equal(merged.qaSummary,old.qaSummary);assert.equal(merged.agentId,'agent-a');assert.equal(merged.team,'Team A');assert.equal(merged.seniorId,'lead-a');
  fixture.readError=true;await assert.rejects(()=>m.fetchStoredCoachingRecords({allowCache:false}),/offline/);fixture.readError=false;
  console.log('PASS Monthly Coaching: QA draft, unsaved tab restore, appointment, Senior team isolation, read-only QA fields, multiple plans, return/accept, next-month follow-up, history, duplicate prevention, stale-write rejection and ownership preservation');
} finally { if(root)await act(async()=>root.unmount());dom.window.close();await fs.rm(temp,{recursive:true,force:true});delete globalThis.__monthlyCoachingFixture; }
