import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import handler from "../api/sparks-admin.js";
const RealDate=globalThis.Date,oldFetch=globalThis.fetch,oldCred=process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
let clock="2026-11-05T03:00:00.000Z";
class MockDate extends RealDate{
 constructor(...args){super(...(args.length?args:[clock]));}
 static now(){return new RealDate(clock).getTime();}
}
globalThis.Date=MockDate;
const agentSession="agent-2026-nov-quest-session-123456";
const adminSession="admin-2026-nov-payout-session-123456";
const {privateKey}=generateKeyPairSync("rsa",{modulusLength:2048,
 privateKeyEncoding:{type:"pkcs8",format:"pem"},publicKeyEncoding:{type:"spki",format:"pem"}});
process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON=JSON.stringify({
 client_email:"sparks-offline@example.test",private_key:privateKey,project_id:"qa-dashboard-b0b5d",
});
const docs=new Map(),revisions=new Map();
const walletKey="qa_sparks_wallets/agent";
const historyRoot="qa_sparks_wallets/agent/history/";
const profilePhoto="qa_user_profile_photos/Agent";
const fakePhoto="data:image/png;base64,AAAA";
const set=(key,value)=>{docs.set(key,structuredClone(value));revisions.set(key,(revisions.get(key)||0)+1);};
const get=key=>docs.get(key);
set("qa_user_sessions/"+agentSession,{
 username:"Agent",displayName:"Test Agent",role:"Admin Live Chat",status:"active",
 createdAt:"2026-11-01T00:00:00Z",expiresAt:"2027-01-01T00:00:00Z",
});
set("qa_user_sessions/"+adminSession,{
 username:"Songpon",displayName:"Sparks Admin",role:"Quality Assurance",status:"active",
 policyVersion:"qa-session-policy-2026-07-15-v1",createdAt:"2026-11-01T00:00:00Z",expiresAt:"2027-01-01T00:00:00Z",
});
set("qa_user_profiles/Agent",{username:"Agent",role:"Admin Live Chat",status:"Active"});
set("qa_user_profiles/Songpon",{username:"Songpon",role:"Quality Assurance",status:"Active"});
set(walletKey,{username:"Agent",balance:14000,totalEarned:14000,totalSpent:0,memberYear:2026,memberYearEarned:14000});
const encode=value=>{
 if(value==null)return {nullValue:"NULL_VALUE"};
 if(typeof value==="string")return {stringValue:value};
 if(typeof value==="number")return {integerValue:String(value)};
 if(typeof value==="boolean")return {booleanValue:value};
 if(Array.isArray(value))return {arrayValue:{values:value.map(encode)}};
 return {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]))}};
};
const decode=value=>{
 if(!value||"nullValue" in value)return null;
 if("stringValue" in value)return value.stringValue;
 if("integerValue" in value)return Number(value.integerValue);
 if("booleanValue" in value)return value.booleanValue;
 if("arrayValue" in value)return (value.arrayValue.values||[]).map(decode);
 if("mapValue" in value)return Object.fromEntries(Object.entries(value.mapValue.fields||{}).map(([k,v])=>[k,decode(v)]));
 return null;
};
const stamp=key=>"2026-11-"+String(revisions.get(key)||1).padStart(2,"0")+"T12:00:00Z";
const asDoc=(key,value)=>({name:"projects/qa-dashboard-b0b5d/databases/(default)/documents/"+key,
 fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)])),updateTime:stamp(key)});
