# QA Windows PostgreSQL 17 private signed receiver: INACTIVE ONLY.
# Dry-run by default. -Apply is explicit, backup-first and source-read-free.
[CmdletBinding()]
param([switch]$Apply)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=Join-Path $HOME 'Documents\QA_Backup'
$stage=Join-Path $root 'source-stage'
$backupDir=Join-Path $root 'snapshot-db-backups'
$marker=Join-Path $stage '.qa-windows-signed-receiver-inactive-commit'
$priorMarker=Join-Path $stage '.qa-windows-private-signal-stage-commit'
$priorVersion='b4edc5101285d3e85ccafaba9a076c3553756879'
$sqlCommit='7f728335eb2a4a92cd3318951532a725f6d62780'
$sqlFile='migration/qa-windows-signed-receiver-inactive.sql'
$envBackup=$env:PGPASSWORD
$optionsBackup=$env:PGOPTIONS
$oldFailover=$env:QA_FAILOVER
$secret=$null
$temp=$null
$psql=$null
$failed=$false
function Result([string]$status){
 Write-Output ('QA_WINDOWS_SIGNED_RECEIVER_INSTALL='+$status)
 Write-Output 'QA_WINDOWS_RECEIVER_LISTENER=NOT_STARTED'
 Write-Output 'QA_WINDOWS_FIRESTORE_READS=0'
 Write-Output 'QA_WINDOWS_SOURCE_CONTINUITY=NOT_CERTIFIED'
 Write-Output 'QA_FAILOVER=OFF'
}
function StopSafe([string]$status){throw ('QA_BLOCK_'+$status)}
function Locate([string]$name){
 $found=Get-Command $name -ErrorAction SilentlyContinue
 if($null -ne $found){return $found.Source}
 $fixed=Join-Path 'C:\Program Files\PostgreSQL\17\bin' $name
 if(Test-Path -LiteralPath $fixed -PathType Leaf){return $fixed}
 return $null
}
function SqlRead([string]$sql){
 $out=@(& $psql -X -w -A -t -h 127.0.0.1 -p 5432 -U postgres -d qa_dashboard_lab -v ON_ERROR_STOP=1 -c $sql 2>$null)
 if($LASTEXITCODE -ne 0 -or $out.Count -ne 1){StopSafe 'LOCAL_POSTGRES_READ_FAILED'}
 return [string]$out[0].Trim()
}
try{
 if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT){StopSafe 'WINDOWS_REQUIRED'}
 if($oldFailover -and $oldFailover -cne 'OFF'){StopSafe 'FAILOVER_MUST_REMAIN_OFF'}
 if(-not(Test-Path -LiteralPath $priorMarker -PathType Leaf) -or
  [IO.File]::ReadAllText($priorMarker).Trim() -cne $priorVersion){
  StopSafe 'EXISTING_PRIVATE_STAGE_NOT_VERIFIED'
 }
 if(Test-Path -LiteralPath $marker -PathType Leaf){
  if([IO.File]::ReadAllText($marker).Trim() -cne $sqlCommit){
   StopSafe 'UNRECOGNIZED_SIGNED_RECEIVER_STAGE'
  }
  Result 'PREVIOUSLY_INSTALLED_INACTIVE_NEEDS_READ_ONLY_CHECK'
  return
 }
 if(-not $Apply){
  Result 'DRY_RUN_NO_CHANGES'
  return
 }
 $psql=Locate 'psql.exe'
 $dump=Locate 'pg_dump.exe'
 if(-not $psql -or -not $dump){StopSafe 'POSTGRESQL_17_TOOLS_MISSING'}
 $temp=Join-Path $root ('.signed-receiver-preinstall-'+[guid]::NewGuid().ToString('N'))
 New-Item -Path $temp -ItemType Directory -Force|Out-Null
 $sourceSql=Join-Path $temp 'qa-windows-signed-receiver-inactive.sql'
 $url='https://raw.githubusercontent.com/songpongo88-svg/qa-dashboard/'+$sqlCommit+'/migration/qa-windows-signed-receiver-inactive.sql'
 Invoke-WebRequest -Uri $url -OutFile $sourceSql -TimeoutSec 30 -UseBasicParsing
 $sqlText=[IO.File]::ReadAllText($sourceSql)
 if($sqlText.Length -lt 1500 -or
    -not $sqlText.Contains('CREATE SCHEMA IF NOT EXISTS qa_windows_signed_receiver_v1') -or
    -not $sqlText.Contains("CHECK (review_status='review_required')") -or
    -not $sqlText.Contains('CHECK (delivery_eligible=false)') -or
    -not $sqlText.Contains('CHECK (failover_eligible=false)') -or
    -not $sqlText.Contains('FORCE ROW LEVEL SECURITY') -or
    -not $sqlText.Contains('REVOKE ALL ON SCHEMA qa_windows_signed_receiver_v1 FROM PUBLIC') -or
    $sqlText -match '(?i)\bDROP\b|\bTRUNCATE\b|\bCREATE\s+ROLE\b|\bALTER\s+ROLE\b|\bGRANT\s+ALL\b'){
  StopSafe 'PINNED_SCHEMA_UNEXPECTED'
 }
 $secure=Read-Host 'Existing local PostgreSQL postgres password (inactive install only)' -AsSecureString
 $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
 try{$secret=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}
 finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
 Remove-Variable secure -ErrorAction SilentlyContinue
 if([string]::IsNullOrWhiteSpace($secret)){StopSafe 'PASSWORD_MISSING'}
 $env:PGPASSWORD=$secret
 $env:PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=2000'
 $server=SqlRead "SELECT CASE WHEN current_database()='qa_dashboard_lab' AND current_setting('server_version_num')::int BETWEEN 170000 AND 179999 AND NOT pg_is_in_recovery() THEN 'SAFE' ELSE 'BLOCKED' END"
 if($server -cne 'SAFE'){StopSafe 'LOCAL_POSTGRES17_REQUIRED'}
 $pre=SqlRead @'
