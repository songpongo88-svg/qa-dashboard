# EXPLICIT opt-in source parity check. May use up to 3,000
# reserved Firestore document-read units; minimum 1 read per list request.
# No Firestore writes, standby data writes, continuous listener or cutover.
[CmdletBinding()]
param([switch]$Run)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$pin='d46f57eaa995ed117937659e1ce66d1ec0009826'
$root=Join-Path $HOME 'Documents\QA_Backup\source-stage'
$proof=Join-Path $root '.qa-windows-private-signal-stage-commit'
$expectedProof='b4edc5101285d3e85ccafaba9a076c3553756879'
$files=@(
 'server/qaLiveMirrorStage.js',
 'server/qaWindowsProbeBaseline.js',
 'server/qaFirestoreRestSnapshot.js',
 'server/qaSourceReadBudget.js',
 'server/qaWindowsSourceParity.js',
 'scripts/Run-QA-Windows-Source-Parity.mjs'
)
$priorPw=$env:PGPASSWORD
$priorToken=$env:QA_FIRESTORE_OAUTH_ACCESS_TOKEN
$priorStage=$env:QA_WINDOWS_PARITY_STAGE_ROOT
$priorFlag=$env:QA_WINDOWS_SOURCE_PARITY
$priorManifest=$env:QA_WINDOWS_SOURCE_PROBE_MANIFEST
$priorFailover=$env:QA_FAILOVER
$priorCloudPrompt=$env:CLOUDSDK_CORE_DISABLE_PROMPTS
$pw=$null
$token=$null
$folder=$null
function Result([string]$code){
 Write-Output ('QA_WINDOWS_PARITY_WRAPPER='+$code)
 Write-Output 'QA_SOURCE_LISTENER=NOT_STARTED'
 Write-Output 'QA_FAILOVER=OFF'
}
try{
 if(-not $Run){
  Result 'OFF_NEEDS_EXPLICIT_RUN'
  Write-Output 'QA_PARITY_FIRESTORE_READS=0'
  exit 0
 }
 if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT){
  Result 'WINDOWS_REQUIRED';exit 2
 }
 if(-not (Test-Path -LiteralPath $proof -PathType Leaf) -or
    [IO.File]::ReadAllText($proof).Trim() -cne $expectedProof){
  Result 'WINDOWS_STAGE_INSTALL_MISSING';exit 2
 }
 if(-not (Test-Path -LiteralPath (Join-Path $root 'node_modules\pg\package.json') -PathType Leaf)){
  Result 'PG_DRIVER_MISSING';exit 2
 }
 if($priorFailover -and $priorFailover -cne 'OFF'){
  Result 'UNEXPECTED_FAILOVER_ENV';exit 2
 }
 $node=Get-Command node -ErrorAction SilentlyContinue
 $cli=Get-Command 'gcloud.cmd' -ErrorAction SilentlyContinue
 if($null -eq $cli){$cli=Get-Command 'gcloud' -ErrorAction SilentlyContinue}
 if($null -eq $node -or $null -eq $cli){
  Result 'NODE_OR_GCLOUD_MISSING';exit 2
 }
 $env:CLOUDSDK_CORE_DISABLE_PROMPTS='1'
 $selected=@(& $cli.Source config get-value project --quiet 2>$null)
 if($LASTEXITCODE -ne 0 -or ($selected -join '').Trim() -cne 'qa-dashboard-b0b5d'){
  Result 'WRONG_GCLOUD_PROJECT';exit 2
 }
 # Prepare version-pinned code locally; no Firestore requests yet.
 $folder=Join-Path $root ('.qa-parity-local-'+[guid]::NewGuid().ToString('N'))
 foreach($entry in $files){
  $file=Join-Path $folder ($entry.Replace('/','\'))
  New-Item -ItemType Directory -Force -Path (Split-Path $file -Parent)|Out-Null
  $url='https://raw.githubusercontent.com/songpongo88-svg/qa-dashboard/'+$pin+'/'+$entry
  Invoke-WebRequest -Uri $url -OutFile $file -TimeoutSec 30 -UseBasicParsing
  if((Get-Item -LiteralPath $file).Length -lt 100){
   Result 'PINNED_FILE_INCOMPLETE';exit 2
  }
  & $node.Source --check $file 1>$null 2>$null
  if($LASTEXITCODE -ne 0){
   Result 'PINNED_SOURCE_SYNTAX_INVALID';exit 2
  }
 }
 $secret=Read-Host 'Local PostgreSQL postgres password (one full parity check)' -AsSecureString
 $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
 try{$pw=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}
 finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
 Remove-Variable secret -ErrorAction SilentlyContinue
 if([string]::IsNullOrWhiteSpace($pw)){
  Result 'LOCAL_PASSWORD_MISSING';exit 2
 }
 $lines=@(& $cli.Source auth application-default print-access-token --quiet 2>$null)
 if($LASTEXITCODE -ne 0 -or $lines.Count -ne 1){
  Result 'ADC_TOKEN_MISSING';exit 2
 }
 $token=[string]$lines[0]
 $lines=$null
 if($token.Length -lt 20 -or $token.Length -gt 8192 -or $token -match '\s'){
  Result 'ADC_TOKEN_INVALID';exit 2
 }
 $env:PGPASSWORD=$pw
 $env:QA_FIRESTORE_OAUTH_ACCESS_TOKEN=$token
 $env:QA_WINDOWS_PARITY_STAGE_ROOT=$root
 $env:QA_WINDOWS_SOURCE_PARITY='1'
 $env:QA_WINDOWS_SOURCE_PROBE_MANIFEST='1'
 $env:QA_FAILOVER='OFF'
 # The Node runner checks frozen hash manifest and available quota before
 # creating an exclusive daily marker or issuing the first Firestore GET.
 & $node.Source (Join-Path $folder 'scripts\Run-QA-Windows-Source-Parity.mjs')
 if($LASTEXITCODE -eq 3){
  Result 'RECONCILIATION_REQUIRED'
  exit 3
 }
 if($LASTEXITCODE -ne 0){
  Result 'CHECK_BLOCKED'
  exit 2
 }
 Result 'MATCHED_SNAPSHOT_ONLY_NOT_LIVE'
}catch{
 Result 'FAILED_CLOSED'
 exit 2
}finally{
 $pw=$null
 $token=$null
 $env:PGPASSWORD=$priorPw
 $env:QA_FIRESTORE_OAUTH_ACCESS_TOKEN=$priorToken
 $env:QA_WINDOWS_PARITY_STAGE_ROOT=$priorStage
 $env:QA_WINDOWS_SOURCE_PARITY=$priorFlag
 $env:QA_WINDOWS_SOURCE_PROBE_MANIFEST=$priorManifest
 $env:QA_FAILOVER=$priorFailover
 $env:CLOUDSDK_CORE_DISABLE_PROMPTS=$priorCloudPrompt
 if($folder -and (Test-Path -LiteralPath $folder -PathType Container)){
  Remove-Item -LiteralPath $folder -Force -Recurse -ErrorAction SilentlyContinue
 }
}
