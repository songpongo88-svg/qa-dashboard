# Read-only local PostgreSQL diagnosis. NO Firestore calls, no writes, no failover.
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Join-Path $HOME 'Documents\QA_Backup'
$configPath = Join-Path $root 'bridge\.env.local'
$sourceRoot = Join-Path $root 'source-stage'
$tempFile = $null
try {
  if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
    Write-Output 'QA_DIAG=LOCAL_BRIDGE_CONFIG_MISSING'; exit 2
  }
  $c=@{}
  foreach ($line in [IO.File]::ReadAllLines($configPath)) {
    if ($line -match '^\s*(QA_DB_NAME|QA_DB_USER|QA_DB_PASSWORD)\s*=\s*(.*)$') {
      $key=$Matches[1]; $value=$Matches[2].Trim()
      if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
        $value=$value.Substring(1,$value.Length-2)
      }
      $c[$key]=$value
    }
  }
  if ($c['QA_DB_NAME'] -cne 'qa_dashboard_lab' -or [string]::IsNullOrWhiteSpace($c['QA_DB_USER']) -or [string]::IsNullOrWhiteSpace($c['QA_DB_PASSWORD'])) {
    Write-Output 'QA_DIAG=LOCAL_BRIDGE_CONFIG_INVALID'; exit 2
  }
  $node=Get-Command node -ErrorAction SilentlyContinue
  if ($null -eq $node) { Write-Output 'QA_DIAG=NODE_MISSING'; exit 2 }
  if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot 'node_modules\pg\package.json') -PathType Leaf)) {
    Write-Output 'QA_DIAG=PG_DRIVER_MISSING'; exit 2
  }
  $encUser=[Uri]::EscapeDataString($c['QA_DB_USER'])
  $encPass=[Uri]::EscapeDataString($c['QA_DB_PASSWORD'])
  $env:QA_LOCAL_DIAG_DB_URL='postgresql://'+$encUser+':'+$encPass+'@127.0.0.1:5432/qa_dashboard_lab'
  $tempFile=Join-Path (Join-Path $sourceRoot 'scripts') ('.qa-diag-'+[Guid]::NewGuid().ToString('N')+'.cjs')
  $js=@'
const {Client}=require('pg');
(async()=>{
 const c=new Client({connectionString:process.env.QA_LOCAL_DIAG_DB_URL,
   connectionTimeoutMillis:4000,query_timeout:5000,
   options:'-c default_transaction_read_only=on'});
 try{
   await c.connect();
   console.log('QA_DIAG_POSTGRES=CONNECTED');
   const db=await c.query('SELECT current_database() AS name');
   if(db.rows[0]?.name!=='qa_dashboard_lab'){
     console.log('QA_DIAG=WRONG_DATABASE');return;
   }
   const tables=await c.query(
     "SELECT to_regclass('qa_failover_v1.state') IS NOT NULL AS state,"+
     " to_regclass('qa_failover_v1.live_snapshot_batches') IS NOT NULL AS batches,"+
     " to_regclass('qa_failover_v1.live_candidate_audit') IS NOT NULL AS candidates"
   );
   const t=tables.rows[0];
   console.log('QA_DIAG_SCHEMA='+(t.state?'PRESENT':'MISSING'));
   console.log('QA_DIAG_SNAPSHOT_TABLES='+(t.batches&&t.candidates?'PRESENT':'MISSING'));
   if(t.state){
     const s=await c.query('SELECT mode,write_frozen,source_snapshot_verified FROM qa_failover_v1.state WHERE id=1');
     const row=s.rows[0];
     console.log('QA_DIAG_STANDBY_STATE='+(row?(row.mode==='disabled'&&row.write_frozen===true?'SAFE_DISABLED':'REVIEW_REQUIRED'):'MISSING'));
   }
   if(t.batches){
     const b=await c.query("SELECT status,stored_documents,source_documents FROM qa_failover_v1.live_snapshot_batches ORDER BY created_at DESC LIMIT 1");
     console.log('QA_DIAG_SNAPSHOT_STAGE='+(b.rows[0]?.status||'NONE'));
     if(b.rows[0]){
       console.log('QA_DIAG_SOURCE_DOCUMENTS='+Number(b.rows[0].source_documents||0));
       console.log('QA_DIAG_STORED_DOCUMENTS='+Number(b.rows[0].stored_documents||0));
     }
   }
   if(t.candidates){
     const a=await c.query('SELECT evaluation_count FROM qa_failover_v1.live_candidate_audit ORDER BY verified_at DESC LIMIT 1');
     console.log('QA_DIAG_VERIFIED_CANDIDATES='+(a.rows[0]?Number(a.rows[0].evaluation_count):'NONE'));
   }
   console.log('QA_DIAG=READ_ONLY_COMPLETED');
 }catch(e){
   const code=String(e?.code||'');
   const category=({ECONNREFUSED:'POSTGRES_NOT_LISTENING',ETIMEDOUT:'POSTGRES_TIMEOUT',
     '28P01':'POSTGRES_PASSWORD_REJECTED','28000':'POSTGRES_AUTH_REJECTED',
     '3D000':'POSTGRES_DATABASE_MISSING','42501':'POSTGRES_READ_PERMISSION_DENIED',
     '42P01':'POSTGRES_SCHEMA_INCOMPLETE','42703':'POSTGRES_SCHEMA_OUTDATED'})[code]||'POSTGRES_QUERY_FAILED';
   console.log('QA_DIAG='+category);
 }finally{
   await c.end().catch(()=>{});
   console.log('QA_DIAG_FIRESTORE_READS=0');
   console.log('QA_FAILOVER=OFF');
 }
})().catch(()=>{console.log('QA_DIAG=LOCAL_DIAG_FAILED');});
'@
  [IO.File]::WriteAllText($tempFile,$js,[Text.UTF8Encoding]::new($false))
  & $node.Source $tempFile
} catch {
  Write-Output 'QA_DIAG=LOCAL_DIAG_SETUP_FAILED'
} finally {
  Remove-Item Env:\QA_LOCAL_DIAG_DB_URL -ErrorAction SilentlyContinue
  if($tempFile -and (Test-Path -LiteralPath $tempFile)) {
    Remove-Item -LiteralPath $tempFile -Force -ErrorAction SilentlyContinue
  }
}
