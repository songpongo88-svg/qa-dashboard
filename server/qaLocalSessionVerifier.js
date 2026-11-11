// Authoritative local QA session verification for a future Firestore outage.
// Uses ONLY a per-document source mirror certified current by an independent
// Firebase parity check. An archived import always fails closed.
// Browser role, username, access flags and scores are NEVER trusted.
const safeId=/^[A-Za-z0-9_.:@-]{20,180}$/;
const SESSION_POLICY='qa-session-policy-2026-07-15-v1';
const INACTIVITY_MS=2*60*60_000;
const error=code=>Object.assign(new Error(code),{code});
const plain=x=>x&&typeof x==='object'&&!Array.isArray(x);
const time=x=>Date.parse(typeof x==='string'?x:'');
const normal=x=>String(x||'').trim().toLowerCase();
const fail=()=>{throw error('local_session_not_verified');};

function decodeValue(v){
  if(!plain(v))return v;
  if('stringValue' in v)return String(v.stringValue||'');
  if('timestampValue' in v)return String(v.timestampValue||'');
  if('booleanValue' in v)return v.booleanValue===true;
  if('integerValue' in v)return Number(v.integerValue);
  if('doubleValue' in v)return Number(v.doubleValue);
  if('nullValue' in v)return null;
  if('arrayValue' in v)return (v.arrayValue?.values||[]).map(decodeValue);
  if('mapValue' in v)return Object.fromEntries(
    Object.entries(v.mapValue?.fields||{}).map(([key,value])=>[key,decodeValue(value)]));
  return v;
}
export function decodeQaArchivedDocument(json){
  if(!plain(json))fail();
  if(plain(json.fields)){
    return Object.fromEntries(Object.entries(json.fields)
      .map(([key,value])=>[key,decodeValue(value)]));
  }
  if(plain(json.data))return json.data;
  return json;
}
export async function verifyQaLocalSession(pool,{sessionId},now=Date.now()){
  if(!pool||typeof pool.connect!=='function'||!safeId.test(sessionId||'')||
    !Number.isFinite(now))fail();
  const client=await pool.connect();
  let begun=false;
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    begun=true;
    const state=await client.query(
      'SELECT mode,source_snapshot_verified,generation FROM qa_failover_v1.state WHERE id=1');
    const current=state.rows?.[0];
    if(current?.mode!=='standby'||current.source_snapshot_verified!==true||
       !Number.isSafeInteger(Number(current.generation))||Number(current.generation)<1)fail();
    const item=await client.query(
      'SELECT parsed_json FROM qa_failover_v1.source_mirror WHERE document_path=$1',
      ['qa_user_sessions/'+sessionId]);
    if(item.rows?.length!==1)fail();
    const session=decodeQaArchivedDocument(item.rows[0].parsed_json);
    const username=normal(session.username);
    if(!username||session.sessionId!==sessionId||
      session.policyVersion!==SESSION_POLICY||session.status!=='active'||
      session.role!=='Quality Assurance'||!Number.isFinite(time(session.expiresAt))||
      time(session.expiresAt)<=now||!Number.isFinite(time(session.createdAt))||
      time(session.createdAt)>now||!Number.isFinite(time(session.lastActivityAt))||
      now-time(session.lastActivityAt)>INACTIVITY_MS||
      now-time(session.lastActivityAt)<0)fail();
    const profile=await client.query(
      "SELECT parsed_json FROM qa_failover_v1.source_mirror "+
      "WHERE root_collection='qa_user_profiles' "+
      "AND lower(split_part(document_path,'/',2))=$1 LIMIT 2",
      [username]);
    if(profile.rows?.length!==1)fail();
    const user=decodeQaArchivedDocument(profile.rows[0].parsed_json);
    if(normal(user.username)!==username||user.status!=='Active'||
      user.role!==session.role)fail();
    const control=await client.query(
      'SELECT parsed_json FROM qa_failover_v1.source_mirror WHERE document_path=$1',
      ['qa_user_session_controls/'+username]);
    if(control.rows?.length>1)fail();
    if(control.rows?.length===1){
      const status=decodeQaArchivedDocument(control.rows[0].parsed_json);
      const revoked=time(status.revokedBefore);
      if(Number.isFinite(revoked)&&time(session.createdAt)<=revoked)fail();
    }
    await client.query('COMMIT');
    begun=false;
    return Object.freeze({
      source:'verified-local-session',sessionId,
      username,role:user.role,status:'active',
      agentName:String(user.agentName||session.agentName||''),
      generation:Number(current.generation),
      expiresAt:session.expiresAt,
      verifiedAt:new Date(now).toISOString(),
    });
  }catch{
    if(begun)await client.query('ROLLBACK').catch(()=>{});
    fail();
  }finally{client.release();}
}
