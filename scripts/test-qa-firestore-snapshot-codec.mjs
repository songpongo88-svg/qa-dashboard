import assert from 'node:assert/strict';
import {
  decodeQaFirestoreSnapshotDocument,normalizeQaFirestoreEvaluation,
} from '../server/qaFirestoreSnapshotCodec.js';
const HASH='a'.repeat(64);
const f=(key,v)=>{
  if(v===null)return {nullValue:null};
  if(Array.isArray(v))return {arrayValue:{values:v.map(x=>f('',x))}};
  if(typeof v==='boolean')return {booleanValue:v};
  if(typeof v==='number')return {doubleValue:v};
  if(typeof v==='string')return {stringValue:v};
  return {mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,f(k,x)]))}};
};
const original={
  id:'evaluation-2026-11-001',evaluation_key:'case-eval-unique-01',
  evaluation_type:'case',evaluation_month_key:'2026-11',
  case_id:'AA334880',agent_name:'QA Fixture Agent',
  evaluator_username:'qa_fixture',final_score:85.25,
  topics:[{code:'1.5',score:8,max:10,comment:'SLA',issueTags:['SLA']},
    {code:'2.1',score:9,max:10,comment:'Process'}],
  raw_data_preview:{'Original Score':85.25,'Intent':'Delivery follow-up'},
  evidence_urls:['file-001'],call_logs:[{id:'call-001',phoneNumber:'fixture'}],
  submitted_at:'2026-11-11T08:00:00.000Z',
  updated_at:'2026-11-11T08:00:00.000Z',
  grade:'B+',strengths:['clear closing'],improvements:[],
};
const typed={fields:Object.fromEntries(Object.entries(original).map(([k,v])=>[k,f(k,v)])),
  createTime:'2026-11-11T08:00:00.000Z',
  updateTime:'2026-11-11T08:00:00.000Z'};
const decoded=decodeQaFirestoreSnapshotDocument(typed);
assert.deepEqual(decoded,original);
const normalized=normalizeQaFirestoreEvaluation(original.id,typed,HASH);
assert.equal(normalized.record.id,original.id);
assert.equal(normalized.record.finalScore,85.25);
assert.equal(normalized.record.evaluationMonthKey,'2026-11');
assert.equal(normalized.record.topics[0].score,8);
assert.equal(normalized.record.rawDataPreview['Original Score'],85.25);
assert.equal(normalized.record.evidenceUrls[0],'file-001');
assert.equal(normalized.record.callLogs[0].id,'call-001');
assert.equal(normalized.record.deletedAt,'');
assert.equal(normalized.sourceHash,HASH);
const alter=(k,v)=>({fields:{...typed.fields,[k]:f(k,v)}});
assert.throws(()=>normalizeQaFirestoreEvaluation(original.id,
  {fields:Object.fromEntries(Object.entries(typed.fields).filter(([k])=>k!=='final_score'))},HASH),
  e=>e.code==='evaluation_score_invalid_or_missing');
assert.throws(()=>normalizeQaFirestoreEvaluation(original.id,alter('final_score',101),HASH),
  e=>e.code==='evaluation_score_invalid_or_missing');
assert.throws(()=>normalizeQaFirestoreEvaluation(original.id,alter('evaluation_month_key','2026-22'),HASH),
  e=>e.code==='evaluation_scope_or_topics_invalid');
assert.throws(()=>normalizeQaFirestoreEvaluation(original.id,alter('topics',
  [{code:'1.5',score:12,max:10,comment:'bad'}]),HASH),
  e=>e.code==='evaluation_topic_score_invalid');
// Existing Firestore records may use Unicode and long IDs. Preserve their
// document identity and original scores without hashing or renaming the IDs.
for(const id of ['ประเมิน-เคส-๑','QA Case — 2026', 'x'.repeat(200)]){
  const doc=alter('id',id);
  const item=normalizeQaFirestoreEvaluation(id,doc,HASH);
  assert.equal(item.record.id,id);
  assert.equal(item.record.finalScore,85.25);
  assert.equal(item.record.topics[0].score,8);
}
for(const id of ['','slash/id','bad\nname','x'.repeat(901)]){
  assert.throws(()=>normalizeQaFirestoreEvaluation(id,alter('id',id),HASH),
    e=>e.code==='evaluation_identity_invalid');
}
assert.throws(()=>normalizeQaFirestoreEvaluation('changed-id',typed,HASH),
  e=>e.code==='evaluation_document_id_mismatch');
assert.throws(()=>decodeQaFirestoreSnapshotDocument({fields:{num:{integerValue:'9007199254740992'}}}),
  e=>e.code==='firestore_integer_not_safe');
assert.throws(()=>decodeQaFirestoreSnapshotDocument({fields:{ambiguous:{stringValue:'x',booleanValue:true}}}),
  e=>e.code==='firestore_value_ambiguous');
assert.throws(()=>decodeQaFirestoreSnapshotDocument({fields:{
  malicious:{mapValue:{fields:{constructor:{stringValue:'bad'}}}},
}}),e=>e.code==='firestore_field_name_unsafe');
console.log('PASS QA codec: original scores, topic points, evidence, timestamps, and document identity preserved; corrupt cases blocked');
