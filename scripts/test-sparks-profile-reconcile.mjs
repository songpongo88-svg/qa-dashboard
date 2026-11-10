import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { getCompleteSparksProfiles,runSparksProfileReconciliation } from "../server/sparksProfileReconcile.js";
import cron from "../api/cron/sparks-profile-reconcile.js";
const previous=globalThis.fetch;
const envNames=["SPARKS_PROFILE_SYNC_ENABLED","SPARKS_SUPABASE_BRIDGE_TOKEN",
  "SPARKS_SUPABASE_BRIDGE_URL","FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON","CRON_SECRET"];
const originals=Object.fromEntries(envNames.map(key=>[key,process.env[key]]));
const privateKey=generateKeyPairSync("rsa",{modulusLength:2048,
  publicKeyEncoding:{type:"spki",format:"pem"},
  privateKeyEncoding:{type:"pkcs8",format:"pem"}}).privateKey;
const account=JSON.stringify({client_email:"qa-profile-test@example.test",private_key:privateKey,project_id:"qa-dashboard-b0b5d"});
const p="projects/qa-dashboard-b0b5d/databases/(default)/documents/qa_user_profiles/";
const doc=(n, status="Active")=>({name:p+"User"+n,updateTime:"2026-11-10T08:00:00Z",fields:{
  username:{stringValue:"User"+n},
  displayName:{stringValue:"Agent "+n},
  email:{stringValue:"test"+n+"@example.test"},
  role:{stringValue:"Admin Live Chat"},
  status:{stringValue:status},
  suspendEffectiveDate:{stringValue:status==="Suspended"?"2026-11-09":""},
  suspendEndDate:{stringValue:""},
  suspendAutoReactivate:{booleanValue:false},
  password:{stringValue:"DO_NOT_EXPORT"},
}});
const res=(o,status=200)=>new Response(JSON.stringify(o),{status,headers:{"content-type":"application/json"}});
const all=Array.from({length:30},(_,i)=>doc(i,i===15?"Suspended":"Active"));
let firestoreCalls=0,posted=0,seenPost=null,mode="normal";
globalThis.fetch=async(url,options={})=>{
  if(String(url)==="https://oauth2.googleapis.com/token")return res({access_token:"fake-only-test-token"});
  if(String(url).startsWith("https://firestore.googleapis.com/v1/")){
    firestoreCalls++;
    assert.ok(String(url).includes("/qa_user_profiles"),"must only read employee profiles");
    assert.ok(!String(url).includes("qa_evaluations"),"must not read QA scores");
    if(mode==="quota")return res({error:"RESOURCE_EXHAUSTED"},429);
    if(mode==="empty")return res({documents:all.slice(0,4)});
    if(mode==="duplicates")return res({documents:[...all.slice(0,29),{...all[29],name:all[0].name}]});
    if(mode==="paginated"){
      const token=new URL(String(url)).searchParams.get("pageToken");
      return res(token ? {documents:all.slice(16)} : {documents:all.slice(0,16),nextPageToken:"next"});
    }
    return res({documents:all});
  }
  assert.ok(String(url).endsWith("/functions/v1/qa-sparks-profile-reconcile"),"profile sync must use isolated function");
  assert.equal(options.headers["x-qa-sparks-server-secret"],process.env.SPARKS_SUPABASE_BRIDGE_TOKEN);
  posted++;
  seenPost=JSON.parse(options.body);
  assert.equal(seenPost.profiles.length,30);
  assert.equal(seenPost.profiles[15].profile.status,"Suspended");
  assert.ok(seenPost.profiles.every(x=>!("password" in x.profile)&&!("token" in x.profile)),
    "password or JWT must never be exported");
  return res({ok:true,sourceCount:30,reviewedCount:29,blockedCount:1});
};
try{
  const base={SPARKS_PROFILE_SYNC_ENABLED:"1",
    SPARKS_SUPABASE_BRIDGE_TOKEN:"a-private-test-only-server-secret-longer-than-forty-characters",
    SPARKS_SUPABASE_BRIDGE_URL:"https://example.supabase.co/functions/v1/qa-sparks-runtime",
    FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON:account,
    CRON_SECRET:"a-strong-local-cron-secret-for-tests"};
  Object.assign(process.env,base);
  const got=await getCompleteSparksProfiles({serviceAccount:account});
  assert.equal(got.length,30);
  assert.equal(got[15].profile.status,"Suspended");
  assert.equal(firestoreCalls,1,"complete collection should require one Firestore collection query");
  mode="paginated";
  assert.equal((await getCompleteSparksProfiles({serviceAccount:account})).length,30);
  mode="normal";
  const success=await runSparksProfileReconciliation();
  assert.equal(success.sourceCount,30);
  assert.equal(posted,1);
  mode="empty";
  await assert.rejects(runSparksProfileReconciliation(),e=>e.code==="FIREBASE_SOURCE_INCOMPLETE");
  assert.equal(posted,1,"partial source must not be posted");
  mode="duplicates";
  await assert.rejects(runSparksProfileReconciliation(),e=>e.code==="DUPLICATE_FIREBASE_PROFILE");
  assert.equal(posted,1);
  mode="quota";
  await assert.rejects(runSparksProfileReconciliation(),e=>e.code==="FIREBASE_QUOTA_EXCEEDED");
  assert.equal(posted,1,"quota outage must not overwrite last reconciled roster");
  mode="normal";
  process.env.SPARKS_PROFILE_SYNC_ENABLED="0";
  const noOp=await runSparksProfileReconciliation();
  assert.equal(noOp.skipped,true);
  assert.equal(posted,1);
  const fake=(headers,method="GET")=>{
    let code=0,data={};
    const resObj={setHeader(){},status(s){code=s;return this},json(x){data=x;return x}};
    return Promise.resolve(cron({method,headers},resObj)).then(()=>({code,data}));
  };
  assert.equal((await fake({})).code,401);
  assert.equal((await fake({authorization:"Bearer "+process.env.CRON_SECRET},"POST")).code,405);
  const authorized=await fake({authorization:"Bearer "+process.env.CRON_SECRET});
  assert.equal(authorized.code,200);
  assert.equal(authorized.data.code,"PROFILE_SYNC_DISABLED");
  console.log("PASS Sparks profile reconcile: complete 30-profile low-read snapshot, suspended flag, no credentials, quota/partial/duplicate fails closed, cron auth and disabled-by-default gate");
}finally{
  globalThis.fetch=previous;
  for(const [key,value] of Object.entries(originals))if(value===undefined)delete process.env[key];else process.env[key]=value;
}
