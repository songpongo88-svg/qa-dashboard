// QA standby coordinator's final local cutover gate.
// Internal-only function: no HTTP exports or background activation.
// Caller must present independent, server-verified outage and mirror evidence;
// an archived Firestore dump or browser 429 is NEVER authorization.
import { qaFailoverDecision,QA_FAILOVER_REQUIRED_DATASETS } from './qaFailoverDecision.js';
import {qaCanonicalDocumentHash,qaManifestDigest} from './qaLiveMirrorStage.js';
const BLOCK=code=>Object.assign(new Error(code),{code});
const SNAP=/^[A-Za-z0-9_.:-]{12,128}$/;
const HASH=/^[a-f0-9]{64}$/;
const validCount=x=>Number.isSafeInteger(Number(x))&&Number(x)>=0;

export async function activateQaStandbyFromVerifiedSource({
  pool,trusted,snapshotId,env=process.env,now=Date.now(),
}={}){
  if(env.QA_STANDBY_CUTOVER_ENABLED!=='1')throw BLOCK('cutover_disabled');
  if(typeof pool?.connect!=='function'||!SNAP.test(snapshotId||'')||
     !Number.isFinite(now))throw BLOCK('cutover_invalid_request');
  if(trusted?.serverAuthority!=='qa-server-verified'||
     trusted?.production!==true||
     trusted?.productionApprovedByServer!==true||
     trusted?.mirror?.snapshotId!==snapshotId||
     trusted?.mirror?.sourceComplete!==true||
     !QA_FAILOVER_REQUIRED_DATASETS.every(name=>
       trusted.mirror.datasets?.includes(name))||
     trusted?.lease?.owner!=='qa-failover-coordinator')
    throw BLOCK('cutover_missing_independent_authority');
  const decision=qaFailoverDecision(trusted,now);
  if(!decision.canAcceptWrites||!Number.isSafeInteger(decision.generation)||
     !Number.isFinite(Date.parse(trusted.primary.outageStartedAt)))
    throw BLOCK('cutover_not_authorized');
  const c=await pool.connect();let begun=false;
  try{
    const db=(await c.query('SELECT current_database() AS db')).rows?.[0]?.db;
    if(db!=='qa_dashboard_lab'&&!(
      db==='qa_cutover_ci_test'&&env.QA_PG_ISOLATED_TEST==='1'))
      throw BLOCK('cutover_wrong_database');
    await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE');begun=true;
    await c.query("SET LOCAL lock_timeout='3s'");
    const state=(await c.query(
      'SELECT mode,generation,source_snapshot_verified,write_frozen,'+
      'active_snapshot_id FROM qa_failover_v1.state WHERE id=1 FOR UPDATE'
    )).rows?.[0];
    if(!state||state.mode!=='disabled'||state.write_frozen!==true||
       state.source_snapshot_verified!==false||state.active_snapshot_id!==snapshotId||
       !Number.isSafeInteger(Number(state.generation))||
       decision.generation<=Number(state.generation))
      throw BLOCK('cutover_not_frozen_or_snapshot_changed');
    const queue=(await c.query(
      'SELECT count(*)::integer AS n FROM qa_failover_v1.outbox'
    )).rows?.[0]?.n;
    if(Number(queue)!==0)throw BLOCK('cutover_outbox_not_empty');
    const batch=(await c.query(
      'SELECT status,source_provenance,source_documents,stored_documents,'+
      ' dataset_manifest,approved_for_failover,source_exported_at'+
      ' FROM qa_failover_v1.live_snapshot_batches WHERE snapshot_id=$1 FOR SHARE',
      [snapshotId]
    )).rows?.[0];
    if(!batch||batch.status!=='copy_verified'||
       batch.source_provenance!=='verified-firestore-server-export'||
       batch.approved_for_failover!==false||
       !validCount(batch.source_documents)||
       Number(batch.source_documents)!==Number(batch.stored_documents)||
       !Array.isArray(batch.dataset_manifest)||
       batch.dataset_manifest.length!==QA_FAILOVER_REQUIRED_DATASETS.length||
       new Set(batch.dataset_manifest.map(x=>x.dataset)).size!==QA_FAILOVER_REQUIRED_DATASETS.length||
       !QA_FAILOVER_REQUIRED_DATASETS.every(name=>
         batch.dataset_manifest.some(x=>x.dataset===name&&validCount(x.count)&&HASH.test(x.digest||'')))||
       batch.dataset_manifest.reduce((n,x)=>n+Number(x.count),0)!==Number(batch.source_documents))
      throw BLOCK('cutover_unverified_source');
    const snapshotTime=Date.parse(batch.source_exported_at);
    const outageTime=Date.parse(trusted.primary.outageStartedAt);
    if(!Number.isFinite(snapshotTime)||snapshotTime>outageTime||
       outageTime-snapshotTime>120000)
      throw BLOCK('cutover_stale_source');
    const manifestDigest=qaManifestDigest(batch.dataset_manifest.map(row=>({
      path:row.dataset,hash:row.digest,
    })));
    const evalCount=Number(batch.dataset_manifest.find(x=>x.dataset==='qa_evaluations').count);
    const expectedDomains=Number(batch.source_documents)-evalCount;
    const [sourceRows,domainRows,evaluations,domainAudit,candidateAudit]=await Promise.all([
      c.query('SELECT document_path,root_collection,content_hash,document_json'+
        ' FROM qa_failover_v1.live_snapshot_rows WHERE snapshot_id=$1',[snapshotId]),
      c.query('SELECT document_path,root_collection,original_hash,original_json'+
        ' FROM qa_failover_v1.inactive_domain_documents WHERE snapshot_id=$1',[snapshotId]),
      c.query('SELECT evaluation_id,record,version,source_hash,origin,deleted_at'+
        ' FROM qa_failover_v1.evaluations'),
      c.query('SELECT seeded_documents,approved_for_live_writes'+
        ' FROM qa_failover_v1.inactive_domain_seed_audit WHERE snapshot_id=$1',
        [snapshotId]),
      c.query('SELECT evaluation_count,eligible_for_failover'+
        ' FROM qa_failover_v1.live_candidate_audit WHERE snapshot_id=$1',
        [snapshotId])
    ]);
    if(sourceRows.rows.length!==Number(batch.source_documents)||
       domainRows.rows.length!==expectedDomains||
       evaluations.rows.length!==evalCount||
       Number(domainAudit.rows?.[0]?.seeded_documents)!==expectedDomains||
       domainAudit.rows?.[0]?.approved_for_live_writes!==false||
       Number(candidateAudit.rows?.[0]?.evaluation_count)!==evalCount||
       candidateAudit.rows?.[0]?.eligible_for_failover!==false)
      throw BLOCK('cutover_replica_incomplete');
    const allSource=new Map(),perDataset=new Map(
      QA_FAILOVER_REQUIRED_DATASETS.map(x=>[x,[]]));
    for(const item of sourceRows.rows){
      if(!item.document_path?.startsWith(item.root_collection+'/')||
         !perDataset.has(item.root_collection)||allSource.has(item.document_path)||
         !HASH.test(item.content_hash||'')||
         qaCanonicalDocumentHash(item.document_json)!==item.content_hash)
        throw BLOCK('cutover_source_hash_mismatch');
      allSource.set(item.document_path,item);
      perDataset.get(item.root_collection).push({
        path:item.document_path,hash:item.content_hash,
      });
    }
    for(const item of batch.dataset_manifest){
      const rows=perDataset.get(item.dataset);
      if(rows.length!==Number(item.count)||qaManifestDigest(rows)!==item.digest)
        throw BLOCK('cutover_manifest_hash_mismatch');
    }
    for(const item of domainRows.rows){
      const source=allSource.get(item.document_path);
      if(!source||source.root_collection!==item.root_collection||
         source.root_collection==='qa_evaluations'||
         item.original_hash!==source.content_hash||
         qaCanonicalDocumentHash(item.original_json)!==source.content_hash)
        throw BLOCK('cutover_domain_changed');
    }
    const candidates=(await c.query(
      'SELECT evaluation_id,record,source_hash,original_score,deleted_at'+
      ' FROM qa_failover_v1.live_candidate_evaluations WHERE snapshot_id=$1',
      [snapshotId]
    )).rows;
    if(candidates.length!==evalCount)throw BLOCK('cutover_candidates_incomplete');
    const byCandidate=new Map(candidates.map(x=>[x.evaluation_id,x]));
    if(byCandidate.size!==candidates.length)throw BLOCK('cutover_candidate_duplicate');
    for(const row of evaluations.rows){
      const candidate=byCandidate.get(row.evaluation_id);
      if(!candidate||row.origin!=='firebase_snapshot'||
         Number(row.version)!==1||row.source_hash!==candidate.source_hash||
         candidate.source_hash!==allSource.get('qa_evaluations/'+row.evaluation_id)?.content_hash||
         qaCanonicalDocumentHash(row.record)!==qaCanonicalDocumentHash(candidate.record)||
         Number(row.record.finalScore)!==Number(candidate.original_score)||
         Boolean(row.deleted_at)!==Boolean(candidate.deleted_at))
        throw BLOCK('cutover_evaluation_score_changed');
    }
    // The coordinator's server-side proof expires independently of a SQL
    // lock wait. Recheck before activating, never use the caller's stale now.
    const fresh=qaFailoverDecision(trusted,Date.now());
    if(!fresh.canAcceptWrites||fresh.generation!==decision.generation)
      throw BLOCK('cutover_authority_expired');
    const activated=(await c.query(
      "UPDATE qa_failover_v1.state SET mode='standby',generation=$1,"+
      " source_snapshot_verified=true,write_frozen=false,"+
      " outage_started_at=$3::timestamptz,updated_at=now()"+
      " WHERE id=1 AND mode='disabled' AND active_snapshot_id=$2"+
      " AND source_snapshot_verified=false AND write_frozen=true"+
      " RETURNING generation,active_snapshot_id",
      [decision.generation,snapshotId,trusted.primary.outageStartedAt]
    ));
    if(activated.rowCount!==1)throw BLOCK('cutover_state_race');
    await c.query('COMMIT');begun=false;
    return Object.freeze({activated:true,snapshotId,
      generation:decision.generation,evaluations:evalCount,
      domainDocuments:expectedDomains,sourceDocumentCount:Number(batch.source_documents),
      immutableSourceVerified:true,scoreParityVerified:true});
  }catch(e){
    if(begun)await c.query('ROLLBACK').catch(()=>{});
    throw e;
  }finally{c.release();}
}
