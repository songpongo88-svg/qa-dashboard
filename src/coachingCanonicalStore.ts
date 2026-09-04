import * as XLSX from "xlsx";
import {
  excludeTestEvaluations,
  fetchStoredEvaluations,
  getStoredEvaluationMonthKey,
  isNoCaseEvaluation,
  type StoredEvaluation,
  type StoredEvaluationTopic,
} from "./evaluationStore";
import { fetchAppealEvents } from "./appealStore";
import { buildAppealRequests } from "./AppealRequestsMockup";
import { fetchCachedStaticResponse } from "./staticFileCache";
import { canonicalizeAgentName } from "./lib/agentIdentity";
import { scoreToGrade } from "./lib/scoreIncentivePolicy";

const RAW_DATA_FILE_NAMES = [
  "QA_RawData_January-February2026.xlsx",
  "QA_RawData_March-May2026.xlsx",
];

const APPEAL_FILE_NAMES = [
  "/Appleal ROWDATA.xlsx",
  "/Appeal ROWDATA.xlsx",
  "/Appeal_ROWDATA.xlsx",
];

const JAN_FEB_TOPIC_MASTER = [
  { code: "1", title: "เปิด-ปิดการสนทนา", max: 10 },
  { code: "2", title: "วิเคราะห์/แก้ไข", max: 30 },
  { code: "3", title: "ปฏิบัติตามขั้นตอน", max: 20 },
  { code: "4", title: "ความสุภาพ", max: 10 },
  { code: "5", title: "ภาษา", max: 20 },
  { code: "6", title: "ระยะเวลา", max: 10 },
];

const LEGACY_TOPIC_MASTER = [
  { code: "1.1", title: "Greeting & Closing Standard", max: 10 },
  { code: "1.2", title: "Accuracy of Information", max: 5 },
  { code: "1.3", title: "PDPA & Policy", max: 5 },
  { code: "2.1", title: "Case Accuracy", max: 5 },
  { code: "2.2", title: "Completeness", max: 5 },
  { code: "2.3", title: "Clear Actionable Guidance", max: 5 },
  { code: "2.4", title: "Official Sources", max: 5 },
  { code: "3.1", title: "Root Cause & Resolution", max: 10 },
  { code: "3.2", title: "Case Ownership", max: 5 },
  { code: "3.3", title: "Clear Next Step Guidance", max: 5 },
  { code: "4.1", title: "Message Structure", max: 5 },
  { code: "4.2", title: "Language Quality", max: 5 },
  { code: "4.3", title: "Tone & Empathy", max: 5 },
  { code: "4.4", title: "Adaptation to Context", max: 5 },
  { code: "5.1", title: "Work Process Compliance", max: 10 },
  { code: "5.2", title: "SLA Compliance", max: 5 },
  { code: "5.3", title: "Case Logging / Status Accuracy", max: 5 },
];

const APR_MAY_TOPIC_MASTER = [
  { code: "1.1", title: "มาตรฐานการทักทายและปิดการสนทนา", max: 10 },
  { code: "1.2", title: "การปฏิบัติตาม PDPA / Policy / ข้อกำหนด", max: 10 },
  { code: "1.3", title: "การปฏิบัติตามกระบวนการและ SLA", max: 10 },
  { code: "2.1", title: "ความถูกต้องของคำตอบ", max: 10 },
  { code: "2.2", title: "ความครบถ้วนของคำตอบ", max: 10 },
  { code: "2.3", title: "ความชัดเจนของขั้นตอนและแหล่งอ้างอิง", max: 5 },
  { code: "3.1", title: "การวิเคราะห์และแก้ไขปัญหาได้ตรงจุด", max: 15 },
  { code: "3.2", title: "Ownership และการแจ้ง Next Step", max: 10 },
  { code: "4.1", title: "โครงสร้างข้อความและความอ่านง่าย", max: 5 },
  { code: "4.2", title: "ความกระชับและความถูกต้องของภาษา", max: 5 },
  { code: "4.3", title: "น้ำเสียงและความเหมาะสมตามสถานการณ์", max: 10 },
];

const JUNE_CURRENT_TOPIC_MASTER = [
  { code: "1", title: "Process & Policy Compliance", max: 30 },
  { code: "2", title: "Answer Quality & Problem Analysis", max: 20 },
  { code: "3", title: "Case Handling & Follow-up", max: 25 },
  { code: "4", title: "Communication Skills", max: 25 },
];

type TopicMaster = { code: string; title: string; max: number };

