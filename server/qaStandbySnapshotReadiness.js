// QA Dashboard ONLY. Evidence-based readiness report with zero case data.
// Inspects the latest immutable eleven-dataset Firestore copy and candidate audit.
// Does NOT certify live parity, authorize login, or enable Firestore failover.
import {QA_SYNC_DATASETS} from './qaLiveMirrorStage.js';
const blocked=code=>Object.assign(new Error(code),{code});
const nonnegative=x=>Number.isSafeInteger(Number(x))&&Number(x)>=0;
const required=QA_SYNC_DATASETS;
const safeDate=s=>{const n=Date.parse(s);return Number.isFinite(n)?n:NaN};
export async function qaStandbySnapshotReadiness(pool,{now=Date.now()}={}){
  if(typeof pool?.connect!=='function')throw blocked('qa_snapshot_database_not_configured');
  if(!Number.isFinite(now))throw blocked('qa_snapshot_invalid_time');
  const c=await pool.connect();let tx=false;
  try{
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');tx=true;
    const db=(await c.query('SELECT current_database() AS db')).rows?.[0]?.db;
    if(db!=='qa_dashboard_lab'&&!(db==='qa_cutover_ci_test'&&
      process.env.QA_PG_ISOLATED_TEST==='1'))
      throw blocked('qa_snapshot_wrong_database');
    const state=(await c.query(
      'SELECT mode,source_snapshot_verified,write_frozen FROM qa_failover_v1.state WHERE id=1'
    )).rows?.[0];
    if(!state)throw blocked('qa_snapshot_state_missing');
    const batches=(await c.query(
      'SELECT snapshot_id,source_exported_at,status,source_documents,stored_documents,'+
      ' dataset_manifest,approved_for_failover FROM qa_failover_v1.live_snapshot_batches'+
      ' ORDER BY source_exported_at DESC,snapshot_id DESC LIMIT 1'
    )).rows;
    const batch=batches[0]||null;
    const queue=(await c.query(
      'SELECT status,count(*)::integer AS n FROM qa_failover_v1.outbox GROUP BY status'
    )).rows;
    let candidate=null,verifiedCount=null;
    if(batch){
      candidate=(await c.query(
        'SELECT evaluation_count,eligible_for_failover FROM qa_failover_v1.live_candidate_audit'+
        ' WHERE snapshot_id=$1',[batch.snapshot_id]
      )).rows?.[0]||null;
      verifiedCount=(await c.query(
        'SELECT count(*)::integer AS n FROM qa_failover_v1.live_snapshot_rows WHERE snapshot_id=$1',
        [batch.snapshot_id]
      )).rows?.[0]?.n;
    }
    await c.query('COMMIT');tx=false;
    const counts=Object.fromEntries(['pending','in_flight','conflict'].map(k=>[
      k,Number(queue.find(x=>x.status===k)?.n||0)
    ]));
    const manifest=Array.isArray(batch?.dataset_manifest)?batch.dataset_manifest:[];
    const datasets=new Map(manifest.map(x=>[x.dataset,x]));
    const manifestComplete=datasets.size===required.length&&required.every(key=>{
      const d=datasets.get(key);
      return d&&nonnegative(d.count)&&/^[0-9a-f]{64}$/.test(d.digest||'');
    });
    const totalsVerified=Boolean(batch)&&nonnegative(batch.source_documents)&&
      Number(batch.source_documents)===Number(batch.stored_documents)&&
      Number(verifiedCount)===Number(batch.source_documents);
    const copied=Boolean(batch?.status==='copy_verified'&&
      batch.approved_for_failover===false&&manifestComplete&&totalsVerified);
    const candidateReady=copied&&candidate?.eligible_for_failover===false&&
      nonnegative(candidate?.evaluation_count)&&
      Number(candidate.evaluation_count)===Number(datasets.get('qa_evaluations')?.count);
    const ago=now-safeDate(batch?.source_exported_at);
    const fresh=Number.isFinite(ago)&&ago>=0&&ago<=120000;
    const issues=[];
    if(!batch)issues.push('live_snapshot_missing');
    else {
      if(!copied)issues.push('snapshot_copy_unverified');
      if(!candidateReady)issues.push('evaluation_candidate_unverified');
      if(!fresh)issues.push('source_snapshot_not_fresh');
    }
    if(state.mode!=='disabled')issues.push('standby_mode_requires_review');
    if(state.write_frozen!==true)issues.push('standby_writes_not_frozen');
    if(counts.pending||counts.in_flight||counts.conflict)issues.push('outbox_not_empty');
    // Source freshness and copied records alone DO NOT establish:
    // independently verified source checksum, continuous sync,
    // revocations/permissions, coordinator fencing or end-to-end writes.
    issues.push('independent_live_parity_not_certified');
    issues.push('local_login_and_roles_not_certified');
    issues.push('qa_write_and_failback_not_certified');
    return Object.freeze({
      ok:true,readOnly:true,firestorePrimary:true,standbyMode:state.mode,
      archiveIsNotLiveSource:true,
      snapshot:{
        present:!!batch,
        copied,
        candidateVerified:Boolean(candidateReady),
        sourceDocuments:batch&&nonnegative(batch.source_documents)?Number(batch.source_documents):0,
        candidateEvaluations:batch&&candidateReady?Number(candidate.evaluation_count):0,
        sourceEvaluations:copied&&nonnegative(datasets.get('qa_evaluations')?.count)
          ?Number(datasets.get('qa_evaluations').count):0,
        datasetCount:manifest.length,
        maxAgeMinutes:2,
        withinFreshnessWindow:Boolean(fresh),
      },
      outbox:counts,failoverReady:false,canAcceptWrites:false,
      remainingChecks:[...new Set(issues)],
    });
  }catch(e){
    if(tx)await c.query('ROLLBACK').catch(()=>{});
    throw e;
  }finally{c.release();}
}
