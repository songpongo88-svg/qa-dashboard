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
let newWallet=null,newHistory=null,firstLoginBegins=0;
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
    const x=auth.includes("suspended")?[]:auth.includes("newuser")
      ?[{username:"NewUser",display_name:"New Staff",role:"Admin Live Chat",status:"Active"}]
      :auth.includes("admin")
      ?[{username:"Songpon",display_name:"QA Admin",role:"Quality Assurance",status:"Active"}]
      :[{username:"ActiveUser",display_name:"Agent",role:"Admin Live Chat",status:"Active"}];
    return respond(x);
  }
  if(str.endsWith("/rest/v1/rpc/sparks_admin_directory_v1"))
    return respond([{username:"Songpon",display_name:"QA Admin",role:"Quality Assurance",status:"Active"},
      {username:"ActiveUser",display_name:"Agent",role:"Admin Live Chat",status:"Active"}]);
  if(str.endsWith("/functions/v1/qa-sparks-runtime-test")){
    const b=JSON.parse(opts.body);
    if(b.action==="begin"){firstLoginBegins++;return respond({transaction:"test-newuser-"+firstLoginBegins});}
    if(b.action==="commit"){
      const writes=b.writes||[];
      if(writes.length!==2 || !writes.every(w=>w?.update?.name?.includes("/qa_sparks_wallets/newuser")))return respond({error:"INVALID_TEST_WRITE"},403);
      if(newWallet || newHistory)return respond({firestoreStatus:"FAILED_PRECONDITION"},409);
      if(writes[0].currentDocument?.exists!==false || writes[1].currentDocument?.exists!==false)
        return respond({firestoreStatus:"FAILED_PRECONDITION"},409);
      newWallet={...writes[0].update,updateTime:"2026-11-11T00:00:00Z"};
      newHistory={...writes[1].update,updateTime:"2026-11-11T00:00:00Z"};
      bridgeWrites++;
      return respond({ok:true});
    }
    bridgeReads++;
    if(b.action==="get" && b.path==="qa_sparks_wallets/newuser")return newWallet?respond(newWallet):respond({error:"missing"},404);
    if(b.action==="get" && b.path==="qa_sparks_wallets/newuser/history/first-login-welcome-v1")return newHistory?respond(newHistory):respond({error:"missing"},404);
    if(b.action==="list" && b.collection==="qa_sparks_wallets/newuser/history")
      return respond({documents:newHistory?[newHistory]:[]});
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
  // First-time employees legitimately have no wallet until they claim Fruit Card.
  const empty=await invoke("sparks-cloud-wallet","NewUser","valid-test-token-newuser",{historyLimit:5});
  assert.equal(empty.code,200,JSON.stringify(empty.body));
  assert.deepEqual(empty.body.wallet,{},"new user starts with no precreated wallet");
  assert.deepEqual(empty.body.history,[]);
  assert.equal(newWallet,null,"opening Sparks is read-only");
  assert.equal(bridgeWrites,0,"no 0-point wallet is written just to log in");

  const first=await invoke("sparks-cloud-first-login","NewUser","valid-test-token-newuser",{
    cardId:"apple",cardName:"Apple Spark",amount:250,
  });
  assert.equal(first.code,200,JSON.stringify(first.body));
  assert.equal(first.body.prize.amount,250);
  assert.equal(first.body.alreadyApplied,false);
  assert.equal(bridgeWrites,1,"one atomic commit creates wallet and immutable history");
  const after=await invoke("sparks-cloud-wallet","NewUser","valid-test-token-newuser",{historyLimit:5});
  assert.equal(after.code,200,JSON.stringify(after.body));
  assert.equal(after.body.wallet.balance,250);
  assert.equal(after.body.wallet.totalEarned,250);
  assert.equal(after.body.history.length,1);

  const repeat=await invoke("sparks-cloud-first-login","NewUser","valid-test-token-newuser",{
    cardId:"banana",cardName:"Banana Boost",amount:1000,
  });
  assert.equal(repeat.code,200,JSON.stringify(repeat.body));
  assert.equal(repeat.body.alreadyApplied,true);
  assert.equal(repeat.body.prize.amount,250);
  assert.equal(bridgeWrites,1,"repeat first login cannot credit more points");

  const original=await invoke("sparks-cloud-wallet","ActiveUser","valid-test-token-member",{historyLimit:0});
  assert.equal(original.code,200);
  assert.equal(original.body.wallet.balance,240,"existing user score unchanged");
  assert.equal(firestoreReads,0,"Firebase must not be contacted in Sparks email auth mode");
  assert.ok(bridgeReads>=2,"Verified wallet and admin list read only Supabase");
  console.log("PASS Sparks Email API: new wallet onboarding, atomic single Fruit Card claim, existing scores unchanged and zero Firebase reads");
}finally{
  globalThis.fetch=oldFetch;
  for(const [key,value]of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;
}
