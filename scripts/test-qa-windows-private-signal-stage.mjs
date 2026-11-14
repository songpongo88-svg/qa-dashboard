// Offline composition test: no Firestore, Windows or production credentials.
import assert from 'node:assert/strict';
import {QA_SYNC_DATASETS,qaManifestDigest,qaCanonicalDocumentHash}
 from '../server/qaLiveMirrorStage.js';
import {startQaWindowsPrivateSignalStage}
 from '../server/qaWindowsPrivateSignalStage.js';
const snapshotId='qa-stage-composition-20261114';
const revision='2026-11-14T09:00:00.000000Z';
const docs=QA_SYNC_DATASETS.map(dataset=>{
 const document_json={fields:{marker:{stringValue:'fixture'}},
  createTime:'2026-11-14T08:00:00Z',updateTime:revision};
 return {document_path:dataset+'/fixture',root_collection:dataset,
  document_json,content_hash:qaCanonicalDocumentHash(document_json)};
});
const batch={status:'copy_verified',approved_for_failover:false,
 source_provenance:'verified-firestore-server-export',
 source_documents:11,stored_documents:11,
 dataset_manifest:QA_SYNC_DATASETS.map(dataset=>({
  dataset,count:1,digest:qaManifestDigest(docs.filter(row=>
   row.root_collection===dataset).map(row=>({path:row.document_path,
    hash:row.content_hash}))),
 }))};
const state={mode:'disabled',write_frozen:true,
 source_snapshot_verified:false,active_snapshot_id:snapshotId};
let attaches=0,inserts=0,subscriptions=new Map(),detaches=0;
const pool={async connect(){return{release(){},async query(sql,args=[]){
 if(sql==='SELECT current_database() AS db')return{rows:[{db:'qa_cutover_ci_test'}]};
 if(sql.startsWith('BEGIN')||sql==='COMMIT'||sql==='ROLLBACK'||
  sql.startsWith('SET LOCAL'))return{rows:[]};
 if(sql.includes('qa_failover_v1.state'))return{rows:[state]};
 if(sql.includes('qa_failover_v1.live_snapshot_batches'))return{rows:[batch]};
 if(sql.includes('qa_failover_v1.live_snapshot_rows'))return{rows:docs};
 if(sql.startsWith('INSERT INTO qa_windows_probe_v1.source_signals')){
  inserts++;return{rows:[{event_id:args[0]}]};
 }
 throw Error('unexpected SQL');
}}}};
const firestore={collection(ds){return{onSnapshot(cb,err){
 attaches++;subscriptions.set(ds,{cb,err});return()=>{detaches++};
}}}};
const env={QA_FAILOVER:'OFF',QA_WINDOWS_SOURCE_PROBE:'1',
 QA_WINDOWS_SOURCE_PROBE_MANIFEST:'1',QA_WINDOWS_SOURCE_SIGNAL_STAGE:'1',
 QA_PG_ISOLATED_TEST:'1'};
const onUnsafe=()=>{};
const opts={env,pool,firestore,onUnsafe,
 authenticateSource:async()=>({authority:'qa-windows-readonly-source',
  projectId:'qa-dashboard-b0b5d',readonly:true}),
 reserveBudget:async r=>({reserved:true,projectId:r.projectId,
  units:r.estimatedInitialReads}),
 attestLocalProbe:async e=>({authority:'qa-local-readonly-probe',
  snapshotId:e.snapshotId,eventId:e.eventId,
  collection:e.collection,documentId:e.documentId,
  changeType:e.changeType,observedRevision:e.observedRevision,
  sourceCommitVerified:false}),
 setDeadline:()=>123,clearDeadline:()=>{},
};
await assert.rejects(startQaWindowsPrivateSignalStage({...opts,
 env:{...env,QA_WINDOWS_SOURCE_SIGNAL_STAGE:'0'}}),
 /qa_windows_signal_stage_disabled/);
assert.equal(attaches,0);
const stage=await startQaWindowsPrivateSignalStage(opts);
const snap=(ids,changes=[])=>({docs:ids.map(id=>({
 id,updateTime:{seconds:Date.parse('2026-11-14T09:00:00Z')/1000,nanoseconds:0},
})),docChanges:()=>changes.map(([type,id])=>({
 type,doc:{id,updateTime:{seconds:Date.parse('2026-11-14T09:00:00Z')/1000,
 nanoseconds:0}}})),
});
for(const dataset of QA_SYNC_DATASETS)
 subscriptions.get(dataset).cb(snap(['fixture']));
assert.equal(stage.status().ready,true);
assert.equal(stage.status().failoverReady,false);
assert.equal(inserts,0);
subscriptions.get('qa_evaluations').cb(snap(['fixture','new'],[['added','new']]));
await stage.drain();
assert.equal(inserts,1);
assert.equal(stage.status().verifiedSourceDeltaCount,0);
stage.stop();
assert.equal(stage.status().active,false);
assert.equal(detaches,11);
console.log('PASS QA Windows private probe integration: frozen manifest, one durable metadata signal, no source claim');
