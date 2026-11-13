// QA-only: seed an INACTIVE PostgreSQL evaluation replica from one verified
// immutable eleven-dataset Firestore export. Not a cutover or a login grant.
// Requires a fresh independent parity/coordinator check BEFORE any later activation.
import { QA_SYNC_DATASETS,qaCanonicalDocumentHash } from './qaLiveMirrorStage.js';
import { normalizeQaFirestoreEvaluation } from './qaFirestoreSnapshotCodec.js';
const blocked=code=>Object.assign(new Error(code),{code});
const SNAP=/^[A-Za-z0-9_.:-]{12,128}$/;
const SHA=/^[a-f0-9]{64}$/;
const safeInt=x=>Number.isSafeInteger(Number(x))&&Number(x)>=0;

export async function seedQaInactiveStandbyEvaluations({pool,snapshotId}={}){
  if(typeof pool?.connect!=='function'||!SNAP.test(snapshotId||''))
    throw blocked('standby_seed_invalid_request');
  const c=await pool.connect();
  let tx=false;
  try{
    const db=(await c.query('SELECT current_database() AS db')).rows?.[0]?.db;
    if(db!=='qa_dashboard_lab'&&!(
      db==='qa_cutover_ci_test'&&process.env.QA_PG_ISOLATED_TEST==='1'
    ))throw blocked('standby_seed_wrong_database');
    await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE');tx=true;
    await c.query("SET LOCAL lock_timeout='3s'");
    const state=(await c.query(
      'SELECT mode,source_snapshot_verified,write_frozen,active_snapshot_id'+
      ' FROM qa_failover_v1.state WHERE id=1 FOR UPDATE'
    )).rows?.[0];
    if(!state||state.mode!=='disabled'||state.source_snapshot_verified!==false||
       state.write_frozen!==true||state.active_snapshot_id!=null)
      throw blocked('standby_seed_requires_inactive_empty_state');
    const [active,outbox]=await Promise.all([
      c.query('SELECT count(*)::integer AS n FROM qa_failover_v1.evaluations'),
      c.query('SELECT count(*)::integer AS n FROM qa_failover_v1.outbox'),
    ]);
    if(Number(active.rows?.[0]?.n)!==0||Number(outbox.rows?.[0]?.n)!==0)
      throw blocked('standby_seed_requires_empty_writer_and_outbox');
    const batch=(await c.query(
      'SELECT status,source_provenance,source_documents,stored_documents,'+
      'dataset_manifest,approved_for_failover FROM qa_failover_v1.live_snapshot_batches'+
      ' WHERE snapshot_id=$1 FOR SHARE',[snapshotId]
    )).rows?.[0];
    if(!batch||batch.status!=='copy_verified'||
       batch.source_provenance!=='verified-firestore-server-export'||
       batch.approved_for_failover!==false||
       !safeInt(batch.source_documents)||
       Number(batch.source_documents)!==Number(batch.stored_documents))
      throw blocked('standby_seed_source_unverified');
    const manifest=batch.dataset_manifest;
    if(!Array.isArray(manifest)||manifest.length!==QA_SYNC_DATASETS.length||
       new Set(manifest.map(x=>x?.dataset)).size!==QA_SYNC_DATASETS.length||
       !QA_SYNC_DATASETS.every(name=>manifest.some(row=>
         row?.dataset===name&&safeInt(row.count)&&SHA.test(row.digest||'')))||
       manifest.reduce((n,x)=>n+Number(x.count),0)!==Number(batch.source_documents))
      throw blocked('standby_seed_manifest_invalid');
    const expected=Number(manifest.find(x=>x.dataset==='qa_evaluations').count);
    const count=(await c.query(
      'SELECT count(*)::integer AS n FROM qa_failover_v1.live_snapshot_rows WHERE snapshot_id=$1',
      [snapshotId]
    )).rows?.[0]?.n;
    if(Number(count)!==Number(batch.source_documents))
      throw blocked('standby_seed_source_count_mismatch');
    const audit=(await c.query(
      'SELECT evaluation_count,eligible_for_failover FROM qa_failover_v1.live_candidate_audit'+
      ' WHERE snapshot_id=$1',[snapshotId]
    )).rows?.[0];
    if(!audit||audit.eligible_for_failover!==false||
       Number(audit.evaluation_count)!==expected)
      throw blocked('standby_seed_candidates_unverified');
    const candidates=(await c.query(
      "SELECT c.evaluation_id,c.record,c.source_hash,c.original_score,c.deleted_at,"+
      " s.document_json,s.content_hash FROM qa_failover_v1.live_candidate_evaluations c"+
      " JOIN qa_failover_v1.live_snapshot_rows s ON s.snapshot_id=c.snapshot_id"+
      " AND s.document_path='qa_evaluations/'||c.evaluation_id"+
      " AND s.root_collection='qa_evaluations'"+
      " WHERE c.snapshot_id=$1 ORDER BY c.evaluation_id",[snapshotId]
    )).rows;
    if(candidates.length!==expected)
      throw blocked('standby_seed_candidate_count_mismatch');
    const originals=[];
    for(const row of candidates){
      if(!SHA.test(row.content_hash||'')||row.content_hash!==row.source_hash||
         qaCanonicalDocumentHash(row.document_json)!==row.content_hash)
        throw blocked('standby_seed_source_hash_mismatch');
      const expectedRow=normalizeQaFirestoreEvaluation(
        row.evaluation_id,row.document_json,row.content_hash);
      if(qaCanonicalDocumentHash(row.record)!==qaCanonicalDocumentHash(expectedRow.record)||
         Number(row.original_score)!==expectedRow.unchangedFinalScore||
         (row.deleted_at?new Date(row.deleted_at).toISOString():null)!==
         (expectedRow.deletedAt?new Date(expectedRow.deletedAt).toISOString():null))
        throw blocked('standby_seed_score_or_topic_mismatch');
      originals.push(row);
    }
    for(let start=0;start<originals.length;start+=50){
      const chunk=originals.slice(start,start+50),params=[],values=[];
      for(const row of chunk){
        const n=params.length;
        values.push('($'+(n+1)+',$'+(n+2)+'::jsonb,1,\'firebase_snapshot\',$'+(n+3)+',$'+(n+4)+'::timestamptz)');
        params.push(row.evaluation_id,JSON.stringify(row.record),row.source_hash,row.deleted_at);
      }
      await c.query(
        'INSERT INTO qa_failover_v1.evaluations'+
        ' (evaluation_id,record,version,origin,source_hash,deleted_at) VALUES '+
        values.join(','),params
      );
    }
    const sealed=await c.query(
      "UPDATE qa_failover_v1.state SET active_snapshot_id=$1,updated_at=now()"+
      " WHERE id=1 AND mode='disabled' AND write_frozen=true"+
      " AND source_snapshot_verified=false AND active_snapshot_id IS NULL"+
      " RETURNING active_snapshot_id",[snapshotId]
    );
    if(sealed.rowCount!==1)throw blocked('standby_seed_state_changed');
    await c.query('COMMIT');tx=false;
    return Object.freeze({seeded:true,snapshotId,evaluations:originals.length,
      sourceScoresUnchanged:true,writeEnabled:false,failoverEnabled:false});
  }catch(error){
    if(tx)await c.query('ROLLBACK').catch(()=>{});
    throw error;
  }finally{c.release();}
}
