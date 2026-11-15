import {randomInt,randomUUID} from "node:crypto";

const ROUND = "qa_sparks_angel_rounds/current";
const ARCHIVES = "qa_sparks_angel_rounds";
const LAUNCH = Date.parse("2026-12-06T00:00:00+07:00");
const COST = 5, COOLDOWN = 5 * 60_000;
const number = x => Number.isSafeInteger(x) && x >= 0 ? x : 0;
const reject = (message,status=400) => {throw Object.assign(new Error(message),{status});};
const validRequest = x => /^[a-zA-Z0-9_-]{16,100}$/.test(String(x||""));
const isValidNumber = x => typeof x === "number" && Number.isInteger(x) && x>=0 && x<=100;
const cleanUser = s => String(s||"").trim().toLowerCase();
const fmt = n => Math.max(0,Math.floor(Number(n)||0));
const publicState = (round,actor,wallet,admin=false) => {
  if (!round.roundId) return {status:"not-configured",startsAt:new Date(LAUNCH).toISOString(),picks:[],jackpot:0,cooldownUntil:0};
  const now=Date.now();
  const status=round.status==="open" && now<Date.parse(round.startsAt)?"scheduled":round.status;
  const result = {status,roundId:round.roundId,startsAt:round.startsAt,
    jackpot:number(round.jackpot),picks:(round.picks||[]).map(p=>({number:p.number,bonus:p.bonus,at:p.at})),
    cooldownUntil:Number(wallet.angelLastOpenedAt||0)+COOLDOWN,
    winner:round.status==="finished"?round.winner:null,
    payoutStatus:round.payoutStatus||"",endedAt:round.endedAt||"",
    ownWon:round.winner===actor.username,
    ownLastPlay:(round.picks||[]).filter(p=>p.username===actor.username).slice(-1)[0]||null};
  if(admin)result.angelNumber=round.angelNumber;
  return result;
};
export function createAngelNumberService(db) {
  const {firestoreRequest,readDoc,recordValue,path,updateWrite,createWrite,walletDocumentPath,
    currentMemberYear,annualEarnedFromWallet,spendableBalance,sparksAngelDirectory}=db;
  const walletHistory=(name,id)=>path("qa_sparks_wallets",encodeURIComponent(name),"history",id);
  async function transact(work){
    for(let attempt=0;attempt<5;attempt++){
      const start=await firestoreRequest(":beginTransaction","POST",{options:{readWrite:{}}});
      if(!start?.transaction)reject("ไม่สามารถเริ่มธุรกรรม Sparks ได้",503);
      let committed=false;
      try {
        const {writes,result}=await work(start.transaction);
        if(writes.length){await firestoreRequest(":commit","POST",{transaction:start.transaction,writes});committed=true;}
        return result;
      }catch(error){
        if(["ABORTED","FAILED_PRECONDITION"].includes(error?.firestoreStatus)&&attempt<4)continue;
        throw error;
      }finally{
        if(!committed)await firestoreRequest(":rollback","POST",{transaction:start.transaction}).catch(()=>{});
      }
    }
    reject("มีผู้เล่นเปิดหมายเลขพร้อมกัน กรุณาลองใหม่",409);
  }
  async function state(actor,admin=false){
    const [snapshot,walletSnap]=await Promise.all([readDoc(ROUND),readDoc(walletDocumentPath(actor.username))]);
    return publicState(recordValue(snapshot),actor,recordValue(walletSnap),admin);
  }
  async function create(body,admin){
    if(!isValidNumber(body.angelNumber))reject("กรุณากำหนดเลขนางฟ้า 0–100");
    return transact(async transaction=>{
      const snap=await readDoc(ROUND,transaction),prev=recordValue(snap),now=Date.now();
      if(prev.roundId&&(prev.status==="open"||prev.status==="finished"&&prev.payoutStatus!=="paid"))
        reject("รอบเดิมยังเปิดอยู่หรือยังจัดสรร Jackpot ไม่เสร็จ",409);
      const roundId=randomUUID(),startsAt=new Date(Math.max(now,LAUNCH)).toISOString();
      const round={roundId,startsAt,angelNumber:body.angelNumber,status:"open",picks:[],jackpot:0,
        createdAt:new Date(now).toISOString(),createdBy:admin.username,payoutStatus:"",winner:"",endedAt:""};
      const writes=[updateWrite(ROUND,round,snap)];
      if(prev.roundId)writes.push(createWrite(path(ARCHIVES,"archive-"+prev.roundId),{...prev,archivedAt:new Date(now).toISOString()}));
      return {writes,result:{ok:true,...publicState(round,admin,{},true)}};
    });
  }
  async function open(body,actor){
    if(actor.username==="songpon")reject("ผู้ดูแลที่กำหนดเลขนางฟ้าไม่สามารถร่วมเล่นรอบนี้ได้",403);
    if(!isValidNumber(body.number)||!validRequest(body.requestId))reject("ข้อมูลหมายเลขหรือรหัสรายการไม่ถูกต้อง");
    if(Date.now()<LAUNCH)reject("เลขนางฟ้าเริ่มกิจกรรมวันที่ 6 ธันวาคม 2569",409);
    return transact(async transaction=>{
      const [roundDoc,walletDoc]=await Promise.all([readDoc(ROUND,transaction),readDoc(walletDocumentPath(actor.username),transaction)]);
      const round=recordValue(roundDoc),wallet=recordValue(walletDoc),now=Date.now();
      const previous=(round.picks||[]).find(p=>p.requestId===body.requestId&&p.username===actor.username);
      if(previous)return {writes:[],result:{ok:true,alreadyApplied:true,hit:previous.hit,bonus:previous.bonus,
        jackpot:number(round.jackpot),balance:spendableBalance(wallet),state:publicState(round,actor,wallet)}};
      if(round.status!=="open"||!round.roundId)reject("รอบกิจกรรมยังไม่เปิดหรือสิ้นสุดแล้ว",409);
      if(now<Date.parse(round.startsAt))reject("รอบนี้ยังไม่ถึงเวลาเริ่ม",409);
      if((round.picks||[]).some(p=>p.number===body.number))reject("หมายเลขนี้ถูกเปิดไปแล้ว กรุณาเลือกเลขอื่น",409);
      if(now < Number(wallet.angelLastOpenedAt||0)+COOLDOWN)reject("กรุณารอให้ครบ Cooldown 5 นาทีก่อนเปิดเลขอีกครั้ง",429);
      const year=currentMemberYear(),balance=spendableBalance(wallet,year);
      if(balance<COST)reject("Sparks ของคุณไม่เพียงพอสำหรับเปิดหมายเลข",409);
      const hit=body.number===round.angelNumber,bonus=hit?0:randomInt(5,51);
      const nextBalance=balance+(hit?-COST:bonus);
      const nowIso=new Date(now).toISOString(),picks=[...(round.picks||[]),{
        number:body.number,username:actor.username,requestId:body.requestId,
        at:nowIso,bonus,hit}];
      const nextRound={picks,jackpot:number(round.jackpot)+bonus,
        ...(hit?{status:"finished",winner:actor.username,winnerName:actor.displayName,
          endedAt:nowIso,payoutStatus:"pending"}:{}),updatedAt:nowIso};
      const lifetime=Math.max(number(wallet.totalEarned),number(wallet.firstLogin?.amount));
      const updates={username:actor.username,balance:nextBalance,balanceYear:year,
        totalSpent:number(wallet.totalSpent)+COST,
        totalEarned:lifetime+(hit?0:COST+bonus),
        memberYear:year,memberYearEarned:annualEarnedFromWallet(wallet,year)+bonus,
        angelLastOpenedAt:now,updatedAt:nowIso};
      const itemBase="angel-"+round.roundId+"-"+body.number;
      const writes=[updateWrite(ROUND,nextRound,roundDoc),updateWrite(walletDocumentPath(actor.username),updates,walletDoc),
        createWrite(walletHistory(actor.username,itemBase+"-fee"),{createdAt:nowIso,type:"spend",
          source:"mini-game-angel-number",title:"Angel Number · ค่าเปิดเลข "+body.number,
          detail:"ค่าเปิดหมายเลข 5 Sparks",amount:-COST,balanceAfter:balance-COST,
          roundId:round.roundId,requestId:body.requestId,performedBy:actor.username,status:"Completed"})];
      if(!hit)writes.push(createWrite(walletHistory(actor.username,itemBase+"-reward"),{
        createdAt:nowIso,type:"earn",source:"mini-game-angel-number",
        title:"Angel Number · คืนค่าเล่นและรับโบนัส",
        detail:"คืนค่าเปิด 5 Sparks + โบนัสสุ่ม "+bonus+" Sparks",
        amount:COST+bonus,balanceAfter:nextBalance,roundId:round.roundId,
        requestId:body.requestId,performedBy:actor.username,status:"Completed"}));
      const full={...round,...nextRound};
      return {writes,result:{ok:true,hit,bonus,refund:hit?0:COST,jackpot:full.jackpot,
        balance:nextBalance,state:publicState(full,actor,{...wallet,...updates})}};
    });
  }
  async function friends(actor){
    const round=recordValue(await readDoc(ROUND));
    if(round.status!=="finished"||round.payoutStatus!=="pending"||round.winner!==actor.username)
      reject("เฉพาะผู้ชนะที่ยังไม่ได้รับรางวัลเท่านั้น",403);
    const users=(await sparksAngelDirectory())
      .filter(user=>user.username!==actor.username && user.username!=="songpon")
      .sort((a,b)=>a.displayName.localeCompare(b.displayName,"th"));
    return {ok:true,users};
  }
  async function claim(body,actor){
    const shares=Array.isArray(body.shares)?body.shares:[];
    if(shares.length>10)reject("แบ่งรางวัลได้สูงสุด 10 คน");
    const usernames=new Set(),selected=[];
    let pctTotal=0;
    for(const row of shares){
      const username=cleanUser(row.username),percent=row.percent;
      if(!/^[a-z0-9._-]{1,90}$/.test(username)||username===actor.username||usernames.has(username)
        ||!Number.isInteger(percent)||percent<1||percent>100)reject("ข้อมูลการแบ่งรางวัลไม่ถูกต้อง");
      usernames.add(username);pctTotal+=percent;selected.push({username,percent});
    }
    if(pctTotal>100)reject("เปอร์เซ็นต์ที่แบ่งรวมกันต้องไม่เกิน 100%");
    if(selected.length){
      const allowed=new Set((await sparksAngelDirectory()).map(user=>user.username));
      for(const r of selected)if(!allowed.has(r.username))reject("ผู้รับรางวัลไม่ได้อยู่ในรายชื่อบัญชี Active",403);
    }
    return transact(async transaction=>{
      const roundDoc=await readDoc(ROUND,transaction),round=recordValue(roundDoc);
      if(round.winner!==actor.username)reject("คุณไม่ใช่ผู้ชนะรอบนี้",403);
      if(round.payoutStatus==="paid")return {writes:[],result:{ok:true,alreadyApplied:true,distributed:round.distributed||[]}};
      if(round.status!=="finished"||round.payoutStatus!=="pending")reject("รอบนี้ไม่พร้อมจ่ายรางวัล",409);
      const jackpot=number(round.jackpot),year=currentMemberYear(),now=new Date().toISOString();
      const distribution=selected.map(row=>({username:row.username,percent:row.percent,
        amount:Math.floor(jackpot*row.percent/100)}));
      const toFriends=distribution.reduce((s,x)=>s+x.amount,0);
      distribution.unshift({username:actor.username,percent:100-pctTotal,amount:jackpot-toFriends});
      const rows=await Promise.all(distribution.map(row=>readDoc(walletDocumentPath(row.username),transaction)));
      const writes=[updateWrite(ROUND,{payoutStatus:"paid",distributed:distribution,paidAt:now},roundDoc)];
      distribution.forEach((r,index)=>{
        const snap=rows[index],wallet=recordValue(snap),previous=spendableBalance(wallet,year),next=previous+r.amount;
        if(r.amount>0){
          writes.push(updateWrite(walletDocumentPath(r.username),{
            username:r.username,balance:next,balanceYear:year,totalEarned:Math.max(number(wallet.totalEarned),number(wallet.firstLogin?.amount))+r.amount,
            memberYear:year,memberYearEarned:annualEarnedFromWallet(wallet,year)+r.amount,updatedAt:now},snap));
          writes.push(createWrite(walletHistory(r.username,"angel-jackpot-"+round.roundId+"-"+r.username),{
            createdAt:now,type:"earn",source:"mini-game-angel-jackpot",
            title:"Angel Number · Jackpot",detail:"รางวัลจากเลขนางฟ้า · รอบ "+round.roundId,
            amount:r.amount,balanceAfter:next,roundId:round.roundId,performedBy:actor.username,
            status:"Completed"}));
        }
      });
      return {writes,result:{ok:true,distributed:distribution,jackpot}};
    });
  }
  return {state,create,open,friends,claim};
}
