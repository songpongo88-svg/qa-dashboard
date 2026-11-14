import assert from 'node:assert/strict';
import {qaCanonicalDocumentHash,qaManifestDigest,QA_SYNC_DATASETS} from '../server/qaLiveMirrorStage.js';
import {inspectQaWindowsPrivateStage}
 from './Check-QA-Windows-Private-Signal-Stage.mjs';
const snap='qa-windows-ci-snapshot-20261114';
const rev='2026-11-14T08:00:00.000000Z';
const rows=QA_SYNC_DATASETS.map(name=>{
 const document_json={fields:{fixture:{stringValue:'test'}},
  createTime:rev,updateTime:rev};
 return {document_path:name+'/example',root_collection:name,document_json,
 content_hash:qaCanonicalDocumentHash(document_json)};
});
const batch={status:'copy_verified',source_documents:11,stored_documents:11,
 approved_for_failover:false,source_provenance:'verified-firestore-server-export',
 dataset_manifest:QA_SYNC_DATASETS.map(ds=>({dataset:ds,count:1,
 digest:qaManifestDigest(rows.filter(x=>x.root_collection===ds).map(x=>({
 path:x.document_path,hash:x.content_hash})))}))};
const frozen={mode:'disabled',write_frozen:true,
 source_snapshot_verified:false,active_snapshot_id:snap};
let queries=0,serverVersion=170011,queueCount=0,publicUsage=false,manifestRows=rows;
const pool={
 async query(sql){
  queries++;
  if(sql.includes("current_setting('server_version_num')"))
   return{rows:[{name:'qa_dashboard_lab',version:serverVersion,recovering:false}]};
  if(sql.includes("to_regclass('qa_windows_probe_v1.source_signals')"))
   return{rows:[{signal_table:true,delta_table:true,snapshot_table:true}]};
  if(sql.includes('FROM qa_windows_probe_v1.source_signals'))
   return{rows:[{total:queueCount,unsafe:0}]};
  if(sql.includes('FROM pg_namespace n'))
   return{rows:[{public_usage:publicUsage}]};
  throw Error('Unexpected outer SQL');
 },
 async connect(){return{release(){},async query(sql){
  if(sql==='SELECT current_database() AS db')
   return{rows:[{db:'qa_cutover_ci_test'}]};
  if(sql.startsWith('BEGIN')||sql==='COMMIT'||sql==='ROLLBACK')return{rows:[]};
  if(sql.includes('qa_failover_v1.state'))return{rows:[frozen]};
  if(sql.includes('qa_failover_v1.live_snapshot_batches'))return{rows:[batch]};
  if(sql.includes('qa_failover_v1.live_snapshot_rows'))return{rows:manifestRows};
  throw Error('Unexpected inner SQL');
 }}}
};
const env={QA_WINDOWS_STAGE_ACCEPTANCE:'1',
 QA_WINDOWS_SOURCE_PROBE_MANIFEST:'1',
 QA_FAILOVER:'OFF',QA_PG_ISOLATED_TEST:'1'};
await assert.rejects(inspectQaWindowsPrivateStage({
 pool,env:{...env,QA_WINDOWS_STAGE_ACCEPTANCE:'0'}}),
 /qa_windows_acceptance_disabled/);
assert.equal(queries,0);
const ok=await inspectQaWindowsPrivateStage({pool,env});
assert.equal(ok.status,'LOCAL_PRIVATE_STAGE_VERIFIED');
assert.equal(ok.estimatedInitialReads,11);
assert.equal(ok.signalRows,0);
assert.equal(ok.failoverEnabledByThisCheck,false);
queueCount=1;
await assert.rejects(inspectQaWindowsPrivateStage({pool,env}),
 /qa_windows_stage_signal_queue_requires_review/);
queueCount=0;publicUsage=true;
await assert.rejects(inspectQaWindowsPrivateStage({pool,env}),
 /qa_windows_stage_public_acl_unsafe/);
publicUsage=false;serverVersion=160010;
await assert.rejects(inspectQaWindowsPrivateStage({pool,env}),
 /qa_windows_stage_wrong_local_postgres/);
serverVersion=170011;manifestRows=rows.slice(1);
await assert.rejects(inspectQaWindowsPrivateStage({pool,env}),
 /qa_manifest_incomplete_local_snapshot/);
console.log('PASS no-network Windows stage acceptance: 11 hashed datasets, zero events, frozen/private guards, no Firestore');
