import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import worker from '../cloudflare/qa-standby-vpc-worker.mjs';

const token='QA-standby-'+('x'.repeat(52));
const tokenHash=createHash('sha256').update(token).digest('hex');
let upstreamCalls=0;
let responseBody={
  ok:true,readOnly:true,databaseConnected:true,failoverReady:false,
  standbyMode:'disabled',collectionCount:11,sourceDocumentCount:2081,
  importedArchiveCountMatch:true,pendingOperations:0,
  privateAgentName:'Never Return',secretCaseScore:100,
};
const env={
  QA_EDGE_BEARER_SHA256:tokenHash,
  QA_PRIVATE_HTTP_VPC:{
    async fetch(url,options){
      upstreamCalls++;
      assert.ok(['http://127.0.0.1:8788/ready','http://127.0.0.1:8788/summary'].includes(url),'wrong origin/path');
      assert.equal(options.method,'GET');
      assert.equal(options.headers.authorization,'Bearer '+token);
      assert.equal(options.redirect,'manual');
      return new Response(JSON.stringify(responseBody),{
        status:200,headers:{'content-type':'application/json'}
      });
    },
  },
};
const call=(path='/ready',headers={},method='GET',binding=env)=>
  worker.fetch(new Request('https://example.workers.dev'+path,{method,headers}),binding);
const forbid=async(response,status)=>{
  assert.equal(response.status,status);
  assert.equal(response.headers.get('access-control-allow-origin'),null);
  assert.equal(response.headers.get('cache-control'),'no-store, max-age=0');
};
await forbid(await call('/ready'),403);
assert.equal(upstreamCalls,0);
await forbid(await call('/ready',{authorization:'Bearer '+('z'.repeat(65))}),403);
assert.equal(upstreamCalls,0);
await forbid(await call('/ready',{authorization:'Bearer '+token},'POST'),405);
await forbid(await call('/ready?x=1',{authorization:'Bearer '+token}),404);
await forbid(await call('/records',{authorization:'Bearer '+token}),404);
assert.equal(upstreamCalls,0);
await forbid(await call('/ready',{authorization:'Bearer '+token},'GET',{...env,QA_EDGE_BEARER_SHA256:''}),503);
assert.equal(upstreamCalls,0);
await forbid(await call('/ready',{authorization:'Bearer '+token},'GET',{...env,QA_PRIVATE_HTTP_VPC:null}),503);
assert.equal(upstreamCalls,0);
const r=await call('/ready',{authorization:'Bearer '+token});
assert.equal(r.status,200);
assert.deepEqual(await r.json(),{
  ok:true,readOnly:true,databaseConnected:true,failoverReady:false,standbyMode:'disabled',
});
assert.equal(upstreamCalls,1);
const s=await call('/summary',{authorization:'Bearer '+token});
assert.equal(s.status,200);
assert.deepEqual(await s.json(),{
  ok:true,readOnly:true,failoverReady:false,sourceFreshness:'unverified-archived-copy',
  collectionCount:11,sourceDocumentCount:2081,importedArchiveCountMatch:true,
  pendingOperations:0,standbyMode:'disabled',
});
assert.equal(upstreamCalls,2);
responseBody={...responseBody,importedArchiveCountMatch:false};
await forbid(await call('/summary',{authorization:'Bearer '+token}),502);
responseBody={...responseBody,importedArchiveCountMatch:true,failoverReady:true};
await forbid(await call('/ready',{authorization:'Bearer '+token}),502);
responseBody={...responseBody,failoverReady:false,privateUser:'user-secret'};
const unsafeKeys=JSON.stringify(await (await call('/summary',{authorization:'Bearer '+token})).json());
assert.equal(unsafeKeys.includes('user-secret'),false);
assert.equal(unsafeKeys.includes('privateAgentName'),false);
responseBody={...responseBody,sourceDocumentCount:-1};
await forbid(await call('/summary',{authorization:'Bearer '+token}),502);
// The new 8790 route requires the separate VPC binding and never enables data.
const dataStatus='/qa-bridge-8790-status';
await forbid(await call(dataStatus),403);
await forbid(await call(dataStatus,{authorization:'Bearer '+token},'POST'),405);
await forbid(await call(dataStatus+'?debug=1',{authorization:'Bearer '+token}),404);
await forbid(await call(dataStatus,{authorization:'Bearer '+token}),503);
const dataCalls=[];
const secondary={
  async fetch(url,options){
    dataCalls.push(url);
    assert.equal(url,'http://127.0.0.1:8790/ready');
    assert.equal(options.method,'GET');
    assert.equal(options.headers.authorization,'Bearer '+token);
    return new Response(JSON.stringify({
      ok:true,readOnly:true,databaseConnected:true,failoverReady:false,
      privateCaseData:'never-leak',
    }),{status:200,headers:{'content-type':'application/json'}});
  },
};
let vpc=await call(dataStatus,{authorization:'Bearer '+token},'GET',
  {...env,QA_PRIVATE_DATA_VPC:secondary});
