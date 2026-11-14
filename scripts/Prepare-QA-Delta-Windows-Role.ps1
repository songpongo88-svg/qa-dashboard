# Prepare QA delta receiver on the existing Windows PostgreSQL 17 standby.
# Without -Apply: inspection only. With -Apply: local pg_dump backup,
# NOLOGIN journal-only PostgreSQL role and inactive receiver source files.
# NEVER opens a network listener, calls Firestore or enables QA failover.
[CmdletBinding()]
param([switch]$Apply)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Join-Path $HOME 'Documents\QA_Backup'
$stage = Join-Path $root 'source-stage'
$marker = Join-Path $stage '.qa-delta-receiver-prepared'
$budgetMarker = Join-Path $stage '.qa-source-read-budget-commit'
$deltaMarker = Join-Path $stage '.qa-source-delta-schema-commit'
$backupDir = Join-Path $root 'snapshot-db-backups'
$budgetVersion = 'b5ded62cff292fc8270c641c3149c336a5a6623f'
$schemaVersion = '174e507621b287e1a0c95dca5707d9b9d64bc9dc'
$runtimeVersion = '3d64c35d9ca9f8cacf757ed293d351adea788418'
$required = @(
  'server/qaSourceDeltaJournal.js',
  'server/qaSourceDeltaHttpHandler.js',
  'server/qaGoogleTaskAttestor.js',
  'server/qaWindowsDeltaReceiver.js'
)
function Status([string]$code) { Write-Output ('QA_DELTA_PREPARE=' + $code) }
function Block([string]$code) {
  Status $code
  Write-Output 'QA_FIRESTORE_READS=0'
  Write-Output 'QA_FAILOVER=OFF'
  exit 2
}
function PgTool([string]$name) {
  $found = Get-Command $name -ErrorAction SilentlyContinue
  if($null -ne $found) { return $found.Source }
  $fallback = Join-Path 'C:\Program Files\PostgreSQL\17\bin' $name
  if(Test-Path -LiteralPath $fallback -PathType Leaf) { return $fallback }
  return $null
}
function Reveal([Security.SecureString]$password) {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
if(-not (Test-Path -LiteralPath $stage -PathType Container) -or
   -not (Test-Path -LiteralPath $budgetMarker -PathType Leaf) -or
   -not (Test-Path -LiteralPath $deltaMarker -PathType Leaf) -or
   [IO.File]::ReadAllText($budgetMarker).Trim() -cne $budgetVersion -or
   [IO.File]::ReadAllText($deltaMarker).Trim() -cne $schemaVersion) {
  Block 'EXISTING_QA_STANDBY_STAGE_NOT_VERIFIED'
}
foreach($name in @(
  'server/qaLiveMirrorStage.js',
  'server/qaLocalBridgeServer.js',
  'node_modules/pg/package.json'
)){
  if(-not (Test-Path -LiteralPath (Join-Path $stage ($name.Replace('/','\'))) -PathType Leaf)) {
    Block 'REQUIRED_QA_RUNTIME_MISSING'
  }
}
$psql = PgTool 'psql.exe'
$dump = PgTool 'pg_dump.exe'
$node = Get-Command node -ErrorAction SilentlyContinue
if(-not $psql -or -not $dump -or $null -eq $node) {
  Block 'POSTGRES_17_OR_NODE_NOT_FOUND'
}
if(Test-Path -LiteralPath $marker -PathType Leaf) {
  if([IO.File]::ReadAllText($marker).Trim() -cne $runtimeVersion) {
    Block 'UNRECOGNIZED_PREPARATION_VERSION'
  }
  foreach($name in $required) {
    if(-not (Test-Path -LiteralPath (Join-Path $stage ($name.Replace('/','\'))) -PathType Leaf)) {
      Block 'PREPARED_RECEIVER_FILES_MISSING'
    }
  }
  Status 'ALREADY_PREPARED_NOLOGIN'
  Write-Output 'QA_DELTA_RECEIVER=NOT_STARTED'
  Write-Output 'QA_FIRESTORE_READS=0'
  Write-Output 'QA_FAILOVER=OFF'
  exit 0
}
if(-not $Apply) {
  Status 'READY_FOR_EXPLICIT_PREPARATION'
  Write-Output 'QA_POSTGRES_WRITES=0'
  Write-Output 'QA_FIRESTORE_READS=0'
  Write-Output 'QA_FAILOVER=OFF'
  exit 0
}
$temp = Join-Path $root ('qa-delta-runtime-stage-' + [guid]::NewGuid().ToString('N'))
$password = $null
$changes = @()
$prepared = $false
try {
  New-Item -Path $temp -ItemType Directory -Force | Out-Null
  $download = @('migration/qa-source-delta-ingester-role.sql') + $required
  foreach($name in $download) {
    $dest = Join-Path $temp ($name.Replace('/','\'))
    New-Item -Path (Split-Path -Parent $dest) -ItemType Directory -Force | Out-Null
    $url = 'https://raw.githubusercontent.com/songpongo88-svg/qa-dashboard/' +
      $runtimeVersion + '/' + $name
    Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
    if((Get-Item -LiteralPath $dest).Length -lt 100) {
      Block 'PINNED_SOURCE_INCOMPLETE'
    }
  }
  $roleSql = [IO.File]::ReadAllText((Join-Path $temp 'migration\qa-source-delta-ingester-role.sql'))
  if(-not $roleSql.Contains('CREATE ROLE qa_delta_ingester NOLOGIN NOINHERIT') -or
     -not $roleSql.Contains('ALTER ROLE qa_delta_ingester NOLOGIN') -or
     -not $roleSql.Contains('GRANT SELECT,INSERT,UPDATE ON qa_failover_v1.source_delta_events') -or
     -not $roleSql.Contains('REVOKE ALL ON qa_failover_v1.evaluations') -or
     -not $roleSql.Contains('COMMIT;') -or
     $roleSql -match '(?i)\bDROP\b|\bTRUNCATE\b|\bALTER TABLE\b|\bGRANT ALL\b') {
    Block 'PINNED_ROLE_POLICY_UNRECOGNIZED'
  }
  foreach($name in $required) {
    & $node.Source --check (Join-Path $temp ($name.Replace('/','\'))) 1>$null 2>$null
    if($LASTEXITCODE -ne 0) { Block 'PINNED_RUNTIME_SYNTAX_INVALID' }
  }
  $secret = Read-Host 'Local PostgreSQL postgres administrator password' -AsSecureString
  $password = Reveal $secret
  Remove-Variable secret -ErrorAction SilentlyContinue
  if([string]::IsNullOrWhiteSpace($password)) { Block 'POSTGRES_PASSWORD_MISSING' }
  $env:PGPASSWORD = $password
  $preflight = @'
SELECT CASE WHEN current_database()='qa_dashboard_lab'
  AND current_setting('server_version_num')::integer BETWEEN 170000 AND 179999
  AND NOT pg_is_in_recovery()
  AND to_regclass('qa_failover_v1.source_delta_events') IS NOT NULL
  AND to_regclass('qa_failover_v1.source_delta_latest') IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM qa_failover_v1.state s
    JOIN qa_failover_v1.live_snapshot_batches b
      ON s.active_snapshot_id=b.snapshot_id
    WHERE s.id=1 AND s.mode='disabled' AND s.write_frozen IS TRUE
      AND s.source_snapshot_verified IS FALSE
      AND b.status='copy_verified' AND b.approved_for_failover IS FALSE
      AND b.source_documents=b.stored_documents
  )
  AND NOT EXISTS(
    SELECT 1 FROM pg_roles
    WHERE rolname='qa_delta_ingester'
      AND (rolcanlogin OR rolsuper OR rolcreaterole OR rolcreatedb
           OR rolreplication OR rolinherit OR rolbypassrls)
  )
  THEN 'SAFE' ELSE 'BLOCKED' END;
'@
  $check = @(& $psql -X -w -A -t -h 127.0.0.1 -p 5432 -U postgres -d qa_dashboard_lab -v ON_ERROR_STOP=1 -c $preflight 2>$null)
  if($LASTEXITCODE -ne 0 -or ($check -join '').Trim() -cne 'SAFE') {
    Block 'FROZEN_STANDBY_OR_ROLE_POLICY_NOT_VERIFIED'
  }
  Status 'FROZEN_STANDBY_VERIFIED'
  New-Item -Path $backupDir -ItemType Directory -Force | Out-Null
  $backup = Join-Path $backupDir ('qa_before_delta_role_' + (Get-Date -Format 'yyyyMMdd_HHmmss') + '.backup')
  & $dump -w -h 127.0.0.1 -p 5432 -U postgres -d qa_dashboard_lab -Fc -f $backup 2>$null
  if($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $backup -PathType Leaf) -or
     (Get-Item -LiteralPath $backup).Length -lt 1024) {
    Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
    Block 'PREPARATION_BACKUP_FAILED'
  }
  Status 'DATABASE_BACKUP_CREATED'
  & $psql -X -q -w -h 127.0.0.1 -p 5432 -U postgres -d qa_dashboard_lab -v ON_ERROR_STOP=1 -f (Join-Path $temp 'migration\qa-source-delta-ingester-role.sql') 1>$null 2>$null
  if($LASTEXITCODE -ne 0) { Block 'DELTA_ROLE_TRANSACTION_FAILED' }
  $rights = @'
SELECT CASE WHEN EXISTS(
 SELECT 1 FROM pg_roles
 WHERE rolname='qa_delta_ingester'
 AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb
 AND NOT rolreplication AND NOT rolinherit AND NOT rolbypassrls
)
 AND has_schema_privilege('qa_delta_ingester','qa_failover_v1','USAGE')
 AND has_table_privilege('qa_delta_ingester','qa_failover_v1.state','SELECT')
 AND NOT has_table_privilege('qa_delta_ingester','qa_failover_v1.state','UPDATE')
 AND has_table_privilege('qa_delta_ingester','qa_failover_v1.live_snapshot_batches','SELECT')
 AND has_table_privilege('qa_delta_ingester','qa_failover_v1.source_delta_events','SELECT')
 AND has_table_privilege('qa_delta_ingester','qa_failover_v1.source_delta_events','INSERT')
 AND has_table_privilege('qa_delta_ingester','qa_failover_v1.source_delta_events','UPDATE')
 AND has_table_privilege('qa_delta_ingester','qa_failover_v1.source_delta_latest','SELECT')
 AND has_table_privilege('qa_delta_ingester','qa_failover_v1.source_delta_latest','INSERT')
 AND has_table_privilege('qa_delta_ingester','qa_failover_v1.source_delta_latest','UPDATE')
 AND NOT has_table_privilege('qa_delta_ingester','qa_failover_v1.evaluations','INSERT')
 AND NOT has_table_privilege('qa_delta_ingester','qa_failover_v1.evaluations','UPDATE')
 AND NOT has_table_privilege('qa_delta_ingester','qa_failover_v1.outbox','INSERT')
 AND NOT has_table_privilege('qa_delta_ingester','qa_failover_v1.outbox','UPDATE')
 THEN 'SAFE' ELSE 'BLOCKED' END;
'@
  $verified = @(& $psql -X -w -A -t -h 127.0.0.1 -p 5432 -U postgres -d qa_dashboard_lab -v ON_ERROR_STOP=1 -c $rights 2>$null)
  if($LASTEXITCODE -ne 0 -or ($verified -join '').Trim() -cne 'SAFE') {
    Block 'DELTA_ROLE_GRANT_CHECK_FAILED'
  }
  Status 'JOURNAL_ONLY_NOLOGIN_ROLE_VERIFIED'
  $time = Get-Date -Format 'yyyyMMdd_HHmmss'
  foreach($name in $required) {
    $target = Join-Path $stage ($name.Replace('/','\'))
    $incoming = Join-Path $temp ($name.Replace('/','\'))
    New-Item -Path (Split-Path -Parent $target) -ItemType Directory -Force | Out-Null
    $hadOriginal = Test-Path -LiteralPath $target -PathType Leaf
    $saved = $target + '.before-delta-' + $time
    if($hadOriginal) { Copy-Item -LiteralPath $target -Destination $saved -ErrorAction Stop }
    $changes += @{path=$target;backup=$saved;existed=$hadOriginal}
    Copy-Item -LiteralPath $incoming -Destination $target -Force -ErrorAction Stop
  }
  [IO.File]::WriteAllText($marker,$runtimeVersion)
  $prepared = $true
  Status 'JOURNAL_ROLE_AND_RUNTIME_PREPARED'
  Write-Output 'QA_DELTA_ROLE=NOLOGIN'
  Write-Output 'QA_DELTA_RECEIVER=NOT_STARTED'
  Write-Output 'QA_FIRESTORE_READS=0'
  Write-Output 'QA_FAILOVER=OFF'
} catch {
  if(-not $prepared) {
    for($i=$changes.Count-1;$i -ge 0;$i--) {
      $item=$changes[$i]
      try{
        if($item.existed) {
          Copy-Item -LiteralPath $item.backup -Destination $item.path -Force -ErrorAction Stop
        } else {
          Remove-Item -LiteralPath $item.path -Force -ErrorAction Stop
        }
      } catch { Status 'LOCAL_RUNTIME_RECOVERY_NEEDS_REVIEW' }
    }
    Remove-Item -LiteralPath $marker -Force -ErrorAction SilentlyContinue
  }
  # A partially completed attempt can leave the NOLOGIN role, which is safe
  # but must be independently rechecked before ever allowing a login.
  Block 'PREPARATION_FAILED_CLOSED'
} finally {
  $env:PGPASSWORD = $null
  $password = $null
  if(Test-Path -LiteralPath $temp) {
    Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
  }
}
