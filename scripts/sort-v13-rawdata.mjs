import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import XLSX from "xlsx";

const TARGET_WORKBOOK =
  process.env.QA_V13_WORKBOOK ||
  "C:\\Users\\Songpon\\OneDrive - Purple Ventures\\Report QA\\ROWDATA\\QA_Score_Dashboard_byDao_V13.xlsx";
const TARGET_SHEET = "Raw_Data";
const CASE_ID_COLUMN = "F";
const SORT_START_ROW = 5;
const SORT_LAST_COLUMN = "BR";

function findLastDataRow(workbookPath) {
  const workbook = XLSX.readFile(workbookPath, { cellDates: false, cellFormula: true });
  const sheet = workbook.Sheets[TARGET_SHEET];
  if (!sheet) throw new Error(`Sheet not found: ${TARGET_SHEET}`);
  const ref = sheet["!ref"];
  if (!ref) return 0;
  const range = XLSX.utils.decode_range(ref);
  for (let row = range.e.r + 1; row >= SORT_START_ROW; row--) {
    const value = sheet[`${CASE_ID_COLUMN}${row}`]?.v;
    if (String(value || "").trim()) return row;
  }
  return 0;
}

function makeBackup(workbookPath) {
  const parsed = path.parse(workbookPath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(parsed.dir, `${parsed.name}.pre-sort-backup-${timestamp}${parsed.ext}`);
  fs.copyFileSync(workbookPath, backupPath);
  return backupPath;
}

function runPowerShell(lastRow) {
  const escapedWorkbook = TARGET_WORKBOOK.replaceAll("'", "''");
  const script = `
$ErrorActionPreference = 'Stop'
$path = '${escapedWorkbook}'
$excel = $null
$wb = $null
$sheet = $null
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $wb = $excel.Workbooks.Open($path)
  $sheet = $wb.Worksheets.Item('${TARGET_SHEET}')
  $sortRange = $sheet.Range('A${SORT_START_ROW}:${SORT_LAST_COLUMN}${lastRow}')
  $sort = $sheet.Sort
  $sort.SortFields.Clear()
  $sort.SortFields.Add($sheet.Range('C${SORT_START_ROW}:C${lastRow}'), 0, 1) | Out-Null
  $sort.SortFields.Add($sheet.Range('D${SORT_START_ROW}:D${lastRow}'), 0, 1) | Out-Null
  $sort.SortFields.Add($sheet.Range('F${SORT_START_ROW}:F${lastRow}'), 0, 1) | Out-Null
  $sort.SetRange($sortRange)
  $sort.Header = 2
  $sort.MatchCase = $false
  $sort.Orientation = 1
  $sort.Apply()
  $excel.CalculateFullRebuild()
  $wb.Save()
  Write-Output "Sorted Raw_Data rows ${SORT_START_ROW}-${lastRow}"
} finally {
  if ($wb) { $wb.Close($true) | Out-Null }
  if ($excel) { $excel.Quit() | Out-Null }
  if ($sheet) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($sheet) }
  if ($wb) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($wb) }
  if ($excel) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
`;

  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    encoding: "utf8",
    timeout: 120000,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`Raw_Data sort failed with exit code ${result.status}`);
}

const lastRow = findLastDataRow(TARGET_WORKBOOK);
if (lastRow < SORT_START_ROW) {
  console.log("No Raw_Data rows to sort.");
  process.exit(0);
}
const backupPath = makeBackup(TARGET_WORKBOOK);
console.log(`Backup created: ${backupPath}`);
runPowerShell(lastRow);
