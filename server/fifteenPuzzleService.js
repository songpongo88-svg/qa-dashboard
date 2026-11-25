import {randomInt,randomUUID,createHash} from "node:crypto";

// Namespaced under existing Supabase bridge collections to avoid any Firestore usage.
// Prefixes cannot collide with Fruit Match: that game keys players by username,
// uses fixed board keys and UUID receipt IDs.
const PLAYER="qa_sparks_fruit_players_v1";
const BOARD="qa_sparks_fruit_boards";
const RECEIPT="qa_sparks_fruit_rounds";
const GOAL=Array.from({length:15},(_,i)=>i+1).concat(0);
const REWARDS=[150,120,100,80,50];
// Weekly cutover: Monday 23 Nov 2026, 11:00 Asia/Bangkok (04:00 UTC).
const WEEK_START=Date.parse("2026-11-23T04:00:00Z"),WEEK_MS=604800000;
const weekFor=(ms=Date.now())=>{
 const index=Math.floor((ms-WEEK_START)/WEEK_MS);
 if(index<0)return {index:-1,key:"legacy",nextResetAt:new Date(WEEK_START).toISOString()};
 const start=WEEK_START+index*WEEK_MS;
 return {index,key:new Date(start).toISOString().slice(0,10),nextResetAt:new Date(start+WEEK_MS).toISOString()};
};
const num=value=>Number.isSafeInteger(value)&&value>=0?value:0;
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
const bangkokDay=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
function neighbors(z){const r=Math.floor(z/4),c=z%4;return [r>0?z-4:-1,r<3?z+4:-1,c>0?z-1:-1,c<3?z+1:-1].filter(i=>i>=0);}
function board(){const a=[...GOAL];let prev=-1;for(let i=0;i<180;i++){const z=a.indexOf(0),options=neighbors(z).filter(n=>n!==prev),next=options[randomInt(options.length)];[a[z],a[next]]=[a[next],a[z]];prev=z;}return a.every((n,i)=>n===GOAL[i])?board():a;}
const compare=(a,b)=>a.elapsedMs-b.elapsedMs||a.moves-b.moves||a.achievedAt.localeCompare(b.achievedAt);
const leaders=doc=>(Array.isArray(doc.rows)?doc.rows:[]).filter(x=>x&&typeof x.username==="string"&&num(x.elapsedMs)>0).sort(compare).slice(0,5);
const playerPublic=s=>({dailyWins:s.day===bangkokDay()?num(s.dailyWins):0,won:num(s.won),best:s.best||null,highestAwardedRank:num(s.highestAwardedRank)||null,active:Boolean(s.activeRound),history:Array.isArray(s.history)?s.history.slice(-8):[]});
const sessionHash=s=>createHash("sha256").update(String(s)).digest("hex");
export function replayFifteen(initial,trace){
 if(!Array.isArray(initial)||initial.length!==16||initial.slice().sort((a,b)=>a-b).some((n,i)=>n!==i))fail("กระดานไม่ถูกต้อง");
 if(!Array.isArray(trace)||trace.length<1||trace.length>15000)fail("จำนวนครั้งที่เลื่อนไม่ถูกต้อง");
 const a=[...initial];let previous=-1;
 for(const step of trace){if(!Number.isInteger(step)||!neighbors(a.indexOf(0)).includes(step))fail("ลำดับการเลื่อนไม่ถูกต้อง");if(previous===step&&trace.length===0)fail("Invalid move");const z=a.indexOf(0);[a[z],a[step]]=[a[step],a[z]];previous=step;}
 return {won:a.every((n,i)=>n===GOAL[i]),moves:trace.length};
}
export function createFifteenPuzzleService(db){
 const {firestoreRequest,readDoc,recordValue,path,updateWrite,createWrite,walletDocumentPath,currentMemberYear,annualEarnedFromWallet,spendableBalance}=db;
 const playerPath=actor=>path(PLAYER,"p15-"+encodeURIComponent(actor.username));
 const leaderboardPath=(period=weekFor())=>path(BOARD,period.index<0?"p15-global-v1":"p15-week-"+period.key);
 const previousWeek=p=>p.index>0?weekFor(WEEK_START+(p.index-1)*WEEK_MS):p.index===0?weekFor(WEEK_START-1):null;
 const weekMeta=(p,old)=>({key:p.key,nextResetAt:p.nextResetAt,previousChampions:old?.champions||[],previousPending:Boolean(old?.rows?.length&&!old?.settledAt),rankRewards:REWARDS});
 const receiptPath=id=>path(RECEIPT,"p15-"+id);
 async function transact(work){
  for(let retry=0;retry<5;retry++){
   const begin=await firestoreRequest(":beginTransaction","POST",{options:{readWrite:{}}}),transaction=begin?.transaction;
   if(!transaction)fail("ระบบ Sparks ไม่พร้อมทำธุรกรรม",503);
   let committed=false;
   try{
    const {writes,result}=await work(transaction);
    if(writes.length){await firestoreRequest(":commit","POST",{transaction,writes});committed=true;}
    return result;
   }catch(e){if(["ABORTED","FAILED_PRECONDITION"].includes(e?.firestoreStatus)&&retry<4)continue;throw e;}
   finally{if(!committed)await firestoreRequest(":rollback","POST",{transaction}).catch(()=>{});}
  }
  fail("มีรายการพร้อมกัน กรุณาลองใหม่",409);
 }
 async function data(actor){
  const period=weekFor(),previous=previousWeek(period);
  const [p,b,old]=await Promise.all([readDoc(playerPath(actor)),readDoc(leaderboardPath(period)),
    previous?readDoc(leaderboardPath(previous)):Promise.resolve(null)]);
  return {ok:true,stats:playerPublic(recordValue(p)),leaderboard:leaders(recordValue(b)),
    week:weekMeta(period,recordValue(old)),entryFee:1,reward:30,fastBonus:50,rankRewards:REWARDS,fastLimitMs:180000,dailyLimit:2};
 }
 async function start(body,actor){
  if(typeof body.requestId!=="string"||!/^[a-zA-Z0-9_-]{12,100}$/.test(body.requestId))fail("รหัสเริ่มเกมไม่ถูกต้อง",400);
  return transact(async transaction=>{
   const pp=playerPath(actor),wp=walletDocumentPath(actor.username);
   const [pd,wd]=await Promise.all([readDoc(pp,transaction),readDoc(wp,transaction)]);
   if(!wd)fail("ไม่พบกระเป๋า Sparks",503);
   const p=recordValue(pd),w=recordValue(wd),now=Date.now(),day=bangkokDay();
   if(p.activeRound?.requestId===body.requestId&&p.activeRound.sessionHash===sessionHash(body.sessionId))
    return {writes:[],result:{ok:true,roundId:p.activeRound.id,board:p.activeRound.board,startedAt:p.activeRound.startedAt,stats:playerPublic(p),charged:1,alreadyApplied:true}};
   if(p.activeRound&&now-p.activeRound.startedAt<1000)fail("กรุณารอสักครู่ก่อนเริ่มเกมใหม่",429);
   const balance=spendableBalance(w,currentMemberYear());
   if(balance<1)fail("Sparks ไม่เพียงพอสำหรับค่าเข้า 1 Spark");
   const initial=board(),round={id:randomUUID(),requestId:body.requestId,username:actor.username,sessionHash:sessionHash(body.sessionId),board:initial,startedAt:now};
   const next={username:actor.username,displayName:String(actor.displayName||actor.username).slice(0,120),activeRound:round,day,dailyWins:p.day===day?num(p.dailyWins):0,started:num(p.started)+1,updatedAt:new Date(now).toISOString()};
   const writes=[
    updateWrite(pp,next,pd),
    updateWrite(wp,{username:actor.username,balance:balance-1,balanceYear:currentMemberYear(),totalSpent:num(w.totalSpent)+1,updatedAt:new Date(now).toISOString()},wd),
    createWrite(path("qa_sparks_wallets",encodeURIComponent(actor.username),"history","p15-entry-"+round.id),{
     createdAt:new Date(now).toISOString(),type:"spend",source:"mini-game-15-puzzle",title:"15-Puzzle Entry",detail:"ค่าเข้าเกม 1 Spark (ไม่คืนแม้ออกก่อนจบ)",amount:-1,balanceAfter:balance-1,performedBy:actor.username,status:"Completed",roundId:round.id
    })
   ];
   return {writes,result:{ok:true,roundId:round.id,board:initial,startedAt:now,stats:playerPublic({...p,...next}),charged:1,balance:balance-1}};
  });
 }
 async function finish(body,actor,receivedAt=Date.now()){
  if(typeof body.roundId!=="string"||!/^[a-f0-9-]{36}$/.test(body.roundId))fail("รอบเกมไม่ถูกต้อง",400);
  return transact(async transaction=>{
   const pp=playerPath(actor),wp=walletDocumentPath(actor.username),rp=receiptPath(body.roundId);
   const pd=await readDoc(pp,transaction),p=recordValue(pd),round=p.activeRound;
   const period=weekFor(round?.startedAt||Date.now()),bp=leaderboardPath(period);
   const [bd,wd,rd]=await Promise.all([readDoc(bp,transaction),readDoc(wp,transaction),readDoc(rp,transaction)]);
   const b=recordValue(bd),w=recordValue(wd);
   if(rd)return {writes:[],result:{ok:true,alreadyApplied:true,result:recordValue(rd),stats:playerPublic(p),leaderboard:leaders(b)}};
   if(!round||round.id!==body.roundId||round.sessionHash!==sessionHash(body.sessionId))fail("รอบเกมหมดอายุหรือมีการเริ่มเกมใหม่แล้ว");
   const played=replayFifteen(round.board,body.trace);
   if(!played.won)fail("ยังจัดเรียงตัวเลขไม่สำเร็จ");
   // Use trusted request arrival time, not DB processing or transaction retries.
    const now=Date.now(),elapsedMs=receivedAt-round.startedAt;
   if(elapsedMs<1000||elapsedMs>24*60*60*1000)fail("เวลาเล่นไม่ถูกต้อง");
   if(played.moves>Math.floor(elapsedMs/12)+25)fail("การเลื่อนเร็วผิดปกติ กรุณาลองใหม่");
   const day=bangkokDay(),wins=p.day===day?num(p.dailyWins):0,year=currentMemberYear();
   const candidate={username:actor.username,displayName:String(actor.displayName||actor.username).slice(0,120),elapsedMs,moves:played.moves,achievedAt:new Date(receivedAt).toISOString()};
   const oldRows=leaders(b),old=oldRows.find(x=>x.username===actor.username);
   const improved=!old||compare(candidate,old)<0;
   const nextRows=improved?leaders({rows:[...oldRows.filter(x=>x.username!==actor.username),candidate]}):oldRows;
   const rank=nextRows.findIndex(x=>x.username===actor.username)+1;
   const top5=rank>0&&rank<=5;
   // Rank bonuses are NEVER credited on finish; paid once at weekly close.
   const eligible=wins<2,base=eligible?30:0,fast=eligible&&elapsedMs<=180000?50:0,rankBonus=0;
   const earned=base+fast+rankBonus;
   const balance=spendableBalance(w,year),annual=annualEarnedFromWallet(w,year),lifetime=Math.max(num(w.totalEarned),num(w.firstLogin?.amount));
   const result={roundId:round.id,won:true,moves:played.moves,elapsedMs,base,fast,rankBonus,rank:top5?rank:null,earned,balanceAfter:balance+earned,createdAt:new Date(now).toISOString()};
   const next={username:actor.username,displayName:candidate.displayName,activeRound:null,day,dailyWins:wins+(eligible?1:0),won:num(p.won)+1,best:!p.best||compare(candidate,p.best)<0?candidate:p.best,highestAwardedRank:p.highestAwardedRank||null,history:[...(Array.isArray(p.history)?p.history:[]),result].slice(-8),updatedAt:result.createdAt};
   const writes=[updateWrite(pp,next,pd),createWrite(rp,result)];
   if(improved&&top5)writes.push(updateWrite(bp,{rows:nextRows,weekKey:period.key,updatedAt:result.createdAt},bd));
   if(earned){
    writes.push(updateWrite(wp,{username:actor.username,balance:balance+earned,balanceYear:year,totalEarned:lifetime+earned,memberYear:year,memberYearEarned:annual+earned,updatedAt:result.createdAt},wd));
    writes.push(createWrite(path("qa_sparks_wallets",encodeURIComponent(actor.username),"history","p15-prize-"+round.id),{
     createdAt:result.createdAt,type:"earn",source:"mini-game-15-puzzle",title:"15-Puzzle Reward",amount:earned,detail:"ผ่านเกม "+(elapsedMs/1000).toFixed(2)+" วินาที · รางวัล "+base+" + โบนัสเร็ว "+fast+" · โบนัสอันดับจ่ายเมื่อปิดรอบวันจันทร์",balanceAfter:balance+earned,performedBy:actor.username,status:"Completed",roundId:round.id
    }));
   }
   return {writes,result:{ok:true,result,stats:playerPublic({...p,...next}),leaderboard:nextRows}};
  });
 }
 // Weekly close pays only the final five places; deterministic ledgers and settled marker prevent duplicates.
 async function settleWeek(period) {
  if(Date.now()<Date.parse(period.nextResetAt))return {weekKey:period.key,status:"not-due"};
  return transact(async transaction=>{
   const bp=leaderboardPath(period),bd=await readDoc(bp,transaction),b=recordValue(bd);
   if(!bd)return {writes:[],result:{weekKey:period.key,status:"empty"}};
   if(b.settledAt)return {writes:[],result:{weekKey:period.key,status:"already-settled"}};
   const winners=leaders(b).slice(0,5),now=new Date().toISOString(),year=currentMemberYear();
   const docs=await Promise.all(winners.map(async(player)=>({
     player,walletDoc:await readDoc(walletDocumentPath(player.username),transaction),
     playerDoc:await readDoc(playerPath(player),transaction)
   })));
   const writes=[],champions=[];
   for(let i=0;i<docs.length;i++){
    const {player,walletDoc,playerDoc}=docs[i];
    if(!walletDoc)fail("ไม่พบกระเป๋าของผู้ได้รับรางวัล 15-Puzzle",503);
    const wallet=recordValue(walletDoc),stats=recordValue(playerDoc),amount=REWARDS[i];
    const balance=spendableBalance(wallet,year)+amount,annual=annualEarnedFromWallet(wallet,year);
    const lifetime=Math.max(num(wallet.totalEarned),num(wallet.firstLogin?.amount));
    const champion={...player,rank:i+1,amount,weekKey:period.key,awardedAt:now};
    champions.push(champion);
    writes.push(updateWrite(walletDocumentPath(player.username),{username:player.username,balance,balanceYear:year,
      totalEarned:lifetime+amount,memberYear:year,memberYearEarned:annual+amount,updatedAt:now},walletDoc));
    writes.push(updateWrite(playerPath(player),{totalWeeklyAwards:num(stats.totalWeeklyAwards)+amount,updatedAt:now},playerDoc));
    writes.push(createWrite(path("qa_sparks_wallets",encodeURIComponent(player.username),"history",
      "p15-weekly-"+period.key),{createdAt:now,type:"earn",source:"mini-game-15-puzzle-weekly",
      title:"15-Puzzle Weekly Top 5",amount,
      detail:"อันดับ "+(i+1)+" ประจำสัปดาห์ "+period.key+" (ปิด "+period.nextResetAt+")",
      balanceAfter:balance,performedBy:"system",status:"Completed",weekKey:period.key,rank:i+1}));
   }
   writes.push(updateWrite(bp,{settledAt:now,champions},bd));
   return {writes,result:{weekKey:period.key,status:winners.length?"awarded":"empty",champions}};
  });
 }
 async function settleWeekly(){
  const current=weekFor();
  if(current.index<0)return {status:"not-due",nextResetAt:current.nextResetAt,results:[]};
  const results=[];
  for(let i=Math.max(-1,current.index-8);i<current.index;i++)
   results.push(await settleWeek(weekFor(WEEK_START+i*WEEK_MS)));
  return {status:"checked",results};
 }
 return {data,start,finish,settleWeekly};
}
