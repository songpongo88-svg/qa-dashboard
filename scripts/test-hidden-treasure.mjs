import assert from "node:assert/strict";
import {createHiddenTreasureService} from "../server/hiddenTreasureService.js";
import {readFile} from "node:fs/promises";

const records=new Map(),versions=new Map();
const initial=Date.now();
let clock=initial,commitCount=0;
const realNow=Date.now;
Date.now=()=>clock;
try{
 const dayParts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 const part=k=>dayParts.find(x=>x.type===k)?.value;
 const day=part("year")+part("month")+part("day");
 const walletPath="qa_sparks_wallets/agent",dailyPath="qa_sparks_treasure_daily/agent-"+day,historyPath=walletPath+"/history/hidden-treasure-"+day;
 records.set(walletPath,{username:"agent",balance:100,totalEarned:100,memberYear:2026,memberYearEarned:100,balanceYear:2026});
 const snapshot=key=>records.has(key)?{data:structuredClone(records.get(key)),updateTime:String(versions.get(key)||0)}:null;
 const data={
  path:(...parts)=>parts.join("/"),
  readDoc:async(key)=>snapshot(key),
  recordValue:snap=>snap?.data||{},
  updateWrite:(key,value,original)=>({kind:"update",key,value,original}),
  createWrite:(key,value)=>({kind:"create",key,value}),
  walletDocumentPath:()=>walletPath,
  currentMemberYear:()=>2026,
  spendableBalance:wallet=>wallet.balance||0,
  annualEarnedFromWallet:wallet=>wallet.memberYearEarned||0,
  drawRandom:(...args)=>args.length===1?0:args[0],
  firestoreRequest:async(endpoint,method,body)=>{
   if(endpoint===":beginTransaction")return {transaction:"test"};
   if(endpoint===":rollback")return {};
   assert.equal(endpoint,":commit");
   for(const write of body.writes){
    const old=snapshot(write.key);
    if(write.kind==="create"&&old)throw Object.assign(new Error("duplicate"),{firestoreStatus:"FAILED_PRECONDITION"});
    if(write.kind==="update"&&String(write.original?.updateTime||"")!==String(old?.updateTime||""))
      throw Object.assign(new Error("stale"),{firestoreStatus:"FAILED_PRECONDITION"});
   }
   commitCount++;
   for(const write of body.writes){
    records.set(write.key,{...(records.get(write.key)||{}),...structuredClone(write.value)});
    versions.set(write.key,(versions.get(write.key)||0)+1);
   }
   return {};
  },
 };
 const game=createHiddenTreasureService(data),actor={username:"agent",displayName:"Agent"};
 assert.deepEqual((await game.state(actor)).searches,0);
 const started=await game.start({caseId:"AA334880"},actor);
 assert.ok(started.eligible&&started.visitId);
 await assert.rejects(()=>game.find({visitId:started.visitId},actor),/ต้องอ่านข้อมูล QA ก่อน/);
 clock+=31000;
 const found=await game.find({visitId:started.visitId},actor);
 assert.ok(found.found&&!found.alreadyClaimed&&found.offerId);
 assert.ok(!("amount" in found),"reward amount must remain hidden until opening");
 const claimed=await game.open({offerId:found.offerId},actor);
 assert.equal(claimed.amount,1);
 assert.equal(claimed.claimed,true);
 assert.equal(records.get(walletPath).balance,101);
 assert.equal(records.get(walletPath).totalEarned,101);
 assert.equal(records.get(walletPath).memberYearEarned,101);
 assert.equal(records.get(historyPath).source,"hidden-treasure");
 assert.equal(records.get(dailyPath).claimedAt.length>0,true);
 assert.equal((await game.open({offerId:found.offerId},actor)).alreadyClaimed,true);
 assert.equal(records.get(walletPath).balance,101,"replaying open cannot grant again");
 assert.equal((await game.start({caseId:"AA334880"},actor)).eligible,false,"previously read case is not farmable");
 clock+=121000;
 const again=await game.start({caseId:"AA334881"},actor);
 assert.ok(again.eligible,"new eligible case may reveal another chest");
 clock+=31000;
 const second=await game.find({visitId:again.visitId},actor);
 assert.equal(second.found,true);
 assert.equal(second.alreadyClaimed,true,"a second treasure is cosmetic after claiming");
 assert.equal(second.offerId,"","the second chest has no payable prize token");
 assert.equal(records.get(walletPath).balance,101);
 assert.ok(commitCount>=4);
 const api=await readFile("api/sparks-admin.js","utf8");
 assert.match(api,/\["treasure-state","treasure-start","treasure-find","treasure-open"\]/);
 assert.match(api,/const actor=await authorizeRewardUser\(body\)/);
 console.log("PASS QA Hidden Treasure: 30s server dwell, cryptographic prize, verified wallet/history single grant, duplicate prevention and harmless later chests");
}finally{Date.now=realNow;}
