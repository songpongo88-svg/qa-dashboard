import type { StoredCoachingRecord } from './coachingStore';
import { canonicalAgentIdentityKey } from './lib/agentIdentity';
import { COACHING_WORKFLOW_START, coachingDeadline, coachingResultError, isCoachingAccepted } from './monthlyCoachingModel';

export type CoachingPaymentStatus = { complete: boolean; onTime: boolean; completedAt: string; reason: string };

export function monthlyCoachingPaymentStatus(month: string, agent: string, records: StoredCoachingRecord[], agentId = ''): CoachingPaymentStatus {
  const incomplete = (reason: string): CoachingPaymentStatus => ({ complete: false, onTime: false, completedAt: '', reason });
  const deadline = coachingDeadline(month);
  if (!deadline) return incomplete('Invalid Evaluation Month');
  if (month < COACHING_WORKFLOW_START) return { complete: true, onTime: true, completedAt: '', reason: '' };
  const identity = canonicalAgentIdentityKey(agent);
  const matched = records.filter(record => record.monthKey === month &&
    (agentId && record.agentId ? record.agentId.trim().toLowerCase() === agentId.trim().toLowerCase() :
      Boolean(identity) && canonicalAgentIdentityKey(record.agent) === identity));
  if (!agentId && new Set(matched.map(record => record.agentId?.trim().toLowerCase()).filter(Boolean)).size > 1) return incomplete('Agent Identity Verification Required');
  const record = matched.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!record) return incomplete('Coaching Not Created');
  if (!record.qaSummary?.trim() || !record.recommendedTopics?.length) return incomplete('Awaiting QA Coaching Preparation');
  const resultError = coachingResultError(record);
  if (resultError) return incomplete('Coaching / Action Plan Incomplete');
  if (!isCoachingAccepted(record.status) || !record.qaReviewComment?.trim()) return incomplete('Awaiting QA Plan Review');
  // Older accepted records have only updatedAt; new reviews keep a dedicated
  // completion time so later follow-up edits cannot move the payment cutoff.
  const reviewedAt = record.qaReviewedAt || record.updatedAt;
  const reviewedTime = Date.parse(reviewedAt);
  const coachingTime = Date.parse(`${record.actualCoaching!.date}T${record.actualCoaching!.endTime}:00+07:00`);
  if (!Number.isFinite(reviewedTime) || !Number.isFinite(coachingTime)) return incomplete('Coaching / QA Review Completion Time Missing');
  const completedTime = Math.max(reviewedTime, coachingTime);
  const onTime = completedTime <= Date.parse(deadline);
  return { complete: true, onTime, completedAt: new Date(completedTime).toISOString(),
    reason: onTime ? '' : 'Coaching / QA Review Completed Late · Deferred to the Next Payment Cycle' };
}
