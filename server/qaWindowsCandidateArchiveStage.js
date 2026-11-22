// OFF-by-default safe candidate archive guard for QA reconciliation.
// Does NOT capture Firestore or start a listener. Caller must separately
// perform a quota-reserved, single-readTime, authenticated source capture.
// This writes a new immutable-copy candidate, NEVER overwrites the active
// frozen baseline and NEVER enables failover.
import {stageQaFirestoreExport,QA_SYNC_DATASETS}
 from './qaLiveMirrorStage.js';
const fail=code=>{throw Object.assign(new Error(code),{code});};
export async function stageQaWindowsReconciliationCandidate({
 pool,baselineSnapshotId,captured,env=process.env,
 stageExport=stageQaFirestoreExport,
}={}){
 if(env.QA_WINDOWS_CANDIDATE_ARCHIVE_STAGE!=='1'||env.QA_FAILOVER!=='OFF'||
    typeof pool?.connect!=='function'||typeof stageExport!=='function'||
    typeof baselineSnapshotId!=='string'||baselineSnapshotId.length<12||
    !captured||typeof captured.readCollection!=='function')
   fail('qa_reconcile_candidate_staging_disabled');
 const metadata=captured.metadata;
 const m=metadata?.manifests;
 if(metadata?.authority!=='firestore-server-export'||
    metadata?.immutableSnapshotVerified!==true||
    metadata?.sourceAccessVerified!==true||
    metadata?.allCollectionsIncluded!==true||
    !Array.isArray(m)||m.length!==QA_SYNC_DATASETS.length||
    new Set(m.map(x=>x?.dataset)).size!==QA_SYNC_DATASETS.length||
    m.some(x=>!QA_SYNC_DATASETS.includes(x.dataset)||
      !Number.isSafeInteger(x.count)||x.count<0)||
    metadata?.exportedAt!==captured.verifiedReadTime||
    metadata?.snapshotId===baselineSnapshotId||
    !Number.isSafeInteger(captured.sourceCount)||
    captured.sourceCount!==m.reduce((n,x)=>n+x.count,0)||
    captured.sourceCount>3000||
    !Number.isSafeInteger(captured.readBudgetReceipt?.apiRequests)||
    captured.readBudgetReceipt.apiRequests<11||
    captured.readBudgetReceipt.apiRequests>80||
    !Number.isSafeInteger(captured.readBudgetReceipt?.documentReadEstimate)||
    captured.readBudgetReceipt.documentReadEstimate>3000)
   fail('qa_reconcile_candidate_source_unverified');
 const receipt=await stageExport({
  pool,metadata,readCollection:captured.readCollection,
  requireFrozenActiveSnapshotId:baselineSnapshotId,
 });
 if(receipt?.snapshotId!==metadata.snapshotId||
    receipt?.storedDocuments!==captured.sourceCount||
    receipt?.postgresCopyVerified!==true||
    receipt?.failoverAuthorized!==false||
    receipt?.productionWritesEnabled!==false)
   fail('qa_reconcile_candidate_copy_receipt_invalid');
 return Object.freeze({
  status:'NEW_CANDIDATE_COPY_VERIFIED_NOT_ACTIVE',
  candidateSnapshotId:receipt.snapshotId,
  copiedDocuments:receipt.storedDocuments,
  baselinePreserved:true,sourceContinuityVerified:false,
  failoverReady:false,
 });
}
