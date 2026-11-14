// QA core no-Google-billing path: repository-only direct Firestore writer inventory.
// Does not open Firestore, PostgreSQL, Cloudflare, or any user account.
// This is a BLOCKER report, not proof that all write paths have been found.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const writers=Object.freeze({
 qa_evaluations:['src/evaluationStore.ts'],
 qa_appeal_events:['src/appealStore.ts'],
 qa_signature_documents:['src/signatureStore.ts'],
 qa_user_profiles:['src/userRoleStore.ts'],
 qa_role_permissions:['src/userRoleStore.ts'],
 qa_user_sessions:['src/sessionStore.ts'],
 qa_user_session_controls:['src/sessionStore.ts'],
 qa_role_definitions:['src/userRoleStore.ts'],
 qa_system_settings:['src/userRoleStore.ts'],
 qa_signature_library:['src/signatureStore.ts'],
 qa_evaluation_progress:['src/qaEvaluationProgressStore.ts','src/evaluationStore.ts'],
});
const mutation=/(?:(?:await\s+)?(?:setDoc|updateDoc|addDoc|deleteDoc|runTransaction)\s*\(|transaction\.(?:set|update|delete)\s*\()/g;
const records=[];
for(const [collection,paths] of Object.entries(writers)){
 const files=[];
 for(const file of paths){
  const source=await readFile(new URL(file,root),'utf8');
  const matches=[...source.matchAll(mutation)].length;
  assert.ok(source.includes('firebase/firestore')||source.includes('FirestoreApi')||
    source.includes('qa_evaluation_progress'),
    'Expected Firestore module is missing from '+file);
  files.push({path:file,candidateMutations:matches});
 }
 records.push({collection,files});
}
assert.equal(records.length,11);
assert.ok(records.every(row=>row.files.some(file=>file.candidateMutations>0)),
 'Direct-writer inventory changed: re-audit all 11 datasets');
const report={
 status:'BLOCKED',firebaseBillingRequired:false,
 guarantee:'NOT_PROVEN',
 reason:'client_side_firestore_writes_and_no_durable_non_google_outbox',
 collectionCount:records.length,records,
 assertions:{
  eventarcProducerDeployed:false,
  trustedDurableWriteGateway:false,
  allWritesServerAuthorized:false,
  deleteAndLockParityCertified:false,
  full11DatasetParityCertified:false,
  windowsFailureRecoveryCertified:false,
 },
 failoverEnabled:false,
};
if(process.argv.includes('--json'))console.log(JSON.stringify(report,null,2));
else{
 console.log('QA_NO_BILLING_SOURCE_WRITERS='+records.length);
 console.log('QA_NO_BILLING_MIRROR_STATUS=BLOCKED');
 console.log('QA_NO_BILLING_GUARANTEE=NOT_PROVEN');
 console.log('QA_FAILOVER=OFF');
}
