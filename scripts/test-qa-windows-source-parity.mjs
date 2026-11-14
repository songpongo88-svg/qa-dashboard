// NO NETWORK: injected source export and local frozen-copy fixtures.
import assert from 'node:assert/strict';
import {QA_SYNC_DATASETS} from '../server/qaLiveMirrorStage.js';
import {checkQaWindowsPointInTimeParity}
 from '../server/qaWindowsSourceParity.js';
const manifests=QA_SYNC_DATASETS.map(dataset=>({
 dataset,count:1,digest:'a'.repeat(64)}));
const original={snapshotId:'qa-frozen-ci-20261114',
 datasetManifests:manifests,completeCopiedDatasetCount:11,
 estimatedInitialReads:11,failoverReady:false};
const env={QA_WINDOWS_SOURCE_PARITY:'1',
 QA_WINDOWS_SOURCE_PROBE_MANIFEST:'1',QA_FAILOVER:'OFF'};
let capturedCalls=0,reserved=0,alterSource=false,alterBaseline=false;
const loadBaseline=async()=>alterBaseline?{...original,
 snapshotId:'qa-changed-snapshot'}:original;
const captureSource=async cfg=>{
 capturedCalls++;
 assert.equal(cfg.projectId,'qa-dashboard-b0b5d');
 assert.equal(cfg.pageSize,50);
 assert.equal(cfg.maxDocumentReads,3000);
 assert.equal(cfg.maxApiRequests,80);
 assert.equal(cfg.readTime,'2026-11-14T10:00:00.000Z');
 for(const [i,dataset] of QA_SYNC_DATASETS.entries())
  await cfg.beforeRequest({dataset,apiRequestNumber:i+1,requestedPageSize:1});
 const all=manifests.map((m,i)=>alterSource&&i===0?
  {...m,digest:'b'.repeat(64)}:m);
 return {metadata:{manifests:all},verifiedReadTime:cfg.readTime,
  sourceCount:11,readBudgetReceipt:{apiRequests:11}};
};
const reserveRead=async()=>({
 estimatedNotBilledReads:true,reservedDocumentUnits:++reserved,
 reservedRequests:reserved,
});
const now=()=>new Date('2026-11-14T10:00:15Z');
const pool={connect(){}};
const args={pool,accessToken:'fake-valid-adc-token-which-is-long',
 env,loadBaseline,captureSource,reserveRead,now};
await assert.rejects(checkQaWindowsPointInTimeParity({...args,
 env:{...env,QA_FAILOVER:'ON'}}),/qa_source_parity_disabled/);
assert.equal(capturedCalls,0);
const success=await checkQaWindowsPointInTimeParity(args);
assert.equal(success.result,'MATCHED_AT_SINGLE_READ_TIME');
assert.equal(success.reservedUnitsThisRun,11);
assert.equal(success.apiRequests,11);
assert.equal(success.failoverReady,false);
alterSource=true;
const mismatch=await checkQaWindowsPointInTimeParity(args);
assert.equal(mismatch.result,'DIFFERS_FROM_FROZEN_COPY');
assert.equal(mismatch.mismatchedDatasetCount,1);
alterSource=false;alterBaseline=true;
await assert.rejects(checkQaWindowsPointInTimeParity(args),
 /qa_source_parity_frozen_snapshot_changed/);
alterBaseline=false;
await assert.rejects(checkQaWindowsPointInTimeParity({...args,
 reserveRead:async()=>({reservedDocumentUnits:1,reservedRequests:1})}),
 /qa_source_parity_durable_reservation_missing/);
console.log('PASS source parity dry run: 11 digests at pinned time, durable page reservations, mismatch fail closed');
