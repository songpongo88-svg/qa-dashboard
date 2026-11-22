// Disposable CI PG17 only; tests the exact inactive Windows installer SQL.
// Does NOT connect to a Windows host, Firestore, Supabase or Vercel.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
if(process.env.QA_PG_ISOLATED_TEST!=='1'||!process.env.QA_TEST_DATABASE_URL)
 throw Error('qa_windows_signed_inactive_ci_only');
const pool=new pg.Pool({connectionString:process.env.QA_TEST_DATABASE_URL,max:2});
const schema='qa_windows_signed_receiver_v1';
const inbox=schema+'.inbox';
const streams=schema+'.stream_cursor';
try{
 const db=(await pool.query('SELECT current_database() AS db')).rows[0].db;
 assert.equal(db,'qa_cutover_ci_test');
 const sql=await readFile(new URL(
  '../migration/qa-windows-signed-receiver-inactive.sql',import.meta.url),'utf8');
 const backupBefore=(await pool.query(
  "SELECT count(*)::int AS n FROM information_schema.tables"+
  " WHERE table_schema='qa_windows_signed_receiver_v1'")).rows[0].n;
 assert.equal(backupBefore,0);
 await pool.query(sql);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM '+inbox)).rows[0].n,0);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM '+streams)).rows[0].n,0);
 const tables=(await pool.query(
  "SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity"+
  " FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace"+
  " WHERE n.nspname=$1 AND c.relkind='r' ORDER BY c.relname",
  [schema])).rows;
 assert.deepEqual(tables.map(x=>x.relname),['inbox','stream_cursor']);
 assert.ok(tables.every(x=>x.relrowsecurity===true&&x.relforcerowsecurity===true));
 await pool.query("DO $x$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='qa_ci_inactive_receiver_viewer') THEN CREATE ROLE qa_ci_inactive_receiver_viewer NOLOGIN; END IF; END $x$;");
 const access=(await pool.query(
  'SELECT has_schema_privilege($1,$2,$3) AS usage,'+
  ' has_table_privilege($1,$4,$5) AS table_access',
  ['qa_ci_inactive_receiver_viewer',schema,'USAGE',inbox,'SELECT'])).rows[0];
 assert.deepEqual(access,{usage:false,table_access:false});
 const schemaAcl=(await pool.query(
  'SELECT COUNT(*)::int AS n FROM pg_namespace n CROSS JOIN LATERAL'+
  " aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a"+
  " WHERE n.nspname=$1 AND a.grantee=0 AND a.privilege_type='USAGE'",
  [schema])).rows[0].n;
 assert.equal(schemaAcl,0);
 const stream='qa-inactive-receiver-stream-00001';
 const signer='c'.repeat(64);
 await pool.query('INSERT INTO '+streams+
  ' (stream_id,signer_spki_sha256) VALUES ($1,$2)',[stream,signer]);
 const row={
  stream_id:stream,sequence:1,operation_id:'qa-inactive-test-20261120-001',
  collection_name:'qa_evaluations',document_path:'qa_evaluations/QA_TEST_INACTIVE',
  operation:'upsert',observed_revision:'2026-11-20T08:59:00.123456Z',
  document_json:{fields:{test:{stringValue:'SYNTHETIC'}}},
  payload_sha256:'a'.repeat(64),envelope_sha256:'b'.repeat(64),
  signer_spki_sha256:signer,
 };
 const insert=async changes=>{
  const v={...row,...changes};
  return pool.query('INSERT INTO '+inbox+
   ' (stream_id,sequence,operation_id,collection_name,document_path,'+
   ' operation,observed_revision,document_json,payload_sha256,'+
   ' envelope_sha256,signer_spki_sha256)'+
   ' VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)',
   [v.stream_id,v.sequence,v.operation_id,v.collection_name,v.document_path,
    v.operation,v.observed_revision,JSON.stringify(v.document_json),
    v.payload_sha256,v.envelope_sha256,v.signer_spki_sha256]);
 };
 await assert.rejects(insert({operation:'delete'}),e=>e.code==='23514');
 await assert.rejects(insert({document_path:'qa_evaluations/one/two'}),e=>e.code==='23514');
 await assert.rejects(insert({document_path:'qaXevaluations/one'}),e=>e.code==='23514');
 await assert.rejects(insert({collection_name:'qa_sparks'}),e=>e.code==='23514');
 await assert.rejects(insert({observed_revision:'2026-11-20T08:59:00Z'}),e=>e.code==='23514');
 await insert({});
 await assert.rejects(pool.query('UPDATE '+inbox+' SET delivery_eligible=true'),
  e=>e.code==='23514');
 await assert.rejects(pool.query('UPDATE '+inbox+' SET failover_eligible=true'),
  e=>e.code==='23514');
 await assert.rejects(pool.query('UPDATE '+inbox+" SET review_status='delivered'"),
  e=>e.code==='23514');
 const stored=(await pool.query(
  'SELECT review_status,delivery_eligible,source_continuity_verified,'+
  ' failover_eligible FROM '+inbox)).rows;
 assert.deepEqual(stored,[{review_status:'review_required',
  delivery_eligible:false,source_continuity_verified:false,failover_eligible:false}]);
 const powershell=await readFile(new URL(
  './Install-QA-Windows-Signed-Receiver-Inactive.ps1',import.meta.url),'utf8');
 for(const text of [
  '[switch]$Apply',"$sqlCommit='7f728335eb2a4a92cd3318951532a725f6d62780'",
  'pg_dump.exe','-AsSecureString','-Fc','FROZEN_SNAPSHOT_OR_CANDIDATE_NOT_VERIFIED',
  'DRY_RUN_NO_CHANGES','QA_WINDOWS_FIRESTORE_READS=0',
  'QA_FAILOVER=OFF','PRIVATE_SIGNED_RECEIVER_INSTALLED_INACTIVE',
 ])assert.ok(powershell.includes(text),'missing safe Windows installer step '+text);
 for(const forbidden of [
  /Start-Service|New-Service|Start-Process|Invoke-RestMethod/i,
  /firestore\.googleapis\.com/i,
  /QA_FAILOVER\s*=\s*['"]ON['"]/i,
  /ALTER\s+TABLE\s+qa_failover_v1/i,
 ])assert.equal(forbidden.test(powershell),false,'unexpected live side effect');
 console.log('PASS Windows PG17 inactive signed receiver installer SQL: RLS, no public grants, review-only writes, baseline untouched, zero Firestore requests');
}finally{await pool.end();}
