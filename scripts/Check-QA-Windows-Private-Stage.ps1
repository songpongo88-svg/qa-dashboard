# Read-only acceptance of an ALREADY INSTALLED Windows private source-signal stage.
# The script checks only PostgreSQL and the frozen local snapshot; no
# Firestore queries, no new migrations, listener process or failover.
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$stage=Join-Path $HOME 'Documents\QA_Backup\source-stage'
$marker=Join-Path $stage '.qa-windows-private-signal-stage-commit'
$pinnedInstaller='b4edc5101285d3e85ccafaba9a076c3553756879'
$pinnedChecker='bc82bc5441107b3bf469dfb3dc7fd473548fe9e2'
$tempScript=$null
$oldPwd=$env:PGPASSWORD
$oldAcceptance=$env:QA_WINDOWS_STAGE_ACCEPTANCE
$oldManifest=$env:QA_WINDOWS_SOURCE_PROBE_MANIFEST
$oldFailover=$env:QA_FAILOVER
$password=$null
function PrintSafe([string]$status){
 Write-Output ('QA_WINDOWS_STAGE_CHECK='+$status)
 Write-Output 'QA_WINDOWS_STAGE_FIRESTORE_READS=0'
 Write-Output 'QA_WINDOWS_STAGE_LISTENER=NOT_STARTED_BY_CHECK'
 Write-Output 'QA_FAILOVER=OFF'
}
try{
 if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT){
  PrintSafe 'WINDOWS_REQUIRED';exit 2
 }
 if(-not (Test-Path -LiteralPath $marker -PathType Leaf) -or
    [IO.File]::ReadAllText($marker).Trim() -cne $pinnedInstaller){
  PrintSafe 'PREVIOUS_STAGE_INSTALL_UNVERIFIED';exit 2
 }
 foreach($path in @('server\qaWindowsProbeBaseline.js',
                    'server\qaLiveMirrorStage.js',
                    'server\qaWindowsPrivateSignalStage.js',
                    'node_modules\pg\package.json')){
  if(-not (Test-Path -LiteralPath (Join-Path $stage $path) -PathType Leaf)){
   PrintSafe 'STAGED_MODULES_MISSING';exit 2
  }
 }
 $node=Get-Command node -ErrorAction SilentlyContinue
 if($null -eq $node){PrintSafe 'NODE_MISSING';exit 2}
 if($oldFailover -and $oldFailover -cne 'OFF'){
  PrintSafe 'FAILOVER_ENV_UNEXPECTED';exit 2
 }
 $scripts=Join-Path $stage 'scripts'
 New-Item -ItemType Directory -Force -Path $scripts|Out-Null
 $tempScript=Join-Path $scripts ('.qa-windows-check-'+[Guid]::NewGuid().ToString('N')+'.mjs')
 $url='https://raw.githubusercontent.com/songpongo88-svg/qa-dashboard/'+
  $pinnedChecker+'/scripts/Check-QA-Windows-Private-Signal-Stage.mjs'
 Invoke-WebRequest -Uri $url -OutFile $tempScript -UseBasicParsing -TimeoutSec 30
 $content=[IO.File]::ReadAllText($tempScript)
 if($content.Length -lt 800 -or
    -not $content.Contains('inspectQaWindowsPrivateStage') -or
    -not $content.Contains('default_transaction_read_only=on') -or
    -not $content.Contains('QA_WINDOWS_STAGE_ACCEPTANCE')){
  PrintSafe 'PINNED_CHECKER_UNRECOGNIZED';exit 2
 }
 & $node.Source --check $tempScript 1>$null 2>$null
 if($LASTEXITCODE -ne 0){
  PrintSafe 'CHECKER_SYNTAX_INVALID';exit 2
 }
 $secure=Read-Host 'Existing local PostgreSQL postgres password (read-only check)' -AsSecureString
 $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
 try{$password=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)}
 finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
 Remove-Variable secure -ErrorAction SilentlyContinue
 if([string]::IsNullOrWhiteSpace($password)){
  PrintSafe 'LOCAL_PASSWORD_MISSING';exit 2
 }
 $env:PGPASSWORD=$password
 $env:QA_WINDOWS_STAGE_ACCEPTANCE='1'
 $env:QA_WINDOWS_SOURCE_PROBE_MANIFEST='1'
 $env:QA_FAILOVER='OFF'
 & $node.Source $tempScript
 $status=$LASTEXITCODE
 if($status -ne 0){
  PrintSafe 'BASELINE_OR_SCHEMA_REQUIRES_REVIEW'
  exit 2
 }
 PrintSafe 'READ_ONLY_LOCAL_ACCEPTANCE_COMPLETE'
}catch{
 PrintSafe 'SAFE_CHECK_FAILED'
 exit 2
}finally{
 $env:PGPASSWORD=$oldPwd
 $env:QA_WINDOWS_STAGE_ACCEPTANCE=$oldAcceptance
 $env:QA_WINDOWS_SOURCE_PROBE_MANIFEST=$oldManifest
 $env:QA_FAILOVER=$oldFailover
 $password=$null
 if($tempScript -and (Test-Path -LiteralPath $tempScript -PathType Leaf)){
  Remove-Item -LiteralPath $tempScript -Force -ErrorAction SilentlyContinue
 }
}
