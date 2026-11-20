// Staging-only, fail-closed quarantine for uncertain cross-database writes.
// A write timeout does NOT prove Firestore rejected it. Never auto-resend
// or deliver an uncertain mutation; require source reconciliation first.
// No HTTP routes, timers, network calls or QA browser/client credentials.
const operationIdPattern=/^[A-Za-z0-9_.:@-]{16,180}$/;
const fail=code=>{throw Object.assign(new Error(code),{code});};
export async function quarantineUncertainQaCoreMutation({
  pool,operationId,authorizeUncertainOutcome,env=process.env,
}={}){
  if(env.QA_CORE_PRIVATE_OUTBOX_STAGING!=='1'||
     typeof pool?.connect!=='function'||
     typeof authorizeUncertainOutcome!=='function')
    fail('qa_outbox_private_stage_disabled');
  if(typeof operationId!=='string'||!operationIdPattern.test(operationId))
    fail('qa_outbox_invalid_operation_id');
  // This is a control-plane attestor intended to be provided only by the
  // eventual authenticated backend. A user-supplied object is NOT proof.
  const proof=await authorizeUncertainOutcome(operationId);
  if(proof?.authority!=='qa-core-private-uncertain-outcome'||
     proof?.operationId!==operationId||
     proof?.sourceCommitProven!==false)
    fail('qa_outbox_uncertainty_attestation_required');
  const client=await pool.connect();
  try {
    const db=(await client.query('SELECT current_database() AS db')).rows?.[0]?.db;
    if(!(env.QA_PG_ISOLATED_TEST==='1'&&db==='qa_cutover_ci_test')&&
       !(env.QA_CORE_PRIVATE_OUTBOX_DATABASE==='postgres'&&db==='postgres'))
      fail('qa_outbox_wrong_database');
    const updated=await client.query(
      'UPDATE qa_core_replication_stage.change_outbox '+
      "SET source_state='needs_reconcile',delivery_state='blocked',updated_at=now()"+
      " WHERE operation_id=$1 AND source_state='pending'"+
      " AND delivery_state='waiting' RETURNING operation_id",
      [operationId]);
    if(updated.rows?.length===1)return Object.freeze({
      quarantined:true,replay:false,sourceConfirmed:false,
      delivered:false,failoverReady:false,
    });
    const current=(await client.query(
      'SELECT source_state,delivery_state FROM qa_core_replication_stage.change_outbox'+
      ' WHERE operation_id=$1',[operationId])).rows?.[0];
    if(current?.source_state==='needs_reconcile'&&
       current?.delivery_state==='blocked')
      return Object.freeze({
       quarantined:true,replay:true,sourceConfirmed:false,
       delivered:false,failoverReady:false,
      });
    // Do NOT convert a committed/delivered event back to uncertain.
    fail(current?'qa_outbox_uncertainty_transition_blocked':
      'qa_outbox_operation_not_found');
  }finally{client.release();}
}
