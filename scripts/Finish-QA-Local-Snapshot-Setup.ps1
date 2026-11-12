# One-time QA snapshot importer bootstrap on the user's Windows machine.
# ONLY local qa_dashboard_lab, not Production. No change to the existing bridge.
# Administrator password is prompted on the LOCAL machine and never sent to ChatGPT.
[CmdletBinding()]
param([switch]$SetupOnly)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=Join-Path $HOME 'Documents\QA_Backup'
$source=Join-Path $root 'source-stage'
$marker=Join-Path $source '.qa-source-commit'
$pinnedSource='05533e626820560f592d4467b7da89b0a67873c7'
$pinnedFix='5115fdf22d63ed51ba604c149d38f823b67499be'
$importDir=Join-Path $root 'snapshot-importer'
$backupDir=Join-Path $root 'snapshot-db-backups'
$secretPath=Join-Path $importDir 'password.dpapi'
$adminPwd=$null
$importPwd=$null
$env:PGPASSWORD=$null
$env:QA_LOCAL_DATABASE_URL=$null
$env:QA_FIRESTORE_OAUTH_ACCESS_TOKEN=$null
function Report([string]$status) {
  Write-Output ('QA_SETUP='+$status)
}
function FindPgTool([string]$exe) {
  $tool=Get-Command $exe -ErrorAction SilentlyContinue
  if($null -ne $tool) { return $tool.Source }
  $path='C:\Program Files\PostgreSQL\17\bin\'+$exe
  if(Test-Path -LiteralPath $path -PathType Leaf) { return $path }
  return $null
}
function Reveal([Security.SecureString]$secret) {
  $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
try {
  if(-not (Test-Path -LiteralPath $marker -PathType Leaf) -or
     [IO.File]::ReadAllText($marker).Trim() -cne $pinnedSource) {
    Report 'LOCAL_SOURCE_STAGE_UNVERIFIED'; exit 2
  }
  if(-not (Test-Path -LiteralPath (Join-Path $source 'node_modules\pg\package.json') -PathType Leaf)) {
    Report 'LOCAL_PG_DRIVER_MISSING'; exit 2
  }
  $psql=FindPgTool 'psql.exe'
  $pgdump=FindPgTool 'pg_dump.exe'
  $node=Get-Command node -ErrorAction SilentlyContinue
  $gcloud=Get-Command gcloud.cmd -ErrorAction SilentlyContinue
  if($null -eq $gcloud){$gcloud=Get-Command gcloud -ErrorAction SilentlyContinue}
  if(-not $psql -or -not $pgdump -or $null -eq $node) {
    Report 'POSTGRES_TOOLS_OR_NODE_MISSING'; exit 2
  }
  if(-not $SetupOnly -and $null -eq $gcloud) {
    Report 'GCLOUD_CLI_MISSING'; exit 2
  }

  # Fetch only reviewed, immutable QA stage modules into a temporary folder.
  # Do NOT replace the bridge or the original 2,081-document archive.
  $download=Join-Path $root ('qa-stage-update-'+[Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $download -Force | Out-Null
  try {
    $files=@('migration/qa-local-live-snapshot-stage.sql',
      'scripts/Run-QA-Authoritative-Snapshot-Stage.mjs',
      'server/qaStandbyCandidateMaterializer.js')
    foreach($name in $files){
      $dest=Join-Path $download ($name.Replace('/','\'))
      New-Item -ItemType Directory -Path (Split-Path -Parent $dest) -Force | Out-Null
      $url='https://raw.githubusercontent.com/songpongo88-svg/qa-dashboard/'+$pinnedFix+'/'+$name
      Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
    }

    # One local PostgreSQL administrator password prompt, never an account key
    # sent through chat, a command line argument or a durable config.
    $secure=Read-Host 'Enter LOCAL PostgreSQL postgres administrator password' -AsSecureString
    $adminPwd=Reveal $secure
    Remove-Variable secure -ErrorAction SilentlyContinue
    if([string]::IsNullOrWhiteSpace($adminPwd)) { Report 'ADMIN_PASSWORD_MISSING'; exit 2 }
    $env:PGPASSWORD=$adminPwd
    $db=@(& $psql -X -w -A -t -h 127.0.0.1 -p 5432 -U postgres -d qa_dashboard_lab -c 'SELECT current_database();' 2>$null)
    if($LASTEXITCODE -ne 0 -or ($db -join '').Trim() -cne 'qa_dashboard_lab'){
      Report 'LOCAL_POSTGRES_ADMIN_LOGIN_FAILED'; exit 2
    }
    Report 'POSTGRES_ADMIN_VERIFIED'

    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    $backup=Join-Path $backupDir ('qa_before_snapshot_setup_'+(Get-Date -Format 'yyyyMMdd_HHmmss')+'.backup')
    & $pgdump -w -h 127.0.0.1 -p 5432 -U postgres -d qa_dashboard_lab -Fc -f $backup 2>$null
    if($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $backup -PathType Leaf) -or
       (Get-Item -LiteralPath $backup).Length -lt 1024) {
      Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
      Report 'POSTGRES_BACKUP_FAILED_NO_MIGRATION'; exit 2
    }
    Report 'EXISTING_DATABASE_BACKED_UP'

    # Generate a distinct cryptographically random password for a restricted
    # local importer. No schema, login or grant change to the read-only bridge.
    $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
    $bytes=New-Object byte[] 32
    try{$rng.GetBytes($bytes)}finally{$rng.Dispose()}
    $importPwd=[BitConverter]::ToString($bytes).Replace('-','').ToLowerInvariant()
    [Array]::Clear($bytes,0,$bytes.Length)

    $migration=[IO.File]::ReadAllText((Join-Path $download 'migration\qa-local-live-snapshot-stage.sql'))
    if($migration -notmatch '(?m)^BEGIN;\s*$' -or $migration -notmatch '(?m)^COMMIT;\s*$' -or
       $migration -notmatch 'CREATE TABLE IF NOT EXISTS qa_failover_v1.live_candidate_evaluations') {
      Report 'REVIEWED_MIGRATION_MISMATCH'; exit 2
    }
    $migration=$migration -replace '(?m)^BEGIN;\s*$', '' -replace '(?m)^COMMIT;\s*$', ''
    $sql=@'
SET default_transaction_read_only=off;
BEGIN;
DO $guard$
DECLARE st record;
BEGIN
 IF current_database() <> 'qa_dashboard_lab' THEN
   RAISE EXCEPTION 'incorrect QA local database';
 END IF;
 SELECT mode,write_frozen,source_snapshot_verified INTO st
 FROM qa_failover_v1.state WHERE id=1;
 IF NOT FOUND OR st.mode <> 'disabled' OR st.write_frozen IS DISTINCT FROM TRUE
   OR st.source_snapshot_verified IS DISTINCT FROM FALSE THEN
   RAISE EXCEPTION 'QA standby must remain disabled and frozen';
 END IF;
END $guard$;
'@
    $sql+=[Environment]::NewLine+$migration+[Environment]::NewLine
    $sql+=@'
DO $create_importer$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='qa_snapshot_importer') THEN
   CREATE ROLE qa_snapshot_importer LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
 END IF;
END $create_importer$;
'@
    # Generated password is lowercase hex only, never interpolated from input.
    $sql+=[Environment]::NewLine+"ALTER ROLE qa_snapshot_importer WITH PASSWORD '$importPwd';"+[Environment]::NewLine
    $sql+=@'
ALTER ROLE qa_snapshot_importer SET default_transaction_read_only=off;
REVOKE ALL PRIVILEGES ON DATABASE qa_dashboard_lab FROM qa_snapshot_importer;
REVOKE ALL PRIVILEGES ON SCHEMA qa_failover_v1 FROM qa_snapshot_importer;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA qa_failover_v1 FROM qa_snapshot_importer;
GRANT CONNECT ON DATABASE qa_dashboard_lab TO qa_snapshot_importer;
GRANT USAGE ON SCHEMA qa_failover_v1 TO qa_snapshot_importer;
GRANT SELECT ON qa_failover_v1.state TO qa_snapshot_importer;
GRANT SELECT,INSERT,UPDATE ON qa_failover_v1.live_snapshot_batches TO qa_snapshot_importer;
GRANT SELECT,INSERT ON qa_failover_v1.live_snapshot_rows TO qa_snapshot_importer;
GRANT SELECT,INSERT ON qa_failover_v1.live_candidate_evaluations TO qa_snapshot_importer;
GRANT SELECT,INSERT ON qa_failover_v1.live_candidate_audit TO qa_snapshot_importer;
DO $verify$
BEGIN
 IF has_table_privilege('qa_snapshot_importer','qa_failover_v1.evaluations','INSERT')
    OR has_table_privilege('qa_snapshot_importer','qa_failover_v1.state','UPDATE') THEN
    RAISE EXCEPTION 'import role has unsafe permissions';
 END IF;
END $verify$;
COMMIT;
'@
    # SQL is piped to psql rather than persisted (it contains the temporary
    # generated password); do not show psql statement text to terminal.
    $sql | & $psql -X -q -w -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 5432 -U postgres -d qa_dashboard_lab 1>$null 2>$null
    $adminResult=$LASTEXITCODE
    $sql=$null
    if($adminResult -ne 0){Report 'POSTGRES_ADMIN_MIGRATION_FAILED';exit 2}
    Report 'SNAPSHOT_SCHEMA_INSTALLED'

    New-Item -ItemType Directory -Path $importDir -Force | Out-Null
    # Windows DPAPI encrypts the importer secret for the CURRENT Windows user.
    $secureImport=ConvertTo-SecureString $importPwd -AsPlainText -Force
    ConvertFrom-SecureString $secureImport | Set-Content -LiteralPath $secretPath -Encoding ASCII
    $importPwd=$null
    Remove-Variable secureImport -ErrorAction SilentlyContinue
    $env:PGPASSWORD=$null
    $adminPwd=$null

    # Update only the two isolated staging modules. Never touch the existing
    # running bridge or the original local archive.
    foreach($item in @('scripts/Run-QA-Authoritative-Snapshot-Stage.mjs',
                      'server/qaStandbyCandidateMaterializer.js')){
      $existing=Join-Path $source ($item.Replace('/','\'))
      $replacement=Join-Path $download ($item.Replace('/','\'))
      if(-not (Test-Path -LiteralPath $existing -PathType Leaf)){
        Report 'LOCAL_SOURCE_MODULE_MISSING';exit 2
      }
      Copy-Item -LiteralPath $existing -Destination ($existing+'.before-importer') -Force
      Copy-Item -LiteralPath $replacement -Destination $existing -Force
    }
    Report 'DEDICATED_IMPORTER_INSTALLED'
  } finally {
    if(Test-Path -LiteralPath $download){
      Remove-Item -LiteralPath $download -Recurse -Force -ErrorAction SilentlyContinue
    }
  }

  if($SetupOnly){
    Report 'READY_FOR_SNAPSHOT_WITHOUT_FIRESTORE_READS'
    Write-Output 'QA_FAILOVER=OFF';exit 0
  }
  # Stage from the protected dedicated role. Any PostgreSQL blocker is now
  # detected BEFORE the first Firestore read.
  $secretText=Get-Content -LiteralPath $secretPath -Raw
  $importPwd=Reveal (ConvertTo-SecureString $secretText.Trim())
  $url='postgresql://qa_snapshot_importer:'+[Uri]::EscapeDataString($importPwd)+'@127.0.0.1:5432/qa_dashboard_lab'
  $env:QA_LOCAL_DATABASE_URL=$url
  $importPwd=$null
  $url=$null
  $project=[Environment]::GetEnvironmentVariable('QA_FIRESTORE_PROJECT_ID','User')
  if([string]::IsNullOrWhiteSpace($project)){
    $project=[Environment]::GetEnvironmentVariable('QA_FIRESTORE_PROJECT_ID','Process')
  }
  if($project -notmatch '^[a-z][a-z0-9-]{4,62}$'){
    Report 'FIRESTORE_PROJECT_ID_NOT_CONFIGURED';exit 2
  }
  $env:QA_FIRESTORE_PROJECT_ID=$project
  $rawToken=@(& $gcloud.Source auth application-default print-access-token 2>$null)
  $gcloudExit=$LASTEXITCODE
  $token=[string]($rawToken | Where-Object {$_ -is [string] -and $_.Trim().Length -gt 20} | Select-Object -Last 1)
  $rawToken=$null
  if($gcloudExit -ne 0 -or $token.Length -lt 20){
    Report 'GCLOUD_OAUTH_NOT_READY';exit 2
  }
  $env:QA_FIRESTORE_OAUTH_ACCESS_TOKEN=$token
  $token=$null
  $env:QA_LIVE_SNAPSHOT_STAGE_ONLY='1'
  & $node.Source (Join-Path $source 'scripts\Run-QA-Authoritative-Snapshot-Stage.mjs')
  if($LASTEXITCODE -ne 0) {Report 'SNAPSHOT_CAPTURE_NOT_COMPLETE';exit 2}
  Report 'SNAPSHOT_STAGED_NOT_ACTIVE'
  Write-Output 'QA_FAILOVER=OFF'
} catch {
  Report 'LOCAL_SETUP_FAILED_CLOSED'
  Write-Output 'QA_FAILOVER=OFF'
  exit 2
} finally {
  $env:PGPASSWORD=$null
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:\QA_LOCAL_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:\QA_FIRESTORE_OAUTH_ACCESS_TOKEN -ErrorAction SilentlyContinue
  Remove-Item Env:\QA_LIVE_SNAPSHOT_STAGE_ONLY -ErrorAction SilentlyContinue
  $adminPwd=$null
  $importPwd=$null
}
