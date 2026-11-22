// QA Windows RECONCILIATION REVIEW only. NO Firestore, no writes, no
// promotion or failover. Compares two separately copy-verified immutable
// snapshots, while preserving the old frozen active_snapshot_id.
import {QA_SYNC_DATASETS,qaCanonicalDocumentHash,qaManifestDigest}
 from './qaLiveMirrorStage.js';
const error=code=>{throw Object.assign(new Error(code),{code});};
const ID=/^[A-Za-z0-9_.:-]{12,128}$/;
const HASH=/^[a-f0-9]{64}$/;
const DOC=/^[^\x00-\x1f\x7f/]{1,900}$/;
const sum=x=>Object.values(x).reduce((total,n)=>total+n,0);

function assertBatch(batch,rows){
 if(!batch||batch.status!=='copy_verified'||
    batch.approved_for_failover!==false||
    batch.source_provenance!=='verified-firestore-server-export'||
    !Number.isSafeInteger(batch.source_documents)||
    !Number.isSafeInteger(batch.stored_documents)||
    batch.source_documents<0||batch.source_documents>3000||
    batch.source_documents!==batch.stored_documents||
    rows.length!==batch.source_documents)
   error('qa_reconcile_unverified_batch');
 const manifest=batch.dataset_manifest;
 if(!Array.isArray(manifest)||manifest.length!==QA_SYNC_DATASETS.length)
   error('qa_reconcile_incomplete_manifest');
 const digests=new Map();
 for(const m of manifest){
  if(!QA_SYNC_DATASETS.includes(m?.dataset)||digests.has(m.dataset)||
     !Number.isSafeInteger(m.count)||m.count<0||
     typeof m.digest!=='string'||!HASH.test(m.digest))
   error('qa_reconcile_invalid_manifest');
  digests.set(m.dataset,m);
 }
 const indexed=new Map(),actual=new Map(QA_SYNC_DATASETS.map(ds=>[ds,[]]));
 for(const row of rows){
  const collection=row?.root_collection,path=row?.document_path;
  if(typeof path!=='string'||!QA_SYNC_DATASETS.includes(collection)||
     !path.startsWith(collection+'/')||!DOC.test(path.slice(collection.length+1))||
     indexed.has(path)||!HASH.test(row?.content_hash||'')||
     !row.document_json||typeof row.document_json!=='object'||
     !row.document_json.fields||typeof row.document_json.fields!=='object'||
     Array.isArray(row.document_json.fields)||
     qaCanonicalDocumentHash(row.document_json)!==row.content_hash)
   error('qa_reconcile_corrupt_snapshot');
  indexed.set(path,row.content_hash);
  actual.get(collection).push({path,hash:row.content_hash});
 }
 for(const ds of QA_SYNC_DATASETS){
  const m=digests.get(ds),list=actual.get(ds);
  if(!m||list.length!==m.count||qaManifestDigest(list)!==m.digest)
   error('qa_reconcile_dataset_digest_mismatch');
 }
 return indexed;
}
export async function inspectQaWindowsReconciliation({
 pool,candidateSnapshotId,env=process.env,
}={}){
 if(env.QA_WINDOWS_RECONCILE_REVIEW!=='1'||env.QA_FAILOVER!=='OFF'||
    typeof pool?.connect!=='function'||typeof candidateSnapshotId!=='string'||
    !ID.test(candidateSnapshotId))
   error('qa_reconcile_readonly_disabled');
 const client=await pool.connect();let begun=false;
 try{
  const db=(await client.query('SELECT current_database() AS db')).rows?.[0]?.db;
  if(db!=='qa_dashboard_lab'&&!(
     db==='qa_cutover_ci_test'&&env.QA_PG_ISOLATED_TEST==='1'))
   error('qa_reconcile_wrong_database');
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;
  await client.query("SET LOCAL statement_timeout='20s'");
  const state=(await client.query('SELECT mode,write_frozen,source_snapshot_verified,'+
    ' active_snapshot_id FROM qa_failover_v1.state WHERE id=1')).rows?.[0];
  const baselineId=state?.active_snapshot_id;
  if(state?.mode!=='disabled'||state?.write_frozen!==true||
     state?.source_snapshot_verified!==false||
     typeof baselineId!=='string'||!ID.test(baselineId)||
     baselineId===candidateSnapshotId)
   error('qa_reconcile_frozen_baseline_required');
  // Two rows are read in the same REPEATABLE READ transaction.
  const batches=(await client.query(
    'SELECT snapshot_id,status,approved_for_failover,source_provenance,'+
    ' source_exported_at,source_documents,stored_documents,dataset_manifest'+
    ' FROM qa_failover_v1.live_snapshot_batches'+
    ' WHERE snapshot_id IN ($1,$2)',[baselineId,candidateSnapshotId])).rows||[];
  if(batches.length!==2||new Set(batches.map(x=>x.snapshot_id)).size!==2)
   error('qa_reconcile_missing_candidate');
  const old=batches.find(x=>x.snapshot_id===baselineId);
  const candidate=batches.find(x=>x.snapshot_id===candidateSnapshotId);
  const t1=new Date(old?.source_exported_at||0).getTime();
  const t2=new Date(candidate?.source_exported_at||0).getTime();
  if(!Number.isFinite(t1)||!Number.isFinite(t2)||t1<=0||t2<=t1)
   error('qa_reconcile_candidate_not_newer');
  const rows=(await client.query(
    'SELECT snapshot_id,document_path,root_collection,document_json,content_hash'+
    ' FROM qa_failover_v1.live_snapshot_rows'+
    ' WHERE snapshot_id IN ($1,$2) ORDER BY snapshot_id,document_path',
    [baselineId,candidateSnapshotId])).rows||[];
  if(rows.length>6000)error('qa_reconcile_size_limit');
  const oldMap=assertBatch(old,rows.filter(r=>r.snapshot_id===baselineId));
  const fresh=assertBatch(candidate,rows.filter(r=>r.snapshot_id===candidateSnapshotId));
  const counters=Object.fromEntries(QA_SYNC_DATASETS.map(ds=>[ds,{
    added:0,removed:0,modified:0,unchanged:0,
  }]));
  for(const [path,hash] of fresh){
   const ds=path.slice(0,path.indexOf('/'));
   if(!oldMap.has(path))counters[ds].added++;
   else if(oldMap.get(path)===hash)counters[ds].unchanged++;
   else counters[ds].modified++;
  }
  for(const path of oldMap.keys()){
   if(!fresh.has(path))counters[path.slice(0,path.indexOf('/'))].removed++;
  }
  const total={added:0,removed:0,modified:0,unchanged:0};
  let changedDatasets=0;
  for(const ds of QA_SYNC_DATASETS){
   const row=counters[ds];
   for(const kind of Object.keys(total))total[kind]+=row[kind];
   if(row.added+row.removed+row.modified>0)changedDatasets++;
  }
  if(total.added+total.modified+total.unchanged!==fresh.size||
    total.removed+total.modified+total.unchanged!==oldMap.size)
   error('qa_reconcile_accounting_mismatch');
  await client.query('COMMIT');begun=false;
  return Object.freeze({
   status:changedDatasets?'RECONCILIATION_DIFF_VERIFIED':'COPIES_EQUAL_AT_DIFFERENT_READ_TIMES',
   datasets:QA_SYNC_DATASETS.length,baselineDocuments:oldMap.size,
   candidateDocuments:fresh.size,changedDatasets,...total,
   // Never claim online continuity after reading two point-in-time copies.
   localCopyVerified:true,sourceContinuityVerified:false,
   sourceFreshnessAfterCandidate:false,failoverReady:false,
   // No document paths, case contents, secret IDs or QA user data returned.
  });
 }catch(e){if(begun)await client.query('ROLLBACK').catch(()=>{});throw e;}
 finally{client.release();}
}
