import assert from "node:assert/strict";
import {createTypingReliefCloudService} from "../server/typingReliefCloudService.js";

// Offline Firestore + Supabase transaction fixture. Does not contact either
// backend and cannot charge a real Sparks wallet or change a QA assignment.
function fixture(){
 const maps={
   "qa_sparks_wallets/songpon":{username:"songpon",balance:250,typingReliefOwned:2,typingReliefUsed:0},
   "qa_typing_challenges/songpon":{username:"songpon",queue:[{id:"case-a",username:"songpon",word:"typing",mode:"word",repeatCount:10}],queueCount:1}
 };
 const docs=new Map(Object.entries(maps).map(([key,fields],i)=>[key,{fields,updateTime:"v"+(i+1)}]));
 let counter=10,failBeforeQA=false,failAfterQA=false,commits=0,qaCommits=0;
 const clone=o=>JSON.parse(JSON.stringify(o));
 const readDoc=async key=>docs.get(key)?clone(docs.get(key)):null;
 const recordValue=d=>d?.fields||{};
 const updateWrite=(key,fields,doc)=>({
   update:{name:key,fields},
   currentDocument:doc?{updateTime:doc.updateTime}:{exists:false},
 });
 const createWrite=(key,fields)=>({
   update:{name:key,fields},currentDocument:{exists:false},
 });
 const firestoreRequest=async(endpoint,method,body)=>{
   assert.equal(endpoint,":commit");
   assert.equal(method,"POST");
   const writes=body.writes;
   const next=new Map([...docs].map(([k,v])=>[k,clone(v)]));
   for(const write of writes){
     const key=write.update.name,old=next.get(key),pre=write.currentDocument;
     if(pre?.exists===false && old||pre?.updateTime&&old?.updateTime!==pre.updateTime)
       throw Object.assign(new Error("ABORTED"),{status:409,firestoreStatus:"ABORTED"});
     if(key.startsWith("qa_typing_challenges/")&&failBeforeQA){
       failBeforeQA=false;throw Object.assign(new Error("Firebase unreachable"),{status:503});
     }
     next.set(key,{fields:{...(old?.fields||{}),...clone(write.update.fields)},updateTime:"v"+(++counter)});
   }
   for(const [key,val] of next)docs.set(key,val);
   commits++;
   if(writes.some(x=>x.update.name.startsWith("qa_typing_challenges/"))){
     qaCommits++;
     if(failAfterQA){failAfterQA=false;throw Object.assign(new Error("Network timeout after Firebase commit"),{status:503});}
   }
   return {committedWrites:writes.length};
 };
 const svc=createTypingReliefCloudService({
   firestoreRequest,readDoc,recordValue,path:(...a)=>a.join("/"),
   updateWrite,createWrite,
   walletDocumentPath:username=>"qa_sparks_wallets/"+username,
   walletKey:username=>username,
   spendableBalance:wallet=>wallet.balance,
   currentMemberYear:()=>2026,
   listCollection:async root=>({documents:[...docs].filter(([k])=>k.startsWith(root+"/")).map(([name,v])=>({...clone(v),name}))})
 });
 const get=k=>clone(docs.get(k)?.fields||{});
 return {svc,docs,get,comms:()=>({commits,qaCommits}),failBeforeQA:()=>{failBeforeQA=true;},failAfterQA:()=>{failAfterQA=true;},
   changeQueue:()=>{
     const key="qa_typing_challenges/songpon",old=docs.get(key);
     docs.set(key,{fields:{...old.fields,queue:[{id:"different",word:"new",mode:"word",repeatCount:20}]},updateTime:"v"+(++counter)})
   }
 };
}
const actor={username:"songpon"};
const req={challengeId:"case-a"};
{
 const x=fixture();
 const first=await x.svc.use(req,actor);
 assert.equal(first.updated,true);
 assert.equal(first.remainingWords,4);
 assert.equal(first.appliedWords,6);
 assert.equal(x.get("qa_sparks_wallets/songpon").typingReliefOwned,1);
 assert.equal(x.get("qa_sparks_wallets/songpon").typingReliefUsed,1);
 assert.equal(x.get("qa_sparks_wallets/songpon").balance,250);
 assert.equal(x.get("qa_typing_challenges/songpon").queue[0].repeatCount,4);
 assert.equal(x.get("qa_typing_challenges/songpon").queue[0].typingReliefUsed,true);
 const replay=await x.svc.use(req,actor);
 assert.equal(replay.alreadyApplied,true);
 assert.equal(x.get("qa_sparks_wallets/songpon").typingReliefOwned,1);
 assert.equal(x.comms().qaCommits,1);
 const ledger=[...x.docs.keys()].filter(k=>k.includes("/history/typing-relief-use-"));
 assert.equal(ledger.length,1,"must write exactly one immutable history record");
 assert.equal(x.get(ledger[0]).amount,0,"activation uses inventory, not another Sparks deduction");
}
{
 const x=fixture();
 x.failBeforeQA();
 await assert.rejects(x.svc.use(req,actor),/Firebase unreachable/);
 assert.equal(x.get("qa_sparks_wallets/songpon").typingReliefOwned,1,"reserve once");
 assert.equal(x.get("qa_typing_challenges/songpon").queue[0].repeatCount,10);
 const summary=await x.svc.reconcilePending();
 assert.equal(summary.completed,1);
 assert.equal(summary.unresolved.length,0);
 assert.equal(x.get("qa_typing_challenges/songpon").queue[0].repeatCount,4);
 assert.equal(x.get("qa_sparks_wallets/songpon").typingReliefOwned,1);
 const replay=await x.svc.use(req,actor);
 assert.equal(replay.alreadyApplied,true);
}
{
 const x=fixture();
 x.failAfterQA();
 await assert.rejects(x.svc.use(req,actor),/Network timeout/);
 assert.equal(x.get("qa_typing_challenges/songpon").queue[0].repeatCount,4,"Firebase had committed");
 assert.equal(x.get("qa_sparks_wallets/songpon").typingReliefOwned,1,"Supabase reservation only once");
 const reply=await x.svc.use(req,actor);
 assert.equal(reply.updated,true);
 assert.equal(x.comms().qaCommits,1,"must not apply QA reduction twice");
 assert.equal([...x.docs.keys()].filter(k=>k.includes("/history/typing-relief-use-")).length,1);
}
{
 const x=fixture();
 x.failBeforeQA();
 await assert.rejects(x.svc.use(req,actor),/Firebase unreachable/);
 x.changeQueue();
 const report=await x.svc.reconcilePending();
 assert.equal(report.completed,0,"replaced QA assignment must not be consumed");
 assert.equal(report.unresolved.length,1,"pending operation requires attention");
 assert.equal(x.get("qa_sparks_wallets/songpon").typingReliefOwned,1,"no double debit during reconciliation");
}
{
 const x=fixture();
 await assert.rejects(x.svc.use({challengeId:"unknown"},actor),/QA Access Check/);
 assert.equal(x.get("qa_sparks_wallets/songpon").typingReliefOwned,2,"invalid assignment must not reserve inventory");
}
console.log("PASS Typing Relief Supabase/Firebase saga: exactly-once entitlement, 60% discount, retry after before/after QA write, cron recovery and changed challenge safety");
