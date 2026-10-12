import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

// Real write handlers and UI, with an atomic/versioned Firestore boundary.
// These fixtures never connect to the production database.
const temp = await mkdtemp(resolve('.monthly-result-lock-test-'));
const dom = new JSDOM('<div id="root"></div>', { url: 'https://qa.test/' });
const originals = new Map();
for (const key of ['window','document','navigator','localStorage','HTMLElement','Event','MouseEvent','CustomEvent','DOMParser','Node']) {
  originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const fixture = globalThis.__monthlyResultFixture = { docs: new Map(), versions: new Map(), writes: [], offline: false, beforeCommit: null };
const seed = (path, data) => { fixture.docs.set(path, structuredClone(data)); fixture.versions.set(path, (fixture.versions.get(path) || 0) + 1); };
const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
console.warn = (...args) => { if (!args.some(value => value?.name === 'MonthlyResultLockedError')) originalWarn(...args); };
globalThis.fetch = async () => new Response('', { status: 404 });
window.alert = () => {};
window.confirm = () => true;
const firestore = `
 export const collection=(_db,name)=>({name}),doc=(_db,name,id)=>({name,id,path:name+'/'+id});
 export const query=(source,...constraints)=>({source,constraints}),where=(field,op,value)=>({field,op,value});
 export const orderBy=(field,direction)=>({field,direction}),limit=value=>({limit:value}),startAfter=()=>({});
 export const documentId=()=> '__name__';
 export const getFirestore=()=>({}),serverTimestamp=()=>new Date().toISOString(),deleteField=()=>({__deleteField:true});
 const value=(row,field)=>field.split('.').reduce((row,key)=>row?.[key],row);
 const snapshot=(path)=>({id:path.split('/').pop(),exists:()=>globalThis.__monthlyResultFixture.docs.has(path),data:()=>structuredClone(globalThis.__monthlyResultFixture.docs.get(path))});
 export async function getDoc(ref){if(globalThis.__monthlyResultFixture.offline)throw new Error('offline');return snapshot(ref.path)}
 export const getDocFromServer=getDoc;
 export async function getDocs(ref){
  const f=globalThis.__monthlyResultFixture;if(f.offline)throw new Error('offline');
  const source=ref.source||ref,conditions=ref.constraints||[];
  let rows=[...f.docs.entries()].filter(([path])=>path.startsWith(source.name+'/'));
  for(const c of conditions.filter(c=>c.field&&c.op))rows=rows.filter(([path,row])=>{const v=c.field==='__name__'?path.split('/').pop():value(row,c.field);return c.op==='=='?v===c.value:c.op==='in'?c.value.includes(v):c.op==='>='?v>=c.value:c.op==='<'?v<c.value:true});
  for(const c of conditions.filter(c=>c.direction))rows.sort((a,b)=>String(value(a[1],c.field)||'').localeCompare(String(value(b[1],c.field)||''))*(c.direction==='desc'?-1:1));
  const n=conditions.find(c=>c.limit)?.limit;if(n)rows=rows.slice(0,n);
  return {docs:rows.map(([path])=>snapshot(path))};
 }
 export const getDocsFromServer=getDocs;
 function commit(writes){const f=globalThis.__monthlyResultFixture;for(const [ref,data,options]of writes){const row=options?.merge?{...f.docs.get(ref.path)}:{};for(const [key,v]of Object.entries(data)){if(v?.__deleteField)delete row[key];else row[key]=structuredClone(v)}f.docs.set(ref.path,row);f.versions.set(ref.path,(f.versions.get(ref.path)||0)+1);f.writes.push([ref.path,structuredClone(data)])}}
 export async function setDoc(ref,data,options){if(globalThis.__monthlyResultFixture.offline)throw new Error('offline');commit([[ref,data,options]])}
 export async function deleteDoc(){throw new Error('No physical history deletion expected')}
 export async function runTransaction(_db,callback){const f=globalThis.__monthlyResultFixture;
  for(let attempt=0;attempt<4;attempt++){if(f.offline)throw new Error('offline');const reads=new Map(),writes=[];
   const result=await callback({get:async ref=>{if(writes.length)throw new Error('Read after write');reads.set(ref.path,f.versions.get(ref.path)||0);return snapshot(ref.path)},set:(ref,data,options)=>writes.push([ref,data,options]),update:(ref,data)=>writes.push([ref,data,{merge:true}])});
   if(f.beforeCommit){const hook=f.beforeCommit;f.beforeCommit=null;await hook()}
   if([...reads].some(([path,v])=>(f.versions.get(path)||0)!==v))continue;
   commit(writes);return result;
  }throw new Error('contention');
 }
 export const writeBatch=()=>{throw new Error('An unguarded batch must not write results')};
 export const onSnapshot=()=>()=>{};
`;
let root;
try {
  const output = resolve(temp, 'app.mjs');
  await build({ stdin: { contents: `
    export * from './src/monthlyResultLockStore';
    export {upsertStoredEvaluation,deleteStoredEvaluation} from './src/evaluationStore';
    export {writeAppealEvent,writeAdditionalAppealAccessDecision} from './src/appealStore';
    export {saveStoredSignatureConfirm,clearStoredSignatureConfirm,saveStoredSignatureDocument,fetchStoredSignatureDocuments} from './src/signatureStore';
    export {default as Review} from './src/AppealRequestsMockup';
  `, resolveDir: resolve('.'), loader: 'tsx' }, outfile: output, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', logLevel: 'silent',
    define: { 'import.meta.env': JSON.stringify({ VITE_FIREBASE_API_KEY:'fixture',VITE_FIREBASE_PROJECT_ID:'fixture',VITE_FIREBASE_APP_ID:'fixture' }) },
    plugins: [{ name: 'monthly-lock-boundaries', setup(builder) {
      builder.onResolve({ filter: /^(firebase\/|\.\/firebaseClient$|\.\/PageHero$|\.\/appealCaseAvailability$)/ }, args => ({ path: args.path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', contents:
        args.path === 'firebase/firestore' ? firestore : args.path === 'firebase/app' ? 'export const initializeApp=()=>({}),getApps=()=>[{}];' :
        args.path === 'firebase/storage' ? 'export const getDownloadURL=()=>{},getStorage=()=>{},ref=()=>{},uploadBytes=()=>{},uploadBytesResumable=()=>{};' :
        args.path === './firebaseClient' ? 'export const firebaseDb={};' : args.path === './appealCaseAvailability' ? 'export async function checkAppealSourceCases(events){return events};export const findUnavailableAppealForRoute=()=>undefined;' : 'export default function Hero(){return null;}' }));
    } }] });
  const app = await import(pathToFileURL(output).href);
  const { createRoot } = await import('react-dom/client');
  const agent = 'Fixture Agent A', monthKey = '2026-09', docId = monthKey+'::'+agent, guard = 'qa_signature_documents/'+docId;
  const qa = { username:'qa',displayName:'Fixture QA',role:'Quality Assurance' };
  const owner = { username:'owner',displayName:agent,agentName:agent,role:'Agent' };
  const topics = [{code:'1',label:'Process',score:24,max:30,wantsAppeal:true,appealReason:'Reason',comment:'Original'}];
  const evaluation = (id,name=agent,month=monthKey) => ({id,evaluationKey:id,caseId:id,agentName:name,auditDate:month+'-20',evaluationMonthKey:month,submittedAt:month+'-20T03:00:00Z',finalScore:90,topics});
  const appeal = {case_id:'AA990101',target_agent:agent,details:{requestId:'appeal-fixture',monthKey,auditDate:'2026-09-20',topics,submittedAt:'2026-10-07T03:00:00Z'}};
  await app.upsertStoredEvaluation(evaluation('AA990101'));
  assert.ok(fixture.docs.get(guard).resultRevision);
  await app.writeAppealEvent(owner,'appeal_request_submitted',appeal);
  await app.writeAppealEvent(qa,'appeal_request_reviewed',{...appeal,details:{...appeal.details,reviewId:'review-fixture',reviewedAt:'2026-10-08T03:00:00Z',decision:'Approved',topics:topics.map(t=>({...t,decision:'Approved',revisedScore:24}))}});
  const revision = fixture.docs.get(guard).resultRevision;
  const ackAt = '2026-10-12T03:00:00Z';
  assert.ok((await app.fetchCachedMonthlyResultLocks(monthKey)).every(row=>!row.lockedAt));
  await app.saveStoredSignatureConfirm(docId,ackAt,{expectedRevision:revision,confirmedBy:'owner'});
  assert.equal((await app.fetchCachedMonthlyResultLocks(monthKey)).find(row=>row.agentName===agent).lockedAt,ackAt,'acknowledgement invalidates the shared cache even while Case Detail is unmounted');
  assert.equal(fixture.docs.get(guard).resultLockedAt,ackAt);
  const original = structuredClone([...fixture.docs]);
  const localOriginal = window.localStorage.getItem('qa-dashboard:create-evaluation:history:v2');
  for (const [label,action] of [
    ['edit score/comment/evidence',()=>app.upsertStoredEvaluation({...evaluation('AA990101'),finalScore:100,topics:[],evidenceUrls:['https://fixture.test/new.png']})],
    ['add case',()=>app.upsertStoredEvaluation(evaluation('AA990102'))],
    ['move case to another month',()=>app.upsertStoredEvaluation(evaluation('AA990101',agent,'2026-10'))],
    ['move case to another Agent',()=>app.upsertStoredEvaluation(evaluation('AA990101','Fixture Agent B'))],
    ['delete case',()=>app.deleteStoredEvaluation('AA990101','AA990101')],
  ]) { await assert.rejects(action,app.MonthlyResultLockedError,label); assert.deepEqual([...fixture.docs],original,label+': remote unchanged'); }
  assert.equal(window.localStorage.getItem('qa-dashboard:create-evaluation:history:v2'),localOriginal,'rejected writes never become successful local backups');
  for (const eventType of ['appeal_request_submitted','appeal_additional_access_requested','appeal_additional_round_opened','appeal_additional_evidence_submitted','appeal_submission_edit_started','appeal_submission_draft_saved','appeal_submission_resubmitted','appeal_request_reviewed','appeal_request_reset','appeal_case_override_added','appeal_case_override_removed']) {
    const details={...appeal.details,workflowId:'workflow-fixture',roundId:'round-fixture',submissionId:'submission-fixture',reviewId:'edit-fixture',reason:'Additional reason'};
    await assert.rejects(app.writeAppealEvent(eventType==='appeal_request_submitted'?owner:qa,eventType,{...appeal,details}),app.MonthlyResultLockedError,eventType);
  }
  const decision = {...appeal,details:{...appeal.details,accessId:'access-fixture',workflowId:'decision-fixture',approved:true}};
  const round = {...appeal,details:{...appeal.details,accessId:'access-fixture',roundId:'round-fixture',openedAt:ackAt}};
  await assert.rejects(app.writeAdditionalAppealAccessDecision(qa,decision,round),app.MonthlyResultLockedError);
  assert.deepEqual([...fixture.docs],original,'appeal history and evidence are unchanged after all blocked actions');
  console.log('PASS acknowledged month blocks all case/appeal mutations, moving owner/month, deletion and local backup writes');

  await app.clearStoredSignatureConfirm(docId,[]);
  assert.equal(fixture.docs.get(guard).confirmedAt,undefined);
  assert.equal(fixture.docs.get(guard).resultLockedAt,ackAt);
  await assert.rejects(app.upsertStoredEvaluation(evaluation('AA990102')),app.MonthlyResultLockedError);
  const seniorInk={role:'Senior',signerName:'Fixture Senior',signedBy:'Fixture Senior',signedAt:ackAt,status:'Signed',signatureDataUrl:'fixture-ink'};
  await app.saveStoredSignatureDocument(docId,[seniorInk]);
  assert.equal(fixture.docs.get(guard).entries[0].role,'Senior','remaining role can still sign');
  assert.equal(fixture.docs.get(guard).resultLockedAt,ackAt);
  await app.saveStoredSignatureConfirm(docId,'2026-10-13T03:00:00Z',{expectedRevision:revision});
  assert.equal(fixture.docs.get(guard).resultLockedAt,ackAt,'re-acknowledgement never moves the original lock');
  seed('qa_signature_documents/2026-08::Legacy Agent',{docId:'2026-08::Legacy Agent',confirmedAt:ackAt,entries:[]});
  await app.clearStoredSignatureConfirm('2026-08::Legacy Agent',[]);
  assert.equal(fixture.docs.get('qa_signature_documents/2026-08::Legacy Agent').resultLockedAt,ackAt,'old acknowledgements remain locked after Reset');
  seed('qa_signature_documents/2026-07::Older Agent',{doc_id:'2026-07::Older Agent',confirmed_at:ackAt,entries:[]});
  await assert.rejects(app.upsertStoredEvaluation(evaluation('AA990105','Older Agent','2026-07')),app.MonthlyResultLockedError);
  await app.clearStoredSignatureConfirm('2026-07::Older Agent',[]);
  assert.equal(fixture.docs.get('qa_signature_documents/2026-07::Older Agent').confirmed_at,undefined);
  assert.equal(fixture.docs.get('qa_signature_documents/2026-07::Older Agent').resultLockedAt,ackAt);
  await assert.rejects(app.upsertStoredEvaluation(evaluation('AA990104','legacy agent','2026-08')),app.MonthlyResultLockedError,'identity case differences cannot bypass legacy locks');
  await app.upsertStoredEvaluation(evaluation('AA990201','Fixture Agent B'));
  await app.upsertStoredEvaluation(evaluation('AA990301',agent,'2026-10'));
  console.log('PASS Reset preserves new/legacy locks, re-acknowledgement and remaining signatures work, other Agents/months remain editable');

  const bGuard='qa_signature_documents/2026-09::Fixture Agent B';
  const staleRevision=fixture.docs.get(bGuard).resultRevision;
  await app.upsertStoredEvaluation({...evaluation('AA990201','Fixture Agent B'),finalScore:95});
  await assert.rejects(app.saveStoredSignatureConfirm('2026-09::Fixture Agent B',ackAt,{expectedRevision:staleRevision}),/ตรวจคะแนนล่าสุด/);
  assert.equal(fixture.docs.get(bGuard).confirmedAt,undefined,'stale preview cannot acknowledge changed scores');
  fixture.beforeCommit=()=>seed(bGuard,{...fixture.docs.get(bGuard),confirmedAt:ackAt,resultLockedAt:ackAt});
  const originalB=structuredClone(fixture.docs.get('qa_evaluations/AA990201'));
  await assert.rejects(app.upsertStoredEvaluation({...evaluation('AA990201','Fixture Agent B'),finalScore:99}),app.MonthlyResultLockedError);
  assert.deepEqual(fixture.docs.get('qa_evaluations/AA990201'),originalB,'acknowledgement winning a concurrent write leaves the original evaluation intact');
  fixture.offline=true;
  await assert.rejects(app.upsertStoredEvaluation(evaluation('AA990303',agent,'2026-10')),app.MonthlyResultLockCheckError);
  fixture.offline=false;
  assert.ok(!fixture.docs.has('qa_evaluations/AA990303'));
  const octoberGuard='qa_signature_documents/2026-10::'+agent;
  fixture.beforeCommit=()=>seed(octoberGuard,{...fixture.docs.get(octoberGuard),confirmedAt:ackAt,resultLockedAt:ackAt});
  const eventCount=[...fixture.docs.keys()].filter(key=>key.startsWith('qa_appeal_events/')).length;
  await assert.rejects(app.writeAppealEvent(owner,'appeal_request_submitted',{...appeal,case_id:'AA990301',details:{...appeal.details,requestId:'racing-appeal',monthKey:'2026-10',auditDate:'2026-10-20'}}),app.MonthlyResultLockedError);
  assert.equal([...fixture.docs.keys()].filter(key=>key.startsWith('qa_appeal_events/')).length,eventCount,'an appeal racing with acknowledgement never persists');
  console.log('PASS fresh revision rejects stale scores, atomic contention prevents writing past acknowledgement, offline checks fail closed');

  root=createRoot(document.getElementById('root'));
  await act(async()=>root.render(React.createElement(app.Review,{currentUser:qa,allowReview:true,externalRequestId:'appeal-fixture',externalCaseId:'AA990101'})));
  for(let i=0;i<80;i++){await act(async()=>new Promise(done=>setTimeout(done,5)));if(document.body.textContent.includes(app.MONTHLY_RESULT_LOCK_MESSAGE))break;}
  assert.ok(document.body.textContent.includes(app.MONTHLY_RESULT_LOCK_MESSAGE),'QA sees the locked month explanation');
  for(const label of ['Reset This Task','แก้ไขผลอุทธรณ์','Save Review']){
    const button=[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===label);
    assert.ok(button?.disabled,label+' is disabled after acknowledgement');
  }
  assert.ok(document.body.textContent.includes('Reason'),'earlier appeal history remains readable');
  console.log('PASS actual QA Review keeps history readable and disables review editing, Reset and score decisions');
} finally {
  if(root)await act(async()=>root.unmount());
  await rm(temp,{recursive:true,force:true});
  dom.window.close();
  globalThis.fetch=originalFetch;
  console.warn=originalWarn;
  for(const [key,descriptor]of originals)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  delete globalThis.__monthlyResultFixture;
}