assert.equal(vpc.status,200);
const vpcBody=await vpc.json();
assert.equal(vpcBody.privateBridgeConnected,true);
assert.equal(vpcBody.readOnly,true);
assert.equal(vpcBody.failoverReady,false);
assert.equal(vpcBody.port,8790);
assert.equal(JSON.stringify(vpcBody).includes('never-leak'),false);
assert.deepEqual(dataCalls,['http://127.0.0.1:8790/ready']);
assert.equal(upstreamCalls,6); // Only archive probes have used the old binding.
await forbid(await call(dataStatus,{authorization:'Bearer '+token},'GET',{
  ...env,QA_PRIVATE_DATA_VPC:{
    async fetch(){return new Response(JSON.stringify({
      ok:true,readOnly:true,databaseConnected:true,failoverReady:true,
    }),{status:200,headers:{'content-type':'application/json'}});}
  },
}),502);

// The 8790 Snapshot status is a distinct, strictly read-only and redacted
// probe. It never reuses the QA DATA authorizer or exposes any source record.
const snapshotPath='/qa-bridge-8790-readiness';
await forbid(await call(snapshotPath),403);
await forbid(await call(snapshotPath,{authorization:'Bearer '+token},'POST'),405);
await forbid(await call(snapshotPath+'?case=private',{authorization:'Bearer '+token}),404);
await forbid(await call(snapshotPath,{authorization:'Bearer '+token}),503);
let snapshotOk=true, privateSnapshotCalls=0;
const snapshotBinding={
  ...env,
  QA_PRIVATE_DATA_VPC:{
    async fetch(url,options){
      privateSnapshotCalls++;
      assert.equal(url,'http://127.0.0.1:8790/readiness');
      assert.equal(options.method,'GET');
      assert.equal(options.headers.authorization,'Bearer '+token);
      assert.equal(options.redirect,'manual');
      return new Response(JSON.stringify({
        ok:true,readOnly:true,firestorePrimary:true,
        archiveIsNotLiveSource:true,
        failoverReady:snapshotOk,canAcceptWrites:false,standbyMode:'disabled',
        snapshot:{present:true,copied:true,candidateVerified:true,
          sourceDocuments:2226,sourceEvaluations:582,candidateEvaluations:582,
          datasetCount:11,withinFreshnessWindow:false,
          privateCaseScore:100},
        remainingChecks:['source_snapshot_not_fresh','independent_live_parity_not_certified',
          'local_login_and_roles_not_certified','qa_write_and_failback_not_certified'],
        privateAgent:'DO_NOT_EXPOSE',
      }),{status:200,headers:{'content-type':'application/json'}});
    },
  },
};
const response=await call(snapshotPath,{authorization:'Bearer '+token},'GET',snapshotBinding);
assert.equal(response.status,200);
const snap=await response.json();
assert.equal(snap.snapshot.sourceDocuments,2226);
assert.equal(snap.snapshot.sourceEvaluations,582);
assert.equal(snap.snapshot.datasetCount,11);
assert.equal(snap.readOnly,true);
assert.equal(snap.failoverReady,false);
assert.equal(snap.canAcceptWrites,false);
assert.equal(snap.source,'windows-8790-inactive-replica');
assert.equal(JSON.stringify(snap).includes('DO_NOT_EXPOSE'),false);
assert.equal(JSON.stringify(snap).includes('privateCaseScore'),false);
assert.equal(privateSnapshotCalls,1);
snapshotOk=true;
const badSnapshot=await call(snapshotPath,{authorization:'Bearer '+token},'GET',{
  ...snapshotBinding,QA_PRIVATE_DATA_VPC:{
    async fetch(){
      return new Response(JSON.stringify({ok:true,readOnly:true,
        firestorePrimary:true,archiveIsNotLiveSource:true,
        failoverReady:true,canAcceptWrites:false,standbyMode:'disabled',
        snapshot:{present:true,copied:true,candidateVerified:true,
          sourceDocuments:2226,sourceEvaluations:582,candidateEvaluations:582,
          datasetCount:11,withinFreshnessWindow:false},
        remainingChecks:[]}),
        {status:200,headers:{'content-type':'application/json'}});
    },
  },
});
await forbid(badSnapshot,502);

console.log('PASS QA Workers VPC: domainless private bridge, strict bearer auth, status-only, fail-closed, no CORS or sensitive data');
