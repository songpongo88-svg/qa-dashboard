import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import XLSX from "xlsx";
import { initializeApp, getApps } from "firebase/app";
import { collection, getDocs, getFirestore, limit, orderBy, query } from "firebase/firestore/lite";

const TARGET_WORKBOOK =
  process.env.QA_V13_WORKBOOK ||
  "C:\\Users\\Songpon\\OneDrive - Purple Ventures\\Report QA\\ROWDATA\\QA_Score_Dashboard_byDao_V13.xlsx";
const HEADER_SEARCH_ROWS = 12;
const MAX_FETCH = Number(process.env.QA_SYNC_FETCH_LIMIT || 2000);
const DATE_FORMAT = "dd/mm/yyyy";
const DATA_SHEETS = new Set(["Raw_Data", "Effective_Data", "Appeal_Data"]);

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyBn03smavKzc0l761okJQqCSyT0Wq022DQ",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "qa-dashboard-b0b5d.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "qa-dashboard-b0b5d",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "qa-dashboard-b0b5d.firebasestorage.app",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "441715183213",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:441715183213:web:4e00da66b84546ff03964",
};

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeKey(value) {
  return normalizeText(value).toUpperCase();
}

function isDateHeader(value) {
  const text = normalizeText(value).toLowerCase();
  if (!text) return false;
  return (
    text === "audit date" ||
    text === "case date" ||
    text === "month start" ||
    text === "week start" ||
    text === "week end" ||
    text === "appeal submit" ||
    text === "appeal result" ||
    text === "appeal submit date & time" ||
    text === "appeal result date & time" ||
    text === "evaluation submitted at" ||
    text.includes("date")
  );
}

function excelDateSerialFromParts(year, month, day) {
  return Date.UTC(year, month - 1, day) / 86400000 + 25569;
}

function excelSerialToDateOnly(value) {
  const serial = Number(value);
  if (!Number.isFinite(serial)) return "";
  const date = new Date(Math.round((Math.floor(serial) - 25569) * 86400000));
  return excelDateSerialFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function parseDateOnly(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return excelDateSerialFromParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  if (typeof value === "number") return excelSerialToDateOnly(value);

  const text = normalizeText(value);
  if (!text || text === "-") return "";

  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (match) return excelDateSerialFromParts(Number(match[1]), Number(match[2]), Number(match[3]));

  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+.*)?$/);
  if (match) {
    let year = Number(match[3]);
    if (year < 100) year += 2500;
    if (year > 2400) year -= 543;
    return excelDateSerialFromParts(year, Number(match[2]), Number(match[1]));
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return excelDateSerialFromParts(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
}

async function fetchEvaluationDateMap() {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const snapshot = await getDocs(query(collection(db, "qa_evaluations"), orderBy("submitted_at", "desc"), limit(MAX_FETCH)));
  const map = new Map();

  snapshot.docs.forEach((item) => {
    const row = item.data();
    const caseId = normalizeKey(row.case_id || row.caseId || "");
    if (!caseId) return;
    const preview = row.raw_data_preview || row.rawDataPreview || {};
    const auditDate = parseDateOnly(preview["Audit Date"] || row.audit_date || row.auditDate || row.submitted_at || row.submittedAt);
    const caseDate = parseDateOnly(preview["Case Date"] || row.audit_date || row.auditDate || "");
    map.set(caseId, { auditDate, caseDate });
  });

  return map;
}

function makeBackup(workbookPath) {
  const parsed = path.parse(workbookPath);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupPath = path.join(parsed.dir, `${parsed.name}.date-format-backup-${stamp}${parsed.ext}`);
  fs.copyFileSync(workbookPath, backupPath);
  return backupPath;
}

function buildPayload(workbook, evaluationDateMap) {
  const sheets = [];

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
    if (!rows.length) return;

    let headerRowIndex = -1;
    let dateColumns = [];
    let caseIdColumnIndex = -1;

    for (let rowIndex = 0; rowIndex < Math.min(rows.length, HEADER_SEARCH_ROWS); rowIndex++) {
      const row = rows[rowIndex] || [];
      const currentDateColumns = [];
      let currentCaseIdColumn = -1;
      row.forEach((header, columnIndex) => {
        const text = normalizeText(header);
        if (isDateHeader(text)) currentDateColumns.push({ columnIndex, header: text });
        if (text === "Case ID") currentCaseIdColumn = columnIndex;
      });

      if (currentDateColumns.length && (headerRowIndex < 0 || currentDateColumns.length > dateColumns.length)) {
        headerRowIndex = rowIndex;
        dateColumns = currentDateColumns;
        caseIdColumnIndex = currentCaseIdColumn;
      }
    }

    if (headerRowIndex < 0 || !dateColumns.length) return;

    const dataStartRowIndex = headerRowIndex + 1;
    const columnUpdates = [];

    if (DATA_SHEETS.has(sheetName)) {
      dateColumns.forEach(({ columnIndex, header }) => {
        const values = [];
        let hasValues = false;
        for (let rowIndex = dataStartRowIndex; rowIndex < rows.length; rowIndex++) {
          const row = rows[rowIndex] || [];
          const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
          const cell = sheet[address];
          const caseId = caseIdColumnIndex >= 0 ? normalizeKey(row[caseIdColumnIndex]) : "";
          const dateRecord = caseId ? evaluationDateMap.get(caseId) : null;
          let value = "";

          if (!cell?.f) {
            if (header === "Audit Date" && dateRecord?.auditDate) value = dateRecord.auditDate;
            else if (header === "Case Date" && dateRecord?.caseDate) value = dateRecord.caseDate;
            else value = parseDateOnly(row[columnIndex]);
          }

          values.push(value || "");
          if (value) hasValues = true;
        }
        if (hasValues) {
          columnUpdates.push({
            column: columnIndex + 1,
            values,
          });
        }
      });
    }

    sheets.push({
      sheetName,
      dataStartRow: dataStartRowIndex + 1,
      lastRow: rows.length,
      columns: dateColumns.map((item) => item.columnIndex + 1),
      columnUpdates,
    });
  });

  return { sheets };
}

