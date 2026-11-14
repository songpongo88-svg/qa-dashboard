# ONE COMMAND to ACTUALLY create an immutable 11-dataset QA Windows backup
# candidate from Firestore, then report added/removed/modified counts.
# This is NOT a live failover, listener, production deploy or archive overwrite.
# Requires explicit -Run; may consume up to 3,000 Firestore read units.
[CmdletBinding()]
param([switch]$Run)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$pinned='0a0961c4b0eba03336a2f4aa04c0195b05ec06f3'
$root=Join-Path $HOME 'Documents\QA_Backup\source-stage'
$marker=Join-Path $root '.qa-windows-private-signal-stage-commit'
$proof='b4edc5101285d3e85ccafaba9a076c3553756879'
$day=(Get-Date).ToUniversalTime().ToString('yyyyMMdd')
$existingParity=Join-Path $root ('.qa-parity-attempt-'+$day)
$existingCandidate=Join-Path $root ('.qa-reconcile-attempt-'+$day)
$files=@(
 'server/qaLiveMirrorStage.js',
 'server/qaWindowsProbeBaseline.js',
 'server/qaFirestoreRestSnapshot.js',
 'server/qaSourceReadBudget.js',
 'server/qaWindowsCandidateArchiveStage.js',
 'server/qaWindowsReconciliationReview.js',
 'scripts/Run-QA-Windows-Reconciliation.mjs'
)
$folder=$null
$pw=$null
$token=$null
$backup=$null
$prev=@{
 PGPASSWORD=$env:PGPASSWORD
 QA_FIRESTORE_OAUTH_ACCESS_TOKEN=$env:QA_FIRESTORE_OAUTH_ACCESS_TOKEN
 QA_WINDOWS_RECONCILE_RUN=$env:QA_WINDOWS_RECONCILE_RUN
 QA_WINDOWS_CANDIDATE_ARCHIVE_STAGE=$env:QA_WINDOWS_CANDIDATE_ARCHIVE_STAGE
 QA_WINDOWS_RECONCILE_REVIEW=$env:QA_WINDOWS_RECONCILE_REVIEW
 QA_WINDOWS_SOURCE_PROBE_MANIFEST=$env:QA_WINDOWS_SOURCE_PROBE_MANIFEST
 QA_WINDOWS_RECONCILE_STAGE_ROOT=$env:QA_WINDOWS_RECONCILE_STAGE_ROOT
 QA_FAILOVER=$env:QA_FAILOVER
 CLOUDSDK_CORE_DISABLE_PROMPTS=$env:CLOUDSDK_CORE_DISABLE_PROMPTS
}
function Report([string]$value){
 Write-Output ('QA_WINDOWS_RECONCILE='+$value)
 Write-Output 'QA_SOURCE_LISTENER=NOT_STARTED'
 Write-Output 'QA_FAILOVER=OFF'
}
function GetBin([string]$name){
 $cmd=Get-Command $name -ErrorAction SilentlyContinue
 if($null -ne $cmd){return $cmd.Source}
 $full=Join-Path 'C:\Program Files\PostgreSQL\17\bin' $name
 if(Test-Path -LiteralPath $full -PathType Leaf){return $full}
 return $null
}
try{
 if(-not $Run){
  Report 'OFF_EXPLICIT_RUN_REQUIRED'
  Write-Output 'QA_RECONCILE_FIRESTORE_READS=0'
  exit 0
 }
 if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT){
  Report 'WINDOWS_REQUIRED';exit 2
 }
 if(-not (Test-Path -LiteralPath $marker -PathType Leaf) -or
    [IO.File]::ReadAllText($marker).Trim() -cne $proof){
  Report 'WINDOWS_BASELINE_NOT_INSTALLED';exit 2
 }
 if(-not (Test-Path -LiteralPath (Join-Path $root 'node_modules\pg\package.json') -PathType Leaf)){
  Report 'NODE_PG_DRIVER_MISSING';exit 2
 }
 if(($prev.QA_FAILOVER -and $prev.QA_FAILOVER -cne 'OFF') -or
    (Test-Path -LiteralPath $existingParity -PathType Leaf) -or
    (Test-Path -LiteralPath $existingCandidate -PathType Leaf)){
  Report 'ALREADY_SCANNED_TODAY_OR_FAILOVER_NOT_OFF';exit 2
 }
 $node=Get-Command 'node' -ErrorAction SilentlyContinue
 $gcloud=Get-Command 'gcloud.cmd' -ErrorAction SilentlyContinue
 if($null -eq $gcloud){$gcloud=Get-Command 'gcloud' -ErrorAction SilentlyContinue}
 $dump=GetBin 'pg_dump.exe'
 if($null -eq $node -or $null -eq $gcloud -or -not $dump){
  Report 'NODE_GCLOUD_OR_POSTGRES_MISSING';exit 2
 }
 $env:CLOUDSDK_CORE_DISABLE_PROMPTS='1'
 $project=@(& $gcloud.Source config get-value project --quiet 2>$null)
 if($LASTEXITCODE -ne 0 -or ($project -join '').Trim() -cne 'qa-dashboard-b0b5d'){
  Report 'WRONG_GCLOUD_PROJECT';exit 2
 }
 # Download immutable reviewed server-only code; no Firebase calls yet.
 $folder=Join-Path $root ('.qa-reconcile-local-'+[guid]::NewGuid().ToString('N'))
 foreach($name in $files){
  $target=Join-Path $folder ($name.Replace('/','\'))
  New-Item -Path (Split-Path $target -Parent) -ItemType Directory -Force|Out-Null
  $url='https://raw.githubusercontent.com/songpongo88-svg/qa-dashboard/'+$pinned+'/'+$name
  Invoke-WebRequest -Uri $url -OutFile $target -UseBasicParsing -TimeoutSec 30
  if((Get-Item -LiteralPath $target).Length -lt 100){
   Report 'PINNED_SOURCE_INCOMPLETE';exit 2
  }
  & $node.Source --check $target 1>$null 2>$null
  if($LASTEXITCODE -ne 0){
   Report 'PINNED_NODE_SYNTAX_FAILED';exit 2
  }
 }
 $secure=Read-Host 'Existing local PostgreSQL postgres password (new backup candidate)' -AsSecureString
 $bstr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
 try{$pw=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)}
 finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)}
 Remove-Variable secure -ErrorAction SilentlyContinue
 if([string]::IsNullOrWhiteSpace($pw)){
  Report 'POSTGRES_PASSWORD_MISSING';exit 2
 }
 $env:PGPASSWORD=$pw
 # Preserve a separate full Windows database backup before staging rows.
 $backupDir=Join-Path $HOME 'Documents\QA_Backup\snapshot-db-backups'
 New-Item -ItemType Directory -Force -Path $backupDir|Out-Null
 $backup=Join-Path $backupDir ('qa_pre_reconcile_'+(Get-Date -Format 'yyyyMMdd_HHmmss')+'.backup')
 & $dump -w -h 127.0.0.1 -p 5432 -U postgres -d qa_dashboard_lab -Fc -f $backup 1>$null 2>$null
 if($LASTEXITCODE -ne 0 -or
    -not (Test-Path -LiteralPath $backup -PathType Leaf) -or
    (Get-Item -LiteralPath $backup).Length -lt 1024){
  if($backup -and (Test-Path -LiteralPath $backup)){
   Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
  }
  Report 'LOCAL_POSTGRES_BACKUP_FAILED_NO_FIRESTORE_READ';exit 2
 }
 Write-Output 'QA_WINDOWS_RECONCILE_DB_BACKUP=CREATED'
 $tokens=@(& $gcloud.Source auth application-default print-access-token --quiet 2>$null)
 if($LASTEXITCODE -ne 0 -or $tokens.Count -ne 1){
  Report 'ADC_TOKEN_NOT_AVAILABLE';exit 2
 }
 $token=[string]$tokens[0]
 $tokens=$null
 if($token.Length -lt 20 -or $token.Length -gt 8192 -or $token -match '\s'){
  Report 'ADC_TOKEN_INVALID';exit 2
 }
 $env:QA_FIRESTORE_OAUTH_ACCESS_TOKEN=$token
 $env:QA_WINDOWS_RECONCILE_RUN='1'
 $env:QA_WINDOWS_CANDIDATE_ARCHIVE_STAGE='1'
 $env:QA_WINDOWS_RECONCILE_REVIEW='1'
 $env:QA_WINDOWS_SOURCE_PROBE_MANIFEST='1'
 $env:QA_WINDOWS_RECONCILE_STAGE_ROOT=$root
 $env:QA_FAILOVER='OFF'
 # Node checks the frozen database and remaining *local reserved budget*
 # before creating a daily attempt marker or reading any Firestore document.
 & $node.Source (Join-Path $folder 'scripts\Run-QA-Windows-Reconciliation.mjs')
 if($LASTEXITCODE -ne 0){
  Report 'BLOCKED_PRESERVE_FROZEN_COPY'
  exit 2
 }
 Report 'NEW_SNAPSHOT_CREATED_AND_VERIFIED_NOT_ACTIVE'
}catch{
 # Never print SQL exception bodies, tokens, paths or case data.
 Report 'FAILED_CLOSED_FROZEN_COPY_PRESERVED'
 exit 2
}finally{
 $pw=$null
 $token=$null
 $tokens=$null
 foreach($key in $prev.Keys){
  [Environment]::SetEnvironmentVariable($key,$prev[$key],'Process')
 }
 if($folder -and (Test-Path -LiteralPath $folder -PathType Container)){
  Remove-Item -LiteralPath $folder -Recurse -Force -ErrorAction SilentlyContinue
 }
}
