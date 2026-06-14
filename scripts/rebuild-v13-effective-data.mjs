import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import XLSX from "xlsx";

const TARGET_WORKBOOK =
  process.env.QA_V13_WORKBOOK ||
  "C:\\Users\\Songpon\\OneDrive - Purple Ventures\\Report QA\\ROWDATA\\QA_Score_Dashboard_byDao_V13.xlsx";

const HEADER_ROW = 4;
const DATA_START_ROW = 5;

function makeBackup(workbookPath) {
  const parsed = path.parse(workbookPath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(parsed.dir, `${parsed.name}.effective-backup-${timestamp}${parsed.ext}`);
  fs.copyFileSync(workbookPath, backupPath);
  return backupPath;
}

function readRows() {
  const workbook = XLSX.readFile(TARGET_WORKBOOK, { cellFormula: true, cellDates: false, raw: true });
  const rawSheet = workbook.Sheets.Raw_Data;
  const effectiveSheet = workbook.Sheets.Effective_Data;
  if (!rawSheet) throw new Error("Raw_Data sheet not found");
  if (!effectiveSheet) throw new Error("Effective_Data sheet not found");

  const raw = XLSX.utils.sheet_to_json(rawSheet, { header: 1, defval: "", raw: true });
  const rawHeader = raw[HEADER_ROW - 1];
  const effective = XLSX.utils.sheet_to_json(effectiveSheet, { header: 1, defval: "", raw: true });
  const effectiveHeader = effective[HEADER_ROW - 1];

  const rawIndex = new Map(rawHeader.map((name, index) => [String(name || "").trim(), index]));
  const effectiveIndex = new Map(effectiveHeader.map((name, index) => [String(name || "").trim(), index]));

  function rawValue(row, header) {
    const index = rawIndex.get(header);
    return index == null ? "" : row[index] ?? "";
  }

  function set(row, header, value) {
    const index = effectiveIndex.get(header);
    if (index != null) row[index] = value;
  }

  function setAt(row, oneBasedColumn, value) {
    row[oneBasedColumn - 1] = value;
  }

  const rows = [];
  for (let i = DATA_START_ROW - 1; i < raw.length; i++) {
    const source = raw[i];
    const caseId = String(rawValue(source, "Case ID") || "").trim();
    if (!caseId) continue;
    const target = Array(effectiveHeader.length).fill("");

    for (const header of [
      "Audit Date",
      "Agent Name",
      "Case Date",
      "Waiting Time",
      "Service Time",
      "Case ID",
      "Case URL",
      "Critical Error",
      "Customer Inquiry",
      "Final Score Input",
      "Final Score",
      "Month Start",
      "Month Label",
      "Week Start",
      "Week End",
      "Week Label",
      "Agent Month Seq",
      "Agent Week Seq",
      "Month Key",
      "Week Key",
      "Critical Flag",
      "QA Scheme",
    ]) {
      set(target, header, rawValue(source, header));
    }

    set(target, "Case Description", rawValue(source, "Case Description / รายละเอียดเคส คำอธิบายเคส"));
    set(target, "Case Image URL", rawValue(source, "Case Image URL / ภาพประกอบเคส"));

    for (const code of ["1.1", "1.2", "1.3", "2.1", "2.2", "2.3", "2.4", "3.1", "3.2", "3.3", "4.1", "4.2", "4.3", "4.4", "5.1", "5.2", "5.3"]) {
      set(target, `${code} Score`, rawValue(source, `${code} Score`));
      set(target, `${code} Comment`, rawValue(source, `${code} Comment`));
    }

    for (const code of ["1", "2", "3", "4"]) {
      set(target, `${code} Score`, rawValue(source, `${code} Score`));
      set(target, `${code} Comment`, rawValue(source, `${code} Comment`));
    }

    setAt(target, 61, "");
    setAt(target, 62, "Original");
    setAt(target, 63, "Original");
    setAt(target, 64, "");
    setAt(target, 65, "");
    setAt(target, 66, "");

    rows.push(target);
  }

  return { rows, columnCount: effectiveHeader.length };
}

function runPowerShell(rows, columnCount, backupPath) {
  const payloadPath = path.join(os.tmpdir(), `qa-v13-effective-${Date.now()}.json`);
  fs.writeFileSync(payloadPath, JSON.stringify({ rows, columnCount }), "utf8");
  const escapedPayload = payloadPath.replaceAll("'", "''");
  const escapedWorkbook = TARGET_WORKBOOK.replaceAll("'", "''");
  const escapedBackup = backupPath.replaceAll("'", "''");

  const script = `
$ErrorActionPreference = 'Stop'
$payload = Get-Content -LiteralPath '${escapedPayload}' -Raw -Encoding UTF8 | ConvertFrom-Json
$path = '${escapedWorkbook}'
$excel = $null
$wb = $null
$ws = $null
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  try { $excel.Calculation = -4135 } catch {}
  $wb = $excel.Workbooks.Open($path)
  $ws = $wb.Worksheets.Item('Effective_Data')
  $oldLast = $ws.Cells.Item($ws.Rows.Count, 6).End(-4162).Row
  if ($oldLast -lt ${DATA_START_ROW}) { $oldLast = ${DATA_START_ROW} }
  $ws.Range($ws.Cells.Item(${DATA_START_ROW}, 1), $ws.Cells.Item([Math]::Max($oldLast, ${DATA_START_ROW} + $payload.rows.Count + 20), [int]$payload.columnCount)).ClearContents()

  $rowCount = [int]$payload.rows.Count
  $colCount = [int]$payload.columnCount
  if ($rowCount -gt 0) {
    $data = New-Object 'object[,]' $rowCount, $colCount
    for ($r = 0; $r -lt $rowCount; $r++) {
      $row = @($payload.rows[$r])
      for ($c = 0; $c -lt $colCount; $c++) {
        $data[$r,$c] = if ($c -lt $row.Count) { $row[$c] } else { '' }
      }
    }
    $ws.Range($ws.Cells.Item(${DATA_START_ROW}, 47), $ws.Cells.Item(${DATA_START_ROW} + $rowCount - 1, 47)).NumberFormat = '@'
    $ws.Range($ws.Cells.Item(${DATA_START_ROW}, 50), $ws.Cells.Item(${DATA_START_ROW} + $rowCount - 1, 50)).NumberFormat = '@'
    $ws.Range($ws.Cells.Item(${DATA_START_ROW}, 53), $ws.Cells.Item(${DATA_START_ROW} + $rowCount - 1, 54)).NumberFormat = '@'
    $target = $ws.Range($ws.Cells.Item(${DATA_START_ROW}, 1), $ws.Cells.Item(${DATA_START_ROW} + $rowCount - 1, $colCount))
    $target.Value2 = $data
    $ws.Range($ws.Cells.Item(${DATA_START_ROW}, 75), $ws.Cells.Item(${DATA_START_ROW} + $rowCount - 1, 75)).FormulaR1C1 = '=IF(AND(RC2<>"",RC46=Control_Panel!R5C2,COUNTIFS(R5C2:RC2,RC2,R5C46:RC46,Control_Panel!R5C2)=1),MAX(R4C75:R[-1]C75)+1,"")'
  }

  $ws.Range('A5:A' + (${DATA_START_ROW} + $rowCount - 1)).NumberFormat = 'dd/mm/yyyy hh:mm'
  $ws.Range('C5:C' + (${DATA_START_ROW} + $rowCount - 1)).NumberFormat = 'dd/mm/yyyy'
  $ws.Range('D5:E' + (${DATA_START_ROW} + $rowCount - 1)).NumberFormat = 'hh:mm'
  $ws.Range('AT5:AT' + (${DATA_START_ROW} + $rowCount - 1)).NumberFormat = 'dd/mm/yyyy'
  $ws.Range('AV5:AW' + (${DATA_START_ROW} + $rowCount - 1)).NumberFormat = 'dd/mm/yyyy'
  $ws.Calculate()
  foreach ($sheetName in @('Weekly_Dashboard','Weekly_QA_by_Agent','Monthly_Dashboard','Monthly_Team_Summary','Yearly_Team_Summary')) {
    try {
      $wb.Worksheets.Item($sheetName).Calculate()
    } catch {
      # Some workbook versions may not have every summary sheet.
    }
  }
  $wb.Save()
  Write-Output "Backup created: ${escapedBackup}"
  Write-Output "Effective_Data rebuilt rows: $rowCount"
} finally {
  if ($wb) { $wb.Close($true) | Out-Null }
  if ($excel) { $excel.Quit() | Out-Null }
  if ($ws) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($ws) }
  if ($wb) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($wb) }
  if ($excel) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
`;

  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    encoding: "utf8",
    timeout: 300000,
  });

  try {
    fs.unlinkSync(payloadPath);
  } catch {
    // Best effort cleanup.
  }

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`Effective_Data rebuild failed with exit code ${result.status}`);
}

const { rows, columnCount } = readRows();
const backupPath = makeBackup(TARGET_WORKBOOK);
runPowerShell(rows, columnCount, backupPath);
