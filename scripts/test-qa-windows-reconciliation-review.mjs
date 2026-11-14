import assert from 'node:assert/strict';
import {QA_SYNC_DATASETS,qaCanonicalDocumentHash,qaManifestDigest}
 from '../server/qaLiveMirrorStage.js';
import {inspectQaWindowsReconciliation}
 from '../server/qaWindowsReconciliationReview.js';
const baselineId='qa-reconcile-frozen-old';
const candidateId='qa-reconcile-candidate-new';
const doc=(ds,id,score)=>{const document_json={
 fields:{score:{integerValue:String(score)}},
 createTime:'2026-11-14T00:00:00.000000Z',
 updateTime:'2026-11-14T00:00:00.000000Z'};
 return {document_path:ds+'/'+id,root_collection:ds,document_json,
  content_hash:qaCanonicalDocumentHash(document_json)};
};
const original=QA_SYNC_DATASETS.map(ds=>doc(ds,'fixture',85));
const next=QA_SYNC_DATASETS.map(ds=>doc(ds,'fixture',85));
next[0]=doc(QA_SYNC_DATASETS[0],'fixture',86);
next.push(doc(QA_SYNC_DATASETS[1],'new',100));
next.splice(2,1);
const manifest=rows=>QA_SYNC_DATASETS.map(dataset=>{
 const vals=rows.filter(r=>r.root_collection===dataset);
 return {dataset,count:vals.length,digest:qaManifestDigest(vals.map(
  r=>({path:r.document_path,hash:r.content_hash})))};
});
const batch=(id,rows,date)=>({
 snapshot_id:id,status:'copy_verified',approved_for_failover:false,
 source_provenance:'verified-firestore-server-export',
 source_exported_at:date,source_documents:rows.length,
 stored_documents:rows.length,dataset_manifest:manifest(rows),
});
const oldBatch=batch(baselineId,original,'2026-11-13T00:00:00.000Z');
const newBatch=batch(candidateId,next,'2026-11-14T00:00:00.000Z');
const state={mode:'disabled',write_frozen:true,
 source_snapshot_verified:false,active_snapshot_id:baselineId};
let queries=0;
let bad=false,wrongState=false,corrupted=false,older=false;
const pool={async connect(){return{release(){},async query(sql){
  queries++;
  if(sql==='SELECT current_database() AS db')
   return {rows:[{db:'qa_cutover_ci_test'}]};
  if(sql.startsWith('BEGIN')||sql==='COMMIT'||sql==='ROLLBACK'||
     sql.startsWith('SET LOCAL'))return{rows:[]};
  if(sql.includes('FROM qa_failover_v1.state'))
   return{rows:[wrongState?{...state,mode:'standby'}:state]};
  if(sql.includes('FROM qa_failover_v1.live_snapshot_batches'))
   return{rows:[oldBatch,older?{...newBatch,source_exported_at:
     '2026-11-12T00:00:00.000Z'}:newBatch]};
  if(sql.includes('FROM qa_failover_v1.live_snapshot_rows'))
   return{rows:[
     ...original.map(r=>({...r,snapshot_id:baselineId})),
     ...next.map((r,i)=>({...r,snapshot_id:candidateId,
       content_hash:corrupted&&i===0?'f'.repeat(64):r.content_hash}))
   ].slice(0,bad?-1:undefined)};
  throw Error('unexpected query');
}}}};
const env={QA_WINDOWS_RECONCILE_REVIEW:'1',QA_FAILOVER:'OFF',
 QA_PG_ISOLATED_TEST:'1'};
const opts={pool,candidateSnapshotId:candidateId,env};
await assert.rejects(inspectQaWindowsReconciliation({...opts,
 env:{...env,QA_WINDOWS_RECONCILE_REVIEW:'0'}}),
 /qa_reconcile_readonly_disabled/);
assert.equal(queries,0);
const result=await inspectQaWindowsReconciliation(opts);
assert.equal(result.baselineDocuments,11);
assert.equal(result.candidateDocuments,11);
assert.deepEqual([result.added,result.removed,result.modified,result.unchanged],
 [1,1,1,9]);
assert.equal(result.changedDatasets,3);
assert.equal(result.failoverReady,false);
bad=true;await assert.rejects(inspectQaWindowsReconciliation(opts),
 /qa_reconcile_unverified_batch/);
bad=false;corrupted=true;
await assert.rejects(inspectQaWindowsReconciliation(opts),
 /qa_reconcile_corrupt_snapshot/);
corrupted=false;wrongState=true;
await assert.rejects(inspectQaWindowsReconciliation(opts),
 /qa_reconcile_frozen_baseline_required/);
wrongState=false;older=true;
await assert.rejects(inspectQaWindowsReconciliation(opts),
 /qa_reconcile_candidate_not_newer/);
console.log('PASS QA reconciliation review: read-only, 11 digest checks, add/remove/modify, old archive remains frozen');
