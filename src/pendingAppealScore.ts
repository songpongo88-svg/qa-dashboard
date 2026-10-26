import { WORKFLOW_STATUS, formatCaseCount } from "./workflowStatusLabels";
import { evaluationScoreHold, type EvaluationScoreState } from "./evaluationActivity";
import { canonicalAgentIdentityKey } from "./lib/agentIdentity";
import { appealWorkflowLabel, appealWorkflowStatus, type AppealWorkflowRequest } from "./appealWorkflow";

export type AppealScoreState = EvaluationScoreState & {
  pendingAppealCaseCount?: number;
  appealScoreUnverified?: boolean;
  appealScoreMonthKey?: string;
  pendingAppealStatusCounts?: Record<string, number>;
  appealScoreDeadlineAt?: string;
};

type AppealRequestState = Omit<AppealWorkflowRequest, 'requestId'> & {
  requestId?: string;
  auditDate?: string;
  submittedAt?: string;
  reviewedAt?: string;
};

export type AppealScoreHold = { label: string; message: string; pendingCount: number };
const openStatuses = new Set(['Pending', 'Pending (Additional)', 'Request Additional Appeal', 'Awaiting Additional Submission', 'Approved (Access)']);

function caseIds(value: string) {
  const text = String(value || "");
  const matches = text.match(/[A-Za-z]{1,6}\d{3,}/g) || [];
  return [...new Set((matches.length ? matches : text.split(/[,;|\n]+/))
    .map(id => id.replace(/\s+/g, "").toUpperCase()).filter(Boolean))];
}

type DatedCase = { agent: string; caseId: string; isTestCase?: boolean;
  monthKey?: string; auditDateObj?: Date | null; auditDate?: string; caseDate?: string };