type HeaderHelper = ReturnType<typeof buildHeaderHelper>;

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function compact(value: unknown) {
  return normalizeHeader(value).replace(/[^a-z0-9ก-๙]/g, "");
}

function normalizeCaseId(value: unknown) {
  return String(value ?? "").replace(/\s+/g, "").trim().toUpperCase();
}

function splitCaseIds(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return [];
  const matched = text.match(/[A-Za-z]{1,6}\d{3,}/g) || [];
  const values = matched.length ? matched : text.split(/[,;|\n]+/g);
  return [...new Set(values.map(normalizeCaseId).filter(Boolean))];
}

function buildHeaderHelper(header: unknown[]) {
  const indexes = new Map<string, number[]>();
  header.forEach((value, index) => {
    const key = normalizeHeader(value);
    if (!key) return;
    const current = indexes.get(key) || [];
    current.push(index);
    indexes.set(key, current);
  });
  return {
    getValue(row: unknown[], label: string, occurrence = 0) {
      const found = indexes.get(normalizeHeader(label)) || [];
      const index = found[occurrence];
      return typeof index === "number" ? row[index] : null;
    },
    getLastValue(row: unknown[], label: string) {
      const found = indexes.get(normalizeHeader(label)) || [];
      const index = found.length ? found[found.length - 1] : undefined;
      return typeof index === "number" ? row[index] : null;
    },
    getAny(row: unknown[], labels: string[]) {
      for (const label of labels) {
        const value = this.getValue(row, label);
        if (value !== null && value !== undefined && String(value).trim() !== "") return value;
      }
      return null;
    },
  };
}

