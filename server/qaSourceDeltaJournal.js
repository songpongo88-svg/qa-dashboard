// Private QA-only incremental source journal. NOT a subscribed Firestore feed,
// not an HTTP endpoint, and NEVER sufficient evidence to activate standby.
// All events require an independent server-side source attestation.
import {QA_SYNC_DATASETS,qaCanonicalDocumentHash} from './qaLiveMirrorStage.js';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const ID=/^[a-zA-Z0-9_.:@-]{16,180}$/;
const SNAP=/^[a-zA-Z0-9_.:-]{12,128}$/;
const date=x=>Date.parse(x instanceof Date?x.toISOString():x||'');
export function normalizeQaSourceDelta(e,now=Date.now()){
  if(!e||!ID.test(e.eventId||'')||!SNAP.test(e.snapshotId||''))
    fail('qa_delta_invalid_identity');
  const path=e.documentPath,split=typeof path==='string'?path.indexOf('/'):-1;
  const collection=split>0?path.slice(0,split):'';
  const id=split>0?path.slice(split+1):'';
  if(!QA_SYNC_DATASETS.includes(collection)||!id||id.length>900||
     id.includes('/')||/[\x00-\x1f\x7f]/.test(id))fail('qa_delta_invalid_collection');
  if(e.operation!=='upsert'&&e.operation!=='delete')fail('qa_delta_invalid_operation');
  const changed=date(e.sourceChangedAt);
  if(!Number.isFinite(changed)||!Number.isFinite(now)||
     changed>now+120000||changed<now-30*86400000)
    fail('qa_delta_invalid_time');
  if(e.operation==='delete'&&e.documentJson!==null)
    fail('qa_delta_delete_requires_null');
  if(e.operation==='upsert'&&
    (!e.documentJson||typeof e.documentJson!=='object'||
      Array.isArray(e.documentJson)||!e.documentJson.fields||
      typeof e.documentJson.fields!=='object'||
      Array.isArray(e.documentJson.fields)))
    fail('qa_delta_requires_firestore_typed_json');
  const json=e.operation==='delete'?null:e.documentJson;
  return Object.freeze({
    eventId:e.eventId,snapshotId:e.snapshotId,
    documentPath:path,collection,operation:e.operation,
    sourceChangedAt:new Date(changed).toISOString(),
    documentJson:json,hash:json?qaCanonicalDocumentHash(json):null,
  });
}
export function qaSourceDeltaOrder(previous,incoming){
  if(!previous)return 'applied';
  const a=date(previous.sourceChangedAt),b=date(incoming.sourceChangedAt);
  if(!Number.isFinite(a)||!Number.isFinite(b))fail('qa_delta_invalid_stored_revision');
  if(b<a)return 'stale';
  if(b===a)return 'conflict';
  return 'applied';
}
export async function appendQaSourceDelta({pool,event,attestSourceEvent,now=Date.now()}={}){
  if(typeof pool?.connect!=='function'||typeof attestSourceEvent!=='function')
    fail('qa_delta_private_adapter_required');
  const incoming=normalizeQaSourceDelta(event,now);
  // Never accept a browser role, signed-looking string or "verified" flag.
  // The independent adapter must attest these exact event identity fields.
  const proof=await attestSourceEvent(incoming);
  if(proof?.authority!=='verified-firestore-private-event'||
     proof?.eventId!==incoming.eventId||
     proof?.snapshotId!==incoming.snapshotId||
     proof?.documentPath!==incoming.documentPath||
     proof?.operation!==incoming.operation||
     proof?.sourceChangedAt!==incoming.sourceChangedAt||
     proof?.contentHash!==incoming.hash)
    fail('qa_delta_source_not_attested');
  const c=await pool.connect();let tx=false;
  try {
    const db=(await c.query('SELECT current_database() AS db')).rows?.[0]?.db;
    if(db!=='qa_dashboard_lab'&&!(db==='qa_cutover_ci_test'&&
       process.env.QA_PG_ISOLATED_TEST==='1'))fail('qa_delta_wrong_database');
    await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE');tx=true;
    await c.query("SET LOCAL lock_timeout='3s'");
    const state=(await c.query('SELECT mode,write_frozen,source_snapshot_verified,'+
      'active_snapshot_id FROM qa_failover_v1.state WHERE id=1 FOR UPDATE')).rows?.[0];
    if(state?.mode!=='disabled'||state.write_frozen!==true||
       state.source_snapshot_verified!==false||
       state.active_snapshot_id!==incoming.snapshotId)
      fail('qa_delta_requires_frozen_matched_snapshot');
    const baseline=(await c.query('SELECT status,approved_for_failover,source_exported_at'+
      ' FROM qa_failover_v1.live_snapshot_batches WHERE snapshot_id=$1 FOR SHARE',
      [incoming.snapshotId])).rows?.[0];
    if(baseline?.status!=='copy_verified'||baseline.approved_for_failover!==false||
       !(date(incoming.sourceChangedAt)>date(baseline.source_exported_at)))
      fail('qa_delta_baseline_not_verified');
    const previousEvent=(await c.query('SELECT snapshot_id,document_path,operation,'+
      'source_changed_at,content_hash FROM qa_failover_v1.source_delta_events'+
      ' WHERE event_id=$1 FOR UPDATE',[incoming.eventId])).rows?.[0];
    if(previousEvent){
      if(previousEvent.snapshot_id!==incoming.snapshotId||
         previousEvent.document_path!==incoming.documentPath||
         previousEvent.operation!==incoming.operation||
         previousEvent.content_hash!==incoming.hash||
         date(previousEvent.source_changed_at)!==date(incoming.sourceChangedAt))
        fail('qa_delta_event_id_collision');
      await c.query('COMMIT');tx=false;
      return Object.freeze({journaled:true,outcome:'duplicate',canAcceptWrites:false});
    }
    const previous=(await c.query('SELECT event_id,source_changed_at FROM'+
      ' qa_failover_v1.source_delta_latest WHERE snapshot_id=$1'+
      ' AND document_path=$2 FOR UPDATE',
      [incoming.snapshotId,incoming.documentPath])).rows?.[0]||null;
    const outcome=qaSourceDeltaOrder(previous&&{
      sourceChangedAt:previous.source_changed_at,
    },incoming);
    await c.query('INSERT INTO qa_failover_v1.source_delta_events'+
      ' (event_id,snapshot_id,document_path,root_collection,operation,'+
      ' source_changed_at,document_json,content_hash,outcome)'+
      ' VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)',
      [incoming.eventId,incoming.snapshotId,incoming.documentPath,
       incoming.collection,incoming.operation,incoming.sourceChangedAt,
       incoming.documentJson?JSON.stringify(incoming.documentJson):null,
       incoming.hash,outcome]);
    if(outcome==='applied'){
      await c.query('INSERT INTO qa_failover_v1.source_delta_latest'+
        ' (snapshot_id,document_path,root_collection,event_id,operation,'+
        ' source_changed_at,document_json,content_hash)'+
        ' VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)'+
        ' ON CONFLICT (snapshot_id,document_path) DO UPDATE SET'+
        ' event_id=EXCLUDED.event_id,operation=EXCLUDED.operation,'+
        ' source_changed_at=EXCLUDED.source_changed_at,'+
        ' document_json=EXCLUDED.document_json,content_hash=EXCLUDED.content_hash',
        [incoming.snapshotId,incoming.documentPath,incoming.collection,
         incoming.eventId,incoming.operation,incoming.sourceChangedAt,
         incoming.documentJson?JSON.stringify(incoming.documentJson):null,
         incoming.hash]);
    }
    await c.query('COMMIT');tx=false;
    return Object.freeze({journaled:true,outcome,canAcceptWrites:false});
  }catch(error){if(tx)await c.query('ROLLBACK').catch(()=>{});throw error;}
  finally{c.release();}
}
