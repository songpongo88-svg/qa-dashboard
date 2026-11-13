import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import worker from '../cloudflare/qa-standby-vpc-worker.mjs';

const token='qa-private-'+('x'.repeat(60));
const hash=createHash('sha256').update(token).digest('hex');
const archiveToken='qa-archive-'+('z'.repeat(50));
const archiveHash=createHash('sha256').update(archiveToken).digest('hex');
const session='qa_editor-8c11937f-01ab-4455-b6f2-620fb73e3e44';
let calls=[],status=200;
let response={
  ok:true,source:'local-postgres-standby',dataStatus:'verified-snapshot',
  rows:[{evaluationId:'case-1',version:1,record:{id:'case-1',finalScore:85}}],
};
const env={
  QA_EDGE_DATA_ENABLED:'1',
  QA_EDGE_BEARER_SHA256:archiveHash,
  QA_EDGE_DATA_BEARER_SHA256:hash,
  QA_PRIVATE_DATA_VPC:{
    async fetch(url,request){
      calls.push({url,request});
      assert.ok(url.startsWith('http://127.0.0.1:8790/v1/qa/evaluations'));
      assert.equal(request.headers.authorization,'Bearer '+token);
      assert.equal(request.headers['x-qa-user-session'],session);
      return new Response(JSON.stringify(response),{
        status,headers:{'content-type':'application/json'},
      });
    },
  },
};
const auth={'authorization':'Bearer '+token,'x-qa-user-session':session};
const call=(path='/v1/qa/evaluations',init={},bindings=env)=>
  worker.fetch(new Request('https://qa-gateway.workers.dev'+path,init),bindings);
async function rejected(response,expected){
  assert.equal(response.status,expected);
  assert.equal(response.headers.get('cache-control'),'no-store, max-age=0');
  assert.equal(response.headers.get('access-control-allow-origin'),null);
  assert.equal((await response.json()).ok,false);
}
await rejected(await call(undefined,{headers:auth},{...env,QA_EDGE_DATA_ENABLED:'0'}),503);
assert.equal(calls.length,0);
await rejected(await call(),403);
await rejected(await call(undefined,{headers:{...auth,authorization:'Bearer wrong'}}),403);
await rejected(await call(undefined,{headers:{...auth,authorization:'Bearer '+archiveToken}}),403);
await rejected(await call(undefined,{headers:auth},{...env,QA_EDGE_DATA_BEARER_SHA256:archiveHash}),503);
await rejected(await call(undefined,{headers:{...auth,origin:'https://other.example'}}),403);
await rejected(await call(undefined,{headers:{authorization:'Bearer '+token}}),403);
await rejected(await call('/v1/qa/evaluations/../users',{headers:auth}),404);
await rejected(await call('/v1/qa/evaluations?unexpected=1',{headers:auth}),404);
await rejected(await call('/v1/qa/evaluations/x?month=2026-11',{headers:auth}),400);
await rejected(await call('/v1/qa/evaluations',{method:'DELETE',headers:auth}),405);
assert.equal(calls.length,0);
let r=await call('/v1/qa/evaluations?month=2026-11',{headers:auth});
assert.equal(r.status,200);
assert.equal((await r.json()).rows[0].record.finalScore,85);
assert.equal(calls.length,1);
assert.equal(calls[0].url,'http://127.0.0.1:8790/v1/qa/evaluations?month=2026-11');
assert.equal(calls[0].request.method,'GET');
response={ok:true,source:'unverified-archive',dataStatus:'archived',rows:[]};
await rejected(await call(undefined,{headers:auth}),502);
response={ok:true,source:'local-postgres-standby',dataStatus:'verified-snapshot',rows:[]};
const payload={
  operationId:'op-01',evaluationId:'case-1',action:'update',
  expectedVersion:1,record:{id:'case-1',finalScore:83},
};
const headers={...auth,'content-type':'application/json','idempotency-key':'op-01'};
await rejected(await call(undefined,{method:'POST',headers:{...auth,'content-type':'application/json'},body:JSON.stringify(payload)}),400);
await rejected(await call(undefined,{method:'POST',headers:{...headers,'idempotency-key':'op-02'},body:JSON.stringify(payload)}),400);
await rejected(await call(undefined,{method:'POST',headers,body:'malformed JSON'}),400);
await rejected(await call(undefined,{method:'POST',headers,body:'x'.repeat(2*1024*1024+5)}),413);
await rejected(await call('/v1/qa/evaluations/case-1',{method:'POST',headers,body:JSON.stringify(payload)}),405);
assert.equal(calls.length,2);
response={ok:true,operationId:'op-01',version:2,queued:true,replay:false};
r=await call(undefined,{method:'POST',headers,body:JSON.stringify(payload)});
assert.equal(r.status,200);
assert.equal((await r.json()).queued,true);
assert.equal(calls.length,3);
assert.equal(new TextDecoder().decode(calls[2].request.body),JSON.stringify(payload));
assert.equal(calls[2].request.headers['idempotency-key'],'op-01');
response={ok:true,operationId:'op-01',queued:true};
await rejected(await call(undefined,{method:'POST',headers,body:JSON.stringify(payload)}),502);
status=403;
response={ok:false,error:'PRIVATE_DB_CONNECTION_STRING_MUST_NOT_LEAK'};
r=await call(undefined,{headers:auth});
assert.equal(r.status,403);
assert.ok(!(await r.text()).includes('PRIVATE_DB_CONNECTION_STRING_MUST_NOT_LEAK'));
status=200;
response={ok:true,source:'local-postgres-standby',dataStatus:'verified-snapshot',rows:[]};
await rejected(await call(undefined,{headers:auth},{...env,QA_PRIVATE_DATA_VPC:null}),503);
console.log('PASS QA VPC data: disabled by default, private-only session + token, safe GET/POST, idempotency, body caps, no CORS, error redaction');
