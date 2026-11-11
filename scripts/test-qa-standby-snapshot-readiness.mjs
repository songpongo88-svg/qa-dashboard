import assert from 'node:assert/strict';
import {qaStandbySnapshotReadiness} from '../server/qaStandbySnapshotReadiness.js';
const now=Date.parse('2026-11-11T10:00:00.000Z');
const names=['qa_evaluations','qa_appeal_events','qa_signature_documents',
'qa_user_profiles','qa_role_permissions','qa_user_sessions'];
const complete=names.map((dataset,i)=>({dataset,count:i===0?563:1,digest:'a'.repeat(64)}));
const total=568;
const state={mode:'disabled',source_snapshot_verified:false,write_frozen:true};
const batch={snapshot_id:'qa-live-fixture-0001',source_exported_at:new Date(now-10000).toISOString(),
  status:'copy_verified',source_documents:total,stored_documents:total,
  dataset_manifest:complete,approved_for_failover:false};
let candidate={evaluation_count:563,eligible_for_failover:false};
let queue=[],found=true,queries=[];
function pool(){
 return{async connect(){
  return{async query(q){
   queries.push(q);
   if(q.startsWith('BEGIN')||q==='COMMIT'||q==='ROLLBACK')return{rows:[]};
   if(q.includes('current_database()'))return{rows:[{db:'qa_dashboard_lab'}]};
   if(q.includes('qa_failover_v1.state'))return{rows:[state]};
   if(q.includes('qa_failover_v1.live_snapshot_batches'))return{rows:found?[batch]:[]};
   if(q.includes('qa_failover_v1.outbox'))return{rows:queue};
   if(q.includes('qa_failover_v1.live_candidate_audit'))return{rows:candidate?[candidate]:[]};
   if(q.includes('qa_failover_v1.live_snapshot_rows'))return{rows:[{n:total}]};
   throw Error('Unexpected SQL '+q);
  },release(){}};
 }};
}
let r=await qaStandbySnapshotReadiness(pool(),{now});
assert.equal(r.ok,true);
assert.equal(r.snapshot.present,true);
assert.equal(r.snapshot.copied,true);
assert.equal(r.snapshot.candidateVerified,true);
assert.equal(r.snapshot.sourceDocuments,568);
assert.equal(r.failoverReady,false);
assert.equal(r.canAcceptWrites,false);
assert.deepEqual(r.remainingChecks,[
  'independent_live_parity_not_certified',
  'local_login_and_roles_not_certified',
  'qa_write_and_failback_not_certified',
]);
assert.equal(queries.some(x=>/^\s*(INSERT|UPDATE|DELETE|ALTER|DROP)/i.test(x)),false);
assert.equal(JSON.stringify(r).includes('qa-live-fixture'),false,'snapshot IDs are not exposed');
batch.source_exported_at=new Date(now-600000).toISOString();
r=await qaStandbySnapshotReadiness(pool(),{now});
assert.equal(r.snapshot.withinFreshnessWindow,false);
assert.ok(r.remainingChecks.includes('source_snapshot_not_fresh'));
batch.source_exported_at=new Date(now-10000).toISOString();
candidate=null;
r=await qaStandbySnapshotReadiness(pool(),{now});
assert.ok(r.remainingChecks.includes('evaluation_candidate_unverified'));
candidate={evaluation_count:563,eligible_for_failover:false};
queue=[{status:'pending',n:2},{status:'conflict',n:1}];
r=await qaStandbySnapshotReadiness(pool(),{now});
assert.deepEqual(r.outbox,{pending:2,in_flight:0,conflict:1});
assert.ok(r.remainingChecks.includes('outbox_not_empty'));
queue=[];
found=false;
r=await qaStandbySnapshotReadiness(pool(),{now});
assert.equal(r.snapshot.present,false);
assert.equal(r.snapshot.candidateVerified,false);
assert.equal(r.failoverReady,false);
assert.ok(r.remainingChecks.includes('live_snapshot_missing'));
console.log('PASS: QA read-only readiness never certifies live failover, reports missing/stale manifests and outbox, no case contents or SQL writes');
