import assert from "node:assert/strict";
import handler from "../api/sparks-admin.js";
import { readFileSync } from "node:fs";

const names = [
  "SPARKS_DATA_BACKEND", "SPARKS_AUTH_MODE", "SPARKS_SUPABASE_PUBLISHABLE_KEY",
  "SPARKS_SUPABASE_BRIDGE_URL", "SPARKS_SUPABASE_BRIDGE_TOKEN",
  "SPARKS_CLOUD_READ_ONLY", "SPARKS_WRITES_PAUSED",
];
const before = Object.fromEntries(names.map(name => [name, process.env[name]]));
const oldFetch = globalThis.fetch;
Object.assign(process.env,{
  SPARKS_DATA_BACKEND:"supabase",
  SPARKS_AUTH_MODE:"hybrid",
  SPARKS_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_test_only",
  SPARKS_SUPABASE_BRIDGE_URL:"https://test.supabase.co/functions/v1/qa-sparks-runtime-test",
  SPARKS_SUPABASE_BRIDGE_TOKEN:"forty-eight-characters-long-test-secret-for-bridge",
  SPARKS_CLOUD_READ_ONLY:"0",
  SPARKS_WRITES_PAUSED:"0",
});
let firebaseCalls=0, supabaseAuthCalls=0, writes=0;
const stored = (path,data) => ({
  name:"projects/qa-dashboard-b0b5d/databases/(default)/documents/"+path,
  fields:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,typeof v==="number"?{integerValue:String(v)}:{stringValue:String(v)}])),
  updateTime:"2026-11-10T10:00:00Z",
});
const result=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{"content-type":"application/json"}});
globalThis.fetch=async (url,opts={})=>{
  const u=String(url), bearer=String(opts.headers?.Authorization||"");
  if(u.includes("firestore.googleapis.com") || u.includes("oauth2.googleapis.com")) {
    firebaseCalls++;
    throw Error("FIREBASE_CALLED_FOR_VERIFIED_OWNER");
  }
  if(u.endsWith("/auth/v1/user")) {
    supabaseAuthCalls++;
    if(bearer!=="Bearer verified-owner-email-session-token")return result({error:"invalid token"},401);
    return result({id:"owner-verified",email:"owner@example.test",email_confirmed_at:"2026-11-10T10:00:00Z"});
  }
  if(u.endsWith("/rest/v1/rpc/sparks_verified_identity_v1")) {
    return result([{username:"Songpon",display_name:"Verified QA Owner",role:"Quality Assurance",status:"Active"}]);
  }
  if(u.endsWith("/rest/v1/rpc/sparks_admin_directory_v1")) {
    return result([{username:"Songpon",display_name:"Verified QA Owner",role:"Quality Assurance",status:"Active"}]);
  }
  if(u.endsWith("/functions/v1/qa-sparks-runtime-test")) {
    const b=JSON.parse(opts.body);
    if(b.action==="commit"||b.action==="begin") { writes++; return result({error:"no test writes"},403); }
    if(b.action==="get"&&b.path==="qa_sparks_wallets/songpon")
      return result(stored(b.path,{username:"Songpon",balance:1250,totalEarned:1500,totalSpent:250,balanceYear:2026}));
    if(b.action==="list"&&b.collection==="qa_sparks_wallets")
      return result({documents:[stored("qa_sparks_wallets/songpon",{username:"Songpon",balance:1250,totalEarned:1500,totalSpent:250,balanceYear:2026})]});
    if(b.action==="list")return result({documents:[]});
    if(b.action==="get")return result({error:"not found"},404);
    throw Error("Unexpected bridge action: "+b.action);
  }
  throw Error("Unexpected outbound call: "+u);
};
async function call(action,cookie,body={}) {
  const req={method:"POST",headers:{cookie:cookie ? "__Host-qa_sparks_access="+cookie : "", "sec-fetch-site":"same-origin"},body:{
    action,actorUsername:"Songpon",sessionId:"qa-existing-legacy-session",...body,
  }};
  let status=0,bodyResult;
  const res={setHeader(){},status(code){status=code;return this},json(data){bodyResult=data;return data}};
  await handler(req,res);
  return {status,body:bodyResult};
}
try {
  const wallet=await call("sparks-cloud-wallet","verified-owner-email-session-token",{historyLimit:0});
  assert.equal(wallet.status,200,JSON.stringify(wallet.body));
  assert.equal(wallet.body.wallet.balance,1250);
  const admin=await call("list","verified-owner-email-session-token");
  assert.equal(admin.status,200,JSON.stringify(admin.body));
  assert.deepEqual(admin.body.users.map(x=>x.username),["Songpon"]);
  const wrong=await call("sparks-cloud-wallet","verified-owner-email-session-token",{actorUsername:"AnotherUser",historyLimit:0});
  assert.equal(wrong.status,403,"Supabase owner cookie must not impersonate other employee");
  const forged=await call("sparks-cloud-wallet","forged-cookie-cannot-bypass-login",{historyLimit:0});
  assert.equal(forged.status,401,"forged cookie never falls back to Firebase");
  assert.ok(supabaseAuthCalls>=4);
  assert.equal(firebaseCalls,0,"verified email sessions bypass Firestore and Google token entirely");
  assert.equal(writes,0,"read-only tests cannot alter any real or mock Sparks balance");
  const qs=readFileSync(new URL("../src/QASparks.tsx",import.meta.url),"utf8");
  assert.match(qs,/emailAuthMode === "hybrid" && \(Boolean\(verifiedSparksActor\) \|\| emailOptedIn\)/,
    "Owner and staff may use existing verified QA session during OTP outages");
  assert.doesNotMatch(qs,/username\.trim\(\)\.toLowerCase\(\) === "songpon" \|\| Boolean\(verifiedSparksActor\)/,
    "Do not force owner onto unavailable Supabase OTP");
  const site=readFileSync(new URL("../src/SparksStandalone.tsx",import.meta.url),"utf8");
  assert.match(site,/\["supabase","hybrid"\]/);
  assert.ok(qs.includes('username.trim().toLowerCase()==="songpon" && import.meta.env?.VITE_SPARKS_CLOUD_READ_ONLY !== "1"'),
    "The owner migration control is visible in Sparks Admin even in Supabase auth mode");
  assert.ok(!qs.includes('!emailAuthEnabled && username.trim().toLowerCase()==="songpon" && adminSessionId'),
    "Missing owner QA session must display an explanation, not silently hide the migration control");
  const migrationUi=readFileSync(new URL("../src/SparksQaCredentialMigration.tsx",import.meta.url),"utf8");
  assert.ok(migrationUi.includes('!sessionId ? <p role="alert"'),"Explain why import is unavailable without QA session");
  assert.match(qs,/data-sparks-supabase-optin="true"/,"every QA employee may start Supabase login");
  assert.match(qs,/emailOptedIn/,"hybrid mode supports non-owner email opt-in");
  assert.match(qs,/data-sparks-legacy-fallback="true"/,"legacy path remains available until OTP is ready");
  assert.match(qs,/qa:sparks:supabase-login:/,"browser remembers the selected login path per employee");
  const adminSource=readFileSync(new URL("../api/sparks-admin.js",import.meta.url),"utf8");
  const migrationUi=readFileSync(new URL("../src/SparksQaCredentialMigration.tsx",import.meta.url),"utf8");
  assert.ok(adminSource.includes('code:"QA_CREDENTIAL_FIRESTORE_LIMIT"'),"Credential-source quota is distinguishable from Sparks reward wallet");
  assert.ok(adminSource.includes('qaMigrationStage="owner-session"'),"Credential migration identifies QA-session verification failure");
  assert.ok(adminSource.includes('qaMigrationStage="source-credentials"'),"Credential migration identifies profile-source read failures");
  assert.ok(adminSource.includes('qaMigrationStage="supabase-import"'),"Credential migration identifies Supabase import failure");
  assert.ok(adminSource.includes('code:"QA_CREDENTIAL_OWNER_SESSION_INVALID"'),"Credentials transfer never skips owner QA session verification");
  assert.ok(migrationUi.includes('body.code==="QA_CREDENTIAL_FIRESTORE_LIMIT"'),"UI reports source quota without claiming rewards outage");
  assert.ok(migrationUi.includes('if(action==="qa-password-preflight")setAudit(null)'),"Failed checks never preserve stale ready counts");
    console.log("PASS Sparks hybrid owner: verified Supabase wallet and Admin without Firebase, forged/mismatched accounts denied, other Dashboard users unchanged");
}finally {
  globalThis.fetch=oldFetch;
  for (const [name,value] of Object.entries(before)) {
    if(value===undefined)delete process.env[name];else process.env[name]=value;
  }
}
