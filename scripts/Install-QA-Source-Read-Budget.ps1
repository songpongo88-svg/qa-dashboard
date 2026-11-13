# QA-only Windows installer for the durable Firestore source-read guard.
# Fetches pinned reviewed QA modules, backs up local PostgreSQL 17, installs
# a private daily reservation ledger and switches only the offline source
# staging runner. Does NOT read Firestore, write QA cases or enable failover.
[CmdletBinding()]
param([switch]$Apply)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Join-Path $HOME 'Documents\QA_Backup'
$source = Join-Path $root 'source-stage'
$marker = Join-Path $source '.qa-source-commit'
$budgetMarker = Join-Path $source '.qa-source-read-budget-commit'
$backupDir = Join-Path $root 'snapshot-db-backups'
$expectedOldSource = '05533e626820560f592d4467b7da89b0a67873c7'
# Immutable commit contains the previously reviewed budget SQL and runner.
# This pinned commit is intentionally older than the commit introducing
# this installer: the installer cannot pin its own not-yet-created hash.
$pinnedBudget = 'b5ded62cff292fc8270c641c3149c336a5a6623f'
$files = @(
  'scripts/Run-QA-Authoritative-Snapshot-Stage.mjs',
  'server/qaFirestoreRestSnapshot.js',
  'server/qaSourceReadBudget.js',
  'migration/qa-source-read-budget-daily.sql'
)
function Report([string]$message) {
  Write-Output ('QA_SOURCE_GUARD=' + $message)
}
function Stop-Safe([string]$code) {
  Report $code
  Write-Output 'QA_FAILOVER=OFF'
  exit 2
}
function Find-PgTool([string]$name) {
  $found = Get-Command $name -ErrorAction SilentlyContinue
  if ($null -ne $found) { return $found.Source }
  $fallback = Join-Path 'C:\Program Files\PostgreSQL\17\bin' $name
  if (Test-Path -LiteralPath $fallback -PathType Leaf) { return $fallback }
  return $null
}
function Reveal([Security.SecureString]$secret) {
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
if (-not (Test-Path -LiteralPath $source -PathType Container) -or
    -not (Test-Path -LiteralPath $marker -PathType Leaf) -or
    [IO.File]::ReadAllText($marker).Trim() -cne $expectedOldSource) {
  Stop-Safe 'EXISTING_SOURCE_STAGE_UNVERIFIED'
}
foreach ($name in @(
  'scripts/Run-QA-Authoritative-Snapshot-Stage.mjs',
  'server/qaFirestoreRestSnapshot.js',
  'server/qaLiveMirrorStage.js',
  'server/qaStandbyCandidateMaterializer.js',
  'server/qaLocalBridgeServer.js',
  'node_modules/pg/package.json'
)) {
  if (-not (Test-Path -LiteralPath (Join-Path $source ($name.Replace('/','\'))) -PathType Leaf)) {
    Stop-Safe 'EXISTING_SOURCE_STAGE_INCOMPLETE'
  }
}
$psql = Find-PgTool 'psql.exe'
$pgdump = Find-PgTool 'pg_dump.exe'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $psql -or -not $pgdump -or $null -eq $node) {
  Stop-Safe 'POSTGRES_17_OR_NODE_MISSING'
}
if (Test-Path -LiteralPath $budgetMarker -PathType Leaf) {
  $already = [IO.File]::ReadAllText($budgetMarker).Trim()
  if ($already -cne $pinnedBudget) { Stop-Safe 'BUDGET_VERSION_UNRECOGNIZED' }
  foreach ($name in $files) {
    if (-not (Test-Path -LiteralPath (Join-Path $source ($name.Replace('/','\'))) -PathType Leaf)) {
      Stop-Safe 'BUDGET_FILES_INCOMPLETE'
    }
  }
  Report 'ALREADY_INSTALLED_NO_FIRESTORE_READS'
  Write-Output 'QA_FAILOVER=OFF'
  exit 0
}
if (-not $Apply) {
  Report 'READY_FOR_EXPLICIT_LOCAL_INSTALL'
  Write-Output 'QA_FIRESTORE_READS=0'
  Write-Output 'QA_POSTGRES_WRITES=0'
  Write-Output 'QA_FAILOVER=OFF'
  exit 0
}

$tempDir = Join-Path $root ('qa-budget-install-' + [Guid]::NewGuid().ToString('N'))
$adminPwd = $null
$filesChanged = @()
$installCompleted = $false
try {
  New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
  # Download reviewed immutable source, not a mutable branch head.
  foreach ($name in $files) {
    $out = Join-Path $tempDir ($name.Replace('/','\'))
    New-Item -ItemType Directory -Path (Split-Path -Parent $out) -Force | Out-Null
    $url = 'https://raw.githubusercontent.com/songpongo88-svg/qa-dashboard/' + $pinnedBudget + '/' + $name
    Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
    if ((Get-Item -LiteralPath $out).Length -lt 100) { Stop-Safe 'REVIEWED_SOURCE_EMPTY' }
  }
  $runner = [IO.File]::ReadAllText((Join-Path $tempDir 'scripts\Run-QA-Authoritative-Snapshot-Stage.mjs'))
  $reader = [IO.File]::ReadAllText((Join-Path $tempDir 'server\qaFirestoreRestSnapshot.js'))
  $sql = [IO.File]::ReadAllText((Join-Path $tempDir 'migration\qa-source-read-budget-daily.sql'))
  if (-not $runner.Contains("import {createQaSourceReadBudget}") -or
      -not $runner.Contains('source_budget_ledger_not_installed') -or
      -not $runner.Contains('beforeRequest:request=>budget.reserve(request)') -or
      -not $reader.Contains('beforeRequest') -or
      -not $sql.Contains('source_read_budget_daily') -or
      -not $sql.Contains('BEGIN;') -or
      -not $sql.Contains('COMMIT;')) {
    Stop-Safe 'PINNED_GUARD_CONTENT_MISMATCH'
  }
  foreach ($name in @('scripts/Run-QA-Authoritative-Snapshot-Stage.mjs',
                       'server/qaFirestoreRestSnapshot.js',
                       'server/qaSourceReadBudget.js')) {
    & $node.Source --check (Join-Path $tempDir ($name.Replace('/','\'))) 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) { Stop-Safe 'PINNED_NODE_SYNTAX_INVALID' }
  }
  # Administrator password stays only on the Windows host, in this process.
  # Do not paste it into ChatGPT, Vercel, GitHub or a URL.
  $secure = Read-Host 'Local PostgreSQL postgres password' -AsSecureString
  $adminPwd = Reveal $secure
  Remove-Variable secure -ErrorAction SilentlyContinue
  if ([string]::IsNullOrWhiteSpace($adminPwd)) { Stop-Safe 'ADMIN_PASSWORD_MISSING' }
  $env:PGPASSWORD = $adminPwd
  $checkSql = @'
SELECT CASE WHEN current_database()='qa_dashboard_lab'
  AND current_setting('server_version_num')::integer BETWEEN 170000 AND 179999
  AND NOT pg_is_in_recovery()
  AND EXISTS (SELECT 1 FROM qa_failover_v1.state WHERE id=1
     AND mode='disabled' AND write_frozen IS TRUE AND source_snapshot_verified IS FALSE)
  AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname='qa_snapshot_importer')
  AND to_regclass('qa_failover_v1.live_snapshot_batches') IS NOT NULL
  THEN 'SAFE' ELSE 'BLOCKED' END;
'@
  $check = @(& $psql -X -w -A -t -h 127.0.0.1 -p 5432 -U postgres -d qa_dashboard_lab -v ON_ERROR_STOP=1 -c $checkSql 2>$null)
  if ($LASTEXITCODE -ne 0 -or ($check -join '').Trim() -cne 'SAFE') {
    Stop-Safe 'LOCAL_POSTGRES_STATE_NOT_SAFE'
  }
  Report 'LOCAL_STANDBY_FROZEN_VERIFIED'
  New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
  $backup = Join-Path $backupDir ('qa_before_source_guard_' + (Get-Date -Format 'yyyyMMdd_HHmmss') + '.backup')
  & $pgdump -w -h 127.0.0.1 -p 5432 -U postgres -d qa_dashboard_lab -Fc -f $backup 2>$null
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $backup -PathType Leaf) -or
      (Get-Item -LiteralPath $backup).Length -lt 1024) {
    Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
    Stop-Safe 'DATABASE_BACKUP_FAILED'
  }
  Report 'DATABASE_BACKUP_CREATED'
  # Additive private SQL ledger; no QA case, score, session or archive changes.
  & $psql -X -q -w -h 127.0.0.1 -p 5432 -U postgres -d qa_dashboard_lab -v ON_ERROR_STOP=1 -f (Join-Path $tempDir 'migration\qa-source-read-budget-daily.sql') 1>$null 2>$null
  if ($LASTEXITCODE -ne 0) { Stop-Safe 'SOURCE_BUDGET_MIGRATION_FAILED' }
  $proofSql = @'
SELECT CASE WHEN
  has_table_privilege('qa_snapshot_importer','qa_failover_v1.source_read_budget_daily','SELECT')
  AND has_table_privilege('qa_snapshot_importer','qa_failover_v1.source_read_budget_daily','INSERT')
  AND has_table_privilege('qa_snapshot_importer','qa_failover_v1.source_read_budget_daily','UPDATE')
  AND NOT has_table_privilege('qa_snapshot_importer','qa_failover_v1.evaluations','INSERT')
  AND NOT has_table_privilege('qa_snapshot_importer','qa_failover_v1.state','UPDATE')
 THEN 'SAFE' ELSE 'BLOCKED' END;
'@
  $proof = @(& $psql -X -w -A -t -h 127.0.0.1 -p 5432 -U postgres -d qa_dashboard_lab -v ON_ERROR_STOP=1 -c $proofSql 2>$null)
  if ($LASTEXITCODE -ne 0 -or ($proof -join '').Trim() -cne 'SAFE') {
    Stop-Safe 'IMPORTER_LEDGER_PERMISSION_NOT_SAFE'
  }
  Report 'PRIVATE_DAILY_LEDGER_VERIFIED'

  # Keep a recovery copy of each previous source module. The source-stage
  # marker remains unchanged for compatibility with the existing wrapper.
  $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
  foreach ($name in $files) {
    $target = Join-Path $source ($name.Replace('/','\'))
    $incoming = Join-Path $tempDir ($name.Replace('/','\'))
    $parent = Split-Path -Parent $target
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
    $original = Test-Path -LiteralPath $target -PathType Leaf
    $saved = $target + '.before-budget-' + $stamp
    if ($original) { Copy-Item -LiteralPath $target -Destination $saved -ErrorAction Stop }
    # Track before replacing, so a failed partial copy is also restored.
    $filesChanged += @{target=$target;saved=$saved;hadOriginal=$original}
    Copy-Item -LiteralPath $incoming -Destination $target -Force -ErrorAction Stop
  }
  # A marker is written last: an interrupted install never claims success.
  [IO.File]::WriteAllText($budgetMarker,$pinnedBudget)
  $installCompleted = $true
  Report 'INSTALLED_NO_FIRESTORE_READS'
  Write-Output 'QA_FIRESTORE_READS=0'
  Write-Output 'QA_FAILOVER=OFF'
} catch {
  # If the runtime update is interrupted, return to the previous local runner.
  if (-not $installCompleted) {
    for ($i=$filesChanged.Count-1; $i -ge 0; $i--) {
      $entry=$filesChanged[$i]
      try {
        if ($entry.hadOriginal) {
          Copy-Item -LiteralPath $entry.saved -Destination $entry.target -Force -ErrorAction Stop
        } else {
          Remove-Item -LiteralPath $entry.target -Force -ErrorAction Stop
        }
      } catch { Report 'RUNTIME_RESTORE_NEEDS_LOCAL_REVIEW' }
    }
    Remove-Item -LiteralPath $budgetMarker -Force -ErrorAction SilentlyContinue
  }
  # Fail closed and never print credential-bearing exceptions or file paths.
  Stop-Safe 'INSTALL_FAILED_CLOSED'
} finally {
  $env:PGPASSWORD = $null
  $adminPwd = $null
  if (Test-Path -LiteralPath $tempDir) {
    Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}
