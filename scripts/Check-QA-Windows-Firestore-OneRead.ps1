# ONE opt-in, rate-limited Firestore documents.list request (pageSize=1).
# Consumes a minimum one billable Firestore document read if called.
# No full scan, document contents output, Firestore writes, listener or failover.
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$project='qa-dashboard-b0b5d'
$stage=Join-Path $HOME 'Documents\QA_Backup\source-stage'
$installed=Join-Path $stage '.qa-windows-private-signal-stage-commit'
$installerVersion='b4edc5101285d3e85ccafaba9a076c3553756879'
$utcDay=(Get-Date).ToUniversalTime().ToString('yyyyMMdd')
$attemptMarker=Join-Path $stage ('.qa-one-read-iam-probe-'+$utcDay)
$previousPw=$env:PGPASSWORD
$previousPrompts=$env:CLOUDSDK_CORE_DISABLE_PROMPTS
$pw=$null
$token=$null
function Result([string]$code){
 Write-Output ('QA_WINDOWS_FIRESTORE_ONE_READ='+$code)
 Write-Output 'QA_WINDOWS_FIRESTORE_PAGE_SIZE=1'
 Write-Output 'QA_WINDOWS_FIRESTORE_OTHER_USAGE=UNKNOWN'
 Write-Output 'QA_WINDOWS_FIRESTORE_LISTENER=NOT_STARTED'
 Write-Output 'QA_FAILOVER=OFF'
}
function PgExe([string]$name){
 $tool=Get-Command $name -ErrorAction SilentlyContinue
 if($null -ne $tool){return $tool.Source}
 $alt=Join-Path 'C:\Program Files\PostgreSQL\17\bin' $name
 if(Test-Path -LiteralPath $alt -PathType Leaf){return $alt}
 return $null
}
try {
 if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT){
  Result 'WINDOWS_REQUIRED';exit 2
 }
 if(-not (Test-Path -LiteralPath $installed -PathType Leaf) -or
    [IO.File]::ReadAllText($installed).Trim() -cne $installerVersion){
  Result 'PRIVATE_STAGE_NOT_VERIFIED';exit 2
 }
 if($env:QA_FAILOVER -and $env:QA_FAILOVER -cne 'OFF'){
  Result 'FAILOVER_ENV_UNEXPECTED';exit 2
 }
 if(Test-Path -LiteralPath $attemptMarker -PathType Leaf){
  Result 'ALREADY_ATTEMPTED_TODAY_NO_REQUEST';exit 2
 }
 $gcloud=Get-Command 'gcloud.cmd' -ErrorAction SilentlyContinue
 if($null -eq $gcloud){$gcloud=Get-Command 'gcloud' -ErrorAction SilentlyContinue}
 $psql=PgExe 'psql.exe'
 if($null -eq $gcloud -or -not $psql){
  Result 'LOCAL_DEPENDENCY_MISSING';exit 2
 }
 $env:CLOUDSDK_CORE_DISABLE_PROMPTS='1'
 $selected=@(& $gcloud.Source config get-value project --quiet 2>$null)
 if($LASTEXITCODE -ne 0 -or ($selected -join '').Trim() -cne $project){
  Result 'WRONG_GCLOUD_PROJECT';exit 2
 }
 $tokens=@(& $gcloud.Source auth application-default print-access-token --quiet 2>$null)
 if($LASTEXITCODE -ne 0 -or $tokens.Count -ne 1){
  Result 'ADC_TOKEN_UNAVAILABLE';exit 2
 }
 $token=[string]$tokens[0]
 $tokens=$null
 if($token.Length -lt 20 -or $token.Length -gt 8192 -or $token -match '\s'){
  Result 'ADC_TOKEN_INVALID';exit 2
 }
 $secure=Read-Host 'Existing local PostgreSQL postgres password (1-read quota reservation)' -AsSecureString
 $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
 try{$pw=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}
 finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
 Remove-Variable secure -ErrorAction SilentlyContinue
 if([string]::IsNullOrWhiteSpace($pw)){
  Result 'LOCAL_DATABASE_PASSWORD_MISSING';exit 2
 }
 $env:PGPASSWORD=$pw
 $preflight=@'
SELECT CASE WHEN current_database()='qa_dashboard_lab'
 AND current_setting('server_version_num')::integer BETWEEN 170000 AND 179999
 AND pg_is_in_recovery()=false
 AND to_regclass('qa_failover_v1.source_read_budget_daily') IS NOT NULL
 AND to_regclass('qa_windows_probe_v1.source_signals') IS NOT NULL
 AND EXISTS(SELECT 1 FROM qa_failover_v1.state
  WHERE id=1 AND mode='disabled' AND write_frozen IS TRUE
   AND source_snapshot_verified IS FALSE)
 THEN 'SAFE' ELSE 'BLOCKED' END;
