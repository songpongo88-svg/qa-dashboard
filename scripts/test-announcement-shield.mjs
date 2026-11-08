import assert from "node:assert/strict";
import {createAnnouncementShieldService,nextShieldMonth,shieldEntitled} from "../server/announcementShieldService.js";
import {readFile} from "node:fs/promises";

assert.equal(nextShieldMonth("2026-01-31T07:00:00.000Z"),"2026-02-28T07:00:00.000Z","Jan 31 clamps to Feb 28 in Bangkok");
assert.equal(nextShieldMonth("2026-11-08T06:00:00.000Z"),"2026-12-08T06:00:00.000Z");
const docs=new Map(),versions=new Map();
const username="agent",walletPath="qa_sparks_wallets/agent",subPath="qa_announcement_shield/agent";
docs.set(walletPath,{username,balance:200,totalSpent:0,rewardOrders:0,balanceYear:2026});
const snap=p=>docs.has(p)?{data:structuredClone(docs.get(p)),updateTime:String(versions.get(p)||1)}:null;
let commits=0;
const deps={
 path:(...args)=>args.join("/"),readDoc:async p=>snap(p),
 recordValue:x=>x?.data||{},
 updateWrite:(p,v,o)=>({action:"update",p,v,old:o}),
 createWrite:(p,v)=>({action:"create",p,v}),
 listCollection:async()=>({documents:[snap(subPath)],truncated:false}),
 walletDocumentPath:()=>walletPath,
 spendableBalance:w=>Number(w.balance)||0,
 currentMemberYear:()=>2026,
 firestoreRequest:async(endpoint,method,body)=>{
  if(endpoint===":beginTransaction")return {transaction:"test"};
  if(endpoint===":rollback")return {};
  assert.equal(endpoint,":commit");
  for(const w of body.writes){
   const old=snap(w.p);
   if(w.action==="create")assert.equal(old,null,"each charge must have immutable, unique receipt");
   else assert.equal(String(w.old?.updateTime||""),String(old?.updateTime||""),"stale write forbidden");
  }
  for(const w of body.writes){
   docs.set(w.p,{...(docs.get(w.p)||{}),...structuredClone(w.v)});
   versions.set(w.p,(versions.get(w.p)||1)+1);
  }
  commits++;
  return {};
 }
};
const service=createAnnouncementShieldService(deps);
const actor={username,displayName:"Agent"};
assert.equal((await service.state(actor)).status,"none");
await service.purchase(actor);
assert.equal(docs.get(walletPath).balance,150,"initial purchase costs 50");
assert.equal(docs.get(walletPath).rewardOrders,1);
assert.equal((await service.state(actor)).status,"unused");
await assert.rejects(()=>service.purchase(actor),/อยู่แล้ว/);
await service.activate(actor);
const active=await service.state(actor);
assert.equal(active.status,"active");
assert.equal(active.entitled,true);
assert.ok(Date.parse(active.nextBillingAt)>Date.now());
assert.ok(shieldEntitled(docs.get(subPath)));
const firstDue=new Date(Date.now()-3600000).toISOString();
docs.set(subPath,{...docs.get(subPath),nextBillingAt:firstDue});
await service.sweep();
assert.equal(docs.get(walletPath).balance,100,"cron renews 50 without user login");
assert.equal(docs.get(subPath).status,"active");
await service.sweep();
assert.equal(docs.get(walletPath).balance,100,"same cycle must never bill twice");
const afterRenewal=docs.get(subPath);
assert.equal(afterRenewal.nextBillingAt,nextShieldMonth(firstDue),"calendar cycle remains anchored to due date");
// Insufficient balance starts fourteen-day grace and keeps suppression active.
docs.set(walletPath,{...docs.get(walletPath),balance:20});
const lowDue=new Date(Date.now()-3600000).toISOString();
docs.set(subPath,{...docs.get(subPath),nextBillingAt:lowDue,lastAttemptDay:"",graceEndsAt:""});
await service.sweep();
const grace=docs.get(subPath);
assert.equal(grace.status,"grace");
assert.equal(shieldEntitled(grace),true);
assert.equal(Math.round((Date.parse(grace.graceEndsAt)-Date.parse(lowDue))/86400000),14);
assert.equal(docs.get(walletPath).balance,20,"insufficient funds cannot overdraw");
docs.set(walletPath,{...docs.get(walletPath),balance:80});
docs.set(subPath,{...grace,lastAttemptDay:""});
await service.sweep();
assert.equal(docs.get(walletPath).balance,30,"grace renewal retries and charges once");
assert.equal(docs.get(subPath).status,"active");
const future=new Date(Date.now()+10*86400000).toISOString();
docs.set(subPath,{...docs.get(subPath),nextBillingAt:future,lastAttemptDay:""});
await service.cancel(actor);
assert.equal((await service.state(actor)).status,"cancelled");
assert.equal((await service.state(actor)).entitled,true,"cancelled paid time remains usable");
await assert.rejects(()=>service.purchase(actor),/อยู่แล้ว/);
docs.set(subPath,{...docs.get(subPath),nextBillingAt:new Date(Date.now()-1000).toISOString()});
await service.sweep();
assert.equal(docs.get(subPath).status,"expired","cancellation ends at paid expiry");
assert.equal((await service.state(actor)).entitled,false);
assert.equal(docs.get(walletPath).balance,30,"cancellation cannot renew");
docs.set(walletPath,{...docs.get(walletPath),balance:150});
await service.purchase(actor);
await service.activate(actor);
docs.set(walletPath,{...docs.get(walletPath),balance:0});
const expiredDue=new Date(Date.now()-15*86400000).toISOString();
docs.set(subPath,{...docs.get(subPath),nextBillingAt:expiredDue,status:"grace",
  graceEndsAt:new Date(Date.parse(expiredDue)+14*86400000).toISOString()});
await service.sweep();
assert.equal(docs.get(subPath).status,"expired","14-day grace eventually expires without user login");
assert.equal(docs.get(walletPath).balance,0);
assert.ok(commits>=7);
const backend=await readFile("api/sparks-admin.js","utf8");
assert.match(backend,/announcement-shield-state/);
assert.match(backend,/announcementShield\.sweep\(\)/);
const frontend=await readFile("src/AnnouncementHub.tsx","utf8");
assert.match(frontend,/announcementShieldMaySuppress/);
assert.match(frontend,/item\.actionRequired!=="Acknowledge"/);
assert.match(frontend,/setShieldEntitled\(data\.entitled===true\)/);
console.log("PASS Announcement Shield: purchase+activate, monthly cron renewal, 14-day grace, cancellation, no duplicate billing and preserved critical popups");
