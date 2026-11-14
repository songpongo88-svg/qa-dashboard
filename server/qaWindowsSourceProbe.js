// Windows-only Firestore listener PROBE. STAGING, never a live replication
// source or a cutover certification. Does not write data to Firestore/PG.
// A snapshot listener consumes Firestore reads, including initial snapshots
// and reconnects (which this adapter cannot reliably count in advance).
import {QA_SYNC_DATASETS} from './qaLiveMirrorStage.js';
const fail=x=>{throw Object.assign(new Error(x),{code:x});};
const DOC=/^[^\x00-\x1f\x7f/]{1,900}$/;
const EXACT_PROJECT='qa-dashboard-b0b5d';
const finite=n=>Number.isSafeInteger(n)&&n>=0;
export function planQaWindowsReadOnlyProbe({
 expectedIds, initialReadBudget=3000,maxChangesPerSnapshot=64,
}={}){
 if(!expectedIds||typeof expectedIds!=='object'||Array.isArray(expectedIds)||
    Object.keys(expectedIds).length!==QA_SYNC_DATASETS.length)
   fail('qa_probe_requires_all_dataset_id_manifests');
 if(!Number.isSafeInteger(initialReadBudget)||initialReadBudget<11||
    initialReadBudget>3000||!Number.isSafeInteger(maxChangesPerSnapshot)||
    maxChangesPerSnapshot<1||maxChangesPerSnapshot>64)
   fail('qa_probe_unbounded_budget');
 const manifests=new Map(),sets=new Map();
 let estimated=0;
 for(const dataset of QA_SYNC_DATASETS){
  const ids=expectedIds[dataset];
  if(!Array.isArray(ids)||ids.length>50000||ids.some(id=>typeof id!=='string'||
    !DOC.test(id))||new Set(ids).size!==ids.length)
    fail('qa_probe_invalid_dataset_ids');
  sets.set(dataset,new Set(ids));
  manifests.set(dataset,ids.length);
  estimated+=Math.max(1,ids.length);
 }
 if(estimated>initialReadBudget)fail('qa_probe_initial_reads_budget_exceeded');
 return Object.freeze({datasetCount:QA_SYNC_DATASETS.length,
   estimatedInitialReads:estimated,maxChangesPerSnapshot,sets,manifests});
}

