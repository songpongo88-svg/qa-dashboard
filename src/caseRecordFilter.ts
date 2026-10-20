export type CaseRecordFilter = "all" | "appeals";

type CaseAppealEvidence = {
  hasAppealHistory?: boolean;
  appealRequestId?: string;
  appealStatus?: string;
  appealAdditionalActive?: object | null;
  reviewStatus?: string;
  revisedTopics?: readonly unknown[] | null;
  displayRevisedTopicCodes?: readonly string[];
  appealReviewedTopics?: readonly unknown[] | null;
};

// Match the case's own lifecycle, never its Agent's month-wide pending-score hold.
export function isAppealCaseRecord(item: CaseAppealEvidence): boolean {
  const status = String(item.appealStatus || "").trim();
  if (/^reset$/i.test(status)) return false;
  return Boolean(item.hasAppealHistory || item.appealRequestId || item.appealAdditionalActive ||
    /^(?:Pending|Approved|Partially Approved|Rejected)$/i.test(status) ||
    item.reviewStatus === "Revised" || item.revisedTopics?.length ||
    item.displayRevisedTopicCodes?.length || item.appealReviewedTopics?.length);
}

// Input is already authorized and filtered by period, Agent, topic or search.
export function filterCaseRecords<T extends CaseAppealEvidence>(items: readonly T[], mode: CaseRecordFilter): readonly T[] {
  return mode === "appeals" ? items.filter(isAppealCaseRecord) : items;
}
