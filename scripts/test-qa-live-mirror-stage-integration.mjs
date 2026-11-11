import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {
  QA_SYNC_DATASETS,qaCanonicalDocumentHash,qaManifestDigest,
  stageQaFirestoreExport,
} from '../server/qaLiveMirrorStage.js';

if(process.env.QA_PG_ISOLATED_TEST!=='1'||!process.env.QA_TEST_DATABASE_URL)
  throw new Error('QA live snapshot test only runs in disposable PostgreSQL CI fixture');
const pool=new pg.Pool({
  connectionString:process.env.QA_TEST_DATABASE_URL,max:2,
  connectionTimeoutMillis:5000,
});
const batch='qa-live-'+randomUUID();
const data=new Map(QA_SYNC_DATASETS.map((name,i)=>[name,
  [{id:'sample-001',data:{id:'sample-001',score:i===0?85:null,
    origin:'synthetic_fixture',nested:{b:2,a:1},labels:['QA','fixture']}},
   {id:'sample-002',data:{id:'sample-002',score:i===0?90:null,origin:'synthetic_fixture'}}]
]));
const expected=new Map(data);
const metadata={
  authority:'firestore-server-export',
  immutableSnapshotVerified:true,sourceAccessVerified:true,
  allCollectionsIncluded:true,
  exportId:'qa-fixture-firestore-'+randomUUID(),
  snapshotId:batch,
  exportedAt:new Date().toISOString(),
  manifests:QA_SYNC_DATASETS.map(dataset=>({
    dataset,count:data.get(dataset).length,
    digest:qaManifestDigest(data.get(dataset).map(x=>({
      path:dataset+'/'+x.id,hash:qaCanonicalDocumentHash(x.data),
    }))),
  })),
};
const scanner=async function*(dataset){yield* data.get(dataset);};
try{
  const db=await pool.query('SELECT current_database() AS db');
  assert.equal(db.rows?.[0]?.db,'qa_cutover_ci_test');
  const migration=await readFile(new URL('../migration/qa-local-live-snapshot-stage.sql',import.meta.url),'utf8');
  await pool.query(migration);
  const before=(await pool.query("SELECT count(*)::integer AS n FROM qa_failover_v1.source_mirror")).rows[0].n;
  assert.deepEqual(QA_SYNC_DATASETS.length,6);
  assert.equal(qaCanonicalDocumentHash({b:2,a:1}),qaCanonicalDocumentHash({a:1,b:2}));
  await assert.rejects(stageQaFirestoreExport({
    pool,metadata:{...metadata,snapshotId:'qa-live-bad-'+randomUUID(),
      manifests:metadata.manifests.map((x,i)=>i===0?{...x,count:x.count+1}:x)},
    readCollection:scanner,
  }),err=>err.code==='source_manifest_mismatch');
  assert.equal((await pool.query(
    "SELECT count(*)::integer AS n FROM qa_failover_v1.live_snapshot_batches")).rows[0].n,0,
    'mismatched source must not mutate PostgreSQL');
  const receipt=await stageQaFirestoreExport({pool,metadata,readCollection:scanner});
  assert.equal(receipt.storedDocuments,12);
  assert.equal(receipt.postgresCopyVerified,true);
  assert.equal(receipt.firestoreLiveParityVerified,false);
  assert.equal(receipt.failoverAuthorized,false);
  assert.equal(receipt.productionWritesEnabled,false);
  const state=(await pool.query(
    "SELECT source_documents,stored_documents,status,approved_for_failover"+
    " FROM qa_failover_v1.live_snapshot_batches WHERE snapshot_id=$1",[batch])).rows[0];
  assert.equal(state.source_documents,12);
  assert.equal(state.stored_documents,12);
  assert.equal(state.status,'copy_verified');
  assert.equal(state.approved_for_failover,false);
  const sample=(await pool.query(
    "SELECT document_json,content_hash FROM qa_failover_v1.live_snapshot_rows"+
    " WHERE snapshot_id=$1 AND document_path='qa_evaluations/sample-001'",[batch])).rows[0];
  assert.equal(sample.document_json.score,85);
  assert.equal(sample.content_hash,qaCanonicalDocumentHash(sample.document_json));
  assert.equal((await pool.query(
    "SELECT count(*)::integer AS n FROM qa_failover_v1.source_mirror")).rows[0].n,before,
    'archived 2,081 dataset remains untouched');

  await assert.rejects(stageQaFirestoreExport({pool,metadata,readCollection:scanner}),
    err=>Boolean(err.code==='23505'),'duplicate authoritative snapshot ID must not be silently overwritten');

  const badData=new Map([...expected].map(([k,items])=>[k,[...items]]));
  badData.get('qa_evaluations').push(badData.get('qa_evaluations')[0]);
  await assert.rejects(stageQaFirestoreExport({
    pool,metadata:{...metadata,snapshotId:'qa-live-duplicate-'+randomUUID()},
    readCollection:async function*(dataset){yield* badData.get(dataset);},
  }),err=>err.code==='duplicate_source_identity');
  assert.equal((await pool.query(
    "SELECT count(*)::integer AS n FROM qa_failover_v1.live_snapshot_batches")).rows[0].n,1);
  console.log('PASS QA live snapshot stage: six collections, strict identities and hashes, atomic PostgreSQL copy, no old QA score changes, no false live parity/failover');
}finally{await pool.end();}
