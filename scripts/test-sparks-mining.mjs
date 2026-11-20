import assert from "node:assert/strict";
import {createMiningService,weightedMiningReward} from "../server/sparksMiningService.js";

let now=Date.parse("2026-11-18T13:59:59+07:00");
let nextReward=1500;
const documents=new Map();
const actor={username:"miner-one",displayName:"Miner One"};
const db={
  firestoreRequest:async(endpoint,method,body)=>{
    if(endpoint===":beginTransaction")return {transaction:"test-tx"};
    if(endpoint===":rollback")return {};
    if(endpoint===":commit"){
      // All writes must validate before anything is committed.
      for(const write of body.writes){
        const old=documents.get(write.path);
        if(write.mode==="create" && old)throw Object.assign(Error("conflict"),{firestoreStatus:"FAILED_PRECONDITION"});
        if(write.mode==="update" && (old?.revision||0)!==write.revision)
          throw Object.assign(Error("conflict"),{firestoreStatus:"ABORTED"});
      }
      for(const write of body.writes){
        documents.set(write.path,{data:write.data,revision:(documents.get(write.path)?.revision||0)+1});
      }
      return {};
    }
    throw Error("Unexpected call "+endpoint);
  },
  readDoc:async(path)=>{const item=documents.get(path);return item?{...item}:null;},
  recordValue:doc=>doc?.data||{},
  path:(...parts)=>parts.join("/"),
  updateWrite:(path,updates,snap)=>({mode:"update",path,revision:snap?.revision||0,
    data:{...(snap?.data||{}),...updates}}),
  createWrite:(path,data)=>({mode:"create",path,data}),
  walletDocumentPath:user=>"qa_sparks_wallets/"+encodeURIComponent(user),
  currentMemberYear:()=>new Date(now+7*3600000).getUTCFullYear(),
  annualEarnedFromWallet:(wallet)=>wallet.memberYearEarned||0,
  spendableBalance:wallet=>wallet.balance||0,
};
const mine=createMiningService(db,{clock:()=>now,draw:()=>nextReward});
await assert.rejects(()=>mine.dig(actor),/14:00–16:00/);
assert.equal((await mine.state(actor)).open,false);
now=Date.parse("2026-11-18T14:00:00+07:00");
assert.equal((await mine.state(actor)).available,true);
const first=await mine.dig(actor);
assert.equal(first.amount,1500);
assert.equal(first.balance,1500);
assert.equal(first.alreadyApplied,false);
assert.equal((await mine.state(actor)).claimedToday,true);
const second=await mine.dig(actor);
assert.equal(second.alreadyApplied,true);
assert.equal(second.amount,1500);
assert.equal(second.balance,1500);
assert.equal(documents.size,2,"one wallet document and one immutable daily history");
assert.equal(documents.get("qa_sparks_wallets/miner-one/history/mining-2026-11-18").data.source,"mini-game-mining");
const independent=await mine.dig({username:"miner-two"});
assert.equal(independent.amount,1500);
now=Date.parse("2026-11-18T16:00:00+07:00");
await assert.rejects(()=>mine.dig(actor),/14:00–16:00/);
now=Date.parse("2026-11-19T14:15:00+07:00");
nextReward=1;
const nextDay=await mine.dig(actor);
assert.equal(nextDay.amount,1);
assert.equal(nextDay.balance,1501);
assert.equal(documents.size,5,"second daily history and separate user wallet");
const booster={username:"boost-buyer"};
documents.set("qa_sparks_wallets/boost-buyer",{data:{balance:100,totalSpent:0,rewardOrders:0},revision:1});
const boostBefore=await mine.state(booster);
assert.equal(boostBefore.boostOwned,0);
assert.equal(boostBefore.boostBoughtToday,0);
assert.equal((await mine.buyBoost(booster)).balance,75);
assert.equal((await mine.buyBoost(booster)).owned,2);
await assert.rejects(()=>mine.buyBoost(booster),/ครบ 2 ครั้ง/);
assert.equal((await mine.state(booster)).boostOwned,2);
const boostedDig=await mine.dig(booster,{useBoost:true});
assert.equal(boostedDig.boostUsed,true);
assert.equal(boostedDig.balance,51);
assert.equal((await mine.state(booster)).boostOwned,1);
assert.equal(documents.get("qa_sparks_wallets/boost-buyer/history/mining-2026-11-19").data.boostPurchaseId,"mining-boost-buy-2026-11-19-1");
assert.equal(documents.get("qa_sparks_wallets/boost-buyer/history/mining-2026-11-19").data.rewardId,"mining-lucky-boost");
assert.equal((await mine.dig(booster,{useBoost:true})).alreadyApplied,true,"duplicate dig cannot consume a second item");
for(let i=0;i<1000;i++){
  const amount=weightedMiningReward();
  assert.equal(Number.isSafeInteger(amount),true);
  assert.ok(amount>=1&&amount<=1500);
}
console.log("PASS Sparks Mining: Bangkok schedule, daily idempotency, independent users, immutable history, 1–1500 weighted range");
