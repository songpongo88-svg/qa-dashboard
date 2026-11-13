# Read only the verified snapshot already stored in local PostgreSQL.
# No Firestore OAuth, no new snapshot, no DB writes, no failover.
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=Join-Path $HOME 'Documents\QA_Backup'
$stage=Join-Path $root 'source-stage'
$secret=Join-Path $root 'snapshot-importer\password.dpapi'
$sourceCommit='aad2f1e5a434c521f39647245a6c667e144af433'
$file=Join-Path $stage 'scripts\Diagnose-QA-Staged-Candidates.mjs'
function Reveal([Security.SecureString]$v){
  $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($v)
  try{[Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)}
  finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)}
}
try {
  if(-not (Test-Path -LiteralPath $secret -PathType Leaf) -or
     -not (Test-Path -LiteralPath (Join-Path $stage 'node_modules\pg\package.json') -PathType Leaf) -or
     -not (Test-Path -LiteralPath (Join-Path $stage 'server\qaFirestoreSnapshotCodec.js') -PathType Leaf)){
    Write-Output 'QA_OFFLINE_AUDIT=LOCAL_IMPORTER_FILES_MISSING';exit 2
  }
  $node=Get-Command node -ErrorAction SilentlyContinue
  if($null -eq $node){Write-Output 'QA_OFFLINE_AUDIT=NODE_UNAVAILABLE';exit 2}
  $url='https://raw.githubusercontent.com/songpongo88-svg/qa-dashboard/'+$sourceCommit+'/scripts/Diagnose-QA-Staged-Candidates.mjs'
  Invoke-WebRequest -Uri $url -OutFile $file -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
  $encrypted=(Get-Content -LiteralPath $secret -Raw).Trim()
  $pass=Reveal (ConvertTo-SecureString $encrypted)
  $env:QA_LOCAL_DATABASE_URL='postgresql://qa_snapshot_importer:'+
    [Uri]::EscapeDataString($pass)+'@127.0.0.1:5432/qa_dashboard_lab'
  $pass=$null
  & $node.Source $file
  $result=$LASTEXITCODE
  if($result -ne 0){exit 2}
} catch {
  Write-Output 'QA_OFFLINE_AUDIT=CHECK_FAILED_CLOSED'
  exit 2
} finally {
  Remove-Item Env:\QA_LOCAL_DATABASE_URL -ErrorAction SilentlyContinue
}
