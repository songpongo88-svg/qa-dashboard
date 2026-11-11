import assert from 'node:assert/strict';
import pg from 'pg';
import {runQaLiveSnapshotStage} from './Run-QA-Authoritative-Snapshot-Stage.mjs';
if(process.env.QA_PG_ISOLATED_TEST!=='1'||!process.env.QA_TEST_DATABASE_URL)
  throw new Error('Run only against disposable PostgreSQL 17 fixture');
const fakeEnv={
  QA_LIVE_SNAPSHOT_STAGE_ONLY:'1',
  QA_LOCAL_DATABASE_URL:process.env.QA_TEST_DATABASE_URL,
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
assert.equal(count,0);
const url=new URL(process.env.QA_TEST_DATABASE_URL);
assert.equal(url.pathname,'/qa_cutover_ci_test');
// The Windows runner is intentionally restricted to actual qa_dashboard_lab.
// Integration with disposable fixtures is covered by the separate
// test-qa-live-mirror-stage-integration.mjs.
console.log('PASS QA source runner: explicit opt-in, local-only target and OAuth guards block all unsafe operations before any network/SQL');
