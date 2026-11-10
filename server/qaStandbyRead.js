// QA standby reads from local PostgreSQL. No direct HTTP endpoint.
// Never tell Dashboard/Report Center that an incomplete mirror is complete.
import { QaStandbyBlocked } from './qaStandbyPgJournal.js';

const fail=code=>{throw new QaStandbyBlocked(code);};
const idPattern=/^[a-zA-Z0-9_.:@-]{1,180}$/;
const monthPattern=/^\d{4}-(0[1-9]|1[0-2])$/;
const future=date=>Number.isFinite(Date.parse(date||''))&&Date.parse(date)>Date.now();

async function authorize(pool,trusted) {
  if(trusted?.mode==='isolated-fixture'&&trusted?.fixtureAuthorizedByServer===true&&
    process.env.QA_PG_ISOLATED_TEST==='1') {
    const db=await pool.query('SELECT current_database() AS db');
    if(db.rows[0]?.db!=='qa_cutover_ci_test')fail('fixture_database_denied');
    if(trusted.session?.verified!==true||trusted.session?.role!=='Quality Assurance'||
      !idPattern.test(trusted.session?.username||'')||!future(trusted.session?.expiresAt))fail('session_not_verified');
  }else if(trusted?.mode==='server-approved-failover'&&
    trusted.serverAuthority==='qa-server-verified'&&
    trusted.serverSessionValidator==='qa-trusted-backend-v1'&&
    trusted.contextSource==='server-owned-not-request-body'&&
    trusted.productionApprovedByServer===true&&
    trusted.failover?.identity?.serverAuthenticated===true&&
    trusted.failover.identity.role==='Quality Assurance'&&
    future(trusted.failover.identity.expiresAt)) {
    // Caller must independently call qaFailoverDecision, with a synchronized
    // local role/permission source. This is not a substitute for that gate.
  }else fail('standby_read_not_authorized');
  const result=await pool.query('SELECT mode,source_snapshot_verified FROM qa_failover_v1.state WHERE id=1');
  const state=result.rows[0];
  if(!state || !['standby','reconciling'].includes(state.mode)||state.source_snapshot_verified!==true)
    fail('backup_not_verified');
}

export async function readQaStandbyEvaluation(pool,id,trusted) {
  await authorize(pool,trusted);
  if(typeof id!=='string'||!idPattern.test(id))fail('invalid_evaluation_id');
  const result=await pool.query(`
    SELECT evaluation_id,version,origin,record,updated_at
    FROM qa_failover_v1.evaluations
    WHERE evaluation_id=$1 AND deleted_at IS NULL`,[id]);
  if(!result.rows.length)return {found:false,source:'local-postgres-standby',dataStatus:'verified-snapshot'};
  const r=result.rows[0];
  return {found:true,source:'local-postgres-standby',dataStatus:'verified-snapshot',
    evaluationId:r.evaluation_id,version:Number(r.version),origin:r.origin,
    record:r.record,updatedAt:r.updated_at};
}

export async function listQaStandbyEvaluations(pool,request,trusted) {
  await authorize(pool,trusted);
  const month=request?.month;
  if(month!=null&&!monthPattern.test(month))fail('invalid_month');
  const limit=Number(request?.limit??50);
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)fail('invalid_limit');
  const cursor=String(request?.afterId||'');
  if(cursor&&!idPattern.test(cursor))fail('invalid_cursor');
  const data=await pool.query(`
    SELECT evaluation_id,version,origin,record
    FROM qa_failover_v1.evaluations
    WHERE deleted_at IS NULL
      AND ($1::text IS NULL OR record->>'evaluationMonthKey' = $1)
      AND ($2::text = '' OR evaluation_id > $2)
    ORDER BY evaluation_id ASC
    LIMIT $3`,[month||null,cursor,limit+1]);
  const rows=data.rows.slice(0,limit).map(r=>({
    evaluationId:r.evaluation_id,version:Number(r.version),origin:r.origin,record:r.record,
  }));
  return {source:'local-postgres-standby',dataStatus:'verified-snapshot',rows,
    hasMore:data.rows.length>limit,nextAfterId:data.rows.length>limit?rows.at(-1)?.evaluationId:null};
}
