// Internal QA-only read-only audit for the INACTIVE Windows replica.
// Reports aggregate verification only; cannot enable failover or expose records.
// All rows and manifests are checked in one PostgreSQL repeatable-read snapshot.
import {qaCanonicalDocumentHash,qaManifestDigest,QA_SYNC_DATASETS} from './qaLiveMirrorStage.js';

const REASON='replica_not_verified';
const validCount=n=>Number.isSafeInteger(Number(n))&&Number(n)>=0;
const validHash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const blocked=reason=>Object.freeze({
  ok:true,readOnly:true,inactiveReplicaStaged:false,
  reason,failoverReady:false,canAcceptWrites:false,
});
export async function auditQaInactiveReplica(pool){
  if(typeof pool?.connect!=='function')throw new Error('replica_database_missing');
  const c=await pool.connect();
  let transaction=false;
  try{
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    transaction=true;
    const db=(await c.query('SELECT current_database() AS db')).rows?.[0]?.db;
    if(db!=='qa_dashboard_lab'&&!(db==='qa_cutover_ci_test'&&
       process.env.QA_PG_ISOLATED_TEST==='1'))
      return blocked('replica_wrong_database');
    const state=(await c.query('SELECT mode,write_frozen,source_snapshot_verified,'+
      'active_snapshot_id FROM qa_failover_v1.state WHERE id=1')).rows?.[0];
    if(state?.mode!=='disabled'||state.write_frozen!==true||
      state.source_snapshot_verified!==false||!state.active_snapshot_id)
      return blocked('replica_not_inactive');
    const snap=state.active_snapshot_id;
    const [batches,sources,candidates,evals,domains,audit,outbox]=await Promise.all([
      c.query('SELECT status,source_documents,stored_documents,source_provenance,'+
        'dataset_manifest,approved_for_failover,source_exported_at'+
        ' FROM qa_failover_v1.live_snapshot_batches WHERE snapshot_id=$1',[snap]),
      c.query('SELECT document_path,root_collection,document_json,content_hash'+
        ' FROM qa_failover_v1.live_snapshot_rows WHERE snapshot_id=$1',[snap]),
      c.query('SELECT evaluation_id,record,source_hash,original_score,deleted_at'+
        ' FROM qa_failover_v1.live_candidate_evaluations WHERE snapshot_id=$1',[snap]),
      c.query('SELECT evaluation_id,record,source_hash,version,origin,deleted_at'+
        ' FROM qa_failover_v1.evaluations'),
      c.query('SELECT document_path,root_collection,original_json,original_hash'+
        ' FROM qa_failover_v1.inactive_domain_documents WHERE snapshot_id=$1',[snap]),
      c.query('SELECT evaluation_count,eligible_for_failover FROM qa_failover_v1.live_candidate_audit'+
        ' WHERE snapshot_id=$1',[snap]),
      c.query('SELECT status,count(*)::integer AS n FROM qa_failover_v1.outbox GROUP BY status'),
    ]);
    const domainAudit=(await c.query('SELECT seeded_documents,approved_for_live_writes'+
      ' FROM qa_failover_v1.inactive_domain_seed_audit WHERE snapshot_id=$1',[snap])).rows?.[0];
    const batch=batches.rows?.[0],manifest=batch?.dataset_manifest;
    const manifestMap=new Map(Array.isArray(manifest)?
      manifest.map(x=>[x?.dataset,x]):[]);
    const expected=Number(batch?.source_documents);
    const expectedEvaluations=Number(manifestMap.get('qa_evaluations')?.count);
    if(batch?.status!=='copy_verified'||
      batch?.source_provenance!=='verified-firestore-server-export'||
      batch?.approved_for_failover!==false||
      !validCount(batch.source_documents)||!validCount(batch.stored_documents)||
      Number(batch.stored_documents)!==expected||
      !Array.isArray(manifest)||manifest.length!==QA_SYNC_DATASETS.length||
      manifestMap.size!==QA_SYNC_DATASETS.length||
      !QA_SYNC_DATASETS.every(key=>validCount(manifestMap.get(key)?.count)&&
        validHash(manifestMap.get(key)?.digest))||
      manifest.reduce((n,x)=>n+Number(x.count),0)!==expected)
      return blocked('replica_snapshot_manifest_invalid');
    const expectedDomains=expected-expectedEvaluations;
    if(sources.rows.length!==expected||candidates.rows.length!==expectedEvaluations||
      evals.rows.length!==expectedEvaluations||domains.rows.length!==expectedDomains||
      audit.rows?.[0]?.eligible_for_failover!==false||
      Number(audit.rows?.[0]?.evaluation_count)!==expectedEvaluations||
      domainAudit?.approved_for_live_writes!==false||
      Number(domainAudit?.seeded_documents)!==expectedDomains||
      outbox.rows.some(x=>Number(x.n)!==0))
      return blocked('replica_count_or_outbox_mismatch');
    const source=new Map(),perDataset=new Map(QA_SYNC_DATASETS.map(x=>[x,[]]));
    for(const row of sources.rows){
      if(!perDataset.has(row.root_collection)||
        !row.document_path?.startsWith(row.root_collection+'/')||
        source.has(row.document_path)||!validHash(row.content_hash)||
        qaCanonicalDocumentHash(row.document_json)!==row.content_hash)
        return blocked('replica_source_hash_invalid');
      source.set(row.document_path,row);
      perDataset.get(row.root_collection).push({path:row.document_path,hash:row.content_hash});
    }
    for(const dataset of QA_SYNC_DATASETS){
      if(perDataset.get(dataset).length!==Number(manifestMap.get(dataset).count)||
        qaManifestDigest(perDataset.get(dataset))!==manifestMap.get(dataset).digest)
        return blocked('replica_manifest_digest_mismatch');
    }
    const originals=new Map();
    for(const row of candidates.rows){
      const sourceRow=source.get('qa_evaluations/'+row.evaluation_id);
      if(!sourceRow||originals.has(row.evaluation_id)||
        row.source_hash!==sourceRow.content_hash||
        !validCount(row.original_score)||Number(row.original_score)>100)
        return blocked('replica_candidate_invalid');
      originals.set(row.evaluation_id,row);
    }
    for(const row of evals.rows){
      const original=originals.get(row.evaluation_id);
      if(!original||row.origin!=='firebase_snapshot'||Number(row.version)!==1||
        row.source_hash!==original.source_hash||
        qaCanonicalDocumentHash(row.record)!==qaCanonicalDocumentHash(original.record)||
        Number(row.record?.finalScore)!==Number(original.original_score)||
        (row.deleted_at?new Date(row.deleted_at).toISOString():null)!==
          (original.deleted_at?new Date(original.deleted_at).toISOString():null))
        return blocked('replica_evaluation_changed');
    }
    const seen=new Set();
    for(const row of domains.rows){
      const src=source.get(row.document_path);
      if(!src||src.root_collection==='qa_evaluations'||seen.has(row.document_path)||
        row.root_collection!==src.root_collection||row.original_hash!==src.content_hash||
        qaCanonicalDocumentHash(row.original_json)!==src.content_hash)
        return blocked('replica_domain_changed');
      seen.add(row.document_path);
    }
    const result=Object.freeze({
      ok:true,readOnly:true,inactiveReplicaStaged:true,reason:null,
      documentCount:expected,evaluationCount:expectedEvaluations,
      otherDocumentCount:expectedDomains,datasetCount:QA_SYNC_DATASETS.length,
      failoverReady:false,canAcceptWrites:false,
      sourceFreshness:'historical-point-in-time-only',
    });
    return result;
  } finally {
    if(transaction)await c.query('ROLLBACK').catch(()=>{});
    c.release();
  }
}
