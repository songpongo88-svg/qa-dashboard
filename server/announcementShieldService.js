/**
 * Announcement Shield: explicit, opt-in 50 Sparks monthly subscription.
 * All purchases, renewals, and transitions use Firestore compare-and-swap.
 * The daily existing QA Lottery cron also runs sweep(), so renewal does not require login.
 */
import {randomUUID} from "node:crypto";

export const SHIELD_PRICE=50;
export const GRACE_DAYS=14;
const DAY_MS=86400000;
const err=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const toNumber=v=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):0;
const safeTime=v=>{const n=Date.parse(String(v||""));return Number.isFinite(n)?n:0;};
const currentDay=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const nowIso=()=>new Date().toISOString();

/** Advance one calendar month in Asia/Bangkok, clamp months shorter than purchase day. */
export function nextShieldMonth(iso){
 const start=safeTime(iso);
 if(!start)err("วันที่เริ่มต้นไม่ถูกต้อง");
 const local=new Date(start+7*3600000);
 const y=local.getUTCFullYear(),m=local.getUTCMonth(),d=local.getUTCDate();
 const h=local.getUTCHours(),minute=local.getUTCMinutes(),sec=local.getUTCSeconds(),ms=local.getUTCMilliseconds();
 const first=new Date(Date.UTC(y,m+1,1,h,minute,sec,ms));
 const end=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
 return new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),Math.min(d,end),h,minute,sec,ms)-7*3600000).toISOString();
}
export function shieldEntitled(subscription,when=Date.now()){
 if(!subscription?.activatedAt)return false;
 const until=safeTime(subscription.nextBillingAt);
 if(subscription.status==="active")return when<until;
 if(subscription.status==="grace"&&!subscription.cancelledAt)return when<safeTime(subscription.graceEndsAt);
 if(subscription.status==="cancelled")return when<until;
 return false;
}
export function createAnnouncementShieldService({
 firestoreRequest,readDoc,recordValue,path,updateWrite,createWrite,listCollection,
 walletDocumentPath,spendableBalance,currentMemberYear,
}){
 const documentFor=username=>path("qa_announcement_shield",encodeURIComponent(username));
 const historyFor=(username,id)=>path("qa_sparks_wallets",encodeURIComponent(username),"history",id);
 const transaction=async(handler)=>{
  for(let i=0;i<4;i++){
   const start=await firestoreRequest(":beginTransaction","POST",{options:{readWrite:{}}});
   const txn=start?.transaction;
   if(!txn)err("ไม่สามารถเริ่มทำรายการได้",503);
   try{
    const result=await handler(txn);
    if(result.writes?.length)await firestoreRequest(":commit","POST",{transaction:txn,writes:result.writes});
    else await firestoreRequest(":rollback","POST",{transaction:txn}).catch(()=>{});
    return result.result;
   }catch(e){
    await firestoreRequest(":rollback","POST",{transaction:txn}).catch(()=>{});
    if(["ABORTED","FAILED_PRECONDITION"].includes(e?.firestoreStatus)&&i<3)continue;
    throw e;
   }
  }
  err("มีการทำรายการพร้อมกัน กรุณาลองใหม่",409);
 };
 const purchase=async(actor)=>transaction(async(txn)=>{
  const subscriptionPath=documentFor(actor.username),walletPath=walletDocumentPath(actor.username);
  const [subDoc,walletDoc]=await Promise.all([readDoc(subscriptionPath,txn),readDoc(walletPath,txn)]);
  const sub=recordValue(subDoc),wallet=recordValue(walletDoc);
  if(["unused","active","grace","cancelled"].includes(sub.status)&&
    (sub.status!=="cancelled"||shieldEntitled(sub)))err("มี Announcement Shield อยู่แล้ว",409);
  const balance=spendableBalance(wallet);
  if(balance<SHIELD_PRICE)err("Sparks ไม่เพียงพอสำหรับแลก Item 50 Sparks",400);
  const current=nowIso(),id=randomUUID(),year=currentMemberYear();
  const historyId="announcement-shield-purchase-"+id;
  return {writes:[
   updateWrite(walletPath,{username:actor.username,balance:balance-SHIELD_PRICE,balanceYear:year,
     totalSpent:toNumber(wallet.totalSpent)+SHIELD_PRICE,rewardOrders:toNumber(wallet.rewardOrders)+1,updatedAt:current},walletDoc),
   updateWrite(subscriptionPath,{username:actor.username,itemId:id,status:"unused",purchasedAt:current,
     activatedAt:"",nextBillingAt:"",graceEndsAt:"",cancelledAt:"",lastAttemptDay:"",lastRenewalAt:"",updatedAt:current},subDoc),
   createWrite(historyFor(actor.username,historyId),{createdAt:current,type:"spend",source:"announcement-shield",
     title:"Announcement Shield · แลก Item",detail:"แลก Item สมัครสมาชิก 50 Sparks (เริ่มนับอายุเมื่อกดใช้)",
     amount:-SHIELD_PRICE,balanceAfter:balance-SHIELD_PRICE,performedBy:actor.username,status:"Completed",itemId:id}),
  ],result:{ok:true,status:"unused",balance:balance-SHIELD_PRICE}};
 });
 const activate=async(actor)=>transaction(async(txn)=>{
  const p=documentFor(actor.username),snap=await readDoc(p,txn),sub=recordValue(snap);
  if(sub.status!=="unused")err("ไม่มี Announcement Shield ที่พร้อมกดใช้งาน",409);
  const now=nowIso(),next=nextShieldMonth(now);
  return {writes:[updateWrite(p,{status:"active",activatedAt:now,nextBillingAt:next,
   graceEndsAt:"",cancelledAt:"",lastAttemptDay:"",updatedAt:now},snap)],
   result:{ok:true,status:"active",nextBillingAt:next}};
 });
 const cancel=async(actor)=>transaction(async(txn)=>{
  const p=documentFor(actor.username),snap=await readDoc(p,txn),sub=recordValue(snap);
  if(!["active","grace","cancelled"].includes(sub.status))err("ไม่มีสมาชิกที่กำลังใช้งาน",409);
  if(sub.status==="cancelled")return {writes:[],result:{ok:true,status:"cancelled",alreadyApplied:true}};
  const now=nowIso();
  return {writes:[updateWrite(p,{status:"cancelled",cancelledAt:now,updatedAt:now},snap)],
   result:{ok:true,status:"cancelled",nextBillingAt:sub.nextBillingAt}};
 });
 const settleOne=async(username)=>{
  const subPath=documentFor(username),pre=recordValue(await readDoc(subPath));
  if(!["active","grace","cancelled"].includes(pre.status))return {skipped:true};
  const due=safeTime(pre.nextBillingAt),now=Date.now();
  if(!due||now<due)return {skipped:true};
  if(pre.status==="grace"&&safeTime(pre.graceEndsAt)<=now)return transaction(async(txn)=>{
   const doc=await readDoc(subPath,txn),sub=recordValue(doc);
   if(sub.status!=="grace"||safeTime(sub.graceEndsAt)>Date.now())return {writes:[],result:{skipped:true}};
   return {writes:[updateWrite(subPath,{status:"expired",updatedAt:nowIso()},doc)],result:{expired:true}};
  });
  if(pre.status==="cancelled")return transaction(async(txn)=>{
   const doc=await readDoc(subPath,txn),sub=recordValue(doc);
   if(sub.status!=="cancelled"||Date.now()<safeTime(sub.nextBillingAt))return {writes:[],result:{skipped:true}};
   return {writes:[updateWrite(subPath,{status:"expired",updatedAt:nowIso()},doc)],result:{expired:true}};
  });
  if(pre.lastAttemptDay===currentDay())return {skipped:true};
  return transaction(async(txn)=>{
   const walletPath=walletDocumentPath(username);
   const [doc,walletDoc]=await Promise.all([readDoc(subPath,txn),readDoc(walletPath,txn)]);
   const sub=recordValue(doc),wallet=recordValue(walletDoc);
   const dueMs=safeTime(sub.nextBillingAt),now=Date.now();
   if(!["active","grace"].includes(sub.status)||!dueMs||now<dueMs)return {writes:[],result:{skipped:true}};
   if(sub.status==="grace"&&now>=safeTime(sub.graceEndsAt))
    return {writes:[updateWrite(subPath,{status:"expired",updatedAt:nowIso()},doc)],result:{expired:true}};
   if(sub.lastAttemptDay===currentDay())return {writes:[],result:{skipped:true}};
   const available=spendableBalance(wallet),attemptDay=currentDay(),timestamp=nowIso();
   if(available<SHIELD_PRICE){
    const graceEndsAt=sub.graceEndsAt||new Date(dueMs+GRACE_DAYS*DAY_MS).toISOString();
    return {writes:[updateWrite(subPath,{status:"grace",graceEndsAt,
      lastAttemptDay:attemptDay,updatedAt:timestamp},doc)],result:{grace:true}};
   }
   const billingId="announcement-shield-renew-"+sub.itemId+"-"+sub.nextBillingAt.slice(0,10);
   const history=historyFor(username,billingId);
   const oldHistory=await readDoc(history,txn);
   if(oldHistory)err("รอบนี้ถูกหัก Sparks แล้ว กรุณาตรวจสอบข้อมูล",409);
   const newDue=nextShieldMonth(sub.nextBillingAt),year=currentMemberYear();
   return {writes:[
    updateWrite(walletPath,{username,balance:available-SHIELD_PRICE,balanceYear:year,
      totalSpent:toNumber(wallet.totalSpent)+SHIELD_PRICE,updatedAt:timestamp},walletDoc),
    createWrite(history,{createdAt:timestamp,type:"spend",source:"announcement-shield",
      title:"Announcement Shield · ต่ออายุอัตโนมัติ",
      detail:"ต่ออายุสมาชิก 1 เดือน 50 Sparks",amount:-SHIELD_PRICE,
      balanceAfter:available-SHIELD_PRICE,performedBy:"system-renewal",
      itemId:sub.itemId,billingDueAt:sub.nextBillingAt,status:"Completed"}),
    updateWrite(subPath,{status:"active",nextBillingAt:newDue,graceEndsAt:"",
      lastRenewalAt:timestamp,lastAttemptDay:attemptDay,updatedAt:timestamp},doc),
   ],result:{renewed:true}};
  });
 };
 const state=async(actor)=>{
  // A read-only Supabase migration Preview must never execute a renewal:
  // merely opening My Items cannot debit a wallet or mutate a ledger.
  if(!(process.env.SPARKS_DATA_BACKEND==="supabase" && process.env.SPARKS_CLOUD_READ_ONLY==="1"))
    await settleOne(actor.username);
  const sub=recordValue(await readDoc(documentFor(actor.username)));
  return {status:sub.status||"none",itemId:sub.itemId||"",purchasedAt:sub.purchasedAt||"",
   activatedAt:sub.activatedAt||"",nextBillingAt:sub.nextBillingAt||"",
   graceEndsAt:sub.graceEndsAt||"",cancelledAt:sub.cancelledAt||"",
   lastRenewalAt:sub.lastRenewalAt||"",entitled:shieldEntitled(sub),price:SHIELD_PRICE};
 };
 const sweep=async()=>{
  // Bounded listing once per day on the existing cron. No browser polling.
  const docs=await listCollection("qa_announcement_shield",["username","status","nextBillingAt","graceEndsAt","lastAttemptDay","cancelledAt"]);
  const targets=docs.documents.map(recordValue).filter(sub=>{
   if(!["active","grace","cancelled"].includes(sub.status))return false;
   return safeTime(sub.nextBillingAt)>0&&Date.now()>=safeTime(sub.nextBillingAt);
  }).slice(0,100);
  let renewed=0,grace=0,expired=0,errors=0;
  for(const row of targets){
   try{
    const res=await settleOne(String(row.username||"").trim().toLowerCase());
    if(res.renewed)renewed++;if(res.grace)grace++;if(res.expired)expired++;
   }catch(e){errors++;console.error("Shield recurring payment failed",String(e?.message||e));}
  }
  return {inspected:targets.length,renewed,grace,expired,errors,truncated:!!docs.truncated};
 };
 return {purchase,activate,cancel,state,sweep};
}
