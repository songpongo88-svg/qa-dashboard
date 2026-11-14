import assert from 'node:assert/strict';
import {QA_SYNC_DATASETS} from '../server/qaLiveMirrorStage.js';
import {planQaWindowsReadOnlyProbe,startQaWindowsReadOnlyProbe}
 from '../server/qaWindowsSourceProbe.js';
const expectedIds=Object.fromEntries(QA_SYNC_DATASETS.map(ds=>[ds,[ds+'-doc']]));
const stamp=(iso)=>({seconds:Date.parse(iso)/1000,nanoseconds:0});
const baselineTime='2026-11-14T07:00:00.000000Z';
const expectedRevisions=Object.fromEntries(QA_SYNC_DATASETS.map(
 ds=>[ds,{[ds+'-doc']:baselineTime}]));
const manifest={expectedIds,expectedRevisions};
assert.equal(planQaWindowsReadOnlyProbe(manifest).datasetCount,11);
assert.throws(()=>planQaWindowsReadOnlyProbe({...manifest,initialReadBudget:10}),
 /qa_probe_unbounded_budget/);
assert.throws(()=>planQaWindowsReadOnlyProbe({...manifest,expectedIds:{
 ...expectedIds,qa_evaluations:['duplicate','duplicate']}}),
 /qa_probe_invalid_dataset_ids/);
assert.throws(()=>planQaWindowsReadOnlyProbe({...manifest,expectedIds:{
 ...expectedIds,qa_evaluations:Array.from({length:3001},(_,i)=>String(i))},
 expectedRevisions:{...expectedRevisions,qa_evaluations:Object.fromEntries(
  Array.from({length:3001},(_,i)=>[String(i),baselineTime]))}}),
 /qa_probe_initial_reads_budget_exceeded/);
const subscriptions=new Map(),signals=[],unsafe=[],detaches=[];
const firestore={collection(ds){return{onSnapshot(callback,error){
 subscriptions.set(ds,{callback,error});
 return()=>detaches.push(ds);
}}}};
const attest=async()=>({authority:'qa-windows-readonly-source',
 projectId:'qa-dashboard-b0b5d',readonly:true});
const reserve=async req=>({reserved:true,projectId:req.projectId,
 units:req.estimatedInitialReads});
const callback=async event=>{signals.push(event);return{
 durable:true,sourceCommitVerified:false}};
const env={QA_WINDOWS_SOURCE_PROBE:'1',QA_FAILOVER:'OFF'};
const snapshot=(ids,changes=[],rev='2026-11-14T07:00:00Z')=>({
 docs:ids.map(id=>({id,updateTime:stamp(rev)})),
 docChanges:()=>changes.map(([type,id])=>({type,doc:{id,updateTime:stamp(rev)}})),
});
const opt={firestore,...manifest,authenticateSource:attest,
 reserveBudget:reserve,persistSignal:callback,
 onUnsafe:x=>unsafe.push(x),env,
 setDeadline:()=>123,clearDeadline:()=>{}};
await assert.rejects(startQaWindowsReadOnlyProbe({...opt,
 env:{...env,QA_WINDOWS_SOURCE_PROBE:'0'}}),
 /qa_probe_disabled_or_missing_private_dependencies/);
assert.equal(subscriptions.size,0);
assert.throws(()=>planQaWindowsReadOnlyProbe({expectedIds}),
 /qa_probe_requires_exact_revision_manifests/);
const probe=await startQaWindowsReadOnlyProbe(opt);
for(const ds of QA_SYNC_DATASETS)
 subscriptions.get(ds).callback(snapshot([ds+'-doc'],[['added',ds+'-doc']]));
assert.equal(probe.status().ready,true);
assert.equal(signals.length,0);
subscriptions.get('qa_evaluations').callback(
 snapshot(['qa_evaluations-doc','new'],[['added','new']]));
await probe.drain();
assert.equal(signals.length,1);
assert.deepEqual(signals[0],{
 collection:'qa_evaluations',documentId:'new',changeType:'added',
 observedRevision:'2026-11-14T07:00:00.000000Z',
 authoritativeDocument:false,sourceCommitVerified:false,requiresSourceRead:true,
});
subscriptions.get('qa_appeal_events').callback(snapshot([], [['removed','qa_appeal_events-doc']]));
await probe.drain();
assert.equal(signals.length,2);
assert.equal(signals[1].changeType,'removed');
probe.stop();
assert.equal(probe.status().ready,false);
assert.equal(detaches.length,11);
// Bootstrap mismatch must stop *before* emitting any incremental event.
const f=await startQaWindowsReadOnlyProbe(opt);
subscriptions.get('qa_evaluations').callback(snapshot(['wrong']));
assert.equal(f.status().active,false);
assert.equal(unsafe.at(-1).reason,'qa_probe_baseline_mismatch');
// Same document IDs with changed revisions are NOT considered in sync.
const fm=await startQaWindowsReadOnlyProbe(opt);
subscriptions.get('qa_evaluations').callback(snapshot(['qa_evaluations-doc'],[],
 '2026-11-14T07:00:10Z'));
assert.equal(fm.status().active,false);
assert.equal(unsafe.at(-1).reason,'qa_probe_baseline_revision_mismatch');
// Failed durable storage stops and detaches the source watchers.
const f2=await startQaWindowsReadOnlyProbe({...opt,
 persistSignal:async()=>{throw Error('disk unavailable');}});
for(const ds of QA_SYNC_DATASETS)
 subscriptions.get(ds).callback(snapshot([ds+'-doc']));
subscriptions.get('qa_evaluations').callback(snapshot(
 ['qa_evaluations-doc','another'],[['added','another']]));
await f2.drain();
assert.equal(f2.status().active,false);
assert.equal(unsafe.at(-1).reason,'qa_probe_durable_signal_failed');
// A change during the 11-listener bootstrap is inconsistent and unsafe.
const f3=await startQaWindowsReadOnlyProbe(opt);
subscriptions.get('qa_evaluations').callback(snapshot(['qa_evaluations-doc']));
subscriptions.get('qa_evaluations').callback(snapshot(
 ['qa_evaluations-doc','early'],[['added','early']]));
assert.equal(f3.status().active,false);
assert.equal(unsafe.at(-1).reason,'qa_probe_bootstrap_race_reconcile');
console.log('PASS QA Windows Firestore probe: reserved initial reads, no baseline echo, rejected mismatch, durable signals, fails closed');
