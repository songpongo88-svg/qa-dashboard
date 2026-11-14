// Disposable PostgreSQL 17 only. No Firebase credentials or user data.
// Confirms a NEW archived candidate can be copy-verified, never overwrites
// the active frozen snapshot, and compares added/removed/modified records.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {QA_SYNC_DATASETS,qaCanonicalDocumentHash,qaManifestDigest}
 from '../server/qaLiveMirrorStage.js';
import {stageQaWindowsReconciliationCandidate}
 from '../server/qaWindowsCandidateArchiveStage.js';
import {inspectQaWindowsReconciliation}
 from '../server/qaWindowsReconciliationReview.js';
import {runQaWindowsReconciliation}
 from './Run-QA-Windows-Reconciliation.mjs';
if(process.env.QA_PG_ISOLATED_TEST!=='1'||!process.env.QA_TEST_DATABASE_URL)
 throw Error('reconcile_ci_fixture_only');
const pool=new pg.Pool({connectionString:process.env.QA_TEST_DATABASE_URL,max:3});
const baselineId='qa-reconcile-fixture-old-20261114';
const candidateId='qa-reconcile-fixture-new-20261114';
const exportId='qa-reconcile-fixture-export-'+randomUUID();
const before=new Date(Date.now()-90000).toISOString();
const readTime=new Date(Date.now()-15000).toISOString();
const makeDoc=(id,number)=>({
 id,data:{fields:{qa_fixture:{integerValue:String(number)}},
  createTime:before,updateTime:readTime},
});
const oldDocs=Object.fromEntries(QA_SYNC_DATASETS.map(ds=>[ds,[makeDoc('fixture',85)]]));
const newDocs=Object.fromEntries(QA_SYNC_DATASETS.map(ds=>[ds,[makeDoc('fixture',85)]]));
newDocs.qa_evaluations=[makeDoc('fixture',86),makeDoc('new',87)];
newDocs.qa_appeal_events=[]; // deleted case in separate collection
newDocs.qa_signature_documents.push(makeDoc('new',88));
const manifest=docs=>QA_SYNC_DATASETS.map(dataset=>({
 dataset,count:docs[dataset].length,
 digest:qaManifestDigest(docs[dataset].map(doc=>({
  path:dataset+'/'+doc.id,hash:qaCanonicalDocumentHash(doc.data),
 }))),
}));
const env={QA_PG_ISOLATED_TEST:'1',
 QA_WINDOWS_CANDIDATE_ARCHIVE_STAGE:'1',
 QA_WINDOWS_RECONCILE_REVIEW:'1',QA_FAILOVER:'OFF'};
