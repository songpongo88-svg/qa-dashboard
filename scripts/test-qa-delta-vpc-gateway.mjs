// Isolated Worker fixture: two independent signatures, private VPC only,
// Google ID token forwarded unchanged, and no case data echoed to sender.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import worker from '../cloudflare/qa-delta-vpc-gateway.mjs';
const sourceKey='SOURCE-private-key-'.repeat(5);
const forwardKey='WINDOWS-private-key-'.repeat(5);
const jwt='Bearer '+['a'.repeat(80),'b'.repeat(80),'c'.repeat(120)].join('.');
const stamp=String(Math.floor(Date.now()/1000));
const sample=JSON.stringify({eventId:'qa-delta-event-00123456',
 snapshotId:'qa-live-snapshot-123456',documentPath:'qa_evaluations/case-a',
 operation:'upsert',sourceChangedAt:new Date(Date.now()-1000).toISOString(),
 documentJson:{fields:{finalScore:{integerValue:'85'}}}});
function sign(key,ts,raw){
 return 'v1='+createHmac('sha256',key)
 .update('qa-source-delta-v1\n'+ts+'\n')
 .update(Buffer.from(raw)).digest('hex');
}
const calls=[];
let upstreamStatus=202,upstreamContent={ok:true,stored:true,
 outcome:'applied',failoverReady:false,canAcceptWrites:false};
const binding={
 async fetch(url,init){
  calls.push({url,init});
  return new Response(JSON.stringify(upstreamContent),{
   status:upstreamStatus,headers:{'content-type':'application/json'},
  });
 },
};
const env={QA_EDGE_DELTA_ENABLED:'1',QA_EDGE_SOURCE_HMAC_SECRET:sourceKey,
 QA_EDGE_DELTA_FORWARD_SECRET:forwardKey,QA_PRIVATE_DELTA_VPC:binding};
function request(path='/v1/qa/source-delta',overrides={},data=sample,configured=env){
 const headers={'content-type':'application/json','authorization':jwt,
  'x-qa-source-timestamp':stamp,
  'x-qa-source-signature':sign(sourceKey,stamp,data),
  ...overrides.headers};
 const {headers:unusedOverrideHeaders,...initOverrides}=overrides;
 const init={method:'POST',body:data,headers,...initOverrides};
 // GET/DELETE cannot have a body by the Request constructor.
 if(init.method==='GET'||init.method==='DELETE')delete init.body;
 return worker.fetch(new Request('https://private.qa.example'+path,init),configured);
}
const disabled=await request(undefined,{},sample,{...env,QA_EDGE_DELTA_ENABLED:'0'});
assert.equal(disabled.status,503);
assert.equal(calls.length,0);
assert.equal((await request('/v1/qa/evaluations')).status,404);
assert.equal((await request(undefined,{method:'GET'})).status,405);
assert.equal((await request(undefined,{headers:{origin:'https://browser.example'}})).status,403);
assert.equal((await request(undefined,{headers:{authorization:'Bearer BAD'}})).status,403);
assert.equal((await request(undefined,{headers:{'x-qa-source-signature':'v1='+'0'.repeat(64)}})).status,403);
assert.equal((await request(undefined,{headers:{'x-qa-source-timestamp':'1000000000'}})).status,403);
// Tampered body with a signature over the original request is rejected.
assert.equal((await request(undefined,{headers:{
 'x-qa-source-signature':sign(sourceKey,stamp,sample)}},'bad-data')).status,403);
assert.equal((await request(undefined,{headers:{'content-type':'text/plain'}})).status,415);
assert.equal((await request(undefined,{headers:{'content-length':'99999999'}})).status,413);
assert.equal((await request(undefined,{},sample,{...env,QA_EDGE_DELTA_FORWARD_SECRET:sourceKey})).status,503);
assert.equal((await request(undefined,{},sample,{...env,QA_PRIVATE_DELTA_VPC:null})).status,503);
assert.equal(calls.length,0);
let response=await request();
assert.equal(response.status,202);
const ack=await response.json();
assert.equal(ack.stored,true);
assert.equal(ack.failoverReady,false);
assert.equal(ack.canAcceptWrites,false);
assert.ok(!JSON.stringify(ack).includes('case-a'));
assert.equal(calls.length,1);
assert.equal(calls[0].url,'http://127.0.0.1:8791/v1/qa/source-delta');
assert.equal(calls[0].init.headers.authorization,jwt);
assert.notEqual(calls[0].init.headers['x-qa-source-signature'],
 sign(sourceKey,stamp,sample));
const privateSignature=sign(forwardKey,calls[0].init.headers['x-qa-source-timestamp'],sample);
assert.equal(calls[0].init.headers['x-qa-source-signature'],privateSignature);
assert.equal(new TextDecoder().decode(calls[0].init.body),sample);
upstreamStatus=503;
response=await request();
assert.equal(response.status,503);
upstreamStatus=202;upstreamContent={ok:true,stored:true,
 outcome:'applied',failoverReady:true,canAcceptWrites:true};
assert.equal((await request()).status,503);
upstreamContent={ok:true,stored:true,
 outcome:'duplicate',failoverReady:false,canAcceptWrites:false};
response=await request();
assert.equal(response.status,202);
assert.equal((await response.json()).outcome,'duplicate');
assert.ok(!response.headers.get('access-control-allow-origin'));
console.log('PASS delta gateway: opt-in, two independent HMAC keys, OIDC forwarding, private-only 8791 and retryable failure');
