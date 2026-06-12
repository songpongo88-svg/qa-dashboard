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
const TARGET_SHEET = process.env.QA_V13_RAWDATA_SHEET || "Raw_Data";
const HEADER_ROW_INDEX = 3;
const DATA_START_ROW_INDEX = 4;
const MAX_FETCH = Number(process.env.QA_EVALUATION_FETCH_LIMIT || 1000);
const DRY_RUN = process.argv.includes("--dry-run") || process.env.QA_V13_DRY_RUN === "1";

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyBn03smavKzc0l761okJQqCSyT0Wq022DQ",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "qa-dashboard-b0b5d.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "qa-dashboard-b0b5d",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "qa-dashboard-b0b5d.firebasestorage.app",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "441715183213",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:441715183213:web:4e00da66b84546ff03964",
};

function normalizeCaseId(value) {
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
    ? raw.map((item) => ({
        code: String(item?.code || ""),
        score: item?.score ?? "",
        comment: String(item?.comment || item?.reason || ""),
      })).filter((item) => item.code)
    : [];
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
    rubricName: String(row.rubric_name || row.rubricName || ""),
    rubricPeriod: String(row.rubric_period || row.rubricPeriod || ""),
    submittedAt: String(row.submitted_at || row.submittedAt || row.created_at || ""),
    topics: toTopics(row.topics),
    rawDataPreview: row.raw_data_preview || row.rawDataPreview || {},
  };
}

function parseDateCell(value) {
  if (!value) return "";
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  return value;
}

function parseDateTimeCell(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date;
}

function parseTimeCell(value) {
  return String(value || "");
}

function valueForHeader(header, record) {
  const preview = record.rawDataPreview || {};
  if (preview[header] !== undefined && preview[header] !== null && preview[header] !== "") return preview[header];

  const topic = record.topics.find((item) => header === `${item.code} Score` || header === `${item.code} Comment`);
  if (topic) return header.endsWith(" Score") ? topic.score : topic.comment;

  const map = {
    "Audit Date": parseDateCell(record.auditDate),
    "Agent Name": record.agentName,
    "Case Date": preview["Case Date"] || "",
    "Waiting Time": parseTimeCell(record.waitingTime),
    "Service Time": parseTimeCell(record.serviceTime),
    "Case ID": record.caseId,
    "Case URL": record.caseUrl,
    "Critical Error": record.criticalError ? "YES" : "NO",
    "Customer Inquiry": record.inquiry,
    "Final Score Input": record.finalScore || "",
    "Final Score": record.finalScore || "",
    "Case Description / รายละเอียดเคส คำอธิบายเคส": record.caseDescription,
    "Case Image URL / ภาพประกอบเคส": record.evidenceUrls.join("\n"),
    "QA Scheme": record.qaScheme,
    "Rubric Version": record.rubricName,
    "Rubric Active Period": record.rubricPeriod,
    "Evaluator Name": "Songpon Phothong",
    "Evaluation Submitted At": parseDateTimeCell(record.submittedAt),
    "Evaluation Status": "Submitted",
    "Grade": record.grade,
    "RawData File": "QA Evaluation Form",
  };
  if (map[header] !== undefined) return map[header];
  if (header.startsWith("Case Description /")) return record.caseDescription;
  if (header.startsWith("Case Image URL /")) return record.evidenceUrls.join("\n");
  return "";
}

async function fetchEvaluations() {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const snapshot = await getDocs(
    query(collection(db, "qa_evaluations"), orderBy("submitted_at", "desc"), limit(MAX_FETCH))
  );
  return snapshot.docs
    .map((item) => normalizeEvaluation({ id: item.id, ...item.data() }, item.id))
    .filter((item) => normalizeCaseId(item.caseId));
}

function makeBackup(filePath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupPath = filePath.replace(/\.xlsx$/i, `.backup-${stamp}.xlsx`);
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function appendRowsWithExcelCom({ appendRows, caseIdColumn }) {
  const payloadPath = path.join(os.tmpdir(), `qa-v13-rowdata-${Date.now()}.json`);
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
      TARGET_SHEET,
      "-PayloadPath",
      payloadPath,
      "-CaseIdColumn",
      String(caseIdColumn + 1),
    ],
    { encoding: "utf8" }
  );

  try {
    fs.unlinkSync(payloadPath);
  } catch {
    // Best effort cleanup only.
  }

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`Excel COM append failed with exit code ${result.status}`);
  }
}

async function main() {
  if (!fs.existsSync(TARGET_WORKBOOK)) {
    throw new Error(`Workbook not found: ${TARGET_WORKBOOK}`);
  }

  const workbook = XLSX.readFile(TARGET_WORKBOOK, { cellDates: true, bookVBA: true });
  const sheet = workbook.Sheets[TARGET_SHEET];
  if (!sheet) throw new Error(`Sheet not found: ${TARGET_SHEET}`);

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
  const headers = (rows[HEADER_ROW_INDEX] || []).map(normalizeHeader);
  const caseIdColumn = headers.findIndex((header) => header === "Case ID");
  if (caseIdColumn < 0) throw new Error("Case ID column not found in Raw_Data header row");

  const existingCaseIds = new Set(
    rows.slice(DATA_START_ROW_INDEX)
      .map((row) => normalizeCaseId(row?.[caseIdColumn]))
      .filter(Boolean)
  );

  const evaluations = await fetchEvaluations();
  const newRecords = evaluations
    .filter((record) => !existingCaseIds.has(normalizeCaseId(record.caseId)))
    .sort((a, b) => new Date(a.auditDate || a.submittedAt || 0).getTime() - new Date(b.auditDate || b.submittedAt || 0).getTime());

  if (!newRecords.length) {
    console.log(`No new cases to append. Existing cases: ${existingCaseIds.size}.`);
    return;
  }

  const appendRows = newRecords.map((record) => headers.map((header) => valueForHeader(header, record)));
  if (DRY_RUN) {
    console.log(`Dry run: would append ${appendRows.length} new case(s). Existing cases: ${existingCaseIds.size}.`);
    console.log(newRecords.map((record) => record.caseId).join(", "));
    return;
  }

  const backupPath = makeBackup(TARGET_WORKBOOK);
  appendRowsWithExcelCom({ appendRows, caseIdColumn });

  console.log(`Updated ${TARGET_WORKBOOK}`);
  console.log(`Backup: ${backupPath}`);
  console.log(`Appended cases: ${appendRows.length}`);
  console.log(newRecords.map((record) => record.caseId).join(", "));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
