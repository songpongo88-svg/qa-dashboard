import assert from 'node:assert/strict';
import pg from 'pg';
import { replayOneQaStandbyOperation } from '../server/qaStandbyReplayWorker.js';
import { getQaStandbyOutboxCounts, QaStandbyBlocked } from '../server/qaStandbyPgJournal.js';

if(process.env.QA_PG_ISOLATED_TEST!=='1'||!process.env.QA_TEST_DATABASE_URL)
  throw Error('Replay test requires a disposable PostgreSQL database');
const pool=new pg.Pool({connectionString:process.env.QA_TEST_DATABASE_URL,max:3,connectionTimeoutMillis:5000});
const trusted={mode:'isolated-fixture',fixtureAuthorizedByServer:true};
try{
  const db=await pool.query('SELECT current_database() AS db');
  assert.equal(db.rows[0].db,'qa_cutover_ci_test');
  // The immediately preceding standby test created 5 durable operations.
  const starting=await getQaStandbyOutboxCounts(pool);
  assert.equal(starting.pending,5);
  await assert.rejects(replayOneQaStandbyOperation(pool,{},trusted),
    e=>e instanceof QaStandbyBlocked&&e.code==='missing_firestore_adapter');
  await assert.rejects(replayOneQaStandbyOperation(pool,{applyIfVersionMatches:async()=>({status:'applied',remoteRevision:'r'})},trusted),
    e=>e instanceof QaStandbyBlocked&&e.code==='standby_must_be_frozen_for_replay');
  await pool.query("UPDATE qa_failover_v1.state SET mode='reconciling',write_frozen=true WHERE id=1");
  let called=0;
  const remote={
    async applyIfVersionMatches(input){
      assert.ok(input.operationId);
      called++;
      if(input.operationId==='qa-update-1')return {status:'conflict'};
      return {status:'applied',remoteRevision:'firebase-fixture-'+input.operationId};
    },
  };
  const first=await replayOneQaStandbyOperation(pool,remote,trusted);
  assert.equal(first.synced,true,'first create goes first');
  const second=await replayOneQaStandbyOperation(pool,remote,trusted);
  assert.equal(second.conflict,true,'stale primary update quarantined');
  // Delete must not bypass the unresolved earlier update; an unrelated case
  // can proceed independently.
  const third=await replayOneQaStandbyOperation(pool,remote,trusted);
  assert.equal(third.synced,true);
  const fourth=await replayOneQaStandbyOperation(pool,remote,trusted);
  assert.equal(fourth.synced,true);
  const fifth=await replayOneQaStandbyOperation(pool,remote,trusted);
  assert.equal(fifth.processed,false);
  assert.equal(called,4);
  assert.deepEqual(await getQaStandbyOutboxCounts(pool),
    {pending:1,in_flight:0,synced:3,conflict:1});
  const statuses=await pool.query('SELECT operation_id,status FROM qa_failover_v1.outbox ORDER BY operation_id');
  assert.equal(statuses.rows.find(x=>x.operation_id==='qa-delete-1').status,'pending');
  // Simulate an operator-reviewed conflict resolution, without changing a
  // score or silently applying data to the primary.
  await pool.query("UPDATE qa_failover_v1.outbox SET status='synced',remote_revision='operator-reviewed-fixture',synced_at=now() WHERE operation_id='qa-update-1' AND status='conflict'");
  const resumed=await replayOneQaStandbyOperation(pool,remote,trusted);
  assert.equal(resumed.synced,true);
  assert.deepEqual(await getQaStandbyOutboxCounts(pool),
    {pending:0,in_flight:0,synced:5,conflict:0});
  // No automatic follow-up on the live database: the worker only receives a
  // narrow adapter transaction and a server-side feature flag.
  await assert.rejects(replayOneQaStandbyOperation(pool,remote,{mode:'approved-server-replay'}),
    e=>e instanceof QaStandbyBlocked&&e.code==='replay_disabled');
  console.log('PASS: QA outbox replay preserves per-case ordering, quarantines conflicts, prevents unsafe failback and records idempotent Firebase revisions');
}finally{await pool.end();}