function auditMonth(value?: string | Date | null): string {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" :
    `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
  const text = String(value || "").trim();
  const iso = text.match(/^(\d{4})-(\d{2})(?:$|[-T\s])/);
  const display = text.match(/^\d{1,2}[/.\-](\d{1,2})[/.\-](\d{4})(?:$|\s)/);
  const year = Number(iso?.[1] || display?.[2]);
  const month = Number(iso?.[2] || display?.[1]);
  if (!year || month < 1 || month > 12) return "";
  return `${year >= 2400 ? year - 543 : year}-${String(month).padStart(2, "0")}`;
}

function caseMonth(item: DatedCase) {
  return auditMonth(item.monthKey) || auditMonth(item.auditDateObj) ||
    auditMonth(item.auditDate) || auditMonth(item.caseDate);
}

// Keep numeric data intact and propagate holds across every week/search result
// in the affected audit month only. Submission/review dates never select a month.
export function withAppealScoreState<T extends DatedCase & AppealScoreState>(
  cases: readonly T[], requests: readonly AppealRequestState[] | null
): Array<T & AppealScoreState> {
  if (requests === null) return cases.map(item => ({ ...item, appealScoreUnverified: !item.isTestCase }));
  const sourceMonths = new Map<string, Set<string>>();
  for (const item of cases) for (const id of caseIds(item.caseId)) {
    const key = `${canonicalAgentIdentityKey(item.agent)}|${id}`;
    const months = sourceMonths.get(key) || new Set<string>();
    if (caseMonth(item)) months.add(caseMonth(item));
    sourceMonths.set(key, months);
  }
  const latest = new Map<string, { request: AppealRequestState; time: number; month: string }>();
  const requestMonths = new Map<string, Set<string>>();
  for (const request of requests) {
    const agent = canonicalAgentIdentityKey(request.agent);
    if (!agent) continue;
    const time = Date.parse(request.submittedAt || request.reviewedAt || "") || 0;
    for (const id of caseIds(request.caseId)) {
      const key = `${agent}|${id}`;
      const source = sourceMonths.get(key);
      const month = auditMonth(request.auditDate) || (source?.size === 1 ? [...source][0] : "unknown");
      const months = requestMonths.get(key) || new Set<string>();
      months.add(month); requestMonths.set(key, months);
      const scopedKey = `${key}|${month}`;
      const previous = latest.get(scopedKey);
      if (!previous || time >= previous.time) latest.set(scopedKey, { request, time, month });
    }
  }
  const monthForCase = (item: T) => {
    if (caseMonth(item)) return caseMonth(item);
    const months = new Set(caseIds(item.caseId).flatMap(id =>
      [...(requestMonths.get(`${canonicalAgentIdentityKey(item.agent)}|${id}`) || [])]));
    return months.size === 1 ? [...months][0] : "unknown";
  };
  const testCases = new Set(cases.filter(item => item.isTestCase).flatMap(item =>
    caseIds(item.caseId).map(id => `${canonicalAgentIdentityKey(item.agent)}|${id}|${monthForCase(item)}`)));
  const pendingByAgentMonth = new Map<string, Record<string, number>>();
  const deadlineByAgentMonth = new Map<string, string>();
  for (const [key, { request, month }] of latest) {
    const status = appealWorkflowStatus({ ...request, requestId: request.requestId || '' });
    const expiryTime = request.additionalRound && !request.additionalRound.submitted
      ? Date.parse(request.additionalRound.expiresAt || '') || Date.parse(request.additionalRound.openedAt) + 72 * 3600000 : NaN;
    const deadline = Number.isFinite(expiryTime) ? new Date(expiryTime).toISOString() : '';
    if (!openStatuses.has(status) || testCases.has(key) || (deadline && Date.parse(deadline) <= Date.now())) continue;
    const agent = canonicalAgentIdentityKey(request.agent);
    const scope = `${agent}|${month}`;
    const counts = pendingByAgentMonth.get(scope) || {};
    counts[status] = (counts[status] || 0) + 1;
    pendingByAgentMonth.set(scope, counts);
    if (deadline && (!deadlineByAgentMonth.has(scope) || deadline < deadlineByAgentMonth.get(scope)!)) deadlineByAgentMonth.set(scope, deadline);
  }
  return cases.map(item => {
    const scope = `${canonicalAgentIdentityKey(item.agent)}|${monthForCase(item)}`;
    const counts = item.isTestCase ? {} : pendingByAgentMonth.get(scope) || {};
    return { ...item,
    appealScoreMonthKey: monthForCase(item),
    pendingAppealStatusCounts: counts,
    pendingAppealCaseCount: Object.values(counts).reduce((sum, count) => sum + count, 0),
    appealScoreDeadlineAt: item.isTestCase ? '' : deadlineByAgentMonth.get(scope) || '',
    appealScoreUnverified: false,
  }; });
}

export function getAppealScoreHold(cases: readonly ({ agent: string; isTestCase?: boolean } & AppealScoreState)[]): AppealScoreHold | null {
  const evaluationHold = evaluationScoreHold(cases.filter(item => !item.isTestCase));
  if (evaluationHold) return evaluationHold;
  const counts = new Map<string, number>();
  const statusesByScope = new Map<string, Record<string, number>>();
  let unverified = false;
  for (const item of cases) {
    if (item.isTestCase) continue;
    unverified ||= Boolean(item.appealScoreUnverified);
    const agent = `${canonicalAgentIdentityKey(item.agent)}|${item.appealScoreMonthKey || "unknown"}`;
    counts.set(agent, Math.max(counts.get(agent) || 0, item.pendingAppealCaseCount || 0));
    const statuses = statusesByScope.get(agent) || {};
    for (const [status, count] of Object.entries(item.pendingAppealStatusCounts || {})) statuses[status] = Math.max(statuses[status] || 0, count);
    statusesByScope.set(agent, statuses);
  }
  const pendingCount = [...counts.values()].reduce((sum, count) => sum + count, 0);
  if (unverified) return {
    label: WORKFLOW_STATUS.verificationFailed,
    message: "Scores are unavailable until the appeal status is verified. Refresh to try again.",
    pendingCount,
  };
  const statuses = new Set([...statusesByScope.values()].flatMap(counts => Object.keys(counts)));
  if (pendingCount && !statuses.size) statuses.add('Pending');
  return pendingCount ? {
    label: statuses.size === 1 ? appealWorkflowLabel([...statuses][0]) : WORKFLOW_STATUS.appealInProgress,
    message: `${formatCaseCount(pendingCount)} pending · ${[...statuses].map(appealWorkflowLabel).join(' / ')}. Scores will be available after all reviews or additional submission windows are complete.`,
    pendingCount,
  } : null;
}

export function nextAppealScoreDeadline(cases: readonly AppealScoreState[]): number | null {
  const deadlines = cases.map(item => Date.parse(item.appealScoreDeadlineAt || '')).filter(Number.isFinite);
  return deadlines.length ? Math.min(...deadlines) : null;
}
