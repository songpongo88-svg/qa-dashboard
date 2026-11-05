import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import handler from "../api/sparks-admin.js";

const originalFetch=globalThis.fetch,OriginalDate=globalThis.Date;
const previousCredentials=process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
const {privateKey}=generateKeyPairSync("rsa",{modulusLength:2048,
 privateKeyEncoding:{type:"pkcs8",format:"pem"},publicKeyEncoding:{type:"spki",format:"pem"}});
process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON=JSON.stringify({
 client_email:"qa-test@example.test",project_id:"qa-dashboard-b0b5d",private_key:privateKey});
let fakeTime="2026-11-05T06:00:00.000Z";
class FixedDate extends OriginalDate{constructor(...args){super(...(args.length?args:[fakeTime]))}
 static now(){return new OriginalDate(fakeTime).getTime()}}
globalThis.Date=FixedDate;
const docs=new Map(),versions=new Map(),root="qa_sparks_wallets/agent";
const put=(key,value)=>{docs.set(key,structuredClone(value));versions.set(key,(versions.get(key)||0)+1)};
const stamp=(key)=>new OriginalDate("2026-11-01T00:00:00Z").getTime()+versions.get(key)*1000;
const now="2026-11-05T05:00:00.000Z";
put("qa_user_sessions/agent-test-session-1234567",{username:"Agent",role:"Admin Live Chat",status:"active",createdAt:now,expiresAt:"2026-12-30T00:00:00Z"});
put("qa_user_profiles/Agent",{username:"Agent",role:"Admin Live Chat",status:"Active"});
put("qa_user_sessions/admin-test-session-1234567",{username:"Songpon",displayName:"QA Admin",role:"Quality Assurance",status:"active",createdAt:now,expiresAt:"2026-12-30T00:00:00Z",policyVersion:"qa-session-policy-2026-07-15-v1"});
put("qa_user_profiles/Songpon",{username:"Songpon",role:"Quality Assurance",status:"Active"});
put(root,{username:"agent",balance:200,totalEarned:200,memberYear:2026,memberYearEarned:200,firstLogin:{amount:200,claimedAt:now}});
const encode=(v)=>{
 if(v==null)return {nullValue:"NULL_VALUE"};
 if(typeof v==="number")return {integerValue:String(v)};
 if(typeof v==="string")return {stringValue:v};
 if(typeof v==="boolean")return {booleanValue:v};
 if(Array.isArray(v))return {arrayValue:{values:v.map(encode)}};
 return {mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]))}}
};
const decode=(x)=>{
 if(x==null||"nullValue" in x)return null;
 if("integerValue" in x)return Number(x.integerValue);
 if("stringValue" in x)return x.stringValue;
 if("booleanValue" in x)return x.booleanValue;
 if("arrayValue" in x)return (x.arrayValue.values||[]).map(decode);
 if("mapValue" in x)return Object.fromEntries(Object.entries(x.mapValue.fields||{}).map(([k,v])=>[k,decode(v)]));
 return null;
};
const prefix="projects/qa-dashboard-b0b5d/databases/(default)/documents/";
const snap=(key)=>{
 const o=docs.get(key);
 return {name:prefix+key,fields:Object.fromEntries(Object.entries(o).map(([k,v])=>[k,encode(v)])),
  updateTime:new OriginalDate(stamp(key)).toISOString()}
};
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json"}});
let commitCount=0,quota=false;
globalThis.fetch=async(url,options={})=>{
 const u=String(url);
 if(u==="https://oauth2.googleapis.com/token")return response({access_token:"test-service-token",expires_in:3600});
 assert.ok(u.startsWith("https://firestore.googleapis.com/v1/"+prefix.slice(0,-1)),u);
 if(quota)return response({error:{status:"RESOURCE_EXHAUSTED"}},429);
 if(u.endsWith(":beginTransaction"))return response({transaction:"qa-test-transaction"});
 if(u.endsWith(":commit")){
  const writes=JSON.parse(options.body).writes;
  for(const w of writes){
   const key=decodeURIComponent(w.update.name.split("/documents/")[1]);
   if(w.currentDocument?.exists===false&&docs.has(key))return response({error:{status:"FAILED_PRECONDITION"}},412);
   if(w.currentDocument?.updateTime&&(docs.has(key)?snap(key).updateTime:null)!==w.currentDocument.updateTime)
    return response({error:{status:"FAILED_PRECONDITION"}},412);
  }
  for(const w of writes){
   const key=decodeURIComponent(w.update.name.split("/documents/")[1]);
   const next={...(docs.get(key)||{})};
   const fields=Object.fromEntries(Object.entries(w.update.fields).map(([k,v])=>[k,decode(v)]));
   for(const field of w.updateMask?.fieldPaths||Object.keys(fields))next[field]=fields[field];
   put(key,next);
  }
  commitCount++;
  return response({writeResults:writes.map(()=>({}))});
 }
 const urlObject=new URL(u),key=decodeURIComponent(urlObject.pathname.split("/documents/")[1]||"");
 if(urlObject.searchParams.has("pageSize")){
  const items=[...docs.keys()].filter(k=>k.startsWith(key+"/")&&!k.slice(key.length+1).includes("/")).map(snap);
  return response({documents:items});
 }
 return docs.has(key)?response(snap(key)):response({error:{status:"NOT_FOUND"}},404);
};
async function call(action,extra={},actor="Agent",sessionId="agent-test-session-1234567"){
 let status=0,result;
 const res={setHeader(){},status(code){status=code;return this},json(v){result=v;return v}};
 await handler({method:"POST",body:{action,actorUsername:actor,sessionId,...extra}},res);
 return {status,result};
}
const uuid="valid-test-redemption-uuid-12345";
const itemId="tm20-"+uuid;
try{
 let r=await call("claim-profile-makeover");
 assert.equal(r.status,200,JSON.stringify(r.result));
 assert.equal(r.result.eligible,false,"default photo receives no bonus");
 assert.equal(docs.get(root).balance,200);
 put("qa_user_profile_photos/Agent",{username:"Agent",photoDataUrl:"data:image/png;base64,"+"A".repeat(256),
  updatedAt:now,updatedBy:"Agent"});
 r=await call("claim-profile-makeover");
 assert.equal(r.status,200,JSON.stringify(r.result));
 assert.equal(r.result.credited,true);
 assert.equal(r.result.alreadyApplied,false);
 assert.equal(docs.get(root).balance,350);
 assert.equal(docs.get(root).memberYearEarned,350);
 const originalCommits=commitCount;
 r=await call("claim-profile-makeover");
 assert.equal(r.result.alreadyApplied,true);
 assert.equal(commitCount,originalCommits,"profile Quest can only be awarded once");
 r=await call("claim-profile-makeover",{},"Evil");
 assert.equal(r.status,403,"session spoof must not authorize grant");
 assert.equal(docs.get(root).balance,350);
 // A 7,000 Sparks redemption creates one item and one 30-day expiry.
 put(root,{...docs.get(root),balance:8000,totalEarned:8000,memberYear:2026,memberYearEarned:8000});
 r=await call("redeem-truemoney",{requestId:uuid});
 assert.equal(r.status,200,JSON.stringify(r.result));
 assert.equal(docs.get(root).balance,1000);
 assert.equal(docs.get(root).totalSpent,7000);
 assert.equal(docs.get(root).rewardOrders,1);
 assert.equal(r.result.item.id,itemId);
 assert.equal(r.result.item.status,"available");
 const expires=r.result.item.expiresAt;
 assert.equal(new OriginalDate(expires).getTime()-new OriginalDate(fakeTime).getTime(),30*86400000);
 const redemptionCommit=commitCount;
 r=await call("redeem-truemoney",{requestId:uuid});
 assert.equal(r.result.alreadyApplied,true);
 assert.equal(commitCount,redemptionCommit,"purchase idempotent");
 assert.equal((await call("redeem-truemoney",{requestId:"another-valid-uuid-1234567890"})).status,400,
  "insufficient points cannot purchase");
 const inventory=await call("list-truemoney-items");
 assert.equal(inventory.status,200);
 assert.equal(inventory.result.items.length,1);
 assert.equal(inventory.result.items[0].status,"available");
 assert.equal((await call("use-truemoney-item",{itemId,receivingPhone:"123"})).status,400,
  "10 digit phone format must be checked");
 r=await call("use-truemoney-item",{itemId,receivingPhone:"0812345678"});
 assert.equal(r.status,200,JSON.stringify(r.result));
 assert.equal(r.result.updated,true);
 assert.equal(r.result.item.status,"submitted");
 assert.equal(r.result.item.dueDate,"2026-11-25","Nov 5 + 14 weekdays must be Nov 25");
 assert.equal(docs.get(root).balance,1000,"using Item cannot deduct Sparks a second time");
 assert.equal(docs.get("qa_sparks_wallets/agent/items/"+itemId).status,"submitted");
 const requestKey="qa_sparks_redemption_requests/"+itemId;
 assert.ok(docs.get(requestKey).receivingPhoneEncrypted?.includes("."));
 assert.ok(!JSON.stringify(docs.get(requestKey)).includes("0812345678"),
  "phone should never be persisted in plain text");
 const afterRequest=commitCount;
 r=await call("use-truemoney-item",{itemId,receivingPhone:"0999999999"});
 assert.equal(r.result.alreadyApplied,true);
 assert.equal(commitCount,afterRequest);
 r=await call("list-truemoney-items");
 assert.equal(r.result.items[0].status,"submitted");
 assert.ok(!JSON.stringify(r.result).includes("0812345678"),"member inventory excludes phone");
 assert.equal((await call("list-truemoney-requests")).status,403,
  "member cannot open admin payout Tracker");
 r=await call("list-truemoney-requests",{},"Songpon","admin-test-session-1234567");
 assert.equal(r.status,200,JSON.stringify(r.result));
 assert.equal(r.result.requests[0].receivingPhone,"0812345678","admin may decrypt for real transfer");
 const payCommits=commitCount;
 r=await call("complete-truemoney-payout",{itemId},"Songpon","admin-test-session-1234567");
 assert.equal(r.status,200,JSON.stringify(r.result));assert.equal(r.result.updated,true);
 assert.equal(docs.get(requestKey).status,"paid");
 assert.equal(docs.get("qa_sparks_wallets/agent/items/"+itemId).status,"paid");
 assert.equal(commitCount,payCommits+1);
 r=await call("complete-truemoney-payout",{itemId},"Songpon","admin-test-session-1234567");
 assert.equal(r.result.alreadyApplied,true);
 assert.equal(commitCount,payCommits+1,"cannot mark paid twice");
 // New item remains independent; expired items cannot become payouts.
 put(root,{...docs.get(root),balance:8000});
 const uuid2="another-valid-uuid-1234567890";
 r=await call("redeem-truemoney",{requestId:uuid2});
 assert.equal(r.status,200);
 const otherId="tm20-"+uuid2;
 fakeTime="2026-12-12T06:00:00.000Z";
 assert.equal((await call("use-truemoney-item",{itemId:otherId,receivingPhone:"0812345678"})).status,400,
  "after 30 days item usage must reject");
 const later=await call("list-truemoney-items");
 assert.equal(later.result.items.find(x=>x.id===otherId).status,"expired");
 assert.equal((await call("claim-profile-makeover")).result.alreadyApplied,true);
 fakeTime="2026-12-16T06:00:00.000Z";
 assert.equal((await call("claim-profile-makeover")).result.expired,true);
 // Test hard annual cap: bonus must not exceed 200k.
 fakeTime="2026-11-05T06:00:00.000Z";
 docs.delete("qa_sparks_wallets/agent/history/quest-profile-makeover-2026");
 put(root,{...docs.get(root),balance:199900,memberYear:2026,memberYearEarned:199900,totalEarned:199900});
 r=await call("claim-profile-makeover");
 assert.equal(r.result.capReached,true);assert.equal(docs.get(root).balance,199900);
 console.log("PASS Profile Makeover: actual saved photo, automatic +150, existing photo, idempotency, expiry, annual cap");
 console.log("PASS TrueMoney: 7000-points item purchase, independent 30d expiry, 14 working-day due date, encrypted phone, admin-only payout, immutable history");
}finally{
 globalThis.fetch=originalFetch;globalThis.Date=OriginalDate;
 if(previousCredentials===undefined)delete process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
 else process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON=previousCredentials;
}
