// QA-only trusted server snapshot copier for all non-evaluation core datasets.
// Exact typed Firestore JSON is preserved (including appeal and signature data).
// Does not activate PostgreSQL as a writable source or trust historical backups.
import {QA_SYNC_DATASETS,qaCanonicalDocumentHash,qaManifestDigest}
  from './qaLiveMirrorStage.js';

const blocked=code=>Object.assign(new Error(code),{code});
const SNAP=/^[A-Za-z0-9_.:-]{12,128}$/;
const HASH=/^[a-f0-9]{64}$/;
const DOMAINS=Object.freeze(QA_SYNC_DATASETS.filter(s=>s!=='qa_evaluations'));
const count=x=>Number.isSafeInteger(Number(x))&&Number(x)>=0;

export async function seedQaInactiveStandbyDomains({pool,snapshotId}={}){
  if(typeof pool?.connect!=='function'||!SNAP.test(snapshotId||''))
    throw blocked('domain_seed_invalid_request');
  const c=await pool.connect();let begun=false;
  try{
    const db=(await c.query('SELECT current_database() AS db')).rows?.[0]?.db;
    if(db!=='qa_dashboard_lab'&&!(db==='qa_cutover_ci_test'&&
      process.env.QA_PG_ISOLATED_TEST==='1'))throw blocked('domain_seed_wrong_database');
    await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE');begun=true;
    await c.query("SET LOCAL lock_timeout = '3s'");
    const state=(await c.query(
      'SELECT mode,source_snapshot_verified,write_frozen,active_snapshot_id'+
      ' FROM qa_failover_v1.state WHERE id=1 FOR UPDATE'
    )).rows?.[0];
    if(!state||state.mode!=='disabled'||state.source_snapshot_verified!==false||
       state.write_frozen!==true||state.active_snapshot_id!==snapshotId)
      throw blocked('domain_seed_requires_inactive_pinned_snapshot');
    const backlog=(await c.query(
      'SELECT count(*)::integer AS n FROM qa_failover_v1.outbox'
    )).rows?.[0]?.n;
    if(Number(backlog)!==0)throw blocked('domain_seed_requires_empty_outbox');
    const batch=(await c.query(
      'SELECT status,source_provenance,source_documents,stored_documents,'+
      'dataset_manifest,approved_for_failover FROM qa_failover_v1.live_snapshot_batches'+
      ' WHERE snapshot_id=$1 FOR SHARE',[snapshotId]
    )).rows?.[0];
    const manifests=batch?.dataset_manifest;
    if(!batch||batch.status!=='copy_verified'||
       batch.source_provenance!=='verified-firestore-server-export'||
       batch.approved_for_failover!==false||
       !count(batch.source_documents)||
       Number(batch.source_documents)!==Number(batch.stored_documents)||
       !Array.isArray(manifests)||manifests.length!==QA_SYNC_DATASETS.length||
       new Set(manifests.map(x=>x?.dataset)).size!==QA_SYNC_DATASETS.length||
       !QA_SYNC_DATASETS.every(name=>manifests.some(x=>x.dataset===name&&
         count(x.count)&&HASH.test(x.digest||'')))||
       manifests.reduce((n,x)=>n+Number(x.count),0)!==Number(batch.source_documents))
      throw blocked('domain_seed_incomplete_manifest');
    const source=(await c.query(
      'SELECT document_path,root_collection,document_json,content_hash'+
      ' FROM qa_failover_v1.live_snapshot_rows WHERE snapshot_id=$1'+
      ' ORDER BY document_path',[snapshotId]
    )).rows;
    if(source.length!==Number(batch.source_documents))
      throw blocked('domain_seed_source_count_mismatch');
    const seen=new Set(),byDataset=new Map(QA_SYNC_DATASETS.map(x=>[x,[]]));
    const copy=[];
    for(const row of source){
      if(!byDataset.has(row.root_collection)||
         row.document_path.slice(0,row.root_collection.length+1)!==
            row.root_collection+'/'||
         !row.document_path.slice(row.root_collection.length+1)||
         row.document_path.slice(row.root_collection.length+1).includes('/')||
         seen.has(row.document_path)||
         !HASH.test(row.content_hash||'')||
         qaCanonicalDocumentHash(row.document_json)!==row.content_hash)
        throw blocked('domain_seed_untrusted_source_row');
      seen.add(row.document_path);
      byDataset.get(row.root_collection).push({path:row.document_path,hash:row.content_hash});
      if(row.root_collection!=='qa_evaluations')copy.push(row);
    }
    for(const item of manifests){
      const group=byDataset.get(item.dataset);
      if(group.length!==Number(item.count)||
         qaManifestDigest(group)!==item.digest)
        throw blocked('domain_seed_source_manifest_mismatch');
    }
    const existing=(await c.query(
      'SELECT snapshot_id FROM qa_failover_v1.inactive_domain_seed_audit'+
      ' WHERE snapshot_id=$1',[snapshotId]
    )).rows;
    if(existing.length)throw blocked('domain_seed_already_completed');
    for(let i=0;i<copy.length;i+=50){
      const chunk=copy.slice(i,i+50),values=[],params=[];
      for(const row of chunk){
        const n=params.length;
        values.push('($'+(n+1)+',$'+(n+2)+',$'+(n+3)+
          ',$'+(n+4)+'::jsonb,$'+(n+5)+')');
        params.push(snapshotId,row.document_path,row.root_collection,
          JSON.stringify(row.document_json),row.content_hash);
      }
      await c.query(
        'INSERT INTO qa_failover_v1.inactive_domain_documents'+
        ' (snapshot_id,document_path,root_collection,original_json,original_hash) VALUES '+
        values.join(','),params
      );
    }
    const stored=(await c.query(
      'SELECT document_path,root_collection,original_json,original_hash'+
      ' FROM qa_failover_v1.inactive_domain_documents WHERE snapshot_id=$1'+
      ' ORDER BY document_path',[snapshotId]
    )).rows;
    if(stored.length!==copy.length)throw blocked('domain_seed_saved_count_mismatch');
    const expected=new Map(copy.map(x=>[x.document_path,x]));
    for(const row of stored){
      const e=expected.get(row.document_path);
      if(!e||e.root_collection!==row.root_collection||
         e.content_hash!==row.original_hash||
         qaCanonicalDocumentHash(row.original_json)!==e.content_hash)
        throw blocked('domain_seed_saved_hash_mismatch');
    }
    const digest=qaManifestDigest(copy.map(x=>({
      path:x.document_path,hash:x.content_hash,
    })));
    await c.query(
      'INSERT INTO qa_failover_v1.inactive_domain_seed_audit'+
      ' (snapshot_id,seeded_documents,manifest_digest,approved_for_live_writes)'+
      ' VALUES($1,$2,$3,false)',[snapshotId,copy.length,digest]
    );
    await c.query('COMMIT');begun=false;
    return Object.freeze({snapshotId,domainDocuments:copy.length,
      datasets:DOMAINS.length,allSourceHashesVerified:true,
      originalAppealsAndSignaturesPreserved:true,
      failoverEnabled:false,writeEnabled:false});
  }catch(e){
    if(begun)await c.query('ROLLBACK').catch(()=>{});
    throw e;
  }finally{c.release();}
}
