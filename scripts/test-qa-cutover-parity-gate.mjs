import assert from 'node:assert/strict';
import { evaluateQaCutoverParity } from '../server/qaCutoverParityGate.js';

const datasets=['qa_evaluations','qa_appeal_events','qa_signature_documents','historical_qa_excel_rows'];
const sha='f'.repeat(64),shaOther='a'.repeat(64);
const source=(dataset)=>({
  authority:dataset==='historical_qa_excel_rows'?'verified-original-excel-archive':'firebase-current',
  complete:true,verified:true,syncState:'validated',
  observedCount:1,checkedAt:new Date().toISOString(),
  entries:[{key:dataset+'/doc-1',sha256:sha}],
});
const destination=(dataset)=>({
  authority:'postgresql-cutover-candidate',complete:true,verified:true,
  observedCount:1,entries:[{key:dataset+'/doc-1',sha256:sha}],
});
const full=()=>datasets.map(dataset=>({dataset,source:source(dataset),destination:destination(dataset)}));
assert.equal(evaluateQaCutoverParity(full()).ready,true,'complete matching manifests pass');
assert.deepEqual(evaluateQaCutoverParity([]).ready,false);
{
  const m=full(); m[0].source.authority='local-backup';
  assert.equal(evaluateQaCutoverParity(m).ready,false,'local snapshot cannot replace Firebase authority');
}
{
  const m=full(); m[0].source.syncState='pending';
  assert.equal(evaluateQaCutoverParity(m).ready,false,'pending sync cannot certify completion');
}
{
  const m=full(); m[0].source.checkedAt=new Date(Date.now()-6*60_000).toISOString();
  assert.equal(evaluateQaCutoverParity(m).ready,false,'stale source scan must fail');
}
{
  const m=full(); m[1].destination.entries[0].sha256=shaOther;
  const v=evaluateQaCutoverParity(m);
  assert.equal(v.ready,false);
  assert.equal(v.details.find(x=>x.dataset==='qa_appeal_events').changed,1);
}
{
  const m=full(); m[2].destination.entries=[];
  assert.equal(evaluateQaCutoverParity(m).ready,false,'absent signature record must fail');
}
{
  const m=full(); m[3].source.entries.push({...m[3].source.entries[0]});
  m[3].source.observedCount=2;
  assert.equal(evaluateQaCutoverParity(m).ready,false,'duplicated historical row key must fail');
}
{
  const m=full().slice(1);
  assert.equal(evaluateQaCutoverParity(m).ready,false,'missing evaluation manifest must fail');
}
{
  const m=full(); m[0].source.observedCount=563;
  assert.equal(evaluateQaCutoverParity(m).ready,false,'count-only 563-record backup must fail');
}
console.log('PASS: QA cutover requires fresh complete source hashes for evaluations, appeals, signatures, Excel, with zero missing/changed rows');