'@
 $check=@(& $psql -X -w -A -t -h 127.0.0.1 -p 5432 -U postgres -d qa_dashboard_lab -v ON_ERROR_STOP=1 -c $preflight 2>$null)
 if($LASTEXITCODE -ne 0 -or ($check -join '').Trim() -cne 'SAFE'){
  Result 'LOCAL_BUDGET_OR_STANDBY_NOT_SAFE';exit 2
 }
 # Exclusive local marker BEFORE reserving quota or sending request:
 # repeat invocations on the same Windows machine are denied for this UTC day.
 try{
  $guard=[IO.File]::Open($attemptMarker,[IO.FileMode]::CreateNew,
   [IO.FileAccess]::Write,[IO.FileShare]::None)
  $guard.Dispose()
 }catch{
  Result 'ALREADY_ATTEMPTED_TODAY_NO_REQUEST';exit 2
 }
 $reserveSql=@'
WITH frozen AS (
 SELECT 1 FROM qa_failover_v1.state WHERE id=1
  AND mode='disabled' AND write_frozen IS TRUE
  AND source_snapshot_verified IS FALSE
), reserve AS (
 INSERT INTO qa_failover_v1.source_read_budget_daily
  (budget_day,project_id,reserved_document_units,reserved_requests)
 SELECT (now() AT TIME ZONE 'UTC')::date,'qa-dashboard-b0b5d',1,1
 WHERE EXISTS(SELECT 1 FROM frozen)
 ON CONFLICT (budget_day,project_id) DO UPDATE
 SET reserved_document_units=qa_failover_v1.source_read_budget_daily.reserved_document_units+1,
  reserved_requests=qa_failover_v1.source_read_budget_daily.reserved_requests+1,
  updated_at=now()
 WHERE qa_failover_v1.source_read_budget_daily.reserved_document_units+1<=3000
  AND qa_failover_v1.source_read_budget_daily.reserved_requests+1<=80
 RETURNING reserved_document_units
)
SELECT CASE WHEN EXISTS(SELECT 1 FROM reserve) THEN 'RESERVED'
 ELSE 'BLOCKED' END AS result;
'@
 $reserved=@(& $psql -X -w -A -t -h 127.0.0.1 -p 5432 -U postgres -d qa_dashboard_lab -v ON_ERROR_STOP=1 -c $reserveSql 2>$null)
 if($LASTEXITCODE -ne 0 -or ($reserved -join '').Trim() -cne 'RESERVED'){
  Result 'DAILY_BUDGET_RESERVATION_BLOCKED_NO_REQUEST';exit 2
 }
 # Exactly ONE documents.list GET, a page of at most one QA evaluation.
 # A mask limits returned fields; never print document IDs, fields or token.
 $url='https://firestore.googleapis.com/v1/projects/qa-dashboard-b0b5d/databases/(default)/documents/qa_evaluations?pageSize=1&mask.fieldPaths=qa_permission_probe_nodata_202611'
 $headers=@{Authorization=('Bearer '+$token);Accept='application/json'}
 try{
  $response=Invoke-RestMethod -Method Get -Uri $url -Headers $headers -TimeoutSec 15
 }catch{
  $code=0
  try{if($_.Exception.Response){$code=[int]$_.Exception.Response.StatusCode}}catch{}
  if($code -eq 401){Result 'TOKEN_REJECTED';exit 2}
  if($code -eq 403){Result 'DOCUMENT_LIST_PERMISSION_DENIED';exit 2}
  if($code -eq 429){Result 'DOCUMENT_READ_QUOTA_LIMITED';exit 2}
  Result 'DOCUMENT_LIST_REQUEST_FAILED';exit 2
 }
 $docs=@()
 if($null -ne $response -and $null -ne $response.PSObject.Properties['documents']){
  $docs=@($response.documents)
 }
 if($docs.Count -gt 1){
  Result 'UNEXPECTED_PAGE_SIZE';exit 2
 }
 foreach($doc in $docs){
  if(-not ([string]$doc.name).StartsWith(
   'projects/qa-dashboard-b0b5d/databases/(default)/documents/qa_evaluations/')){
   Result 'WRONG_DOCUMENT_COLLECTION';exit 2
  }
 }
 Write-Output 'QA_WINDOWS_FIRESTORE_READ_RESERVATION=1'
 Result 'DOCUMENT_LIST_API_ACCESS_VERIFIED'
}catch{
 # Do not emit exception bodies, paths or private document content.
 Result 'SINGLE_READ_PROBE_FAILED_CLOSED'
 exit 2
}finally{
 $pw=$null
 $token=$null
 $headers=$null
 $env:PGPASSWORD=$previousPw
 $env:CLOUDSDK_CORE_DISABLE_PROMPTS=$previousPrompts
}
