import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import handler from "../api/sparks-admin.js";

// End-to-end handler test with an in-memory network fixture. It never contacts
// real Google Cloud, Vercel or Supabase and never changes user balances.
const {privateKey}=generateKeyPairSync("rsa",{modulusLength:2048,
  privateKeyEncoding:{type:"pkcs8",format:"pem"},publicKeyEncoding:{type:"spki",format:"pem"}});
const keys=["SPARKS_DATA_BACKEND","SPARKS_CLOUD_READ_ONLY","SPARKS_SUPABASE_BRIDGE_URL",
"SPARKS_SUPABASE_BRIDGE_TOKEN","FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON"];
const original=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
const originalFetch=globalThis.fetch;
process.env.SPARKS_DATA_BACKEND="supabase";
process.env.SPARKS_CLOUD_READ_ONLY="1";
process.env.SPARKS_SUPABASE_BRIDGE_URL="https://private-fixture.supabase.co/functions/v1/qa-sparks-runtime-preview";
process.env.SPARKS_SUPABASE_BRIDGE_TOKEN="only-mock-private-token-do-not-use-in-production-12345";
process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON=JSON.stringify({
  client_email:"mock-firebase-admin@example.test",private_key:privateKey,project_id:"qa-dashboard-b0b5d"
});
const oldAt="2026-11-08T02:00:00Z";
const typed=(v)=>typeof v==="number"?{integerValue:String(v)}:{stringValue:String(v)};
const document=(path,data)=>({name:"projects/qa-dashboard-b0b5d/databases/(default)/documents/"+path,
 fields:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,typed(v)])),createTime:oldAt,updateTime:oldAt});
const requests=[];
let sessionMode="valid";
function reply(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json"}});}
globalThis.fetch=async(url,opts={})=>{
 const href=String(url);const parsed=opts.body?JSON.parse(opts.body):null;
 if(href==="https://oauth2.googleapis.com/token")return reply({access_token:"mock-google-token",expires_in:3600});
 if(href.startsWith("https://firestore.googleapis.com/v1/projects/qa-dashboard-b0b5d/databases/(default)/documents")){
  requests.push({backend:"firebase",url:href});
  if(href.includes("/qa_user_sessions/")){
   if(sessionMode==="expired")return reply(document("qa_user_sessions/mock-session",{
     username:"songpon",status:"active",expiresAt:"2020-01-01T00:00:00Z",createdAt:oldAt}));
   return reply(document("qa_user_sessions/mock-session",{
     username:sessionMode==="wrong-account"?"other":"songpon",status:"active",
     expiresAt:"2099-01-01T00:00:00Z",createdAt:oldAt}));
  }
  if(href.includes("/qa_user_session_controls/"))
    return reply({error:{status:"NOT_FOUND"}},404);
  throw new Error("Unexpected Firebase read: "+href);
 }
 if(href===process.env.SPARKS_SUPABASE_BRIDGE_URL){
  assert.equal(opts.headers["x-qa-sparks-server-secret"],process.env.SPARKS_SUPABASE_BRIDGE_TOKEN);
  requests.push({backend:"supabase",action:parsed?.action,path:parsed?.path||parsed?.collection});
  if(parsed.action==="get"){
   assert.equal(parsed.path,"qa_sparks_wallets/songpon");
   return reply(document(parsed.path,{username:"songpon",balance:4321,totalEarned:5000,totalSpent:679,
     memberYear:2026,memberYearEarned:5000,balanceYear:2026}));
  }
  if(parsed.action==="list"){
   assert.equal(parsed.collection,"qa_sparks_wallets/songpon/history");
   return reply({documents:[
     document("qa_sparks_wallets/songpon/history/a",{createdAt:"2026-11-06T00:00:00Z",amount:200,balanceAfter:4321}),
     document("qa_sparks_wallets/songpon/history/b",{createdAt:"2026-11-05T00:00:00Z",amount:-50,balanceAfter:4121}),
   ]});
  }
  throw new Error("Unexpected Supabase action: "+parsed.action);
 }
 throw new Error("Unexpected outbound URL "+href);
};
async function invoke(action,body={}) {
 const res={statusCode:200,response:null,
 setHeader(){return this;},status(v){this.statusCode=v;return this;},json(v){this.response=v;return this;}};
 await handler({method:"POST",url:"/api/sparks-admin",
 body:{action,actorUsername:"songpon",sessionId:"mock-session-1234567890",...body}},res);
 return res;
}
try{
 const ok=await invoke("sparks-cloud-wallet",{historyLimit:50});
 assert.equal(ok.statusCode,200,JSON.stringify(ok.response));
 assert.equal(ok.response.wallet.balance,4321);
 assert.equal(ok.response.history.length,2);
 assert.equal(ok.response.history[0].id,"a");
 assert.equal(requests.filter(x=>x.backend==="supabase").length,2);
 assert.equal(requests.filter(x=>x.backend==="firebase").length,2,"only authenticated QA session checks should read Firebase");
 requests.length=0;
 const forged=await invoke("sparks-cloud-wallet",{actorUsername:"other"});
 assert.equal(forged.statusCode,403,"an actor cannot read another account's wallet");
 assert.equal(requests.filter(x=>x.backend==="supabase").length,0);
 requests.length=0;sessionMode="expired";
 const expired=await invoke("sparks-cloud-wallet");
 assert.equal(expired.statusCode,403,"expired session must never see Supabase");
 assert.equal(requests.filter(x=>x.backend==="supabase").length,0);
 requests.length=0;sessionMode="valid";
 const forbidden=await invoke("sparks-cloud-first-login",{cardId:"apple",cardName:"Apple Spark",amount:1000});
 assert.equal(forbidden.statusCode,423);
 assert.equal(requests.length,0,"read-only preview must reject first-login award with no network call");
 console.log("PASS Cloud wallet: QA-session scoped Supabase 4321 Sparks and history; forged/expired sessions and credit blocked");
}finally{
 globalThis.fetch=originalFetch;
 for(const k of keys){if(original[k]===undefined)delete process.env[k];else process.env[k]=original[k];}
}
