import assert from "node:assert/strict";
import {createFifteenPuzzleService} from "../server/fifteenPuzzleService.js";
const OriginalDate=Date, monday=OriginalDate.parse("2026-11-23T04:00:10Z");
class Clock extends OriginalDate {
 constructor(...args){super(...(args.length?args:[monday]));}
 static now(){return monday;}
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
 readDoc:async key=>store.has(key)?{key,fields:store.get(key)}:null,
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
 console.log("PASS 15-Puzzle weekly Top 5: Monday cutover, ordered payouts, separate new board, history and no double credit");
} finally {globalThis.Date=OriginalDate;}
