// Replace an INACTIVE QA replica with a newer verified 11-dataset snapshot.
// No primary writes, no live failover activation, no old archive deletion.
// Always atomically replace the candidate evaluation table and pin the new
// snapshot ONLY when absolutely no standby operation or audit is present.
import {QA_SYNC_DATASETS,qaCanonicalDocumentHash,qaManifestDigest} from './qaLiveMirrorStage.js';
import {normalizeQaFirestoreEvaluation} from './qaFirestoreSnapshotCodec.js';
import {auditQaInactiveReplica} from './qaStandbyInactiveAudit.js';

const BLOCK=code=>Object.assign(new Error(code),{code});
const SNAP=/^[A-Za-z0-9_.:-]{12,128}$/;
const HASH=/^[a-f0-9]{64}$/;
const count=x=>x!==null&&x!==undefined&&Number.isSafeInteger(Number(x))&&Number(x)>=0;
const time=x=>Date.parse(x instanceof Date?x.toISOString():x||'');
const sameDate=(a,b)=>{
  const x=a==null?null:time(a),y=b==null?null:time(b);
  return x===y;
};
export async function refreshQaInactiveReplica({
  pool,snapshotId,now=Date.now(),
}={}){
  if(typeof pool?.connect!=='function'||!SNAP.test(snapshotId||'')||
     !Number.isFinite(now))throw BLOCK('inactive_refresh_invalid_request');
  // A known-good predecessor must be proved BEFORE replacing any rows.
  const previous=await auditQaInactiveReplica(pool);
  if(!previous.inactiveReplicaStaged||previous.canAcceptWrites!==false||
     previous.failoverReady!==false)
    throw BLOCK('inactive_refresh_previous_replica_unverified');
  const c=await pool.connect();let tx=false;
  try{
    const db=(await c.query('SELECT current_database() AS db')).rows?.[0]?.db;
    if(db!=='qa_dashboard_lab'&&!(db==='qa_cutover_ci_test'&&
      process.env.QA_PG_ISOLATED_TEST==='1'))
      throw BLOCK('inactive_refresh_wrong_database');
    await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE');tx=true;
    await c.query("SET LOCAL lock_timeout='3s'");
    const state=(await c.query(
      'SELECT mode,write_frozen,source_snapshot_verified,active_snapshot_id'+
      ' FROM qa_failover_v1.state WHERE id=1 FOR UPDATE'
    )).rows?.[0];
    if(state?.mode!=='disabled'||state.write_frozen!==true||
       state.source_snapshot_verified!==false||
       !SNAP.test(state.active_snapshot_id||'')||
       state.active_snapshot_id===snapshotId)
      throw BLOCK('inactive_refresh_requires_frozen_existing_replica');
    const prev=state.active_snapshot_id;
    const [outbox,audit]=await Promise.all([
      c.query('SELECT count(*)::integer AS n FROM qa_failover_v1.outbox'),
      c.query('SELECT count(*)::integer AS n FROM qa_failover_v1.audit'),
    ]);
    if(Number(outbox.rows?.[0]?.n)!==0||Number(audit.rows?.[0]?.n)!==0)
      throw BLOCK('inactive_refresh_outbox_or_audit_not_empty');
    const batch=(await c.query(
      'SELECT status,source_provenance,source_documents,stored_documents,'+
      'dataset_manifest,approved_for_failover,source_exported_at'+
      ' FROM qa_failover_v1.live_snapshot_batches WHERE snapshot_id=$1 FOR SHARE',
      [snapshotId]
    )).rows?.[0];
    if(batch?.status!=='copy_verified'||
       batch.source_provenance!=='verified-firestore-server-export'||
       batch.approved_for_failover!==false||
       !count(batch.source_documents)||!count(batch.stored_documents)||
       Number(batch.source_documents)!==Number(batch.stored_documents))
      throw BLOCK('inactive_refresh_unverified_snapshot');
    const oldBatch=(await c.query(
      'SELECT source_exported_at FROM qa_failover_v1.live_snapshot_batches'+
      ' WHERE snapshot_id=$1 FOR SHARE',[prev]
    )).rows?.[0];
    if(!oldBatch||!Number.isFinite(time(oldBatch.source_exported_at))||
       !Number.isFinite(time(batch.source_exported_at))||
       time(batch.source_exported_at)<=time(oldBatch.source_exported_at))
      throw BLOCK('inactive_refresh_source_not_newer');
    const elapsed=now-time(batch.source_exported_at);
    if(!Number.isFinite(elapsed)||elapsed<0||elapsed>15*60_000)
      throw BLOCK('inactive_refresh_snapshot_stale');
    const manifest=batch.dataset_manifest,byName=new Map(Array.isArray(manifest)?
      manifest.map(x=>[x?.dataset,x]):[]);
    if(!Array.isArray(manifest)||manifest.length!==QA_SYNC_DATASETS.length||
       byName.size!==QA_SYNC_DATASETS.length||
       !QA_SYNC_DATASETS.every(name=>count(byName.get(name)?.count)&&
         HASH.test(byName.get(name)?.digest||''))||
       manifest.reduce((n,x)=>n+Number(x.count),0)!==Number(batch.source_documents))
      throw BLOCK('inactive_refresh_manifest_invalid');
    const [source,candidate,audits,existing,domainAudit]=await Promise.all([
      c.query('SELECT document_path,root_collection,document_json,content_hash'+
        ' FROM qa_failover_v1.live_snapshot_rows WHERE snapshot_id=$1',[snapshotId]),
      c.query('SELECT evaluation_id,record,source_hash,original_score,deleted_at'+
        ' FROM qa_failover_v1.live_candidate_evaluations WHERE snapshot_id=$1',[snapshotId]),
      c.query('SELECT evaluation_count,eligible_for_failover'+
        ' FROM qa_failover_v1.live_candidate_audit WHERE snapshot_id=$1',[snapshotId]),
      c.query('SELECT evaluation_id,record,version,origin,source_hash'+
        ' FROM qa_failover_v1.evaluations'),
      c.query('SELECT snapshot_id FROM qa_failover_v1.inactive_domain_seed_audit'+
        ' WHERE snapshot_id=$1',[snapshotId]),
    ]);
    const n=Number(batch.source_documents),
      evalCount=Number(byName.get('qa_evaluations').count);
    if(source.rows.length!==n||candidate.rows.length!==evalCount||
       Number(audits.rows?.[0]?.evaluation_count)!==evalCount||
       audits.rows?.[0]?.eligible_for_failover!==false||
       domainAudit.rows.length!==0||
       existing.rows.length!==previous.evaluationCount||
       existing.rows.some(row=>row.origin!=='firebase_snapshot'||
         Number(row.version)!==1||!HASH.test(row.source_hash||'')))
      throw BLOCK('inactive_refresh_incomplete_candidate');
    const map=new Map(),sets=new Map(QA_SYNC_DATASETS.map(x=>[x,[]])),domains=[];
    for(const row of source.rows){
      if(!sets.has(row.root_collection)||!row.document_path?.startsWith(
        row.root_collection+'/')||row.document_path.slice(row.root_collection.length+1).includes('/')||
        map.has(row.document_path)||!HASH.test(row.content_hash||'')||
        qaCanonicalDocumentHash(row.document_json)!==row.content_hash)
        throw BLOCK('inactive_refresh_source_hash_mismatch');
      map.set(row.document_path,row);
      sets.get(row.root_collection).push({path:row.document_path,hash:row.content_hash});
      if(row.root_collection!=='qa_evaluations')domains.push(row);
    }
    for(const name of QA_SYNC_DATASETS)
      if(sets.get(name).length!==Number(byName.get(name).count)||
        qaManifestDigest(sets.get(name))!==byName.get(name).digest)
        throw BLOCK('inactive_refresh_dataset_digest_mismatch');
    const verified=new Map();
    for(const row of candidate.rows){
      const sourceRow=map.get('qa_evaluations/'+row.evaluation_id);
      if(!sourceRow||verified.has(row.evaluation_id)||
         row.source_hash!==sourceRow.content_hash||
         !count(row.original_score)||Number(row.original_score)>100)
        throw BLOCK('inactive_refresh_invalid_evaluation');
      const normalized=normalizeQaFirestoreEvaluation(
        row.evaluation_id,sourceRow.document_json,sourceRow.content_hash);
      if(qaCanonicalDocumentHash(normalized.record)!==
         qaCanonicalDocumentHash(row.record)||
         Number(normalized.unchangedFinalScore)!==Number(row.original_score)||
         !sameDate(row.deleted_at,normalized.deletedAt))
        throw BLOCK('inactive_refresh_score_or_topic_changed');
      verified.set(row.evaluation_id,row);
    }
    if(verified.size!==evalCount||domains.length!==n-evalCount)
      throw BLOCK('inactive_refresh_missing_records');
    // The immutable new snapshot rows remain append-only. Old snapshot rows
    // and domain data remain intact; only the inactive read replica changes.
    for(let i=0;i<domains.length;i+=50){
      const rows=domains.slice(i,i+50),values=[],params=[];
      for(const row of rows){
        const k=params.length;
        values.push('($'+(k+1)+',$'+(k+2)+',$'+(k+3)+
          ',$'+(k+4)+'::jsonb,$'+(k+5)+')');
        params.push(snapshotId,row.document_path,row.root_collection,
          JSON.stringify(row.document_json),row.content_hash);
      }
      await c.query('INSERT INTO qa_failover_v1.inactive_domain_documents'+
        ' (snapshot_id,document_path,root_collection,original_json,original_hash) VALUES '+
        values.join(','),params);
    }
    const domainDigest=qaManifestDigest(domains.map(x=>({
      path:x.document_path,hash:x.content_hash,
    })));
    await c.query('INSERT INTO qa_failover_v1.inactive_domain_seed_audit'+
      ' (snapshot_id,seeded_documents,manifest_digest,approved_for_live_writes)'+
      ' VALUES ($1,$2,$3,false)',[snapshotId,domains.length,domainDigest]);
    // The frozen replica cannot have a write outbox; replace it atomically.
    await c.query('DELETE FROM qa_failover_v1.evaluations');
    const normalized=[...verified.values()].sort((a,b)=>
      a.evaluation_id.localeCompare(b.evaluation_id,'en'));
    for(let i=0;i<normalized.length;i+=50){
      const rows=normalized.slice(i,i+50),values=[],params=[];
      for(const row of rows){
        const k=params.length;
        values.push('($'+(k+1)+',$'+(k+2)+'::jsonb,1,'+
          "'firebase_snapshot',$"+(k+3)+',$'+(k+4)+'::timestamptz)');
        params.push(row.evaluation_id,JSON.stringify(row.record),
          row.source_hash,row.deleted_at);
      }
      await c.query('INSERT INTO qa_failover_v1.evaluations'+
        ' (evaluation_id,record,version,origin,source_hash,deleted_at) VALUES '+
        values.join(','),params);
    }
    const updated=await c.query('UPDATE qa_failover_v1.state'+
      ' SET active_snapshot_id=$2,updated_at=now()'+
      ' WHERE id=1 AND mode=\'disabled\' AND write_frozen=true'+
      ' AND source_snapshot_verified=false AND active_snapshot_id=$1'+
      ' RETURNING active_snapshot_id',[prev,snapshotId]);
    if(updated.rowCount!==1)throw BLOCK('inactive_refresh_state_changed');
    await c.query('COMMIT');tx=false;
    return Object.freeze({refreshed:true,previousSnapshotId:prev,
      snapshotId,documents:n,evaluations:evalCount,
      otherDocuments:domains.length,writeEnabled:false,
      failoverReady:false,firestoreReads:0});
  }catch(error){
    if(tx)await c.query('ROLLBACK').catch(()=>{});
    throw error;
  }finally{c.release();}
}
