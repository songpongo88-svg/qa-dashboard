// QA-only: materialize ONE complete, verified, immutable Firestore snapshot
// into an app-shaped CANDIDATE dataset in PostgreSQL. This code never updates
// qa_failover_v1.evaluations, source_mirror or the failover state and cannot
// authorize login, writes, or a production cutover.
import {QA_SYNC_DATASETS,qaCanonicalDocumentHash,qaManifestDigest}
  from './qaLiveMirrorStage.js';
import {normalizeQaFirestoreEvaluation}
  from './qaFirestoreSnapshotCodec.js';

const validSnapshot=/^[A-Za-z0-9_.:-]{12,128}$/;
const fail=code=>Object.assign(new Error(code),{code});
export async function materializeQaStandbyEvaluationCandidates({
  pool,snapshotId,
}={}){
  if(typeof pool?.connect!=='function'||!validSnapshot.test(snapshotId||''))
    throw fail('candidate_request_invalid');
  const client=await pool.connect();
  let inTx=false;
  try{
    const db=(await client.query('SELECT current_database() AS db')).rows?.[0]?.db;
    if(db!=='qa_dashboard_lab'&&!(
      db==='qa_cutover_ci_test'&&process.env.QA_PG_ISOLATED_TEST==='1'
    ))throw fail('unrecognized_qa_database');
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    inTx=true;
    await client.query("SET LOCAL lock_timeout='3s'");
    const state=(await client.query(
      'SELECT mode,source_snapshot_verified,write_frozen FROM qa_failover_v1.state WHERE id=1 FOR UPDATE'
    )).rows?.[0];
    if(state?.mode!=='disabled'||state.source_snapshot_verified!==false||
       state.write_frozen!==true)
      throw fail('candidate_requires_disabled_standby');
    const snapshot=(await client.query(
      'SELECT source_provenance,status,source_documents,stored_documents,'+
      ' dataset_manifest,approved_for_failover FROM qa_failover_v1.live_snapshot_batches'+
      ' WHERE snapshot_id=$1 FOR UPDATE',[snapshotId]
    )).rows?.[0];
    if(!snapshot||snapshot.source_provenance!=='verified-firestore-server-export'||
      snapshot.status!=='copy_verified'||snapshot.approved_for_failover!==false||
      Number(snapshot.source_documents)!==Number(snapshot.stored_documents))
      throw fail('candidate_source_unverified');
    const expected=new Map();
    if(!Array.isArray(snapshot.dataset_manifest)||
      snapshot.dataset_manifest.length!==QA_SYNC_DATASETS.length)
      throw fail('candidate_source_manifest_invalid');
    for(const item of snapshot.dataset_manifest){
      if(!QA_SYNC_DATASETS.includes(item?.dataset)||expected.has(item.dataset)||
        !Number.isSafeInteger(item.count)||item.count<0||
        !/^[a-f0-9]{64}$/.test(item.digest||''))
        throw fail('candidate_source_manifest_invalid');
      expected.set(item.dataset,item);
    }
    const staged=(await client.query(
      'SELECT document_path,root_collection,document_json,content_hash'+
      ' FROM qa_failover_v1.live_snapshot_rows WHERE snapshot_id=$1'+
      ' ORDER BY document_path FOR SHARE',[snapshotId]
    )).rows;
    if(staged.length!==Number(snapshot.source_documents))
      throw fail('candidate_stage_count_mismatch');
    const groups=new Map(QA_SYNC_DATASETS.map(dataset=>[dataset,[]]));
    const candidates=[];
    for(const item of staged){
      const coll=item.root_collection;
      if(!expected.has(coll)||item.document_path.slice(0,coll.length+1)!==coll+'/')
        throw fail('candidate_document_identity_invalid');
      const itemId=item.document_path.slice(coll.length+1);
      if(!itemId||itemId.includes('/')||
        qaCanonicalDocumentHash(item.document_json)!==item.content_hash)
        throw fail('candidate_document_hash_invalid');
      groups.get(coll).push({path:item.document_path,hash:item.content_hash});
      if(coll==='qa_evaluations'){
        candidates.push(normalizeQaFirestoreEvaluation(
          itemId,item.document_json,item.content_hash));
      }
    }
    for(const [coll,manifest] of expected){
      const group=groups.get(coll);
      if(group.length!==manifest.count||
        qaManifestDigest(group)!==manifest.digest)
        throw fail('candidate_source_manifest_mismatch');
    }
    if(candidates.length!==expected.get('qa_evaluations').count)
      throw fail('candidate_evaluation_count_mismatch');
    const preexisting=(await client.query(
      'SELECT snapshot_id FROM qa_failover_v1.live_candidate_audit WHERE snapshot_id=$1',
      [snapshotId])).rows;
    if(preexisting.length)throw fail('candidate_snapshot_already_materialized');

    for(let start=0;start<candidates.length;start+=50){
      const current=candidates.slice(start,start+50),bindings=[],values=[];
      for(const item of current){
        const n=values.length;
        bindings.push('($'+(n+1)+',$'+(n+2)+',$'+(n+3)+'::jsonb,$'+(n+4)+',$'+(n+5)+',$'+(n+6)+'::timestamptz)');
        values.push(snapshotId,item.evaluationId,JSON.stringify(item.record),
          item.sourceHash,item.unchangedFinalScore,item.deletedAt);
      }
      await client.query(
        'INSERT INTO qa_failover_v1.live_candidate_evaluations'+
        ' (snapshot_id,evaluation_id,record,source_hash,original_score,deleted_at) VALUES '+
        bindings.join(','),values
      );
    }
    const saved=(await client.query(
      'SELECT evaluation_id,record,source_hash,original_score,deleted_at'+
      ' FROM qa_failover_v1.live_candidate_evaluations'+
      ' WHERE snapshot_id=$1 ORDER BY evaluation_id',[snapshotId]
    )).rows;
    if(saved.length!==candidates.length)throw fail('candidate_saved_count_mismatch');
    const originals=new Map(candidates.map(x=>[x.evaluationId,x]));
    for(const row of saved){
      const item=originals.get(row.evaluation_id);
      if(!item||row.source_hash!==item.sourceHash||
        Number(row.original_score)!==item.unchangedFinalScore||
        row.record?.finalScore!==item.unchangedFinalScore||
        qaCanonicalDocumentHash({topics:row.record?.topics})!==
          qaCanonicalDocumentHash({topics:item.record.topics})||
        (row.deleted_at?new Date(row.deleted_at).toISOString():null)!==
          (item.deletedAt?new Date(item.deletedAt).toISOString():null))
        throw fail('candidate_saved_score_mismatch');
    }
    await client.query(
      'INSERT INTO qa_failover_v1.live_candidate_audit'+
      ' (snapshot_id,evaluation_count,eligible_for_failover) VALUES($1,$2,false)',
      [snapshotId,candidates.length]
    );
    await client.query('COMMIT');inTx=false;
    return Object.freeze({
      sourceSnapshot:snapshotId,
      candidateEvaluations:candidates.length,
      originalScoresPreserved:true,
      originalTopicScoresPreserved:true,
      existingArchiveUntouched:true,
      liveFailoverEnabled:false,
      readyForProduction:false,
    });
  }catch(e){
    if(inTx)await client.query('ROLLBACK').catch(()=>{});
    throw e;
  }finally{client.release();}
}
