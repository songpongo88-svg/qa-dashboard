// Windows receiver must reject all untrusted flags and database URLs before
// opening a port; no credentials, network, Windows or Firestore involved.
import assert from 'node:assert/strict';
import {validateQaWindowsDeltaConfig}
 from '../server/qaWindowsDeltaReceiver.js';
const good={
 QA_LOCAL_DELTA_ENABLED:'1',QA_LOCAL_DELTA_PORT:'8791',
 QA_LOCAL_DELTA_DATABASE_URL:'postgresql://qa_delta_ingester:privatepass@127.0.0.1:5432/qa_dashboard_lab',
 QA_LOCAL_DELTA_HMAC_SECRET:'delta-private-secret-'.repeat(5),
 QA_LOCAL_BRIDGE_TOKEN:'archive-secret-'.repeat(5),
 QA_LOCAL_STANDBY_DATA_TOKEN:'case-data-secret-'.repeat(5),
 QA_LOCAL_DELTA_SOURCE_AUDIENCE:'https://qa-standby.example.workers.dev/v1/qa/source-delta',
 QA_LOCAL_DELTA_SOURCE_SA_EMAIL:'qa-source-tasks@qa-fixture.iam.gserviceaccount.com',
};
assert.equal(validateQaWindowsDeltaConfig(good).port,8791);
for(const changes of [
 {QA_LOCAL_DELTA_ENABLED:'0'},
 {QA_LOCAL_DELTA_PORT:'8790'},
 {QA_LOCAL_DELTA_PORT:'5432'},
 {QA_LOCAL_DELTA_DATABASE_URL:'postgresql://qa_delta_ingester:pass@public.example:5432/qa_dashboard_lab'},
 {QA_LOCAL_DELTA_DATABASE_URL:'postgresql://qa_delta_ingester:pass@127.0.0.1:5432/production'},
 {QA_LOCAL_DELTA_HMAC_SECRET:'short'},
 {QA_LOCAL_DELTA_HMAC_SECRET:good.QA_LOCAL_BRIDGE_TOKEN},
 {QA_LOCAL_DELTA_HMAC_SECRET:good.QA_LOCAL_STANDBY_DATA_TOKEN},
 {QA_LOCAL_DELTA_SOURCE_AUDIENCE:'http://localhost/v1/qa/source-delta'},
 {QA_LOCAL_DELTA_SOURCE_SA_EMAIL:'admin@example.com'},
 ])assert.throws(()=>validateQaWindowsDeltaConfig({...good,...changes}));
console.log('PASS Windows delta receiver configuration: disabled by default, loopback port 8791, isolated HMAC and trusted Google sender');
