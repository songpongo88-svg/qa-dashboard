import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const ActualDate=Date;let testNow='2026-09-30T12:00:00Z';globalThis.Date=class extends ActualDate { constructor(...args){super(...(args.length?args:[testNow]));} static now(){return new ActualDate(testNow).valueOf();} };
const rootDir = new URL('../', import.meta.url).pathname;
const fixture = { records: new Map(), evaluations: [], readError: false, downloads: [], pdfs: [], pdfText: [] };
globalThis.__monthlyCoachingFixture = fixture;
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://coaching.test/' });
for (const key of ['window','document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','Event','MouseEvent','File','FileReader','sessionStorage','localStorage']) globalThis[key] = dom.window[key];
if (typeof globalThis.navigator === 'undefined') {
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const createObjectURL=URL.createObjectURL,revokeObjectURL=URL.revokeObjectURL;
URL.createObjectURL=blob=>{fixture.pdfs.push(blob);return 'blob:https://coaching.test/pdf';};URL.revokeObjectURL=()=>{};
dom.window.HTMLAnchorElement.prototype.click=function(){fixture.downloads.push({name:this.download,href:this.href});};
const temp = await fs.mkdtemp(path.join(rootDir, '.coaching-test-'));
const bundle = await build({ stdin: { contents: `import React, {act} from 'react'; import {Simulate} from 'react-dom/test-utils'; import {createRoot} from 'react-dom/client'; import Workspace from './src/MonthlyCoachingWorkspace'; export {React,act,Simulate,createRoot,Workspace}; export * from './src/monthlyCoachingModel'; export * from './src/coachingStore'; export * from './src/coachingAttachmentUpload'; export * from './src/monthlyCoachingPayment'; export * from './src/monthlyCoachingPdf';`, resolveDir: rootDir, loader: 'tsx' }, bundle: true, loader:{'.css':'empty'}, external: ['react', 'react-dom', 'react-dom/*'], platform: 'node', format: 'esm', write: false, banner: { js: "import { createRequire as testRequire } from 'node:module'; const require = testRequire(import.meta.url);" }, plugins: [{name:'test-services',setup(b){
  b.onResolve({filter:/^(firebase\/firestore|\.\/firebaseClient|\.\/coachingCanonicalStore|\.\/evaluationStore)$/},args=>({path:args.path,namespace:'test-service'}));
  b.onLoad({filter:/\/monthlyCoachingPdf\.ts$/},async args=>{
    let source=await fs.readFile(args.path,'utf8');
    source=source.replace("  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });", "  const pdf = new jsPDF({ unit: 'mm', format: 'a4' }); const text=pdf.text.bind(pdf);pdf.text=(value,...args)=>{globalThis.__monthlyCoachingFixture.pdfText.push({value:String(value),page:pdf.getCurrentPageInfo().pageNumber,y:args[1]});return text(value,...args);};");
    return {contents:source,loader:'ts'};
  });
  b.onLoad({filter:/.*/,namespace:'test-service'},args=>({contents: args.path==='firebase/firestore' ? `const f=globalThis.__monthlyCoachingFixture; export const collection=(_,name)=>({name}); export const doc=(_,name,id)=>({name,id}); export const serverTimestamp=()=>0; export async function getDocs(){if(f.readError)throw new Error('offline');return {docs:[...f.records].map(([id,row])=>({id,data:()=>structuredClone(row)}))};} export async function getDocsFromServer(){f.serverReads=(f.serverReads||0)+1;return getDocs();} export async function setDoc(ref,row){f.records.set(ref.id,structuredClone(row));} export async function runTransaction(_,fn){const writes=[];const result=await fn({get:async ref=>({id:ref.id,exists:()=>f.records.has(ref.id),data:()=>structuredClone(f.records.get(ref.id))}),set:(ref,row)=>writes.push([ref.id,structuredClone(row)])});writes.forEach(([id,row])=>f.records.set(id,row));return result;}` : args.path==='./firebaseClient' ? `export const firebaseDb={};` : args.path==='./coachingCanonicalStore' ? `export const fetchCanonicalCoachingEvaluations=async()=>structuredClone(globalThis.__monthlyCoachingFixture.evaluations);` : `export const getStoredEvaluationMonthKey=row=>row.evaluationMonthKey;`, loader:'js'}));
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
const assigned=[{agentId:'agent-a',agent:'Agent A',monthKey:month,coachId:'lead-a',appointment:{participants:[]}},{agentId:'agent-b',agent:'Agent B',monthKey:month,coachId:'lead-ann',appointment:{participants:[]}}];
accounts.push({username:'guest',displayName:'Guest QA',agentName:'Guest QA',role:'Supervisor'});
fixture.evaluations=[{id:'a-1',caseId:'AA100',auditDate:'2026-09-23',auditTimestamp:'2026-09-30T12:00:00Z',targetUsername:'agent-a',agentName:'Agent A',evaluationMonthKey:month,finalScore:80,criticalError:false,topics:[{code:'1',title:'Verify',score:20,max:30},{code:'2',title:'SLA',score:15,max:20}]},{id:'b-1',caseId:'BB100',targetUsername:'agent-b',agentName:'Agent B',evaluationMonthKey:month,finalScore:90,topics:[{code:'1',title:'Verify',score:30,max:30}]}];
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
assert.deepEqual(m.coachingEvaluationScope(allAccounts,seniorB,noisy,'2026-09',assigned).months,['2026-09']);
assert.equal(m.resolveCoachingMonth('2026-12',scoped.months,'2026-09'),'2026-09');
assert.equal(m.resolveCoachingMonth('2027-01',[],'2026-09'),'');
assert.equal(m.formFromRecord({mainIssues:'AUTO GENERATED CASE DESCRIPTION'}).summary,'');
assert.equal(m.manualCoachingSummary({qaSummary:'Manual note',mainIssues:'AUTO'}),'Manual note');
assert.equal(m.manualCoachingSummary({generalFeedback:'Manual legacy note',mainIssues:'AUTO'}),'Manual legacy note');
assert.equal(m.manualCoachingSummary({qaSummary:'',generalFeedback:'Manual legacy note'}),'','clearing a saved QA summary must not bring the old note back');
assert.equal(m.coachingEvaluationScope([...accounts,{...agentA,username:'duplicate-name'}],qa,[{...septemberRows[0],targetUsername:''}],'2026-09').agents.length,0,'ambiguous names excluded');
assert.deepEqual(m.visibleCoachingAgents(accounts,qa).map(a=>a.username),['agent-a','agent-b','unevaluated']);
assert.deepEqual(m.visibleCoachingAgents(accounts,seniorA,assigned).map(a=>a.username),['agent-a'],'partial Senior names must never grant another team');
assert.deepEqual(m.visibleCoachingAgents(accounts,seniorB,assigned).map(a=>a.username),['agent-b']);
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
const rosterText = () => [...document.querySelectorAll('.mc-person')].map(node=>node.textContent).join(' ');
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
  assert.ok(!rosterText().includes('No Results'));assert.deepEqual([...named('เดือน Coaching').options].map(o=>o.value),scoped.months);
  const evidenceDate=caseId=>[...document.querySelectorAll('.mc-evidence-card tbody tr')].find(row=>row.querySelector('button')?.textContent===caseId)?.cells[1].textContent;
  assert.equal(evidenceDate('AA100'),'23/09/2026','Case Date comes from the same stored field as Case Detail, without a preview copy');
  fixture.evaluations[0].rawDataPreview={'Case Date':'2026-09-22'};
  await click(button('โหลดข้อมูลล่าสุด'));
  assert.equal(evidenceDate('AA100'),'23/09/2026','the primary Case Date wins over an old preview value');
  fixture.evaluations[0].auditDate='';
  await click(button('โหลดข้อมูลล่าสุด'));
  assert.equal(evidenceDate('AA100'),'22/09/2026','legacy Case Date preview remains supported');
  fixture.evaluations[0].rawDataPreview={case_date:'2026-09-21'};
  await click(button('โหลดข้อมูลล่าสุด'));
  assert.equal(evidenceDate('AA100'),'21/09/2026','legacy case_date alias remains supported');
  fixture.evaluations[0].rawDataPreview={};
  await click(button('โหลดข้อมูลล่าสุด'));
  assert.equal(evidenceDate('AA100'),'—','a missing Case Date must not be replaced with the QA audit timestamp');
  fixture.evaluations[0].auditDate='2026-09-23';
  await click(button('โหลดข้อมูลล่าสุด'));
  console.log('PASS Coaching evidence Case Date: stored date, preview fallback, aliases and no QA timestamp substitution');
  fixture.records.set('legacy-record',{id:'legacy-record',agentId:'agent-a',agent:'Agent A',monthKey:'2026-08',status:'Completed',mainIssues:'AUTO GENERATED CASE DESCRIPTION',generalFeedback:'Manually written legacy note',updatedAt:'2026-08-31T00:00:00Z'});await click(button('โหลดข้อมูลล่าสุด'));assert.ok(!text().includes('AUTO GENERATED CASE DESCRIPTION'));assert.ok(text().includes('Manually written legacy note'));
  await fill(named('QA Summary'),'QA summary retained across tabs'); await tickTopic('Verify'); await tickTopic('SLA');
  await fill(field('วันที่นัดหมาย'),'2026-09-28'); await fill(field('เวลาเริ่ม (24 ชั่วโมง)'),'14:00');
  await fill(named('เลือกผู้ Coaching'),'lead-a');await fill(named('เลือกผู้เข้าร่วมเพิ่มเติม'),'Guest QA');await click(button('+ เพิ่ม'));
  await fill(named('Agenda 1'),'Review Verify'); await click(button('+ เพิ่ม Agenda')); await fill(named('Agenda 2'),'Review SLA');
  await mount(qa);
  assert.equal(named('QA Summary').value,'QA summary retained across tabs','unsaved text survives tab unmount and remount');
  assert.equal(named('Agenda 2').value,'Review SLA');
  await click(button('บันทึก Draft')); assert.equal(fixture.records.size,2);
  const id=m.monthlyCoachingId(agentA.username,month);
  assert.equal(fixture.records.get(id).qaSummary,'QA summary retained across tabs');assert.equal(named('เลือกผู้เข้าร่วมเพิ่มเติม').value,'','added participants reset the selection');assert.ok(fixture.records.get(id).appointment.participants.includes('Guest QA'));
  await click(button('นัดหมาย')); await click(button('ส่งให้ผู้ Coaching'));
  assert.equal(fixture.records.get(id).status,'Waiting Senior'); assert.equal(fixture.records.size,2,'one monthly record reused through transitions');
  sessionStorage.setItem('qa-dashboard:monthly-coaching:view:lead-a',JSON.stringify({periodVersion:2,month}));
  await mount(seniorA); assert.ok(!rosterText().includes('Agent B Full Name')); await chooseAgent();
  assert.equal(named('QA Summary').readOnly,true); assert.equal(field('วันที่นัดหมาย').disabled,true);
  await fill(field('วันที่ Coaching จริง'),'2026-09-28');await fill(field('เวลาเริ่มจริง'),'14:00');await fill(field('เวลาสิ้นสุดจริง'),'15:00');
  await fill(named('Final Coaching Note'),'Discussed both topics');await tickTopic('Verify');await tickTopic('SLA');
  await click(button('ส่ง Action Plan ให้ QA')); assert.equal(fixture.records.get(id).status,'Waiting Senior','missing plans cannot submit');
  for(let i=0;i<2;i++){await click(button('+ เพิ่ม Action Plan'));await fill(field('Action Plan',i),`Plan ${i+1}`);await fill(field('กำหนดส่ง',i),'2026-10-15');}
  await mount(seniorA); assert.equal(field('Action Plan',1).value,'Plan 2','Senior plan survives switching tabs');
  await click(button('ส่ง Action Plan ให้ QA')); assert.equal(fixture.records.get(id).status,'Action Plan Submitted');
  await mount(qa); await click(button('ส่งคืนผู้ Coaching')); assert.equal(fixture.records.get(id).status,'Action Plan Submitted','return requires a review comment');
  await fill(named('QA Review Comment'),'Add measurable follow-up'); await click(button('ส่งคืนผู้ Coaching')); assert.equal(fixture.records.get(id).status,'QA Reviewed');
  await mount(seniorA); assert.equal(named('QA Review Comment').value,'Add measurable follow-up');await click(button('ส่ง Action Plan ให้ QA'));
  await mount(qa);await fill(named('QA Review Comment'),'');await click(button('รับแผน'));assert.equal(fixture.records.get(id).status,'Action Plan Submitted','QA acceptance requires a review summary');await fill(named('QA Review Comment'),'Checked both topics and accepted the Action Plan');await click(button('รับแผน'));assert.equal(fixture.records.get(id).status,'Follow-up Next Month');
  const accepted=fixture.records.get(id);assert.equal(accepted.qaReviewedAt,new Date(testNow).toISOString());assert.equal(accepted.qaReviewedBy,qa.displayName);assert.equal(m.monthlyCoachingPaymentStatus(month,agentA.agentName,[accepted],agentA.username).onTime,true);assert.ok(text().includes('15/10/2026'));
  testNow='2026-10-16T03:00:00Z';const closed=await m.saveMonthlyCoachingRecord({...accepted,status:'Closed',qaReviewedAt:'1900-01-01T00:00:00Z'},qa,accounts,accepted.updatedAt);assert.equal(closed.qaReviewedAt,accepted.qaReviewedAt,'closing later retains the actual first QA acceptance time and ignores a client-supplied date');assert.equal(m.monthlyCoachingPaymentStatus(month,agentA.agentName,[closed],agentA.username).onTime,true);testNow='2026-09-30T12:00:00Z';
  const withoutReview={...closed,qaReviewComment:'',qaReviewedAt:''};fixture.records.set(id,withoutReview);await mount(qa);await fill(named('QA Review Comment'),'QA verified the completed Coaching');await click(button('บันทึก QA Review'));assert.equal(fixture.records.get(id).qaReviewedBy,qa.displayName,'QA can complete the required review on an already closed record');
  const previous=structuredClone(fixture.records.get(id));
  testNow='2026-10-15T12:00:00Z';fixture.evaluations.push({...septemberRows[0],id:'october-1',evaluationMonthKey:'2026-10'});await click(button('โหลดข้อมูลล่าสุด'));await fill(named('เดือน Coaching'),'2026-10');assert.ok(text().includes('ประวัติการ Coaching ล่าสุด (September 2026)'));assert.ok(text().includes('Plan 1'));assert.equal(named('QA Summary').value,'');
  await fill(named('QA Summary'),'October new record');await click(button('บันทึก Draft'));assert.equal(fixture.records.size,3);assert.deepEqual(fixture.records.get(id),previous,'next month must not modify previous month');
  await click(button('ประวัติ Coaching'));assert.ok(text().includes('Plan 2'));assert.ok(text().includes('September 2026'));
  const latest = await m.fetchStoredCoachingRecords({allowCache:false});assert.equal(m.manualCoachingSummary(latest.find(r=>r.id==='legacy-record')),'Manually written legacy note');const old=latest.find(r=>r.id===id);
  await assert.rejects(()=>m.saveMonthlyCoachingRecord({...old,status:'Closed'},qa,accounts,'stale-version'),/ข้อมูลใหม่/);
  await assert.rejects(()=>m.saveMonthlyCoachingRecord({...old,status:'Coaching In Progress'},seniorB,accounts,old.updatedAt),/ไม่มีสิทธิ์/);
  const malicious={...old,qaSummary:'altered by senior',agentId:'agent-b',team:'Wrong Team',seniorId:'lead-ann',actions:[{id:'x',plan:'New plan'}]};
  const merged=m.mergeMonthlyCoachingSave(old,malicious,'Senior');assert.equal(merged.qaSummary,old.qaSummary);assert.equal(merged.agentId,'agent-a');assert.equal(merged.team,'Team A');assert.equal(merged.seniorId,'lead-a');
  await m.fetchStoredCoachingRecords({forceRefresh:true});assert.ok(fixture.serverReads>0,'forceRefresh uses a server-only Coaching read');fixture.readError=true;await assert.rejects(()=>m.fetchStoredCoachingRecords({allowCache:false}),/offline/);await assert.rejects(()=>m.fetchStoredCoachingRecords({forceRefresh:true}),/offline/,'a failed fresh read never falls back to cached Payment eligibility');fixture.readError=false;
  assert.equal(m.currentCoachingMonth(new Date('2026-08-31T17:00:00Z')),'2026-09','Bangkok midnight uses the new Gregorian month');
  assert.equal(m.initialCoachingMonth({month:'2025-08'},month),month,'migrate the old cached year once');
  assert.equal(m.initialCoachingMonth({periodVersion:2,month:'2026-08'},month),'2026-08','keep intentional period selections');
  const beforeArchive=JSON.stringify([...fixture.records]);
  for (const legacyMonth of m.HISTORICAL_COACHING_MONTHS) {
    await fill(named('เดือน Coaching'),legacyMonth);
    await click(button('ข้อมูล Coaching'));
    assert.equal(Boolean(named('QA Summary')),false,'historical period has no new workflow form');
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
  await mount(seniorA);assert.deepEqual([...named('เดือน Coaching').options].map(o=>o.value),['2026-09','2026-10'],'Senior sees months assigned through their Coaching records');assert.ok(!rosterText().includes('Agent B Full Name'));assert.equal(named('QA Summary').readOnly,true);
  fixture.records.set('b-scoped',{id:'b-scoped',agentId:agentB.username,agent:agentB.agentName,monthKey:month,status:'Waiting Senior',coachId:seniorB.username,updatedAt:new Date().toISOString()});await mount(seniorB);assert.deepEqual([...named('เดือน Coaching').options].map(o=>o.value),['2026-09']);assert.ok(!rosterText().includes('Agent A Full Name'));
  const qaOther={username:'qa-other',displayName:'Other QA',agentName:'Other QA',role:'Quality Assurance'};accounts.push(qaOther);
  const selfCoach={...fixture.records.get(id),status:'Waiting Senior',coachId:qa.username,coachName:qa.displayName,qaOwnerId:qa.username,qaOwnerName:qa.displayName,qaReviewComment:'',qaReviewedAt:'',updatedAt:new Date().toISOString()};
  fixture.records.set(id,selfCoach);
  fixture.records.set('b-scoped',{...selfCoach,id:'b-scoped',agentId:agentB.username,agent:agentB.agentName,coachId:seniorB.username,coachName:seniorB.displayName,qaOwnerId:qaOther.username,qaOwnerName:qaOther.displayName,status:'Action Plan Submitted',appointment:{...selfCoach.appointment,participants:[seniorA.displayName]}});
  assert.equal(m.isAssignedCoach({...selfCoach,coachId:seniorB.username,coachName:seniorA.displayName},seniorA),false,'an explicit Coach ID wins over a similar or old name');
  sessionStorage.setItem('qa-dashboard:monthly-coaching:view:qa',JSON.stringify({periodVersion:2,month,listView:'tasks'}));
  await mount(qa);
  assert.ok(rosterText().includes('Agent A Full Name'));assert.ok(!rosterText().includes('Agent B Full Name'),'another QA owner has a separate task queue');
  assert.equal(named('Final Coaching Note').disabled,false,'a QA assigned as Coach can record actual results');
  assert.equal(named('QA Summary').readOnly,true);
  await fill(named('Final Coaching Note'),'Self-assigned QA Coach completed Verify and SLA');
  await click(button('ส่ง Action Plan ให้ QA'));
  assert.equal(fixture.records.get(id).status,'Action Plan Submitted');assert.equal(fixture.records.get(id).actualCoaching.finalNote,'Self-assigned QA Coach completed Verify and SLA');assert.equal(fixture.records.get(id).qaSummary,selfCoach.qaSummary);assert.equal(fixture.records.get(id).qaOwnerId,qa.username);
  const beforeHistory=JSON.stringify([...fixture.records]);
  await click(button('History รวม Admin'));
  assert.ok(rosterText().includes('Agent A Full Name'));assert.ok(rosterText().includes('Agent B Full Name'));
  assert.equal(JSON.stringify([...fixture.records]),beforeHistory,'changing queue/history never rewrites tasks');
  const saved=fixture.records.get(id);fixture.records.set(id,{...saved,qaSummary:'สรุป QA ล่าสุดสำหรับ Agent A เท่านั้น',updatedAt:new Date(Date.now()+1000).toISOString()});
  await click(named('ดาวน์โหลด Coaching PDF Agent A Full Name'));
  assert.equal(fixture.downloads.length,1);assert.equal(fixture.downloads[0].name,'Coaching_2026-09_agent-a.pdf');
  assert.equal(new TextDecoder().decode(new Uint8Array(await fixture.pdfs[0].arrayBuffer()).slice(0,4)),'%PDF');
  assert.ok(fixture.pdfText.some(call=>call.value.includes('สรุป QA ล่าสุดสำหรับ Agent A เท่านั้น')),'download uses the newest saved summary');
  assert.ok(fixture.pdfText.some(call=>call.value.includes('Self-assigned QA Coach completed')));
  assert.ok(!fixture.pdfText.some(call=>call.value.includes('Agent B Full Name')),'one User never inherits another User PDF');
  const output=process.argv.find(arg=>arg.startsWith('--output-dir='))?.slice(13);
  if(output){await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,fixture.downloads[0].name),new Uint8Array(await fixture.pdfs[0].arrayBuffer()));}
  fixture.readError=true;await click(named('ดาวน์โหลด Coaching PDF Agent A Full Name'));assert.equal(fixture.downloads.length,1,'failed fresh server read cannot export a cached Coaching file');fixture.readError=false;
  sessionStorage.setItem('qa-dashboard:monthly-coaching:view:qa-other',JSON.stringify({periodVersion:2,month,listView:'tasks'}));await mount(qaOther);
  assert.ok(!rosterText().includes('Agent A Full Name'));assert.ok(rosterText().includes('Agent B Full Name'));
  const assignedA={...fixture.records.get(id),status:'Waiting Senior',coachId:seniorA.username,coachName:seniorA.displayName};fixture.records.set(id,assignedA);
  sessionStorage.setItem('qa-dashboard:monthly-coaching:view:lead-a',JSON.stringify({periodVersion:2,month,listView:'tasks'}));await mount(seniorA);
  assert.ok(rosterText().includes('Agent A Full Name'));assert.ok(!rosterText().includes('Agent B Full Name'),'being invited to another task grants history access, not ownership');
  await click(button('History รวม Admin'));assert.ok(rosterText().includes('Agent B Full Name'));
  await chooseAgent('Agent B Full Name');assert.equal(named('Final Coaching Note').disabled,true,'history remains read-only for an unassigned Coach');
  fixture.records.set(id,{...assignedA,coachId:seniorB.username,coachName:seniorB.displayName,appointment:{...assignedA.appointment,participants:[]}});
  await click(named('ดาวน์โหลด Coaching PDF Agent A Full Name'));
  assert.equal(fixture.downloads.length,1,'a stale page rechecks the selected month and refuses a reassigned Coach PDF');
  const startLong=fixture.pdfText.length;
  const longRecord={...saved,qaSummary:'สรุปผลการ Coaching และตรวจสอบความเข้าใจตามขั้นตอน '.repeat(130),actions:[{...saved.actions[0],topic:'ขั้นตอนการทำงานและนโยบาย Process and Policy Compliance '.repeat(8),issue:'ตรวจสอบข้อมูลผู้ติดต่อให้ครบถ้วน',plan:'ฝึกทบทวนข้อมูลและบันทึกผลในทุกเคส '.repeat(160)}]};
  const longPdf=m.renderMonthlyCoachingPdf(longRecord,agentA,septemberRows.filter(row=>row.targetUsername===agentA.username));
  assert.ok(longPdf.getNumberOfPages()>3,'long Thai summaries and plans continue across pages');
  assert.ok(fixture.pdfText.slice(startLong).every(call=>Number.isFinite(call.y)&&call.y<=278||call.y===289),'all report text stays inside the body or footer');
  assert.ok(fixture.pdfText.slice(startLong).some(call=>call.value.includes('ปัญหาที่พบ')));
  assert.throws(()=>m.renderMonthlyCoachingPdf(saved,agentB,[]),/ไม่ตรงกับ Admin/);
  console.log('PASS long Thai Coaching PDF pagination, wrapped topic titles and User identity guard');
  console.log('PASS per-person Task queues and accessible all-Admin History, authoritative Coach IDs, QA-as-Coach store transaction, real per-User monthly PDF bytes, latest content, failed reads and revoked access');
  console.log('PASS evaluated-role scope, empty/test/no-case/future exclusion, exact identity, scoped month options, manual-only QA text');
  console.log('PASS January–August 2026 historical completion, read-only save guards, September boundary, Gregorian month order, current-month reset and Senior scope');
  console.log('PASS Monthly Coaching: QA draft, unsaved tab restore, appointment, Senior team isolation, read-only QA fields, multiple plans, return/accept, next-month follow-up, history, duplicate prevention, stale-write rejection and ownership preservation');
} finally { if(root)await act(async()=>root.unmount());dom.window.close();globalThis.Date=ActualDate;URL.createObjectURL=createObjectURL;URL.revokeObjectURL=revokeObjectURL;await fs.rm(temp,{recursive:true,force:true});delete globalThis.__monthlyCoachingFixture; }
