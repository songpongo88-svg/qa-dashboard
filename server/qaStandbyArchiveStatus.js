// QA archive status for internal Windows PostgreSQL bridge integration.
// No HTTP endpoint. Never returns documents, tokens, identities or scores.
// Archive completeness must NOT be mistaken for a live Firebase sync.
export async function getQaArchiveStatus(pool) {
  const db = await pool.query("SELECT current_database() AS db");
  if (!['qa_dashboard_lab','qa_cutover_ci_test'].includes(db.rows?.[0]?.db))
    throw new Error('unrecognized_qa_database');
  if (db.rows[0].db === 'qa_cutover_ci_test' && process.env.QA_PG_ISOLATED_TEST !== '1')
    throw new Error('disposable_database_test_guard');
  const [counts, audit, state, queue] = await Promise.all([
    pool.query(`SELECT root_collection,count(*)::integer AS documents
      FROM qa_failover_v1.source_mirror GROUP BY root_collection ORDER BY root_collection`),
    pool.query(`SELECT source_count,mirror_count,certified_live,imported_at
      FROM qa_failover_v1.mirror_import_audit ORDER BY audit_id DESC LIMIT 1`),
    pool.query(`SELECT mode,write_frozen,source_snapshot_verified
      FROM qa_failover_v1.state WHERE id=1`),
    pool.query(`SELECT status,count(*)::integer AS documents
      FROM qa_failover_v1.outbox GROUP BY status`),
  ]);
  const collections = counts.rows.map(row=>({
    name:row.root_collection,
    documents:Number(row.documents),
  }));
  const total=collections.reduce((sum,row)=>sum+row.documents,0);
  const latest=audit.rows?.[0] || null;
  const active=state.rows?.[0] || null;
  const countsMatch = !!latest && latest.source_count === total &&
    latest.mirror_count === total;
  return {
    source:'existing-local-postgres-archive',
    sourceFreshness:'unverified-archived-copy',
    firebaseLiveSync:false,
    productionFailoverReady:false,
    backupDocumentCount:total,
    collections,
    importedArchiveCountMatch:countsMatch,
    lastArchiveImportedAt:latest?.imported_at ?? null,
    standby:{
      mode:active?.mode||'unknown',
      frozen:active?.write_frozen!==false,
      liveParityVerified:false, // intentionally never infer from local flag
    },
    pendingOperations:(queue.rows||[]).filter(r=>r.status!=='synced')
      .reduce((sum,row)=>sum+Number(row.documents),0),
  };
}
