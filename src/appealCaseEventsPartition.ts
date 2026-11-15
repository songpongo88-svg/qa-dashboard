// Group two display projections from the SAME authoritative case-scoped
// Firestore read. Must never be used to skip server checks before submission.
export const CASE_APPEAL_REQUEST_TYPES = [
  "appeal_request_submitted",
  "appeal_request_reviewed",
  "appeal_request_reset",
  "appeal_additional_round_opened",
  "appeal_additional_round_cancelled",
  "appeal_additional_round_expired",
  "appeal_additional_evidence_submitted",
  "appeal_additional_access_requested",
  "appeal_additional_access_decided",
  "appeal_submission_edit_started",
  "appeal_submission_draft_saved",
  "appeal_submission_resubmitted",
] as const;
export const CASE_APPEAL_OVERRIDE_TYPES = [
  "appeal_case_override_added",
  "appeal_case_override_removed",
] as const;
const requestKinds = new Set<string>(CASE_APPEAL_REQUEST_TYPES);
const overrideKinds = new Set<string>(CASE_APPEAL_OVERRIDE_TYPES);
export function partitionCaseAppealEvents<T extends { event_type: string }>(events: readonly T[]) {
  return {
    appealLogs: events.filter(event => requestKinds.has(event.event_type)),
    overrideLogs: events.filter(event => overrideKinds.has(event.event_type)),
  };
}
