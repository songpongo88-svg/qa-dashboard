import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const input=await readFile(new URL('../src/qaStandbyEvaluationApi.ts',import.meta.url),'utf8');
const diagnostic=ts.transpileModule(input,{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,strict:true,
},reportDiagnostics:true});
assert.deepEqual(diagnostic.diagnostics.filter(x=>x.category===ts.DiagnosticCategory.Error),[]);
const file=path.join(os.tmpdir(),'qa-standby-client-'+process.pid+'-'+Date.now()+'.mjs');
await writeFile(file,diagnostic.outputText,'utf8');
const session='qa_editor-8c11937f-01ab-4455-b6f2-620fb73e3e44';
let count=0,body={
  ok:true,source:'local-postgres-standby',dataStatus:'verified-snapshot',
  rows:[{evaluationId:'QA-001',version:1,origin:'firebase_snapshot',record:{id:'QA-001',finalScore:85}}],
  hasMore:false,nextAfterId:null,
},status=200;
const mockFetch=async(url,options)=>{
  count++;
  assert.ok(url.startsWith('/api/cron/expire-additional-appeals?'));
  assert.equal(options.headers['x-qa-user-session'],session);
  assert.equal(options.headers.authorization,undefined);
  assert.equal(options.credentials,'same-origin');
  assert.equal(options.cache,'no-store');
  return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
};
try{
  const api=await import(pathToFileURL(file).href);
  const list=await api.listQaStandbyEvaluations(session,{month:'2026-11',limit:50,fetchImpl:mockFetch});
  assert.equal(list.rows[0].record.finalScore,85);
  assert.equal(count,1);
  body={ok:true,source:'local-postgres-standby',dataStatus:'verified-snapshot',
    found:true,evaluationId:'QA-001',version:1,record:{id:'QA-001',finalScore:85}};
  const record=await api.readQaStandbyEvaluation(session,'QA-001',{fetchImpl:mockFetch});
  assert.equal(record.record.finalScore,85);
  assert.equal(count,2);
  const pending={operationId:'op-1',evaluationId:'QA-001',action:'update',
    expectedVersion:1,record:{id:'QA-001',finalScore:83}};
  body={ok:true,operationId:'op-1',evaluationId:'QA-001',version:2,queued:true,replay:false};
  const fakeFetch=async(url,init)=>{
    assert.equal(init.method,'POST');
    assert.equal(init.headers['idempotency-key'],'op-1');
    assert.equal(JSON.parse(init.body).record.finalScore,83);
    return mockFetch(url,init);
  };
  const receipt=await api.writeQaStandbyEvaluation(session,pending,{fetchImpl:fakeFetch});
  assert.equal(receipt.queued,true);
  assert.equal(receipt.version,2);
  assert.equal(count,3);
  body={...body,version:8};
  await assert.rejects(api.writeQaStandbyEvaluation(session,pending,{fetchImpl:fakeFetch}),
    e=>e instanceof api.QaStandbyRequestDenied&&e.httpStatus===502);
  body={ok:true,source:'unverified-archive',dataStatus:'archived',rows:[],hasMore:false};
  await assert.rejects(api.listQaStandbyEvaluations(session,{fetchImpl:mockFetch}),
    e=>e instanceof api.QaStandbyRequestDenied);
  status=503;
  body={ok:false,error:'not_ready'};
  await assert.rejects(api.listQaStandbyEvaluations(session,{fetchImpl:mockFetch}),
    e=>e instanceof api.QaStandbyRequestDenied&&e.httpStatus===503);
  const before=count;
  await assert.rejects(api.listQaStandbyEvaluations('invalid',{fetchImpl:mockFetch}),/not available/);
  await assert.rejects(api.listQaStandbyEvaluations(session,{month:'2026-13',fetchImpl:mockFetch}),/invalid month/);
  await assert.rejects(api.readQaStandbyEvaluation(session,'../../unsafe',{fetchImpl:mockFetch}),/invalid QA ID/);
  await assert.rejects(api.writeQaStandbyEvaluation(session,{...pending,expectedVersion:-1},{fetchImpl:mockFetch}),/invalid standby write/);
  assert.equal(count,before,'client validation must fail before network calls');
  assert.ok(!input.includes('localStorage'),'session must be passed explicitly, not pulled from arbitrary cache');
  assert.ok(!input.includes('VITE_QA_LOCAL_BRIDGE_TOKEN'),'never expose bridge secret in browser');
  console.log('PASS QA typed standby client: verified reads, versioned durable receipt, no false central submission or leaked token, fail closed');
}finally{await unlink(file).catch(()=>{});}
