import assert from "node:assert/strict";
import { verifySparksAccessToken, withSparksRequest, getSparksRequestActor,
  exchangeSparksAuthTokens, sparksActiveDirectory, sparksActiveProfile } from "../server/sparksSupabaseAuth.js";
import sparksAuth from "../api/sparks-auth.js";
const savedKey=process.env.SPARKS_SUPABASE_PUBLISHABLE_KEY;
process.env.SPARKS_SUPABASE_PUBLISHABLE_KEY="sb_publishable_test_only_key_123";
const savedFetch=globalThis.fetch;
const token="test-verified-sparks-access-token-123";
const calls=[];
const result=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json"}});
globalThis.fetch=async(raw,options={})=>{
  const url=String(raw), bearer=String(options?.headers?.Authorization||"");
  calls.push({url,bearer});
  if(url.endsWith("/auth/v1/user")) {
    if(bearer!=="Bearer "+token)return result({message:"invalid"},401);
    return result({id:"verified-auth-user",email:"admin@example.test",email_confirmed_at:"2026-11-10T00:00:00Z"});
  }
  if(url.endsWith("/rest/v1/rpc/sparks_verified_identity_v1"))return result([
    {username:"Songpon",display_name:"QA Admin",role:"Quality Assurance",status:"Active"},
  ]);
  if(url.endsWith("/rest/v1/rpc/sparks_admin_directory_v1"))return result([
    {username:"Songpon",display_name:"QA Admin",role:"Quality Assurance",status:"Active"},
    {username:"ActiveUser",display_name:"Agent",role:"Admin Live Chat",status:"Active"},
  ]);
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
  const cookies=response();
  await sparksAuth({method:"POST",headers:{},body:{action:"exchange",access_token:token,refresh_token:"secure-refresh-token-test-long"}},cookies);
  assert.equal(cookies.inspect().code,200);
  assert.ok(cookies.inspect().headers["Set-Cookie"].length===2);
  assert.ok(!JSON.stringify(cookies.inspect().value).includes(token));
  console.log("PASS Sparks Supabase Auth: verified email, cookie-only exchange, admin roster, suspended denial, CORS and missing-session refusal");
} finally {
  globalThis.fetch=savedFetch;
  if(savedKey===undefined)delete process.env.SPARKS_SUPABASE_PUBLISHABLE_KEY;
  else process.env.SPARKS_SUPABASE_PUBLISHABLE_KEY=savedKey;
}
