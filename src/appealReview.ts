export type AppealTopicDecision = "Approved" | "Rejected";
export type AppealDecision = AppealTopicDecision | "Partially Approved";

type ReviewTopic = {
  code: string;
  score: number;
  max: number;
  decision?: AppealTopicDecision;
  revisedScore?: number | string;
  revisedComment?: string;
  rejectReason?: string;
};

// Historical reviews store one decision for the request. New reviews store it
// on every appealed topic; that explicit decision always takes precedence.
export function getAppealTopicDecision(topic: { decision?: unknown } | null | undefined, requestDecision?: unknown): AppealTopicDecision | undefined {
  const value = topic?.decision;
  if (value === "Approved" || value === "Rejected") return value;
  if (requestDecision === "Approved" || requestDecision === "Rejected") return requestDecision;
  return undefined;
}

export function summarizeAppealDecisions(topics: Array<{ decision?: unknown }>): AppealDecision | "Pending" {
  if (!topics.length || topics.some(topic => !getAppealTopicDecision(topic))) return "Pending";
  const approved = topics.filter(topic => topic.decision === "Approved").length;
  return approved === topics.length ? "Approved" : approved === 0 ? "Rejected" : "Partially Approved";
}

export function appealScoreAfterReview(topics: ReviewTopic[], originalFinalScore: number): number {
  const score = topics.reduce((total, topic) => {
    if (topic.decision !== "Approved") return total;
    const revised = Number(topic.revisedScore);
    return Number.isFinite(revised) && String(topic.revisedScore ?? "").trim() !== ""
      ? total + revised - Number(topic.score)
      : total;
  }, originalFinalScore);
  return Math.round(score * 100) / 100;
}

export function prepareAppealReview<T extends ReviewTopic>(topics: T[], originalFinalScore: number) {
  const decision = summarizeAppealDecisions(topics);
  if (decision === "Pending") throw new Error("กรุณาเลือก Approved หรือ Reject ให้ครบทุกหัวข้อที่อุทธรณ์");
  const reviewedTopics = topics.map(topic => {
    if (topic.decision === "Approved") {
      const score = Number(topic.revisedScore);
      if (String(topic.revisedScore ?? "").trim() === "" || !Number.isFinite(score) || score < 0 || score > topic.max) {
        throw new Error(`คะแนนใหม่ของหัวข้อ ${topic.code} ต้องอยู่ระหว่าง 0 ถึง ${topic.max}`);
      }
      if (!String(topic.revisedComment || "").trim()) throw new Error(`กรุณาระบุ Revised Comment ของหัวข้อ ${topic.code}`);
      return { ...topic, revisedScore: score, revisedComment: String(topic.revisedComment).trim(), rejectReason: "" };
    }
    const rejectReason = String(topic.rejectReason || "").trim();
    if (!rejectReason) throw new Error(`กรุณาระบุ Reject Reason ของหัวข้อ ${topic.code}`);
    const { revisedScore: _score, revisedComment: _comment, ...original } = topic;
    return { ...original, rejectReason };
  });
  return { decision, topics: reviewedTopics, finalScore: appealScoreAfterReview(reviewedTopics, originalFinalScore) };
}
