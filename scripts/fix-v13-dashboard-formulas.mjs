import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const TARGET_WORKBOOK =
  process.env.QA_V13_WORKBOOK ||
  "C:\\Users\\Songpon\\OneDrive - Purple Ventures\\Report QA\\ROWDATA\\QA_Score_Dashboard_byDao_V13.xlsx";

function makeBackup(workbookPath) {
  const parsed = path.parse(workbookPath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(parsed.dir, `${parsed.name}.dashboard-formula-backup-${timestamp}${parsed.ext}`);
  fs.copyFileSync(workbookPath, backupPath);
  return backupPath;
}

function q(value) {
  return String(value).replaceAll("'", "''");
}

function runPowerShell(backupPath) {
  const workbook = q(TARGET_WORKBOOK);
  const backup = q(backupPath);
  const script = `
$ErrorActionPreference = 'Stop'
$path = '${workbook}'
$excel = $null
$wb = $null
function Set-Formula($ws, [string]$addr, [string]$formula) {
  $ws.Range($addr).Formula = $formula
}
function Set-Value($ws, [string]$addr, $value) {
  $ws.Range($addr).Value2 = [string]$value
}
function Fix-AgentRanking($ws, [string]$agentFormula, [int]$startRow, [int]$endRow) {
  for ($r = $startRow; $r -le $endRow; $r++) {
    $offset = $r - $startRow + 1
    $seqFormula = '=IF(B' + $r + '="","",ROWS($B$' + $startRow + ':B' + $r + '))'
    Set-Formula $ws "A$r" $seqFormula
    Set-Formula $ws "B$r" ($agentFormula -replace '\\{N\\}', [string]$offset)
  }
}
function ApplyTopicBlock($ws, [string]$codeCol, [string]$labelCol, [string]$avgCol, [string]$maxCol, [string]$pctCol, [string]$statusCol, [int]$startRow, [string]$scope, [switch]$AgentScoped) {
  $codes = @('1','2','3','4')
  $labels = @('Process & Policy Compliance','Answer Quality & Problem Analysis','Case Handling & Follow-up','Communication Skills')
  $scoreCols = @('BO','BQ','BS','BU')
  $maxes = @(30,20,25,25)
  for ($i = 0; $i -lt 17; $i++) {
    $r = $startRow + $i
    if ($i -lt 4) {
      Set-Value $ws "$codeCol$r" $codes[$i]
      Set-Value $ws "$labelCol$r" $labels[$i]
      Set-Value $ws "$maxCol$r" $maxes[$i]
      $scoreCol = $scoreCols[$i]
      $scoreRange = 'Effective_Data!$' + $scoreCol + ':$' + $scoreCol
      if ($scope -eq 'week') {
        if ($AgentScoped) {
          $f = '=IFERROR(ROUND(AVERAGEIFS(' + $scoreRange + ',Effective_Data!$B:$B,Control_Panel!$B$4,Effective_Data!$C:$C,">="&Control_Panel!$B$6,Effective_Data!$C:$C,"<="&Control_Panel!$B$6+6),2),"")'
        } else {
          $f = '=IFERROR(ROUND(AVERAGEIFS(' + $scoreRange + ',Effective_Data!$C:$C,">="&Control_Panel!$B$6,Effective_Data!$C:$C,"<="&Control_Panel!$B$6+6),2),"")'
        }
      } else {
        if ($AgentScoped) {
          $f = '=IFERROR(ROUND(AVERAGEIFS(' + $scoreRange + ',Effective_Data!$B:$B,Control_Panel!$B$4,Effective_Data!$AT:$AT,Control_Panel!$B$5),2),"")'
        } else {
          $f = '=IFERROR(ROUND(AVERAGEIFS(' + $scoreRange + ',Effective_Data!$AT:$AT,Control_Panel!$B$5),2),"")'
        }
      }
      Set-Formula $ws "$avgCol$r" $f
      Set-Formula $ws "$pctCol$r" ('=IFERROR(' + $avgCol + $r + '/' + $maxCol + $r + ',"")')
      if ($statusCol) {
        Set-Formula $ws "$statusCol$r" ('=IF(' + $pctCol + $r + '="","",IF(' + $pctCol + $r + '>=0.9,"Strong",IF(' + $pctCol + $r + '>=0.7,"Good",IF(' + $pctCol + $r + '>=0.6,"Watch","Improve"))))')
      }
    } else {
      foreach ($col in @($codeCol,$labelCol,$avgCol,$maxCol,$pctCol,$statusCol)) {
        if ($col) { Set-Value $ws "$col$r" '' }
      }
    }
  }
}
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $wb = $excel.Workbooks.Open($path)

  $weekly = $wb.Worksheets.Item('Weekly_Dashboard')
  $weeklyAgentFormula = '=IFERROR(INDEX(SORT(UNIQUE(FILTER(Effective_Data!$B$5:$B$3000,(Effective_Data!$B$5:$B$3000<>"")*(Effective_Data!$C$5:$C$3000>=Control_Panel!$B$6)*(Effective_Data!$C$5:$C$3000<=Control_Panel!$B$6+6)))),{N}),"")'
  Fix-AgentRanking $weekly $weeklyAgentFormula 14 27
  ApplyTopicBlock $weekly 'N' 'O' 'P' 'Q' 'R' '' 32 'week'
  $legacyWeeklyCols = @('AH','AJ','AL','AN')
  for ($i = 0; $i -lt $legacyWeeklyCols.Count; $i++) {
    $r = 153 + $i
    $col = $legacyWeeklyCols[$i]
    Set-Formula $weekly "C$r" ('=IF(Control_Panel!$B$6>=DATE(2026,6,1),"",IFERROR(ROUND(AVERAGEIFS(Effective_Data!$' + $col + ':$' + $col + ',Effective_Data!$C:$C,">="&Control_Panel!$B$6,Effective_Data!$C:$C,"<="&Control_Panel!$B$6+6),2),""))')
  }

  $weeklyByAgent = $wb.Worksheets.Item('Weekly_QA_by_Agent')
  ApplyTopicBlock $weeklyByAgent 'A' 'B' 'C' 'D' 'E' '' 29 'week' -AgentScoped

  $monthly = $wb.Worksheets.Item('Monthly_Dashboard')
  ApplyTopicBlock $monthly 'A' 'B' 'C' 'D' 'E' '' 39 'month' -AgentScoped

  $monthlyTeam = $wb.Worksheets.Item('Monthly_Team_Summary')
  $monthlyAgentFormula = '=IFERROR(INDEX(SORT(UNIQUE(FILTER(Effective_Data!$B$5:$B$3000,(Effective_Data!$B$5:$B$3000<>"")*(Effective_Data!$AT$5:$AT$3000=Control_Panel!$B$5)))),{N}),"")'
  Fix-AgentRanking $monthlyTeam $monthlyAgentFormula 14 27
  ApplyTopicBlock $monthlyTeam 'A' 'B' 'C' 'D' 'E' 'F' 31 'month'

  $excel.CalculateFullRebuild()
  $wb.Save()
  Write-Output "Backup created: ${backup}"
  Write-Output "Dashboard formulas fixed: topic performance and A-Z agent ranking"
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
    timeout: 300000,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`Dashboard formula fix failed with exit code ${result.status}`);
}

const backupPath = makeBackup(TARGET_WORKBOOK);
runPowerShell(backupPath);
