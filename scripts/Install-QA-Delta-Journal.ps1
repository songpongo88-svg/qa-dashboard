# Additive QA-only local delta journal installer. Does not contact Firestore,
# enable automatic sync, rewrite evaluations, or activate the standby.
[CmdletBinding()]
param([switch]$Apply)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Join-Path $HOME 'Documents\QA_Backup'
$stage = Join-Path $root 'source-stage'
$budgetProof = Join-Path $stage '.qa-source-read-budget-commit'
$deltaProof = Join-Path $stage '.qa-source-delta-schema-commit'
$backupDir = Join-Path $root 'snapshot-db-backups'
$pinnedBudget = 'b5ded62cff292fc8270c641c3149c336a5a6623f'
$pinnedDelta = '174e507621b287e1a0c95dca5707d9b9d64bc9dc'
$sqlName = 'migration/qa-source-delta-journal.sql'

function Status([string]$code) { Write-Output ('QA_DELTA_SETUP=' + $code) }
function Abort([string]$code) {
  Status $code
  Write-Output 'QA_FIRESTORE_READS=0'
  Write-Output 'QA_FAILOVER=OFF'
  exit 2
}
function PgBin([string]$name) {
  $found=Get-Command $name -ErrorAction SilentlyContinue
  if($null -ne $found){return $found.Source}
  $path=Join-Path 'C:\Program Files\PostgreSQL\17\bin' $name
  if(Test-Path -LiteralPath $path -PathType Leaf){return $path}
  return $null
}
function Reveal([Security.SecureString]$secure) {
  $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try{return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)}
  finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
}
if(-not (Test-Path -LiteralPath $budgetProof -PathType Leaf) -or
   [IO.File]::ReadAllText($budgetProof).Trim() -cne $pinnedBudget) {
  Abort 'SOURCE_BUDGET_INSTALL_NOT_VERIFIED'
}
if(Test-Path -LiteralPath $deltaProof -PathType Leaf) {
  if([IO.File]::ReadAllText($deltaProof).Trim() -cne $pinnedDelta) {
    Abort 'UNKNOWN_DELTA_VERSION'
  }
  Status 'ALREADY_INSTALLED'
  Write-Output 'QA_FIRESTORE_READS=0'
  Write-Output 'QA_FAILOVER=OFF'
  exit 0
}
$psql=PgBin 'psql.exe'
$dump=PgBin 'pg_dump.exe'
if(-not $psql -or -not $dump){Abort 'POSTGRES_17_TOOLS_NOT_AVAILABLE'}
if(-not $Apply){
  Status 'READY_FOR_STAGED_INSTALL'
  Write-Output 'QA_POSTGRES_WRITES=0'
  Write-Output 'QA_FIRESTORE_READS=0'
  Write-Output 'QA_FAILOVER=OFF'
  exit 0
}
$tmp=Join-Path $root ('qa-delta-stage-' + [Guid]::NewGuid().ToString('N'))
$adminPwd=$null
try{
  New-Item -ItemType Directory -Path $tmp -Force | Out-Null
  $sqlFile=Join-Path $tmp 'qa-source-delta-journal.sql'
  $url='https://raw.githubusercontent.com/songpongo88-svg/qa-dashboard/'+$pinnedDelta+'/'+$sqlName
  Invoke-WebRequest -Uri $url -OutFile $sqlFile -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
  $sql=[IO.File]::ReadAllText($sqlFile)
  if(-not $sql.Contains('CREATE TABLE IF NOT EXISTS qa_failover_v1.source_delta_events') -or
     -not $sql.Contains('CREATE TABLE IF NOT EXISTS qa_failover_v1.source_delta_latest') -or
     -not $sql.Contains('REVOKE ALL ON qa_failover_v1.source_delta_events FROM PUBLIC') -or
     -not $sql.Contains('COMMIT;') -or $sql -match '(?i)\bDROP\b|\bTRUNCATE\b|\bGRANT\b') {
    Abort 'UNRECOGNIZED_DELTA_SCHEMA'
  }
  $secure=Read-Host 'Local PostgreSQL postgres administrator password' -AsSecureString
  $adminPwd=Reveal $secure
  Remove-Variable secure -ErrorAction SilentlyContinue
  if([string]::IsNullOrWhiteSpace($adminPwd)){Abort 'ADMIN_PASSWORD_MISSING'}
  $env:PGPASSWORD=$adminPwd
  # Do not touch existing evaluated cases or change the frozen standby mode.
  $preflight=@'
SELECT CASE WHEN current_database()='qa_dashboard_lab'
  AND current_setting('server_version_num')::integer BETWEEN 170000 AND 179999
  AND NOT pg_is_in_recovery()
  AND to_regclass('qa_failover_v1.source_read_budget_daily') IS NOT NULL
  AND to_regclass('qa_failover_v1.source_delta_events') IS NULL
  AND to_regclass('qa_failover_v1.source_delta_latest') IS NULL
  AND EXISTS (
    SELECT 1 FROM qa_failover_v1.state s
    JOIN qa_failover_v1.live_snapshot_batches b
      ON b.snapshot_id=s.active_snapshot_id
    WHERE s.id=1 AND s.mode='disabled' AND s.write_frozen IS TRUE
      AND s.source_snapshot_verified IS FALSE
      AND b.status='copy_verified' AND b.approved_for_failover IS FALSE
      AND b.source_documents=b.stored_documents
  )
  THEN 'SAFE' ELSE 'BLOCKED' END;
'@
  $test=@(& $psql -X -w -A -t -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 5432 -U postgres -d qa_dashboard_lab -c $preflight 2>$null)
  if($LASTEXITCODE -ne 0 -or ($test -join '').Trim() -cne 'SAFE') {
    Abort 'FROZEN_SNAPSHOT_OR_DATABASE_UNVERIFIED'
  }
  Status 'PREVIOUS_SNAPSHOT_FROZEN_VERIFIED'
  New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
  $backup=Join-Path $backupDir ('qa_before_delta_schema_'+(Get-Date -Format 'yyyyMMdd_HHmmss')+'.backup')
  & $dump -w -h 127.0.0.1 -p 5432 -U postgres -d qa_dashboard_lab -Fc -f $backup 2>$null
  if($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $backup -PathType Leaf) -or
     (Get-Item -LiteralPath $backup).Length -lt 1024) {
    Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
    Abort 'BACKUP_FAILED_NO_SCHEMA_CHANGE'
  }
  Status 'DATABASE_BACKUP_CREATED'
  & $psql -X -q -w -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 5432 -U postgres -d qa_dashboard_lab -f $sqlFile 1>$null 2>$null
  if($LASTEXITCODE -ne 0){Abort 'SCHEMA_INSTALL_FAILED'}
  $verify=@'
