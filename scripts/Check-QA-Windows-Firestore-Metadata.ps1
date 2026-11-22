# Windows-only Firestore database metadata permission probe.
# One GET to /databases/(default) (not /documents), zero document reads.
# Does not certify datastore.entities.get/list, quota or full source parity.
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$project='qa-dashboard-b0b5d'
$database='projects/qa-dashboard-b0b5d/databases/(default)'
$oldPrompt=$env:CLOUDSDK_CORE_DISABLE_PROMPTS
$token=$null
$headers=$null
function Status([string]$status) {
 Write-Output ('QA_WINDOWS_FIRESTORE_METADATA='+$status)
 Write-Output 'QA_WINDOWS_FIRESTORE_DOCUMENT_ACCESS=NOT_VERIFIED'
 Write-Output 'QA_WINDOWS_FIRESTORE_QUOTA=NOT_VERIFIED'
 Write-Output 'QA_WINDOWS_FIRESTORE_DOCUMENT_READS=0'
 Write-Output 'QA_WINDOWS_FIRESTORE_LISTENER=NOT_STARTED'
 Write-Output 'QA_FAILOVER=OFF'
}
try {
 if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT){
  Status 'WINDOWS_REQUIRED';exit 2
 }
 $cli=Get-Command 'gcloud.cmd' -ErrorAction SilentlyContinue
 if($null -eq $cli){$cli=Get-Command 'gcloud' -ErrorAction SilentlyContinue}
 if($null -eq $cli){Status 'GCLOUD_NOT_INSTALLED';exit 2}
 $env:CLOUDSDK_CORE_DISABLE_PROMPTS='1'
 $selected=@(& $cli.Source config get-value project --quiet 2>$null)
 if($LASTEXITCODE -ne 0 -or ($selected -join '').Trim() -cne $project){
  Status 'WRONG_GCLOUD_PROJECT';exit 2
 }
 # Application Default Credentials, not the CLI user token. Never print it.
 $lines=@(& $cli.Source auth application-default print-access-token --quiet 2>$null)
 if($LASTEXITCODE -ne 0 -or $lines.Count -ne 1){
  Status 'ADC_TOKEN_UNAVAILABLE';exit 2
 }
 $token=[string]$lines[0]
 if($token.Length -lt 20 -or $token.Length -gt 8192 -or $token -match '\s'){
  Status 'ADC_TOKEN_INVALID';exit 2
 }
 $headers=@{Authorization=('Bearer '+$token);Accept='application/json'}
 # Firestore database metadata GET is not a document read, and requires
 # datastore.databases.getMetadata (distinct from document-read IAM rights).
 $url='https://firestore.googleapis.com/v1/projects/qa-dashboard-b0b5d/databases/(default)'
 try {
  $response=Invoke-RestMethod -Method Get -Uri $url -Headers $headers -TimeoutSec 15
 }catch [System.Net.WebException] {
  $statusCode=0
  if($null -ne $_.Exception.Response){
   $statusCode=[int]$_.Exception.Response.StatusCode
  }
  if($statusCode -eq 401){Status 'TOKEN_REJECTED';exit 2}
  if($statusCode -eq 403){Status 'METADATA_PERMISSION_DENIED';exit 2}
  if($statusCode -eq 404){Status 'DATABASE_NOT_ACCESSIBLE_OR_MISSING';exit 2}
  if($statusCode -eq 429){Status 'REQUEST_RATE_LIMITED';exit 2}
  Status 'METADATA_REQUEST_FAILED';exit 2
 }
 if($response.name -cne $database){
  Status 'WRONG_DATABASE_RESPONSE';exit 2
 }
 $region=$response.locationId
 if([string]::IsNullOrWhiteSpace($region)){
  Status 'DATABASE_REGION_NOT_RETURNED';exit 2
 }
 if($region -cne 'asia-southeast1'){
  Status 'DATABASE_REGION_UNEXPECTED';exit 2
 }
 Status 'DATABASE_METADATA_ACCESS_VERIFIED'
}catch{
 # No exception body, request URI containing credentials or token is printed.
 Status 'METADATA_PREFLIGHT_FAILED_CLOSED'
 exit 2
}finally{
 $headers=$null
 $token=$null
 $lines=$null
 $env:CLOUDSDK_CORE_DISABLE_PROMPTS=$oldPrompt
}
