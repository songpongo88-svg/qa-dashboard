import assert from "node:assert/strict";
import handler from "../api/sparks-admin.js";
const vars=["SPARKS_DATA_BACKEND","SPARKS_AUTH_MODE","SPARKS_SUPABASE_PUBLISHABLE_KEY",
  "SPARKS_SUPABASE_BRIDGE_URL","SPARKS_SUPABASE_BRIDGE_TOKEN","SPARKS_CLOUD_READ_ONLY","SPARKS_WRITES_PAUSED"];
const previous=Object.fromEntries(vars.map(k=>[k,process.env[k]]));
Object.assign(process.env,{
  SPARKS_DATA_BACKEND:"supabase",SPARKS_AUTH_MODE:"supabase",
  SPARKS_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_local_test",
  SPARKS_SUPABASE_BRIDGE_URL:"https://example.supabase.co/functions/v1/qa-sparks-runtime-test",
  SPARKS_SUPABASE_BRIDGE_TOKEN:"test-server-only-token-longer-than-forty-characters",
  SPARKS_CLOUD_READ_ONLY:"0",SPARKS_WRITES_PAUSED:"0",
});
const oldFetch=globalThis.fetch;
let bridgeReads=0,bridgeWrites=0,firestoreReads=0;
const typed=(v)=>typeof v==="number"?{integerValue:String(v)}: {stringValue:String(v)};
const stored=(path,v)=>({name:"projects/qa-dashboard-b0b5d/databases/(default)/documents/"+path,
  fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,typed(x)])),
  updateTime:"2026-11-10T00:00:00Z"});
const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
globalThis.fetch=async(url,opts={})=>{
  const str=String(url), auth=String(opts?.headers?.Authorization||"");
  if(str.includes("firestore.googleapis.com")){firestoreReads++;throw Error("Firebase must not be read for Sparks email auth");}
  if(str.endsWith("/auth/v1/user")){
    if(!auth.startsWith("Bearer valid-test-token-"))return respond({msg:"invalid"},401);
    return respond({id:"verified-email",email:"test@example.com",email_confirmed_at:"2026-11-10T00:00:00Z"});
  }
  if(str.endsWith("/rest/v1/rpc/sparks_verified_identity_v1")){
    const x=auth.includes("suspended")?[]:auth.includes("admin")
      ?[{username:"Songpon",display_name:"QA Admin",role:"Quality Assurance",status:"Active"}]
      :[{username:"ActiveUser",display_name:"Agent",role:"Admin Live Chat",status:"Active"}];
    return respond(x);
  }
  if(str.endsWith("/rest/v1/rpc/sparks_admin_directory_v1"))
    return respond([{username:"Songpon",display_name:"QA Admin",role:"Quality Assurance",status:"Active"},
      {username:"ActiveUser",display_name:"Agent",role:"Admin Live Chat",status:"Active"}]);
  if(str.endsWith("/functions/v1/qa-sparks-runtime-test")){
    const b=JSON.parse(opts.body);
    if(b.action==="commit"||b.action==="begin"){bridgeWrites++;return respond({error:"no test writes"},403);}
    bridgeReads++;
    if(b.action==="get"&&b.path==="qa_sparks_wallets/activeuser")
      return respond(stored(b.path,{username:"ActiveUser",balance:240,totalEarned:270,totalSpent:30,balanceYear:2026}));
    if(b.action==="list"&&b.collection==="qa_sparks_wallets")
      return respond({documents:[stored("qa_sparks_wallets/activeuser",{username:"ActiveUser",balance:240,totalEarned:270,totalSpent:30,balanceYear:2026})]});
    if(b.action==="list")return respond({documents:[]});
    if(b.action==="get")return respond({error:"missing"},404);
    throw Error("Unexpected bridge action "+b.action);
  }
  throw Error("Unexpected URL "+str);
};
function invoke(action,who,token,extra={}){
  const req={method:"POST",headers:{cookie:token?"__Host-qa_sparks_access="+token:""},
    body:{action,actorUsername:who,sessionId:"qa-session-id-123456789",...extra}};
  let code=0,body;
  const res={setHeader(){},status(x){code=x;return this},json(x){body=x;return x}};
  return Promise.resolve(handler(req,res)).then(()=>({code,body}));
}
try {
  const wallet=await invoke("sparks-cloud-wallet","ActiveUser","valid-test-token-member",{historyLimit:0});
  assert.equal(wallet.code,200,JSON.stringify(wallet.body));
  assert.equal(wallet.body.wallet.balance,240);
  const denied=await invoke("list","Songpon","valid-test-token-member");
  assert.equal(denied.code,403);
  const admin=await invoke("list","Songpon","valid-test-token-admin");
  assert.equal(admin.code,200,JSON.stringify(admin.body));
  assert.deepEqual(admin.body.users.map(u=>u.username),["ActiveUser","Songpon"]);
  const noCookie=await invoke("sparks-cloud-wallet","ActiveUser",null,{historyLimit:0});
  assert.equal(noCookie.code,401);
  const suspended=await invoke("sparks-cloud-wallet","ActiveUser","valid-test-token-suspended",{historyLimit:0});
  assert.equal(suspended.code,403);
  const spoof=await invoke("sparks-cloud-wallet","Songpon","valid-test-token-member",{historyLimit:0});
  assert.equal(spoof.code,403);
  assert.equal(firestoreReads,0,"Firebase must not be contacted in Sparks email auth mode");
  assert.equal(bridgeWrites,0,"Test must not change real or mock Sparks scores");
  assert.ok(bridgeReads>=2,"Verified wallet and admin list read only Supabase");
  console.log("PASS Sparks Email API: verified member wallet and Admin list, rejects missing/spoofed/suspended sessions without Firebase reads");
}finally{
  globalThis.fetch=oldFetch;
  for(const [key,value]of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;
}
