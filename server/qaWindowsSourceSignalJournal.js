// Private Windows-only source listener metadata persistence, STAGED OFF.
// Never treat these signals as authoritative data, deletes, or a failover gate.
import {randomUUID} from 'node:crypto';
import {QA_SYNC_DATASETS} from './qaLiveMirrorStage.js';
const ID=/^[A-Za-z0-9_.:@-]{16,180}$/;
const SNAP=/^[A-Za-z0-9_.:-]{12,128}$/;
const DOC=/^[^\x00-\x1f\x7f/]{1,900}$/;
const REV=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const fail=code=>{throw Object.assign(new Error(code),{code});};
export function normalizeQaWindowsSourceSignal({snapshotId,eventId,signal}={}){
 if(typeof eventId!=='string'||!ID.test(eventId)||
   typeof snapshotId!=='string'||!SNAP.test(snapshotId))fail('qa_signal_invalid_identity');
 if(!signal||!QA_SYNC_DATASETS.includes(signal.collection)||
   typeof signal.documentId!=='string'||!DOC.test(signal.documentId)||
   !['added','modified','removed'].includes(signal.changeType)||
   signal.authoritativeDocument!==false||
   signal.sourceCommitVerified!==false||signal.requiresSourceRead!==true)
   fail('qa_signal_invalid_event');
 if(signal.changeType==='removed' ? signal.observedRevision!==null :
   (typeof signal.observedRevision!=='string'||!REV.test(signal.observedRevision)))
   fail('qa_signal_invalid_revision');
 return Object.freeze({snapshotId,eventId,collection:signal.collection,
  documentId:signal.documentId,changeType:signal.changeType,
  observedRevision:signal.observedRevision});
}
export async function appendQaWindowsSourceSignal({pool,snapshotId,eventId,signal,
 attestLocalProbe,env=process.env}={}){
 if(env.QA_WINDOWS_SOURCE_SIGNAL_STAGE!=='1'||env.QA_FAILOVER!=='OFF'||
   typeof pool?.connect!=='function'||typeof attestLocalProbe!=='function')
   fail('qa_signal_private_stage_disabled');
 const e=normalizeQaWindowsSourceSignal({snapshotId,eventId,signal});
 const proof=await attestLocalProbe(e);
 if(proof?.authority!=='qa-local-readonly-probe'||proof?.snapshotId!==e.snapshotId||
   proof?.eventId!==e.eventId||proof?.collection!==e.collection||
   proof?.documentId!==e.documentId||proof?.changeType!==e.changeType||
   proof?.observedRevision!==e.observedRevision||proof?.sourceCommitVerified!==false)
   fail('qa_signal_source_not_attested');
 const c=await pool.connect();let tx=false;
 try{
  const db=(await c.query('SELECT current_database() AS db')).rows?.[0]?.db;
  if(db!=='qa_dashboard_lab'&&
    !(db==='qa_cutover_ci_test'&&env.QA_PG_ISOLATED_TEST==='1'))
    fail('qa_signal_invalid_database');
  await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE');tx=true;
  await c.query("SET LOCAL lock_timeout='3s'");
  const state=(await c.query('SELECT mode,write_frozen,source_snapshot_verified,active_snapshot_id'+
    ' FROM qa_failover_v1.state WHERE id=1 FOR SHARE')).rows?.[0];
  if(state?.mode!=='disabled'||state.write_frozen!==true||
    state.source_snapshot_verified!==false||state.active_snapshot_id!==e.snapshotId)
    fail('qa_signal_not_frozen');
  const batch=(await c.query('SELECT status,approved_for_failover FROM'+
    ' qa_failover_v1.live_snapshot_batches WHERE snapshot_id=$1 FOR SHARE',
    [e.snapshotId])).rows?.[0];
  if(batch?.status!=='copy_verified'||batch.approved_for_failover!==false)
    fail('qa_signal_unverified_snapshot');
  const args=[e.eventId,e.snapshotId,e.collection,e.documentId,
    e.changeType,e.observedRevision];
  const newRows=(await c.query('INSERT INTO qa_windows_probe_v1.source_signals'+
    ' (event_id,snapshot_id,collection_name,document_id,change_type,observed_revision)'+
    ' VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (event_id) DO NOTHING RETURNING event_id',
    args)).rows||[];
  if(!newRows.length){
   const old=(await c.query('SELECT snapshot_id,collection_name,document_id,change_type,'+
    ' observed_revision,source_commit_verified,needs_reconciliation'+
    ' FROM qa_windows_probe_v1.source_signals WHERE event_id=$1',[e.eventId])).rows?.[0];
   if(!old||old.snapshot_id!==e.snapshotId||old.collection_name!==e.collection||
     old.document_id!==e.documentId||old.change_type!==e.changeType||
     old.observed_revision!==e.observedRevision||
     old.source_commit_verified!==false||old.needs_reconciliation!==true)
     fail('qa_signal_event_id_collision');
  }
  await c.query('COMMIT');tx=false;
  return Object.freeze({durable:true,duplicate:!newRows.length,
    sourceCommitVerified:false,needsReconciliation:true,failoverReady:false});
 }catch(e){if(tx)await c.query('ROLLBACK').catch(()=>{});throw e;}
 finally{c.release();}
}
export function createQaWindowsSignalPersister({pool,snapshotId,
 attestLocalProbe,env=process.env,
 makeEventId=()=> 'qa-windows-probe-'+randomUUID()}={}){
 if(typeof makeEventId!=='function')fail('qa_signal_missing_id_generator');
 return signal=>appendQaWindowsSourceSignal({pool,snapshotId,signal,
  eventId:makeEventId(signal),attestLocalProbe,env});
}
