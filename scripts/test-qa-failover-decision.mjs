import assert from 'node:assert/strict';
import { qaFailoverDecision, qaFailbackDecision, QA_FAILOVER_REQUIRED_DATASETS } from '../server/qaFailoverDecision.js';

const date = new Date().toISOString();
const later = new Date(Date.now()+120000).toISOString();
const full = () => ({
  serverAuthority:'qa-server-verified', production:false,
  primary:{health:'quota-exhausted',verifiedByServer:true,checkedAt:date},
  bridge:{databaseConnected:true,readOnly:false,authenticated:true,durableIngress:true,checkedAt:date},
  mirror:{sourceComplete:true,identityHashVerified:true,syncStatus:'validated',datasets:[...QA_FAILOVER_REQUIRED_DATASETS],verifiedAt:date},
  identity:{serverAuthenticated:true,role:'Quality Assurance',status:'active',verifiedAt:date,expiresAt:later},
  locks:{verifiedByServer:true,signatureLocked:false,appealHold:false,verifiedAt:date},
  lease:{owner:'qa-failover-coordinator',approved:true,generation:1,grantedAt:date,expiresAt:later},
  backlog:{unresolvedConflicts:0},
  manualDisable:false,
});
const healthy=full();
assert.equal(qaFailoverDecision(healthy).mode,'standby');
assert.equal(qaFailoverDecision(healthy).canAcceptWrites,true);
const test=(mutator, blocker) => {
  const c=full();mutator(c);
  const v=qaFailoverDecision(c);
  assert.equal(v.canAcceptWrites,false,blocker);
  assert.equal(v.mode,'primary');
  assert.ok(v.blockers.includes(blocker),JSON.stringify(v));
};
test(v=>v.serverAuthority='from-browser','server_authority_missing');
test(v=>v.primary.verifiedByServer=false,'quota_not_server_verified');
test(v=>v.primary.health='healthy','quota_not_server_verified');
test(v=>v.primary.checkedAt='2025-01-01T00:00:00Z','quota_not_server_verified');
test(v=>v.bridge.readOnly=true,'standby_write_bridge_not_ready');
test(v=>v.bridge.durableIngress=false,'standby_write_bridge_not_ready');
test(v=>v.bridge.databaseConnected=false,'standby_write_bridge_not_ready');
test(v=>v.mirror.sourceComplete=false,'mirror_not_complete');
test(v=>v.mirror.syncStatus='pending','mirror_not_complete');
test(v=>v.mirror.datasets=['qa_evaluations'],'mirror_not_complete');
test(v=>v.mirror.identityHashVerified=false,'mirror_not_complete');
test(v=>v.identity.role='Admin Live Chat','identity_not_verified');
test(v=>v.identity.serverAuthenticated=false,'identity_not_verified');
test(v=>v.identity.expiresAt='2025-01-01T00:00:00Z','identity_not_verified');
test(v=>v.locks.signatureLocked=true,'monthly_locks_not_verified');
test(v=>v.locks.appealHold=true,'monthly_locks_not_verified');
test(v=>v.locks.verifiedByServer=false,'monthly_locks_not_verified');
test(v=>v.lease.approved=false,'coordinator_lease_missing');
test(v=>v.lease.expiresAt='2025-01-01T00:00:00Z','coordinator_lease_missing');
test(v=>v.backlog.unresolvedConflicts=1,'unresolved_conflicts');
test(v=>v.manualDisable=true,'manual_kill_switch');
test(v=>{v.production=true},'production_not_approved');
const failback={
  serverAuthority:'qa-server-verified',
  primary:{health:'healthy',verifiedByServer:true},
  outbox:{pending:0,inFlight:0,conflicts:0},
  parity:{complete:true,verified:true,mismatches:0},
  lease:{frozenWrites:true},
};
assert.equal(qaFailbackDecision(failback).canFailback,true);
for (const key of ['pending','inFlight','conflicts']) {
  const v=structuredClone(failback);v.outbox[key]=1;
  assert.equal(qaFailbackDecision(v).canFailback,false,'outbox unresolved '+key);
}
{
  const v=structuredClone(failback);v.parity.mismatches=1;
  assert.equal(qaFailbackDecision(v).canFailback,false);
}
{
  const v=structuredClone(failback);v.lease.frozenWrites=false;
  assert.equal(qaFailbackDecision(v).canFailback,false);
}
console.log('PASS: QA failover is refused on quota-only/browser spoof, partial backup, stale ACL, absent lease, locked month, non-durable tunnel or pending conflicts; failback waits for full replay parity.');
