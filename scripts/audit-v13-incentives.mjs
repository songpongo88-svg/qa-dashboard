import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const TARGET_WORKBOOK =
  process.env.QA_V13_WORKBOOK ||
  "C:\\Users\\Songpon\\OneDrive - Purple Ventures\\Report QA\\ROWDATA\\QA_Score_Dashboard_byDao_V13.xlsx";
const PUBLIC_SIGNATURE_FILES = [
  path.join(process.cwd(), "public", "QA_RawData_January-February2026.xlsx"),
  path.join(process.cwd(), "public", "QA_RawData_March-May2026.xlsx"),
];

const HEADER_ROW_INDEX = 3;
const DATA_START_ROW_INDEX = 4;
const CASE_TARGET = 10;

function normalizeMonthKey(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const direct = text.match(/^(\d{4})-(\d{2})/);
  if (direct) return `${direct[1]}-${direct[2]}`;
  const compact = text.match(/(20\d{2})(\d{2})\d{2}/);
  if (compact) return `${compact[1]}-${compact[2]}`;
  const date = parseExcelDate(value);
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function policyKey(monthKey) {
  if (monthKey === "2026-01" || monthKey === "2026-02") return "JAN_FEB_2026";
  if (monthKey === "2026-03") return "MAR_2026";
  return "APR_2026_ONWARD";
}

function scoreToGrade(score, monthKey, criticalError = false) {
  const safeScore = Number.isFinite(score) ? score : 0;
  if (criticalError) return "G";
  switch (policyKey(monthKey)) {
    case "JAN_FEB_2026":
      if (safeScore >= 80) return "A";
      if (safeScore >= 70) return "B";
      if (safeScore >= 60) return "C";
      return "D";
    case "MAR_2026":
      if (safeScore >= 90) return "A";
      if (safeScore >= 80) return "B";
      if (safeScore >= 70) return "C";
      if (safeScore >= 60) return "D";
      return "F";
    default:
      if (safeScore >= 90) return "A";
      if (safeScore >= 85) return "B";
      if (safeScore >= 80) return "C";
      return "D";
  }
}

function incentiveByGrade(grade, monthKey) {
  const scheme = policyKey(monthKey);
  const hasPromo = monthKey === "2026-01" || monthKey === "2026-04";
  const promoByGrade = hasPromo ? { A: 500, B: 300, C: 150 } : { A: 0, B: 0, C: 0 };
  const label = (cash, promo) => promo > 0
    ? `${cash.toLocaleString("en-US")} Cash + ${promo.toLocaleString("en-US")} RBH Promo Code`
    : `${cash.toLocaleString("en-US")} THB`;
  if (scheme === "JAN_FEB_2026") {
    if (grade === "A") return { label: label(1000, promoByGrade.A), cash: 1000, promo: promoByGrade.A, remark: "Excellent" };
    if (grade === "B") return { label: label(500, promoByGrade.B), cash: 500, promo: promoByGrade.B, remark: "Strong" };
    if (grade === "C") return { label: label(300, promoByGrade.C), cash: 300, promo: promoByGrade.C, remark: "Standard" };
    return { label: "No Incentive", cash: 0, promo: 0, remark: "No Incentive" };
  }
  if (scheme === "MAR_2026") {
    if (grade === "A") return { label: "1,000 THB", cash: 1000, promo: 0, remark: "Excellent" };
    if (grade === "B") return { label: "700 THB", cash: 700, promo: 0, remark: "Strong" };
    if (grade === "C") return { label: "300 THB", cash: 300, promo: 0, remark: "Standard" };
    return { label: "No Incentive", cash: 0, promo: 0, remark: "No Incentive" };
  }
  if (grade === "A") return { label: label(1000, promoByGrade.A), cash: 1000, promo: promoByGrade.A, remark: "Excellent" };
  if (grade === "B") return { label: label(700, promoByGrade.B), cash: 700, promo: promoByGrade.B, remark: "Strong" };
  if (grade === "C") return { label: label(500, promoByGrade.C), cash: 500, promo: promoByGrade.C, remark: "Standard" };
  return { label: "No Incentive", cash: 0, promo: 0, remark: "No Incentive" };
}

function expectedIncentive(caseCount, averageScore, monthKey, criticalCases) {
  if (caseCount < CASE_TARGET) {
    return { grade: scoreToGrade(averageScore, monthKey), label: "0 THB / No Incentive", cash: 0, promo: 0, remark: "ยังประเมินไม่ครบ 10 เคส" };
  }
  const grade = scoreToGrade(averageScore, monthKey, criticalCases > 0);
  return { grade, ...incentiveByGrade(grade, monthKey) };
}

function parseExcelDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + value * 86400000);
  }
  const text = String(value ?? "").trim();
  if (!text) return null;
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    const year = Number(match[3]) > 2400 ? Number(match[3]) - 543 : Number(match[3]);
    return new Date(year, Number(match[2]) - 1, Number(match[1]));
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function clean(value) {
  return String(value ?? "").trim();
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function buildHeaderMap(headerRow) {
  const map = new Map();
  headerRow.forEach((header, index) => {
    const key = clean(header).toLowerCase();
    if (!key) return;
    const current = map.get(key) || [];
    current.push(index);
    map.set(key, current);
  });
  return {
    get(row, names) {
      for (const name of names) {
        const indexes = map.get(clean(name).toLowerCase());
        if (!indexes?.length) continue;
        for (const index of indexes) {
          if (row[index] !== null && row[index] !== undefined && clean(row[index]) !== "") return row[index];
        }
      }
      return "";
    },
  };
}

function rowToRecord(row, helper) {
  const caseId = clean(helper.get(row, ["Case ID", "CaseId", "Case"]));
  const agentName = clean(helper.get(row, ["Agent Name", "Agent", "Employee Name", "User"]));
  const monthKey =
    normalizeMonthKey(helper.get(row, ["Month Key", "Month Start", "Month Label", "Month"])) ||
    normalizeMonthKey(helper.get(row, ["Audit Date", "Case Date", "Timestamp", "Date"]));
  const score = toNumber(helper.get(row, ["Final Score", "Total Score", "QA Score", "Score", "Final Score Input"]));
  const criticalText = clean(helper.get(row, ["Critical Flag", "Critical Error"])).toLowerCase();
  const critical = ["true", "yes", "y", "1", "critical"].includes(criticalText);
  return { caseId, agentName, monthKey, score, critical };
}

function readEffectiveRows() {
  const workbook = XLSX.readFile(TARGET_WORKBOOK, { cellDates: false, raw: true });
  const sheet = workbook.Sheets.Effective_Data;
  if (!sheet) throw new Error("Effective_Data sheet not found");
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
  const helper = buildHeaderMap(rows[HEADER_ROW_INDEX] || []);
  return rows.slice(DATA_START_ROW_INDEX)
    .map((row) => rowToRecord(row, helper))
    .filter((row) => row.caseId && row.agentName && row.monthKey);
}

function readPublicSignatureRows() {
  const output = [];
  for (const filePath of PUBLIC_SIGNATURE_FILES) {
    if (!fs.existsSync(filePath)) continue;
    const workbook = XLSX.readFile(filePath, { cellDates: true, raw: true });
    const sheet = workbook.Sheets.Raw_Data || workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
    const headerIndex = rows.findIndex((row) => {
      const keys = row.map((item) => clean(item).toLowerCase());
      return keys.includes("agent name") && (keys.includes("case id") || keys.includes("final score"));
    });
    if (headerIndex < 0) continue;
    const helper = buildHeaderMap(rows[headerIndex] || []);
    output.push(
      ...rows.slice(headerIndex + 1)
        .map((row) => rowToRecord(row, helper))
        .filter((row) => row.caseId && row.agentName && row.monthKey)
    );
  }
  return output;
}

const sourceMode = process.argv.includes("--public") ? "public-signature-files" : "v13-effective-data";
const rows = sourceMode === "public-signature-files" ? readPublicSignatureRows() : readEffectiveRows();
const groups = new Map();
for (const row of rows) {
  const key = `${row.monthKey}::${row.agentName}`;
  const group = groups.get(key) || {
    monthKey: row.monthKey,
    agentName: row.agentName,
    caseIds: new Set(),
    scores: [],
    criticalCases: 0,
    duplicateCaseIds: new Set(),
  };
  if (group.caseIds.has(row.caseId)) group.duplicateCaseIds.add(row.caseId);
  group.caseIds.add(row.caseId);
  group.scores.push(row.score);
  if (row.critical) group.criticalCases += 1;
  groups.set(key, group);
}

const auditRows = Array.from(groups.values())
  .map((group) => {
    const caseCount = group.caseIds.size || group.scores.length;
    const averageScore = group.scores.length ? group.scores.reduce((sum, score) => sum + score, 0) / group.scores.length : 0;
    const expected = expectedIncentive(caseCount, averageScore, group.monthKey, group.criticalCases);
    return {
      monthKey: group.monthKey,
      agentName: group.agentName,
      caseCount,
      averageScore: Number(averageScore.toFixed(2)),
      criticalCases: group.criticalCases,
      grade: expected.grade,
      incentive: expected.label,
      cash: expected.cash,
      promo: expected.promo,
      remark: expected.remark,
      policy: policyKey(group.monthKey),
      duplicateCases: Array.from(group.duplicateCaseIds).join(" | "),
      warning:
        group.criticalCases > 0
          ? "Critical case forces grade G in audit policy"
          : group.duplicateCaseIds.size
            ? "Duplicate case id in Effective_Data"
            : "",
    };
  })
  .sort((a, b) => a.monthKey.localeCompare(b.monthKey) || a.agentName.localeCompare(b.agentName));

const outputDir = path.join(process.cwd(), "recovery");
fs.mkdirSync(outputDir, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputPath = path.join(outputDir, `v13-incentive-audit-${timestamp}.csv`);
const columns = [
  "monthKey",
  "agentName",
  "caseCount",
  "averageScore",
  "criticalCases",
  "grade",
  "incentive",
  "cash",
  "promo",
  "remark",
  "policy",
  "duplicateCases",
  "warning",
];
fs.writeFileSync(
  outputPath,
  [columns.join(","), ...auditRows.map((row) => columns.map((column) => csvEscape(row[column])).join(","))].join("\n"),
  "utf8"
);

const mayRows = auditRows.filter((row) => row.monthKey === "2026-05");
const issues = auditRows.filter((row) => row.warning);
console.log(`Source: ${sourceMode}`);
console.log(`Workbook: ${TARGET_WORKBOOK}`);
console.log(`Source cases: ${rows.length}`);
console.log(`Agent-month groups: ${auditRows.length}`);
console.log(`Audit CSV: ${outputPath}`);
console.log("");
console.log("May 2026 audit:");
for (const row of mayRows) {
  console.log(
    `${row.agentName} | cases ${row.caseCount} | avg ${row.averageScore.toFixed(2)} | grade ${row.grade} | ${row.incentive} | cash ${row.cash} | promo ${row.promo}`
  );
}
console.log("");
console.log(`Warnings: ${issues.length}`);
for (const row of issues.slice(0, 20)) {
  console.log(`${row.monthKey} | ${row.agentName} | ${row.warning} | duplicates: ${row.duplicateCases}`);
}
