import assert from 'node:assert/strict';
import {QA_SYNC_DATASETS} from '../server/qaLiveMirrorStage.js';
import {runQaWindowsReconciliation}
 from './Run-QA-Windows-Reconciliation.mjs';
const base={snapshotId:'qa-frozen-fixture-20261114',
 completeCopiedDatasetCount:11,failoverReady:false,
 datasetManifests:QA_SYNC_DATASETS.map(dataset=>({
  dataset,count:1,digest:'a'.repeat(64)})),
};
const env={QA_WINDOWS_RECONCILE_RUN:'1',
 QA_WINDOWS_CANDIDATE_ARCHIVE_STAGE:'1',
 QA_WINDOWS_RECONCILE_REVIEW:'1',
 QA_WINDOWS_SOURCE_PROBE_MANIFEST:'1',
 QA_FAILOVER:'OFF',
 QA_WINDOWS_RECONCILE_STAGE_ROOT:'/tmp/qa-frozen-fixture',
};
let queries=0,markers=0,captures=0,stages=0,reviews=0,remaining=0,requestCount=0;
const pool={
 async query(sql){
  queries++;
  if(sql.includes("current_setting('server_version_num')"))
   return {rows:[{db:'qa_dashboard_lab',version:170010,
    recovering:false,batches:true,snapshots:true,ledger:true}]};
  if(sql.includes('source_read_budget_daily'))
   return {rows:[{reserved_document_units:remaining,
    reserved_requests:requestCount}]};
  throw Error('unexpected SQL');
 },
 connect(){},
};
const token='qa-synthetic-token-which-is-never-valid';
const record={metadata:{
 manifests:QA_SYNC_DATASETS.map(dataset=>({dataset,count:1,digest:'b'.repeat(64)})),
 exportedAt:'2026-11-14T10:00:00.000Z'},
 verifiedReadTime:'2026-11-14T10:00:00.000Z',
 sourceCount:11,readBudgetReceipt:{apiRequests:11},
};
const config={
 env,poolOverride:pool,oauthToken:token,
 now:()=>new Date('2026-11-14T10:00:15.000Z'),
 loadBaseline:async()=>base,
 makeBudget:()=>({reserve:async()=>({
  estimatedNotBilledReads:true,reservedDocumentUnits:1,reservedRequests:1})}),
 createAttemptMarker:async()=>{markers++},
 checkPreviousAttempts:async()=>{},
 captureSource:async p=>{
  captures++;
  for(let i=0;i<QA_SYNC_DATASETS.length;i++)
   await p.beforeRequest({dataset:QA_SYNC_DATASETS[i],
    apiRequestNumber:i+1,requestedPageSize:50});
  return record;
 },
 stageCandidate:async args=>{stages++;
  assert.equal(args.baselineSnapshotId,base.snapshotId);
  return {status:'NEW_CANDIDATE_COPY_VERIFIED_NOT_ACTIVE',
   copiedDocuments:11,candidateSnapshotId:'qa-candidate-fixture-20261114',
   baselinePreserved:true,failoverReady:false};
 },
 review:async()=>{reviews++;return{
  datasets:11,localCopyVerified:true,failoverReady:false,
  baselineDocuments:11,candidateDocuments:11,
  added:1,removed:1,modified:1,unchanged:9,changedDatasets:3};},
};
await assert.rejects(runQaWindowsReconciliation({
 ...config,env:{...env,QA_WINDOWS_RECONCILE_RUN:'0'}}),
 /qa_candidate_disabled/);
assert.equal(queries,0);
remaining=2900;
await assert.rejects(runQaWindowsReconciliation(config),
 /qa_candidate_read_budget_unavailable/);
assert.equal(markers,0);assert.equal(captures,0);
remaining=0;
const result=await runQaWindowsReconciliation(config);
assert.equal(result.status,'CANDIDATE_ARCHIVED_AND_RECONCILED');
assert.equal(result.readUnitsReserved,550);
assert.equal(result.requests,11);
assert.equal(result.failoverReady,false);
assert.equal(stages,1);assert.equal(reviews,1);assert.equal(markers,1);
await assert.rejects(runQaWindowsReconciliation({...config,
 captureSource:async()=>{throw Error('read_failed')} }),/read_failed/);
assert.equal(stages,1);
// Pacific cutoff is verified separately with a temporary local marker.
console.log('PASS real candidate runner orchestration: zero-read default, daily headroom, frozen archive, source capture and reconciliation');
