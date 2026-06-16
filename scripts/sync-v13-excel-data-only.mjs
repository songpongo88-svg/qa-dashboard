import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import { initializeApp, getApps } from "firebase/app";
import { collection, getDocs, getFirestore, limit, orderBy, query } from "firebase/firestore/lite";

const TARGET_WORKBOOK =
  process.env.QA_V13_WORKBOOK ||
  "C:\\Users\\Songpon\\OneDrive - Purple Ventures\\Report QA\\ROWDATA\\QA_Score_Dashboard_byDao_V13.xlsx";
const HEADER_ROW_INDEX = 3;
const DATA_START_ROW_INDEX = 4;
const MAX_FETCH = Number(process.env.QA_SYNC_FETCH_LIMIT || 2000);
const DRY_RUN = process.argv.includes("--dry-run") || process.env.QA_V13_DRY_RUN === "1";

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyBn03smavKzc0l761okJQqCSyT0Wq022DQ",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "qa-dashboard-b0b5d.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "qa-dashboard-b0b5d",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "qa-dashboard-b0b5d.firebasestorage.app",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "441715183213",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:441715183213:web:4e00da66b84546ff03964",
};

const NO_APPEAL_TEXT = "ไม่อุทธรณ์หัวข้อนี้";

function normalizeKey(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeHeader(value) {
  return String(value || "").trim();
}

function toArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "")).filter(Boolean);
  if (!value) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item || "")).filter(Boolean);
    } catch {
      return value.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function toTopics(value) {
  if (!value) return [];
  const raw = typeof value === "string" ? JSON.parse(value || "[]") : value;
  return Array.isArray(raw)
    ? raw
        .map((item) => ({
          code: String(item?.code || ""),
          score: item?.score ?? "",
          max: item?.max ?? "",
          comment: String(item?.comment || item?.reason || ""),
          wantsAppeal: item?.wantsAppeal === true,
          appealReason: String(item?.appealReason || ""),
          revisedScore: item?.revisedScore ?? "",
          revisedComment: String(item?.revisedComment || ""),
        }))
        .filter((item) => item.code)
    : [];
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function excelDateSerialFromDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return date.getTime() / 86400000 + 25569;
}

function excelDateSerialFromParts(year, month, day) {
  return Date.UTC(year, month - 1, day) / 86400000 + 25569;
}

function parseDateOnly(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (match) {
    return excelDateSerialFromParts(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+.*)?$/);
  if (match) {
    let year = Number(match[3]);
    if (year < 100) year += 2500;
    if (year > 2400) year -= 543;
    return excelDateSerialFromParts(year, Number(match[2]), Number(match[1]));
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return value;
  return excelDateSerialFromParts(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
}

function parseDateTime(value) {
  return parseDateOnly(value);
}

function parseTimeSerial(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return value || "";
  return (Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] || 0)) / 86400;
}

function appealFinalScoreFromTopics(topics) {
  return topics.reduce((sum, topic) => {
    const revisedScore = toNumber(topic.revisedScore, Number.NaN);
    return sum + (Number.isNaN(revisedScore) ? toNumber(topic.score) : revisedScore);
  }, 0);
}

function gradeFromScore(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function normalizeEvaluation(row, fallbackId = "") {
  return {
    id: String(row.id || fallbackId || ""),
    caseId: String(row.case_id || row.caseId || ""),
    agentName: String(row.agent_name || row.agentName || row.target_display_name || ""),
    auditDate: String(row.audit_date || row.auditDate || ""),
    waitingTime: String(row.waiting_time || row.waitingTime || ""),
    serviceTime: String(row.service_time || row.serviceTime || ""),
    caseUrl: String(row.case_url || row.caseUrl || ""),
    inquiry: String(row.inquiry || ""),
    caseDescription: String(row.case_description || row.caseDescription || ""),
    evidenceUrls: toArray(row.evidence_urls || row.evidenceUrls),
    criticalError: row.critical_error === true || row.criticalError === true,
    finalScore: Number(row.final_score || row.finalScore || 0),
    grade: String(row.grade || ""),
    qaScheme: String(row.qa_scheme || row.qaScheme || ""),
    submittedAt: String(row.submitted_at || row.submittedAt || row.created_at || ""),
    topics: toTopics(row.topics),
    rawDataPreview: row.raw_data_preview || row.rawDataPreview || {},
  };
}

function getRequestId(log) {
  return String(log.details?.requestId || log.id || "");
}

function normalizeAppealEvent(id, row) {
  return {
    id,
    created_at: String(row.created_at || row.createdAt || ""),
    event_type: String(row.event_type || row.eventType || ""),
    display_name: String(row.display_name || row.displayName || ""),
    case_id: String(row.case_id || row.caseId || row.details?.caseId || ""),
    target_agent: String(row.target_agent || row.targetAgent || row.details?.agent || ""),
    details: row.details && typeof row.details === "object" ? row.details : {},
  };
}

function buildAppealRequests(logs) {
  const reviews = new Map();
  const resets = new Map();
  logs.forEach((log) => {
    const requestId = getRequestId(log);
    if (log.event_type === "appeal_request_reviewed" && requestId && !reviews.has(requestId)) reviews.set(requestId, log);
    if (log.event_type === "appeal_request_reset" && requestId && !resets.has(requestId)) resets.set(requestId, log);
  });

  return logs
    .filter((log) => log.event_type === "appeal_request_submitted")
    .map((log) => {
      const requestId = getRequestId(log);
      const review = reviews.get(requestId);
      const reset = resets.get(requestId);
      const reviewTopics = Array.isArray(review?.details?.topics) ? review.details.topics : null;
      const baseTopics = Array.isArray(log.details?.topics) ? log.details.topics : [];
      const submittedAtTime = new Date(log.created_at || String(log.details?.submittedAt || "")).getTime();
      const reviewedAtTime = new Date(review?.created_at || String(review?.details?.reviewedAt || "")).getTime();
      const resetAtTime = new Date(reset?.created_at || String(reset?.details?.resetAt || "")).getTime();
      const isResetAfterSubmit =
        Boolean(reset) &&
        !Number.isNaN(resetAtTime) &&
        (Number.isNaN(submittedAtTime) || resetAtTime > submittedAtTime) &&
        (Number.isNaN(reviewedAtTime) || resetAtTime > reviewedAtTime);
      const status = isResetAfterSubmit ? "Reset" : review?.details?.decision === "Rejected" ? "Rejected" : review ? "Approved" : "Pending";

      return {
        requestId,
        caseId: String(log.case_id || log.details?.caseId || ""),
        agent: String(log.target_agent || log.details?.agent || ""),
        auditDate: String(log.details?.auditDate || ""),
        submittedAt: String(log.details?.submittedAt || log.created_at || ""),
        reviewedAt: String(review?.details?.reviewedAt || review?.created_at || ""),
        finalScore: toNumber(log.details?.finalScore),
        grade: String(log.details?.grade || ""),
        inquiry: String(log.details?.inquiry || ""),
        caseDescription: String(log.details?.caseDescription || ""),
        caseUrl: String(log.details?.caseUrl || ""),
        rawDataSourceName: String(log.details?.rawDataSourceName || ""),
        status,
        reviewSummary: String(review?.details?.reviewSummary || ""),
        topics: toTopics(reviewTopics || baseTopics),
      };
    });
}

async function fetchCollectionRows(collectionName, orderField) {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const snapshot = await getDocs(query(collection(db, collectionName), orderBy(orderField, "desc"), limit(MAX_FETCH)));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

async function fetchEvaluations() {
  const rows = await fetchCollectionRows("qa_evaluations", "submitted_at");
  return rows.map((item) => normalizeEvaluation(item, item.id)).filter((item) => normalizeKey(item.caseId));
}

async function fetchAppealRequests() {
  const rows = await fetchCollectionRows("qa_appeal_events", "created_at");
  const logs = rows
    .map((item) => normalizeAppealEvent(item.id, item))
    .filter((item) => ["appeal_request_submitted", "appeal_request_reviewed", "appeal_request_reset"].includes(item.event_type));
  return buildAppealRequests(logs).filter((item) => item.status === "Approved" || item.status === "Rejected");
}

function parseSheet(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
  const headers = (rows[HEADER_ROW_INDEX] || []).map(normalizeHeader);
  return { sheet, rows, headers };
}

function existingKeys(rows, columnIndex) {
  return new Set(rows.slice(DATA_START_ROW_INDEX).map((row) => normalizeKey(row?.[columnIndex])).filter(Boolean));
}

function buildRawExcelRecordMap(rows, headers) {
  const caseIdColumn = headers.findIndex((header) => header === "Case ID");
  if (caseIdColumn < 0) return new Map();
  return new Map(
    rows
      .slice(DATA_START_ROW_INDEX)
      .map((row) => {
        const record = Object.fromEntries(headers.map((header, index) => [header, row?.[index] ?? ""]));
        return [normalizeKey(row?.[caseIdColumn]), record];
      })
      .filter(([caseId]) => caseId)
  );
}

function rawValueForHeader(header, record) {
  const preview = record.rawDataPreview || {};
  if (preview[header] !== undefined && preview[header] !== null && preview[header] !== "") return preview[header];
  const topic = record.topics.find((item) => header === `${item.code} Score` || header === `${item.code} Comment`);
  if (topic) return header.endsWith(" Score") ? topic.score : topic.comment;

  const map = {
    "Audit Date": parseDateOnly(preview["Audit Date"] || record.auditDate || record.submittedAt),
    "Agent Name": record.agentName,
    "Case Date": parseDateOnly(preview["Case Date"] || preview["Audit Date"] || record.auditDate || ""),
    "Waiting Time": parseTimeSerial(record.waitingTime),
    "Service Time": parseTimeSerial(record.serviceTime),
    "Case ID": record.caseId,
    "Case URL": record.caseUrl,
    "Critical Error": record.criticalError ? "YES" : "NO",
    "Customer Inquiry": record.inquiry,
    "Final Score Input": record.finalScore || "",
    "Final Score": record.finalScore || "",
    "QA Scheme": record.qaScheme,
  };
  if (map[header] !== undefined) return map[header];
  if (header.startsWith("Case Description")) return record.caseDescription;
  if (header.startsWith("Case Image URL")) return record.evidenceUrls.join("\n");
  return "";
}

function appealRoundByCase(requests) {
  const grouped = new Map();
  [...requests]
    .sort((a, b) => new Date(a.reviewedAt || a.submittedAt || 0) - new Date(b.reviewedAt || b.submittedAt || 0))
    .forEach((item) => {
      const key = normalizeKey(item.caseId);
      const next = (grouped.get(key) || 0) + 1;
      grouped.set(key, next);
      item.appealRound = next;
    });
}

function appealValueForHeader(header, request, original) {
  const round = request.appealRound || 1;
  const version = `REV${round}`;
  const topic = request.topics.find((item) =>
    header === `${item.code} Score` ||
    header === `${item.code} Comment` ||
    header === `${item.code} Revised Score` ||
    header === `${item.code} Revised Comment` ||
    header === `${item.code} Appeal Reason`
  );
  if (topic) {
    if (header.endsWith(" Revised Score")) return request.status === "Approved" ? topic.revisedScore || topic.score || "" : topic.score || "";
    if (header.endsWith(" Revised Comment")) return request.status === "Approved" ? topic.revisedComment || "" : "";
    if (header.endsWith(" Appeal Reason")) return topic.wantsAppeal ? topic.appealReason || "" : NO_APPEAL_TEXT;
    if (header.endsWith(" Score")) return topic.score || "";
    if (header.endsWith(" Comment")) return topic.comment || "";
  }

  const originalFinalScore = original?.finalScore || request.finalScore || "";
  const revisedFinalScore = request.status === "Approved" ? appealFinalScoreFromTopics(request.topics) : request.finalScore;
  const finalScore = revisedFinalScore || originalFinalScore;
  const grade = request.status === "Approved" ? gradeFromScore(finalScore) : request.grade || original?.grade || "";
  const changed = request.status === "Approved" && Number(finalScore) !== Number(originalFinalScore);

  const map = {
    "Audit Date": original?.rawDataPreview?.["Audit Date"]
      ? parseDateOnly(original.rawDataPreview["Audit Date"])
      : original?.auditDate
        ? parseDateOnly(original.auditDate)
        : original?.["Audit Date"] || parseDateOnly(request.auditDate || request.reviewedAt || request.submittedAt),
    "Agent Name": original?.agentName || original?.["Agent Name"] || request.agent,
    "Case Date": original?.rawDataPreview?.["Case Date"] ? parseDateOnly(original.rawDataPreview["Case Date"]) : original?.["Case Date"] || parseDateOnly(original?.rawDataPreview?.["Audit Date"] || original?.auditDate || request.auditDate),
    "Waiting Time": original?.waitingTime ? parseTimeSerial(original.waitingTime) : original?.["Waiting Time"] || "",
    "Service Time": original?.serviceTime ? parseTimeSerial(original.serviceTime) : original?.["Service Time"] || "",
    "Case ID": request.caseId,
    "Case URL": original?.caseUrl || original?.["Case URL"] || request.caseUrl,
    "Critical Error": original?.criticalError ? "YES" : "NO",
    "Customer Inquiry": original?.inquiry || original?.["Customer Inquiry"] || request.inquiry,
    "Final Score": finalScore,
    "Month Start": original?.rawDataPreview?.["Month Start"] || original?.["Month Start"] || "",
    "Month Label": original?.rawDataPreview?.["Month Label"] || original?.["Month Label"] || "",
    "Week Start": original?.rawDataPreview?.["Week Start"] || original?.["Week Start"] || "",
    "Week End": original?.rawDataPreview?.["Week End"] || original?.["Week End"] || "",
    "Week Label": original?.rawDataPreview?.["Week Label"] || original?.["Week Label"] || "",
    "Agent Month Seq": original?.rawDataPreview?.["Agent Month Seq"] || original?.["Agent Month Seq"] || "",
    "Agent Week Seq": original?.rawDataPreview?.["Agent Week Seq"] || original?.["Agent Week Seq"] || "",
    "Month Key": original?.rawDataPreview?.["Month Key"] || original?.["Month Key"] || "",
    "Week Key": original?.rawDataPreview?.["Week Key"] || original?.["Week Key"] || "",
    "Critical Flag": original?.rawDataPreview?.["Critical Flag"] || original?.["Critical Flag"] || "",
    "Case Description": original?.caseDescription || original?.["Case Description / รายละเอียดเคส คำอธิบายเคส"] || original?.["Case Description"] || request.caseDescription,
    "Case Image URL": original?.evidenceUrls?.join("\n") || original?.["Case Image URL / ภาพประกอบเคส"] || original?.["Case Image URL"] || "",
    "QA Scheme": original?.qaScheme || original?.["QA Scheme"] || "",
    "Comment Status": request.status === "Approved" ? "Revised" : "Rejected",
    "Original Case Key": `${request.caseId}-ORI`,
    "Appeal Record Key": `${request.caseId}-${version}`,
    "Appeal Match Key": `${request.caseId}|${version}`,
    "Auto Change Remark": changed ? "Score changed" : request.status,
    "Appeal Review Summary": request.reviewSummary,
    "Appeal Submit": parseDateOnly(request.submittedAt),
    "Appeal Result": parseDateOnly(request.reviewedAt),
    "Appeal Channel": "Dashboard Case Detail",
    Grade: grade,
    "Appeal Status": request.status,
    "Appeal Version": version,
    "Appeal Submit Date & Time": parseDateOnly(request.submittedAt),
    "Appeal Result Date & Time": parseDateOnly(request.reviewedAt),
    "RawData File": request.rawDataSourceName,
    "Request ID": request.requestId,
  };
  return map[header] ?? "";
}

function makeBackup(filePath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupPath = filePath.replace(/\.xlsx$/i, `.data-only-backup-${stamp}.xlsx`);
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function appendRowsValueOnly({ sheetName, appendRows, caseIdColumn }) {
  const payloadPath = path.join(os.tmpdir(), `qa-v13-${sheetName}-${Date.now()}.json`);
  const helperPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "append-v13-rowdata-com.ps1");
  fs.writeFileSync(payloadPath, JSON.stringify({ rows: appendRows }), "utf8");

  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      helperPath,
      "-WorkbookPath",
      TARGET_WORKBOOK,
      "-SheetName",
      sheetName,
      "-PayloadPath",
      payloadPath,
      "-CaseIdColumn",
      String(caseIdColumn + 1),
      "-ValueOnly",
    ],
    { encoding: "utf8", timeout: 120000 }
  );

  try {
    fs.unlinkSync(payloadPath);
  } catch {
    // Best effort cleanup.
  }

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`${sheetName} append failed with exit code ${result.status}`);
}

