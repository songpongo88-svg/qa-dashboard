import assert from "node:assert/strict";
import { verifySparksAccessToken, withSparksRequest, getSparksRequestActor,
  exchangeSparksAuthTokens, sparksActiveDirectory, sparksActiveProfile } from "../server/sparksSupabaseAuth.js";
import sparksAuth from "../api/sparks-auth.js";
const savedKey=process.env.SPARKS_SUPABASE_PUBLISHABLE_KEY;
process.env.SPARKS_SUPABASE_PUBLISHABLE_KEY="sb_publishable_test_only_key_123";
const savedFetch=globalThis.fetch;
const token="test-verified-sparks-access-token-123";
const rotatedToken="test-refreshed-sparks-access-token-456";
let suspended=false,serviceDown=false,revokedRefresh=false;
const calls=[];
const result=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json"}});
globalThis.fetch=async(raw,options={})=>{
  const url=String(raw), bearer=String(options?.headers?.Authorization||"");
  calls.push({url,bearer});
  if(url.endsWith("/auth/v1/user")) {
    if(serviceDown)return result({message:"temporary"},503);
    if(bearer!=="Bearer "+token && bearer!=="Bearer "+rotatedToken)return result({message:"invalid"},401);
    return result({id:"verified-auth-user",email:"admin@example.test",email_confirmed_at:"2026-11-10T00:00:00Z"});
  }
  if(url.endsWith("/auth/v1/token?grant_type=refresh_token")) {
    if(serviceDown)return result({message:"temporary"},503);
    const refresh=JSON.parse(options.body||"{}").refresh_token;
    if(revokedRefresh || refresh!=="secure-refresh-token-test-long")return result({error:"invalid_grant"},400);
    return result({access_token:rotatedToken,refresh_token:"rotated-refresh-token-test-long",expires_in:900});
  }
  if(url.endsWith("/rest/v1/rpc/sparks_verified_identity_v1"))return result(suspended?[]:[
    {username:"Songpon",display_name:"QA Admin",role:"Quality Assurance",status:"Active"},
  ]);
  if(url.endsWith("/rest/v1/rpc/sparks_admin_directory_v1"))return result([
    {username:"Songpon",display_name:"QA Admin",role:"Quality Assurance",status:"Active"},
    {username:"ActiveUser",display_name:"Agent",role:"Admin Live Chat",status:"Active"},
  ]);
  if(url.endsWith("/rest/v1/rpc/sparks_profile_sync_status_v1"))return result([{
    last_attempt_at:"2026-11-10T11:15:00Z",
    last_completed_at:"2026-11-10T11:15:15Z",
    last_result:"failed",last_error_code:"FIREBASE_QUOTA_EXCEEDED",
    last_success_at:null,last_source_count:null,last_reviewed_count:null,
    last_blocked_count:null,current_roster_snapshot_at:"2026-11-10T08:00:00Z",
  }]);
  throw Error("Unexpected external URL: "+url);
};
const response=()=>{let code=0,value={},headers={};return {
  setHeader(name,v){headers[name]=v},status(s){code=s;return this},json(v){value=v;return v},
  inspect(){return {code,value,headers}},
}};
try {
  const verified=await verifySparksAccessToken(token);
  assert.equal(verified.username,"songpon");
  assert.equal(verified.role,"Quality Assurance");
  await assert.rejects(verifySparksAccessToken("bad"),/verified email/);
  const res=response();
  const actor=await exchangeSparksAuthTokens(res,{access_token:token,refresh_token:"secure-refresh-token-test-long",expires_in:900});
  assert.equal(actor.username,"songpon");
  assert.match(JSON.stringify(res.inspect().headers["Set-Cookie"]),/HttpOnly; SameSite=Strict/);
  assert.ok(!JSON.stringify(res.inspect()).includes("admin@example.test"));
  const request={headers:{cookie:"__Host-qa_sparks_access="+token},method:"GET"};
  await withSparksRequest(request,response(),async()=>{
    const active=await getSparksRequestActor();
    assert.equal(active.username,"songpon");
    const roster=await sparksActiveDirectory();
    assert.equal(roster.length,2);
    assert.equal((await sparksActiveProfile("ActiveUser")).username,"ActiveUser");
    await assert.rejects(sparksActiveProfile("Suspended"),/ไม่มีสิทธิ์/);
  });
  const denied=response();
  await sparksAuth({method:"GET",headers:{"sec-fetch-site":"cross-site"}},denied);
  assert.equal(denied.inspect().code,403);
  const noCookie=response();
  await sparksAuth({method:"GET",headers:{}},noCookie);
  assert.equal(noCookie.inspect().code,401);
  const syncDenied=response();
  await sparksAuth({method:"GET",query:{action:"sync-status"},headers:{}},syncDenied);
  assert.equal(syncDenied.inspect().code,401,"anonymous requests cannot read sync status");
  const syncOwner=response();
  await sparksAuth({method:"GET",query:{action:"sync-status"},
    headers:{cookie:"__Host-qa_sparks_access="+token}},syncOwner);
  assert.equal(syncOwner.inspect().code,200,JSON.stringify(syncOwner.inspect().value));
  assert.equal(syncOwner.inspect().value.status.last_error_code,"FIREBASE_QUOTA_EXCEEDED");
  assert.ok(!JSON.stringify(syncOwner.inspect().value).includes("admin@example.test"),
    "status report must not expose personal data");
  const cookies=response();
  await sparksAuth({method:"POST",headers:{},body:{action:"exchange",access_token:token,refresh_token:"secure-refresh-token-test-long"}},cookies);
  assert.equal(cookies.inspect().code,200);
  assert.ok(cookies.inspect().headers["Set-Cookie"].length===2);
  assert.ok(!JSON.stringify(cookies.inspect().value).includes(token));
  // Browser revisits QA Sparks after the short-lived access cookie has expired.
  // The HttpOnly refresh cookie must restore the same verified identity without OTP.
  const refreshReq={method:"GET",headers:{cookie:"__Host-qa_sparks_refresh=secure-refresh-token-test-long"}};
  const refreshRes=response();
  await sparksAuth(refreshReq,refreshRes);
  assert.equal(refreshRes.inspect().code,200,JSON.stringify(refreshRes.inspect().value));
  assert.equal(refreshRes.inspect().value.actor.username,"songpon");
  assert.match(JSON.stringify(refreshRes.inspect().headers["Set-Cookie"]),/rotated-refresh-token-test-long/);
  assert.ok(calls.some(x=>x.url.endsWith("/auth/v1/token?grant_type=refresh_token")),"refresh endpoint called");
  assert.ok(!JSON.stringify(refreshRes.inspect().value).includes(rotatedToken),"API never exposes renewed tokens");

  // Invalidated refresh must send the browser back to OTP and delete old cookies.
  revokedRefresh=true;
  const revokedRes=response();
  await sparksAuth(refreshReq,revokedRes);
  assert.equal(revokedRes.inspect().code,401);
  assert.equal(revokedRes.inspect().value.code,"SPARKS_AUTH_EXPIRED");
  assert.match(JSON.stringify(revokedRes.inspect().headers["Set-Cookie"]),/Max-Age=0/);
  revokedRefresh=false;

  // Suspended/deactivated users cannot get an automatic sign-in, even with valid JWT.
  suspended=true;
  const blockedRes=response();
  await sparksAuth({method:"GET",headers:{cookie:"__Host-qa_sparks_access="+token}},blockedRes);
  assert.equal(blockedRes.inspect().code,403);
  assert.equal(blockedRes.inspect().value.code,"SPARKS_PROFILE_RECONCILIATION_REQUIRED");
  assert.match(JSON.stringify(blockedRes.inspect().headers["Set-Cookie"]),/Max-Age=0/);
  suspended=false;

  // Outage is not mistaken for token revocation; don't erase a usable session.
  serviceDown=true;
  const outageRes=response();
  await sparksAuth({method:"GET",headers:{cookie:"__Host-qa_sparks_access="+token}},outageRes);
  assert.equal(outageRes.inspect().code,503);
  assert.equal(outageRes.inspect().headers["Set-Cookie"],undefined);
  serviceDown=false;
  console.log("PASS Sparks Supabase Auth: verified email, cookie-only exchange, admin roster, suspended denial, CORS and missing-session refusal");
} finally {
  globalThis.fetch=savedFetch;
  if(savedKey===undefined)delete process.env.SPARKS_SUPABASE_PUBLISHABLE_KEY;
  else process.env.SPARKS_SUPABASE_PUBLISHABLE_KEY=savedKey;
}
