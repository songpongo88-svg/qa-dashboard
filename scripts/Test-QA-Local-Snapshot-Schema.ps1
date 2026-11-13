# QA-only PostgreSQL snapshot schema dry run: all SQL is rolled back.
# No Firestore calls, no persisted migration, no failover activation.
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=Join-Path $HOME 'Documents\QA_Backup'
$config=Join-Path $root 'bridge\.env.local'
$stage=Join-Path $root 'source-stage'
$sqlFile=Join-Path $stage 'migration\qa-local-live-snapshot-stage.sql'
$driver=Join-Path $stage 'node_modules\pg\package.json'
$tmp=$null
if(-not (Test-Path -LiteralPath $config -PathType Leaf) -or -not (Test-Path -LiteralPath $sqlFile -PathType Leaf) -or -not (Test-Path -LiteralPath $driver -PathType Leaf)) {
  Write-Output 'QA_SCHEMA_DRYRUN=LOCAL_FILES_MISSING'; exit 2
}
$c=@{}
foreach($line in [IO.File]::ReadAllLines($config)){
  if($line -match '^\s*(QA_DB_NAME|QA_DB_USER|QA_DB_PASSWORD)\s*=\s*(.*)$'){
    $key=$Matches[1];$value=$Matches[2].Trim()
    if($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))){
      $value=$value.Substring(1,$value.Length-2)
    }
    $c[$key]=$value
  }
}
if($c['QA_DB_NAME'] -cne 'qa_dashboard_lab' -or [string]::IsNullOrWhiteSpace($c['QA_DB_USER']) -or [string]::IsNullOrWhiteSpace($c['QA_DB_PASSWORD'])){
  Write-Output 'QA_SCHEMA_DRYRUN=UNSAFE_DATABASE_SETTINGS'; exit 2
}
$node=Get-Command node -ErrorAction SilentlyContinue
if($null -eq $node){Write-Output 'QA_SCHEMA_DRYRUN=NODE_MISSING'; exit 2}
$env:QA_LOCAL_DIAG_DB_URL='postgresql://'+[Uri]::EscapeDataString($c['QA_DB_USER'])+':'+[Uri]::EscapeDataString($c['QA_DB_PASSWORD'])+'@127.0.0.1:5432/qa_dashboard_lab'
$env:QA_LOCAL_DIAG_SQL_FILE=$sqlFile
try {
  $tmp=Join-Path (Join-Path $stage 'scripts') ('.qa-schema-check-'+[Guid]::NewGuid().ToString('N')+'.cjs')
  $code=@'
const fs=require('node:fs');
const {Client}=require('pg');
(async()=>{
 const pg=new Client({connectionString:process.env.QA_LOCAL_DIAG_DB_URL,
   connectionTimeoutMillis:4000,query_timeout:15000,statement_timeout:15000});
 let tx=false;
 let phase='CONNECT';
 try{
  await pg.connect();
  phase='VERIFY_DATABASE';
  const db=(await pg.query('SELECT current_database() AS db')).rows[0]?.db;
  if(db!=='qa_dashboard_lab')throw Object.assign(new Error('unsafe_db'),{code:'UNEXPECTED_DATABASE'});
  phase='VERIFY_SAFE_STATE';
  const state=(await pg.query(
   "SELECT mode,write_frozen,source_snapshot_verified FROM qa_failover_v1.state WHERE id=1"
  )).rows[0];
  if(!state||state.mode!=='disabled'||state.write_frozen!==true||state.source_snapshot_verified!==false)
    throw Object.assign(new Error('unsafe_state'),{code:'STANDBY_NOT_FROZEN'});
  phase='CHECK_READ_ONLY_CONFIGURATION';
  const limits=(await pg.query(
    "SELECT pg_is_in_recovery() AS in_recovery,"+
    " current_setting('default_transaction_read_only') AS default_ro,"+
    " current_setting('transaction_read_only') AS current_ro,"+
    " has_schema_privilege(current_user,'qa_failover_v1','CREATE') AS schema_create,"+
    " (SELECT source FROM pg_settings WHERE name='default_transaction_read_only') AS ro_source"
  )).rows[0];
  console.log('QA_SCHEMA_SERVER='+(limits.in_recovery?'RECOVERY_READ_ONLY':'PRIMARY'));
  console.log('QA_SCHEMA_CONNECTION_DEFAULT='+(limits.default_ro==='on'?'READ_ONLY':'READ_WRITE'));
  console.log('QA_SCHEMA_READONLY_SOURCE='+String(limits.ro_source||'UNKNOWN').toUpperCase().replace(/[^A-Z_]/g,'_').slice(0,32));
  console.log('QA_SCHEMA_CREATE_PRIVILEGE='+(limits.schema_create?'YES':'NO'));
  if(limits.in_recovery){
    console.log('QA_SCHEMA_DRYRUN=POSTGRES_IN_RECOVERY');
    return;
  }
  phase='READ_SQL_FILE';
  const raw=fs.readFileSync(process.env.QA_LOCAL_DIAG_SQL_FILE,'utf8');
  // Only the reviewed migration wrapped in BEGIN ... COMMIT may be tested.
  if(!/^\s*--[^\n]*[\s\S]*?\bBEGIN\s*;/i.test(raw)||!/\bCOMMIT\s*;\s*$/i.test(raw))
    throw Object.assign(new Error('unexpected_migration'),{code:'UNRECOGNIZED_MIGRATION'});
  const body=raw.replace(/\bBEGIN\s*;/i,'').replace(/\bCOMMIT\s*;\s*$/i,'');
  phase='BEGIN_DRYRUN';
  await pg.query('BEGIN');
  tx=true;
  phase='SET_LOCK_TIMEOUT';
  await pg.query("SET LOCAL lock_timeout='3s'");
  phase='EXECUTE_SNAPSHOT_SQL';
  await pg.query(body);
  phase='ROLLBACK_DRYRUN';
  await pg.query('ROLLBACK');
  tx=false;
  phase='VERIFY_ROLLBACK';
  const present=await pg.query(
    "SELECT to_regclass('qa_failover_v1.live_snapshot_batches') IS NOT NULL AS exists"
  );
  console.log('QA_SCHEMA_DRYRUN='+(present.rows[0]?.exists?'UNEXPECTED_TABLE_PRESENT':'PASS_ROLLED_BACK'));
 }catch(e){
  const code=String(e?.code||'');
  const reason=({
   UNEXPECTED_DATABASE:'UNEXPECTED_DATABASE',STANDBY_NOT_FROZEN:'STANDBY_NOT_FROZEN',
   UNRECOGNIZED_MIGRATION:'UNRECOGNIZED_MIGRATION',
   '42501':'POSTGRES_PERMISSION_DENIED','42P01':'BASE_SCHEMA_INCOMPLETE',
   '42703':'BASE_SCHEMA_OUTDATED','42P07':'SCHEMA_CONFLICT',
   '55P03':'DATABASE_LOCKED','57014':'SQL_TIMED_OUT',
   '28P01':'DATABASE_AUTH_FAILED',ECONNREFUSED:'POSTGRES_UNREACHABLE',
   '42601':'SQL_SYNTAX_ERROR','0A000':'SQL_FEATURE_UNSUPPORTED',
   '25006':'DATABASE_READ_ONLY','25P02':'TRANSACTION_ABORTED',
   '3F000':'SNAPSHOT_SCHEMA_MISSING','23514':'CHECK_CONSTRAINT_FAILED',
   '42704':'DEPENDENCY_MISSING'
  })[code]||'SCHEMA_SQL_FAILED';
  console.log('QA_SCHEMA_DRYRUN='+reason);
  console.log('QA_SCHEMA_PHASE='+phase);
  // SQLSTATE is an allowlisted 5-character code only: no SQL, paths,
  // account names, connection strings or document contents are disclosed.
  if(/^[0-9A-Z]{5}$/.test(code))console.log('QA_SCHEMA_SQLSTATE='+code);
 }finally{
  if(tx)await pg.query('ROLLBACK').catch(()=>{});
  await pg.end().catch(()=>{});
  console.log('QA_FIRESTORE_READS=0');
  console.log('QA_FAILOVER=OFF');
 }
})().catch(()=>{console.log('QA_SCHEMA_DRYRUN=RUNNER_FAILED');});
'@
  [IO.File]::WriteAllText($tmp,$code,[Text.UTF8Encoding]::new($false))
  & $node.Source $tmp
} catch {
  Write-Output 'QA_SCHEMA_DRYRUN=LOCAL_CHECK_FAILED'
} finally {
  Remove-Item Env:\QA_LOCAL_DIAG_DB_URL -ErrorAction SilentlyContinue
  Remove-Item Env:\QA_LOCAL_DIAG_SQL_FILE -ErrorAction SilentlyContinue
  if($tmp -and (Test-Path -LiteralPath $tmp)){Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue}
}
