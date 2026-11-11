import assert from 'node:assert/strict';
import {qaSourceStagePreflight} from './check-qa-source-stage-preflight.mjs';
const good={
 QA_LOCAL_DATABASE_URL:'postgresql://qa:secret@127.0.0.1:5432/qa_dashboard_lab',
 QA_FIRESTORE_PROJECT_ID:'robinhood-qa-example',
 QA_FIRESTORE_OAUTH_ACCESS_TOKEN:'synthetic-fixture-token-not-real',
 QA_LIVE_SNAPSHOT_STAGE_ONLY:'1',
};
const accepted=qaSourceStagePreflight(good);
assert.equal(accepted.safeToAttemptSourceCapture,true);
assert.equal(accepted.firestoreReadExecuted,false);
assert.equal(accepted.postgresWriteExecuted,false);
assert.equal(accepted.failoverEnabled,false);
for(const key of Object.keys(good)){
 const candidate={...good}; delete candidate[key];
 const result=qaSourceStagePreflight(candidate);
 assert.equal(result.safeToAttemptSourceCapture,false,key);
 assert.ok(result.blockers.length>0,key);
 assert.equal(JSON.stringify(result).includes('synthetic-fixture-token'),false);
}
assert.equal(qaSourceStagePreflight({...good,QA_LOCAL_DATABASE_URL:'postgresql://qa:secret@db.example/qa_dashboard_lab'}).safeToAttemptSourceCapture,false);
assert.equal(qaSourceStagePreflight({...good,QA_LIVE_SNAPSHOT_STAGE_ONLY:'true'}).safeToAttemptSourceCapture,false);
console.log('QA_SOURCE_STAGE_PREFLIGHT_TEST=PASS');
