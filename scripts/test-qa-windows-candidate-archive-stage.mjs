import assert from 'node:assert/strict';
import {QA_SYNC_DATASETS,qaManifestDigest} from '../server/qaLiveMirrorStage.js';
import {stageQaWindowsReconciliationCandidate}
 from '../server/qaWindowsCandidateArchiveStage.js';
const baselineSnapshotId='qa-old-frozen-test-20261114';
const manifest=QA_SYNC_DATASETS.map(dataset=>({
 dataset,count:1,digest:qaManifestDigest([]),
}));
const metadata={
 authority:'firestore-server-export',immutableSnapshotVerified:true,
 sourceAccessVerified:true,allCollectionsIncluded:true,
 exportId:'qa-export-fixture-20261114',
 snapshotId:'qa-fresh-candidate-fixture',
 exportedAt:'2026-11-14T10:00:00Z',manifests:manifest,
};
const captured={
 metadata,verifiedReadTime:metadata.exportedAt,sourceCount:11,
 readBudgetReceipt:{apiRequests:11,documentReadEstimate:11},
 readCollection:async function*(){},
};
let calls=0,received;
const stageExport=async input=>{
 calls++;received=input;
 return {snapshotId:metadata.snapshotId,storedDocuments:11,
 postgresCopyVerified:true,failoverAuthorized:false,productionWritesEnabled:false};
};
const pool={connect(){}};
const env={QA_WINDOWS_CANDIDATE_ARCHIVE_STAGE:'1',QA_FAILOVER:'OFF'};
const args={pool,baselineSnapshotId,captured,stageExport,env};
await assert.rejects(stageQaWindowsReconciliationCandidate({
 ...args,env:{...env,QA_FAILOVER:'ON'}}),
 /qa_reconcile_candidate_staging_disabled/);
assert.equal(calls,0);
const receipt=await stageQaWindowsReconciliationCandidate(args);
assert.equal(receipt.status,'NEW_CANDIDATE_COPY_VERIFIED_NOT_ACTIVE');
assert.equal(receipt.failoverReady,false);
assert.equal(received.requireFrozenActiveSnapshotId,baselineSnapshotId);
await assert.rejects(stageQaWindowsReconciliationCandidate({
 ...args,captured:{...captured,sourceCount:12}}),
 /qa_reconcile_candidate_source_unverified/);
await assert.rejects(stageQaWindowsReconciliationCandidate({
 ...args,captured:{...captured,readBudgetReceipt:{apiRequests:81,documentReadEstimate:11}}}),
 /qa_reconcile_candidate_source_unverified/);
assert.equal(calls,1);
console.log('PASS archive candidate guard: inactive, verified single-time receipt and frozen baseline token');
