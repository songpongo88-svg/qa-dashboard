import { canonicalAgentIdentityKey } from './lib/agentIdentity';
import { WORKFLOW_STATUS } from './workflowStatusLabels';

export const EVALUATION_ACTIVITY_COLLECTION = 'qa_evaluation_progress';
export const EVALUATION_STATUS_UNAVAILABLE = 'Evaluation Status Unavailable';
export type EvaluationActivity = {
  id: string; username: string; displayName: string; evaluatorUsername: string; evaluatorName: string;
  mode: 'evaluation' | 'edit'; monthKey: string; evaluationId: string; caseId: string;
  persistent: boolean; isTestCase: boolean; editToken: string;
  completedCount: number; targetCount: number; statusText: string;
  startedAt: string; updatedAt: string; expiresAt: string;
};
export type EvaluationActivityState = { ready: boolean; error: boolean; records: readonly EvaluationActivity[]; now: number };
export type EvaluationScoreState = { evaluationHoldLabel?: string; evaluationCaseEditing?: boolean };
export type EvaluationCaseScope = { id?: string; key?: string; recordId?: string; evaluationKey?: string;
  agent?: string; agentName?: string; targetUsername?: string; targetDisplayName?: string;
  caseId?: string; monthKey?: string; evaluationMonthKey?: string; auditDate?: string; auditTimestamp?: string; isTestCase?: boolean };
export type EvaluationHold = { label: string; message: string; pendingCount: number };
export const evaluationActivityId = (value: string) => value.trim().replace(/[\\/#?\[\]]/g, '_').toLowerCase();
export const evaluationEditDocId = (id: string) => `edit::${evaluationActivityId(id)}`;
export function evaluationProgressDocId(username: string, evaluator: string, context = '') {
  return context ? `active::${evaluationActivityId(evaluator)}::${evaluationActivityId(context)}` : username.trim().replace(/\//g, '__').replace(/\s+/g, ' ').toLowerCase();
}
export function evaluationActivityMonth(row: EvaluationCaseScope) {
  for (const value of [row.monthKey, row.evaluationMonthKey, row.auditTimestamp, row.auditDate]) {
    const text = String(value || '');
    const iso = text.match(/^(\d{4}-(?:0[1-9]|1[0-2]))(?:$|[-T])/);
    if (iso) return iso[1];
    const display = text.match(/^\d{1,2}[/.\-](\d{1,2})[/.\-](\d{4})/);
    if (display) return `${Number(display[2]) >= 2400 ? Number(display[2]) - 543 : display[2]}-${display[1].padStart(2, '0')}`;
  }
  return '';
}
export function normalizeEvaluationActivity(row: any, id: string): EvaluationActivity | null {
  const username = String(row?.username || '').trim(), evaluator = String(row?.editorUsername || row?.evaluatorUsername || '').trim();
  if (!username || !evaluator) return null;
  return { id, username, evaluatorUsername: evaluator, displayName: String(row.displayName || username), evaluatorName: String(row.evaluatorName || evaluator),
    mode: row.mode === 'edit' ? 'edit' : 'evaluation', persistent: row.workflowEdit === true,
    monthKey: String(row.monthKey || ''), evaluationId: String(row.evaluationId || ''), caseId: String(row.caseId || ''),
    editToken: String(row.editToken || ''), isTestCase: row.isTestCase === true,
    completedCount: Math.max(0, Number(row.completedCount) || 0), targetCount: Math.max(1, Number(row.targetCount) || 10), statusText: String(row.statusText || ''),
    startedAt: String(row.startedAt || row.updatedAt || ''), updatedAt: String(row.updatedAt || ''), expiresAt: String(row.expiresAt || '') };
}
export const isEvaluationActivityActive = (row: EvaluationActivity, now: number) => row.persistent || Date.parse(row.expiresAt) > now;
const sameAgent = (activity: EvaluationActivity, name: string) => Boolean(name) && (activity.username.toLowerCase() === name.toLowerCase()
  || canonicalAgentIdentityKey(activity.displayName) === canonicalAgentIdentityKey(name));
export function activityMatchesCase(activity: EvaluationActivity, row: EvaluationCaseScope) {
  if (activity.mode !== 'edit') return false;
  if (activity.evaluationId && [row.id, row.key, row.recordId, row.evaluationKey].includes(activity.evaluationId)) return true;
  return Boolean(activity.caseId && row.caseId) && activity.caseId.replace(/\s/g, '').toUpperCase() === row.caseId!.replace(/\s/g, '').toUpperCase()
    && (!evaluationActivityMonth(row) || activity.monthKey === evaluationActivityMonth(row)) && (!(row.agent || row.agentName || row.targetDisplayName || row.targetUsername) || sameAgent(activity, row.agent || row.agentName || row.targetDisplayName || row.targetUsername || ''));
}
export function evaluationScopeHold(state: EvaluationActivityState, agents: readonly string[], months: readonly string[]): EvaluationHold | null {
  if (!state.ready || state.error) return { label: EVALUATION_STATUS_UNAVAILABLE, message: 'Evaluation status could not be verified. Refresh before viewing final scores.', pendingCount: 0 };
  const matches = state.records.filter(row => !row.isTestCase && isEvaluationActivityActive(row, state.now) && months.includes(row.monthKey) && agents.some(agent => sameAgent(row, agent)));
  if (!matches.length) return null;
  const editing = matches.some(row => row.mode === 'edit');
  return { label: editing ? WORKFLOW_STATUS.editing : WORKFLOW_STATUS.evaluating,
    message: editing ? 'QA is updating an evaluation in this audit period. Scores will be available after the updated result is saved.'
      : 'QA is evaluating cases in this audit period. Scores will be available after submission.', pendingCount: new Set(matches.map(row => `${row.username}|${row.monthKey}`)).size };
}
export function withEvaluationActivity<T extends EvaluationCaseScope>(cases: readonly T[], state: EvaluationActivityState): (T & EvaluationScoreState)[] {
  return cases.map(row => ({ ...row,
    evaluationCaseEditing: state.records.some(activity => isEvaluationActivityActive(activity, state.now) && activityMatchesCase(activity, row)),
    evaluationHoldLabel: row.isTestCase ? undefined : evaluationScopeHold(state, [row.agent || row.agentName || row.targetDisplayName || row.targetUsername || ''], [evaluationActivityMonth(row)])?.label }));
}
export function evaluationScoreHold(cases: readonly EvaluationScoreState[]): EvaluationHold | null {
  const labels = new Set(cases.map(row => row.evaluationHoldLabel).filter(Boolean));
  if (!labels.size) return null;
  const label = labels.has(EVALUATION_STATUS_UNAVAILABLE) ? EVALUATION_STATUS_UNAVAILABLE : labels.has(WORKFLOW_STATUS.editing) ? WORKFLOW_STATUS.editing : WORKFLOW_STATUS.evaluating;
  return { label, message: label === EVALUATION_STATUS_UNAVAILABLE ? 'Evaluation status could not be verified. Refresh before viewing final scores.'
    : 'QA is working on evaluations in this audit period. Scores will be available after the result is saved.', pendingCount: 0 };
}
export function evaluationCaseBlocked(row: EvaluationCaseScope, state: EvaluationActivityState, user?: { role?: string } | null) {
  if (user?.role === 'Quality Assurance') return false;
  return !state.ready || state.error || state.records.some(activity => isEvaluationActivityActive(activity, state.now) && activityMatchesCase(activity, row));
}
