import assert from "node:assert/strict";
import {createSparksTransferService} from "../server/sparksTransferService.js";
const data=new Map();
const wallet=name=>"qa_sparks_wallets/"+name;
data.set(wallet("alice"),{username:"alice",balance:1000,balanceYear:2026});
data.set(wallet("bob"),{username:"bob",balance:100,balanceYear:2026});
data.set(wallet("charlie"),{username:"charlie",balance:10,balanceYear:2026});
const profiles={alice:{username:"alice",status:"Active",displayName:"Alice"},bob:{username:"bob",status:"Active",displayName:"Bob"},charlie:{username:"charlie",status:"Suspended",displayName:"Charlie"}};
const db={
 path:(...args)=>args.join("/"),
 firestoreRequest:async(endpoint,method,body)=>{
  if(endpoint===":beginTransaction")return {transaction:"tx"};
  if(endpoint===":rollback")return {};
  if(endpoint===":commit"){
   for(const w of body.writes)if(w.mode==="create"&&data.has(w.key))throw Error("duplicate receipt");
   for(const w of body.writes)data.set(w.key,{...data.get(w.key),...w.value});
   return {};
  }
  throw Error("unknown request "+endpoint);
 },
 readDoc:async key=>data.has(key)?{name:key,fields:data.get(key)}:null,
 recordValue:doc=>doc?.fields||{},
 updateWrite:(key,value)=>({mode:"update",key,value}),
 createWrite:(key,value)=>({mode:"create",key,value}),
 walletDocumentPath:wallet,
 spendableBalance:v=>v.balance||0,
 currentMemberYear:()=>2026,
 findProfileByUsername:async name=>profiles[name]||null,
 isSuspendedProfile:v=>v.status==="Suspended",
 listCollection:async()=>{throw Error("transfer recipient lookup must not read Firestore profiles");},
 activeDirectory:async()=>[profiles.alice,profiles.bob],
};
const service=createSparksTransferService(db),actor={username:"alice",displayName:"Alice"};
const state=await service.readState(actor);assert.equal(state.balance,1000);assert.equal(state.remaining,500);
const list=await service.recipients(actor);assert.deepEqual(list.recipients.map(p=>p.username),["bob"],"only verified Active Supabase recipients are listed");
const tx1={recipientUsername:"bob",amount:300,requestId:"firstTransferCode123"};
let result=await service.transfer(tx1,actor);
assert.equal(result.balanceAfter,700);assert.equal(result.remaining,200);
assert.equal(data.get(wallet("bob")).balance,400);
assert.equal(data.get(wallet("bob")+"/history/peer-transfer-in-firstTransferCode123").amount,300);
assert.equal(data.get(wallet("alice")+"/history/peer-transfer-out-firstTransferCode123").amount,-300);
assert.equal((await service.transfer(tx1,actor)).alreadyApplied,true);
assert.equal(data.get(wallet("alice")).balance,700,"duplicate transfer does not debit twice");
await assert.rejects(service.transfer({recipientUsername:"bob",amount:201,requestId:"overLimitCode12345"},actor),/500/);
await assert.rejects(service.transfer({recipientUsername:"alice",amount:10,requestId:"selfTransferCode123"},actor),/ไม่ใช่บัญชีของตนเอง/);
await assert.rejects(service.transfer({recipientUsername:"charlie",amount:10,requestId:"suspendedUserCode123"},actor),/ไม่พร้อมรับ/);
await service.transfer({recipientUsername:"bob",amount:200,requestId:"secondTransferCode123"},actor);
assert.equal(data.get(wallet("alice")).balance,500);
assert.equal(data.get(wallet("bob")).balance,600);
assert.equal((await service.readState(actor)).remaining,0);
await assert.rejects(service.transfer({recipientUsername:"bob",amount:1,requestId:"thirdTransferCode123"},actor),/500/);
console.log("PASS Sparks P2P transfers: active users, own balance, sender monthly 500, atomic ledgers, duplicate-safe, suspended and self-transfer denial");
