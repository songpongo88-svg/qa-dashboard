$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$WorkbookPath = "C:\Users\Songpon\OneDrive - Purple Ventures\Report QA\ROWDATA\QA_Score_Dashboard_byDao_V13.xlsx"
$StartedAt = Get-Date

function Write-Step($Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Test-WorkbookWritable($Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "ไม่พบไฟล์ Excel: $Path"
  }

  $stream = $null
  try {
    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    return $true
  } catch {
    return $false
  } finally {
    if ($stream) { $stream.Close() }
  }
}

function Invoke-NodeStep($ScriptPath) {
  Write-Step $ScriptPath
  & node $ScriptPath
  if ($LASTEXITCODE -ne 0) {
    throw "คำสั่งล้มเหลว: node $ScriptPath"
  }
}

function Stop-NewHeadlessExcelProcesses($StartedAfter) {
  $processes = Get-Process EXCEL -ErrorAction SilentlyContinue | Where-Object {
    $_.StartTime -ge $StartedAfter -and [string]::IsNullOrWhiteSpace($_.MainWindowTitle)
  }

  foreach ($process in $processes) {
    try {
      Write-Host "Closing background Excel process PID $($process.Id)" -ForegroundColor DarkYellow
      Stop-Process -Id $process.Id -Force
    } catch {
      Write-Host "Could not close Excel PID $($process.Id): $($_.Exception.Message)" -ForegroundColor Yellow
    }
  }
}

Write-Host "QA Dashboard V13 Excel Sync" -ForegroundColor Magenta
Write-Host "Workbook: $WorkbookPath"
Write-Host "Repo: $RepoRoot"

if (-not (Test-WorkbookWritable $WorkbookPath)) {
  Write-Host ""
  Write-Host "Workbook is open or locked. Please close QA_Score_Dashboard_byDao_V13.xlsx, then run this button again." -ForegroundColor Yellow
  Write-Host ""
  Read-Host "Press Enter to close"
  exit 1
}

Set-Location $RepoRoot
$env:QA_V13_WORKBOOK = $WorkbookPath

try {
  Invoke-NodeStep ".\scripts\sync-v13-excel-data-only.mjs"
  Invoke-NodeStep ".\scripts\repair-v13-rawdata-formulas.mjs"
  Invoke-NodeStep ".\scripts\sort-v13-rawdata.mjs"
  Invoke-NodeStep ".\scripts\rebuild-v13-effective-data.mjs"
  Invoke-NodeStep ".\scripts\fix-v13-dashboard-formulas.mjs"

  Write-Host ""
  Write-Host "Sync completed. You can open the V13 workbook now." -ForegroundColor Green
} catch {
  Write-Host ""
  Write-Host "Sync failed:" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
} finally {
  Stop-NewHeadlessExcelProcesses $StartedAt
  Write-Host ""
  Read-Host "Press Enter to close"
}