async function main() {
  if (!fs.existsSync(TARGET_WORKBOOK)) throw new Error(`Workbook not found: ${TARGET_WORKBOOK}`);

  const workbook = XLSX.readFile(TARGET_WORKBOOK, { cellDates: true, bookVBA: true });
  const raw = parseSheet(workbook, "Raw_Data");
  const appeal = parseSheet(workbook, "Appeal_Data");
  const rawCaseIdColumn = raw.headers.findIndex((header) => header === "Case ID");
  const appealCaseIdColumn = appeal.headers.findIndex((header) => header === "Case ID");
  const appealMatchKeyColumn = appeal.headers.findIndex((header) => header === "Appeal Match Key");
  if (rawCaseIdColumn < 0) throw new Error("Raw_Data Case ID column not found");
  if (appealCaseIdColumn < 0) throw new Error("Appeal_Data Case ID column not found");

  const evaluations = await fetchEvaluations();
  const rawExcelRecordMap = buildRawExcelRecordMap(raw.rows, raw.headers);
  const evaluationMap = new Map(evaluations.map((item) => [normalizeKey(item.caseId), item]));
  const existingRawCaseIds = existingKeys(raw.rows, rawCaseIdColumn);
  const rawRecords = evaluations
    .filter((record) => !existingRawCaseIds.has(normalizeKey(record.caseId)))
    .sort((a, b) => new Date(a.auditDate || a.submittedAt || 0) - new Date(b.auditDate || b.submittedAt || 0));
  const rawRows = rawRecords.map((record) => raw.headers.map((header) => rawValueForHeader(header, record)));

  const appealRequests = await fetchAppealRequests();
  appealRoundByCase(appealRequests);
  const existingAppealKeys = appealMatchKeyColumn >= 0
    ? existingKeys(appeal.rows, appealMatchKeyColumn)
    : existingKeys(appeal.rows, appealCaseIdColumn);
  const appealRecords = appealRequests.filter((request) => {
    const matchKey = `${request.caseId}|REV${request.appealRound || 1}`;
    return !existingAppealKeys.has(normalizeKey(matchKey)) && !existingAppealKeys.has(normalizeKey(request.caseId));
  });
  const appealRows = appealRecords.map((request) => {
    const original = evaluationMap.get(normalizeKey(request.caseId)) || rawExcelRecordMap.get(normalizeKey(request.caseId));
    return appeal.headers.map((header) => appealValueForHeader(header, request, original));
  });

  console.log(`Raw_Data: ${rawRows.length} new row(s).`);
  if (rawRecords.length) console.log(rawRecords.map((record) => record.caseId).join(", "));
  console.log(`Appeal_Data: ${appealRows.length} new row(s).`);
  if (appealRecords.length) console.log(appealRecords.map((record) => `${record.caseId}|REV${record.appealRound || 1}`).join(", "));

  if (DRY_RUN || (!rawRows.length && !appealRows.length)) return;

  const backupPath = makeBackup(TARGET_WORKBOOK);
  if (rawRows.length) appendRowsValueOnly({ sheetName: "Raw_Data", appendRows: rawRows, caseIdColumn: rawCaseIdColumn });
  if (appealRows.length) appendRowsValueOnly({ sheetName: "Appeal_Data", appendRows: appealRows, caseIdColumn: appealCaseIdColumn });
  console.log(`Backup: ${backupPath}`);
  console.log(`Updated: ${TARGET_WORKBOOK}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
