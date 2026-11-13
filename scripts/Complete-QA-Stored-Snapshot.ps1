# Complete an already-stored verified QA snapshot on Windows.
# No Firestore API, OAuth, Google Cloud, bridge changes or failover activation.
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=Join-Path $HOME 'Documents\QA_Backup'
$stage=Join-Path $root 'source-stage'
$marker=Join-Path $stage '.qa-source-commit'
$secret=Join-Path $root 'snapshot-importer\password.dpapi'
$commit='17d7e4e44ec79e05884851307105eca012a16d76'
function Reveal([Security.SecureString]$v){
  $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($v)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($p) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }
}
try {
  if(-not (Test-Path -LiteralPath $marker -PathType Leaf) -or
     [IO.File]::ReadAllText($marker).Trim() -cne '05533e626820560f592d4467b7da89b0a67873c7') {
    Write-Output 'QA_OFFLINE=SOURCE_STAGE_UNVERIFIED';exit 2
  }
  if(-not (Test-Path -LiteralPath $secret -PathType Leaf) -or
     -not (Test-Path -LiteralPath (Join-Path $stage 'node_modules\pg\package.json') -PathType Leaf)) {
    Write-Output 'QA_OFFLINE=IMPORTER_NOT_INSTALLED';exit 2
  }
  $node=Get-Command node -ErrorAction SilentlyContinue
  if($null -eq $node){ Write-Output 'QA_OFFLINE=NODE_MISSING';exit 2 }
  $items=@(
    'server/qaFirestoreSnapshotCodec.js',
    'scripts/Materialize-QA-Stored-Snapshot.mjs'
  )
  foreach($item in $items){
    $path=Join-Path $stage ($item.Replace('/','\'))
    $parent=Split-Path -Parent $path
    if(-not (Test-Path -LiteralPath $parent -PathType Container)){
      Write-Output 'QA_OFFLINE=STAGE_FILES_MISSING';exit 2
    }
    $incoming=$path+'.qa-verified-new'
    $url='https://raw.githubusercontent.com/songpongo88-svg/qa-dashboard/'+$commit+'/'+$item
    Invoke-WebRequest -Uri $url -OutFile $incoming -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
    if(-not (Test-Path -LiteralPath $incoming -PathType Leaf)){
      Write-Output 'QA_OFFLINE=DOWNLOAD_INCOMPLETE';exit 2
    }
    if(Test-Path -LiteralPath $path -PathType Leaf){
      Copy-Item -LiteralPath $path -Destination ($path+'.before-offline-complete') -Force
    }
    Move-Item -LiteralPath $incoming -Destination $path -Force
  }
  $encrypted=(Get-Content -LiteralPath $secret -Raw).Trim()
  $pass=Reveal (ConvertTo-SecureString $encrypted)
  $env:QA_LOCAL_DATABASE_URL='postgresql://qa_snapshot_importer:'+
     [Uri]::EscapeDataString($pass)+'@127.0.0.1:5432/qa_dashboard_lab'
  $pass=$null
  & $node.Source (Join-Path $stage 'scripts\Materialize-QA-Stored-Snapshot.mjs')
  if($LASTEXITCODE -ne 0){Write-Output 'QA_OFFLINE=VALIDATION_FAILED_CLOSED';exit 2}
  Write-Output 'QA_OFFLINE=COMPLETED_NOT_ACTIVE'
} catch {
  Write-Output 'QA_OFFLINE=LOCAL_SCRIPT_FAILED_CLOSED'
  exit 2
} finally {
  Remove-Item Env:\QA_LOCAL_DATABASE_URL -ErrorAction SilentlyContinue
  Write-Output 'QA_OFFLINE_FIRESTORE_READS=0'
  Write-Output 'QA_FAILOVER=OFF'
}
