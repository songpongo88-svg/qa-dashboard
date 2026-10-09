import type { UsageLogEvent } from "./usageLog";
import type { AppealEvidenceImage } from "./AppealEvidence";
import { appealScoreAfterReview, getAppealTopicDecision, summarizeAppealDecisions, type AppealTopicDecision } from "./appealReview";

export type AppealActionTopic = {
  code: string;
  label: string;
  score: number;
  max: number;
  comment?: string;
  wantsAppeal?: boolean;
  appealReason: string;
  evidenceImages?: AppealEvidenceImage[];
  qaEvidenceImages?: AppealEvidenceImage[];
  decision?: AppealTopicDecision;
  revisedScore?: number | string;
  revisedComment?: string;
  rejectReason?: string;
};

export type AppealActionSubmission = {
  submittedAt: string;
  submittedBy: string;
  topics: AppealActionTopic[];
};

export type AppealActionReview = {
  reviewId: string;
  reviewedAt: string;
  reviewedBy: string;
  decision: string;
  reviewSummary: string;
  finalScore: number;
  topics: AppealActionTopic[];
};

export type AppealAction = {
  actionId: string;
  actionNumber: number;
  roundId: string;
  openedAt: string;
  submittedAt: string;
  submittedBy: string;
  status: string;
  topics: AppealActionTopic[];
  submissions: AppealActionSubmission[];
  reviews: AppealActionReview[];
};

function time(event: UsageLogEvent) {
  return Date.parse(String(event.created_at || event.details?.reviewedAt || event.details?.submittedAt || event.details?.openedAt || "")) || 0;
}

function topics(event?: UsageLogEvent): AppealActionTopic[] {
  return Array.isArray(event?.details?.topics) ? event.details.topics as AppealActionTopic[] : [];
}

function appealed(topic: AppealActionTopic) {
  const reason = String(topic.appealReason || "").trim();
  return topic.wantsAppeal === true || Boolean(reason && !/^(?:no appeal|not appeal)$|ไม่อุทธรณ์|เนเธกเนเธญเธธเธ—เธเธฃเธ“เน/i.test(reason));
}

function submission(event: UsageLogEvent): AppealActionSubmission {
  return {
    submittedAt: String(event.details?.submittedAt || event.created_at || ""),
    submittedBy: String(event.details?.submittedBy || event.agent_name || event.display_name || event.username || ""),
    topics: topics(event).filter(appealed).map(topic => ({ ...topic })),
  };
}

// A review snapshot can carry results from other topics. Only the topics
// actually submitted in this round belong to this Action.
function reviewedTopics(source: AppealActionTopic[], review?: UsageLogEvent) {
  return source.map(topic => {
    const result = topics(review).find(item => item.code === topic.code);
    return {
      ...topic,
      decision: review ? getAppealTopicDecision(result, review.details?.decision) : undefined,
      revisedScore: result?.revisedScore,
      revisedComment: result?.revisedComment || "",
      rejectReason: result?.rejectReason || (getAppealTopicDecision(result, review?.details?.decision) === "Rejected" ? result?.revisedComment : "") || "",
      qaEvidenceImages: result?.qaEvidenceImages || [],
    };
  });
}

