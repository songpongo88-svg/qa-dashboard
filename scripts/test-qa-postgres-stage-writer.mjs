import assert from 'node:assert/strict';
import { stageQaEvaluationWrite } from '../server/qaCutoverPgWriter.js';
import { QaCutoverBlocked } from '../server/qaCutoverWritePolicy.js';

const db = { records:new Map(),operations:new Map(),audit:[] };
const calls=[];
const pool = { async connect() {
  let tx=null;
  return {
    release(){calls.push('release');},
    async query(sql,params=[]) {
      calls.push(sql);
      if(sql==='BEGIN') {tx={
        records:new Map([...db.records].map(([k,v])=>[k,structuredClone(v)])),
        operations:new Map([...db.operations].map(([k,v])=>[k,structuredClone(v)])),
        audit:structuredClone(db.audit),
      };return {};}
      if(sql==='COMMIT'){db.records=tx.records;db.operations=tx.operations;db.audit=tx.audit;tx=null;return {};}
      if(sql==='ROLLBACK'){tx=null;return {};}
      if(!tx)throw Error('query outside transaction');
      if(sql.includes('SELECT request_hash')){const value=tx.operations.get(params[0]);
        return {rows:value?[structuredClone(value)]:[],rowCount:value?1:0};}
      if(sql.includes('SELECT evaluation_id, record, version')){const value=tx.records.get(params[0]);
        return {rows:value?[structuredClone(value)]:[],rowCount:value?1:0};}
      if(sql.startsWith('INSERT INTO qa_cutover_stage.evaluations')){
        if(tx.records.has(params[0]))throw Error('duplicate');
        tx.records.set(params[0],{evaluation_id:params[0],record:JSON.parse(params[1]),version:params[2]});
        return {rowCount:1};}
      if(sql.startsWith('UPDATE qa_cutover_stage.evaluations')){
        const value=tx.records.get(params[0]);
        if(!value||value.version!==params[1])return {rowCount:0};
        tx.records.set(params[0],{evaluation_id:params[0],record:JSON.parse(params[2]),version:params[3]});
        return {rowCount:1};}
      if(sql.startsWith('INSERT INTO qa_cutover_stage.operations')){
        if(tx.operations.has(params[0]))return {rowCount:0};
        tx.operations.set(params[0],{request_hash:params[1],evaluation_id:params[2],response:JSON.parse(params[3])});
        return {rowCount:1};}
      if(sql.startsWith('INSERT INTO qa_cutover_stage.audit')){tx.audit.push({operation_id:params[0],evaluation_id:params[1],version:params[2]});return {rowCount:1};}
      throw Error('unknown mock query '+sql);
    },
  };
}};
const future = () => new Date(Date.now()+3600000).toISOString();
const context = () => ({
  verificationSource:'trusted-server-session-validator',
  session:{verified:true,status:'active',role:'Quality Assurance',username:'qa_operator',expiresAt:future()},
  environment:'isolated-local-fixture',fixtureAuthorizedByServer:true,production:false,
  authoritativeScope:{agentName:'Sample Agent',monthKey:'2026-11'},
  signatureLock:{source:'trusted-server',scopeKey:'sample agent::2026-11',verified:true,locked:false},
  appealHold:{source:'trusted-server',verified:true,active:false},
  editLease:{source:'trusted-server',verified:true,username:'qa_operator',evaluationId:'qa-343',valid:true},
});
const row={id:'qa-343',caseId:'AA334880',agentName:'Sample Agent',evaluationType:'case',
  evaluationMonthKey:'2026-11',finalScore:85,topics:[],evaluatorUsername:'qa_operator'};
const create={action:'create',operationId:'op-create-123',evaluationId:'qa-343',expectedVersion:0,record:row};
const made=await stageQaEvaluationWrite(pool,create,context());
assert.deepEqual(made,{ok:true,evaluationId:'qa-343',version:1,action:'create',replay:false});
assert.equal(db.records.get('qa-343').record.finalScore,85);
assert.equal(db.audit.length,1);
const duplicate=await stageQaEvaluationWrite(pool,create,context());
assert.equal(duplicate.replay,true);
assert.equal(db.audit.length,1);
const unauthorized=()=>({...context(),session:{...context().session,verified:false}});
await assert.rejects(stageQaEvaluationWrite(pool,create,unauthorized()),e=>e instanceof QaCutoverBlocked&&e.code==='session_not_verified');
const wrongReuse={...create,record:{...row,finalScore:92}};
await assert.rejects(stageQaEvaluationWrite(pool,wrongReuse,context()),e=>e instanceof QaCutoverBlocked&&e.code==='operation_reuse_conflict');
const update={...create,action:'update',operationId:'op-update-123',expectedVersion:1,record:{...row,finalScore:84}};
const updated=await stageQaEvaluationWrite(pool,update,context());
assert.equal(updated.version,2);
assert.equal(db.records.get('qa-343').record.finalScore,84);
const stale={...update,operationId:'op-stale-123',record:{...row,finalScore:93}};
await assert.rejects(stageQaEvaluationWrite(pool,stale,context()),e=>e instanceof QaCutoverBlocked&&e.code==='stale_version');
assert.equal(db.records.get('qa-343').record.finalScore,84);
const locked={...update,operationId:'op-locked-123',expectedVersion:2};
await assert.rejects(stageQaEvaluationWrite(pool,locked,{...context(),
  signatureLock:{...context().signatureLock,locked:true}}),
  e=>e instanceof QaCutoverBlocked&&e.code==='monthly_results_locked_or_unverified');
assert.equal(db.records.get('qa-343').record.finalScore,84);
const deleteReq={action:'delete',operationId:'op-delete-123',evaluationId:'qa-343',expectedVersion:2};
const erased=await stageQaEvaluationWrite(pool,deleteReq,context());
assert.equal(erased.version,3);
assert.ok(db.records.get('qa-343').record.deletedAt,'delete must be a tombstone not an actual row deletion');
assert.equal((await stageQaEvaluationWrite(pool,deleteReq,context())).replay,true);
assert.equal(db.audit.length,3);
await assert.rejects(stageQaEvaluationWrite(pool,{...create,operationId:'op-unsafe-123'},
  {...context(),environment:'production-cutover',production:true}),
  e=>e instanceof QaCutoverBlocked&&e.code==='staging_only');
assert.equal(db.audit.length,3);
assert.equal(calls.filter(q=>q==='ROLLBACK').length,3);
assert.ok(!calls.some(q=>/qa_migration_lab|qa_backup|source_documents|historical_qa_excel/i.test(q)));
console.log('PASS: isolated PostgreSQL QA writer — atomic staged create/update/delete tombstone, replay, audit, version conflict, scope lock; source tables untouched.');
