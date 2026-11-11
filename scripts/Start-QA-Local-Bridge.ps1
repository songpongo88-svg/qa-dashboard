# QA PostgreSQL standby status bridge. Windows PowerShell 5.1+ / PowerShell 7.
# This does NOT import, alter, replay, or switch any QA data.
# Reuses the existing QA_LOCAL_DATABASE_URL and QA_LOCAL_BRIDGE_TOKEN
# configured for the local read-only bridge. Never print either value.
[CmdletBinding()]
param(
  [ValidateRange(1024,65535)][int]$Port = 8788,
  [switch]$CheckOnly
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$serverFile = Join-Path $root "server\qaLocalBridgeServer.js"
$token = [Environment]::GetEnvironmentVariable("QA_LOCAL_BRIDGE_TOKEN", "Process")
if ([string]::IsNullOrWhiteSpace($token)) {
  $token = [Environment]::GetEnvironmentVariable("QA_LOCAL_BRIDGE_TOKEN", "User")
}
if ([string]::IsNullOrWhiteSpace($token) -or $token.Length -lt 40) {
  Write-Output "QA_BRIDGE=SETUP_REQUIRED_TOKEN"
  exit 2
}

if ($CheckOnly) {
  try {
    $headers = @{ Authorization = ("Bearer " + $token); Accept = "application/json" }
    $origin = "http://127.0.0.1:$Port"
    $ready = Invoke-RestMethod -Method Get -Uri ($origin + "/ready") -Headers $headers -TimeoutSec 5
    if ($ready.ok -ne $true -or $ready.readOnly -ne $true -or $ready.databaseConnected -ne $true) {
      Write-Output "QA_BRIDGE=NOT_READY"
      exit 3
    }
    $summary = Invoke-RestMethod -Method Get -Uri ($origin + "/summary") -Headers $headers -TimeoutSec 5
    if ($summary.ok -ne $true -or $summary.readOnly -ne $true -or $summary.failoverReady -ne $false) {
      Write-Output "QA_BRIDGE=UNSAFE_RESPONSE"
      exit 4
    }
    Write-Output "QA_BRIDGE=READ_ONLY_READY"
    Write-Output ("QA_ARCHIVE_DOCUMENTS=" + [string]$summary.sourceDocumentCount)
    Write-Output ("QA_ARCHIVE_COLLECTIONS=" + [string]$summary.collectionCount)
    Write-Output ("QA_ARCHIVE_COUNT_MATCH=" + [string]$summary.importedArchiveCountMatch)
    Write-Output ("QA_STANDBY_MODE=" + [string]$summary.standbyMode)
    Write-Output "QA_FIRESTORE_LIVE_PARITY=UNVERIFIED"
    exit 0
  } catch {
    Write-Output "QA_BRIDGE=NOT_REACHABLE"
    exit 5
  }
}

$dbUrl = [Environment]::GetEnvironmentVariable("QA_LOCAL_DATABASE_URL", "Process")
if ([string]::IsNullOrWhiteSpace($dbUrl)) {
  $dbUrl = [Environment]::GetEnvironmentVariable("QA_LOCAL_DATABASE_URL", "User")
}
if ([string]::IsNullOrWhiteSpace($dbUrl)) {
  Write-Output "QA_BRIDGE=SETUP_REQUIRED_LOCAL_DATABASE_URL"
  exit 2
}
if (-not (Test-Path -LiteralPath $serverFile -PathType Leaf)) {
  Write-Output "QA_BRIDGE=SERVER_FILES_NOT_FOUND"
  exit 2
}
$node = Get-Command node -ErrorAction SilentlyContinue
if ($null -eq $node) {
  Write-Output "QA_BRIDGE=NODE_NOT_INSTALLED"
  exit 2
}
$pgPath = Join-Path $root "node_modules\pg\package.json"
if (-not (Test-Path -LiteralPath $pgPath -PathType Leaf)) {
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($null -eq $npm) {
    Write-Output "QA_BRIDGE=PG_DRIVER_MISSING"
    exit 2
  }
  Write-Output "QA_BRIDGE=INSTALLING_LOCAL_PG_DRIVER_ONLY"
  Push-Location $root
  try {
    & $npm.Source install "pg@8.16.3" --ignore-scripts --no-save --no-package-lock --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
      Write-Output "QA_BRIDGE=PG_DRIVER_INSTALL_FAILED"
      exit 2
    }
  } finally { Pop-Location }
}
$env:QA_LOCAL_DATABASE_URL = $dbUrl
$env:QA_LOCAL_BRIDGE_TOKEN = $token
$env:QA_LOCAL_BRIDGE_PORT = [string]$Port
Write-Output "QA_BRIDGE=STARTING_LOCAL_READ_ONLY"
Write-Output ("QA_BRIDGE_PORT=" + [string]$Port)
Write-Output "QA_FAILOVER=OFF"
# The process is deliberately foregrounded: closing this window stops the API.
& $node.Source $serverFile
if ($LASTEXITCODE -ne 0) {
  Write-Output "QA_BRIDGE=STOPPED_WITH_ERROR"
  exit $LASTEXITCODE
}
