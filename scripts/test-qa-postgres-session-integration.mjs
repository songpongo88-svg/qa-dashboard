import assert from 'node:assert/strict';
import pg from 'pg';
import { hashQaFixturePassword, issueQaFixtureSession, verifyQaFixtureSession, revokeQaFixtureSessions } from '../server/qaCutoverSessionStore.js';
import { stageQaEvaluationWrite } from '../server/qaCutoverPgWriter.js';
import { QaCutoverBlocked } from '../server/qaCutoverWritePolicy.js';

if(process.env.QA_PG_ISOLATED_TEST !== '1')throw Error('Refusing non-fixture session test');
const pool = new pg.Pool({ connectionString:process.env.QA_TEST_DATABASE_URL,max:3,connectionTimeoutMillis:5000 });
const assertBlocked = (code)=>(error)=>error instanceof QaCutoverBlocked && error.code===code;
try {
  const identity=await pool.query('SELECT current_database() AS db');
  assert.equal(identity.rows[0].db,'qa_cutover_ci_test');
  await pool.query('CREATE SCHEMA qa_cutover_stage');
  await pool.query(`CREATE TABLE qa_cutover_stage.qa_accounts(
    username text PRIMARY KEY,
    password_salt text NOT NULL, password_hash text NOT NULL,
    agent_name text NOT NULL, role text NOT NULL,
    enabled boolean NOT NULL DEFAULT true)`);
  await pool.query(`CREATE TABLE qa_cutover_stage.qa_sessions(
    token_hash text PRIMARY KEY,
    username text NOT NULL REFERENCES qa_cutover_stage.qa_accounts(username),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz)`);
  await pool.query(`CREATE TABLE qa_cutover_stage.qa_session_controls(
    username text PRIMARY KEY REFERENCES qa_cutover_stage.qa_accounts(username),
    revoked_before timestamptz NOT NULL)`);
  await pool.query(`CREATE TABLE qa_cutover_stage.evaluations(
    evaluation_id text PRIMARY KEY, record jsonb NOT NULL,
    version integer NOT NULL,updated_at timestamptz NOT NULL DEFAULT now())`);
  await pool.query(`CREATE TABLE qa_cutover_stage.operations(
    operation_id text PRIMARY KEY, request_hash text NOT NULL,
    evaluation_id text NOT NULL,response jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now())`);
  await pool.query(`CREATE TABLE qa_cutover_stage.audit(
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    operation_id text UNIQUE NOT NULL,evaluation_id text NOT NULL,
    version integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now())`);

  const loginPassword='Synthetic-Test-Only!551';
  const fixture=hashQaFixturePassword(loginPassword);
  await pool.query(`INSERT INTO qa_cutover_stage.qa_accounts
      (username,password_salt,password_hash,role,agent_name,enabled)
      VALUES($1,$2,$3,$4,$5,true)`,
    ['qa_operator',fixture.salt,fixture.hash,'Quality Assurance','Sample Agent']);
  await assert.rejects(issueQaFixtureSession(pool,'qa_operator','wrong-password'),assertBlocked('invalid_credentials'));
  await assert.rejects(issueQaFixtureSession(pool,'unknown-user',loginPassword),assertBlocked('invalid_credentials'));
  const session = await issueQaFixtureSession(pool,'qa_operator',loginPassword);
  assert.ok(session.token.length>=40);
  const stored=await pool.query('SELECT token_hash FROM qa_cutover_stage.qa_sessions');
  assert.equal(stored.rows.length,1);
  assert.notEqual(stored.rows[0].token_hash,session.token,'raw bearer tokens must not be stored in PostgreSQL');
  const verified=await verifyQaFixtureSession(pool,session.token);
  assert.equal(verified.session.username,'qa_operator');
  assert.equal(verified.session.role,'Quality Assurance');
  await assert.rejects(verifyQaFixtureSession(pool,'tampered'+session.token),assertBlocked('session_not_verified'));

  // Trusted context is assembled from the DB session. Browser role, username,
  // lock and editor claims are NEVER used for authorization.
  const trusted={
    ...verified,
    environment:'isolated-local-fixture',fixtureAuthorizedByServer:true,production:false,
    authoritativeScope:{agentName:'Sample Agent',monthKey:'2026-11'},
    signatureLock:{source:'trusted-server',scopeKey:'sample agent::2026-11',verified:true,locked:false},
    appealHold:{source:'trusted-server',verified:true,active:false},
  };
  const synthetic={id:'synthetic-session-case',caseId:'DEMO001',
    evaluationMonthKey:'2026-11',finalScore:82,topics:[],
    evaluatorUsername:'qa_operator',agentName:'Sample Agent'};
  const result=await stageQaEvaluationWrite(pool,{
    action:'create',evaluationId:synthetic.id,operationId:'staged-session-create',
    expectedVersion:0,record:synthetic,
  },trusted);
  assert.equal(result.version,1);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM qa_cutover_stage.audit')).rows[0].n,1);

  await pool.query('UPDATE qa_cutover_stage.qa_accounts SET role=$2 WHERE username=$1',['qa_operator','Admin Live Chat']);
  const changedRole=await verifyQaFixtureSession(pool,session.token);
  assert.equal(changedRole.session.role,'Admin Live Chat','session must reflect server-side role change');
  await assert.rejects(stageQaEvaluationWrite(pool,{
    action:'create',evaluationId:'synthetic-2',operationId:'staged-session-denied',
    expectedVersion:0,record:{...synthetic,id:'synthetic-2'},
  },{...trusted,...changedRole}),assertBlocked('session_not_verified'));
  await pool.query('UPDATE qa_cutover_stage.qa_accounts SET role=$2 WHERE username=$1',['qa_operator','Quality Assurance']);

  // Suspended accounts may not use old valid sessions.
  await pool.query('UPDATE qa_cutover_stage.qa_accounts SET enabled=false WHERE username=$1',['qa_operator']);
  await assert.rejects(verifyQaFixtureSession(pool,session.token),assertBlocked('session_not_verified'));
  await pool.query('UPDATE qa_cutover_stage.qa_accounts SET enabled=true WHERE username=$1',['qa_operator']);
  await pool.query('UPDATE qa_cutover_stage.qa_sessions SET expires_at=now()-interval \'1 second\' WHERE token_hash=$1',
    [stored.rows[0].token_hash]);
  await assert.rejects(verifyQaFixtureSession(pool,session.token),assertBlocked('session_not_verified'));

  const newSession=await issueQaFixtureSession(pool,'qa_operator',loginPassword);
  assert.equal((await verifyQaFixtureSession(pool,newSession.token)).session.verified,true);
  await revokeQaFixtureSessions(pool,'qa_operator');
  await assert.rejects(verifyQaFixtureSession(pool,newSession.token),assertBlocked('session_not_verified'));
  const revoked=await pool.query('SELECT count(*)::int AS n FROM qa_cutover_stage.qa_sessions WHERE revoked_at IS NOT NULL');
  assert.ok(revoked.rows[0].n>=1);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM qa_cutover_stage.evaluations')).rows[0].n,1);
  console.log('PASS: isolated PG sessions — salted password hash, server roles, expiry, suspension, revocation, hashed opaque token, staged QA write');
} finally { await pool.end(); }
