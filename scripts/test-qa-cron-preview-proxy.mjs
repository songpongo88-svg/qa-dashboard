import assert from 'node:assert/strict';
import handler from '../api/cron/expire-additional-appeals.js';
const names=[
  'VERCEL_ENV','QA_LOCAL_DIAGNOSTICS_ENABLED','QA_LOCAL_DIAGNOSTIC_KEY',
  'QA_LOCAL_BRIDGE_URL','QA_LOCAL_BRIDGE_TOKEN',
  'QA_CF_ACCESS_CLIENT_ID','QA_CF_ACCESS_CLIENT_SECRET','CRON_SECRET',
  'FIREBASE_SERVICE_ACCOUNT_JSON','GOOGLE_SERVICE_ACCOUNT_JSON',
];
const envBefore=Object.fromEntries(names.map(k=>[k,process.env[k]]));
const fetchBefore=globalThis.fetch;
const bridgeToken='q'.repeat(64);
const diagnosticKey='d'.repeat(64);
let fetches=[];
function mockResponse(){
  let status=200;
  const headers={};
  return { setHeader(k,v){headers[k]=v;return this;},
    status(n){status=n;return this;},json(body){return {status,headers,body};} };
}
const invoke=(req)=>handler({method:'GET',headers:{},query:{},...req},mockResponse());
try {
  for(const k of names) delete process.env[k];
  process.env.VERCEL_ENV='preview';
  process.env.QA_LOCAL_DIAGNOSTICS_ENABLED='1';
  process.env.QA_LOCAL_DIAGNOSTIC_KEY=diagnosticKey;
  process.env.QA_LOCAL_BRIDGE_URL='https://qa-archive.example.com/';
  process.env.QA_LOCAL_BRIDGE_TOKEN=bridgeToken;
  globalThis.fetch=async(url,options)=>{
    fetches.push({url,options});
    assert.equal(url,'https://qa-archive.example.com/ready');
    assert.equal(options.method,'GET');
    assert.equal(options.headers.Authorization,'Bearer '+bridgeToken);
    assert.equal(options.redirect,'manual');
    return {ok:true,headers:new Map([['content-type','application/json']]),
      text:async()=>JSON.stringify({ok:true,readOnly:true,databaseConnected:true,privateScore:93})};
  };
  // Request goes to QA diagnostics, NOT the appeal-expiry Firestore writer.
  let r=await invoke({query:{qaProbe:'1',check:'ready'}});
  assert.equal(r.status,403);
  assert.equal(fetches.length,0);
  r=await invoke({query:{qaProbe:'1',check:'ready'},headers:{'x-qa-diagnostic-key':diagnosticKey}});
  assert.equal(r.status,200);
  assert.deepEqual(r.body,{ok:true,mode:'non-production-diagnostic',databaseConnected:true,readOnly:true});
  assert.equal(fetches.length,1);
  assert.equal(JSON.stringify(r.body).includes('privateScore'),false);
  r=await invoke({query:{qaProbe:'1',check:'ready'},method:'POST',headers:{'x-qa-diagnostic-key':diagnosticKey}});
  assert.equal(r.status,405);
  assert.equal(fetches.length,1,'Post must not contact either archive or Firestore');
  // Production lock overrides credentials and preview flags.
  process.env.VERCEL_ENV='production';
  r=await invoke({query:{qaProbe:'1',check:'ready'},headers:{'x-qa-diagnostic-key':diagnosticKey}});
  assert.equal(r.status,404);
  assert.equal(fetches.length,1);
  // Existing scheduled QA appeal expiry remains protected by CRON_SECRET.
  r=await invoke({query:{}});
  assert.equal(r.status,401);
  assert.equal(fetches.length,1);
  r=await invoke({query:{qaProbe:'no',check:'ready'}});
  assert.equal(r.status,401);
  assert.equal(fetches.length,1);
  console.log('PASS: QA-only Preview bridge routing rejects anonymous callers and Production; original scheduled appeal authorization unchanged');
} finally {
  globalThis.fetch=fetchBefore;
  for(const [k,v] of Object.entries(envBefore)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
}
