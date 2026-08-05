import * as XLSX from "xlsx";
import type { StoredEvaluation, StoredEvaluationTopic } from "./evaluationStore";

const HISTORICAL_FILE_GROUPS = [
  ["/QA_RawData_January-February2026.xlsx"],
  ["/QA_RawData_March-May2026.xlsx", "/QA_RawData_March-May2026 (1).xlsx"],
];

export type CoachingTopicSchemaItem = {
  code: string;
  title: string;
  max: number;
};

const JAN_FEB_TOPICS: CoachingTopicSchemaItem[] = [
  { code: "1", title: "เปิด-ปิดการสนทนา", max: 10 },
  { code: "2", title: "วิเคราะห์/แก้ไข", max: 30 },
  { code: "3", title: "ปฏิบัติตามขั้นตอน", max: 20 },
  { code: "4", title: "ความสุภาพ", max: 10 },
  { code: "5", title: "ภาษา", max: 20 },
  { code: "6", title: "ระยะเวลา", max: 10 },
];

const MARCH_TOPICS: CoachingTopicSchemaItem[] = [
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

const APRIL_MAY_TOPICS: CoachingTopicSchemaItem[] = [
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

const JUNE_CURRENT_TOPICS: CoachingTopicSchemaItem[] = [
  { code: "1", title: "ขั้นตอนการทำงานและนโยบาย (Process & Policy Compliance)", max: 30 },
  { code: "2", title: "คุณภาพคำตอบและการวิเคราะห์ปัญหา (Answer Quality & Problem Analysis)", max: 20 },
  { code: "3", title: "การดูแลเคสและติดตามผล (Case Handling & Follow-up)", max: 25 },
  { code: "4", title: "ทักษะการสื่อสาร (Communication Skills)", max: 25 },
];

export function getCoachingTopicSchema(monthKey: string) {
  if (monthKey === "2026-01" || monthKey === "2026-02") return JAN_FEB_TOPICS;
  if (monthKey === "2026-03") return MARCH_TOPICS;
  if (monthKey === "2026-04" || monthKey === "2026-05") return APRIL_MAY_TOPICS;
  return JUNE_CURRENT_TOPICS;
}

export function getCoachingRubricLabel(monthKey: string) {
  if (monthKey === "2026-01" || monthKey === "2026-02") return "January–February 2026 criteria";
  if (monthKey === "2026-03") return "March 2026 criteria";
  if (monthKey === "2026-04" || monthKey === "2026-05") return "April–May 2026 criteria";
  return "June 2026–Current criteria";
}

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
  const text = String(value ?? "").trim();
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

function isoDate(value: unknown) {
  const date = parseDate(value);
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isoTimestamp(value: unknown) {
  const date = parseDate(value);
  return date ? date.toISOString() : "";
}

function monthKeyFromLabel(value: unknown) {
  const text = String(value || "").trim();
  const direct = text.match(/^(\d{4})-(\d{2})/);
  if (direct) return `${direct[1]}-${direct[2]}`;
  const parsed = new Date(`1 ${text}`);
  if (text && !Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
  }
  return "";
}

function monthKeyFromDate(value: unknown) {
  const date = parseDate(value);
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
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

function findHeaderIndex(rows: unknown[][]) {
  return rows.findIndex((row) => {
    const values = row.map(normalize);
    return values.includes("agent name") && values.includes("case id");
  });
}

async function fetchHistoricalWorkbooks() {
  const workbooks: Array<{ workbook: XLSX.WorkBook; source: string }> = [];
  for (const candidates of HISTORICAL_FILE_GROUPS) {
    for (const file of candidates) {
      try {
        const response = await fetch(file, { cache: "no-store" });
        if (!response.ok) continue;
        const buffer = await response.arrayBuffer();
        workbooks.push({ workbook: XLSX.read(buffer, { type: "array", cellDates: true }), source: file });
        break;
      } catch {
        // Try the next known alias in this file group.
      }
    }
  }
  return workbooks;
}

function parseWorkbook(workbook: XLSX.WorkBook, source: string) {
  const sheet = workbook.Sheets.Raw_Data || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
  const headerIndex = findHeaderIndex(rows);
  if (headerIndex < 0) return [];
  const helper = headerMap(rows[headerIndex] || []);

  return rows
    .slice(headerIndex + 1)
    .map((row, rowIndex): StoredEvaluation | null => {
      const caseId = String(helper.getAny(row, ["Case ID", "Case Id"]) || "").trim();
      const agentName = String(helper.getAny(row, ["Agent Name", "Agent", "AgentName"]) || "").trim();
      if (!caseId || !agentName) return null;

      const auditDateRaw = helper.getAny(row, ["Audit Date", "Case Date", "Timestamp"]);
      const monthKey =
        monthKeyFromLabel(helper.getAny(row, ["Evaluation Month Key", "Month Label"])) ||
        monthKeyFromDate(helper.getAny(row, ["Month Start"])) ||
        monthKeyFromDate(auditDateRaw);
      const schema = getCoachingTopicSchema(monthKey);
      const topics = schema
        .map((topic): StoredEvaluationTopic | null => {
          const scoreRaw = helper.getAny(row, [`${topic.code} Score`, `${topic.code} score`]);
          if (!hasValue(scoreRaw) || Number.isNaN(Number(scoreRaw))) return null;
          return {
            code: topic.code,
            title: topic.title,
            max: topic.max,
            score: Number(scoreRaw),
            comment: String(helper.getAny(row, [`${topic.code} Comment`, `${topic.code} comment`]) || "").trim(),
          };
        })
        .filter((topic): topic is StoredEvaluationTopic => Boolean(topic));
      if (!topics.length) return null;

      const calculatedScore = topics.reduce((sum, topic) => sum + Number(topic.score || 0), 0);
      const finalScoreRaw = helper.getLast(row, "Final Score") ?? helper.getAny(row, ["Total Score", "Score"]);
      const finalScore = hasValue(finalScoreRaw) && !Number.isNaN(Number(finalScoreRaw)) ? Number(finalScoreRaw) : calculatedScore;
      const inquiry = String(helper.getAny(row, ["Customer Inquiry", "Inquiry TH", "Inquiry", "Intent"]) || "").trim();
      const caseDescription = String(helper.getAny(row, ["Case Description / รายละเอียดเคส คำอธิบายเคส", "Case Description", "Case Detail", "Description"]) || "").trim();
      const team = String(helper.getAny(row, ["Team", "Team Name", "TeamName"]) || "").trim();
      const auditDate = isoDate(auditDateRaw);
      const auditTimestamp = isoTimestamp(auditDateRaw);
      const id = `historical-${monthKey}-${caseId}-${rowIndex + 1}`.replace(/[^a-zA-Z0-9_-]/g, "_");
      const criticalText = normalize(helper.getAny(row, ["Critical Error", "Critical", "Critical Flag"]));

      return {
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
        waitingTime: String(helper.getAny(row, ["Waiting Time"]) || ""),
        serviceTime: String(helper.getAny(row, ["Service Time"]) || ""),
        caseUrl: String(helper.getAny(row, ["Case URL"]) || ""),
        inquiry,
        caseDescription,
        evidenceUrls: [],
        criticalError: ["yes", "true", "1", "critical"].includes(criticalText),
        finalScore: Number(finalScore.toFixed(2)),
        grade: "",
        qaScheme: String(helper.getAny(row, ["QA Scheme"]) || getCoachingRubricLabel(monthKey)),
        rubricName: getCoachingRubricLabel(monthKey),
        rubricPeriod: monthKey,
        completedTopics: topics.length,
        totalTopics: schema.length,
        strengths: topics.filter((topic) => topic.score >= topic.max).map((topic) => topic.title).slice(0, 6),
        improvements: topics.filter((topic) => topic.score < topic.max && topic.comment).map((topic) => topic.comment).slice(0, 12),
        topics,
        rawDataPreview: {
          Team: team,
          "Evaluation Month Key": monthKey,
          "Coaching Data Source": "Historical Data",
          "Coaching Source File": source,
          "Coaching Rubric": getCoachingRubricLabel(monthKey),
        },
        evaluatorUsername: "",
        evaluatorName: String(helper.getAny(row, ["Evaluator", "QA Name", "Auditor"]) || "").trim(),
        submittedAt: auditTimestamp,
        createdAt: auditTimestamp,
        updatedAt: auditTimestamp,
      };
    })
    .filter((item): item is StoredEvaluation => Boolean(item));
}

export async function fetchHistoricalCoachingEvaluations(): Promise<StoredEvaluation[]> {
  const workbooks = await fetchHistoricalWorkbooks();
  return workbooks.flatMap(({ workbook, source }) => parseWorkbook(workbook, source));
}