/** Projects the existing event log; never reads or rewrites stored appeals. */
export function buildAppealActionHistory(logs: UsageLogEvent[], requestId: string, asOf = Date.now()): AppealAction[] {
  const events = logs.filter(event => !event.source_case_unavailable && String(event.details?.requestId || event.id || "") === requestId)
    .slice().sort((a, b) => time(a) - time(b) || Number(a.details?.reviewVersion || 0) - Number(b.details?.reviewVersion || 0));
  const initial = events.find(event => event.event_type === "appeal_request_submitted");
  if (!initial) return [];
  const originalFinalScore = Number(initial.details?.finalScore || 0);
  const opened = new Map<string, UsageLogEvent>();
  const roundOrder = new Map<string, number>([["", time(initial)]]);
  const submissions = new Map<string, UsageLogEvent[]>([["", [initial]]]);
  const reviews = new Map<string, UsageLogEvent[]>();
  const reviewRounds = new Map<string, string>();

  for (const event of events) {
    let roundId = String(event.details?.roundId || "");
    if (event.event_type === "appeal_request_reviewed" && !roundId) {
      // Older QA edits omitted roundId but retained the previous review ID.
      roundId = reviewRounds.get(String(event.details?.previousReviewId || "")) || "";
    }
    if (event.event_type === "appeal_additional_round_opened" && roundId && !opened.has(roundId)) {
      opened.set(roundId, event);
      roundOrder.set(roundId, time(event));
    }
    if (["appeal_additional_evidence_submitted", "appeal_submission_resubmitted"].includes(event.event_type)) {
      submissions.set(roundId, [...(submissions.get(roundId) || []), event]);
      if (!roundOrder.has(roundId)) roundOrder.set(roundId, time(event));
    }
    if (event.event_type === "appeal_request_reviewed") {
      reviews.set(roundId, [...(reviews.get(roundId) || []), event]);
      reviewRounds.set(String(event.details?.reviewId || event.id || ""), roundId);
      if (!roundOrder.has(roundId)) roundOrder.set(roundId, time(event));
    }
  }

  return [...roundOrder.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([roundId], index) => {
    const round = opened.get(roundId);
    const savedSubmissions = submissions.get(roundId) || [];
    const savedReviews = reviews.get(roundId) || [];
    const latestSubmission = savedSubmissions.at(-1);
    const latestReview = savedReviews.at(-1);
    const sourceTopics = latestSubmission ? topics(latestSubmission).filter(appealed)
      : latestReview ? topics(latestReview).filter(topic => appealed(topic) && (!round || topics(round).some(allowed => allowed.code === topic.code)))
      : topics(round).map(topic => ({ ...topic, appealReason: "", evidenceImages: [] }));
    const actionTopics = reviewedTopics(sourceTopics, latestReview);
    const openedAt = String(round?.details?.openedAt || round?.created_at || "");
    const expiresAt = Date.parse(String(round?.details?.expiresAt || "")) || (Date.parse(openedAt) + 72 * 60 * 60 * 1000);
    const cancelled = events.some(event => event.event_type === "appeal_additional_round_cancelled" && String(event.details?.roundId || "") === roundId);
    const expired = roundId && !latestSubmission && (asOf >= expiresAt || events.some(event => event.event_type === "appeal_additional_round_expired" && String(event.details?.roundId || "") === roundId));
    return {
      actionId: `${requestId}:${roundId || "initial"}`,
      actionNumber: index + 1,
      roundId,
      openedAt,
      submittedAt: latestSubmission ? submission(latestSubmission).submittedAt : "",
      submittedBy: latestSubmission ? submission(latestSubmission).submittedBy : "",
      status: latestReview ? summarizeAppealDecisions(actionTopics) : cancelled ? "Cancelled (Additional)" : expired ? "Expired (Additional)" : latestSubmission ? "Pending" : "Awaiting Additional Submission",
      topics: actionTopics,
      submissions: savedSubmissions.map(submission),
      reviews: savedReviews.map(review => {
        const source = savedSubmissions.filter(event => time(event) <= time(review)).at(-1);
        const reviewed = reviewedTopics(source ? topics(source).filter(appealed) : sourceTopics, review);
        return {
          reviewId: String(review.details?.reviewId || review.id || review.created_at || ""),
          reviewedAt: String(review.details?.reviewedAt || review.created_at || ""),
          reviewedBy: String(review.details?.reviewedBy || review.agent_name || review.display_name || review.username || ""),
          decision: summarizeAppealDecisions(reviewed),
          reviewSummary: String(review.details?.reviewSummary || ""),
          finalScore: appealScoreAfterReview(topics(review).map(topic => ({ ...topic, decision: getAppealTopicDecision(topic, review.details?.decision) })), originalFinalScore),
          topics: reviewed,
        };
      }),
    };
  });
}
