import * as XLSX from "xlsx";
import type { StoredEvaluation, StoredEvaluationTopic } from "./evaluationStore";

const HISTORICAL_FILES = [
  "/QA_RawData_March-May2026.xlsx",
  "/QA_RawData_March-May2026 (1).xlsx",
];

const LEGACY_TOPICS = [
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

function normalize(value: unknown) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(
      parsed.y,
      parsed.m - 1,
      parsed.d,
      parsed.H || 0,
      parsed.M || 0,
      parsed.S || 0
    );
  }

  const text = String(value ?? "").trim();
  if (!text) return null;

  const slash = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (slash) {
    let year = Number(slash[3]);
    if (year > 2400) year -= 543;
    const date = new Date(
      year,
      Number(slash[2]) - 1,
      Number(slash[1]),
      Number(slash[4] || 0),
      Number(slash[5] || 0),
      Number(slash[6] || 0)
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isoDate(value: unknown) {
  const date = parseDate(value);
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function isoTimestamp(value: unknown) {
  const date = parseDate(value);
  return date ? date.toISOString() : "";
}

function headerMap(header: unknown[]) {
  const map = new Map<string, number[]>();
  header.forEach((value, index) => {
    const key = normalize(value);
    if (!key) return;
    const existing = map.get(key) || [];
    existing.push(index);
    map.set(key, existing);
  });

  const get = (row: unknown[], label: string, occurrence = 0) => {
    const indexes = map.get(normalize(label)) || [];
    const index = indexes[occurrence];
    return typeof index === "number" ? row[index] : null;
  };

  const getAny = (row: unknown[], labels: string[]) => {
    for (const label of labels) {
      const value = get(row, label);
      if (value !== null && value !== undefined && String(value).trim() !== "") {
        return value;
      }
    }
    return null;
  };

  return { get, getAny };
}

function findHeaderIndex(rows: unknown[][]) {
  for (let index = 0; index < rows.length; index += 1) {
    const values = rows[index].map(normalize);
    if (values.includes("agent name") && values.includes("case id")) return index;
  }
  return -1;
}

async function fetchFirstHistoricalWorkbook() {
  for (const file of HISTORICAL_FILES) {
    try {
      const response = await fetch(file, { cache: "no-store" });
      if (!response.ok) continue;
      const buffer = await response.arrayBuffer();
      return XLSX.read(buffer, { type: "array", cellDates: true });
    } catch {
      // Try the next known historical file name.
    }
  }
  return null;
}

export async function fetchHistoricalCoachingEvaluations(): Promise<
  StoredEvaluation[]
> {
  const workbook = await fetchFirstHistoricalWorkbook();
  if (!workbook) return [];

  const sheet =
    workbook.Sheets["Raw_Data"] ||
    workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });

  const headerIndex = findHeaderIndex(rows);
  if (headerIndex < 0) return [];

  const helper = headerMap(rows[headerIndex] || []);
  const dataRows = rows.slice(headerIndex + 1);

  return dataRows
    .map((row, rowIndex): StoredEvaluation | null => {
      const caseId = String(helper.getAny(row, ["Case ID", "Case Id"]) || "").trim();
      const agentName = String(
        helper.getAny(row, ["Agent Name", "Agent", "AgentName"]) || ""
      ).trim();

      if (!caseId || !agentName) return null;

      const topics: StoredEvaluationTopic[] = LEGACY_TOPICS.map((topic) => {
        const scoreRaw = helper.getAny(row, [
          `${topic.code} Score`,
          `${topic.code} score`,
        ]);
        const commentRaw = helper.getAny(row, [
          `${topic.code} Comment`,
          `${topic.code} comment`,
        ]);

        const score = Number(scoreRaw);
        return {
          code: topic.code,
          title: topic.title,
          max: topic.max,
          score: Number.isFinite(score) ? score : topic.max,
          comment: String(commentRaw || "").trim(),
        };
      });

      const finalScoreRaw = helper.getAny(row, [
        "Final Score",
        "Total Score",
        "Score",
      ]);
      const calculatedScore = topics.reduce(
        (sum, topic) => sum + Number(topic.score || 0),
        0
      );
      const finalScore = Number(finalScoreRaw);

      const auditDateRaw = helper.getAny(row, [
        "Audit Date",
        "Case Date",
        "Timestamp",
      ]);
      const inquiry = String(
        helper.getAny(row, [
          "Customer Inquiry",
          "Inquiry TH",
          "Inquiry",
          "Intent",
        ]) || ""
      ).trim();
      const caseDescription = String(
        helper.getAny(row, [
          "Case Description",
          "Case Detail",
          "Description",
        ]) || ""
      ).trim();
      const team = String(
        helper.getAny(row, ["Team", "Team Name", "TeamName"]) || ""
      ).trim();

      const improvements = topics
        .filter((topic) => topic.score < topic.max && topic.comment)
        .map((topic) => topic.comment)
        .slice(0, 12);
      const strengths = topics
        .filter((topic) => topic.score >= topic.max)
        .map((topic) => topic.title)
        .slice(0, 6);

      const id = `historical-${caseId}-${rowIndex + 1}`.replace(
        /[^a-zA-Z0-9_-]/g,
        "_"
      );
      const auditDate = isoDate(auditDateRaw);
      const auditTimestamp = isoTimestamp(auditDateRaw);

      return {
        id,
        evaluationKey: id,
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
        criticalError:
          normalize(helper.getAny(row, ["Critical Error", "Critical"])) ===
          "yes",
        finalScore: Number.isFinite(finalScore) ? finalScore : calculatedScore,
        grade: "",
        qaScheme: "Historical QA",
        rubricName: "Historical QA Criteria",
        rubricPeriod: "",
        completedTopics: topics.length,
        totalTopics: topics.length,
        strengths,
        improvements,
        topics,
        rawDataPreview: {
          Team: team,
          "Coaching Data Source": "Historical Data",
        },
        evaluatorUsername: "",
        evaluatorName: String(
          helper.getAny(row, ["Evaluator", "QA Name", "Auditor"]) || ""
        ).trim(),
        submittedAt: auditTimestamp,
        createdAt: auditTimestamp,
        updatedAt: auditTimestamp,
      };
    })
    .filter((item): item is StoredEvaluation => Boolean(item));
}
