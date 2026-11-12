import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createQaStandbyDataHandler} from '../server/qaStandbyDataHandler.js';

const token='qa-standby-token-'+('x'.repeat(48));
const sessionId='qa_editor-8c11937f-01ab-4455-b6f2-620fb73e3e44';
const readPool={query:()=>{throw Error('unexpected SQL query');}};
const writePool={query:()=>{throw Error('unexpected writer SQL');}};
let sessionReads=0,contextBuilds=0,reading=0,writing=0,actorRole='Quality Assurance',badContext=false;
const options={
  readPool,writePool,token,dataEnabled:true,writesEnabled:true,
  verifySession:async(_pool,input)=>{
    sessionReads++;
    assert.equal(input.sessionId,sessionId);
    return {source:'verified-local-session',username:'qa_editor',role:actorRole,status:'active'};
  },
  makeTrustedContext:async info=>{
    contextBuilds++;
    assert.equal(info.actor.username,'qa_editor');
    if(info.action==='update'){
      assert.equal(info.evaluationId,'qa-001');
      assert.equal(info.candidate.record.finalScore,83);
    }
    if(info.action==='delete'){
      assert.equal(info.evaluationId,'qa-001');
      assert.equal(info.candidate.record,undefined);
    }
    return {contextSource:badContext?'browser':'server-owned-not-request-body',serverAuthority:'qa-server-verified'};
  },
  listEvaluations:async(_pool,request,trust)=>{
    reading++;assert.equal(trust.serverAuthority,'qa-server-verified');
    return {source:'local-postgres-standby',rows:[{evaluationId:'qa-001',record:{finalScore:82}}],month:request.month||null};
  },
  readEvaluation:async(_pool,id,trust)=>{
    reading++;assert.equal(trust.serverAuthority,'qa-server-verified');
    assert.equal(id,'qa-001');
    return {source:'local-postgres-standby',evaluationId:id,record:{finalScore:82}};
  },
  writeEvaluation:async(_pool,payload,trust)=>{
    writing++;assert.equal(trust.serverAuthority,'qa-server-verified');
    assert.equal(payload.evaluationId,'qa-001');
    return {queued:true,evaluationId:payload.evaluationId};
  },
};
const server=createServer((req,res)=>{void createQaStandbyDataHandler(options)(req,res);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const req=(path,init={})=>fetch(base+path,init);
const authorized={
  authorization:'Bearer '+token,
  'x-qa-user-session':sessionId,
};
try{
  let response=await req('/v1/qa/evaluations');
  assert.equal(response.status,403);
  assert.equal(sessionReads,0);
  assert.equal(response.headers.get('access-control-allow-origin'),null);
  response=await req('/v1/qa/evaluations',{headers:{...authorized,authorization:'Bearer wrong'}});
  assert.equal(response.status,403);
  assert.equal(sessionReads,0);
  response=await req('/v1/qa/evaluations',{headers:{...authorized,origin:'https://evil.example'}});
  assert.equal(response.status,403);
  assert.equal(sessionReads,0);
  response=await req('/not-a-qa-route',{headers:authorized});
  assert.equal(response.status,404);
  assert.equal(sessionReads,0);
  response=await req('/v1/qa/evaluations?month=2026-11',{headers:authorized});
  assert.equal(response.status,200);
  const list=await response.json();
  assert.equal(list.rows.length,1);
  assert.equal(list.rows[0].record.finalScore,82);
  assert.equal(list.month,'2026-11');
  assert.equal(response.headers.get('cache-control'),'no-store, max-age=0');
  response=await req('/v1/qa/evaluations/qa-001',{headers:authorized});
  assert.equal(response.status,200);
  assert.equal((await response.json()).evaluationId,'qa-001');
  const record={
    operationId:'qa-op-1',evaluationId:'qa-001',action:'update',
    expectedVersion:1,record:{id:'qa-001',finalScore:83},
  };
  response=await req('/v1/qa/evaluations',{method:'POST',headers:{
    ...authorized,'content-type':'application/json','idempotency-key':'qa-op-1',
  },body:JSON.stringify(record)});
  assert.equal(response.status,200);
  assert.equal((await response.json()).queued,true);
  assert.equal(writing,1);
  response=await req('/v1/qa/evaluations',{method:'POST',headers:{
    ...authorized,'content-type':'application/json',
  },body:JSON.stringify(record)});
  assert.equal(response.status,400);
  assert.equal(writing,1);
  response=await req('/v1/qa/evaluations',{method:'POST',headers:{
    ...authorized,'content-type':'application/json','idempotency-key':'bad',
  },body:JSON.stringify(record)});
  assert.equal(response.status,400);
  assert.equal(writing,1);
  response=await req('/v1/qa/evaluations',{method:'POST',headers:{
    ...authorized,'content-type':'application/json','idempotency-key':'qa-op-1',
  },body:'not json'});
  assert.equal(response.status,400);
  assert.equal(writing,1);
  const deletion={operationId:'qa-delete-2',evaluationId:'qa-001',action:'delete',expectedVersion:2};
  response=await req('/v1/qa/evaluations',{method:'POST',headers:{
    ...authorized,'content-type':'application/json','idempotency-key':'qa-delete-2',
  },body:JSON.stringify(deletion)});
  assert.equal(response.status,200);
  assert.equal((await response.json()).queued,true);
  assert.equal(writing,2);
  actorRole='Senior';
  response=await req('/v1/qa/evaluations',{headers:authorized});
  assert.equal(response.status,403);
  actorRole='Quality Assurance';
  badContext=true;
  response=await req('/v1/qa/evaluations',{headers:authorized});
  assert.equal(response.status,503);
  badContext=false;
  assert.ok(sessionReads>=5);
  assert.equal(reading,2);
  assert.equal(writing,2);
}finally{await new Promise(resolve=>server.close(resolve));}
const off=createQaStandbyDataHandler({...options,dataEnabled:false});
const downServer=createServer((req,res)=>{void off(req,res);});
await new Promise(resolve=>downServer.listen(0,'127.0.0.1',resolve));
try{
  const r=await fetch('http://127.0.0.1:'+downServer.address().port+'/v1/qa/evaluations',{headers:authorized});
  assert.equal(r.status,503);
  assert.equal((await r.json()).error,'standby_data_not_enabled');
}finally{await new Promise(resolve=>downServer.close(resolve));}
assert.throws(()=>createQaStandbyDataHandler({readPool,token:'short'}),/standby_data_handler_not_configured/);
console.log('PASS QA standby HTTP: authenticated QA session, local scope, idempotency, origin/method guard, safe default off and private reads/writes');
