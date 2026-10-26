import { doc, runTransaction, serverTimestamp, type Firestore, type Transaction } from 'firebase/firestore';
import { firebaseDb } from './firebaseClient';
import { prepareMonthlyResultReferences, readMonthlyResultReferences, touchMonthlyResults } from './monthlyResultLockStore';
import { EVALUATION_ACTIVITY_COLLECTION, evaluationEditDocId, evaluationCaseBlocked, evaluationScopeHold, type EvaluationCaseScope } from './evaluationActivity';
import { fetchEvaluationActivity } from './evaluationActivityStore';
export class EvaluationInProgressError extends Error {
  constructor(message = 'Editing in Progress. Reopen this case after QA saves the updated evaluation.') { super(message); this.name = 'EvaluationInProgressError'; }
}
export const evaluationEditReference = (id: string, db: Firestore = firebaseDb) => doc(db, EVALUATION_ACTIVITY_COLLECTION, evaluationEditDocId(id));
export async function beginEvaluationEdit(input: { evaluationId: string; caseId: string; username: string; displayName: string; monthKey: string;
  evaluatorUsername: string; evaluatorName: string; isTestCase?: boolean; editToken?: string }): Promise<string> {
  if (!input.evaluationId || !input.username || !input.monthKey || !input.evaluatorUsername) throw new EvaluationInProgressError('Evaluation edit could not be started. Refresh and reopen the case.');
  const references = await prepareMonthlyResultReferences([{ agentName: input.displayName, monthKey: input.monthKey }]);
  const token = input.editToken || crypto.randomUUID();
  return runTransaction(firebaseDb, async transaction => {
    const reference = evaluationEditReference(input.evaluationId), existing = await transaction.get(reference);
    const row = existing.exists() ? existing.data() : null;
    if (row && String(row.editorUsername).toLowerCase() !== input.evaluatorUsername.toLowerCase()) throw new EvaluationInProgressError('Editing in Progress. Another QA is updating this case.');
    if (input.editToken && (!row || row.editToken !== input.editToken)) throw new EvaluationInProgressError('Edit Session Ended. Reopen the latest saved case before editing.');
    await readMonthlyResultReferences(transaction, references);
    if (row) return String(row.editToken);
    transaction.set(reference, { workflowEdit: true, mode: 'edit', evaluationId: input.evaluationId, caseId: input.caseId,
      username: input.username, displayName: input.displayName, monthKey: input.monthKey,
      editorUsername: input.evaluatorUsername, evaluatorName: input.evaluatorName, editToken: token,
      isTestCase: Boolean(input.isTestCase), startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedAtServer: serverTimestamp() });
    touchMonthlyResults(transaction, references);
    return token;
  });
}
export async function readEvaluationEditForSave(transaction: Transaction, db: Firestore, evaluationId: string, token = '', evaluatorUsername = '') {
  const reference = evaluationEditReference(evaluationId, db), snapshot = await transaction.get(reference);
  const lock = snapshot.exists() ? snapshot.data() : null;
  if (token && (!lock || lock.editToken !== token)) throw new EvaluationInProgressError('Edit Session Ended. Reopen the latest saved case before submitting.');
  if (lock && (!token || lock.editToken !== token || String(lock.editorUsername).toLowerCase() !== evaluatorUsername.toLowerCase())) throw new EvaluationInProgressError();
  return lock ? reference : null;
}
export async function cancelEvaluationEdit(evaluationId: string, token: string, evaluatorUsername: string) {
  if (!token) throw new EvaluationInProgressError('Edit status is not verified. Reopen this case before cancelling.');
  await runTransaction(firebaseDb, async transaction => { const reference = await readEvaluationEditForSave(transaction, firebaseDb, evaluationId, token, evaluatorUsername); if (reference) transaction.delete(reference); });
}
export async function assertEvaluationCaseVisible(row: EvaluationCaseScope, user?: { role?: string } | null) {
  if (user?.role === 'Quality Assurance') return;
  if (evaluationCaseBlocked(row, await fetchEvaluationActivity(), user)) throw new EvaluationInProgressError();
}
export async function assertEvaluationCasesVisible(rows: readonly EvaluationCaseScope[], user?: { role?: string } | null) {
  if (user?.role === 'Quality Assurance') return;
  const latest = await fetchEvaluationActivity();
  if (rows.some(row => evaluationCaseBlocked(row, latest, user))) throw new EvaluationInProgressError();
}
export async function assertEvaluationScopeComplete(agents: readonly string[], months: readonly string[]) {
  const hold = evaluationScopeHold(await fetchEvaluationActivity(), agents, months);
  if (hold) throw new EvaluationInProgressError(`${hold.label}. ${hold.message}`);
}
