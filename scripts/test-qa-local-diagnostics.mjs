import assert from 'node:assert/strict';
import handler from '../server/qaLocalDiagnosticsHandler.js';
const oldEnv = { ...process.env };
const oldFetch = globalThis.fetch;
const token = 'q'.repeat(60);
function makeResponse() {
  let code = 200;
  return {
    setHeader(){},
    status(n){code=n;return this;},
    json(body){return { status:code, body };},
  };
}
const run = (overrides={}) => handler({
  method:'GET',headers:{},query:{check:'ready'},...overrides,
},makeResponse());
try {
  process.env.VERCEL_ENV='preview';
  process.env.QA_LOCAL_DIAGNOSTICS_ENABLED='0';
  assert.equal((await run()).status,404);
  process.env.QA_LOCAL_DIAGNOSTICS_ENABLED='1';
  process.env.QA_LOCAL_DIAGNOSTIC_KEY='a'.repeat(50);
  process.env.QA_LOCAL_BRIDGE_TOKEN=token;
  process.env.QA_LOCAL_BRIDGE_URL='https://qa.example.com/';
  assert.equal((await run()).status,403);
  assert.equal((await run({method:'POST'})).status,405);
  assert.equal((await run({headers:{'x-qa-diagnostic-key':'a'.repeat(50)},query:{check:'evaluations'}})).status,400);
  process.env.QA_LOCAL_BRIDGE_URL='http://127.0.0.1:5432/';
  assert.equal((await run({headers:{'x-qa-diagnostic-key':'a'.repeat(50)}})).status,503);
  process.env.QA_LOCAL_BRIDGE_URL='https://qa.example.com/';
  globalThis.fetch=async(url,options)=>{
    assert.equal(url,'https://qa.example.com/ready');
    assert.equal(options.headers.Authorization,`Bearer ${token}`);
    assert.equal(options.redirect,'manual');
    return {ok:true,headers:new Map([['content-type','application/json']]),
      text:async()=>JSON.stringify({ok:true,readOnly:true,databaseConnected:true,confidential:'do-not-return'})};
  };
  const response=await run({headers:{'x-qa-diagnostic-key':'a'.repeat(50)}});
  assert.equal(response.status,200);
  assert.equal(response.body.databaseConnected,true);
  assert.ok(!JSON.stringify(response.body).includes('confidential'));
  globalThis.fetch=async()=>({ok:true,headers:new Map([['content-type','application/json']]),
    text:async()=>JSON.stringify({ok:true,readOnly:false,databaseConnected:true})});
  assert.equal((await run({headers:{'x-qa-diagnostic-key':'a'.repeat(50)}})).status,502);
  process.env.VERCEL_ENV='production';
  assert.equal((await run({headers:{'x-qa-diagnostic-key':'a'.repeat(50)}})).status,404);
  console.log('PASS: QA local diagnostic is read-only, preview-only, operator-gated and fail-closed');
} finally {
  globalThis.fetch=oldFetch;
  for (const key of Object.keys(process.env)) if (!(key in oldEnv)) delete process.env[key];
  for (const [key,value] of Object.entries(oldEnv)) process.env[key]=value;
}