const cap={
 metadata:{authority:'firestore-server-export',
  immutableSnapshotVerified:true,sourceAccessVerified:true,
  allCollectionsIncluded:true,exportId,snapshotId:candidateId,
  exportedAt:readTime,manifests:manifest(newDocs)},
 verifiedReadTime:readTime,
 sourceCount:QA_SYNC_DATASETS.reduce((n,ds)=>n+newDocs[ds].length,0),
 readBudgetReceipt:{apiRequests:11,documentReadEstimate:20},
 async readCollection(dataset){
  return (async function*(){yield* newDocs[dataset];})();
 },
};
try{
 assert.equal((await pool.query('SELECT current_database() AS db')).rows[0].db,'qa_cutover_ci_test');
 // The preceding CI test creates only the minimal frozen QA fixture. Extend
 // it *in the disposable database only* to match the existing Windows schema.
 await pool.query('ALTER TABLE qa_failover_v1.live_snapshot_batches'+
  ' ADD COLUMN IF NOT EXISTS source_export_id text,'+
  ' ADD COLUMN IF NOT EXISTS source_exported_at timestamptz,'+
  ' ADD COLUMN IF NOT EXISTS source_provenance text,'+
  ' ADD COLUMN IF NOT EXISTS source_documents integer,'+
  ' ADD COLUMN IF NOT EXISTS stored_documents integer,'+
  ' ADD COLUMN IF NOT EXISTS dataset_manifest jsonb,'+
  ' ADD COLUMN IF NOT EXISTS verified_at timestamptz');
 await pool.query('CREATE TABLE IF NOT EXISTS qa_failover_v1.live_snapshot_rows ('+
  ' snapshot_id text NOT NULL REFERENCES qa_failover_v1.live_snapshot_batches(snapshot_id),'+
  ' document_path text NOT NULL,root_collection text NOT NULL,'+
  ' document_json jsonb NOT NULL,content_hash text NOT NULL,'+
  ' PRIMARY KEY(snapshot_id,document_path))');
 await pool.query(
  "INSERT INTO qa_failover_v1.live_snapshot_batches"+
  " (snapshot_id,status,approved_for_failover,source_export_id,source_exported_at,"+
  " source_provenance,source_documents,stored_documents,dataset_manifest)"+
  " VALUES ($1,'copy_verified',false,'qa-fixture-old-export',$2,"+
  " 'verified-firestore-server-export',11,11,$3::jsonb)",
  [baselineId,before,JSON.stringify(manifest(oldDocs))]);
 for(const ds of QA_SYNC_DATASETS)for(const doc of oldDocs[ds]){
  await pool.query('INSERT INTO qa_failover_v1.live_snapshot_rows'+
   ' (snapshot_id,document_path,root_collection,document_json,content_hash)'+
   ' VALUES ($1,$2,$3,$4::jsonb,$5)',[baselineId,ds+'/'+doc.id,
    ds,JSON.stringify(doc.data),qaCanonicalDocumentHash(doc.data)]);
 }
 await pool.query("UPDATE qa_failover_v1.state"+
  " SET mode='disabled',write_frozen=true,source_snapshot_verified=false,"+
  " active_snapshot_id=$1 WHERE id=1",[baselineId]);
 const rec=await stageQaWindowsReconciliationCandidate({
  pool,baselineSnapshotId:baselineId,captured:cap,env});
 assert.equal(rec.status,'NEW_CANDIDATE_COPY_VERIFIED_NOT_ACTIVE');
 assert.equal(rec.copiedDocuments,12);
 const current=(await pool.query('SELECT active_snapshot_id,mode,write_frozen'+
  ' FROM qa_failover_v1.state WHERE id=1')).rows[0];
 assert.deepEqual(current,{active_snapshot_id:baselineId,
  mode:'disabled',write_frozen:true});
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM qa_failover_v1.live_snapshot_rows'+
  ' WHERE snapshot_id=$1',[baselineId])).rows[0].n,11);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM qa_failover_v1.live_snapshot_rows'+
  ' WHERE snapshot_id=$1',[candidateId])).rows[0].n,12);
 const result=await inspectQaWindowsReconciliation({pool,candidateSnapshotId:candidateId,env});
 assert.equal(result.status,'RECONCILIATION_DIFF_VERIFIED');
 assert.equal(result.added,2);
 assert.equal(result.removed,1);
 assert.equal(result.modified,1);
 assert.equal(result.unchanged,9);
 assert.equal(result.changedDatasets,3);
 assert.equal(result.failoverReady,false);
 // State gate blocks attempts to produce another snapshot if standby is on.
 await pool.query("UPDATE qa_failover_v1.state SET mode='standby' WHERE id=1");
 const retryCap={...cap,metadata:{...cap.metadata,
  snapshotId:'qa-reconcile-fixture-blocked-new'}};
 await assert.rejects(stageQaWindowsReconciliationCandidate({
  pool,baselineSnapshotId:baselineId,captured:retryCap,env}),
  e=>e.code==='qa_reconcile_frozen_snapshot_state_changed');
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM'+
  ' qa_failover_v1.live_snapshot_batches WHERE snapshot_id=$1',
  [retryCap.metadata.snapshotId])).rows[0].n,0);

 // Prior fixture intentionally filled the budget to test exhaustion.
 // Clear ONLY this disposable CI database project/day before a new scenario.
 await pool.query("DELETE FROM qa_failover_v1.source_read_budget_daily"+
  " WHERE project_id='qa-dashboard-b0b5d'");
 // ACTUAL candidate pipeline under test: bounded REST pages -> immutable
 // snapshot SQL -> verified counts, without any real network or user data.
 await pool.query("UPDATE qa_failover_v1.state SET mode='disabled' WHERE id=1");
 let syntheticRequests=0;
 const fetchImpl=async url=>{
   const ds=decodeURIComponent(new URL(url).pathname.split('/').at(-1));
   assert.ok(QA_SYNC_DATASETS.includes(ds));
   assert.equal(new URL(url).searchParams.get('pageSize'),'50');
   assert.equal(new URL(url).searchParams.has('readTime'),true);
   syntheticRequests++;
   return {
     status:200,ok:true,headers:{get:()=> 'application/json'},
     json:async()=>({documents:newDocs[ds].map(doc=>({
       name:'projects/qa-dashboard-b0b5d/databases/(default)/documents/'+ds+'/'+doc.id,
       fields:doc.data.fields,createTime:doc.data.createTime,
       updateTime:doc.data.updateTime,
     }))}),
   };
 };
 let markerCount=0;
 const now=()=>new Date();
 const runnerEnv={...env,QA_WINDOWS_RECONCILE_RUN:'1',
  QA_WINDOWS_SOURCE_PROBE_MANIFEST:'1',
  QA_WINDOWS_RECONCILE_STAGE_ROOT:'/tmp/qa-ci-only-no-file-should-be-written'};
 const completed=await runQaWindowsReconciliation({
  env:runnerEnv,poolOverride:pool,oauthToken:'fake-ci-token-for-no-live-firestore-only',
  fetchImpl,now,createAttemptMarker:async()=>{markerCount++},
  checkPreviousAttempts:async()=>{}, // injected CI-only; real Windows uses Pacific marker checks
 });
 assert.equal(completed.status,'CANDIDATE_ARCHIVED_AND_RECONCILED');
 assert.equal(completed.oldDocuments,11);
 assert.equal(completed.newDocuments,12);
 assert.equal(completed.added,2);
 assert.equal(completed.removed,1);
 assert.equal(completed.modified,1);
 assert.equal(completed.unchanged,9);
 assert.equal(completed.changedDatasets,3);
 assert.equal(completed.failoverReady,false);
 assert.equal(completed.requests,11);
 assert.equal(completed.readUnitsReserved,550);
 assert.equal(syntheticRequests,11);
 assert.equal(markerCount,1);
 assert.equal((await pool.query('SELECT active_snapshot_id FROM qa_failover_v1.state WHERE id=1')).rows[0].active_snapshot_id,baselineId);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM qa_failover_v1.live_snapshot_rows WHERE snapshot_id=$1',[baselineId])).rows[0].n,11);
 console.log('PASS PostgreSQL 17 reconciliation: real bounded capture and separate archive, preserve old 11, add/remove/modify, reject unfrozen state');
}finally{await pool.end();}
