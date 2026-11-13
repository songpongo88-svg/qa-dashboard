// No real Firestore/Windows, no network: private source ingress fixture tests.
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {signQaSourceDeltaDelivery,createQaSourceDeltaHttpHandler}
  from '../server/qaSourceDeltaHttpHandler.js';
const secret='QA-fixture-secret-'.repeat(6);
const stamp='1794579000'; // just a fixed synthetic header for controlled clock
const clock=Number(stamp)*1000+1000;
const example={eventId:'qa-event-ingress-000001',
  snapshotId:'qa-live-snapshot-fixture',
  documentPath:'qa_evaluations/fixture-1',
  operation:'upsert',sourceChangedAt:new Date(clock-30000).toISOString(),
  documentJson:{fields:{score:{integerValue:'85'}}}};
const raw=Buffer.from(JSON.stringify(example),'utf8');
let seen=0,lastEvent=null;
const handler=createQaSourceDeltaHttpHandler({
  secret,now:()=>clock,
  recordVerifiedEvent:async e=>{
    seen++;lastEvent=e;
    return {journaled:true,outcome:'applied',canAcceptWrites:false};
  },
});
async function request({payload=raw,signature,ts=stamp,method='POST',
  contentType='application/json',url='/v1/qa/source-delta',
  sizeHeader,
  handlerFn=handler}={}){
 const bytes=Buffer.isBuffer(payload)?payload:Buffer.from(payload);
 const headers={'content-type':contentType,'x-qa-source-timestamp':ts,
   'x-qa-source-signature':signature??signQaSourceDeltaDelivery({
     secret,timestamp:ts,raw:bytes})};
 if(sizeHeader!==undefined)headers['content-length']=sizeHeader;
 const req=Readable.from([bytes]);req.method=method;req.url=url;req.headers=headers;
 let result={status:0,headers:{},body:null};
 const res={setHeader(k,v){result.headers[k]=v;},
   writeHead(status,head){result.status=status;result.headers={...result.headers,...head};},
   end(txt){result.body=JSON.parse(txt);}};
 await handlerFn(req,res);
 return result;
}
const ok=await request();
assert.equal(ok.status,202);
assert.equal(ok.body.stored,true);
assert.equal(ok.body.failoverReady,false);
assert.equal(lastEvent.collection,'qa_evaluations');
assert.equal(lastEvent.documentJson.fields.score.integerValue,'85');
assert.equal(seen,1);
assert.equal(ok.headers['Access-Control-Allow-Origin'],undefined);
assert.equal((await request({signature:'v1'+'0'.repeat(64)})).status,403);
assert.equal((await request({signature:'v1='+'0'.repeat(64)})).status,403);
assert.equal((await request({ts:String(Number(stamp)-400)})).status,403);
assert.equal((await request({url:'/v1/qa/evaluations'})).status,404);
assert.equal((await request({method:'GET'})).status,405);
assert.equal((await request({contentType:'text/plain'})).status,415);
assert.equal((await request({sizeHeader:'900000'})).status,413);
assert.equal((await request({payload:Buffer.alloc(512*1024+1,1),
  signature:'v1='+'0'.repeat(64)})).status,413);
assert.equal((await request({payload:'broken json'})).status,400);
assert.equal((await request({payload:JSON.stringify({
  ...example,documentPath:'qa_sparks/other'})})).status,422);
assert.equal(seen,1,'untrusted or invalid data must not reach any db adapter');
const conflictHandler=createQaSourceDeltaHttpHandler({secret,now:()=>clock,
 recordVerifiedEvent:async()=>({journaled:true,outcome:'conflict',canAcceptWrites:false})});
const conflictResponse=await request({handlerFn:conflictHandler});
assert.equal(conflictResponse.status,503);
assert.equal(conflictResponse.body.error,'source_delta_conflict_requires_reconciliation');
const down=createQaSourceDeltaHttpHandler({secret,now:()=>clock,
  recordVerifiedEvent:async()=>{throw Error('test-secret-never-show-in-response');}});
const denied=await request({handlerFn:down});
assert.equal(denied.status,503);
assert.equal(JSON.stringify(denied).includes('test-secret'),false);
assert.throws(()=>createQaSourceDeltaHttpHandler({secret:'short',
  recordVerifiedEvent:async()=>({})}),/qa_delta_ingress_configuration_invalid/);
console.log('PASS QA signed private source ingress: HMAC, timestamp, content size, source path, no CORS and no live QA writes');
