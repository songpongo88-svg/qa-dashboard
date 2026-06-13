import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import XLSX from "xlsx";

const TARGET_WORKBOOK =
  process.env.QA_V13_WORKBOOK ||
  "C:\\Users\\Songpon\\OneDrive - Purple Ventures\\Report QA\\ROWDATA\\QA_Score_Dashboard_byDao_V13.xlsx";
const FORMULA_SOURCE_WORKBOOK =
  process.env.QA_V13_FORMULA_SOURCE ||
  "C:\\Users\\Songpon\\OneDrive - Purple Ventures\\Report QA\\ROWDATA\\QA_Score_Dashboard_byDao_V13.backup-2026-06-12T14-54-19.xlsx";
const TARGET_SHEET = "Raw_Data";

function formulaCells(workbookPath) {
  const workbook = XLSX.readFile(workbookPath, { cellFormula: true, cellNF: true });
  const sheet = workbook.Sheets[TARGET_SHEET];
  if (!sheet) throw new Error(`Sheet not found: ${TARGET_SHEET} in ${workbookPath}`);
  const formulas = new Map();
  for (const [address, cell] of Object.entries(sheet)) {
    if (address.startsWith("!")) continue;
    if (cell?.f) formulas.set(address, cell.f);
  }
  return formulas;
}

function buildMissingFormulas() {
  const target = formulaCells(TARGET_WORKBOOK);
  const source = formulaCells(FORMULA_SOURCE_WORKBOOK);
  const payload = [];
  for (const [address, formula] of source.entries()) {
    if (!target.has(address)) payload.push({ address, formula: formula.startsWith("=") ? formula : `=${formula}` });
  }
  return payload;
}

function runPowerShell(cells) {
  const payloadPath = path.join(os.tmpdir(), `qa-v13-formula-repair-${Date.now()}.json`);
  fs.writeFileSync(payloadPath, JSON.stringify({ cells }), "utf8");
  const escapedPayload = payloadPath.replaceAll("'", "''");
  const escapedWorkbook = TARGET_WORKBOOK.replaceAll("'", "''");

  const script = `
$ErrorActionPreference = 'Stop'
$payload = Get-Content -LiteralPath '${escapedPayload}' -Raw -Encoding UTF8 | ConvertFrom-Json
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
  $count = 0
  foreach ($cell in @($payload.cells)) {
    $sheet.Range([string]$cell.address).Formula = [string]$cell.formula
    $count++
  }
  $wb.Save()
  Write-Output "Repaired formulas: $count"
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

  try {
    fs.unlinkSync(payloadPath);
  } catch {
    // Best effort cleanup.
  }

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`Formula repair failed with exit code ${result.status}`);
}

const cells = buildMissingFormulas();
console.log(`Missing formulas to repair: ${cells.length}`);
if (cells.length) runPowerShell(cells);
