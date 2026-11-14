import assert from 'node:assert/strict';
import {readQaWindowsVerifiedSourceChange} from '../server/qaWindowsSourceDocumentReader.js';
const sig={collection:'qa_evaluations',documentId:'AA000001',changeType:'modified',
 observedRevision:'2026-11-14T07:00:00.123456Z',
 authoritativeDocument:false,sourceCommitVerified:false,requiresSourceRead:true};
const env={QA_WINDOWS_SOURCE_READ_ENABLED:'1',QA_FAILOVER:'OFF'};
const oauthToken='a'.repeat(40);
let reserveCount=0,requests=0;
const reserveRead=async req=>{reserveCount++;return{
 reserved:true,projectId:req.projectId,units:req.units}};
const payload={
 name:'projects/qa-dashboard-b0b5d/databases/(default)/documents/qa_evaluations/AA000001',
 fields:{final_score:{integerValue:'85'}},
 createTime:'2026-11-14T07:00:00Z',
 updateTime:'2026-11-14T07:00:00.123456Z',
};
const ok=async()=>{requests++;return{status:200,
 headers:{get:()=> 'application/json'},json:async()=>payload}};
const opts={signal:sig,env,oauthToken,reserveRead,fetchImpl:ok};
await assert.rejects(readQaWindowsVerifiedSourceChange({...opts,
 env:{...env,QA_WINDOWS_SOURCE_READ_ENABLED:'0'}}),
 /qa_source_read_disabled/);
assert.equal(reserveCount,0);
await assert.rejects(readQaWindowsVerifiedSourceChange({...opts,
 signal:{...sig,collection:'qa_sparks'}}),/qa_source_read_invalid_private_signal/);
assert.equal(reserveCount,0);
const doc=await readQaWindowsVerifiedSourceChange(opts);
assert.equal(doc.verifiedDocument,true);
assert.equal(doc.sourceContinuityCertified,false);
assert.equal(doc.canDeliver,false);
assert.match(doc.hash,/^[0-9a-f]{64}$/);
assert.equal(doc.documentJson.fields.final_score.integerValue,'85');
assert.equal(requests,1);
assert.equal(reserveCount,1);
const revised=await readQaWindowsVerifiedSourceChange({...opts,fetchImpl:async()=>{
 requests++;return{status:200,headers:{get:()=> 'application/json'},
 json:async()=>({...payload,updateTime:'2026-11-14T07:00:01.123456Z'})}}});
assert.equal(revised.requiresReconciliation,true);
assert.equal(revised.canDeliver,false);
const absent=await readQaWindowsVerifiedSourceChange({...opts,
 signal:{...sig,changeType:'removed',observedRevision:null},
 fetchImpl:async()=>{requests++;return{status:404}}});
assert.equal(absent.requiresReconciliation,true);
assert.equal(absent.verifiedDocument,false);
await assert.rejects(readQaWindowsVerifiedSourceChange({...opts,
 fetchImpl:async()=>({status:403})}),/qa_source_read_quota_or_auth_blocked/);
await assert.rejects(readQaWindowsVerifiedSourceChange({...opts,
 fetchImpl:async()=>({status:200,headers:{get:()=> 'application/json'},
 json:async()=>({...payload,name:payload.name+'-tampered'})})}),
 /qa_source_read_wrong_document/);
await assert.rejects(readQaWindowsVerifiedSourceChange({...opts,
 reserveRead:async()=>({reserved:false}),fetchImpl:async()=>{throw Error('should not reach network')}}),
 /qa_source_read_budget_not_reserved/);
console.log('PASS QA source document reader: one budgeted REST read, correct typed fields, deletion/revision race quarantine');
