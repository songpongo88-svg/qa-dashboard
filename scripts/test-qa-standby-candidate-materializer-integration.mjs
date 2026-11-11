import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {QA_SYNC_DATASETS,qaCanonicalDocumentHash,qaManifestDigest,
  stageQaFirestoreExport} from '../server/qaLiveMirrorStage.js';
import {materializeQaStandbyEvaluationCandidates}
  from '../server/qaStandbyCandidateMaterializer.js';

if(process.env.QA_PG_ISOLATED_TEST!=='1'||!process.env.QA_TEST_DATABASE_URL)
  throw new Error('Disposable PostgreSQL fixture required');
const pool=new pg.Pool({connectionString:process.env.QA_TEST_DATABASE_URL,max:2});
const typed=v=>{
  if(v===null)return {nullValue:null};
  if(Array.isArray(v))return {arrayValue:{values:v.map(typed)}};
  if(typeof v==='boolean')return {booleanValue:v};
  if(typeof v==='number')return {doubleValue:v};
  if(typeof v==='string')return {stringValue:v};
  return {mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,typed(x)]))}};
};
const evalDoc=(id,score,del='')=>{
  const row={
    id,evaluation_key:id,evaluation_type:'case',
    evaluation_month_key:'2026-11',case_id:id,agent_name:'Fixture Agent',
    evaluator_username:'qa_fixture',final_score:score,
    topics:[{code:'1.5',title:'SLA',score:8,max:10,comment:'fixture'}],
    raw_data_preview:{'Original Score':score},
    evidence_urls:[],call_logs:[],deleted_at:del,
  };
  return {id,data:{fields:Object.fromEntries(Object.entries(row).map(([key,v])=>[key,typed(v)])),
    createTime:'2026-11-11T00:00:00Z',updateTime:'2026-11-11T00:00:00Z'}};
};
const makeFixture=(bad=false)=>{
  const docs=new Map(QA_SYNC_DATASETS.map(d=>[d,
    d==='qa_evaluations'?
      [evalDoc('eval-test-01',85),evalDoc('eval-test-02',bad?101:90,'2026-11-11T06:00:00.000Z')]:
      [{id:'fixture-doc-01',data:{fields:{id:{stringValue:'fixture-doc-01'}}}}],
  ]));
  const metadata={
    authority:'firestore-server-export',immutableSnapshotVerified:true,
    sourceAccessVerified:true,allCollectionsIncluded:true,
    exportId:'qa-source-fixture-'+randomUUID(),
    snapshotId:'qa-candidate-fixture-'+randomUUID(),
    exportedAt:new Date().toISOString(),
    manifests:QA_SYNC_DATASETS.map(dataset=>({
      dataset,count:docs.get(dataset).length,
      digest:qaManifestDigest(docs.get(dataset).map(x=>({
        path:dataset+'/'+x.id,hash:qaCanonicalDocumentHash(x.data),
      }))),
    })),
  };
  return {metadata,readCollection:async function*(dataset){yield* docs.get(dataset);}};
};
try{
  const db=await pool.query('SELECT current_database() AS db');
  assert.equal(db.rows[0].db,'qa_cutover_ci_test');
  const migration=await readFile(new URL('../migration/qa-local-live-snapshot-stage.sql',import.meta.url),'utf8');
  await pool.query(migration);
  await pool.query("UPDATE qa_failover_v1.state SET mode='disabled',source_snapshot_verified=false,write_frozen=true WHERE id=1");
  const before=(await pool.query(
    'SELECT count(*)::integer AS n FROM qa_failover_v1.source_mirror')).rows[0].n;
  const activeBefore=(await pool.query(
    'SELECT count(*)::integer AS n FROM qa_failover_v1.evaluations')).rows[0].n;
  const {metadata,readCollection}=makeFixture();
  const stage=await stageQaFirestoreExport({pool,metadata,readCollection});
  assert.equal(stage.storedDocuments,QA_SYNC_DATASETS.length+1);
  const candidate=await materializeQaStandbyEvaluationCandidates({pool,snapshotId:metadata.snapshotId});
  assert.equal(candidate.candidateEvaluations,2);
  assert.equal(candidate.originalScoresPreserved,true);
  assert.equal(candidate.liveFailoverEnabled,false);
  const items=(await pool.query(
    'SELECT evaluation_id,original_score,record,source_hash,deleted_at'+
    ' FROM qa_failover_v1.live_candidate_evaluations WHERE snapshot_id=$1 ORDER BY evaluation_id',
    [metadata.snapshotId])).rows;
  assert.deepEqual(items.map(x=>Number(x.original_score)),[85,90]);
  assert.deepEqual(items.map(x=>x.record.finalScore),[85,90]);
  assert.deepEqual(items.map(x=>x.record.topics[0].score),[8,8]);
  assert.equal(items[0].deleted_at,null);
  assert.equal(new Date(items[1].deleted_at).toISOString(),'2026-11-11T06:00:00.000Z');
  assert.equal(items.every(x=>x.source_hash.length===64),true);
  const audit=(await pool.query(
    'SELECT evaluation_count,eligible_for_failover FROM qa_failover_v1.live_candidate_audit WHERE snapshot_id=$1',
    [metadata.snapshotId])).rows[0];
  assert.equal(audit.evaluation_count,2);
  assert.equal(audit.eligible_for_failover,false);
  await assert.rejects(materializeQaStandbyEvaluationCandidates({pool,snapshotId:metadata.snapshotId}),
    e=>e.code==='candidate_snapshot_already_materialized');

  const bad=makeFixture(true);
  await stageQaFirestoreExport({pool,...bad});
  await assert.rejects(materializeQaStandbyEvaluationCandidates({
    pool,snapshotId:bad.metadata.snapshotId,
  }),e=>e.code==='evaluation_score_invalid_or_missing');
  assert.equal((await pool.query(
    'SELECT count(*)::integer AS n FROM qa_failover_v1.live_candidate_evaluations WHERE snapshot_id=$1',
    [bad.metadata.snapshotId])).rows[0].n,0);
  assert.equal((await pool.query(
    'SELECT count(*)::integer AS n FROM qa_failover_v1.source_mirror')).rows[0].n,before);
  assert.equal((await pool.query(
    'SELECT count(*)::integer AS n FROM qa_failover_v1.evaluations')).rows[0].n,activeBefore);
  const state=(await pool.query(
    'SELECT mode,source_snapshot_verified,write_frozen FROM qa_failover_v1.state WHERE id=1')).rows[0];
  assert.equal(state.mode,'disabled');
  assert.equal(state.source_snapshot_verified,false);
  assert.equal(state.write_frozen,true);
  console.log('PASS QA candidate: exact scores/topics/tombstones, immutable archive and active evaluations untouched, invalid score rolled back, failover OFF');
}finally{await pool.end();}
