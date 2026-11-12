// Resume the already verified QA snapshot locally. Zero Firestore requests.
// No source reads, no archive modifications, no QA production writes.
// Fail closed unless every evaluation normalizes with its ORIGINAL scores.
import pg from 'pg';
import {normalizeQaFirestoreEvaluation} from '../server/qaFirestoreSnapshotCodec.js';
import {qaCanonicalDocumentHash,QA_SYNC_DATASETS} from '../server/qaLiveMirrorStage.js';
import {materializeQaStandbyEvaluationCandidates} from '../server/qaStandbyCandidateMaterializer.js';

const fail=code=>Object.assign(new Error(code),{code});
const codeForError=e=>{
  const safe=new Set([
    'evaluation_identity_invalid','evaluation_document_id_mismatch',
    'evaluation_score_invalid_or_missing','evaluation_scope_or_topics_invalid',
    'evaluation_metadata_invalid','evaluation_type_invalid',
    'evaluation_topic_score_invalid','candidate_document_hash_invalid',
    'candidate_saved_score_mismatch','candidate_source_unverified',
    'candidate_source_manifest_mismatch','candidate_requires_disabled_standby',
    'candidate_snapshot_already_materialized',
  ]);
  return safe.has(e?.code||e?.message)?(e.code||e.message):'LOCAL_MATERIALIZATION_FAILED_CLOSED';
};
const dbUrl=process.env.QA_LOCAL_DATABASE_URL;
if(!dbUrl){console.log('QA_OFFLINE_MATERIALIZE=IMPORTER_URL_MISSING');process.exit(2);}
const pool=new pg.Pool({connectionString:dbUrl,max:1,connectionTimeoutMillis:5000,
  statement_timeout:60000});
try {
  const identity=(await pool.query(
    "SELECT current_database() AS db,current_user AS role,"+
    " current_setting('transaction_read_only') AS transaction_ro"
  )).rows?.[0];
  if(identity?.db!=='qa_dashboard_lab'||identity.role!=='qa_snapshot_importer'||
      identity.transaction_ro!=='off')throw fail('LOCAL_IMPORTER_NOT_VERIFIED');
  const state=(await pool.query(
    'SELECT mode,source_snapshot_verified,write_frozen FROM qa_failover_v1.state WHERE id=1'
  )).rows?.[0];
  if(state?.mode!=='disabled'||state.source_snapshot_verified!==false||
     state.write_frozen!==true)throw fail('LOCAL_STANDBY_NOT_FROZEN');
  const batches=(await pool.query(
    "SELECT snapshot_id,status,source_documents,stored_documents,dataset_manifest"+
    " FROM qa_failover_v1.live_snapshot_batches"+
    " WHERE status='copy_verified' AND approved_for_failover=false"+
    " ORDER BY created_at DESC LIMIT 1"
  )).rows;
  const b=batches?.[0];
  if(!b||Number(b.source_documents)!==Number(b.stored_documents)||
     b.dataset_manifest?.length!==QA_SYNC_DATASETS.length)
    throw fail('LOCAL_VERIFIED_SNAPSHOT_NOT_FOUND');
  const existing=(await pool.query(
    'SELECT evaluation_count FROM qa_failover_v1.live_candidate_audit WHERE snapshot_id=$1',
    [b.snapshot_id]
  )).rows?.[0];
  if(existing){
    console.log('QA_OFFLINE_CANDIDATES=ALREADY_MATERIALIZED');
    console.log('QA_OFFLINE_EVALUATIONS='+Number(existing.evaluation_count));
  }else{
    const rows=(await pool.query(
      "SELECT document_path,document_json,content_hash FROM qa_failover_v1.live_snapshot_rows"+
      " WHERE snapshot_id=$1 AND root_collection='qa_evaluations' ORDER BY document_path",
      [b.snapshot_id]
    )).rows;
    const manifest=b.dataset_manifest.find(x=>x.dataset==='qa_evaluations');
    if(!manifest||rows.length!==manifest.count)
      throw fail('LOCAL_EVALUATION_COUNT_MISMATCH');
    // Preflight every record before first local insert. No partial scores.
    for(const row of rows){
      const docId=row.document_path.slice('qa_evaluations/'.length);
      if(qaCanonicalDocumentHash(row.document_json)!==row.content_hash)
        throw fail('candidate_document_hash_invalid');
      normalizeQaFirestoreEvaluation(docId,row.document_json,row.content_hash);
    }
    console.log('QA_OFFLINE_PRECHECK=ALL_ORIGINAL_SCORES_VALID');
    const result=await materializeQaStandbyEvaluationCandidates({
      pool,snapshotId:b.snapshot_id
    });
    if(result.candidateEvaluations!==rows.length||result.originalScoresPreserved!==true||
       result.originalTopicScoresPreserved!==true)throw fail('LOCAL_SCORE_COUNT_MISMATCH');
    console.log('QA_OFFLINE_CANDIDATES=ORIGINAL_SCORES_VERIFIED');
    console.log('QA_OFFLINE_EVALUATIONS='+result.candidateEvaluations);
  }
  console.log('QA_OFFLINE_DATASETS='+b.dataset_manifest.length);
  console.log('QA_OFFLINE_DOCUMENTS='+Number(b.stored_documents));
  console.log('QA_OFFLINE_RESULT=STAGED_NOT_ACTIVE');
  console.log('QA_FAILOVER=OFF');
}catch(e){
  console.log('QA_OFFLINE_MATERIALIZE='+codeForError(e));
  console.log('QA_FAILOVER=OFF');
  process.exitCode=2;
}finally{
  await pool.end().catch(()=>{});
  console.log('QA_OFFLINE_FIRESTORE_READS=0');
}
