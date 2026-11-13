import assert from 'node:assert/strict';
import {normalizeQaSourceDelta,qaSourceDeltaOrder,appendQaSourceDelta}
  from '../server/qaSourceDeltaJournal.js';
const example={eventId:'source-event-0000000001',snapshotId:'qa-live-snapshot-001',
  documentPath:'qa_evaluations/case1',operation:'upsert',
  sourceChangedAt:'2026-11-13T14:10:00.000Z',
  documentJson:{fields:{score:{integerValue:'85'}}}};
const now=Date.parse('2026-11-13T14:11:00Z');
const checked=normalizeQaSourceDelta(example,now);
assert.equal(checked.collection,'qa_evaluations');
assert.match(checked.hash,/^[0-9a-f]{64}$/);
assert.equal(qaSourceDeltaOrder(null,checked),'applied');
assert.equal(qaSourceDeltaOrder(checked,{...checked,sourceChangedAt:'2026-11-13T14:09:00.000Z'}),'stale');
assert.equal(qaSourceDeltaOrder(checked,checked),'conflict');
for(const bad of [
  {...example,documentPath:'sparks/users'},
  {...example,documentPath:'qa_evaluations/a/b'},
  {...example,eventId:'x'},
  {...example,operation:'delete'},
  {...example,documentJson:{score:85}},
]){
 assert.throws(()=>normalizeQaSourceDelta(bad,now));
}
let queries=[],lastEvent=null,lastRevision=null,rollback=0;
const pool={async connect(){return {release(){},async query(sql,args=[]){
 queries.push(sql);
 if(sql==='SELECT current_database() AS db')return {rows:[{db:'qa_dashboard_lab'}]};
 if(sql.includes('FROM qa_failover_v1.state'))return {rows:[{mode:'disabled',write_frozen:true,
    source_snapshot_verified:false,active_snapshot_id:example.snapshotId}]};
 if(sql.includes('FROM qa_failover_v1.live_snapshot_batches'))return {rows:[{
   status:'copy_verified',approved_for_failover:false,
   source_exported_at:new Date('2026-11-13T14:00:00Z')}]};
 if(sql.includes('FROM qa_failover_v1.source_delta_events WHERE event_id'))
   return {rows:lastEvent?[lastEvent]:[]};
 if(sql.includes('FROM qa_failover_v1.source_delta_latest WHERE'))
   return {rows:lastRevision?[lastRevision]:[]};
 if(sql.startsWith('INSERT INTO qa_failover_v1.source_delta_events')){
   lastEvent={snapshot_id:args[1],document_path:args[2],operation:args[4],
     source_changed_at:new Date(args[5]),content_hash:args[7]};
   return {rowCount:1,rows:[]};
 }
 if(sql.startsWith('INSERT INTO qa_failover_v1.source_delta_latest')){
   lastRevision={event_id:args[3],source_changed_at:new Date(args[5])};
   return {rowCount:1,rows:[]};
 }
 if(sql==='ROLLBACK'){rollback++;return {rows:[]};}
 if(sql==='COMMIT'||sql.startsWith('BEGIN')||sql.startsWith('SET LOCAL'))return {rows:[]};
 throw Error('unexpected SQL: '+sql.slice(0,40));
}};}};
const attest=async e=>({authority:'verified-firestore-private-event',
  eventId:e.eventId,snapshotId:e.snapshotId,documentPath:e.documentPath,
  operation:e.operation,sourceChangedAt:e.sourceChangedAt,
  contentHash:e.hash});
await assert.rejects(appendQaSourceDelta({pool,event:example,now}),
  /qa_delta_private_adapter_required/);
assert.equal(queries.length,0);
await assert.rejects(appendQaSourceDelta({pool,event:example,now,
  attestSourceEvent:async()=>({authority:'browser'})}),
  /qa_delta_source_not_attested/);
assert.equal(queries.length,0);
await assert.rejects(appendQaSourceDelta({
  pool,event:example,now,
  attestSourceEvent:async e=>({...await attest(e),contentHash:'0'.repeat(64)}),
}),/qa_delta_source_not_attested/);
assert.equal(queries.length,0);
const result=await appendQaSourceDelta({pool,event:example,now,attestSourceEvent:attest});
assert.equal(result.outcome,'applied');
assert.equal(result.canAcceptWrites,false);
const retry=await appendQaSourceDelta({pool,event:example,now,attestSourceEvent:attest});
assert.equal(retry.outcome,'duplicate');
await assert.rejects(appendQaSourceDelta({pool,event:{...example,
  documentPath:'qa_evaluations/another'},now,attestSourceEvent:attest}),
  /qa_delta_event_id_collision/);
assert.equal(rollback,1);
assert.ok(queries.every(sql=>!sql.includes('UPDATE qa_failover_v1.evaluations')));
console.log('PASS private QA source delta journal and fail-closed idempotence');