export async function startQaWindowsReadOnlyProbe({
 firestore,expectedIds,authenticateSource,reserveBudget,
 persistSignal,onUnsafe,env=process.env,
 maxChangesPerSnapshot=64,initialReadBudget=3000,
 setDeadline=(fn,ms)=>setTimeout(fn,ms),
 clearDeadline=handle=>clearTimeout(handle),
}={}){
 if(env.QA_WINDOWS_SOURCE_PROBE!=='1'||env.QA_FAILOVER!=='OFF'||
    typeof firestore?.collection!=='function'||
    typeof authenticateSource!=='function'||
    typeof reserveBudget!=='function'||
    typeof persistSignal!=='function'||typeof onUnsafe!=='function')
    fail('qa_probe_disabled_or_missing_private_dependencies');
 const plan=planQaWindowsReadOnlyProbe({
   expectedIds,initialReadBudget,maxChangesPerSnapshot});
 const proof=await authenticateSource();
 if(proof?.authority!=='qa-windows-readonly-source'||
    proof?.projectId!==EXACT_PROJECT||proof?.readonly!==true)
   fail('qa_probe_unverified_source_identity');
 const reservation=await reserveBudget(Object.freeze({
   projectId:EXACT_PROJECT,
   collections:QA_SYNC_DATASETS.length,
   estimatedInitialReads:plan.estimatedInitialReads,
   purpose:'qa-windows-probe-initial-subscriptions',
 }));
 if(reservation?.reserved!==true||reservation?.projectId!==EXACT_PROJECT||
    !finite(reservation?.units)||reservation.units<plan.estimatedInitialReads)
   fail('qa_probe_source_read_reservation_missing');
 const unsubscribers=[],seen=new Set();
 let stopped=false,ready=false,chain=Promise.resolve(),reason='not_ready',timer;
 const stop=why=>{
  if(stopped)return;
  stopped=true;ready=false;reason=why;
  if(timer!==undefined)clearDeadline(timer);
  for(const unsub of unsubscribers)try{unsub();}catch{}
 };
 const unsafe=why=>{
  if(stopped)return;
  stop(why);
  try{onUnsafe(Object.freeze({reason:why,requiresReconciliation:true,
    failoverReady:false}));}catch{}
 };
 const docId=doc=>typeof doc?.id==='string'&&DOC.test(doc.id)?doc.id:fail('qa_probe_invalid_doc');
 const handle=(dataset,snapshot)=>{
  if(stopped)return;
  if(!snapshot||!Array.isArray(snapshot.docs)||
    typeof snapshot.docChanges!=='function')return unsafe('qa_probe_invalid_snapshot');
  const currentIds=new Set(snapshot.docs.map(docId));
  if(currentIds.size!==snapshot.docs.length)
    return unsafe('qa_probe_duplicate_snapshot_id');
  if(!seen.has(dataset)){
   seen.add(dataset);
   const expected=plan.sets.get(dataset);
   if(expected.size!==currentIds.size||
      [...currentIds].some(id=>!expected.has(id)))
     return unsafe('qa_probe_baseline_mismatch');
   if(seen.size===plan.datasetCount)ready=true;
   // First snapshot "added" entries are baseline, not incremental events.
   return;
  }
  // If a dataset changes while the other initial snapshots are in flight,
  // the set of 11 initial snapshots is not a consistent baseline.
  if(!ready)return unsafe('qa_probe_bootstrap_race_reconcile');
  const changes=snapshot.docChanges();
  if(!Array.isArray(changes)||changes.length>plan.maxChangesPerSnapshot)
    return unsafe('qa_probe_change_batch_requires_reconcile');
  const expected=plan.sets.get(dataset);
  for(const ch of changes){
   const id=docId(ch.doc);
   if(!['added','modified','removed'].includes(ch.type))
    return unsafe('qa_probe_unknown_change_type');
   if(ch.type==='removed')expected.delete(id);
   else expected.add(id);
   // No data payload, secret, score or unverified Firestore timestamp
   // enters this signal. A separate authoritative source read is needed.
   const event=Object.freeze({collection:dataset,documentId:id,
     changeType:ch.type,authoritativeDocument:false,
     sourceCommitVerified:false,requiresSourceRead:true});
   chain=chain.then(async()=>{
    if(stopped)return;
    const receipt=await persistSignal(event);
    if(receipt?.durable!==true||receipt?.sourceCommitVerified!==false)
      fail('qa_probe_signal_not_durable');
   }).catch(()=>unsafe('qa_probe_durable_signal_failed'));
  }
 };
 // Limit lifetime and require a new independently budgeted baseline on
 // restart. This does NOT cap invisible SDK reconnect reads.
 timer=setDeadline(()=>unsafe('qa_probe_timebox_expired'),15*60*1000);
 try{
  for(const dataset of QA_SYNC_DATASETS){
   if(stopped)break;
   const query=firestore.collection(dataset);
   if(typeof query?.onSnapshot!=='function')
     fail('qa_probe_firestore_listener_missing');
   const detach=query.onSnapshot(
    snap=>{try{handle(dataset,snap);}catch{unsafe('qa_probe_callback_error');}},
    ()=>unsafe('qa_probe_listener_error'));
   if(typeof detach!=='function')fail('qa_probe_detach_missing');
   unsubscribers.push(detach);
  }
 }catch(error){unsafe('qa_probe_attach_failed');throw error;}
 return Object.freeze({
  status:()=>Object.freeze({active:!stopped,ready:ready&&!stopped,
    initialDatasetsReceived:seen.size,
    expectedDatasets:plan.datasetCount,reason,
    initialReadReservation:plan.estimatedInitialReads,
    failoverReady:false}),
  drain:()=>chain,
  stop:()=>stop('operator_stopped'),
 });
}
