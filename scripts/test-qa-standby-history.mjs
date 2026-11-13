import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const apiText=await readFile(new URL('../src/qaStandbyEvaluationApi.ts',import.meta.url),'utf8');
const helperText=await readFile(new URL('../src/qaStandbyEvaluationHistory.ts',import.meta.url),'utf8');
const storeText=await readFile(new URL('../src/evaluationStore.ts',import.meta.url),'utf8');
const folder=await mkdtemp(path.join(os.tmpdir(),'qa-standby-history-'));
const compile=(text)=>ts.transpileModule(text,{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,
  strict:true,
},reportDiagnostics:true});
try{
  const api=compile(apiText),helper=compile(helperText);
  for(const entry of [api,helper])assert.equal(
    entry.diagnostics.filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
  await writeFile(path.join(folder,'api.mjs'),api.outputText,'utf8');
  await writeFile(path.join(folder,'history.mjs'),helper.outputText.replace(
    /from ['"]\.\/qaStandbyEvaluationApi['"]/,
    "from './api.mjs'",
  ),'utf8');
  const mod=await import(pathToFileURL(path.join(folder,'history.mjs')).href);
  const session='qa_editor-8c11937f-01ab-4455-b6f2-620fb73e3e44';
  const row=(id,score)=>({
    evaluationId:id,version:1,origin:'firebase_snapshot',
    record:{id,finalScore:score,topics:[{code:'1',score:8}]},
  });
  const makeResponse=(rows,hasMore=false,nextAfterId=null)=>({
    ok:true,source:'local-postgres-standby',dataStatus:'verified-snapshot',
    rows,hasMore,nextAfterId,
  });
  let requests=0,broken=false,duplicate=false,wrongId=false,noCursor=false;
  const fetchImpl=async(url,opts)=>{
    requests++;
    assert.equal(opts.headers['x-qa-user-session'],session);
    assert.equal(opts.headers.authorization,undefined);
    const params=new URL(url,'https://qa.test').searchParams;
    assert.equal(params.get('qaData'),'1');
    assert.equal(params.get('action'),'list');
    assert.equal(params.get('limit'),'100');
    const cursor=params.get('afterId');
    if(!cursor)return new Response(JSON.stringify(makeResponse(
      [row('QA-001',80),row('QA-002',85)],true,
      noCursor?null:'QA-002',
    )),{status:200});
    assert.equal(cursor,'QA-002');
    if(broken)return new Response(JSON.stringify({ok:false}),{status:503});
    return new Response(JSON.stringify(makeResponse([
      duplicate?row('QA-002',85):
        wrongId?{...row('QA-003',90),record:{id:'WRONG',finalScore:90,topics:[]}}
          :row('QA-003',90),
    ])),{status:200});
  };
  const results=await mod.fetchCompleteQaStandbyEvaluationHistory(session,{fetchImpl});
  assert.deepEqual(results.map(x=>x.finalScore),[80,85,90]);
  assert.equal(requests,2);
  broken=true;
  await assert.rejects(mod.fetchCompleteQaStandbyEvaluationHistory(session,{fetchImpl}),
    /not available or request rejected/);
  broken=false;duplicate=true;
  await assert.rejects(mod.fetchCompleteQaStandbyEvaluationHistory(session,{fetchImpl}),
    /not available or request rejected/);
  duplicate=false;wrongId=true;
  await assert.rejects(mod.fetchCompleteQaStandbyEvaluationHistory(session,{fetchImpl}),
    /not available or request rejected/);
  wrongId=false;noCursor=true;
  await assert.rejects(mod.fetchCompleteQaStandbyEvaluationHistory(session,{fetchImpl}),
    /not available or request rejected/);
  const count=requests;
  await assert.rejects(mod.fetchCompleteQaStandbyEvaluationHistory('invalid',{fetchImpl}),
    /not available or request rejected/);
  assert.equal(requests,count,'invalid session cannot call any server');
  globalThis.window={localStorage:{getItem:()=>JSON.stringify({sessionId:session})}};
  assert.equal(mod.currentQaDashboardSessionId(),session);
  globalThis.window={localStorage:{getItem:()=>'{bad-json'}};
  assert.equal(mod.currentQaDashboardSessionId(),'');
  delete globalThis.window;
  assert.equal(mod.currentQaDashboardSessionId(),'');
  assert.ok(storeText.includes('STANDBY_READ_ON_FIRESTORE_QUOTA && isFirestoreQuotaError(error)'),
    'Browser may only request standby history after a primary quota failure');
  assert.ok(storeText.includes('if (usedCertifiedStandby)'),
    'PG standby history must not merge browser-only drafts with official scores');
  assert.ok(storeText.includes('return limitEvaluationScopes(recoveredFirebaseEvaluations, safeLimit);'),
    'Certified snapshot output must be limited by existing QA scope rules');
  assert.ok(!helperText.includes('QA_LOCAL_STANDBY_DATA_TOKEN'),
    'No private Windows or Cloudflare bearer may exist in the client bundle');
  console.log('PASS QA standby history: complete authenticated PG pagination, duplicates/partial page rejection, no browser-only official scores, Firestore quota gate');
}finally{delete globalThis.window;await rm(folder,{recursive:true,force:true});}
