import assert from 'node:assert/strict';
import {runQaLiveSnapshotStage} from './Run-QA-Authoritative-Snapshot-Stage.mjs';
const fakeEnv={
  QA_LIVE_SNAPSHOT_STAGE_ONLY:'1',
  QA_LOCAL_DATABASE_URL:'postgresql://qa_fixture:fake@127.0.0.1:5432/qa_dashboard_lab',
  QA_FIRESTORE_PROJECT_ID:'qa-fixture-2026',
  QA_FIRESTORE_OAUTH_ACCESS_TOKEN:'fixture-oauth-access-token-not-secret',
};
// Runner refuses disposable fixture and ordinary remote DBs by design.
// Test auth, url and explicit opt-in gates WITHOUT opening a connection.
let count=0;
const fakePg={Pool:class {constructor(){count++;throw Error('should_not_be_constructed')}}};
await assert.rejects(runQaLiveSnapshotStage({
  env:{...fakeEnv,QA_LIVE_SNAPSHOT_STAGE_ONLY:''},pgModule:fakePg,
}),/explicit_stage_only_opt_in_required/);
await assert.rejects(runQaLiveSnapshotStage({
  env:{...fakeEnv,QA_LOCAL_DATABASE_URL:'postgresql://user:pass@example.com:5432/qa_dashboard_lab'},
  pgModule:fakePg,
}),/only_existing_local_qa_dashboard_lab_allowed/);
await assert.rejects(runQaLiveSnapshotStage({
  env:{...fakeEnv,QA_FIRESTORE_OAUTH_ACCESS_TOKEN:''},
  pgModule:fakePg,
}),/server_firebase_oauth_not_configured/);
await assert.rejects(runQaLiveSnapshotStage({
  env:{...fakeEnv,QA_SOURCE_READ_BUDGET:'10'},pgModule:fakePg,
}),/snapshot_read_budget_invalid/);
await assert.rejects(runQaLiveSnapshotStage({
  env:{...fakeEnv,QA_SOURCE_API_REQUEST_BUDGET:'201'},pgModule:fakePg,
}),/snapshot_read_budget_invalid/);
assert.equal(count,0);
 // The Windows runner is intentionally restricted to actual qa_dashboard_lab.
// Integration with disposable fixtures is covered by the separate
// test-qa-live-mirror-stage-integration.mjs.
console.log('PASS QA source runner: explicit opt-in, local-only target and OAuth guards block all unsafe operations before any network/SQL');

// Read-only Bridge credentials must fail BEFORE the first Firestore request.
let firestoreCalls=0;
const makePool = ({role='qa_snapshot_importer',transactionRo='off',canInsert=true}={})=>({
  Pool:class {
    async query(sql) {
      if(sql==='SELECT current_database() AS db')
        return {rows:[{db:'qa_dashboard_lab'}]};
      if(sql.includes('current_user AS role'))
        return {rows:[{role,recovering:false,transaction_ro:transactionRo,
          batches:true,rows:true,candidates:true,audit:true}]};
      if(sql.includes("has_table_privilege(current_user"))
        return {rows:[{state:true,batches:canInsert,rows:canInsert,candidates:canInsert,audit:canInsert}]};
      if(sql.includes('SELECT mode,source_snapshot_verified,write_frozen FROM qa_failover_v1.state'))
        return {rows:[{mode:'disabled',source_snapshot_verified:false,write_frozen:true}]};
      throw Error('unexpected_database_mutation');
    }
    async end(){}
  }
});
for(const config of [
  {role:'qa_readonly_bridge'}, {transactionRo:'on'}, {canInsert:false}
]){
  await assert.rejects(runQaLiveSnapshotStage({
    env:fakeEnv,pgModule:makePool(config),fetchImpl:async()=>{firestoreCalls++;throw Error('no_capture_expected');},
  }),/postgres_dedicated_importer_required|postgres_import_connection_read_only|postgres_import_permission_missing/);
}
assert.equal(firestoreCalls,0,'invalid destination must never consume Firestore quota');
console.log('PASS dedicated importer, writable transaction and per-table privileges all checked before a single Firestore read');

// A denied Firestore capture cannot CREATE/ALTER any PostgreSQL schema.
const queries=[];
const validPg={Pool:class extends makePool().Pool {
  async query(sql) { queries.push(sql); return super.query(sql); }
}};
await assert.rejects(runQaLiveSnapshotStage({
  env:fakeEnv,pgModule:validPg,fetchImpl:async()=>{
    firestoreCalls++;
    return {status:403,ok:false,headers:{get:()=> 'application/json'}};
  },
}),/firestore_quota_or_permission_blocked/);
assert.equal(firestoreCalls,1);
assert.equal(queries.length,4);
assert.ok(queries.every(sql=>!/(CREATE TABLE|ALTER TABLE|INSERT INTO|UPDATE .* SET)/i.test(sql)));
console.log('PASS denied Firestore capture does not create/alter or write any local PostgreSQL table');
