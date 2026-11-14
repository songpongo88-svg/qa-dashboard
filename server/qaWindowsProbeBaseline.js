// Read-only frozen Windows PostgreSQL snapshot -> exact listener manifest.
// STAGING ONLY: no Firestore reads, no network, no QA writes or cutover.
import {QA_SYNC_DATASETS,qaCanonicalDocumentHash,qaManifestDigest}
 from './qaLiveMirrorStage.js';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const DOC=/^[^\x00-\x1f\x7f/]{1,900}$/;
const FULL=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/;
function exactRevision(value){
 if(typeof value!=='string')fail('qa_manifest_source_revision_missing');
 const m=FULL.exec(value);
 if(!m)fail('qa_manifest_source_revision_missing');
 const ms=Date.parse(m[1]+'Z');
 if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,19)!==m[1])
   fail('qa_manifest_source_revision_invalid');
 const fraction=(m[2]||'').padEnd(9,'0');
 if(fraction.slice(6)!=='000')fail('qa_manifest_submicrosecond_revision');
 return m[1]+'.'+fraction.slice(0,6)+'Z';
}
export async function loadQaWindowsProbeBaseline({pool,env=process.env,
 maxInitialReads=3000}={}){
 if(env.QA_WINDOWS_SOURCE_PROBE_MANIFEST!=='1'||env.QA_FAILOVER!=='OFF'||
   typeof pool?.connect!=='function')fail('qa_manifest_disabled');
 if(!Number.isSafeInteger(maxInitialReads)||maxInitialReads<11||
   maxInitialReads>3000)fail('qa_manifest_budget_invalid');
 const client=await pool.connect();let tx=false;
 try{
  const db=(await client.query('SELECT current_database() AS db')).rows?.[0]?.db;
  if(db!=='qa_dashboard_lab'&&
     !(db==='qa_cutover_ci_test'&&env.QA_PG_ISOLATED_TEST==='1'))
    fail('qa_manifest_wrong_database');
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');tx=true;
  const state=(await client.query('SELECT mode,write_frozen,source_snapshot_verified,'+
    ' active_snapshot_id FROM qa_failover_v1.state WHERE id=1')).rows?.[0];
  if(state?.mode!=='disabled'||state.write_frozen!==true||
    state.source_snapshot_verified!==false||!state.active_snapshot_id)
    fail('qa_manifest_standby_must_remain_frozen');
  const batch=(await client.query('SELECT status,source_documents,stored_documents,'+
    ' approved_for_failover,source_provenance,dataset_manifest'+
    ' FROM qa_failover_v1.live_snapshot_batches WHERE snapshot_id=$1',
    [state.active_snapshot_id])).rows?.[0];
  if(!batch||batch.status!=='copy_verified'||batch.approved_for_failover!==false||
    batch.source_provenance!=='verified-firestore-server-export'||
    !Number.isSafeInteger(batch.source_documents)||
    batch.source_documents!==batch.stored_documents||
    batch.source_documents>maxInitialReads)
    fail('qa_manifest_unverified_or_unbudgeted_snapshot');
  const manifests=batch.dataset_manifest;
  if(!Array.isArray(manifests)||manifests.length!==QA_SYNC_DATASETS.length||
    new Set(manifests.map(m=>m?.dataset)).size!==QA_SYNC_DATASETS.length||
    manifests.some(m=>!QA_SYNC_DATASETS.includes(m?.dataset)||
      !Number.isSafeInteger(m?.count)||m.count<0||
      typeof m.digest!=='string'||!/^[a-f0-9]{64}$/.test(m.digest)))
    fail('qa_manifest_untrusted_dataset_manifest');
  const rows=(await client.query('SELECT document_path,root_collection,document_json,content_hash'+
    ' FROM qa_failover_v1.live_snapshot_rows WHERE snapshot_id=$1 ORDER BY document_path',
    [state.active_snapshot_id])).rows||[];
  if(rows.length!==batch.source_documents)
    fail('qa_manifest_incomplete_local_snapshot');
  const expectedIds=Object.fromEntries(QA_SYNC_DATASETS.map(c=>[c,[]]));
  const expectedRevisions=Object.fromEntries(QA_SYNC_DATASETS.map(c=>[c,{}]));
  const perDataset=Object.fromEntries(QA_SYNC_DATASETS.map(c=>[c,[]]));
  const seen=new Set();
  for(const row of rows){
    const col=row?.root_collection,path=row?.document_path;
    if(!QA_SYNC_DATASETS.includes(col)||typeof path!=='string'||
       !path.startsWith(col+'/'))
      fail('qa_manifest_invalid_document_path');
    const id=path.slice(col.length+1);
    if(!DOC.test(id)||seen.has(path))fail('qa_manifest_duplicate_document');
    seen.add(path);
    if(!row.document_json||typeof row.document_json!=='object'||
       !row.document_json.fields||typeof row.document_json.fields!=='object'||
       Array.isArray(row.document_json.fields)||
       qaCanonicalDocumentHash(row.document_json)!==row.content_hash)
      fail('qa_manifest_source_hash_mismatch');
    const revision=exactRevision(row.document_json.updateTime);
    perDataset[col].push({path,hash:row.content_hash});
    expectedIds[col].push(id);
    expectedRevisions[col][id]=revision;
  }
  for(const {dataset,count,digest} of manifests){
   if(perDataset[dataset].length!==count||
      qaManifestDigest(perDataset[dataset])!==digest)
     fail('qa_manifest_dataset_digest_mismatch');
  }
  await client.query('COMMIT');tx=false;
  return Object.freeze({snapshotId:state.active_snapshot_id,
   expectedIds,expectedRevisions,estimatedInitialReads:
     Math.max(1,rows.length)+QA_SYNC_DATASETS.filter(ds=>
      expectedIds[ds].length===0).length,
   completeCopiedDatasetCount:QA_SYNC_DATASETS.length,
   sourceFreshnessVerified:false,failoverReady:false,
  });
 }catch(error){if(tx)await client.query('ROLLBACK').catch(()=>{});throw error;}
 finally{client.release();}
}
