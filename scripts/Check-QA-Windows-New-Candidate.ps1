# Verify the newly archived QA Windows candidate without a Firestore read.
# This checks stored content hashes and all 11 collection manifests only.
# No database changes, listeners, public services or failover promotion.
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$pinned='7ad64d38c11e9ba3a193b3a13049ce2a9fd01656'
$stage=Join-Path $HOME 'Documents\QA_Backup\source-stage'
$marker=Join-Path $stage '.qa-windows-private-signal-stage-commit'
$expected='b4edc5101285d3e85ccafaba9a076c3553756879'
$files=@(
 'server/qaLiveMirrorStage.js',
 'server/qaWindowsReconciliationReview.js',
 'scripts/Verify-QA-Windows-Candidate-Archive.mjs'
)
$folder=$null
$oldPassword=$env:PGPASSWORD
$oldReview=$env:QA_WINDOWS_RECONCILE_REVIEW
$oldVerify=$env:QA_WINDOWS_CANDIDATE_VERIFY
$oldFailover=$env:QA_FAILOVER
$pw=$null
function Report([string]$status){
 Write-Output ('QA_WINDOWS_ARCHIVE_CHECK='+$status)
 Write-Output 'QA_WINDOWS_ARCHIVE_FIRESTORE_READS=0'
 Write-Output 'QA_SOURCE_LISTENER=NOT_STARTED_BY_CHECK'
 Write-Output 'QA_SOURCE_CONTINUITY=NOT_CERTIFIED'
 Write-Output 'QA_FAILOVER=OFF'
}
try{
 if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT){
  Report 'WINDOWS_REQUIRED';exit 2
 }
 if($oldFailover -and $oldFailover -cne 'OFF'){
  Report 'FAILOVER_NOT_OFF';exit 2
 }
 if(-not (Test-Path -LiteralPath $marker -PathType Leaf) -or
    [IO.File]::ReadAllText($marker).Trim() -cne $expected){
  Report 'LOCAL_STAGE_NOT_VERIFIED';exit 2
 }
 if(-not (Test-Path -LiteralPath (Join-Path $stage 'node_modules\pg\package.json') -PathType Leaf)){
  Report 'LOCAL_PG_DRIVER_MISSING';exit 2
 }
 $node=Get-Command node -ErrorAction SilentlyContinue
 if($null -eq $node){Report 'NODE_NOT_INSTALLED';exit 2}
 $folder=Join-Path $stage ('.qa-archive-recheck-'+[guid]::NewGuid().ToString('N'))
 foreach($name in $files){
  $path=Join-Path $folder ($name.Replace('/','\'))
  New-Item -ItemType Directory -Force -Path (Split-Path $path -Parent)|Out-Null
  $url='https://raw.githubusercontent.com/songpongo88-svg/qa-dashboard/'+$pinned+'/'+$name
  Invoke-WebRequest -Uri $url -OutFile $path -UseBasicParsing -TimeoutSec 30
  if((Get-Item -LiteralPath $path).Length -lt 100){
   Report 'SOURCE_DOWNLOAD_INCOMPLETE';exit 2
  }
  & $node.Source --check $path 1>$null 2>$null
  if($LASTEXITCODE -ne 0){Report 'SOURCE_SYNTAX_INVALID';exit 2}
 }
 $secure=Read-Host 'Existing local PostgreSQL password (read-only archive review)' -AsSecureString
 $bstr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
 try{$pw=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)}
 finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)}
 Remove-Variable secure -ErrorAction SilentlyContinue
 if([string]::IsNullOrWhiteSpace($pw)){
  Report 'LOCAL_PASSWORD_MISSING';exit 2
 }
 $env:PGPASSWORD=$pw
 $env:QA_WINDOWS_RECONCILE_REVIEW='1'
 $env:QA_WINDOWS_CANDIDATE_VERIFY='1'
 $env:QA_FAILOVER='OFF'
 & $node.Source (Join-Path $folder 'scripts\Verify-QA-Windows-Candidate-Archive.mjs')
 if($LASTEXITCODE -ne 0){
  Report 'RECHECK_FAILED_FROZEN_DATA_UNCHANGED';exit 2
 }
 Report 'LOCAL_READ_ONLY_RECHECK_COMPLETE'
}catch{
 Report 'SAFE_CHECK_FAILED_NO_CHANGES';exit 2
}finally{
 $pw=$null
 $env:PGPASSWORD=$oldPassword
 $env:QA_WINDOWS_RECONCILE_REVIEW=$oldReview
 $env:QA_WINDOWS_CANDIDATE_VERIFY=$oldVerify
 $env:QA_FAILOVER=$oldFailover
 if($folder -and (Test-Path -LiteralPath $folder -PathType Container)){
  Remove-Item -LiteralPath $folder -Recurse -Force -ErrorAction SilentlyContinue
 }
}
