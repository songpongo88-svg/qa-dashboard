// Isolated PostgreSQL QA account and session prototype.
// Not connected to QA Dashboard Login or to any HTTP endpoint.
// Requires a disposable database and an explicit CI fixture flag.
import { randomBytes, scryptSync, createHash, timingSafeEqual } from 'node:crypto';
import { QaCutoverBlocked } from './qaCutoverWritePolicy.js';

const reject = (code) => { throw new QaCutoverBlocked(code); };
const stageGuard = async (pool) => {
  if (process.env.QA_PG_ISOLATED_TEST !== '1') reject('session_staging_only');
  const result = await pool.query('SELECT current_database() AS db');
  if (result.rows[0]?.db !== 'qa_cutover_ci_test') reject('non_disposable_database');
};
const userPattern = /^[a-z0-9_.@-]{3,120}$/;
const normalize = (value) => String(value || '').trim().toLowerCase();
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
const derive = (password, salt) =>
  scryptSync(password, Buffer.from(salt, 'hex'), 32, { N: 16384, r: 8, p: 1 }).toString('hex');

export function hashQaFixturePassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 512)
    reject('invalid_fixture_password');
  const salt = randomBytes(24).toString('hex');
  return { salt, hash: derive(password, salt) };
}

// Database must contain only synthetic fixture accounts. Production account
// migration requires a separate audited credential reset and rate limiting.
export async function issueQaFixtureSession(pool, username, password) {
  await stageGuard(pool);
  const user = normalize(username);
  if (!userPattern.test(user) || typeof password !== 'string' || password.length > 512)
    reject('invalid_credentials');
  const result = await pool.query(
    'SELECT username, role, enabled, password_salt, password_hash, agent_name FROM qa_cutover_stage.qa_accounts WHERE username=$1',
    [user],
  );
  const account = result.rows[0];
  // Never trust role/profile information supplied by the caller.
  if (!account || account.enabled !== true || typeof account.password_hash !== 'string')
    reject('invalid_credentials');
  let verified = false;
  try {
    const computed = Buffer.from(derive(password, account.password_salt), 'hex');
    const expected = Buffer.from(account.password_hash, 'hex');
    verified = computed.length === 32 && expected.length === 32 && timingSafeEqual(computed, expected);
  } catch { verified = false; }
  if (!verified) reject('invalid_credentials');
  const rawToken = randomBytes(32).toString('base64url');
  const hash = tokenHash(rawToken);
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  await pool.query(
    'INSERT INTO qa_cutover_stage.qa_sessions(token_hash,username,expires_at) VALUES($1,$2,$3)',
    [hash,user,expiresAt],
  );
  return { token:rawToken,expiresAt };
}

export async function verifyQaFixtureSession(pool, rawToken) {
  await stageGuard(pool);
  if (typeof rawToken !== 'string' || !/^[A-Za-z0-9_-]{40,100}$/.test(rawToken))
    reject('session_not_verified');
  const result = await pool.query(
    `SELECT s.username,s.created_at,s.expires_at,s.revoked_at,
      a.role,a.enabled,a.agent_name,c.revoked_before
      FROM qa_cutover_stage.qa_sessions s
      JOIN qa_cutover_stage.qa_accounts a ON a.username=s.username
      LEFT JOIN qa_cutover_stage.qa_session_controls c ON c.username=s.username
      WHERE s.token_hash=$1`,
    [tokenHash(rawToken)],
  );
  const session = result.rows[0];
  if (!session || session.enabled !== true || session.revoked_at ||
      !Number.isFinite(new Date(session.expires_at).getTime()) ||
      new Date(session.expires_at).getTime() <= Date.now() ||
      (session.revoked_before && new Date(session.created_at).getTime() <= new Date(session.revoked_before).getTime()))
    reject('session_not_verified');
  return {
    verificationSource:'trusted-server-session-validator',
    session:{
      verified:true,status:'active',username:session.username,
      agentName:session.agent_name,role:session.role,
      expiresAt:new Date(session.expires_at).toISOString(),
    },
  };
}

export async function revokeQaFixtureSessions(pool, username) {
  await stageGuard(pool);
  const user = normalize(username);
  if (!userPattern.test(user)) reject('invalid_user');
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO qa_cutover_stage.qa_session_controls(username,revoked_before)
       VALUES($1,now()) ON CONFLICT(username)
       DO UPDATE SET revoked_before=GREATEST(qa_cutover_stage.qa_session_controls.revoked_before,EXCLUDED.revoked_before)`,
      [user],
    );
    await client.query(
      'UPDATE qa_cutover_stage.qa_sessions SET revoked_at=now() WHERE username=$1 AND revoked_at IS NULL',
      [user],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
