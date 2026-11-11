// Trusted QA-only server export -> PostgreSQL immutable snapshot stage.
// The copied dataset is NEVER declared live, and failover remains disabled.
import {createHash} from 'node:crypto';
export const QA_SYNC_DATASETS=Object.freeze([
  'qa_evaluations','qa_appeal_events','qa_signature_documents',
  'qa_user_profiles','qa_role_permissions','qa_user_sessions',
]);
const ID=/^[A-Za-z0-9_.:@-]{12,180}$/,SNAP=/^[A-Za-z0-9_.:-]{12,128}$/;
const HASH=/^[0-9a-f]{64}$/;
const bad=code=>Object.assign(new Error(code),{code});
const digest=s=>createHash('sha256').update(s,'utf8').digest('hex');
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
function canonical(x,depth=0){
  if(depth>48)throw bad('source_nesting_limit');
  if(x===null)return 'null';
  if(typeof x==='string'||(typeof x==='number'&&Number.isFinite(x)))
    return JSON.stringify(x);
  if(typeof x==='boolean')return x?'true':'false';
  if(Array.isArray(x))return '['+x.map(v=>canonical(v,depth+1)).join(',')+']';
  if(!object(x))throw bad('non_json_source_value');
  return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k],depth+1)).join(',')+'}';
}
export const qaCanonicalDocumentHash=x=>{
  if(!object(x))throw bad('invalid_source_document');
  return digest(canonical(x));
};
export function qaManifestDigest(entries){
  if(!Array.isArray(entries))throw bad('invalid_manifest_entries');
  const paths=new Set();
  const lines=entries.map(row=>{
    if(typeof row?.path!=='string'||!row.path||!HASH.test(row.hash||'')||paths.has(row.path))
      throw bad('duplicate_or_invalid_manifest_identity');
    paths.add(row.path);
    return JSON.stringify(row.path)+':'+row.hash+'\n';
  });
  return digest(lines.sort().join(''));
}
function validateMeta(m){
  if(!m||m.authority!=='firestore-server-export'||
    m.immutableSnapshotVerified!==true||m.sourceAccessVerified!==true||
    m.allCollectionsIncluded!==true||!ID.test(m.exportId||'')||
    !SNAP.test(m.snapshotId||'')||!Array.isArray(m.manifests)||
    m.manifests.length!==QA_SYNC_DATASETS.length)
    throw bad('authoritative_snapshot_evidence_missing');
  const timestamp=Date.parse(m.exportedAt||'');
  if(!Number.isFinite(timestamp)||timestamp>Date.now()+60000||
    timestamp<Date.now()-30*86400000)throw bad('source_timestamp_invalid');
  const result=new Map();
  for(const row of m.manifests){
    if(!QA_SYNC_DATASETS.includes(row?.dataset)||result.has(row.dataset)||
      !Number.isSafeInteger(row.count)||row.count<0||row.count>50000||
      !HASH.test(row.digest||''))throw bad('invalid_source_manifest');
    result.set(row.dataset,row);
  }
  return result;
}
export async function stageQaFirestoreExport({pool,metadata,readCollection,
  maxBytes=64*1024*1024}={}){
  if(typeof pool?.connect!=='function'||typeof readCollection!=='function')
    throw bad('trusted_source_adapter_missing');
  const manifests=validateMeta(metadata),rows=[],observed=[],ids=new Set();
  let bytes=0;
  for(const collection of QA_SYNC_DATASETS){
    const entries=[],stream=await readCollection(collection,metadata.exportId);
    if(!stream||typeof stream[Symbol.asyncIterator]!=='function')
      throw bad('source_stream_missing');
    for await(const item of stream){
      if(!object(item)||!object(item.data)||typeof item.id!=='string'||
        !item.id||item.id.length>900||item.id.includes('/')||
        /[\x00-\x1f\x7f]/.test(item.id))throw bad('invalid_source_identity');
      const path=collection+'/'+item.id;
      if(ids.has(path))throw bad('duplicate_source_identity');
      ids.add(path);
      const json=canonical(item.data),hash=digest(json);
      bytes+=Buffer.byteLength(json)+Buffer.byteLength(path);
      if(bytes>maxBytes||rows.length>=50000)throw bad('source_size_exceeded');
      entries.push({path,hash});
      rows.push({path,collection,json,hash});
    }
    const expected=manifests.get(collection);
    if(entries.length!==expected.count||qaManifestDigest(entries)!==expected.digest)
      throw bad('source_manifest_mismatch');
    observed.push({dataset:collection,count:entries.length,digest:expected.digest});
  }
  const client=await pool.connect();
  let begun=false;
  try{
    const db=(await client.query('SELECT current_database() AS db')).rows?.[0]?.db;
    if(db!=='qa_dashboard_lab'&&!(
      db==='qa_cutover_ci_test'&&process.env.QA_PG_ISOLATED_TEST==='1'))
      throw bad('unrecognized_qa_database');
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');begun=true;
    await client.query("SET LOCAL lock_timeout = '3s'");
    await client.query("INSERT INTO qa_failover_v1.live_snapshot_batches"+
      " (snapshot_id,source_export_id,source_exported_at,source_provenance,status,"+
      " source_documents,stored_documents,dataset_manifest,approved_for_failover)"+
      " VALUES ($1,$2,$3,'verified-firestore-server-export','staging',$4,0,$5::jsonb,false)",
      [metadata.snapshotId,metadata.exportId,metadata.exportedAt,rows.length,JSON.stringify(observed)]);
    for(let start=0;start<rows.length;start+=50){
      const chunk=rows.slice(start,start+50),args=[],params=[];
      for(const row of chunk){
        const n=params.length;
        args.push('($'+(n+1)+',$'+(n+2)+',$'+(n+3)+',$'+(n+4)+'::jsonb,$'+(n+5)+')');
        params.push(metadata.snapshotId,row.path,row.collection,row.json,row.hash);
      }
      await client.query("INSERT INTO qa_failover_v1.live_snapshot_rows"+
        " (snapshot_id,document_path,root_collection,document_json,content_hash) VALUES "+
        args.join(','),params);
    }
    const saved=(await client.query(
      "SELECT document_path,root_collection,document_json,content_hash"+
      " FROM qa_failover_v1.live_snapshot_rows WHERE snapshot_id=$1 ORDER BY document_path",
      [metadata.snapshotId])).rows;
    if(saved.length!==rows.length)throw bad('postgres_snapshot_count_mismatch');
    const original=new Map(rows.map(x=>[x.path,x]));
    for(const row of saved){
      const existing=original.get(row.document_path);
      if(!existing||existing.collection!==row.root_collection||
        existing.hash!==row.content_hash||
        qaCanonicalDocumentHash(row.document_json)!==existing.hash)
        throw bad('postgres_snapshot_content_mismatch');
    }
    await client.query("UPDATE qa_failover_v1.live_snapshot_batches"+
      " SET status='copy_verified',stored_documents=$2,verified_at=now()"+
      " WHERE snapshot_id=$1 AND status='staging' AND approved_for_failover=false",
      [metadata.snapshotId,rows.length]);
    await client.query('COMMIT');begun=false;
    return Object.freeze({snapshotId:metadata.snapshotId,sourceExportId:metadata.exportId,
      storedDocuments:rows.length,datasets:observed,
      postgresCopyVerified:true,firestoreLiveParityVerified:false,
      failoverAuthorized:false,productionWritesEnabled:false});
  }catch(error){
    if(begun)await client.query('ROLLBACK').catch(()=>{});
    throw error;
  }finally{client.release();}
}
