// This regression test intentionally exercises the original Firebase implementation
// even when the Vercel branch deployment is configured for Supabase read-only preview.
process.env.SPARKS_DATA_BACKEND = "firebase";
process.env.SPARKS_CLOUD_READ_ONLY = "0";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import handler from "../api/sparks-admin.js";

// This test uses an in-memory Firestore emulator with fabricated credentials.
// No production Firebase records, profiles, or session tokens are accessed.
const originalFetch = globalThis.fetch;
const previousCredentials = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type:"pkcs8",format:"pem" },
  publicKeyEncoding: { type:"spki",format:"pem" },
});
process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON = JSON.stringify({
  client_email:"admin-qa-unit@example.test",private_key:privateKey,project_id:"qa-dashboard-b0b5d",
});

const prefix="projects/qa-dashboard-b0b5d/databases/(default)/documents/";
const root="qa_sparks_wallets/chachiya";
const addId="admin-credit-test-20261105-123456";
const deductId="admin-deduct-test-20261105-123456";
const correctionId="admin-correction-chachiya-void-99800-nov2026";
const ledger=root+"/history/";
const docs=new Map();
const vers=new Map();
const nowISO=new Date().toISOString();
const expire=new Date(Date.now()+60*60*1000).toISOString();
function push(path,fields){docs.set(path,structuredClone(fields));vers.set(path,(vers.get(path)||0)+1);}
push("qa_user_sessions/songpon-correction-test-session-1234",{
  username:"Songpon",role:"Quality Assurance",status:"active",
  policyVersion:"qa-session-policy-2026-07-15-v1",
  displayName:"Sparks Admin",createdAt:nowISO,expiresAt:expire,
});
push("qa_user_profiles/Songpon",{username:"Songpon",role:"Quality Assurance",status:"Active"});
push("qa_user_profiles/Chachiya",{username:"Chachiya",role:"Admin Live Chat",status:"Active"});
const originalWallet={
  username:"chachiya",balance:150,totalEarned:99950,totalSpent:99800,
  memberYear:2026,memberYearEarned:99950,
  firstLogin:{amount:150,cardId:"peach",cardName:"Peach Bliss",claimedAt:"2026-11-05T04:00:00Z"},
  rewardOrders:0,typingReliefOwned:0,
};
const firstLogin={
  createdAt:"2026-11-05T04:00:00Z",source:"first-login-reward",type:"earn",
  title:"First Login Reward",detail:"Peach Bliss",amount:150,balanceAfter:150,
};
const grant={
  createdAt:"2026-11-05T08:10:00Z",source:"admin-add",type:"earn",
  title:"Admin Added Sparks",detail:"ทดลองระบบ",reason:"ทดลองระบบ",
  amount:99800,balanceAfter:99950,performedBy:"songpon",status:"Completed",
};
const deduction={
  createdAt:"2026-11-05T08:14:00Z",source:"admin-deduct",type:"spend",
  title:"Admin Deducted Sparks",detail:"ทดลองระบบ",reason:"ทดลองระบบ",
  amount:-99800,balanceAfter:150,performedBy:"songpon",status:"Completed",
};
push(root,originalWallet);
push(ledger+"first-login-welcome-v1",firstLogin);
push(ledger+addId,grant);
push(ledger+deductId,deduction);

