// Simulate an already verified QA Admin session, then exhaust ONLY Firebase reads.
// Sparks wallet and history remain on the Supabase bridge. No live network calls.
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import handler from "../api/sparks-admin.js";

const saved = Object.fromEntries([
  "SPARKS_DATA_BACKEND","SPARKS_CLOUD_READ_ONLY","SPARKS_SUPABASE_BRIDGE_URL",
  "SPARKS_SUPABASE_BRIDGE_TOKEN","FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON",
].map(k=>[k,process.env[k]]));
const oldFetch=globalThis.fetch;
const {privateKey}=generateKeyPairSync("rsa",{modulusLength:2048,privateKeyEncoding:{type:"pkcs8",format:"pem"},
  publicKeyEncoding:{type:"spki",format:"pem"}});
const endpoint="https://sparks-test.supabase.co/functions/v1/qa-sparks-runtime-test";
process.env.SPARKS_DATA_BACKEND="supabase";
process.env.SPARKS_CLOUD_READ_ONLY="0";
process.env.SPARKS_SUPABASE_BRIDGE_URL=endpoint;
process.env.SPARKS_SUPABASE_BRIDGE_TOKEN="private-integration-test-secret-key-longer-than-forty-characters";
process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON=JSON.stringify({
  client_email:"firebase-test@example.test",private_key:privateKey,project_id:"qa-dashboard-b0b5d",
});
let firebaseExhausted=false,bridgeReads=0,bridgeWrites=0;
const typed=(v)=>typeof v==="number"?{integerValue:String(v)}:typeof v==="boolean"?{booleanValue:v}:{stringValue:String(v)};
const make=(path,data)=>({name:"projects/qa-dashboard-b0b5d/databases/(default)/documents/"+path,
  fields:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,typed(v)])),updateTime:"2026-11-10T05:00:00Z"});
const ok=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{"content-type":"application/json"}});
const profiles=[
  {username:"Songpon",displayName:"QA Admin",role:"Quality Assurance",status:"Active"},
  {username:"ActiveUser",displayName:"Agent",role:"Admin Live Chat",status:"Active"},
  {username:"Suspended",displayName:"Suspended",role:"Admin Live Chat",status:"Suspended"},
];
globalThis.fetch=async(url,options={})=>{
  const u=String(url);
  if(u==="https://oauth2.googleapis.com/token")return ok({access_token:"test",expires_in:3600});
  if(u===endpoint){
    const payload=JSON.parse(options.body);
    if(payload.action==="commit"||payload.action==="begin"){bridgeWrites++;throw Error("Read-only fallback must not touch transactional Sparks writes");}
    bridgeReads++;
    if(payload.action==="list"&&payload.collection==="qa_sparks_wallets")
      return ok({documents:[make("qa_sparks_wallets/activeuser",{username:"ActiveUser",balance:420,totalEarned:500,totalSpent:80,rewardOrders:1})]});
    if(payload.action==="list"&&payload.collection.includes("/history"))
      return ok({documents:[make("qa_sparks_wallets/activeuser/history/receipt",{createdAt:"2026-11-10T04:00:00Z",source:"admin-add",amount:420,title:"Granted"})]});
    if(payload.action==="get"&&payload.path==="qa_sparks_wallets/activeuser")
      return ok(make(payload.path,{username:"ActiveUser",balance:420,totalEarned:500,totalSpent:80,rewardOrders:1}));
    return ok({documents:[]});
  }
  assert.ok(u.startsWith("https://firestore.googleapis.com/v1/projects/qa-dashboard-b0b5d/databases/(default)/documents"));
  if(firebaseExhausted)return ok({error:{status:"RESOURCE_EXHAUSTED",message:"Firestore quota exhausted"}},429);
  if(u.includes("/qa_user_sessions/"))return ok(make("qa_user_sessions/test-session",{
    username:"Songpon",role:"Quality Assurance",status:"active",
    policyVersion:"qa-session-policy-2026-07-15-v1",
    createdAt:"2026-11-05T02:00:00Z",expiresAt:new Date(Date.now()+3600000).toISOString(),
  }));
  if(u.includes("/qa_user_session_controls/")||u.includes("/qa_sparks_admin_session_grants/"))
    return ok({error:{status:"NOT_FOUND"}},404);
  if(u.includes("/qa_user_profiles/Songpon"))return ok(make("qa_user_profiles/Songpon",profiles[0]));
  if(u.includes("/qa_user_profiles?"))return ok({documents:profiles.map(p=>make("qa_user_profiles/"+p.username,p))});
  return ok({error:{status:"NOT_FOUND"}},404);
};
async function call(action,body={}){
  const req={method:"POST",body:{action,actorUsername:"Songpon",sessionId:"admin-test-session-123456789",...body}};
  let code=0,value;
  const res={setHeader(){},status(x){code=x;return this},json(x){value=x;return x}};
  await handler(req,res);
  return {code,value};
}
try{
  const first=await call("list");
  assert.equal(first.code,200,JSON.stringify(first.value));
  assert.ok(first.value.adminReadGrant,"live verified admin may obtain signed read-only grant");
  assert.deepEqual(first.value.users.map(x=>x.username),["ActiveUser","Songpon"]);
  firebaseExhausted=true;
  const withGrant={adminReadGrant:first.value.adminReadGrant};
  const fallback=await call("list",withGrant);
  assert.equal(fallback.code,200,JSON.stringify(fallback.value));
  assert.equal(fallback.value.readOnlyFallback,true);
  assert.equal(fallback.value.users.find(x=>x.username==="activeuser").balance,420);
  const history=await call("history",{...withGrant,targetUsername:"ActiveUser"});
  assert.equal(history.code,200,JSON.stringify(history.value));
  assert.equal(history.value.readOnlyFallback,true);
  assert.ok(Array.isArray(history.value.history));
  assert.equal((await call("history",{...withGrant,targetUsername:"Suspended"})).code,403);
  assert.equal((await call("list",{adminReadGrant:"forged"})).code,429);
  assert.equal((await call("list",{...withGrant,sessionId:"different-session-id"})).code,429);
  assert.equal((await call("adjust",{...withGrant,targetUsername:"ActiveUser",operation:"add",amount:1,
    reason:"Not allowed during quota",requestId:"quota-test-adjust-123456"})).code,429);
  assert.equal(bridgeWrites,0,"grace grant must not bypass QA checks for mutations");
  assert.ok(bridgeReads>=3);
  console.log("PASS Sparks Admin: verified roster keeps Supabase wallet/history readable during Firebase quota; grants cannot authorize writes or suspended targets");
}finally{
  globalThis.fetch=oldFetch;
  for(const [k,v] of Object.entries(saved))if(v===undefined)delete process.env[k];else process.env[k]=v;
}