SELECT CASE WHEN
  to_regclass('qa_failover_v1.source_delta_events') IS NOT NULL
  AND to_regclass('qa_failover_v1.source_delta_latest') IS NOT NULL
  AND (SELECT count(*) FROM qa_failover_v1.source_delta_events)=0
  AND (SELECT count(*) FROM qa_failover_v1.source_delta_latest)=0
  AND EXISTS(SELECT 1 FROM qa_failover_v1.state
     WHERE id=1 AND mode='disabled' AND write_frozen IS TRUE
       AND source_snapshot_verified IS FALSE)
  THEN 'SAFE' ELSE 'BLOCKED' END;
'@
  $checked=@(& $psql -X -w -A -t -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 5432 -U postgres -d qa_dashboard_lab -c $verify 2>$null)
  if($LASTEXITCODE -ne 0 -or ($checked -join '').Trim() -cne 'SAFE'){
    Abort 'DELTA_SCHEMA_POSTCHECK_FAILED'
  }
  [IO.File]::WriteAllText($deltaProof,$pinnedDelta)
  Status 'PRIVATE_EMPTY_DELTA_JOURNAL_INSTALLED'
  Write-Output 'QA_DELTA_LIVE_SOURCE=NOT_CONNECTED'
  Write-Output 'QA_FIRESTORE_READS=0'
  Write-Output 'QA_FAILOVER=OFF'
}catch{
  Abort 'INSTALL_FAILED_CLOSED'
}finally{
  $env:PGPASSWORD=$null
  $adminPwd=$null
  if(Test-Path -LiteralPath $tmp){Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue}
}
