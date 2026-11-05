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
const root="qa_sparks_wallets/suphitcha";
const redemptionId="redeem-testing-uuid-12345678901234";
const activationId="typing-relief-use-"+"a".repeat(40);
const deductionId="admin-deduct-test-20261105-123456";
const correctionId="admin-correction-suphitcha-typing-test-20261105";
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
push("qa_user_profiles/Suphitcha",{username:"Suphitcha",role:"Senior",status:"Active"});
const originalWallet={
  username:"suphitcha",balance:200,totalEarned:500,totalSpent:300,
  memberYear:2026,memberYearEarned:500,
  firstLogin:{amount:500,cardId:"peach",cardName:"Peach Bliss",claimedAt:"2026-11-05T04:00:00Z"},
  rewardOrders:1,typingReliefOwned:0,typingReliefPurchased:1,typingReliefUsed:1,
};
const firstLogin={
  createdAt:"2026-11-05T04:00:00Z",source:"first-login-reward",type:"earn",
  title:"First Login Reward",detail:"Peach Bliss",amount:500,balanceAfter:500,
};
const redemption={
  createdAt:"2026-11-05T08:37:00Z",source:"reward-redemption",type:"spend",
  rewardId:"typing-relief",title:"Typing Relief Redeemed",
  amount:-150,balanceAfter:350,performedBy:"suphitcha",status:"Completed",
};
const activation={
  createdAt:"2026-11-05T08:39:00Z",source:"reward-activation",type:"redeem",
  rewardId:"typing-relief",title:"Typing Relief Activated",amount:0,
  challengeId:"typing-test",originalWords:100,remainingWords:40,
  balanceAfter:350,performedBy:"suphitcha",status:"Completed",
};
const deduction={
  createdAt:"2026-11-05T08:43:00Z",source:"admin-deduct",type:"spend",
  title:"Admin Deducted Sparks",detail:"ทดสอบระบบ",reason:"ทดสอบระบบ",
  amount:-150,balanceAfter:200,performedBy:"songpon",status:"Completed",
};
push(root,originalWallet);
push(ledger+"first-login-welcome-v1",firstLogin);
push(ledger+redemptionId,redemption);
push(ledger+activationId,activation);
push(ledger+deductionId,deduction);

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
    assert.equal(writes.length,5,"wallet + 3 voided test records + correction audit must commit together");
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
const actionInput={targetUsername:"Suphitcha",redemptionHistoryId:redemptionId,
  activationHistoryId:activationId,deductionHistoryId:deductionId};
try{
  const initial=await call("history",{targetUsername:"Suphitcha"});
  assert.equal(initial.code,200,JSON.stringify(initial.body));
  assert.equal(initial.body.wallet.balance,200);
  assert.equal(initial.body.wallet.earned,500);
  assert.equal(initial.body.wallet.spent,300);
  assert.equal(initial.body.wallet.rewardOrders,1);
  assert.equal((await call("void-suphitcha-typing-test",actionInput,"Suphitcha")).code,403);
  assert.equal((await call("void-suphitcha-typing-test",{...actionInput,targetUsername:"Other"})).code,403);
  assert.equal((await call("void-suphitcha-typing-test",{...actionInput,activationHistoryId:"first-login-welcome-v1"})).code,400);
  assert.equal(commits,0);

  const fixed=await call("void-suphitcha-typing-test",actionInput);
  assert.equal(fixed.code,200,JSON.stringify(fixed.body));
  assert.equal(fixed.body.updated,true);
  assert.equal(fixed.body.balance,500);
  assert.equal(fixed.body.earned,500);
  assert.equal(fixed.body.spent,0);
  assert.equal(fixed.body.rewardOrders,0);
  assert.equal(commits,1);
  const wallet=docs.get(root);
  assert.equal(wallet.balance,500,"restore First Login 500 balance");
  assert.equal(wallet.totalEarned,500);
  assert.equal(wallet.totalSpent,0);
  assert.equal(wallet.memberYearEarned,500,"Member Level still based on 500 earned");
  assert.equal(wallet.rewardOrders,0);
  assert.equal(wallet.typingReliefOwned,0);
  assert.equal(wallet.typingReliefPurchased,0);
  assert.equal(wallet.typingReliefUsed,0);
  assert.deepEqual(wallet.firstLogin,originalWallet.firstLogin);
  for(const id of [redemptionId,activationId,deductionId]){
    const record=docs.get(ledger+id);
    assert.ok(record.voidedAt&&record.voidedBy==="songpon","audit record must remain and be marked voided");
    assert.equal(record.amount,id===redemptionId?-150:id===activationId?0:-150,"original ledger amount kept");
  }
  assert.equal(docs.get(ledger+correctionId).amount,0,"add zero-point audit");
  const correctedHistory=await call("history",{targetUsername:"Suphitcha"});
  assert.equal(correctedHistory.code,200);
  assert.equal(correctedHistory.body.wallet.balance,500);
  assert.equal(correctedHistory.body.wallet.earned,500);
  assert.equal(correctedHistory.body.wallet.spent,0);
  assert.equal(correctedHistory.body.wallet.rewardOrders,0);
  const voided=correctedHistory.body.history.filter(x=>x.status==="Voided");
  assert.equal(voided.length,3);
  assert.ok(voided.every(x=>x.amount===0));
  assert.equal(correctedHistory.body.history.find(x=>x.source==="first-login-reward").amount,500);
  const duplicate=await call("void-suphitcha-typing-test",actionInput);
  assert.equal(duplicate.code,200);
  assert.equal(duplicate.body.alreadyApplied,true);
  assert.equal(commits,1);
  console.log("PASS Suphitcha one-time correction: 200 balance, 500 earned, 300 spent, 1 reward → 500/500/0/0; audit retained");

  quota=true;
  const noService=await call("void-suphitcha-typing-test",actionInput);
  assert.equal(noService.code,429);
  assert.equal(commits,1);
  console.log("PASS restricted to Suphitcha, idempotent, exact three records, simulated quota safe");
}finally{
  globalThis.fetch=originalFetch;
  if(previousCredentials===undefined)delete process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
  else process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON=previousCredentials;
}