function findHeaderIndex(rows: unknown[][]) {
  for (let index = 0; index < rows.length; index += 1) {
    const values = rows[index].map(normalizeHeader);
    if (values.includes("case id") && values.some((value) => value === "agent name" || value === "agent")) {
      return index;
    }
  }
  return -1;
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, parsed.S || 0);
  }
  const text = String(value ?? "").trim();
  if (!text) return null;
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (slash) {
    let year = Number(slash[3]);
    if (year > 2400) year -= 543;
    const date = new Date(year, Number(slash[2]) - 1, Number(slash[1]), Number(slash[4] || 0), Number(slash[5] || 0), Number(slash[6] || 0));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    let year = Number(iso[1]);
    if (year > 2400) year -= 543;
    const date = new Date(year, Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isoDate(value: unknown) {
  const date = parseDate(value);
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isoTimestamp(value: unknown) {
  const date = parseDate(value);
  return date ? date.toISOString() : "";
}

function monthKeyFromDate(value: unknown) {
  const date = parseDate(value);
  if (!date) return "unknown";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getTopicMaster(monthKey: string): readonly TopicMaster[] {
  if (monthKey === "2026-01" || monthKey === "2026-02") return JAN_FEB_TOPIC_MASTER;
  if (monthKey === "2026-03") return LEGACY_TOPIC_MASTER;
  if (monthKey === "2026-04" || monthKey === "2026-05") return APR_MAY_TOPIC_MASTER;
  if (monthKey !== "unknown" && monthKey >= "2026-06") return JUNE_CURRENT_TOPIC_MASTER;
  return LEGACY_TOPIC_MASTER;
}

function numeric(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getRawTimestamp(item: StoredEvaluation) {
  for (const value of [item.updatedAt, item.submittedAt, item.auditTimestamp, item.auditDate, item.createdAt]) {
    const date = parseDate(value);
    if (date) return date.getTime();
  }
  return 0;
}

function canonicalKey(item: StoredEvaluation) {
  return `${compact(canonicalizeAgentName(item.agentName || item.targetDisplayName))}::${normalizeCaseId(item.caseId || item.id)}`;
}

async function loadRawEvaluations() {
  const output: StoredEvaluation[] = [];

  for (const fileName of RAW_DATA_FILE_NAMES) {
    let response: Response | null = null;
    try {
      response = await fetchCachedStaticResponse(`/${fileName}`);
    } catch {
      response = null;
    }
    if (!response?.ok) continue;

    const workbook = XLSX.read(await response.arrayBuffer(), { type: "array", cellDates: true });
    const sheet = workbook.Sheets["Raw_Data"] || workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
    const headerIndex = findHeaderIndex(rows);
    if (headerIndex < 0) continue;
    const helper = buildHeaderHelper(rows[headerIndex] || []);

    rows.slice(headerIndex + 1).forEach((row, rowIndex) => {
      const caseId = String(helper.getAny(row, ["Case ID", "Case Id"]) || "").trim();
      const agentName = canonicalizeAgentName(helper.getAny(row, ["Agent Name", "Agent", "AgentName"]) || "");
      if (!caseId || !agentName) return;

      const caseDateRaw = helper.getAny(row, ["Case Date", "Audit Date", "Date"]);
      const auditTimestampRaw = helper.getAny(row, ["Audit Timestamp", "Timestamp", "Audit Date"]) || caseDateRaw;
      const monthKey = monthKeyFromDate(caseDateRaw || auditTimestampRaw);
      const master = getTopicMaster(monthKey);
      const topics: StoredEvaluationTopic[] = master.map((topic) => {
        const score = numeric(helper.getValue(row, `${topic.code} Score`));
        const comment = helper.getValue(row, `${topic.code} Comment`);
        return {
          code: topic.code,
          title: topic.title,
          max: topic.max,
          score: score ?? topic.max,
          comment: String(comment || "").trim(),
        };
      });
      const finalScoreValue = numeric(helper.getLastValue(row, "Final Score"));
      const calculatedScore = topics.reduce((sum, topic) => sum + Number(topic.score || 0), 0);
      const finalScore = finalScoreValue ?? calculatedScore;
      const team = String(helper.getAny(row, ["Team", "Team Name", "TeamName"]) || "").trim();
      const inquiry = String(helper.getAny(row, ["Customer Inquiry", "Inquiry TH", "Inquiry", "Intent"]) || "").trim();
      const caseDescription = String(helper.getAny(row, ["Case Description", "Case Detail", "Description"]) || "").trim();
      const auditDate = isoDate(caseDateRaw || auditTimestampRaw);
      const auditTimestamp = isoTimestamp(auditTimestampRaw || caseDateRaw);
      const id = `canonical-raw-${caseId}-${rowIndex + 1}`.replace(/[^a-zA-Z0-9_-]/g, "_");

      output.push({
        id,
        evaluationKey: id,
        evaluationType: "case",
        evaluationMonthKey: monthKey,
        caseId,
        agentName,
        targetUsername: "",
        targetDisplayName: agentName,
        targetEmail: "",
        targetRole: team,
        auditDate,
        auditTimestamp,
        waitingTime: "",
        serviceTime: "",
        caseUrl: "",
        inquiry,
        caseDescription,
        evidenceUrls: [],
        criticalError: normalizeHeader(helper.getAny(row, ["Critical Error", "Critical"])) === "yes",
        finalScore,
        grade: scoreToGrade(finalScore, monthKey),
        qaScheme: "Dashboard RawData",
        rubricName: "Dashboard Canonical Source",
        rubricPeriod: monthKey,
        completedTopics: topics.length,
        totalTopics: topics.length,
        strengths: topics.filter((topic) => topic.score >= topic.max).map((topic) => topic.title),
        improvements: topics.filter((topic) => topic.score < topic.max && topic.comment).map((topic) => topic.comment),
        topics,
        rawDataPreview: {
          Team: team,
          "Coaching Data Source": "Dashboard RawData",
          "Evaluation Month Key": monthKey,
        },
        evaluatorUsername: "",
        evaluatorName: String(helper.getAny(row, ["Evaluator", "QA Name", "Auditor"]) || "").trim(),
        submittedAt: auditTimestamp,
        createdAt: auditTimestamp,
        updatedAt: auditTimestamp,
      });
    });
  }

  return output;
}

function mergeRawAndStored(rawRows: StoredEvaluation[], storedRows: StoredEvaluation[]) {
  const map = new Map<string, StoredEvaluation>();
  rawRows.forEach((item) => map.set(canonicalKey(item), item));

  storedRows.forEach((item) => {
    const monthKey = getStoredEvaluationMonthKey(item) || monthKeyFromDate(item.auditDate || item.auditTimestamp);
    const normalized: StoredEvaluation = {
      ...item,
      evaluationMonthKey: monthKey || item.evaluationMonthKey,
      agentName: canonicalizeAgentName(item.agentName || item.targetDisplayName),
      targetDisplayName: canonicalizeAgentName(item.targetDisplayName || item.agentName),
      rawDataPreview: {
        ...(item.rawDataPreview || {}),
        "Coaching Data Source": "Case Detail",
        "Evaluation Month Key": monthKey || "",
      },
    };
    const key = canonicalKey(normalized);
    const existing = map.get(key);
    if (!existing || getRawTimestamp(normalized) >= getRawTimestamp(existing) || String(existing.rawDataPreview?.["Coaching Data Source"]) === "Dashboard RawData") {
      map.set(key, normalized);
    }
  });

  return [...map.values()];
}

function getAppealVersionRank(value: unknown) {
  const parsed = Number(String(value ?? "").match(/\d+(?:\.\d+)?/)?.[0] || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getAppealTimestampRank(helper: HeaderHelper, row: unknown[]) {
  const raw = helper.getAny(row, ["Reviewed At", "Updated At", "Timestamp", "Audit Timestamp", "Created At", "Created Date"]);
  return parseDate(raw)?.getTime() ?? -1;
}

function getLatestAppealRows(rows: unknown[][], helper: HeaderHelper) {
  const latest = new Map<string, { row: unknown[]; index: number; versionRank: number; timestampRank: number }>();
  rows.forEach((row, index) => {
    const ids = splitCaseIds(helper.getValue(row, "Case ID"));
    ids.forEach((caseId) => {
      const candidate = {
        row,
        index,
        versionRank: Math.max(
          getAppealVersionRank(helper.getValue(row, "Appeal Version")),
          getAppealVersionRank(helper.getValue(row, "Version"))
        ),
        timestampRank: getAppealTimestampRank(helper, row),
      };
      const current = latest.get(caseId);
      if (!current || candidate.versionRank > current.versionRank ||
        (candidate.versionRank === current.versionRank && candidate.timestampRank > current.timestampRank) ||
        (candidate.versionRank === current.versionRank && candidate.timestampRank === current.timestampRank && candidate.index > current.index)) {
        latest.set(caseId, candidate);
      }
    });
  });
  return latest;
}

async function loadAppealExcelMap() {
  for (const fileName of APPEAL_FILE_NAMES) {
    try {
      const response = await fetchCachedStaticResponse(fileName);
      if (!response.ok) continue;
      const workbook = XLSX.read(await response.arrayBuffer(), { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) continue;
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
      const headerIndex = rows.findIndex((row) => row.map(normalizeHeader).includes("case id"));
      if (headerIndex < 0) continue;
      const helper = buildHeaderHelper(rows[headerIndex] || []);
      return { helper, rows: getLatestAppealRows(rows.slice(headerIndex + 1), helper) };
    } catch {
      // Try the next accepted filename.
    }
  }
  return null;
}

function applyExcelAppeals(rows: StoredEvaluation[], appealData: Awaited<ReturnType<typeof loadAppealExcelMap>>) {
  if (!appealData) return { rows, excelCaseIds: new Set<string>() };
  const excelCaseIds = new Set<string>();
  const nextRows = rows.map((item) => {
    const caseId = normalizeCaseId(item.caseId);
    const match = appealData.rows.get(caseId);
    if (!match) return item;
    excelCaseIds.add(caseId);

    const monthKey = item.evaluationMonthKey || getStoredEvaluationMonthKey(item) || monthKeyFromDate(item.auditDate || item.auditTimestamp);
    const master = getTopicMaster(monthKey);
    const baseMap = new Map((item.topics || []).map((topic) => [String(topic.code), topic]));
    const topics: StoredEvaluationTopic[] = master.map((topic) => {
      const base = baseMap.get(topic.code);
      const originalScore = numeric(appealData.helper.getValue(match.row, `${topic.code} Score`));
      const revisedScore = numeric(appealData.helper.getValue(match.row, `${topic.code} Revised Score`));
      const revisedComment = appealData.helper.getValue(match.row, `${topic.code} Revised Comment`);
      const originalComment = appealData.helper.getValue(match.row, `${topic.code} Comment`);
      return {
        code: topic.code,
        title: base?.title || topic.title,
        max: topic.max,
        score: revisedScore ?? originalScore ?? Number(base?.score ?? topic.max),
        comment: String(revisedComment || originalComment || base?.comment || "").trim(),
      };
    });
    const explicitFinal = numeric(appealData.helper.getLastValue(match.row, "Final Score"));
    const finalScore = explicitFinal ?? topics.reduce((sum, topic) => sum + Number(topic.score || 0), 0);
    return {
      ...item,
      evaluationMonthKey: monthKey,
      finalScore,
      grade: scoreToGrade(finalScore, monthKey),
      topics,
      improvements: topics.filter((topic) => topic.score < topic.max && topic.comment).map((topic) => topic.comment),
      strengths: topics.filter((topic) => topic.score >= topic.max).map((topic) => topic.title),
      rawDataPreview: {
        ...(item.rawDataPreview || {}),
        "Coaching Data Source": "Dashboard + Appeal ROWDATA",
        "Appeal Source": "Appeal ROWDATA",
      },
    };
  });
  return { rows: nextRows, excelCaseIds };
}

async function applyFirebaseAppeals(rows: StoredEvaluation[], excelCaseIds: Set<string>) {
  let logs: any[] = [];
  try {
    logs = await fetchAppealEvents(
      ["appeal_request_submitted", "appeal_request_reviewed", "appeal_request_reset"],
      { limit: 2000, forceRefresh: true }
    );
  } catch {
    return rows;
  }

  const latest = new Map<string, any>();
  buildAppealRequests(logs as any)
    .slice()
    .sort((a, b) => new Date(a.reviewedAt || a.submittedAt || "").getTime() - new Date(b.reviewedAt || b.submittedAt || "").getTime())
    .forEach((request) => {
      splitCaseIds(request.caseId).forEach((caseId) => latest.set(caseId, request));
    });

  return rows.map((item) => {
    const caseId = normalizeCaseId(item.caseId);
    if (!caseId || excelCaseIds.has(caseId)) return item;
    const request = latest.get(caseId);
    if (!request || request.status !== "Approved") return item;

    const monthKey = item.evaluationMonthKey || getStoredEvaluationMonthKey(item) || monthKeyFromDate(item.auditDate || item.auditTimestamp);
    const master = getTopicMaster(monthKey);
    const revisedByCode = new Map<string, { score: number; comment: string }>();
    let delta = 0;

    (Array.isArray(request.topics) ? request.topics : []).forEach((topic: any) => {
      const originalScore = numeric(topic?.score) ?? 0;
      const revisedScore = numeric(topic?.revisedScore);
      const changed = revisedScore !== null || String(topic?.revisedComment || "").trim() !== "";
      if (!changed) return;
      const effectiveScore = revisedScore ?? originalScore;
      delta += effectiveScore - originalScore;
      revisedByCode.set(String(topic.code || ""), {
        score: effectiveScore,
        comment: String(topic.revisedComment || topic.comment || "").trim(),
      });
    });

    if (!revisedByCode.size) return item;
    const baseMap = new Map((item.topics || []).map((topic) => [String(topic.code), topic]));
    const topics: StoredEvaluationTopic[] = master.map((topic) => {
      const base = baseMap.get(topic.code);
      const revised = revisedByCode.get(topic.code);
      return {
        code: topic.code,
        title: base?.title || topic.title,
        max: topic.max,
        score: revised?.score ?? Number(base?.score ?? topic.max),
        comment: revised?.comment || base?.comment || "",
      };
    });
    const originalFinalScore = numeric(request.finalScore) ?? Number(item.finalScore || 0);
    const finalScore = Number((originalFinalScore + delta).toFixed(2));
    return {
      ...item,
      evaluationMonthKey: monthKey,
      finalScore,
      grade: scoreToGrade(finalScore, monthKey),
      topics,
      improvements: topics.filter((topic) => topic.score < topic.max && topic.comment).map((topic) => topic.comment),
      strengths: topics.filter((topic) => topic.score >= topic.max).map((topic) => topic.title),
      rawDataPreview: {
        ...(item.rawDataPreview || {}),
        "Coaching Data Source": "Dashboard + Approved Appeal",
        "Appeal Source": "Firebase Approved",
      },
    };
  });
}

export async function fetchCanonicalCoachingEvaluations() {
  const [rawRows, storedRows] = await Promise.all([
    loadRawEvaluations().catch(() => []),
    fetchStoredEvaluations(1000).catch(() => []),
  ]);

  const realStoredRows = excludeTestEvaluations(storedRows).filter((item) => !isNoCaseEvaluation(item));
  const merged = mergeRawAndStored(rawRows, realStoredRows);
  const excelApplied = applyExcelAppeals(merged, await loadAppealExcelMap());
  const appealed = await applyFirebaseAppeals(excelApplied.rows, excelApplied.excelCaseIds);

  return appealed
    .filter((item) => !isNoCaseEvaluation(item))
    .sort((a, b) => {
      const monthCompare = String(b.evaluationMonthKey || getStoredEvaluationMonthKey(b)).localeCompare(
        String(a.evaluationMonthKey || getStoredEvaluationMonthKey(a))
      );
      if (monthCompare !== 0) return monthCompare;
      return getRawTimestamp(b) - getRawTimestamp(a);
    });
}
