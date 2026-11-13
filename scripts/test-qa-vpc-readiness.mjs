import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import worker from '../cloudflare/qa-standby-vpc-worker.mjs';

const secret='qa-bridge-'+('a'.repeat(48));
const hash=createHash('sha256').update(secret).digest('hex');
let calls=0;
const healthy={
  ok:true,readOnly:true,failoverReady:false,canAcceptWrites:false,
  firestorePrimary:true,archiveIsNotLiveSource:true,
  standbyMode:'disabled',
  snapshot:{present:true,copied:true,candidateVerified:false,
    sourceDocuments:2081,sourceEvaluations:563,candidateEvaluations:0,datasetCount:6,
    withinFreshnessWindow:false},
  remainingChecks:['source_snapshot_not_fresh','independent_live_parity_not_certified'],
  secretScore:'DO_NOT_RETURN',
  originalData:{caseId:'AA000000',finalScore:100},
};
let replyData=healthy;
const env={
  QA_EDGE_BEARER_SHA256:hash,
  QA_PRIVATE_HTTP_VPC:{
    async fetch(url,init){
      calls++;
      assert.equal(url,'http://127.0.0.1:8788/readiness');
      assert.equal(init.method,'GET');
      assert.equal(init.headers.authorization,'Bearer '+secret);
      return new Response(JSON.stringify(replyData),{
        status:200,headers:{'content-type':'application/json'},
      });
    },
  },
};
const invoke=(auth='Bearer '+secret)=>
  worker.fetch(new Request('https://qa-fixture.workers.dev/readiness',{
    method:'GET',headers:{authorization:auth},
  }),env);
let res=await invoke('Bearer invalid');
assert.equal(res.status,403);
assert.equal(calls,0);
res=await invoke();
assert.equal(res.status,200);
let json=await res.json();
assert.equal(json.failoverReady,false);
assert.equal(json.canAcceptWrites,false);
assert.equal(json.snapshot.sourceDocuments,2081);
assert.equal(json.snapshot.sourceEvaluations,563);
assert.equal(json.snapshot.candidateVerified,false);
assert.deepEqual(json.remainingChecks,healthy.remainingChecks);
assert.equal(JSON.stringify(json).includes('DO_NOT_RETURN'),false);
assert.equal(JSON.stringify(json).includes('AA000000'),false);
assert.equal(res.headers.get('access-control-allow-origin'),null);
replyData={...healthy,failoverReady:true};
res=await invoke();
assert.equal(res.status,502,'private server must never claim failover ready');
replyData={...healthy,remainingChecks:['bad\nsecret']};
res=await invoke();
assert.equal(res.status,502,'unsafe reason must never be forwarded');
replyData={...healthy,archiveIsNotLiveSource:false};
res=await invoke();
assert.equal(res.status,502,'an archived or untrusted backup is not live proof');
console.log('PASS: QA Workers VPC readiness is secret-gated and returns blockers without scores or standby activation');