const encode=(v)=>{
  if(v===undefined||v===null)return {nullValue:"NULL_VALUE"};
  if(typeof v==="string")return {stringValue:v};
  if(typeof v==="boolean")return {booleanValue:v};
  if(typeof v==="number")return {integerValue:String(v)};
  if(Array.isArray(v))return {arrayValue:{values:v.map(encode)}};
  return {mapValue:{fields:Object.fromEntries(Object.entries(v).map(([key,val])=>[key,encode(val)]))}};
};
function decode(v){
  if(!v||"nullValue" in v)return null;
  if("stringValue" in v)return v.stringValue;
  if("integerValue" in v)return Number(v.integerValue);
  if("booleanValue" in v)return v.booleanValue;
  if("arrayValue" in v)return (v.arrayValue.values||[]).map(decode);
  if("mapValue" in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([key,val])=>[key,decode(val)]));
  return null;
}
const stamp=(path)=>`2026-11-05T${String(vers.get(path)||1).padStart(2,"0")}:00:00Z`;
const doc=(path)=>({
  name:prefix+path,
  fields:Object.fromEntries(Object.entries(docs.get(path)).map(([key,val])=>[key,encode(val)])),
  updateTime:stamp(path),
});
const response=(body,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{"content-type":"application/json"},
});
let commits=0,quota=false;
globalThis.fetch=async(input,opts={})=>{
  const url=String(input);
  if(url==="https://oauth2.googleapis.com/token")return response({access_token:"local-test-token",expires_in:3600});
  assert.ok(url.startsWith("https://firestore.googleapis.com/v1/"+prefix.slice(0,-1)),
    "must access only the configured Firestore project");
  if(quota)return response({error:{status:"RESOURCE_EXHAUSTED",message:"quota exceeded"}},429);
  if(url.endsWith(":beginTransaction"))return response({transaction:"offline-test-transaction"});
  if(url.endsWith(":commit")){
    const {writes}=JSON.parse(opts.body);
    assert.equal(writes.length,4,"wallet + two voided histories + correction audit must commit together");
    for(const write of writes){
      const path=decodeURIComponent(write.update.name.split("/documents/")[1]);
      if(write.currentDocument?.exists===false&&docs.has(path))return response({error:{status:"FAILED_PRECONDITION"}},412);
      if(write.currentDocument?.updateTime&&write.currentDocument.updateTime!==stamp(path))return response({error:{status:"FAILED_PRECONDITION"}},412);
    }
    for(const write of writes){
      const path=decodeURIComponent(write.update.name.split("/documents/")[1]);
      const fields=Object.fromEntries(Object.entries(write.update.fields).map(([key,val])=>[key,decode(val)]));
      const old={...(docs.get(path)||{})};
      const mask=write.updateMask?.fieldPaths||Object.keys(fields);
      for(const field of mask)old[field]=fields[field];
      push(path,old);
    }
    commits++;
    return response({writeResults:writes.map(()=>({}))});
  }
  const path=decodeURIComponent(new URL(url).pathname.split("/documents/")[1]||"");
  if(path.endsWith("/history")&&url.includes("?")){
    return response({documents:[...docs.keys()].filter(k=>k.startsWith(ledger)).map(doc)});
  }
  if(!docs.has(path))return response({error:{status:"NOT_FOUND"}},404);
  return response(doc(path));
};
const call=async(action,body={},actor="Songpon")=>{
  let code=0,bodyOut;
  const res={setHeader(){},status(n){code=n;return this;},json(v){bodyOut=v;return v;}};
  await handler({method:"POST",body:{
    action,actorUsername:actor,sessionId:"songpon-correction-test-session-1234",...body,
  }},res);
  return {code,body:bodyOut};
};
const actionInput={targetUsername:"Chachiya",addHistoryId:addId,deductHistoryId:deductId};
try{
  const initial=await call("history",{targetUsername:"Chachiya"});
  assert.equal(initial.code,200,JSON.stringify(initial.body));
  assert.equal(initial.body.wallet.balance,150);
  assert.equal(initial.body.wallet.earned,99950);
  assert.equal(initial.body.wallet.spent,99800);
  assert.equal((await call("void-chachiya-test-pair",actionInput,"Chachiya")).code,403,"normal member may not void entries");
  assert.equal((await call("void-chachiya-test-pair",{...actionInput,targetUsername:"Other"})).code,403,"never allow unrelated targets");
  assert.equal((await call("void-chachiya-test-pair",{...actionInput,deductHistoryId:"first-login-welcome-v1"})).code,400,"invalid source IDs must fail");
  assert.equal(commits,0);

  const fixed=await call("void-chachiya-test-pair",actionInput);
  assert.equal(fixed.code,200,JSON.stringify(fixed.body));
  assert.equal(fixed.body.updated,true);
  assert.equal(fixed.body.balance,150);
  assert.equal(fixed.body.earned,150);
  assert.equal(fixed.body.spent,0);
  assert.equal(commits,1);
  const wallet=docs.get(root);
  assert.equal(wallet.balance,150,"preserve legitimate First Login reward");
  assert.equal(wallet.totalEarned,150);
  assert.equal(wallet.totalSpent,0);
  assert.equal(wallet.memberYearEarned,150,"Member Level must not include voided test credits");
  assert.deepEqual(wallet.firstLogin,originalWallet.firstLogin);
  for(const id of [addId,deductId]){
    const record=docs.get(ledger+id);
    assert.ok(record.voidedAt&&record.voidedBy==="songpon","audit record must remain and be marked voided");
    assert.equal(record.amount,id===addId?99800:-99800,"original ledger event must never be erased");
  }
  assert.equal(docs.get(ledger+correctionId).amount,0,"create immutable zero-point correction audit");
  const correctedHistory=await call("history",{targetUsername:"Chachiya"});
  assert.equal(correctedHistory.code,200);
  assert.equal(correctedHistory.body.wallet.balance,150);
  assert.equal(correctedHistory.body.wallet.earned,150);
  assert.equal(correctedHistory.body.wallet.spent,0);
  const voided=correctedHistory.body.history.filter(x=>x.status==="Voided");
  assert.equal(voided.length,2);
  assert.ok(voided.every(x=>x.amount===0));
  assert.ok(voided.map(x=>x.originalAmount).includes(99800));
  assert.ok(voided.map(x=>x.originalAmount).includes(-99800));
  assert.equal(correctedHistory.body.history.find(x=>x.source==="first-login-reward").amount,150);
  const duplicate=await call("void-chachiya-test-pair",actionInput);
  assert.equal(duplicate.code,200);
  assert.equal(duplicate.body.alreadyApplied,true);
  assert.equal(commits,1,"repeating correction must never rewrite ledger");
  console.log("PASS one-time audited correction: Chachiya 150 / 99,950 / 99,800 → 150 / 150 / 0, history retained, idempotent");

  quota=true;
  const noService=await call("void-chachiya-test-pair",actionInput);
  assert.equal(noService.code,429);
  assert.equal(commits,1);
  console.log("PASS unauthorized account blocked, same-account-only matching, quota and Firestore transaction protections");
}finally{
  globalThis.fetch=originalFetch;
  if(previousCredentials===undefined)delete process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
  else process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON=previousCredentials;
}
