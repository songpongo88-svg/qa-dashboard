# Launch a separate QA PostgreSQL archive-only probe on port 8788.
# Uses an EXISTING local read-only bridge configuration and the EXISTING PostgreSQL DB.
# No QA schema migrations, data imports, case writes, Firestore access, or failover.
[CmdletBinding()]
param([switch]$CheckOnly)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$oldBridge = Join-Path $HOME 'Documents\QA_Backup\bridge'
$envFile = Join-Path $oldBridge '.env.local'
$probeRoot = Join-Path $HOME 'Documents\QA_Backup\standby-probe'
$repoCommit = '87f26bf8fff345a94b7b7f5c90b826a8a775afb8'
$endpoint = 'http://127.0.0.1:8788'
if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
  Write-Output 'QA_8788=EXISTING_BRIDGE_CONFIG_NOT_FOUND'
  exit 2
}

# Read only four existing QA config keys. Never print their values.
$settings = @{}
foreach ($line in [IO.File]::ReadAllLines($envFile)) {
  if ($line -match '^\s*(QA_DB_NAME|QA_DB_USER|QA_DB_PASSWORD|QA_LOCAL_API_TOKEN)\s*=\s*(.*)$') {
    $value = $Matches[2].Trim()
    if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'")))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $settings[$Matches[1]] = $value
  }
}
foreach ($key in @('QA_DB_NAME','QA_DB_USER','QA_DB_PASSWORD','QA_LOCAL_API_TOKEN')) {
  if (-not $settings.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($settings[$key])) {
    Write-Output ('QA_8788=MISSING_EXISTING_CONFIG_' + $key)
    exit 2
  }
}
if ($settings['QA_DB_NAME'] -ne 'qa_dashboard_lab') {
  Write-Output 'QA_8788=UNEXPECTED_DATABASE_NAME'
  exit 2
}
if ($settings['QA_LOCAL_API_TOKEN'].Length -lt 40) {
  Write-Output 'QA_8788=EXISTING_TOKEN_TOO_SHORT_FOR_NEW_BRIDGE'
  Write-Output 'QA_8788=NO_NEW_TOKEN_CREATED'
  exit 2
}

function Test-QaProbe {
  try {
    $headers = @{ Authorization = ('Bearer ' + $settings['QA_LOCAL_API_TOKEN']) }
    $r = Invoke-RestMethod -Uri ($endpoint + '/ready') -Headers $headers -TimeoutSec 5
    $s = Invoke-RestMethod -Uri ($endpoint + '/summary') -Headers $headers -TimeoutSec 5
    if ($r.ok -ne $true -or $r.readOnly -ne $true -or
        $r.databaseConnected -ne $true -or $r.failoverReady -ne $false -or
        $s.ok -ne $true -or $s.readOnly -ne $true -or $s.failoverReady -ne $false) {
      Write-Host 'QA_8788=UNEXPECTED_SERVER_RESPONSE'
      return $false
    }
    Write-Host 'QA_8788=LOCAL_READ_ONLY_READY'
    Write-Host ('QA_8788_ARCHIVE_COLLECTIONS=' + [string]$s.collectionCount)
    Write-Host ('QA_8788_ARCHIVE_DOCUMENTS=' + [string]$s.sourceDocumentCount)
    Write-Host ('QA_8788_ARCHIVE_COUNT_MATCH=' + [string]$s.importedArchiveCountMatch)
    Write-Host ('QA_8788_STANDBY_MODE=' + [string]$s.standbyMode)
    Write-Output 'QA_8788_FIRESTORE_LIVE_PARITY=UNVERIFIED'
    return $true
  } catch {
    Write-Host 'QA_8788=NOT_REACHABLE_OR_TOKEN_MISMATCH'
    return $false
  }
}

if ($CheckOnly) {
  if (Test-QaProbe) { exit 0 }
  exit 3
}

$occupied = Get-NetTCPConnection -LocalPort 8788 -State Listen -ErrorAction SilentlyContinue
if ($occupied) {
  if (Test-QaProbe) {
    Write-Output 'QA_8788=ALREADY_RUNNING'
    exit 0
  }
  Write-Output 'QA_8788=PORT_IN_USE_BY_OTHER_PROCESS'
  exit 3
}
$node = Get-Command node -ErrorAction SilentlyContinue
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($null -eq $node -or $null -eq $npm) {
  Write-Output 'QA_8788=NODE_OR_NPM_NOT_FOUND'
  exit 2
}

$serverDir = Join-Path $probeRoot 'server'
New-Item -Path $serverDir -ItemType Directory -Force | Out-Null
$packageFile = Join-Path $probeRoot 'package.json'
if (-not (Test-Path -LiteralPath $packageFile)) {
  [IO.File]::WriteAllText($packageFile,
    '{"name":"qa-standby-local-readonly-probe","private":true,"type":"module"}' + [Environment]::NewLine,
    (New-Object System.Text.UTF8Encoding($false)))
}
$base = 'https://raw.githubusercontent.com/songpongo88-svg/qa-dashboard/' + $repoCommit + '/server/'
foreach ($filename in @('qaLocalBridgeServer.js','qaStandbyArchiveStatus.js','qaStandbySnapshotReadiness.js','qaLiveMirrorStage.js')) {
  $destination = Join-Path $serverDir $filename
  try {
    Invoke-WebRequest -Uri ($base + $filename) -OutFile $destination -UseBasicParsing -TimeoutSec 30
  } catch {
    Write-Output 'QA_8788=SAFE_READ_ONLY_CODE_DOWNLOAD_FAILED'
    exit 2
  }
}
$pgPackage = Join-Path $probeRoot 'node_modules\pg\package.json'
if (-not (Test-Path -LiteralPath $pgPackage)) {
  Write-Output 'QA_8788=INSTALLING_ISOLATED_NODE_DRIVER'
  Push-Location $probeRoot
  try {
    & $npm.Source install 'pg@8.16.3' --ignore-scripts --no-save --no-package-lock --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
      Write-Output 'QA_8788=LOCAL_DRIVER_INSTALL_FAILED'
      exit 2
    }
  } finally { Pop-Location }
}
$encodedUser = [Uri]::EscapeDataString($settings['QA_DB_USER'])
$encodedPassword = [Uri]::EscapeDataString($settings['QA_DB_PASSWORD'])
$env:QA_LOCAL_DATABASE_URL = ('postgresql://' + $encodedUser + ':' + $encodedPassword +
  '@127.0.0.1:5432/qa_dashboard_lab')
$env:QA_LOCAL_BRIDGE_TOKEN = $settings['QA_LOCAL_API_TOKEN']
$env:QA_LOCAL_BRIDGE_PORT = '8788'
Write-Output 'QA_8788=STARTING_LOCAL_READ_ONLY'
Write-Output 'QA_8787=UNCHANGED'
Write-Output 'QA_POSTGRES=EXISTING_DATABASE_ONLY'
Write-Output 'QA_FIRESTORE=PRIMARY_UNCHANGED'
Write-Output 'QA_FAILOVER=OFF'
Write-Output 'QA_8788=LEAVE_THIS_WINDOW_OPEN'
& $node.Source (Join-Path $serverDir 'qaLocalBridgeServer.js')
if ($LASTEXITCODE -ne 0) {
  Write-Output 'QA_8788=SERVER_STOPPED_WITH_ERROR'
  exit $LASTEXITCODE
}
