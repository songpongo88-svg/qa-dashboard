import assert from 'node:assert/strict';
import {QA_SYNC_DATASETS,qaCanonicalDocumentHash,qaManifestDigest}
 from '../server/qaLiveMirrorStage.js';
import {loadQaWindowsProbeBaseline}
 from '../server/qaWindowsProbeBaseline.js';
const snapshotId='qa-test-baseline-20261114';
const revision='2026-11-14T10:00:00.123456Z';
const rows=QA_SYNC_DATASETS.map(ds=>{
 const path=ds+'/fixture001',json={fields:{name:{stringValue:'fixture'}},
   createTime:'2026-11-14T09:00:00Z',updateTime:revision};
 return {document_path:path,root_collection:ds,document_json:json,
  content_hash:qaCanonicalDocumentHash(json)};
});
const manifest=QA_SYNC_DATASETS.map(ds=>({
 dataset:ds,count:1,digest:qaManifestDigest(rows.filter(row=>
 row.root_collection===ds).map(row=>({
 path:row.document_path,hash:row.content_hash,
 }))),
}));
const state={mode:'disabled',write_frozen:true,
 source_snapshot_verified:false,active_snapshot_id:snapshotId};
const batch={status:'copy_verified',approved_for_failover:false,
 source_provenance:'verified-firestore-server-export',
 source_documents:11,stored_documents:11,dataset_manifest:manifest};
let touched=0,extraRows=rows,overrideState=state,overrideBatch=batch;
const pool={async connect(){return{release(){},async query(sql){
 touched++;
 if(sql==='SELECT current_database() AS db')return{rows:[{db:'qa_cutover_ci_test'}]};
 if(sql.startsWith('BEGIN')||sql==='COMMIT'||sql==='ROLLBACK')return{rows:[]};
 if(sql.includes('qa_failover_v1.state'))return{rows:[overrideState]};
 if(sql.includes('qa_failover_v1.live_snapshot_batches'))return{rows:[overrideBatch]};
 if(sql.includes('qa_failover_v1.live_snapshot_rows'))return{rows:extraRows};
 throw Error('unexpected SQL');
}}}};
const env={QA_WINDOWS_SOURCE_PROBE_MANIFEST:'1',QA_FAILOVER:'OFF',
 QA_PG_ISOLATED_TEST:'1'};
await assert.rejects(loadQaWindowsProbeBaseline({pool,env:{
 ...env,QA_WINDOWS_SOURCE_PROBE_MANIFEST:'0'}}),/qa_manifest_disabled/);
assert.equal(touched,0);
const result=await loadQaWindowsProbeBaseline({pool,env});
assert.equal(result.completeCopiedDatasetCount,11);
assert.equal(result.estimatedInitialReads,11);
assert.equal(result.expectedRevisions.qa_evaluations.fixture001,revision);
assert.equal(result.failoverReady,false);
overrideState={...state,mode:'standby'};
await assert.rejects(loadQaWindowsProbeBaseline({pool,env}),
 /qa_manifest_standby_must_remain_frozen/);
overrideState=state;
extraRows=rows.slice(1);
await assert.rejects(loadQaWindowsProbeBaseline({pool,env}),
 /qa_manifest_incomplete_local_snapshot/);
extraRows=rows.map((r,i)=>i===0?{...r,content_hash:'f'.repeat(64)}:r);
await assert.rejects(loadQaWindowsProbeBaseline({pool,env}),
 /qa_manifest_source_hash_mismatch/);
extraRows=rows.map((r,i)=>i===0?{...r,
 document_json:{...r.document_json,updateTime:'2026-11-14T10:00:01.000000Z'}}:r);
await assert.rejects(loadQaWindowsProbeBaseline({pool,env}),
 /qa_manifest_source_hash_mismatch/);
extraRows=rows;
overrideBatch={...batch,source_documents:3500,stored_documents:3500};
await assert.rejects(loadQaWindowsProbeBaseline({pool,env}),
 /qa_manifest_unverified_or_unbudgeted_snapshot/);
overrideBatch=batch;
const badManifest=manifest.map((m,i)=>i===0?{...m,digest:'a'.repeat(64)}:m);
overrideBatch={...batch,dataset_manifest:badManifest};
await assert.rejects(loadQaWindowsProbeBaseline({pool,env}),
 /qa_manifest_dataset_digest_mismatch/);
console.log('PASS baseline: 11 exact datasets, hashes, microsecond revisions, frozen gate, no Firestore reads');
