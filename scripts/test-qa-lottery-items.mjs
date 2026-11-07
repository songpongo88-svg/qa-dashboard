import assert from "node:assert/strict";
import {createQaLotteryService,nextLotteryDraw} from "../server/qaLotteryService.js";
const docs=new Map();const me="tester";const wp="qa_sparks_wallets/"+me;
docs.set(wp,{username:me,balance:500,totalSpent:0});
const mocks={
 firestoreRequest:async(endpoint,method,body)=>{
  if(endpoint===":beginTransaction")return {transaction:"mock"};
  if(endpoint===":rollback")return {};
  if(endpoint===":commit"){
   for(const w of body.writes)if(w.kind==="create"&&docs.has(w.path))throw Error("duplicate");
   for(const w of body.writes)docs.set(w.path,{...(docs.get(w.path)||{}),...w.data});
   return {};
  }
  throw Error("Unexpected "+endpoint);
 },
 readDoc:async p=>docs.has(p)?{fields:docs.get(p)}:null,
 listCollection:async p=>({documents:[...docs.entries()].filter(([k])=>k.startsWith(p+"/")).map(([,fields])=>({fields})),truncated:false}),
 recordValue:doc=>doc?.fields||{},
 path:(...a)=>a.join("/"),updateWrite:(path,data)=>({kind:"update",path,data}),createWrite:(path,data)=>({kind:"create",path,data}),
 walletDocumentPath:u=>"qa_sparks_wallets/"+u,currentMemberYear:()=>2026,
 annualEarnedFromWallet:w=>w.memberYearEarned||0,spendableBalance:w=>w.balance||0
};
const service=createQaLotteryService(mocks);
const actor={username:me,displayName:"Tester"};
const draw=nextLotteryDraw();
const ticketId="lotteryticketuser2026-001";
const purchased=await service.purchase({number:"001234",drawDate:draw,requestId:ticketId},actor);
assert.equal(purchased.balance,380);
assert.equal((await service.listTickets(actor)).tickets.length,1);
const tickets=(await service.listTickets(actor)).tickets;
assert.equal(tickets[0].number,"001234","leading zeros survive");
assert.equal(tickets[0].drawDate,draw);
assert.equal(tickets[0].status,"pending");
assert.equal(docs.get(wp).balance,380);
assert.equal(docs.get(wp).totalSpent,120);
const duplicate=await service.purchase({number:"001234",drawDate:draw,requestId:ticketId},actor);
assert.equal(duplicate.alreadyPurchased,true);
assert.equal(docs.get(wp).balance,380,"idempotent purchase never double charges");
console.log("PASS Lottery: every purchase yields a numbered My Items ticket, maintains leading zeros and never double-deducts Sparks");
