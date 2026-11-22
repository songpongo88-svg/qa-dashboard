// OFF-by-default, Windows-only full source/frozen-copy parity diagnosis.
// This can consume Firestore document-read quota (NOT a zero-read check).
// No source writes, standby writes, source event delivery or failover.
import {QA_SYNC_DATASETS} from './qaLiveMirrorStage.js';
import {loadQaWindowsProbeBaseline} from './qaWindowsProbeBaseline.js';
import {captureQaFirestorePointInTime} from './qaFirestoreRestSnapshot.js';
const PROJECT='qa-dashboard-b0b5d';
const fail=code=>{throw Object.assign(new Error(code),{code});};

export async function checkQaWindowsPointInTimeParity({
  pool,accessToken,reserveRead,fetchImpl=fetch,env=process.env,
  loadBaseline=loadQaWindowsProbeBaseline,
  captureSource=captureQaFirestorePointInTime,
  now=()=>new Date(),
}={}){
 if(env.QA_WINDOWS_SOURCE_PARITY!=='1'||
    env.QA_WINDOWS_SOURCE_PROBE_MANIFEST!=='1'||
    env.QA_FAILOVER!=='OFF'||
    typeof pool?.connect!=='function'||typeof reserveRead!=='function'||
    typeof loadBaseline!=='function'||typeof captureSource!=='function'||
    typeof now!=='function')
   fail('qa_source_parity_disabled');
 if(typeof accessToken!=='string'||accessToken.length<20||
    accessToken.length>8192)
   fail('qa_source_parity_adc_missing');
 const original=await loadBaseline({pool,env,maxInitialReads:3000});
 if(original.completeCopiedDatasetCount!==11||
    !Array.isArray(original.datasetManifests)||
    original.datasetManifests.length!==QA_SYNC_DATASETS.length||
    !Number.isSafeInteger(original.estimatedInitialReads)||
    original.estimatedInitialReads>3000||original.failoverReady!==false)
   fail('qa_source_parity_untrusted_frozen_snapshot');
 const expected=new Map();
 for(const m of original.datasetManifests){
  if(!QA_SYNC_DATASETS.includes(m.dataset)||
     !Number.isSafeInteger(m.count)||m.count<0||
     !/^[a-f0-9]{64}$/.test(m.digest||'')||
     expected.has(m.dataset))
   fail('qa_source_parity_invalid_frozen_digest');
  expected.set(m.dataset,m);
 }
 if(expected.size!==11)fail('qa_source_parity_incomplete_manifest');
 // Use a single readTime across all 11 source collections. Page size 50
 // limits the reservation overhead for 2226 existing docs to <= 2776
 // at equal document counts; source growth may still exhaust 3000 units.
 const readTime=new Date(now().getTime()-15000).toISOString();
 let reservedUnits=0,reservedRequests=0;
 const captured=await captureSource({
  projectId:PROJECT,accessToken,fetchImpl,
  readTime,pageSize:50,maxDocumentReads:3000,maxApiRequests:80,
  beforeRequest:async req=>{
   if(!QA_SYNC_DATASETS.includes(req.dataset)||
       !Number.isSafeInteger(req.requestedPageSize)||
       req.requestedPageSize<1||req.requestedPageSize>50||
       req.apiRequestNumber!==reservedRequests+1)
     fail('qa_source_parity_invalid_reservation_request');
   const receipt=await reserveRead(req);
   if(receipt?.estimatedNotBilledReads!==true||
      !Number.isSafeInteger(receipt.reservedDocumentUnits)||
      !Number.isSafeInteger(receipt.reservedRequests))
     fail('qa_source_parity_durable_reservation_missing');
   reservedUnits+=req.requestedPageSize;
   reservedRequests++;
  },
 });
 if(!captured||captured.metadata?.manifests?.length!==11||
    captured.readBudgetReceipt?.apiRequests!==reservedRequests||
    reservedRequests<11||
    captured.verifiedReadTime!==readTime||
    captured.sourceCount<0||captured.sourceCount>3000)
   fail('qa_source_parity_source_receipt_invalid');
 const verifyAfter=await loadBaseline({pool,env,maxInitialReads:3000});
 if(verifyAfter.snapshotId!==original.snapshotId||
    verifyAfter.datasetManifests?.length!==11||
    verifyAfter.datasetManifests.some(m=>{
     const prev=expected.get(m.dataset);
     return !prev||m.digest!==prev.digest||m.count!==prev.count;
    }))
   fail('qa_source_parity_frozen_snapshot_changed');
 const mismatches=[];
 for(const m of captured.metadata.manifests){
  const prev=expected.get(m.dataset);
  if(!prev||m.digest!==prev.digest||m.count!==prev.count)
   mismatches.push(m.dataset);
 }
 // Do NOT return case data, document IDs, hashes, or account secrets.
 return Object.freeze({
  result:mismatches.length===0?'MATCHED_AT_SINGLE_READ_TIME':
    'DIFFERS_FROM_FROZEN_COPY',
  expectedCollections:11,sourceCollections:captured.metadata.manifests.length,
  frozenDocumentCount:original.datasetManifests.reduce((n,m)=>n+m.count,0),
  sourceDocumentCount:captured.sourceCount,
  mismatchedDatasetCount:mismatches.length,
  readTime,apiRequests:reservedRequests,
  reservedUnitsThisRun:reservedUnits,
  quotaOtherClients:'UNKNOWN',
  sourceContinuous:false,standbyCurrentAfterReadTime:false,
  failoverReady:false,
 });
}
