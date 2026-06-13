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

const DATA_SHEETS = ["Raw_Data", "Effective_Data", "Appeal_Data"];

function formulasBySheet(workbookPath) {
  const workbook = XLSX.readFile(workbookPath, { cellFormula: true, cellNF: true });
  const bySheet = new Map();
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const formulas = new Map();
    for (const [address, cell] of Object.entries(sheet)) {
      if (!address.startsWith("!") && cell?.f) {
        formulas.set(address, cell.f.startsWith("=") ? cell.f : `=${cell.f}`);
      }
    }
    bySheet.set(sheetName, formulas);
  }
  return bySheet;
}

function buildMissingFormulaPayload() {
  const target = formulasBySheet(TARGET_WORKBOOK);
  const source = formulasBySheet(FORMULA_SOURCE_WORKBOOK);
  const cells = [];
  for (const [sheetName, sourceFormulas] of source.entries()) {
    if (!target.has(sheetName)) continue;
    const targetFormulas = target.get(sheetName);
    for (const [address, formula] of sourceFormulas.entries()) {
      if (!targetFormulas.has(address)) cells.push({ sheetName, address, formula });
    }
  }
  return cells;
}

function makeBackup(workbookPath) {
  const parsed = path.parse(workbookPath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(parsed.dir, `${parsed.name}.maintenance-backup-${timestamp}${parsed.ext}`);
  fs.copyFileSync(workbookPath, backupPath);
  return backupPath;
}

function runPowerShell(cells, backupPath) {
  const payloadPath = path.join(os.tmpdir(), `qa-v13-maintenance-${Date.now()}.json`);
  fs.writeFileSync(payloadPath, JSON.stringify({ cells }), "utf8");

  const escapedWorkbook = TARGET_WORKBOOK.replaceAll("'", "''");
  const escapedPayload = payloadPath.replaceAll("'", "''");
  const escapedBackup = backupPath.replaceAll("'", "''");
  const sheets = DATA_SHEETS.map((name) => `'${name.replaceAll("'", "''")}'`).join(",");

  const script = `
$ErrorActionPreference = 'Stop'
$path = '${escapedWorkbook}'
$payloadPath = '${escapedPayload}'
$payload = Get-Content -LiteralPath $payloadPath -Raw -Encoding UTF8 | ConvertFrom-Json
$dataSheets = @(${sheets})
$excel = $null
$wb = $null
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $wb = $excel.Workbooks.Open($path)
  try { $excel.Calculation = -4105 } catch { Write-Output "Calculation mode warning: $($_.Exception.Message)" }
  $wb.ForceFullCalculation = $true

  $formulaRepairCount = 0
  foreach ($cell in @($payload.cells)) {
    $ws = $wb.Worksheets.Item([string]$cell.sheetName)
    $ws.Range([string]$cell.address).Formula = [string]$cell.formula
    $formulaRepairCount++
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($ws)
  }

  $purple = 6567714
  $deepPurple = 4729640
  $lightLavender = 16446712
  $white = 16777215
  $borderColor = 15320788

  foreach ($name in $dataSheets) {
    $ws = $wb.Worksheets.Item($name)
    $lastCol = $ws.Cells.Item(4, $ws.Columns.Count).End(-4159).Column
    if ($lastCol -lt 1) { $lastCol = 1 }

    $lastDataRow = $ws.Cells.Item($ws.Rows.Count, 6).End(-4162).Row
    if ($lastDataRow -lt 5) { $lastDataRow = 5 }
    $formatLastRow = [Math]::Max($lastDataRow + 40, 250)
    if ($name -eq 'Raw_Data') { $formatLastRow = [Math]::Max($formatLastRow, 5001) }

    $range = $ws.Range($ws.Cells.Item(1,1), $ws.Cells.Item($formatLastRow,$lastCol))
    $range.Interior.Color = $white
    $range.Font.Name = 'Kanit'
    $range.Font.Size = 10
    $range.WrapText = $true
    $range.VerticalAlignment = -4160

    $topRows = $ws.Range($ws.Cells.Item(1,1), $ws.Cells.Item(3,$lastCol))
    $topRows.Interior.Color = $lightLavender
    $topRows.Font.Color = $deepPurple
    $topRows.Font.Bold = $true

    $header = $ws.Range($ws.Cells.Item(4,1), $ws.Cells.Item(4,$lastCol))
    $header.Interior.Color = $purple
    $header.Font.Color = $white
    $header.Font.Bold = $true
    $header.HorizontalAlignment = -4108

    $table = $ws.Range($ws.Cells.Item(4,1), $ws.Cells.Item($lastDataRow,$lastCol))
    $table.Borders.LineStyle = 1
    $table.Borders.Weight = 2
    $table.Borders.Color = $borderColor

    if ($name -eq 'Raw_Data') {
      $ws.Cells.Item(4,56).Value2 = 'Final Score Input'
      $ws.Cells.Item(4,57).Value2 = 'Final Score'
      $ws.Columns.Item(1).NumberFormat = 'dd/mm/yyyy hh:mm'
      $ws.Columns.Item(3).NumberFormat = 'dd/mm/yyyy'
      $ws.Columns.Item(4).NumberFormat = 'hh:mm'
      $ws.Columns.Item(5).NumberFormat = 'hh:mm'
      $ws.Columns.Item(58).NumberFormat = 'dd/mm/yyyy'
      $ws.Columns.Item(60).NumberFormat = 'dd/mm/yyyy'
      $ws.Columns.Item(61).NumberFormat = 'dd/mm/yyyy'
    } else {
      $ws.Cells.Item(4,44).Value2 = 'Final Score Input'
      $ws.Cells.Item(4,45).Value2 = 'Final Score'
      $ws.Columns.Item(1).NumberFormat = 'dd/mm/yyyy hh:mm'
      $ws.Columns.Item(3).NumberFormat = 'dd/mm/yyyy'
      $ws.Columns.Item(4).NumberFormat = 'hh:mm'
      $ws.Columns.Item(5).NumberFormat = 'hh:mm'
      $ws.Columns.Item(46).NumberFormat = 'dd/mm/yyyy'
      $ws.Columns.Item(48).NumberFormat = 'dd/mm/yyyy'
      $ws.Columns.Item(49).NumberFormat = 'dd/mm/yyyy'
    }

    $ws.Rows.Item(4).RowHeight = 32
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($ws)
  }

  $excel.CalculateFullRebuild()
  $wb.Save()
  Write-Output "Backup created: ${escapedBackup}"
  Write-Output "Missing formulas repaired: $formulaRepairCount"
  Write-Output "Data sheets formatted: $($dataSheets -join ', ')"
  Write-Output "Calculation mode: Automatic + FullRebuild"
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
  if (result.status !== 0) throw new Error(`Workbook maintenance failed with exit code ${result.status}`);
}

const cells = buildMissingFormulaPayload();
const backupPath = makeBackup(TARGET_WORKBOOK);
runPowerShell(cells, backupPath);
