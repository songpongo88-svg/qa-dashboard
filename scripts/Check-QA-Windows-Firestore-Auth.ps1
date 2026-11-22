# Windows-only ADC and Google Cloud project check. No Firestore reads,
# no database access, no listener and no QA failover activation.
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$target='qa-dashboard-b0b5d'
$previousPrompts=$env:CLOUDSDK_CORE_DISABLE_PROMPTS
$previousColor=$env:CLOUDSDK_CORE_DISABLE_COLOR
$token=$null
$lines=$null
function Status([string]$code){
 Write-Output ('QA_WINDOWS_FIRESTORE_AUTH='+$code)
 Write-Output 'QA_WINDOWS_FIRESTORE_PERMISSIONS=NOT_VERIFIED'
 Write-Output 'QA_WINDOWS_FIRESTORE_QUOTA=NOT_VERIFIED'
 Write-Output 'QA_WINDOWS_FIRESTORE_READS=0'
 Write-Output 'QA_WINDOWS_FIRESTORE_LISTENER=NOT_STARTED'
 Write-Output 'QA_FAILOVER=OFF'
}
try{
 if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT){
  Status 'WINDOWS_REQUIRED';exit 2
 }
 $gcloud=Get-Command 'gcloud.cmd' -ErrorAction SilentlyContinue
 if($null -eq $gcloud){$gcloud=Get-Command 'gcloud' -ErrorAction SilentlyContinue}
 if($null -eq $gcloud){Status 'GCLOUD_NOT_INSTALLED';exit 2}
 $env:CLOUDSDK_CORE_DISABLE_PROMPTS='1'
 $env:CLOUDSDK_CORE_DISABLE_COLOR='1'
 $project=@(& $gcloud.Source config get-value project --quiet 2>$null)
 if($LASTEXITCODE -ne 0 -or ($project -join '').Trim() -cne $target){
  Status 'GOOGLE_CLOUD_PROJECT_NOT_SELECTED';exit 2
 }
 $explicit=$env:GOOGLE_APPLICATION_CREDENTIALS
 if(-not [string]::IsNullOrWhiteSpace($explicit)){
  if(-not (Test-Path -LiteralPath $explicit -PathType Leaf)){
   Status 'ADC_CREDENTIAL_FILE_NOT_FOUND';exit 2
  }
  try{
   $json=Get-Content -LiteralPath $explicit -Raw|ConvertFrom-Json
   $projectProp=$json.PSObject.Properties['project_id']
   if($null -ne $projectProp -and $projectProp.Value -and
      $projectProp.Value -cne $target){
    Status 'ADC_SERVICE_ACCOUNT_PROJECT_MISMATCH';exit 2
   }
  }catch{
   Status 'ADC_CREDENTIAL_FILE_INVALID';exit 2
  }
 }else{
  $defaultPath=Join-Path $env:APPDATA 'gcloud\application_default_credentials.json'
  if(-not (Test-Path -LiteralPath $defaultPath -PathType Leaf)){
   Status 'ADC_NOT_CONFIGURED';exit 2
  }
 }
 # Token refresh may contact Google OAuth; it does NOT read Firestore.
 # Never print access-token output, account email, key file or paths.
 $lines=@(& $gcloud.Source auth application-default print-access-token --quiet 2>$null)
 $minted=($LASTEXITCODE -eq 0)
 if($minted -and $lines.Count -eq 1){$token=[string]$lines[0]}
 if(-not $minted -or [string]::IsNullOrWhiteSpace($token) -or
    $token.Length -lt 20 -or $token.Length -gt 8192 -or $token -match '\s'){
  Status 'ADC_TOKEN_NOT_AVAILABLE';exit 2
 }
 Status 'ADC_TOKEN_READY_NO_FIRESTORE_READS'
}catch{
 Status 'LOCAL_CREDENTIAL_PREFLIGHT_FAILED'
 exit 2
}finally{
 $token=$null
 $lines=$null
 $env:CLOUDSDK_CORE_DISABLE_PROMPTS=$previousPrompts
 $env:CLOUDSDK_CORE_DISABLE_COLOR=$previousColor
}
