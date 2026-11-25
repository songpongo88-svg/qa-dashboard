import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createFifteenPuzzleService} from "../server/fifteenPuzzleService.js";
const OriginalDate=Date, monday=OriginalDate.parse("2026-11-23T04:00:10Z");
let clockNow=monday,readDelay=0;
class Clock extends OriginalDate {
 constructor(...args){super(...(args.length?args:[clockNow]));}
 static now(){return clockNow;}
}
globalThis.Date=Clock;
const store=new Map(),path=(...parts)=>parts.join("/");
const names=["a","b","c"];
store.set("qa_sparks_fruit_boards/p15-global-v1",{rows:names.map((username,i)=>({
 username,displayName:username.toUpperCase(),elapsedMs:60000+i*30000,moves:40,achievedAt:"2026-11-20T10:00:00Z"
}))});
for(const username of names){
 store.set("qa_sparks_wallets/"+username,{username,balance:500,balanceYear:2026,totalEarned:500,memberYear:2026,memberYearEarned:500});
 store.set("qa_sparks_fruit_players_v1/p15-"+username,{username,totalWeeklyAwards:0});
}
const db={
 path,
 firestoreRequest:async(endpoint,method,body)=>{
  if(endpoint===":beginTransaction")return {transaction:"test"};
  if(endpoint===":commit"){
   for(const write of body.writes){
    if(write.mode==="create"&&store.has(write.key))throw Error("Duplicate credit");
    store.set(write.key,{...(store.get(write.key)||{}),...write.data});
   }
   return {};
  }
  return {};
 },
 readDoc:async key=>{clockNow+=readDelay;return store.has(key)?{key,fields:store.get(key)}:null;},
 recordValue:doc=>doc?.fields||{},
 updateWrite:(key,data)=>({mode:"update",key,data}),
 createWrite:(key,data)=>({mode:"create",key,data}),
 walletDocumentPath:username=>path("qa_sparks_wallets",username),
 currentMemberYear:()=>2026,
 annualEarnedFromWallet:w=>w.memberYearEarned||0,
 spendableBalance:w=>w.balance||0,
};
try {
 const service=createFifteenPuzzleService(db);
 const first=await service.settleWeekly();
 assert.equal(first.status,"checked");
 const outcome=first.results.find(r=>r.weekKey==="legacy");
 assert.equal(outcome.status,"awarded");
 assert.deepEqual(outcome.champions.map(x=>x.amount),[150,120,100]);
 for(const [i,username] of names.entries()){
  assert.equal(store.get("qa_sparks_wallets/"+username).balance,500+[150,120,100][i]);
  assert.equal(store.get("qa_sparks_wallets/"+username+"/history/p15-weekly-legacy").amount,[150,120,100][i]);
 }
 const next=await service.settleWeekly();
 assert.equal(next.results.find(r=>r.weekKey==="legacy").status,"already-settled");
 assert.equal(store.get("qa_sparks_wallets/a").balance,650,"never pay twice");
 const current=await service.data({username:"a"});
 assert.equal(current.week.key,"2026-11-23");
 assert.equal(current.leaderboard.length,0,"new week starts empty");
 assert.equal(current.week.previousChampions.length,3,"past results preserved");
 const pp="qa_sparks_fruit_players_v1/p15-b",bp="qa_sparks_fruit_boards/p15-week-2026-11-23",id="12345678-1234-1234-1234-123456789abc",sessionId="test-session";
 clockNow=monday+200000;
 const player=store.get(pp);
 store.set(pp,{...player,day:"2026-11-23",dailyWins:1,activeRound:{id,sessionHash:createHash("sha256").update(sessionId).digest("hex"),startedAt:clockNow-117000,board:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,0,15]}});
 store.set(bp,{rows:[{username:"a",displayName:"A",elapsedMs:121539,moves:162,achievedAt:new Date().toISOString()},{username:"b",displayName:"B",elapsedMs:150505,moves:270,achievedAt:new Date().toISOString()}]});
 readDelay=2000;
 const before=store.get("qa_sparks_wallets/b").balance;
 const finished=await service.finish({roundId:id,sessionId,trace:[15]},{username:"b",displayName:"B"});
 assert.equal(finished.result.elapsedMs,117000,"database latency must not inflate elapsed time");
 assert.equal(finished.result.rank,1,"improved second round must overtake previous leader");
 assert.equal(finished.stats.dailyWins,2);
 assert.equal(finished.result.earned,80);
 const repeated=await service.finish({roundId:id,sessionId,trace:[15]},{username:"b",displayName:"B"});
 assert.equal(repeated.result.elapsedMs,117000);
 assert.equal(store.get("qa_sparks_wallets/b").balance,before+80,"finish retry never pays twice");
 console.log("PASS 15-Puzzle weekly and finish timing: rank update, second daily win, no double credit");
} finally {globalThis.Date=OriginalDate;}
