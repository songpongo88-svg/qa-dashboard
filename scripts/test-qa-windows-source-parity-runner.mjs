import assert from 'node:assert/strict';
import {runQaWindowsSourceParity,qaParityExitCode}
 from './Run-QA-Windows-Source-Parity.mjs';
let dbCalls=0;
const fakePool={async query(){dbCalls++;return{rows:[]}},connect(){}};
const env={QA_WINDOWS_SOURCE_PARITY:'0',
 QA_WINDOWS_SOURCE_PROBE_MANIFEST:'1',
 QA_FAILOVER:'OFF',QA_WINDOWS_PARITY_STAGE_ROOT:'/never-used'};
await assert.rejects(runQaWindowsSourceParity({poolOverride:fakePool,
 env,oauthToken:'fake-long-token-which-has-no-real-credentials'}),
 /qa_source_parity_disabled/);
assert.equal(dbCalls,0,'opt-in must fail before database or Firestore calls');
const noDb={...env,QA_WINDOWS_SOURCE_PARITY:'1'};
await assert.rejects(runQaWindowsSourceParity({
 poolOverride:fakePool,env:noDb,
 oauthToken:'fake-long-token-which-has-no-real-credentials'
}),/qa_parity_local_db_invalid/);
assert.equal(dbCalls,1);
assert.equal(qaParityExitCode({
 result:'DIFFERS_FROM_FROZEN_COPY',mismatchedDatasetCount:8,
 sourceCollections:11,failoverReady:false}),3);
assert.equal(qaParityExitCode({
 result:'MATCHED_AT_SINGLE_READ_TIME',mismatchedDatasetCount:0,
 sourceCollections:11,failoverReady:false}),0);
assert.equal(qaParityExitCode({
 result:'MATCHED_AT_SINGLE_READ_TIME',mismatchedDatasetCount:8,
 sourceCollections:11,failoverReady:false}),2);
assert.equal(qaParityExitCode({
 result:'OTHER',mismatchedDatasetCount:0,
 sourceCollections:11,failoverReady:false}),2);
console.log('PASS opt-in parity runner stays off without flag or verified local database');
