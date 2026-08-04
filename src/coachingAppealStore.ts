import * as XLSX from "xlsx";
import { buildAppealRequests } from "./AppealRequestsMockup";
import { fetchAppealEvents } from "./appealStore";
import type { StoredEvaluation, StoredEvaluationTopic } from "./evaluationStore";
import { getCoachingTopicSchema } from "./coachingHistoricalStore";

const APPEAL_FILE_ALIASES = [
  "/Appeal ROWDATA.xlsx",
  "/Appeal_ROWDATA.xlsx",
  "/Appleal ROWDATA.xlsx",
  "/Appleal_ROWDATA.xlsx",
  "/QA_ApplealRawData.xlsx",
];

type ApprovedRevision = {
  caseId: string;
  reviewedAt: string;
  finalScore?: number;
  criticalError?: boolean;
  topics: StoredEvaluationTopic[];
  source: string;
};

function normalize(value: unknown) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function hasValue(value: unknown) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, parsed.S || 0);
  }
  const text = String(value || "").trim();
  if (!text) return null;
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (slash) {
    let year = Number(slash[3]);
    if (year > 2400) year -= 543;
    const date = new Date(year, Number(slash[2]) - 1, Number(slash[1]), Number(slash[4] || 0), Number(slash[5] || 0), Number(slash[6] || 0));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toIso(value: unknown) {
  const date = parseDate(value);
  return date ? date.toISOString() : "";
}

function monthKeyFromLabel(value: unknown) {
  const text = String(value || "").trim();
  const direct = text.match(/^(\d{4})-(\d{2})/);
  if (direct) return `${direct[1]}-${direct[2]}`;
  const parsed = new Date(`1 ${text}`);
  if (!text || Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

function evaluationMonthKey(item: StoredEvaluation) {
  const direct = String(item.evaluationMonthKey || item.rawDataPreview?.["Evaluation Month Key"] || "").match(/^(\d{4})-(\d{2})/);
  if (direct) return `${direct[1]}-${direct[2]}`;
  const date = parseDate(item.auditDate || item.auditTimestamp || item.submittedAt);
  return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` : "unknown";
}

function headerMap(header: unknown[]) {
  const map = new Map<string, number[]>();
  header.forEach((value, index) => {
    const key = normalize(value);
    if (!key) return;
    map.set(key, [...(map.get(key) || []), index]);
  });
  const get = (row: unknown[], label: string, occurrence = 0) => {
    const index = (map.get(normalize(label)) || [])[occurrence];
    return typeof index === "number" ? row[index] : null;
  };
  const getLast = (row: unknown[], label: string) => {
    const indexes = map.get(normalize(label)) || [];
    for (let index = indexes.length - 1; index >= 0; index -= 1) {
      const value = row[indexes[index]];
      if (hasValue(value)) return value;
    }
    return null;
  };
  const getAny = (row: unknown[], labels: string[]) => {
    for (const label of labels) {
      const value = get(row, label);
      if (hasValue(value)) return value;
    }
    return null;
  };
  return { get, getAny, getLast };
}

function revisionTimestamp(value: ApprovedRevision) {
  return parseDate(value.reviewedAt)?.getTime() || 0;
}

function setLatestRevision(map: Map<string, ApprovedRevision>, revision: ApprovedRevision) {
  const key = revision.caseId.trim().toUpperCase();
  if (!key) return;
  const current = map.get(key);
  if (!current || revisionTimestamp(revision) >= revisionTimestamp(current)) map.set(key, revision);
}

async function fetchAppealWorkbook() {
  for (const file of APPEAL_FILE_ALIASES) {
    try {
      const response = await fetch(file, { cache: "no-store" });
      if (!response.ok) continue;
      const buffer = await response.arrayBuffer();
      return { workbook: XLSX.read(buffer, { type: "array", cellDates: true }), source: file };
    } catch {
      // Try the next known alias.
    }
  }
  return null;
}

async function loadWorkbookRevisions(evaluations: StoredEvaluation[]) {
  const result = new Map<string, ApprovedRevision>();
  const loaded = await fetchAppealWorkbook();
  if (!loaded) return result;
  const sheet = loaded.workbook.Sheets.Appeal_Data || loaded.workbook.Sheets[loaded.workbook.SheetNames[0]];
  if (!sheet) return result;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
  const headerIndex = rows.findIndex((row) => row.map(normalize).includes("case id"));
  if (headerIndex < 0) return result;
  const helper = headerMap(rows[headerIndex] || []);
  const evaluationByCase = new Map(evaluations.map((item) => [item.caseId.trim().toUpperCase(), item]));

  rows.slice(headerIndex + 1).forEach((row) => {
    const caseId = String(helper.getAny(row, ["Case ID", "Case Id"]) || "").trim();
    if (!caseId) return;
    const approvalStatus = normalize(helper.getAny(row, ["Comment Status", "QA Scheme", "Appeal Status", "Status"]));
    if (!approvalStatus.includes("approved")) return;
    const base = evaluationByCase.get(caseId.toUpperCase());
    const monthKey = base ? evaluationMonthKey(base) : monthKeyFromLabel(helper.getAny(row, ["Month Label", "Evaluation Month Key"]));
    const schema = getCoachingTopicSchema(monthKey);
    const topics = schema
      .map((topic): StoredEvaluationTopic | null => {
        const scoreRaw = helper.get(row, `${topic.code} Revised Score`);
        const commentRaw = helper.get(row, `${topic.code} Revised Comment`);
        if ((!hasValue(scoreRaw) || Number.isNaN(Number(scoreRaw))) && !hasValue(commentRaw)) return null;
        const original = base?.topics.find((item) => item.code === topic.code);
        return {
          code: topic.code,
          title: original?.title || topic.title,
          max: original?.max || topic.max,
          score: hasValue(scoreRaw) && !Number.isNaN(Number(scoreRaw)) ? Number(scoreRaw) : Number(original?.score || 0),
          comment: String(commentRaw || original?.comment || "").trim(),
        };
      })
      .filter((topic): topic is StoredEvaluationTopic => Boolean(topic));
    if (!topics.length) return;
    const finalScoreRaw = helper.getLast(row, "Final Score");
    const criticalText = normalize(helper.getAny(row, ["Critical Error", "Critical Flag"]));
    setLatestRevision(result, {
      caseId,
      reviewedAt: toIso(helper.getAny(row, ["Appeal Result Date & Time", "Timestamp"])),
      finalScore: hasValue(finalScoreRaw) && !Number.isNaN(Number(finalScoreRaw)) ? Number(finalScoreRaw) : undefined,
      criticalError: criticalText
        ? ["yes", "true", "1", "critical"].includes(criticalText)
        : undefined,
      topics,
      source: loaded.source,
    });
  });
  return result;
}

async function loadDashboardRevisions(evaluations: StoredEvaluation[]) {
  const result = new Map<string, ApprovedRevision>();
  try {
    const logs = await fetchAppealEvents([
      "appeal_request_submitted",
      "appeal_request_reviewed",
      "appeal_request_reset",
    ], { limit: 2000 });
    const evaluationByCase = new Map(evaluations.map((item) => [item.caseId.trim().toUpperCase(), item]));
    buildAppealRequests(logs)
      .filter((request) => request.status === "Approved")
      .sort((a, b) => (parseDate(a.reviewedAt || a.submittedAt)?.getTime() || 0) - (parseDate(b.reviewedAt || b.submittedAt)?.getTime() || 0))
      .forEach((request) => {
        const caseId = String(request.caseId || "").trim();
        const base = evaluationByCase.get(caseId.toUpperCase());
        if (!caseId || !base) return;
        let delta = 0;
        const topics = request.topics
          .map((topic): StoredEvaluationTopic | null => {
            const revisedScore = hasValue(topic.revisedScore) && !Number.isNaN(Number(topic.revisedScore)) ? Number(topic.revisedScore) : Number(topic.score || 0);
            const originalScore = Number(topic.score || 0);
            delta += revisedScore - originalScore;
            const original = base.topics.find((item) => item.code === topic.code);
            if (!original) return null;
            return {
              ...original,
              score: revisedScore,
              comment: String(topic.revisedComment || topic.comment || original.comment || "").trim(),
            };
          })
          .filter((topic): topic is StoredEvaluationTopic => Boolean(topic));
        if (!topics.length) return;
        setLatestRevision(result, {
          caseId,
          reviewedAt: String(request.reviewedAt || request.submittedAt || ""),
          finalScore: Number((Number(request.finalScore || base.finalScore || 0) + delta).toFixed(2)),
          topics,
          source: "Approved Appeal Review",
        });
      });
  } catch (error) {
    console.warn("Approved Coaching appeal merge skipped", error);
  }
  return result;
}

function applyRevision(item: StoredEvaluation, revision: ApprovedRevision) {
  const revisedMap = new Map(revision.topics.map((topic) => [topic.code, topic]));
  const topics = item.topics.map((topic) => revisedMap.get(topic.code) || topic);
  const finalScore = revision.finalScore ?? topics.reduce((sum, topic) => sum + Number(topic.score || 0), 0);
  return {
    ...item,
    finalScore: Number(finalScore.toFixed(2)),
    criticalError: revision.criticalError ?? item.criticalError,
    topics,
    strengths: topics.filter((topic) => topic.score >= topic.max).map((topic) => topic.title).slice(0, 6),
    improvements: topics.filter((topic) => topic.score < topic.max && topic.comment).map((topic) => topic.comment).slice(0, 12),
    rawDataPreview: {
      ...(item.rawDataPreview || {}),
      "Coaching Review Status": "Revised",
      "Coaching Appeal Status": "Approved",
      "Coaching Appeal Source": revision.source,
      "Coaching Appeal Reviewed At": revision.reviewedAt,
    },
  } as StoredEvaluation;
}

export async function applyApprovedCoachingAppeals(evaluations: StoredEvaluation[]) {
  const [workbookRevisions, dashboardRevisions] = await Promise.all([
    loadWorkbookRevisions(evaluations).catch(() => new Map<string, ApprovedRevision>()),
    loadDashboardRevisions(evaluations).catch(() => new Map<string, ApprovedRevision>()),
  ]);
  dashboardRevisions.forEach((revision) => setLatestRevision(workbookRevisions, revision));
  return evaluations.map((item) => {
    const revision = workbookRevisions.get(item.caseId.trim().toUpperCase());
    return revision ? applyRevision(item, revision) : item;
  });
}
