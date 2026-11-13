// Offline, read-only snapshot candidate inspection. NO Firestore calls.
// Reports aggregate error codes only; never emit case IDs, user data or records.
import pg from 'pg';
import {normalizeQaFirestoreEvaluation} from '../server/qaFirestoreSnapshotCodec.js';
import {qaCanonicalDocumentHash} from '../server/qaLiveMirrorStage.js';

const errors=new Map();
const count=(k)=>errors.set(k,(errors.get(k)||0)+1);
const known=new Set([
'evaluation_identity_invalid','evaluation_document_id_mismatch',
'evaluation_score_invalid_or_missing','evaluation_scope_or_topics_invalid',
'evaluation_metadata_invalid','evaluation_type_invalid',
'evaluation_topic_score_invalid','firestore_value_invalid',
'firestore_value_ambiguous','firestore_integer_not_safe',
'firestore_field_name_unsafe','firestore_document_invalid',
'firestore_value_unsupported','candidate_document_hash_invalid'
]);
const pool=new pg.Pool({connectionString:process.env.QA_LOCAL_DATABASE_URL,max:1,
 connectionTimeoutMillis:4000,statement_timeout:15000,
 options:'-c default_transaction_read_only=on'});
try {
 const c=await pool.connect();
 try {
  const db=(await c.query('SELECT current_database() AS db')).rows?.[0]?.db;
  const role=(await c.query('SELECT current_user AS role')).rows?.[0]?.role;
  if(db!=='qa_dashboard_lab'||role!=='qa_snapshot_importer') {
    console.log('QA_OFFLINE_AUDIT=WRONG_DATABASE_OR_ROLE');
    process.exitCode=2;
  } else {
    const b=(await c.query(
      "SELECT snapshot_id,status,source_documents,stored_documents,dataset_manifest"+
      " FROM qa_failover_v1.live_snapshot_batches"+
      " WHERE status='copy_verified' AND approved_for_failover=false"+
      " ORDER BY created_at DESC LIMIT 1"
    )).rows?.[0];
    if(!b){console.log('QA_OFFLINE_AUDIT=NO_VERIFIED_SNAPSHOT');process.exitCode=2;}
    else {
      const manifest=Array.isArray(b.dataset_manifest)?b.dataset_manifest:[];
      console.log('QA_OFFLINE_DATASETS='+manifest.length);
      console.log('QA_OFFLINE_DOCUMENTS='+Number(b.stored_documents||0));
      const rows=(await c.query(
        "SELECT document_path,document_json,content_hash FROM qa_failover_v1.live_snapshot_rows"+
        " WHERE snapshot_id=$1 AND root_collection='qa_evaluations' ORDER BY document_path",
        [b.snapshot_id]
      )).rows;
      let valid=0;
      for(const row of rows){
        try{
          const id=row.document_path.slice('qa_evaluations/'.length);
          if(qaCanonicalDocumentHash(row.document_json)!==row.content_hash)
            throw Object.assign(new Error('candidate_document_hash_invalid'),{code:'candidate_document_hash_invalid'});
          normalizeQaFirestoreEvaluation(id,row.document_json,row.content_hash);
          valid++;
        }catch(e){
          const k=e?.code||e?.message;
          count(known.has(k)?k:'evaluation_unclassified_error');
        }
      }
      console.log('QA_OFFLINE_EVALUATIONS='+rows.length);
      console.log('QA_OFFLINE_VALID_EVALUATIONS='+valid);
      console.log('QA_OFFLINE_INVALID_EVALUATIONS='+(rows.length-valid));
      for(const [code,n] of [...errors].sort((a,b)=>a[0].localeCompare(b[0])))
        console.log('QA_OFFLINE_REASON_'+code.toUpperCase()+'='+n);
      const a=(await c.query(
        'SELECT evaluation_count FROM qa_failover_v1.live_candidate_audit WHERE snapshot_id=$1',
        [b.snapshot_id]
      )).rows?.[0];
      console.log('QA_OFFLINE_CANDIDATES='+(a?Number(a.evaluation_count):'NOT_MATERIALIZED'));
      console.log('QA_OFFLINE_AUDIT=COMPLETED_READ_ONLY');
    }
  }
 } finally {c.release();}
} catch(e) {
 const code=String(e?.code||'');
 const msg=({'28P01':'DB_AUTH_DENIED','42501':'DB_PERMISSION_DENIED',
  '42P01':'DB_TABLE_MISSING','3D000':'DB_MISSING',
  '57014':'DB_TIMED_OUT',ECONNREFUSED:'DB_UNREACHABLE'})[code]||'FAILED_CLOSED';
 console.log('QA_OFFLINE_AUDIT='+msg);
 process.exitCode=2;
}finally {
 await pool.end().catch(()=>{});
 console.log('QA_OFFLINE_FIRESTORE_READS=0');
 console.log('QA_FAILOVER=OFF');
}
