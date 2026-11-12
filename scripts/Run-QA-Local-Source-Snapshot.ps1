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
# Download only the minimum QA-only source files from an immutable reviewed commit.
# Never overwrite the existing bridge, archive, or an already-installed different version.
$pinnedCommit = '05533e626820560f592d4467b7da89b0a67873c7'
$marker = Join-Path $repoRoot '.qa-source-commit'
$files = @(
  'scripts/Run-QA-Authoritative-Snapshot-Stage.mjs',
  'scripts/check-qa-source-stage-preflight.mjs',
  'server/qaLocalBridgeServer.js',
  'server/qaStandbyArchiveStatus.js',
  'server/qaStandbySnapshotReadiness.js',
  'server/qaFirestoreRestSnapshot.js',
  'server/qaLiveMirrorStage.js',
  'server/qaStandbyCandidateMaterializer.js',
  'server/qaFirestoreSnapshotCodec.js',
  'migration/qa-local-live-snapshot-stage.sql'
)
if(Test-Path -LiteralPath $repoRoot -PathType Container) {
  if(-not (Test-Path -LiteralPath $marker -PathType Leaf) -or
      ([IO.File]::ReadAllText($marker).Trim() -ne $pinnedCommit)) {
    Stop-Safe 'SOURCE_STAGE_VERSION_UNVERIFIED'
  }
} else {
  $temporary=Join-Path $root ('qa-source-install-'+[Guid]::NewGuid().ToString('N'))
  try {
    foreach($file in $files) {
      $dest=Join-Path $temporary ($file.Replace('/','\'))
      $parent=Split-Path -Parent $dest
      New-Item -ItemType Directory -Path $parent -Force | Out-Null
      $url='https://raw.githubusercontent.com/songpongo88-svg/qa-dashboard/'+$pinnedCommit+'/'+$file
      Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing -TimeoutSec 30
      if(-not (Test-Path -LiteralPath $dest -PathType Leaf)) { throw 'source_missing' }
    }
    [IO.File]::WriteAllText((Join-Path $temporary 'package.json'),
       '{"name":"qa-source-standby","private":true,"type":"module"}')
    [IO.File]::WriteAllText((Join-Path $temporary '.qa-source-commit'),$pinnedCommit)
    Move-Item -LiteralPath $temporary -Destination $repoRoot -ErrorAction Stop
  } catch {
    Stop-Safe 'PINNED_QA_SOURCE_DOWNLOAD_FAILED'
  } finally {
    if(Test-Path -LiteralPath $temporary) {
      Remove-Item -LiteralPath $temporary -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}
foreach($file in $files) {
  if(-not (Test-Path -LiteralPath (Join-Path $repoRoot ($file.Replace('/','\'))) -PathType Leaf)) {
    Stop-Safe 'PINNED_QA_SOURCE_INCOMPLETE'
  }
}
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