SELECT CASE WHEN
 to_regclass('qa_failover_v1.state') IS NOT NULL
 AND to_regclass('qa_failover_v1.live_snapshot_batches') IS NOT NULL
 AND to_regclass('qa_failover_v1.live_snapshot_rows') IS NOT NULL
 AND to_regclass('qa_windows_probe_v1.source_signals') IS NOT NULL
 AND to_regclass('qa_windows_signed_receiver_v1.inbox') IS NULL
 AND EXISTS(
  SELECT 1 FROM qa_failover_v1.state
  WHERE id=1 AND mode='disabled' AND write_frozen IS TRUE
  AND source_snapshot_verified IS FALSE AND active_snapshot_id IS NOT NULL
 )
 AND EXISTS(
  SELECT 1 FROM qa_failover_v1.live_snapshot_batches b
  WHERE b.snapshot_id<>(SELECT active_snapshot_id
   FROM qa_failover_v1.state WHERE id=1)
  AND b.status='copy_verified' AND b.approved_for_failover IS FALSE
  AND b.source_provenance='verified-firestore-server-export'
  AND b.source_documents=2427 AND b.stored_documents=2427
  AND b.stored_documents=(SELECT count(*) FROM qa_failover_v1.live_snapshot_rows r
    WHERE r.snapshot_id=b.snapshot_id)
 )
 THEN 'SAFE' ELSE 'BLOCKED' END
'@
 if($pre -cne 'SAFE'){StopSafe 'FROZEN_SNAPSHOT_OR_CANDIDATE_NOT_VERIFIED'}
 New-Item -Path $backupDir -ItemType Directory -Force|Out-Null
 $backup=Join-Path $backupDir ('qa_before_signed_receiver_'+(Get-Date -Format 'yyyyMMdd_HHmmss')+'.backup')
 & $dump -w -h 127.0.0.1 -p 5432 -U postgres -d qa_dashboard_lab -Fc -f $backup 1>$null 2>$null
 if($LASTEXITCODE -ne 0 -or
    -not(Test-Path -LiteralPath $backup -PathType Leaf) -or
    (Get-Item -LiteralPath $backup).Length -lt 1024){
  Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
  StopSafe 'PREINSTALL_LOCAL_DATABASE_BACKUP_FAILED'
 }
 Write-Output 'QA_WINDOWS_SIGNED_RECEIVER_DB_BACKUP=CREATED'
 $env:PGOPTIONS='-c statement_timeout=30000 -c lock_timeout=3000'
 & $psql -X -q -w -h 127.0.0.1 -p 5432 -U postgres -d qa_dashboard_lab -v ON_ERROR_STOP=1 -f $sourceSql 1>$null 2>$null
 if($LASTEXITCODE -ne 0){StopSafe 'INACTIVE_SCHEMA_INSTALL_FAILED'}
 $env:PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=15000'
 $post=SqlRead @'
SELECT CASE WHEN
 to_regclass('qa_windows_signed_receiver_v1.stream_cursor') IS NOT NULL
 AND to_regclass('qa_windows_signed_receiver_v1.inbox') IS NOT NULL
 AND (SELECT count(*) FROM qa_windows_signed_receiver_v1.stream_cursor)=0
 AND (SELECT count(*) FROM qa_windows_signed_receiver_v1.inbox)=0
 AND NOT EXISTS (
  SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL
  aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a
  WHERE n.nspname='qa_windows_signed_receiver_v1'
   AND a.grantee=0 AND a.privilege_type='USAGE'
 )
 AND EXISTS(SELECT 1 FROM pg_class WHERE oid='qa_windows_signed_receiver_v1.inbox'::regclass
    AND relrowsecurity IS TRUE AND relforcerowsecurity IS TRUE)
 AND EXISTS(SELECT 1 FROM qa_failover_v1.state WHERE id=1 AND mode='disabled'
   AND write_frozen IS TRUE AND source_snapshot_verified IS FALSE)
 THEN 'SAFE' ELSE 'BLOCKED' END
'@
 if($post -cne 'SAFE'){StopSafe 'INACTIVE_SCHEMA_POSTCHECK_FAILED'}
 [IO.File]::WriteAllText($marker,$sqlCommit)
 Result 'PRIVATE_SIGNED_RECEIVER_INSTALLED_INACTIVE'
}catch{
 $failed=$true
 $message=[string]$_.Exception.Message
 if($message.StartsWith('QA_BLOCK_')){
  Result ('BLOCKED_'+$message.Substring(9))
 }else{
  Result 'FAILED_CLOSED_NO_FAILOVER'
 }
 # Preserve the database backup and partial schema for offline review.
}finally{
 $secret=$null
 $env:PGPASSWORD=$envBackup
 $env:PGOPTIONS=$optionsBackup
 $env:QA_FAILOVER=$oldFailover
 if($temp -and (Test-Path -LiteralPath $temp -PathType Container)){
  Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
 }
}
if($failed){exit 2}
