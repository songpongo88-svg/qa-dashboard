# Install ONLY a disabled Windows source-signal staging table and source files.
# Existing PostgreSQL 17, stored snapshot and Delta Journal are reused.
# Default = inspection only; -Apply asks for local postgres password and creates
# a local database backup before installing additive schema.
# NEVER launches a listener, contacts Firestore, enables QA writes or failover.
[CmdletBinding()]
param([switch]$Apply)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=Join-Path $HOME 'Documents\QA_Backup'
$stage=Join-Path $root 'source-stage'
$deltaProof=Join-Path $stage '.qa-source-delta-schema-commit'
$roleProof=Join-Path $stage '.qa-delta-receiver-prepared'
$installProof=Join-Path $stage '.qa-windows-private-signal-stage-commit'
$backupDir=Join-Path $root 'snapshot-db-backups'
$pinnedCommit='b4edc5101285d3e85ccafaba9a076c3553756879'
$deltaVersion='174e507621b287e1a0c95dca5707d9b9d64bc9dc'
$roleVersion='3d64c35d9ca9f8cacf757ed293d351adea788418'
$files=@(
 'server/qaWindowsSourceProbe.js',
 'server/qaWindowsSourceDocumentReader.js',
 'server/qaWindowsSourceSignalJournal.js',
 'server/qaWindowsProbeBaseline.js',
 'server/qaWindowsPrivateSignalStage.js',
 'migration/qa-windows-source-signal-stage.sql'
)
function Out([string]$status){Write-Output ('QA_WINDOWS_SIGNAL_INSTALL='+$status)}
function Block([string]$status){
 Out $status
 Write-Output 'QA_FIRESTORE_READS=0'
 Write-Output 'QA_FAILOVER=OFF'
 exit 2
}
function Bin([string]$name){
 $found=Get-Command $name -ErrorAction SilentlyContinue
 if($null -ne $found){return $found.Source}
 $path=Join-Path 'C:\Program Files\PostgreSQL\17\bin' $name
 if(Test-Path -LiteralPath $path -PathType Leaf){return $path}
 return $null
}
function Reveal([Security.SecureString]$secure){
 $bstr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
 try{return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)}
 finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)}
}
if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT){
 Block 'WINDOWS_REQUIRED'
}
if(-not (Test-Path -LiteralPath $stage -PathType Container) -or
   -not (Test-Path -LiteralPath $deltaProof -PathType Leaf) -or
   -not (Test-Path -LiteralPath $roleProof -PathType Leaf) -or
   [IO.File]::ReadAllText($deltaProof).Trim() -cne $deltaVersion -or
   [IO.File]::ReadAllText($roleProof).Trim() -cne $roleVersion){
 Block 'EXISTING_WINDOWS_DELTA_STAGE_NOT_VERIFIED'
}
if(-not (Test-Path -LiteralPath (Join-Path $stage 'server\qaLiveMirrorStage.js') -PathType Leaf) -or
   -not (Test-Path -LiteralPath (Join-Path $stage 'node_modules\pg\package.json') -PathType Leaf)){
 Block 'SOURCE_STAGE_DEPENDENCY_MISSING'
}
$psql=Bin 'psql.exe'
$dump=Bin 'pg_dump.exe'
$node=Get-Command node -ErrorAction SilentlyContinue
if(-not $psql -or -not $dump -or $null -eq $node){
 Block 'LOCAL_POSTGRES_17_OR_NODE_MISSING'
}
if(Test-Path -LiteralPath $installProof -PathType Leaf){
 if([IO.File]::ReadAllText($installProof).Trim() -cne $pinnedCommit){
  Block 'PREVIOUS_STAGE_UNRECOGNIZED'
 }
 foreach($name in $files){
  if(-not (Test-Path -LiteralPath (Join-Path $stage ($name.Replace('/','\'))) -PathType Leaf)){
   Block 'PREVIOUS_STAGE_FILES_MISSING'
  }
 }
 Out 'ALREADY_PREPARED_INACTIVE'
 Write-Output 'QA_SOURCE_LISTENER=NOT_STARTED'
 Write-Output 'QA_FIRESTORE_READS=0'
 Write-Output 'QA_FAILOVER=OFF'
 exit 0
}
if(-not $Apply){
 Out 'READY_FOR_EXPLICIT_INACTIVE_INSTALL'
 Write-Output 'QA_POSTGRES_WRITES=0'
 Write-Output 'QA_FIRESTORE_READS=0'
 Write-Output 'QA_FAILOVER=OFF'
 exit 0
}
$temp=Join-Path $root ('qa-windows-signal-staging-'+[Guid]::NewGuid().ToString('N'))
$secretText=$null
$changed=@()
$complete=$false
try{
 New-Item -ItemType Directory -Force -Path $temp|Out-Null
 foreach($name in $files){
  $local=Join-Path $temp ($name.Replace('/','\'))
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $local)|Out-Null
  $url='https://raw.githubusercontent.com/songpongo88-svg/qa-dashboard/'+
   $pinnedCommit+'/'+$name
  Invoke-WebRequest -Uri $url -OutFile $local -UseBasicParsing -TimeoutSec 30
  if((Get-Item -LiteralPath $local).Length -lt 100){
   Block 'PINNED_SOURCE_INCOMPLETE'
  }
 }
 $sourceSql=Join-Path $temp 'migration\qa-windows-source-signal-stage.sql'
 $content=[IO.File]::ReadAllText($sourceSql)
 if(-not $content.Contains('CREATE TABLE IF NOT EXISTS qa_windows_probe_v1.source_signals') -or
    -not $content.Contains('CHECK(source_commit_verified=false)') -or
    -not $content.Contains('CHECK(needs_reconciliation=true)') -or
    -not $content.Contains('REVOKE ALL ON qa_windows_probe_v1.source_signals FROM PUBLIC') -or
    $content -match '(?i)\bDROP\b|\bTRUNCATE\b|\bGRANT ALL\b|\bCREATE ROLE\b|\bALTER ROLE\b'){
  Block 'PINNED_SIGNAL_SCHEMA_UNEXPECTED'
 }
 foreach($name in $files){
  if($name.EndsWith('.js')){
   & $node.Source --check (Join-Path $temp ($name.Replace('/','\'))) 1>$null 2>$null
   if($LASTEXITCODE -ne 0){Block 'PINNED_NODE_SYNTAX_FAILED'}
  }
 }
 $secure=Read-Host 'Existing local PostgreSQL postgres password' -AsSecureString
 $secretText=Reveal $secure
 Remove-Variable secure -ErrorAction SilentlyContinue
 if([string]::IsNullOrWhiteSpace($secretText)){Block 'LOCAL_ADMIN_PASSWORD_MISSING'}
 $env:PGPASSWORD=$secretText
 # Fail closed if the current snapshot has changed or is not frozen.
 $preflight=@'
SELECT CASE WHEN current_database()='qa_dashboard_lab'
 AND current_setting('server_version_num')::int BETWEEN 170000 AND 179999
 AND NOT pg_is_in_recovery()
 AND to_regclass('qa_failover_v1.live_snapshot_rows') IS NOT NULL
 AND to_regclass('qa_failover_v1.source_delta_events') IS NOT NULL
 AND to_regclass('qa_failover_v1.source_delta_latest') IS NOT NULL
 AND EXISTS(
  SELECT 1 FROM qa_failover_v1.state s
  JOIN qa_failover_v1.live_snapshot_batches b
   ON b.snapshot_id=s.active_snapshot_id
  WHERE s.id=1 AND s.mode='disabled' AND s.write_frozen IS TRUE
   AND s.source_snapshot_verified IS FALSE
   AND b.status='copy_verified' AND b.approved_for_failover IS FALSE
   AND b.source_documents=b.stored_documents
   AND b.source_documents=(SELECT count(*) FROM qa_failover_v1.live_snapshot_rows r
    WHERE r.snapshot_id=b.snapshot_id)
 )
 THEN 'SAFE' ELSE 'BLOCKED' END;
'@
 $proof=@(& $psql -X -w -A -t -h 127.0.0.1 -p 5432 -U postgres -d qa_dashboard_lab -v ON_ERROR_STOP=1 -c $preflight 2>$null)
 if($LASTEXITCODE -ne 0 -or ($proof -join '').Trim() -cne 'SAFE'){
  Block 'FROZEN_SOURCE_SNAPSHOT_NOT_VERIFIED'
 }
 Out 'FROZEN_SNAPSHOT_VERIFIED'
 New-Item -ItemType Directory -Force -Path $backupDir|Out-Null
 $backup=Join-Path $backupDir ('qa_before_windows_signal_'+(Get-Date -Format 'yyyyMMdd_HHmmss')+'.backup')
 & $dump -w -h 127.0.0.1 -p 5432 -U postgres -d qa_dashboard_lab -Fc -f $backup 2>$null
 if($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $backup -PathType Leaf) -or
    (Get-Item -LiteralPath $backup).Length -lt 1024){
  Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
  Block 'PREINSTALL_DATABASE_BACKUP_FAILED'
 }
 Out 'LOCAL_DATABASE_BACKUP_CREATED'
 & $psql -X -q -w -h 127.0.0.1 -p 5432 -U postgres -d qa_dashboard_lab -v ON_ERROR_STOP=1 -f $sourceSql 1>$null 2>$null
 if($LASTEXITCODE -ne 0){Block 'PRIVATE_SCHEMA_MIGRATION_FAILED'}
 $postSql=@'
SELECT CASE WHEN
 to_regclass('qa_windows_probe_v1.source_signals') IS NOT NULL
 AND (SELECT count(*) FROM qa_windows_probe_v1.source_signals)=0
 AND EXISTS(SELECT 1 FROM qa_failover_v1.state
   WHERE id=1 AND mode='disabled' AND write_frozen IS TRUE
     AND source_snapshot_verified IS FALSE)
 AND NOT has_schema_privilege('public','qa_windows_probe_v1','USAGE')
 THEN 'SAFE' ELSE 'BLOCKED' END;
'@
 # PUBLIC is a pseudo-role and cannot be passed to has_schema_privilege
 # by name as a normal role; use a dedicated negative SQL privilege check.
 $postSql=$postSql.Replace(
  "AND NOT has_schema_privilege('public','qa_windows_probe_v1','USAGE')",
  "AND NOT EXISTS(SELECT 1 FROM pg_namespace n "+
  "JOIN pg_roles r ON r.rolname='anon' "+
  "WHERE n.nspname='qa_windows_probe_v1' "+
  "AND has_schema_privilege(r.oid,n.oid,'USAGE'))"
 )
 $check=@(& $psql -X -w -A -t -h 127.0.0.1 -p 5432 -U postgres -d qa_dashboard_lab -v ON_ERROR_STOP=1 -c $postSql 2>$null)
 if($LASTEXITCODE -ne 0 -or ($check -join '').Trim() -cne 'SAFE'){
  Block 'PRIVATE_SCHEMA_POSTCHECK_FAILED'
 }
 $stamp=Get-Date -Format 'yyyyMMdd_HHmmss'
 foreach($name in $files){
  $target=Join-Path $stage ($name.Replace('/','\'))
  $incoming=Join-Path $temp ($name.Replace('/','\'))
  New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force|Out-Null
  $existed=Test-Path -LiteralPath $target -PathType Leaf
  $saved=$target+'.before-signal-'+$stamp
  if($existed){Copy-Item -LiteralPath $target -Destination $saved -Force}
  $changed+=@{target=$target;saved=$saved;existed=$existed}
  Copy-Item -LiteralPath $incoming -Destination $target -Force
 }
 [IO.File]::WriteAllText($installProof,$pinnedCommit)
 $complete=$true
 Out 'PRIVATE_METADATA_STAGE_INSTALLED_INACTIVE'
 Write-Output 'QA_SOURCE_LISTENER=NOT_STARTED'
 Write-Output 'QA_FIRESTORE_READS=0'
 Write-Output 'QA_FAILOVER=OFF'
}catch{
 if(-not $complete){
  for($i=$changed.Count-1;$i -ge 0;$i--){
   $item=$changed[$i]
   try{
    if($item.existed){Copy-Item -LiteralPath $item.saved -Destination $item.target -Force}
    else{Remove-Item -LiteralPath $item.target -Force}
   }catch{Out 'LOCAL_SOURCE_FILE_RESTORE_NEEDS_REVIEW'}
  }
  Remove-Item -LiteralPath $installProof -Force -ErrorAction SilentlyContinue
 }
 Block 'INSTALL_FAILED_CLOSED'
}finally{
 $env:PGPASSWORD=$null
 $secretText=$null
 if(Test-Path -LiteralPath $temp){Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue}
}
