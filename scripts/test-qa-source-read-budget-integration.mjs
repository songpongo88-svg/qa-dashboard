// Disposable PostgreSQL 17 only; no Firestore, Windows, Production or users.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {createQaSourceReadBudget} from '../server/qaSourceReadBudget.js';

if(process.env.QA_PG_ISOLATED_TEST!=='1'||!process.env.QA_TEST_DATABASE_URL)
  throw Error('disposable_pg_required');
const pool=new pg.Pool({connectionString:process.env.QA_TEST_DATABASE_URL,max:3});
const day=new Date('2026-11-13T10:00:00.000Z');
const project='qa-budget-fixture-2026';
const blocked=code=>e=>e?.code===code;
try{
  const db=(await pool.query('SELECT current_database() AS db')).rows[0]?.db;
  assert.equal(db,'qa_cutover_ci_test');
  await pool.query('CREATE SCHEMA IF NOT EXISTS qa_failover_v1');
  const sql=await readFile(new URL('../migration/qa-source-read-budget-daily.sql',import.meta.url),'utf8');
  await pool.query(sql);
  const one=await pool.connect(),two=await pool.connect();
  try{
    const make=client=>createQaSourceReadBudget({
      client,projectId:project,dailyDocumentLimit:220,
      dailyRequestLimit:11,now:()=>day,
    });
    const first=make(one);
    const second=make(two);
    assert.equal((await first.reserve({requestedPageSize:100})).reservedDocumentUnits,100);
    assert.equal((await second.reserve({requestedPageSize:100})).reservedDocumentUnits,200);
    await assert.rejects(first.reserve({requestedPageSize:21}),blocked('source_daily_budget_exhausted'));
    assert.equal((await second.reserve({requestedPageSize:20})).reservedDocumentUnits,220);
    await assert.rejects(second.reserve({requestedPageSize:1}),blocked('source_daily_budget_exhausted'));
    const existing=(await one.query('SELECT reserved_document_units,reserved_requests'+
      ' FROM qa_failover_v1.source_read_budget_daily WHERE project_id=$1 AND budget_day=$2::date',
      [project,'2026-11-13'])).rows[0];
    assert.equal(existing.reserved_document_units,220);
    assert.equal(existing.reserved_requests,3);
    // Independent connections share one durable ledger, no in-memory bypass.
    const results=await Promise.allSettled([
      first.reserve({requestedPageSize:1}),
      second.reserve({requestedPageSize:1}),
    ]);
    assert.ok(results.every(r=>r.status==='rejected'));
    assert.ok(results.every(r=>r.reason.code==='source_daily_budget_exhausted'));
    assert.equal((await one.query('SELECT reserved_requests FROM'+
      ' qa_failover_v1.source_read_budget_daily WHERE project_id=$1',
      [project])).rows[0].reserved_requests,3);
    // A new UTC date gets a new cap but cannot erase yesterday's usage.
    const next=createQaSourceReadBudget({client:one,projectId:project,
      dailyDocumentLimit:220,dailyRequestLimit:11,
      now:()=>new Date('2026-11-14T01:00:00.000Z')});
    assert.equal((await next.reserve({requestedPageSize:3})).reservedDocumentUnits,3);
    assert.equal((await one.query('SELECT count(*) AS n FROM'+
      ' qa_failover_v1.source_read_budget_daily WHERE project_id=$1',[project]))
      .rows[0].n,'2');
    await assert.rejects(first.reserve({requestedPageSize:501}),
      blocked('source_read_reservation_invalid'));
    const unavailable=createQaSourceReadBudget({projectId:project,
      client:{query:async()=>{throw new Error('storage down')}},
      dailyDocumentLimit:220,dailyRequestLimit:11,now:()=>day});
    await assert.rejects(unavailable.reserve({requestedPageSize:1}),
      blocked('source_daily_budget_storage_unavailable'));
    assert.throws(()=>createQaSourceReadBudget({client:one,projectId:project,
      dailyDocumentLimit:0}),blocked('source_daily_budget_invalid'));
  }finally{one.release();two.release();}
  console.log('PASS QA source daily ledger: persistent UTC caps, concurrency, zero refunds, fail closed and no real Firestore access');
}finally{await pool.end();}
