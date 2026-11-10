import assert from 'node:assert/strict';
import { prepareQaCutoverWrite, QaCutoverBlocked } from '../server/qaCutoverWritePolicy.js';

const nowPlus = (minutes) => new Date(Date.now() + minutes * 60_000).toISOString();
const item = {
  id: 'qa-evaluation-10001', caseId: 'AA334880', agentName: 'Sample Agent',
  evaluationType: 'case', evaluationMonthKey: '2026-11', finalScore: 85,
  topics: [], evaluatorUsername: 'qa_operator',
};
const scopeKey = 'sample agent::2026-11';
const verifiedFixture = () => ({
  verificationSource: 'trusted-server-session-validator',
  session: {verified: true, status: 'active', username: 'qa_operator',
    role: 'Quality Assurance', expiresAt: nowPlus(60)},
  environment: 'isolated-local-fixture', production: false, fixtureAuthorizedByServer: true,
  currentRecord: null, currentVersion: null,
  authoritativeScope: {agentName:'Sample Agent',monthKey:'2026-11'},
  signatureLock: {source:'trusted-server',scopeKey,verified:true,locked:false},
  appealHold: {source:'trusted-server',verified:true,active:false},
});
const request = (action='create') => ({
  action, operationId: 'op-123456-abcdef', evaluationId:item.id, expectedVersion:0, record: structuredClone(item),
});
const success = prepareQaCutoverWrite(request(),verifiedFixture());
assert.equal(success.nextVersion,1);
assert.equal(success.actorUsername,'qa_operator');
assert.equal(success.fixture,true);
assert.equal(success.value.finalScore,85);
const failures=[];
const blocked=(name,make,code)=>{
  try {const [r,c]=make();prepareQaCutoverWrite(r,c);assert.fail(`write incorrectly permitted: ${name}`);}
  catch(e){if(!(e instanceof QaCutoverBlocked) || e.code!==code)throw e;failures.push(name);}
};
blocked('no-auth',()=>[request(),{...verifiedFixture(),session:null}],'session_not_verified');
blocked('fake-client-role',()=>[request(),{...verifiedFixture(),verificationSource:'browser'}],'session_not_verified');
blocked('expired',()=>[request(),{...verifiedFixture(),session:{...verifiedFixture().session,expiresAt:nowPlus(-1)}}],'session_not_verified');
blocked('member-role',()=>[request(),{...verifiedFixture(),session:{...verifiedFixture().session,role:'Senior'}}],'session_not_verified');
blocked('production-unverified',()=>[request(),{...verifiedFixture(),environment:'production-cutover',production:true,fixtureAuthorizedByServer:false}],'cutover_not_authorized');
blocked('fixture-source-from-client',()=>[request(),{...verifiedFixture(),fixtureAuthorizedByServer:false}],'cutover_not_authorized');
blocked('unverified-monthly-lock',()=>[request(),{...verifiedFixture(),signatureLock:{...verifiedFixture().signatureLock,verified:false}}],'monthly_results_locked_or_unverified');
blocked('monthly-lock',()=>[request(),{...verifiedFixture(),signatureLock:{...verifiedFixture().signatureLock,locked:true}}],'monthly_results_locked_or_unverified');
blocked('scope-change',()=>[{...request(),record:{...item,evaluationMonthKey:'2026-10'}},verifiedFixture()],'scope_mismatch');
blocked('appeal-hold',()=>[request(),{...verifiedFixture(),appealHold:{...verifiedFixture().appealHold,active:true}}],'appeal_hold_or_unverified');
blocked('wrong-identity',()=>[{...request(),evaluationId:'other-1234'},verifiedFixture()],'identity_mismatch');
blocked('missing-case-id',()=>[{...request(),record:{...item,caseId:''}},verifiedFixture()],'missing_case_id');
blocked('evaluator-spoof',()=>[{...request(),record:{...item,evaluatorUsername:'other_admin'}},verifiedFixture()],'evaluator_identity_mismatch');
blocked('invalid-score',()=>[{...request(),record:{...item,finalScore:900}},verifiedFixture()],'invalid_score');
blocked('missing-expect-version',()=>[{...request(),expectedVersion:undefined},verifiedFixture()],'missing_expected_version');
blocked('duplicate-new-id',()=>[request(),{...verifiedFixture(),currentRecord:item,currentVersion:2}],'stale_or_missing_record');
blocked('delete-unverified-lease',()=>[{...request('delete'),expectedVersion:3},
  {...verifiedFixture(),currentRecord:item,currentVersion:3}],'edit_permission_unverified');
blocked('update-unverified-lease',()=>[{...request('update'),expectedVersion:3},
  {...verifiedFixture(),currentRecord:item,currentVersion:3}],'edit_permission_unverified');
const editTrust = {...verifiedFixture(),currentRecord:item,currentVersion:3,
  editLease:{source:'trusted-server',verified:true,valid:true,username:'qa_operator',evaluationId:item.id}};
const updated = prepareQaCutoverWrite({...request('update'),expectedVersion:3,record:{...item,finalScore:84}},editTrust);
assert.equal(updated.nextVersion,4);
assert.equal(updated.value.finalScore,84);
blocked('stale-revision',()=>[{...request('update'),expectedVersion:2},editTrust],'stale_version');
blocked('update-evaluator-spoof',()=>[{...request('update'),expectedVersion:3,record:{...item,evaluatorUsername:'someone-else'}},editTrust],'evaluator_identity_mismatch');
const deletion = { ...request('delete'),expectedVersion:3 };
const d1 = prepareQaCutoverWrite(deletion,editTrust);
const d2 = prepareQaCutoverWrite(deletion,editTrust);
assert.equal(d1.operationHash,d2.operationHash,'delete idempotency intent must be stable');
assert.ok(d1.value.deletedAt);
assert.equal(d1.value.id,item.id);
assert.deepEqual(item,{ id: 'qa-evaluation-10001', caseId:'AA334880',
  agentName:'Sample Agent', evaluationType:'case', evaluationMonthKey:'2026-11',
  finalScore:85,topics:[],evaluatorUsername:'qa_operator' },'source row must not be mutated');
const liveCtx={...verifiedFixture(),environment:'production-cutover',production:true,fixtureAuthorizedByServer:false,
  sourceParity:{verified:true,authority:'firebase-current',complete:true,checkedAt:new Date().toISOString()},
  cutoverApprovedByServer:true};
assert.equal(prepareQaCutoverWrite(request(),liveCtx).fixture,false);
blocked('stale-parity',()=>[request(),{...liveCtx,sourceParity:{...liveCtx.sourceParity,checkedAt:nowPlus(-60)}}],'cutover_not_authorized');
blocked('missing-cutover-approval',()=>[request(),{...liveCtx,cutoverApprovedByServer:false}],'cutover_not_authorized');
console.log(`PASS: QA PostgreSQL cutover write policy — ${failures.length} blocked conditions; create/update/delete protected, no source writes`);