const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
let commits=0;
globalThis.fetch=async(input,options={})=>{
 const url=String(input);
 if(url==="https://oauth2.googleapis.com/token")return respond({access_token:"test-token",expires_in:3600});
 if(url.endsWith(":beginTransaction"))return respond({transaction:"test-tx"});
 if(url.endsWith(":commit")){
  const writes=JSON.parse(options.body).writes;
  // Transaction commit is atomic: preconditions validate before any writes.
  for(const w of writes){
   const key=decodeURIComponent(w.update.name.split("/documents/")[1]);
   if(w.currentDocument?.exists===false&&docs.has(key))return respond({error:{status:"FAILED_PRECONDITION"}},412);
   if(w.currentDocument?.updateTime&&w.currentDocument.updateTime!==stamp(key))return respond({error:{status:"FAILED_PRECONDITION"}},412);
  }
  for(const w of writes){
   const key=decodeURIComponent(w.update.name.split("/documents/")[1]);
   const updated=Object.fromEntries(Object.entries(w.update.fields).map(([name,v])=>[name,decode(v)]));
   const existing={...(get(key)||{})};
   for(const field of w.updateMask?.fieldPaths||Object.keys(updated))existing[field]=updated[field];
   set(key,existing);
  }
  commits++;
  return respond({writeResults:writes.map(()=>({}))});
 }
 assert.ok(url.includes("qa-dashboard-b0b5d"),"must never access another Firebase project");
 const decoded=decodeURIComponent(new URL(url).pathname.split("/documents/")[1]||"");
 if(decoded==="qa_sparks_true_money_requests"&&url.includes("?")){
  return respond({documents:[...docs.entries()].filter(([k])=>k.startsWith("qa_sparks_true_money_requests/"))
   .map(([k,v])=>asDoc(k,v))});
 }
 return docs.has(decoded)?respond(asDoc(decoded,get(decoded))):respond({error:{status:"NOT_FOUND"}},404);
};
const req=async(action,extra={},admin=false,username)=>{
 let code=0,body;
 const res={setHeader(){},status(x){code=x;return this;},json(x){body=x;return x;}};
 await handler({method:"POST",body:{
  action,actorUsername:username||(admin?"Songpon":"Agent"),sessionId:admin?adminSession:agentSession,...extra,
 }},res);
 return {code,body};
};
const setClock=iso=>{clock=iso;};
try{
 let r=await req("claim-profile-makeover");
 assert.equal(r.code,409,"default picture gets no quest credit");
 assert.equal(get(walletKey).balance,14000);
 set(profilePhoto,{username:"Agent",photoDataUrl:fakePhoto,updatedAt:"2026-10-20T10:00:00Z"});
 r=await req("claim-profile-makeover");
 assert.equal(r.code,200,JSON.stringify(r.body));
 assert.equal(r.body.updated,true);
 assert.equal(get(walletKey).balance,14150);
 assert.equal(get(walletKey).memberYearEarned,14150);
 const originalCommits=commits;
 r=await req("claim-profile-makeover");
 assert.equal(r.code,200);
 assert.equal(r.body.alreadyClaimed,true);
 assert.equal(commits,originalCommits);
 assert.equal([...docs.values()].filter(x=>x.source==="quest-profile-makeover").length,1);
 assert.equal((await req("claim-profile-makeover",{} ,false,"Other")).code,403);
 console.log("PASS Profile Makeover: stored pre-existing photo awards 150 exactly once, default and impersonated denied");

 const idA="tm-20261105-test-purchase-123456";
 const idB="tm-20261106-test-purchase-123456";
 r=await req("redeem-truemoney",{requestId:idA.slice(3)});
 assert.equal(r.code,200,JSON.stringify(r.body));
 assert.equal(r.body.item.itemId,idA);
 assert.equal(get(walletKey).balance,7150);
 assert.equal(get(walletKey).totalSpent,7000);
 assert.equal(get(walletKey).rewardOrders,1);
 assert.equal((await req("redeem-truemoney",{requestId:idA.slice(3)})).body.alreadyApplied,true);
 setClock("2026-11-06T03:00:00.000Z");
 r=await req("redeem-truemoney",{requestId:idB.slice(3)});
 assert.equal(r.code,200,JSON.stringify(r.body));
 assert.equal(get(walletKey).balance,150);
 assert.equal(get(walletKey).trueMoneyItems.length,2);
 assert.notEqual(get(walletKey).trueMoneyItems[0].expiresAt,get(walletKey).trueMoneyItems[1].expiresAt);
 assert.equal(get(walletKey).trueMoneyItems[0].expiresAt,"2026-12-05T03:00:00.000Z");
 assert.equal(get(walletKey).trueMoneyItems[1].expiresAt,"2026-12-06T03:00:00.000Z");
 assert.equal((await req("redeem-truemoney",{requestId:"20261107-new-purchase-123456"})).code,400);
 console.log("PASS TrueMoney: 7,000 Sparks per Item, independent 30-day expiry, no duplicate charge");

 assert.equal((await req("use-truemoney-item",{itemId:idA,phone:"123"})).code,400);
 r=await req("use-truemoney-item",{itemId:idA,phone:"0812345678"});
 assert.equal(r.code,200,JSON.stringify(r.body));
 assert.equal(r.body.status,"pending");
 assert.equal(r.body.dueDate,"2026-11-26"); // 14 Mon–Fri days after Friday Nov 6
 assert.equal(get(walletKey).trueMoneyItems[0].status,"requested");
 assert.equal(get(walletKey).balance,150);
 assert.equal((await req("use-truemoney-item",{itemId:idA,phone:"0812345678"})).body.alreadyApplied,true);
 r=await req("list-my-truemoney");
 assert.equal(r.code,200);
 assert.equal(r.body.items.length,2);
 assert.equal(r.body.requests.length,1);
 assert.equal(r.body.requests[0].phoneMasked,"******5678");
 assert.equal(r.body.requests[0].dueDate,"2026-11-26");
 assert.ok(!JSON.stringify(r.body).includes("0812345678"),"member listing must mask receiving number");
 const tracker=await req("list-truemoney-tracker",{},true);
 assert.equal(tracker.code,200,JSON.stringify(tracker.body));
 assert.equal(tracker.body.requests.length,1);
 assert.equal(tracker.body.requests[0].phone,"0812345678");
 assert.equal((await req("mark-truemoney-paid",{itemId:idA})).code,403,"members cannot mark paid");
 r=await req("mark-truemoney-paid",{itemId:idA},true);
 assert.equal(r.code,200,JSON.stringify(r.body));
 assert.equal(r.body.status,"paid");
 assert.equal((await req("mark-truemoney-paid",{itemId:idA},true)).body.alreadyApplied,true);
 assert.equal((await req("list-my-truemoney")).body.requests[0].status,"paid");
 console.log("PASS TrueMoney: use once, validate phone, 14 business days, Admin-only payout confirmation, masked user display");

 setClock("2026-12-07T04:00:00.000Z");
 assert.equal((await req("use-truemoney-item",{itemId:idB,phone:"0812345678"})).code,400);
 assert.equal((await req("claim-profile-makeover")).body.alreadyClaimed,true);
 setClock("2026-12-16T04:00:00.000Z");
 assert.equal((await req("claim-profile-makeover")).code,400,"quest closes Dec 15 Thai time");
 console.log("PASS expiration, once-only reward and Quest closure");
}finally{
 globalThis.Date=RealDate;globalThis.fetch=oldFetch;
 if(oldCred===undefined)delete process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
 else process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON=oldCred;
}
