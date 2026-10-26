// Independent appeal/audio tests use an explicitly unlocked month. The actual
// transaction, revision, legacy-lock and UI behavior is covered by
// test-monthly-result-lock.mjs and test-signature-appeal-hold.mjs.
export function unlockedMonthlyResultFixture({ storage = false, sourceCases = false } = {}) {
  return { name: 'unlocked-monthly-result-fixture', setup(builder) {
    builder.onResolve({ filter: /^\.\/evaluationEditingStore$/ }, () => ({ path: 'editing', namespace: 'unlocked-month' }));
    builder.onResolve({ filter: /^\.\/useMonthlyResultLock$/ }, () => ({ path: 'hook', namespace: 'unlocked-month' }));
    if (storage) builder.onResolve({ filter: /^\.\/monthlyResultLockStore$/ }, () => ({ path: 'store', namespace: 'unlocked-month' }));
    if (sourceCases) builder.onResolve({ filter: /^\.\/evaluationStore$/ }, () => ({ path: 'cases', namespace: 'unlocked-month' }));
    builder.onLoad({ filter: /.*/, namespace: 'unlocked-month' }, args => ({ loader:'js', contents: args.path === 'editing' ? `export async function beginEvaluationEdit(){return 'fixture-token'};export async function cancelEvaluationEdit(){};export async function readEvaluationEditForSave(){return null};export async function assertEvaluationCaseVisible(){};export async function assertEvaluationCasesVisible(){};export async function assertEvaluationScopeComplete(){}`
      : args.path === 'hook'
      ? "export function useMonthlyResultLock(){return {editable:true,locked:false,message:''}}"
      : args.path === 'cases' ? "export async function fetchStoredEvaluationsForCases(){return []}"
      : `export class MonthlyResultLockedError extends Error{};export class MonthlyResultLockCheckError extends Error{};
        export const MONTHLY_RESULT_LOCK_MESSAGE='Locked',MONTHLY_RESULT_LOCK_CHECK_MESSAGE='Check failed',SIGNATURE_DOCUMENT_COLLECTION='qa_signature_documents';
        export const monthlyResultScope=value=>({agentName:value.agentName||value.target_agent||'Fixture Agent',monthKey:value.monthKey||value.details?.monthKey||'2026-09'});
        export const monthlyResultKey=scope=>scope.monthKey+'::'+scope.agentName;
        export async function prepareMonthlyResultReferences(){return []};export async function readMonthlyResultReferences(){return []};
        export function touchMonthlyResults(){};export function notifyMonthlyResultChanged(){};
        export const canonicalSignatureDocId=value=>String(value||'');export const resultLockedAt=row=>row.resultLockedAt||row.confirmedAt||'';
        export async function fetchMonthlyResultLocks(){return []};export const signatureDocumentReference=()=>({});` }));
  } };
}