function runPowerShell(payload) {
  const payloadPath = path.join(os.tmpdir(), `qa-v13-date-format-${Date.now()}.json`);
  fs.writeFileSync(payloadPath, JSON.stringify(payload), "utf8");

  const escapedWorkbook = TARGET_WORKBOOK.replaceAll("'", "''");
  const escapedPayload = payloadPath.replaceAll("'", "''");
  const escapedFormat = DATE_FORMAT.replaceAll("'", "''");
  const script = `
$ErrorActionPreference = 'Stop'
$path = '${escapedWorkbook}'
$payloadPath = '${escapedPayload}'
$dateFormat = '${escapedFormat}'
$payload = Get-Content -LiteralPath $payloadPath -Raw -Encoding UTF8 | ConvertFrom-Json
$excel = $null
$wb = $null
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $excel.ScreenUpdating = $false
  $excel.EnableEvents = $false
  $excel.AskToUpdateLinks = $false
  $excel.Calculation = -4135
  $wb = $excel.Workbooks.Open($path, 0, $false, 5, "", "", $true)
  $updated = 0
  $formattedColumns = 0
  foreach ($sheetPayload in @($payload.sheets)) {
    $sheet = $wb.Worksheets.Item([string]$sheetPayload.sheetName)
    foreach ($column in @($sheetPayload.columns)) {
      if ([int]$sheetPayload.lastRow -ge [int]$sheetPayload.dataStartRow) {
        $range = $sheet.Range($sheet.Cells.Item([int]$sheetPayload.dataStartRow, [int]$column), $sheet.Cells.Item([int]$sheetPayload.lastRow, [int]$column))
        $range.NumberFormat = $dateFormat
        $formattedColumns++
      }
    }
    foreach ($columnUpdate in @($sheetPayload.columnUpdates)) {
      $rowCount = @($columnUpdate.values).Count
      if ($rowCount -gt 0) {
        $range = $sheet.Range($sheet.Cells.Item([int]$sheetPayload.dataStartRow, [int]$columnUpdate.column), $sheet.Cells.Item(([int]$sheetPayload.dataStartRow + $rowCount - 1), [int]$columnUpdate.column))
        $values = New-Object 'object[,]' $rowCount, 1
        for ($i = 0; $i -lt $rowCount; $i++) {
          $rawValue = @($columnUpdate.values)[$i]
          if ($null -eq $rawValue -or [string]::IsNullOrWhiteSpace([Convert]::ToString($rawValue))) {
            $values[$i, 0] = $null
          } else {
            $values[$i, 0] = [double]$rawValue
            $updated++
          }
        }
        $range.Value2 = $values
        $range.NumberFormat = $dateFormat
      }
    }
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($sheet)
  }
  $wb.Save()
  Write-Output "Date cells updated: $updated"
  Write-Output "Date columns formatted: $formattedColumns"
} finally {
  if ($wb) { $wb.Close($true) | Out-Null }
  if ($excel) { $excel.Quit() | Out-Null }
  if ($wb) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($wb) }
  if ($excel) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
`;

  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    encoding: "utf8",
    timeout: 600000,
  });

  try {
    fs.unlinkSync(payloadPath);
  } catch {
    // Best effort cleanup.
  }

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`Date format repair failed with exit code ${result.status}`);
}

async function main() {
  if (!fs.existsSync(TARGET_WORKBOOK)) throw new Error(`Workbook not found: ${TARGET_WORKBOOK}`);
  const workbook = XLSX.readFile(TARGET_WORKBOOK, { cellDates: true, cellFormula: true, cellNF: true });
  const evaluationDateMap = await fetchEvaluationDateMap();
  const payload = buildPayload(workbook, evaluationDateMap);
  const updateCount = payload.sheets.reduce((sum, sheet) => sum + sheet.columnUpdates.reduce((inner, column) => inner + column.values.filter(Boolean).length, 0), 0);
  const columnCount = payload.sheets.reduce((sum, sheet) => sum + sheet.columns.length, 0);

  console.log(`Date sheets found: ${payload.sheets.length}`);
  console.log(`Date columns found: ${columnCount}`);
  console.log(`Date values to normalize: ${updateCount}`);
  if (!payload.sheets.length) return;

  const backupPath = makeBackup(TARGET_WORKBOOK);
  console.log(`Backup: ${backupPath}`);
  runPowerShell(payload);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
