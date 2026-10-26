import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {webcrypto} from 'node:crypto';
import {JSDOM} from 'jsdom';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const dom=new JSDOM('<div id="root"></div>',{url:'https://qa.test'});
for(const key of ['window','document','localStorage','sessionStorage','CustomEvent','Event'])globalThis[key]=dom.window[key];
const temporary=await fs.mkdtemp(path.resolve('.evaluation-visibility-test-'));
const f=globalThis.__evaluationVisibility={docs:new Map(),versions:new Map(),writes:[],offline:false,failCommit:false,streamCount:0,callbacks:new Set(),reads:0,beforeCommit:null};
const firestore=`
 const f=globalThis.__evaluationVisibility;
 export const collection=(_db,name)=>({name}),doc=(_db,name,id)=>({name,id,path:name+'/'+id}),query=(source,...constraints)=>({source,constraints});
 export const where=(field,op,value)=>({field,op,value}),orderBy=(field,direction)=>({field,direction}),limit=n=>({limit:n}),startAfter=()=>({}),documentId=()=> '__name__';
 export const getFirestore=()=>({}),serverTimestamp=()=>'<server>',deleteField=()=>({__delete:true});
 const snap=ref=>({id:ref.id,exists:()=>f.docs.has(ref.path),data:()=>structuredClone(f.docs.get(ref.path))});
 const listing=ref=>{let rows=[...f.docs].filter(([p])=>p.startsWith((ref.source||ref).name+'/'));for(const c of ref.constraints||[])if(c.op)rows=rows.filter(([p,r])=>{const v=c.field==='__name__'?p.split('/').pop():r[c.field];return c.op==='=='?v===c.value:c.op==='in'?c.value.includes(v):true});return {metadata:{fromCache:false,hasPendingWrites:false},docs:rows.map(([p])=>snap({id:p.split('/').pop(),path:p}))};};
 export async function getDoc(ref){if(f.offline)throw Error('offline fixture');f.reads++;return snap(ref)}
 export const getDocFromServer=getDoc;
 export async function getDocs(ref){if(f.offline)throw Error('offline fixture');f.reads++;return listing(ref)}
 export const getDocsFromServer=getDocs;
 function notify(){for(const cb of f.callbacks)cb(listing({name:'qa_evaluation_progress'}))} f.notify=notify;
 function apply(writes){for(const [ref,data,options]of writes){if(data===null)f.docs.delete(ref.path);else{const row=options?.merge?{...f.docs.get(ref.path)}:{};for(const [k,v]of Object.entries(data)){if(v?.__delete)delete row[k];else row[k]=structuredClone(v)}f.docs.set(ref.path,row)}f.versions.set(ref.path,(f.versions.get(ref.path)||0)+1);f.writes.push([ref.path,data]);}notify()}
 export async function setDoc(ref,data,options){if(f.offline)throw Error('offline fixture');apply([[ref,data,options]])}
 export async function deleteDoc(ref){apply([[ref,null]])}
 export function onSnapshot(ref,options,next,error){f.streamCount++;f.callbacks.add(next);next(listing(ref));return()=>f.callbacks.delete(next)}
 export async function runTransaction(_db,callback){for(let n=0;n<5;n++){if(f.offline)throw Error('offline fixture');const reads=new Map(),writes=[];
 const result=await callback({get:async ref=>{assertRead();reads.set(ref.path,f.versions.get(ref.path)||0);return snap(ref)},set:(ref,data,options)=>writes.push([ref,data,options]),update:(ref,data)=>writes.push([ref,data,{merge:true}]),delete:ref=>writes.push([ref,null])});
 function assertRead(){if(writes.length)throw Error('Read after write')}
 if(f.beforeCommit){const cb=f.beforeCommit;f.beforeCommit=null;await cb()}
 if([...reads].some(([p,v])=>(f.versions.get(p)||0)!==v))continue;
 if(f.failCommit){f.failCommit=false;throw Error('commit fixture failure')}
 apply(writes);return result;}throw Error('contention fixture')}
`;
const plugins=[{name:'evaluation-backend-boundary',setup(b){
 b.onResolve({filter:/^firebase\/firestore$/},()=>({path:'firestore',namespace:'fixture'}));
 b.onResolve({filter:/^firebase\/app$/},()=>({path:'app',namespace:'fixture'}));
 b.onResolve({filter:/^firebase\/storage$/},()=>({path:'storage',namespace:'fixture'}));
 b.onResolve({filter:/[\/]firebaseClient$/},()=>({path:'client',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'js',contents:args.path==='firestore'?firestore:args.path==='app'?'export const initializeApp=()=>({}),getApps=()=>[];':args.path==='storage'?'export const getStorage=()=>({}),ref=()=>({}),getDownloadURL=async()=>"",uploadBytes=async()=>({}),uploadBytesResumable=()=>({});':'export const firebaseDb={},firebaseApp={};'}));
}}];
const tick=()=>new Promise(r=>setTimeout(r,0));
let stopA,stopB,stopViewer;
try{
 const outfile=path.join(temporary,'backend.mjs');
 await build({stdin:{contents:"export * from './src/evaluationActivity';export * from './src/evaluationActivityStore';export * from './src/evaluationEditingStore';export * from './src/evaluationStore';export * from './src/pendingAppealScore';export * from './src/qaEvaluationProgressStore';",resolveDir:process.cwd(),loader:'ts'},outfile,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent',define:{'import.meta.env':JSON.stringify({VITE_FIREBASE_API_KEY:'fixture',VITE_FIREBASE_PROJECT_ID:'fixture',VITE_FIREBASE_APP_ID:'fixture'})},plugins});
 const api=await import(pathToFileURL(outfile));
 const record={id:'saved-case',evaluationKey:'saved-case',evaluationMonthKey:'2026-10',caseId:'AA999001',agentName:'Fixture Agent A',targetUsername:'agent-a',targetDisplayName:'Fixture Agent A',targetEmail:'',targetRole:'Admin Live Chat',auditDate:'2026-10-06',auditTimestamp:'2026-10-07T01:00:00Z',waitingTime:'',serviceTime:'',caseUrl:'',inquiry:'Fixture',caseDescription:'Private case text',evidenceUrls:[],criticalError:false,finalScore:90,grade:'A',qaScheme:'fixture',rubricName:'Fixture',rubricPeriod:'fixture',completedTopics:1,totalTopics:1,strengths:[],improvements:[],topics:[{code:'1',title:'Process',score:90,max:100,comment:'Private original comment'}],rawDataPreview:{},evaluatorUsername:'qa-a',evaluatorName:'QA A',submittedAt:'2026-10-07T01:00:00Z'};
 await api.upsertStoredEvaluation(record);
 const begin={evaluationId:record.id,caseId:record.caseId,username:'agent-a',displayName:record.agentName,monthKey:'2026-10',evaluatorUsername:'qa-a',evaluatorName:'QA A'};
 const token=await api.beginEvaluationEdit(begin),lockPath='qa_evaluation_progress/'+api.evaluationEditDocId(record.id);
 assert.equal(f.docs.get(lockPath).workflowEdit,true);
 await assert.rejects(api.beginEvaluationEdit({...begin,evaluatorUsername:'qa-b'}),/Another QA/);
 const activity=await api.fetchEvaluationActivity();
 const cases=[{id:'saved-case',agent:record.agentName,caseId:record.caseId,monthKey:'2026-10',finalScore:90},{id:'other-case',agent:record.agentName,caseId:'AA999002',monthKey:'2026-10',finalScore:92},{agent:'Fixture Agent B',caseId:record.caseId,monthKey:'2026-10',finalScore:96},{agent:record.agentName,caseId:record.caseId,monthKey:'2026-09',finalScore:88}];
 const decorated=api.withEvaluationActivity(cases,activity);
 assert.equal(api.getAppealScoreHold(decorated.slice(0,2)).label,'Editing in Progress');assert.equal(api.getAppealScoreHold(decorated.slice(2)),null);
 assert.deepEqual(decorated.map(r=>r.finalScore),[90,92,96,88]);
 for(const role of ['Admin Live Chat','Agent','Senior','Supervisor','System Admin'])assert.equal(api.evaluationCaseBlocked(cases[0],activity,{role}),true,role);
 assert.equal(api.evaluationCaseBlocked(cases[0],activity,{role:'Quality Assurance'}),false);
 assert.equal(api.evaluationCaseBlocked(cases[1],activity,{role:'Agent'}),false);
 assert.equal(api.evaluationCaseBlocked(cases[3],activity,{role:'Agent'}),false);
 assert.equal(api.evaluationCaseBlocked(cases[0],{...activity,now:Date.now()+86400000},{role:'Agent'}),true);
 await assert.rejects(api.assertEvaluationCaseVisible(cases[0],{role:'Supervisor'}),/Editing in Progress/);
 await assert.rejects(api.assertEvaluationScopeComplete([record.agentName],['2026-10']),/Editing in Progress/);
 await api.assertEvaluationScopeComplete([record.agentName],['2026-09']);
 console.log('PASS durable edits, all non-QA roles, QA access, unrelated case/month/Agent and unchanged saved numbers');
 f.failCommit=true;
 await assert.rejects(api.upsertStoredEvaluation({...record,finalScore:98,editingWorkflowToken:token}),/commit fixture failure/);
 assert.equal(f.docs.get('qa_evaluations/saved-case').final_score,90);assert.ok(f.docs.has(lockPath));
 await api.upsertStoredEvaluation({...record,finalScore:98,editingWorkflowToken:token});
 assert.equal(f.docs.get('qa_evaluations/saved-case').final_score,98);assert.equal(f.docs.has(lockPath),false);
 assert.ok(!('editingWorkflowToken' in f.docs.get('qa_evaluations/saved-case')));
 await assert.rejects(api.upsertStoredEvaluation({...record,finalScore:12,editingWorkflowToken:token}),/Edit Session Ended/);
 assert.equal(f.docs.get('qa_evaluations/saved-case').final_score,98);
 const cancelToken=await api.beginEvaluationEdit(begin);await api.cancelEvaluationEdit(record.id,cancelToken,'qa-a');
 assert.equal(f.docs.has(lockPath),false);assert.equal(f.docs.get('qa_evaluations/saved-case').final_score,98);
 console.log('PASS atomic save/unhide, failed save retains original and lock, stale edit rejected, explicit Cancel restores saved result');
 const live=api.normalizeEvaluationActivity({username:'agent-a',displayName:record.agentName,evaluatorUsername:'qa-a',mode:'evaluation',monthKey:'2026-10',expiresAt:new Date(Date.now()+60000).toISOString()},'lease');
 const active={ready:true,error:false,records:[live],now:Date.now()};
 assert.equal(api.getAppealScoreHold(api.withEvaluationActivity(cases,active)).label,'Evaluation in Progress');
 assert.equal(api.evaluationScopeHold({...active,records:[{...live,isTestCase:true}]},[record.agentName],['2026-10']),null);
 assert.equal(api.evaluationScopeHold({...active,now:Date.now()+120000},[record.agentName],['2026-10']),null);
 assert.equal(api.evaluationScopeHold({...active,ready:false},[record.agentName],['2026-10']).label,'Evaluation Status Unavailable');
 const lease={username:'agent-a',displayName:record.agentName,role:'Agent',evaluatorUsername:'qa-a',evaluatorName:'QA A',completedCount:1,targetCount:10,statusText:'',monthKey:'2026-10',contextId:'tab-a',leaseToken:'old'};
 await api.setQaEvaluationProgress(lease);await api.setQaEvaluationProgress({...lease,leaseToken:'new'});
 const leasePath='qa_evaluation_progress/'+api.evaluationProgressDocId('agent-a','qa-a','tab-a');
 await api.clearQaEvaluationProgress('agent-a','qa-a','tab-a','old');assert.ok(f.docs.has(leasePath));
 await api.clearQaEvaluationProgress('agent-a','qa-a','tab-a','new');assert.equal(f.docs.has(leasePath),false);
 const persistentToken=await api.beginEvaluationEdit(begin);
 await api.clearQaEvaluationProgressByEvaluator('qa-a');assert.ok(f.docs.has(lockPath));
 await api.cancelEvaluationEdit(record.id,persistentToken,'qa-a');
 stopA=api.subscribeEvaluationActivity(()=>{});stopB=api.subscribeEvaluationActivity(()=>{});await tick();
 assert.equal(f.streamCount,1);assert.equal(api.getEvaluationActivitySnapshot().ready,true);
 const viewerApi=await import(pathToFileURL(outfile).href+'?viewer');await viewerApi.fetchStoredEvaluations(300,{strict:true});
 let release;const delayed=new Promise(resolve=>release=resolve);
 viewerApi.configureEvaluationResultRefresh(async id=>{await delayed;await viewerApi.refreshStoredEvaluation(id)});
 stopViewer=viewerApi.subscribeEvaluationActivity(()=>{});await tick();
 await api.beginEvaluationEdit(begin);await tick();
 const delayedToken=f.docs.get(lockPath).editToken;
 await api.upsertStoredEvaluation({...record,finalScore:99,editingWorkflowToken:delayedToken});f.notify();await tick();
 assert.ok(viewerApi.getEvaluationActivitySnapshot().records.some(row=>row.persistent),'later snapshot cannot reveal a stale cached score');
 release();await tick();await tick();
 assert.equal(viewerApi.getEvaluationActivitySnapshot().ready,true);
 const reads=f.reads;const latestViewerRows=await viewerApi.fetchStoredEvaluations(300,{strict:true});assert.equal(f.reads,reads);
 assert.equal(latestViewerRows.find(row=>row.id==='saved-case').finalScore,99);
 f.offline=true;await assert.rejects(api.assertEvaluationCaseVisible(cases[0],{role:'Agent'}),/offline/);f.offline=false;
 console.log('PASS new evaluation hold, tests excluded, lease expiry/token cleanup, one shared listener, fresh exports and ordered cross-browser saved-score cache refresh');
}finally{stopViewer?.();stopA?.();stopB?.();await fs.rm(temporary,{recursive:true,force:true});dom.window.close();}
