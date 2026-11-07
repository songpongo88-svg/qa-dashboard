import assert from "node:assert/strict";
import {createQaRewardsService,SPECIAL_REWARDS} from "../server/qaRewardsService.js";
assert.deepEqual(SPECIAL_REWARDS.map(x=>x.price),[6500,15000,8000,20000]);
assert.deepEqual(SPECIAL_REWARDS.map(x=>x.maxTHB),[65,0,55,100]);
const db=new Map();
const p=(...parts)=>parts.join("/");
const wallet=u=>p("qa_sparks_wallets",u);
const docs={
 firestoreRequest:async(endpoint,method,body)=>{
  if(endpoint===":beginTransaction")return {transaction:"mock"};
  if(endpoint===":rollback")return {};
  if(endpoint===":commit"){
   for(const w of body.writes){
    if(w.kind==="create"&&db.has(w.path))throw Object.assign(Error("exists"),{firestoreStatus:"ALREADY_EXISTS"});
   }
   for(const w of body.writes){
    if(w.kind==="update")db.set(w.path,{...(db.get(w.path)||{}),...w.data});
    else db.set(w.path,w.data);
   }
   return {};
  }
  throw Error("Unexpected "+endpoint);
 },
 readDoc:async(path)=>db.has(path)?{fields:structuredClone(db.get(path))}:null,
 listCollection:async(path)=>({documents:[...db.entries()].filter(([name])=>name.startsWith(path+"/"))
   .map(([,data])=>({fields:structuredClone(data)})),truncated:false}),
 recordValue:doc=>doc?.fields||{},
 updateWrite:(path,data)=>({kind:"update",path,data}),
 createWrite:(path,data)=>({kind:"create",path,data}),
 walletDocumentPath:wallet,
 currentMemberYear:()=>2026,
 spendableBalance:w=>Number(w.balance)||0,
 annualEarnedFromWallet:w=>Number(w.memberYearEarned)||0,
 path:p,
 getAccessToken:async()=>{throw Error("Cloud Vision not available in offline test");}
};
for(const username of ["agent-a","agent-b"])db.set(wallet(username),{username,balance:100000,totalSpent:0,rewardOrders:0});
const service=createQaRewardsService(docs);
const agent=u=>({username:u,displayName:u});
const makeId=n=>"specialreqtest-"+String(n).padStart(12,"0");
const a=agent("agent-a"),b=agent("agent-b");
const first=await service.redeem({rewardId:"punthai-65",requestId:makeId(1)},a);
assert.equal(first.item.status,"unused");
assert.equal(first.balance,93500);
assert.equal(new Date(first.item.expiresAt).getTime()-new Date(first.item.redeemedAt).getTime(),30*86400000);
await assert.rejects(service.redeem({rewardId:"punthai-65",requestId:makeId(2)},a),/ครบ 1 สิทธิ์/);
const repeated=await service.redeem({rewardId:"punthai-65",requestId:makeId(1)},a);
assert.equal(repeated.alreadyApplied,true);
assert.equal(db.get(wallet("agent-a")).balance,93500);
const active=await service.activate({itemId:first.item.itemId},a);
assert.equal(active.item.status,"activated");
const number="PT202611070001",image=Buffer.alloc(3600,12);image[0]=0xff;image[1]=0xd8;
const imageData="data:image/jpeg;base64,"+image.toString("base64");
const receiptAt=new Date(Date.now()+1000).toISOString();
assert.equal((await service.receiptCheck({rewardId:"punthai-65",receiptNumber:number},a)).duplicate,false);
const request=await service.submit({itemId:first.item.itemId,receiptNumber:number,
 receiptAt,amountTHB:90,promptPay:"0812345678",imageData},a);
assert.equal(request.request.payoutTHB,65);
assert.equal(request.request.ocrStatus,"manual");
assert.equal(db.get(wallet("agent-a")).specialRewardItems[0].status,"submitted");
assert.equal((await service.receiptCheck({rewardId:"punthai-65",receiptNumber:number},a)).duplicate,true);
const second=await service.redeem({rewardId:"punthai-65",requestId:makeId(3)},b);
await service.activate({itemId:second.item.itemId},b);
await assert.rejects(service.submit({itemId:second.item.itemId,receiptNumber:number,receiptAt,
 amountTHB:40,promptPay:"0812345678",imageData},b),/เคยใช้ส่งคำขอแล้ว/);
const n=await service.redeem({rewardId:"netflix-1m",requestId:makeId(4)},a);
await service.activate({itemId:n.item.itemId},a);
await assert.rejects(service.submit({itemId:n.item.itemId,email:"new@example.com",neverPaid:false},a),/ต้องยืนยัน/);
const netflix=await service.submit({itemId:n.item.itemId,email:"new@example.com",neverPaid:true},a);
assert.equal(netflix.request.email,"new@example.com");
const admin={username:"songpon",displayName:"Admin"};
const list=await service.adminList();assert.equal(list.requests.length,2);
const approved=await service.adminAction({itemId:first.item.itemId,decision:"approve"},admin);
assert.equal(approved.status,"approved");
const paid=await service.adminAction({itemId:first.item.itemId,decision:"complete"},admin);
assert.equal(paid.status,"paid");
assert.equal((await service.adminAction({itemId:first.item.itemId,decision:"complete"},admin)).alreadyApplied,true);
assert.equal(db.get(wallet("agent-a")).balance,78500);
console.log("PASS 4 brand rewards: atomic Spark deduction, month cap, 30-day Item, receipt reuse lock, OCR manual fallback, Netflix attestation, Admin payout audit");
