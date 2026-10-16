export type AppealTopicDecision = "Approved" | "Rejected";
export type AppealDecision = AppealTopicDecision | "Partially Approved";

export type AppealIssueTagFields = {
  issueTags?: string[];
  retainedIssueTags?: string[];
  revisedIssueTags?: string[];
  decision?: AppealTopicDecision;
};

export function normalizeAppealIssueTags(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split("|") : [];
  const seen = new Set<string>();
  return values.filter((item): item is string => typeof item === "string").map(item => item.trim().replace(/\s+/g, " "))
    .filter(item => { const key = item.toLocaleLowerCase("th-TH"); if (!item || item === "-" || seen.has(key)) return false; seen.add(key); return true; });
}

// Undefined means an old request has no Tag snapshot. An explicit [] means
// every Tag was deliberately removed and must never fall back to the original.
export function appealIssueTagsBeforeReview(topic: AppealIssueTagFields): string[] | undefined {
  if (Array.isArray(topic.retainedIssueTags)) return normalizeAppealIssueTags(topic.retainedIssueTags);
  if (Array.isArray(topic.issueTags)) return normalizeAppealIssueTags(topic.issueTags);
  return undefined;
}

export function appealTopicIssueTags(topic: AppealIssueTagFields, requestDecision?: unknown): string[] | undefined {
  return getAppealTopicDecision(topic, requestDecision) === "Approved" && Array.isArray(topic.revisedIssueTags)
    ? normalizeAppealIssueTags(topic.revisedIssueTags) : appealIssueTagsBeforeReview(topic);
}

export function appealIssueTagChanges(topic: AppealIssueTagFields) {
  const before = appealIssueTagsBeforeReview(topic);
  const after = appealTopicIssueTags(topic);
  if (!before || !after) return [];
  const kept = new Set(after.map(tag => tag.toLocaleLowerCase("th-TH")));
  return before.filter(tag => !kept.has(tag.toLocaleLowerCase("th-TH")));
}

export function appealIssueTagsChanged(topic: AppealIssueTagFields): boolean {
  const after = appealTopicIssueTags(topic);
  if (!Array.isArray(topic.issueTags) || after === undefined) return false;
  const before = normalizeAppealIssueTags(topic.issueTags).map(tag => tag.toLocaleLowerCase("th-TH")).sort();
  return JSON.stringify(before) !== JSON.stringify(after.map(tag => tag.toLocaleLowerCase("th-TH")).sort());
}

export function applyAppealIssueTagReviews<T extends { caseId: string; topics: Array<{ code: string; issueTags?: string[] }> }>(records: T[], requests: Array<{
  caseId: string; status: string; submittedAt: string; reviewedAt?: string; topics: Array<AppealIssueTagFields & { code: string }>;
}>): T[] {
  const latest = new Map<string, typeof requests[number]>();
  for (const request of requests.slice().sort((a, b) => Date.parse(a.submittedAt || a.reviewedAt || "") - Date.parse(b.submittedAt || b.reviewedAt || ""))) {
    for (const id of request.caseId.toUpperCase().split(/[,;\n]+|\s*\/\s*/).map(value => value.replace(/\s+/g, "")).filter(Boolean)) latest.set(id, request);
  }
  return records.map(record => {
    const request = latest.get(record.caseId.replace(/\s+/g, "").toUpperCase());
    if (!request || !["Approved", "Partially Approved", "Rejected"].includes(request.status)) return record;
    return { ...record, topics: record.topics.map(topic => {
      const review = request.topics.find(row => row.code === topic.code);
      const tags = review && appealTopicIssueTags(review, request.status);
      return tags === undefined ? topic : { ...topic, issueTags: tags };
    }) };
  });
}

type ReviewTopic = AppealIssueTagFields & {
  code: string;
  score: number;
  // Additional rounds keep their starting score in `score`, and retain the
  // original evaluation baseline separately for cumulative calculation.
  originalScore?: number;
  retainedComment?: string;
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
    if (topic.decision !== "Approved" && !(topic.decision === "Rejected" && topic.originalScore !== undefined)) return total;
    const original = Number(topic.originalScore ?? topic.score);
    if (topic.decision === "Rejected") return total + Number(topic.score) - original;
    const revised = Number(topic.revisedScore);
    return Number.isFinite(revised) && String(topic.revisedScore ?? "").trim() !== ""
      ? total + revised - original
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
      const before = appealIssueTagsBeforeReview(topic);
      const selected = topic.revisedIssueTags === undefined ? before : normalizeAppealIssueTags(topic.revisedIssueTags);
      if (topic.revisedIssueTags !== undefined && (!Array.isArray(topic.revisedIssueTags) || !before || selected!.some(tag => !before.some(original => original.toLocaleLowerCase("th-TH") === tag.toLocaleLowerCase("th-TH"))))) {
        throw new Error(`Tag หลังทบทวนของหัวข้อ ${topic.code} ต้องเลือกจาก Tag ก่อนรอบนี้`);
      }
      return { ...topic, ...(selected !== undefined ? { revisedIssueTags: selected } : {}), revisedScore: score, revisedComment: String(topic.revisedComment).trim(), rejectReason: "" };
    }
    const rejectReason = String(topic.rejectReason || "").trim();
    if (!rejectReason) throw new Error(`กรุณาระบุ Reject Reason ของหัวข้อ ${topic.code}`);
    const { revisedScore: _score, revisedComment: _comment, revisedIssueTags: _tags, ...original } = topic;
    return { ...original, rejectReason };
  });
  return { decision, topics: reviewedTopics, finalScore: appealScoreAfterReview(reviewedTopics, originalFinalScore) };
}
