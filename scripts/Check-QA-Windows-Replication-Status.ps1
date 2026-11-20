# Windows QA read-only local replication health. Never connects to Firestore.
# No listener, snapshot mutation, credential export, or failover activation.
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$oldPassword=$env:PGPASSWORD
$oldOptions=$env:PGOPTIONS
$oldFailover=$env:QA_FAILOVER
$password=$null
$psql=$null
function Report([string]$status) {
 Write-Output ('QA_WINDOWS_REPLICATION_CHECK='+$status)
 Write-Output 'QA_WINDOWS_FIRESTORE_READS=0'
 Write-Output 'QA_WINDOWS_SOURCE_LISTENER=NOT_STARTED_BY_CHECK'
 Write-Output 'QA_WINDOWS_SOURCE_CONTINUITY=NOT_CERTIFIED'
 Write-Output 'QA_FAILOVER=OFF'
}
function LocalSql([string]$sql) {
 $output=@(& $psql -X -q -A -t -w -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 5432 -U postgres -d qa_dashboard_lab -c $sql 2>$null)
 if($LASTEXITCODE -ne 0 -or $output.Count -ne 1){throw 'local_read_only_postgres_query_failed'}
 return [string]$output[0].Trim()
}
try {
 if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT){Report 'WINDOWS_REQUIRED';exit 2}
 if($oldFailover -and $oldFailover -cne 'OFF'){Report 'FAILOVER_ENV_NOT_OFF';exit 2}
 $candidate=Join-Path 'C:\Program Files\PostgreSQL\17\bin' 'psql.exe'
 if(Test-Path -LiteralPath $candidate -PathType Leaf){$psql=$candidate}
 else {
  $cmd=Get-Command psql.exe -ErrorAction SilentlyContinue
  if($null -eq $cmd){Report 'POSTGRESQL_17_PSQL_MISSING';exit 2}
  $psql=$cmd.Source
 }
 $secure=Read-Host 'Existing local PostgreSQL password (read-only status check)' -AsSecureString
 $bstr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
 try{$password=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)}
 finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)}
 Remove-Variable secure -ErrorAction SilentlyContinue
 if([string]::IsNullOrWhiteSpace($password)){Report 'LOCAL_PASSWORD_MISSING';exit 2}
 $env:PGPASSWORD=$password
 $env:PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=12000 -c lock_timeout=2000'
 $server=LocalSql "SELECT CASE WHEN current_database()='qa_dashboard_lab' AND current_setting('server_version_num')::integer BETWEEN 170000 AND 179999 AND NOT pg_is_in_recovery() THEN 'SAFE' ELSE 'UNSAFE' END"
 if($server -cne 'SAFE'){Report 'LOCAL_POSTGRES_OR_VERSION_UNEXPECTED';exit 2}
 $required=LocalSql "SELECT CASE WHEN to_regclass('qa_failover_v1.state') IS NOT NULL AND to_regclass('qa_failover_v1.live_snapshot_rows') IS NOT NULL AND to_regclass('qa_failover_v1.source_delta_events') IS NOT NULL AND to_regclass('qa_failover_v1.source_delta_latest') IS NOT NULL AND to_regclass('qa_windows_probe_v1.source_signals') IS NOT NULL THEN 'PRESENT' ELSE 'INCOMPLETE' END"
 if($required -cne 'PRESENT'){Report 'LOCAL_STANDBY_SCHEMA_INCOMPLETE';exit 2}
 $state=LocalSql "SELECT CASE WHEN mode='disabled' AND write_frozen IS TRUE AND source_snapshot_verified IS FALSE AND active_snapshot_id IS NOT NULL THEN 'FROZEN' ELSE 'UNSAFE' END FROM qa_failover_v1.state WHERE id=1"
 if($state -cne 'FROZEN'){Report 'FROZEN_STANDBY_STATE_NOT_VERIFIED';exit 2}
 $snapshot=LocalSql "SELECT count(*)::text FROM qa_failover_v1.live_snapshot_rows WHERE snapshot_id=(SELECT active_snapshot_id FROM qa_failover_v1.state WHERE id=1)"
 $signals=LocalSql "SELECT count(*)::text FROM qa_windows_probe_v1.source_signals"
 $deltas=LocalSql "SELECT count(*)::text FROM qa_failover_v1.source_delta_events"
 $latest=LocalSql "SELECT count(*)::text FROM qa_failover_v1.source_delta_latest"
 $candidateTable=LocalSql "SELECT CASE WHEN to_regclass('qa_windows_probe_v1.verified_source_candidates') IS NOT NULL THEN 'PRESENT' ELSE 'NOT_INSTALLED' END"
 $verifiedCandidates='NOT_INSTALLED'
 if($candidateTable -ceq 'PRESENT'){$verifiedCandidates=LocalSql "SELECT count(*)::text FROM qa_windows_probe_v1.verified_source_candidates"}
 foreach($entry in @($snapshot,$signals,$deltas,$latest)){
  if($entry -notmatch '^[0-9]{1,14}$'){throw 'unexpected_count_output'}
 }
 if($verifiedCandidates -cne 'NOT_INSTALLED' -and $verifiedCandidates -notmatch '^[0-9]{1,14}$'){throw 'unexpected_candidate_count_output'}
 Write-Output 'QA_WINDOWS_POSTGRES=LOCAL_PG17_FROZEN'
 Write-Output ('QA_WINDOWS_ACTIVE_SNAPSHOT_ROWS='+$snapshot)
 Write-Output ('QA_WINDOWS_SOURCE_SIGNAL_ROWS='+$signals)
 Write-Output ('QA_WINDOWS_SOURCE_DELTA_EVENT_ROWS='+$deltas)
 Write-Output ('QA_WINDOWS_SOURCE_DELTA_LATEST_ROWS='+$latest)
 Write-Output ('QA_WINDOWS_VERIFIED_CANDIDATE_ROWS='+$verifiedCandidates)
 Report 'LOCAL_READ_ONLY_STATUS_COMPLETE'
}catch{
 Report 'SAFE_CHECK_FAILED_NO_CHANGES'
 exit 2
}finally{
 $password=$null
 $env:PGPASSWORD=$oldPassword
 $env:PGOPTIONS=$oldOptions
 $env:QA_FAILOVER=$oldFailover
}
