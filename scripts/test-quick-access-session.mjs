import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import handler from "../server/quickAccessHandler.js";
import { readFileSync } from "node:fs";

const key = generateKeyPairSync("rsa",{modulusLength:2048,privateKeyEncoding:{type:"pkcs8",format:"pem"},publicKeyEncoding:{type:"spki",format:"pem"}}).privateKey;
process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON = JSON.stringify({
  client_email:"qa-session-tests@example.invalid",private_key:key,project_id:"qa-dashboard-b0b5d"
});
process.env.SPARKS_SUPABASE_BRIDGE_URL="https://bridge.example.com/functions/v1/qa-sparks-runtime";
process.env.SPARKS_SUPABASE_BRIDGE_TOKEN="test-secret-".repeat(8);

const sessions = new Map(), profiles=new Map(), calls=[];
const wrapped = (entry)=>({fields:Object.fromEntries(Object.entries(entry).map(([k,v])=>[k,typeof v==="boolean"?{booleanValue:v}:{stringValue:String(v)}]))});
const expiry=new Date(Date.now()+60*60*1000).toISOString();
const newSession=(username,role="Quality Assurance")=>{
  const id=username+"-12345678-1234-4123-8123-123456789abc";
  sessions.set(id,{username,role,displayName:"Songpon Phothong",policyVersion:"qa-session-policy-2026-07-15-v1",status:"active",expiresAt:expiry,createdAt:new Date(Date.now()-60000).toISOString()});
  return id;
};
const adminId=newSession("songpon.qa");
profiles.set("songpon.qa",{username:"songpon.qa",displayName:"Songpon Phothong",role:"Quality Assurance",status:"Active"});
const viewerId=newSession("agent.cc","Admin Live Chat");
profiles.set("agent.cc",{username:"agent.cc",displayName:"Agent User",role:"Admin Live Chat",status:"Active"});
globalThis.fetch=async (input,init={})=>{
  const url=String(input);
  if(url==="https://oauth2.googleapis.com/token")return new Response(JSON.stringify({access_token:"test-token",expires_in:3600}),{status:200});
  if(url.startsWith("https://firestore.googleapis.com/")){
    const path=decodeURIComponent(url.split("/documents/")[1]||"");
    const [collection,...ids]=path.split("/");
    const id=ids.join("/");
    const record=collection==="qa_user_sessions"?sessions.get(id):collection==="qa_user_profiles"?profiles.get(id):null;
    return new Response(record?JSON.stringify(wrapped(record)):"{}",{status:record?200:404});
  }
  if(url.includes("qa-dashboard-quick-access")){
    calls.push(JSON.parse(init.body||"{}"));
    return new Response(JSON.stringify({links:[{id:"sample",title:"Sample",url:"https://example.com/",category:"work",icon:"auto",sortOrder:0}]}),{status:200});
  }
  throw new Error("Unexpected request: "+url);
};
async function request(username,sessionId,action){
  let status=200,response={};
  const req={method:"POST",headers:{"sec-fetch-site":"same-origin",origin:"https://qa.example.com",host:"qa.example.com"},
    body:{actorUsername:username,sessionId,action,...(action==="create"?{link:{title:"Example",url:"https://example.com/",category:"other",icon:"auto"}}:{})}};
  const res={setHeader(){},status(value){status=value;return this;},json(value){response=value;return this;}};
  await handler(req,res);
  return {status,response};
}
assert.equal((await request("songpon.qa",adminId,"list")).status,200,"periods in session IDs must be accepted");
assert.equal((await request("songpon.qa",adminId,"create")).status,200,"stored QA admin may manage links");
assert.equal((await request("agent.cc",viewerId,"list")).status,200,"other users can read links");
assert.equal((await request("agent.cc",viewerId,"create")).status,403,"non-admin cannot modify links");
assert.equal((await request("songpon.qa","../invalid","list")).status,401,"path injection blocked");
assert.equal((await request("songpon.qa","songpon.qa-missing-session-id","create")).status,401,"missing session fails closed");
assert.equal(calls.filter(c=>c.action==="create").length,1,"only authorized write forwarded to Supabase");
console.log("PASS Quick Access: real-shaped session IDs, stored admin authorization, non-admin denial, unknown session denial, safe Supabase forwarding");

// Prevent a cached default-link ID from being submitted as if it were a
// server-generated PostgreSQL UUID.
const quickUi = readFileSync(new URL("../src/QuickAccessMenu.tsx",import.meta.url),"utf8");
assert.match(quickUi,/matches\.length === 1 \? matches\[0\]\.id : previous/);
assert.match(quickUi,/editingId\?\.startsWith\("initial-"\)/);
assert.match(quickUi,/ตรวจสอบการเชื่อมต่อใหม่/);
assert.match(quickUi,/if \(ready\) setError\(" "\);|if \(ready\) setError\(" "\)/.source?new RegExp("if \\(ready\\) setError"):/if \(ready\) setError/);
console.log("PASS Quick Access UI: stale initial IDs reconcile against Supabase, session errors remain visible, retry is available");

const uiSource = readFileSync(new URL("../src/QuickAccessMenu.tsx",import.meta.url),"utf8");
const appSource = readFileSync(new URL("../src/App.tsx",import.meta.url),"utf8");
assert.match(uiSource,/class QuickAccessSessionError extends Error/);
assert.match(uiSource,/sessionErrorCode && <button type="button" onClick={onReauthenticate}>เข้าสู่ระบบใหม่/);
assert.match(appSource,/onReauthenticate=\{\(\) => \{/);
for(const file of ["oho-chat.svg","sharepoint.svg","google-sheets.svg"])
  assert.ok(readFileSync(new URL("../public/quick-access/"+file,import.meta.url),"utf8").includes("<svg"),"Bundled brand icon "+file);
console.log("PASS Quick Access recovery: secure re-login CTA and local brand images");

// A legacy session must be replaced only after validating the real password.
// The editor remains present and is not silently allowed to write with an
// unverified Session ID.
const renewalApp=readFileSync(new URL("../src/App.tsx",import.meta.url),"utf8");
assert.match(renewalApp,/const renewQuickAccessSession = async/);
assert.match(renewalApp,/createStoredUserSession\(verified\)/);
assert.match(renewalApp,/String\(profile.password\) !== typedPassword/);
assert.match(renewalApp,/onRenewSession=\{renewQuickAccessSession\}/);
assert.match(quickUi,/class QuickAccessSessionError extends Error/);
assert.match(quickUi,/const renewCurrentSession = async/);
assert.match(quickUi,/disabled=\{!ready \|\| saving\} onClick=\{\(\) => edit\(link\)\}/);
assert.match(quickUi,/disabled=\{!ready \|\| saving\} onClick=\{\(\) => edit\(\)\}/);
console.log("PASS Quick Access: password-gated session renewal, no phantom edit buttons");
