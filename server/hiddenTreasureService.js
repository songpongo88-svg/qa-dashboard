import { randomInt, randomUUID } from "node:crypto";

const BKK_DAY = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit",
  }).formatToParts(new Date());
  const pick=k=>parts.find(p=>p.type===k)?.value||"";
  return pick("year")+pick("month")+pick("day");
};
const asInt=v=>Number.isFinite(Number(v))&&Number(v)>0?Math.floor(Number(v)):0;
const retryable=e=>["ABORTED","FAILED_PRECONDITION"].includes(e?.firestoreStatus);
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const allowedCaseId=value=>/^[a-zA-Z0-9_-]{3,70}$/.test(String(value||""));

/** Server-authoritative treasure. Client never sends an amount or decides a prize.
 * Fixed daily history ID plus Firestore compare-and-swap prevent duplicate payouts.
 */
export function createHiddenTreasureService({
 firestoreRequest,readDoc,recordValue,path,updateWrite,createWrite,
 walletDocumentPath,currentMemberYear,annualEarnedFromWallet,spendableBalance,
 drawRandom=randomInt,
}){
 const dailyPath=(username,day)=>path("qa_sparks_treasure_daily",username+"-"+day);
 const historyPath=(username,day)=>path("qa_sparks_wallets",encodeURIComponent(username),"history","hidden-treasure-"+day);
 const transact=async(handle)=>{
   for(let attempt=0;attempt<4;attempt++){
     const begin=await firestoreRequest(":beginTransaction","POST",{options:{readWrite:{}}});
     const transaction=begin?.transaction;
     if(!transaction)fail("ไม่สามารถเริ่มตรวจขุมทรัพย์ได้",503);
     try {
       const result=await handle(transaction);
       if(result.writes?.length)await firestoreRequest(":commit","POST",{transaction,writes:result.writes});
       else await firestoreRequest(":rollback","POST",{transaction}).catch(()=>{});
       return result.value;
     }catch(e){
       await firestoreRequest(":rollback","POST",{transaction}).catch(()=>{});
       if(retryable(e)&&attempt<3)continue;
       throw e;
     }
   }
   fail("มีการเปิดหีบพร้อมกัน กรุณาลองใหม่",409);
 };
 const state=async(actor)=>{
   const day=BKK_DAY();
   const doc=recordValue(await readDoc(dailyPath(actor.username,day)));
   return {day,claimed:!!doc.claimedAt,searches:asInt(doc.searches)};
 };
 const start=async(body,actor)=>{
   const caseId=String(body.caseId||"").trim();
   if(!allowedCaseId(caseId))fail("ต้องเปิด Case Detail ที่มีรหัสเคสถูกต้องก่อนค้นหาสมบัติ");
   return transact(async(transaction)=>{
     const day=BKK_DAY(),docPath=dailyPath(actor.username,day),snap=await readDoc(docPath,transaction);
     const d=recordValue(snap),now=Date.now();
     if(d.claimedAt)return {value:{eligible:false,claimed:true,reason:"already-claimed",day},writes:[]};
     // A previously discovered chest stays available even if its popup was dismissed.
     if(d.offerId)return {value:{eligible:false,pendingOfferId:d.offerId,day},writes:[]};
     const visitId=randomUUID(),readSeconds=drawRandom(30,91);
     const next={...d,username:actor.username,day,visitId,caseId,startedMs:now,readSeconds,updatedAt:new Date(now).toISOString()};
     return {value:{eligible:true,visitId,readSeconds,day},
       writes:[updateWrite(docPath,next,snap)]};
   });
 };
 const find=async(body,actor)=>{
   const visitId=String(body.visitId||"");
   if(!/^[0-9a-f-]{36}$/.test(visitId))fail("รหัสการอ่านไม่ถูกต้อง");
   return transact(async(transaction)=>{
     const day=BKK_DAY(),docPath=dailyPath(actor.username,day),snap=await readDoc(docPath,transaction);
     const d=recordValue(snap),now=Date.now();
     if(d.visitId!==visitId||!d.caseId)fail("การอ่านเคสนี้สิ้นสุดแล้ว กรุณาเปิดเคสอีกครั้ง",409);
     if(now-asInt(d.startedMs)<Math.max(30,Math.min(90,asInt(d.readSeconds)))*1000)fail("ต้องอ่านข้อมูล QA ก่อนเปิดหีบสมบัติ",409);
     if(now-asInt(d.startedMs)>15*60*1000)fail("การอ่านเคสหมดเวลา กรุณาเปิดเคสอีกครั้ง",409);
     if(d.claimedAt)return {value:{found:false,claimed:true,reason:"already-claimed",day},writes:[]};
     const found=drawRandom(100)<35;
     const offerId=found?randomUUID():"";
     // Smaller awards are intentionally more common. Exactly 1-500 possible.
     const dice=drawRandom(1000);
     const amount=dice<700?drawRandom(1,101):dice<930?drawRandom(101,301):drawRandom(301,501);
     const next={...d,visitId:"",caseId:"",startedMs:0,lastCheckMs:now,
       searches:asInt(d.searches)+1,
       offerId,offerAmount:offerId?amount:0,
       updatedAt:new Date(now).toISOString()};
     return {value:{found,offerId,day,searches:next.searches},
       writes:[updateWrite(docPath,next,snap)]};
   });
 };
 const open=async(body,actor)=>{
   const offerId=String(body.offerId||"");
   if(!/^[0-9a-f-]{36}$/.test(offerId))fail("หีบสมบัติไม่ถูกต้อง");
   return transact(async(transaction)=>{
     const day=BKK_DAY(),docPath=dailyPath(actor.username,day),walletPath=walletDocumentPath(actor.username),
       history=historyPath(actor.username,day);
     const [treasureDoc,walletDoc,historyDoc]=await Promise.all([
       readDoc(docPath,transaction),readDoc(walletPath,transaction),readDoc(history,transaction)]);
     const d=recordValue(treasureDoc),wallet=recordValue(walletDoc);
     if(historyDoc||d.claimedAt)return {value:{claimed:false,alreadyClaimed:true,amount:0,day},writes:[]};
     if(d.offerId!==offerId||d.day!==day)fail("ไม่พบหีบสมบัติที่รอเปิด",409);
     const amount=asInt(d.offerAmount);
     if(amount<1||amount>500)fail("ข้อมูลรางวัลไม่ถูกต้อง",409);
     const year=currentMemberYear(),current=spendableBalance(wallet),newBalance=current+amount,
       now=new Date().toISOString();
     const updates={username:actor.username,balance:newBalance,balanceYear:year,
       totalEarned:asInt(wallet.totalEarned)+amount,
       memberYear:year,memberYearEarned:annualEarnedFromWallet(wallet,year)+amount,
       hiddenTreasureLastDay:day,updatedAt:now};
     const historyValue={createdAt:now,type:"earn",source:"hidden-treasure",
       title:"QA Hidden Treasure",detail:"อ่าน Case Detail / Rubric / Coaching และเปิดหีบสมบัติประจำวัน",
       amount,balanceAfter:newBalance,performedBy:actor.username,status:"Completed",day};
     return {value:{claimed:true,alreadyClaimed:false,amount,balance:newBalance,day},
       writes:[updateWrite(walletPath,updates,walletDoc),
         createWrite(history,historyValue),
         updateWrite(docPath,{...d,offerId:"",offerAmount:0,claimedAt:now,updatedAt:now},treasureDoc)]};
   });
 };
 return {state,start,find,open};
}
