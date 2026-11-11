# QA-only guarded local source snapshot import. Windows PostgreSQL remains standby.
# Does NOT change production, archive, user passwords or failover.
[CmdletBinding()]
param([switch]$CheckOnly)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ErrorView = 'ConciseView'
$root = Join-Path $HOME 'Documents\QA_Backup'
$configFile = Join-Path $root 'bridge\.env.local'
$expectedDb = 'qa_dashboard_lab'
$required = @('QA_DB_NAME','QA_DB_USER','QA_DB_PASSWORD')
function Stop-Safe([string]$reason) { Write-Output ("QA_SNAPSHOT=" + $reason); exit 2 }
if (-not (Test-Path -LiteralPath $configFile -PathType Leaf)) { Stop-Safe 'EXISTING_CONFIG_NOT_FOUND' }
$config=@{}
foreach($line in [IO.File]::ReadAllLines($configFile)) {
  if($line -match '^\s*(QA_DB_NAME|QA_DB_USER|QA_DB_PASSWORD|QA_FIRESTORE_PROJECT_ID)\s*=\s*(.*)$') {
    $v=$Matches[2].Trim()
    if($v.Length -ge 2 -and (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'")))) {
      $v=$v.Substring(1,$v.Length-2)
    }
    $config[$Matches[1]]=$v
  }
}
foreach($key in $required) { if(-not $config.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($config[$key])) { Stop-Safe ('MISSING_'+$key) } }
if($config['QA_DB_NAME'] -ne $expectedDb) { Stop-Safe 'UNEXPECTED_DATABASE' }
$node=Get-Command node -ErrorAction SilentlyContinue
$npm=Get-Command npm.cmd -ErrorAction SilentlyContinue
if($null -eq $node -or $null -eq $npm) { Stop-Safe 'NODE_NOT_INSTALLED' }
$project = [Environment]::GetEnvironmentVariable('QA_FIRESTORE_PROJECT_ID','Process')
if([string]::IsNullOrWhiteSpace($project)) { $project = [Environment]::GetEnvironmentVariable('QA_FIRESTORE_PROJECT_ID','User') }
if([string]::IsNullOrWhiteSpace($project) -and $config.ContainsKey('QA_FIRESTORE_PROJECT_ID')) { $project=$config['QA_FIRESTORE_PROJECT_ID'] }
if($project -cnotmatch '^[a-z][a-z0-9-]{4,62}$') { Stop-Safe 'FIRESTORE_PROJECT_ID_NOT_CONFIGURED' }
$gcloud=Get-Command gcloud.cmd -ErrorAction SilentlyContinue
if($null -eq $gcloud) { $gcloud=Get-Command gcloud -ErrorAction SilentlyContinue }
if($null -eq $gcloud) { Stop-Safe 'GCLOUD_CLI_NOT_AVAILABLE' }
# ADC must already be authorized. Never prompt for service-account keys or print OAuth credentials.
$oauth = (& $gcloud.Source auth application-default print-access-token 2>$null | Select-Object -First 1)
if($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($oauth) -or $oauth.Length -lt 20) {
  Stop-Safe 'ADC_NOT_AUTHORIZED'
}
# Prevent accidental tokens appearing in PowerShell history or diagnostics.
$env:QA_FIRESTORE_OAUTH_ACCESS_TOKEN = $oauth
$env:QA_FIRESTORE_PROJECT_ID = $project
$env:QA_LIVE_SNAPSHOT_STAGE_ONLY = '1'
$encUser=[Uri]::EscapeDataString($config['QA_DB_USER'])
$encPassword=[Uri]::EscapeDataString($config['QA_DB_PASSWORD'])
$env:QA_LOCAL_DATABASE_URL = ('postgresql://' + $encUser + ':' + $encPassword + '@127.0.0.1:5432/' + $expectedDb)
$oauth=$null
$encPassword=$null
$encUser=$null
$repoRoot=Join-Path $root 'source-stage'
if(-not (Test-Path -LiteralPath $repoRoot -PathType Container)) { Stop-Safe 'SOURCE_STAGE_CHECKOUT_REQUIRED' }
$runner=Join-Path $repoRoot 'scripts\Run-QA-Authoritative-Snapshot-Stage.mjs'
$preflight=Join-Path $repoRoot 'scripts\check-qa-source-stage-preflight.mjs'
if(-not (Test-Path -LiteralPath $runner -PathType Leaf) -or -not (Test-Path -LiteralPath $preflight -PathType Leaf)) {
  Stop-Safe 'SOURCE_STAGE_FILES_MISSING'
}
Push-Location $repoRoot
try {
  & $node.Source $preflight
  if($LASTEXITCODE -ne 0) { Stop-Safe 'PREFLIGHT_BLOCKED' }
  if($CheckOnly) {
    Write-Output 'QA_SNAPSHOT=CONFIG_READY_NO_DATA_READ'
    Write-Output 'QA_FAILOVER=OFF'
    exit 0
  }
  $pg = Join-Path $repoRoot 'node_modules\pg\package.json'
  if(-not (Test-Path -LiteralPath $pg -PathType Leaf)) {
    & $npm.Source install 'pg@8.16.3' --ignore-scripts --no-save --no-package-lock --no-audit --no-fund 1>$null
    if($LASTEXITCODE -ne 0) { Stop-Safe 'LOCAL_PG_DRIVER_INSTALL_FAILED' }
  }
  & $node.Source $runner
  if($LASTEXITCODE -ne 0) { Stop-Safe 'SOURCE_STAGE_FAILED_CLOSED' }
  Write-Output 'QA_SNAPSHOT=STAGED_NOT_ACTIVE'
  Write-Output 'QA_FAILOVER=OFF'
} finally {
  Pop-Location
  Remove-Item Env:\QA_FIRESTORE_OAUTH_ACCESS_TOKEN -ErrorAction SilentlyContinue
  Remove-Item Env:\QA_LOCAL_DATABASE_URL -ErrorAction SilentlyContinue
}
