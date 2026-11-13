import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 createQaAutoPassService, autoPassFreeActive,
 AUTO_PASS_PRICE, AUTO_PASS_FREE_QUANTITY,
} from "../server/qaAutoPassService.js";

// In-memory transport simulates Supabase Sparks and Firebase QA Access Check
// with CAS preconditions. No real user wallet, email or QA assignment is touched.
const PREFIX="projects/test/databases/(default)/documents";
const initial={
 "qa_sparks_wallets/alice":{username:"alice",balance:1000,totalSpent:0,typingReliefOwned:3,firstLogin:{amount:500}},
 "qa_typing_challenges/alice":{username:"alice",queue:[
  {id:"word-a",username:"alice",displayName:"Alice",word:"test",mode:"word",repeatCount:100,allowedMistakes:1,timeLimitSeconds:60,assignedAt:"2026-11-11T00:00:00Z",assignedBy:"QA"},
  {id:"sentence-b",username:"alice",displayName:"Alice",word:"test sentence",mode:"sentence",repeatCount:4,allowedMistakes:0,timeLimitSeconds:90,assignedAt:"2026-11-11T00:10:00Z",assignedBy:"QA"},
 ],queueCount:2},
};
let revision=1, commits=0,qaCommits=0, faultBeforeQA=false;
let time=Date.parse("2026-11-11T09:00:00+07:00");
const clone=x=>structuredClone(x);
const documents=new Map(Object.entries(initial).map(([key,value])=>[key,{fields:clone(value),updateTime:"v"+revision++}]));
const readDoc=async key=>documents.has(key)?clone(documents.get(key)):null;
const recordValue=doc=>doc?.fields||{};
const updateWrite=(key,fields,snap)=>({
 update:{name:PREFIX+"/"+key,fields},
 updateMask:{fieldPaths:Object.keys(fields)},
 currentDocument:snap?.updateTime?{updateTime:snap.updateTime}:{exists:false},
});
const createWrite=(key,fields)=>({
 update:{name:PREFIX+"/"+key,fields},currentDocument:{exists:false},
});
const firestoreRequest=async(endpoint,method,body)=>{
 assert.equal(endpoint,":commit");assert.equal(method,"POST");
 const writes=body.writes,changes=new Map(documents);
 const isQA=w=>(w.update?.name||w.delete||"").includes("/qa_typing_");
 if(writes.some(isQA)&&faultBeforeQA){faultBeforeQA=false;throw Object.assign(new Error("Simulated Firestore quota"),{status:429});}
 for(const write of writes){
  const key=(write.update?.name||write.delete).slice((PREFIX+"/").length);
  const old=changes.get(key),pre=write.currentDocument;
  if(pre?.exists===false&&old||pre?.updateTime&&old?.updateTime!==pre.updateTime)
   throw Object.assign(new Error("ABORTED"),{status:409,firestoreStatus:"ABORTED"});
  if(write.delete){changes.delete(key);continue;}
  const values=clone(write.update.fields);
  changes.set(key,{fields:{...(old?.fields||{}),...values},updateTime:"v"+revision++});
 }
 documents.clear();for(const [key,value] of changes)documents.set(key,value);
 commits++;if(writes.some(isQA))qaCommits++;
 return {committedWrites:writes.length};
};
const listCollection=async root=>({documents:[...documents].filter(([key])=>key.startsWith(root+"/")&&!key.slice(root.length+1).includes("/"))
 .map(([key,value])=>({...clone(value),name:PREFIX+"/"+key}))});
const svc=createQaAutoPassService({
 firestoreRequest,readDoc,recordValue,path:(...a)=>a.join("/"),updateWrite,createWrite,
 walletDocumentPath:name=>"qa_sparks_wallets/"+name.toLowerCase(),walletKey:name=>name.toLowerCase(),
 spendableBalance:wallet=>wallet.balance||0,currentMemberYear:()=>2026,
 listCollection,documentsResource:PREFIX,clock:()=>time,
});
const alice={username:"alice",displayName:"Alice"},charlie={username:"charlie"};
const doc=path=>documents.get(path)?.fields;
assert.equal(AUTO_PASS_PRICE,160);
assert.equal(AUTO_PASS_FREE_QUANTITY,5);
const rewardCardSource=readFileSync(new URL("../src/QaAutoPassRewardCard.tsx",import.meta.url),"utf8");
assert.match(rewardCardSource,/freeActive\?<span className="qa-auto-pass-card-pricing">/,"free campaign must be shown before claim and after claim");
assert.match(rewardCardSource,/รับฟรี 5 สิทธิ์/,"reward card must say free");
assert.match(rewardCardSource,/รับฟรีแล้ว/,"claimed users must see that their free allocation is already used");
assert.match(rewardCardSource,/ซื้อเพิ่ม.*Sparks/,"paid extra rights must be distinguished from the free claim");
assert.equal(autoPassFreeActive(Date.parse("2026-11-11T00:00:00+07:00")),true);
assert.equal(autoPassFreeActive(Date.parse("2026-12-25T23:59:59.999+07:00")),true);
assert.equal(autoPassFreeActive(Date.parse("2026-12-26T00:00:00+07:00")),false);

assert.equal((await svc.state(alice)).owned,0);
const noWallet=await svc.state(charlie);
assert.equal(noWallet.owned,0);
assert.equal(doc("qa_sparks_wallets/charlie"),undefined,"read-only state may not create a fake wallet");
const free=await svc.claimFree(charlie);
assert.equal(free.owned,5);
assert.equal(free.granted,5);
assert.equal(doc("qa_sparks_wallets/charlie").balance,0);
assert.equal(doc("qa_sparks_wallets/charlie").autoPassOwned,5);
assert.equal(doc("qa_sparks_wallets/charlie/history/qa-auto-pass-free-2026").amount,0);
const beforeReplay=commits;
assert.equal((await svc.claimFree(charlie)).alreadyApplied,true);
assert.equal(commits,beforeReplay,"refresh, retry and multiple tabs cannot claim free more than once");
assert.equal(doc("qa_sparks_wallets/charlie").autoPassOwned,5);

const first=await svc.claimFree(alice);
assert.equal(first.owned,5);
const purchase=await svc.purchase({expectedPrice:160,requestId:"purchase-autopass-123456789"},alice);
assert.equal(purchase.owned,6);
assert.equal(purchase.balance,840);
assert.equal(doc("qa_sparks_wallets/alice").typingReliefOwned,3,"Typing Relief is independent");
assert.equal(doc("qa_sparks_wallets/alice").totalSpent,160);
assert.equal(doc("qa_sparks_wallets/alice/history/qa-auto-pass-buy-purchase-autopass-123456789").amount,-160);
const beforeBuyReplay=commits;
assert.equal((await svc.purchase({expectedPrice:160,requestId:"purchase-autopass-123456789"},alice)).alreadyApplied,true);
assert.equal(commits,beforeBuyReplay);
await assert.rejects(svc.purchase({expectedPrice:0,requestId:"stale-buy-123456789"},alice),/ราคามีการเปลี่ยนแปลง/);

faultBeforeQA=true;
await assert.rejects(svc.use({challengeId:"word-a"},alice),/Simulated Firestore quota/);
assert.equal(doc("qa_sparks_wallets/alice").autoPassOwned,5,"only one item is reserved");
assert.equal(doc("qa_typing_challenges/alice").queue.length,2,"failed QA write cannot unlock QA results");
assert.equal([...documents.keys()].filter(x=>x.startsWith("qa_typing_challenge_history/")).length,0);
const recovered=await svc.use({challengeId:"word-a"},alice);
assert.equal(recovered.completed,true);
assert.equal(doc("qa_typing_challenges/alice").queue.length,1);
assert.equal(doc("qa_typing_challenges/alice").queue[0].mode,"sentence");
const historyKey=[...documents.keys()].find(x=>x.startsWith("qa_typing_challenge_history/"));
assert.equal(doc(historyKey).result,"Pass");
assert.equal(doc(historyKey).completionMethod,"auto-pass");
assert.equal(doc(historyKey).typedCount,100,"QA check credits all required units");
assert.equal(doc(historyKey).correctCount,100);
assert.equal(doc(historyKey).actualTypedCount,0,"never present simulated typing as real keystrokes");
assert.equal(doc("qa_sparks_wallets/alice").autoPassOwned,5,"recovery cannot consume another item");
const same=await svc.use({challengeId:"word-a"},alice);
assert.equal(same.alreadyApplied,true);
assert.equal(doc("qa_sparks_wallets/alice").autoPassOwned,5);

const sentence=await svc.use({challengeId:"sentence-b"},alice);
assert.equal(sentence.completed,true);
assert.equal(doc("qa_typing_challenges/alice"),undefined,"last QA Access task must be removed after auto-pass");
const qaProof=[...documents].filter(([key])=>key.startsWith("qa_typing_challenge_history/")).map(([,v])=>v.fields);
assert.equal(qaProof.length,2);
assert.equal(qaProof.find(x=>x.mode==="sentence")?.actualTypedCount,0); // mode on QA proof is not required
assert.equal(doc("qa_sparks_wallets/alice").autoPassOwned,4);
assert.equal(doc("qa_sparks_wallets/alice").balance,840);
assert.equal(doc("qa_sparks_wallets/alice").typingReliefOwned,3);

const pending=await svc.reconcilePending(12);
assert.equal(pending.unresolved.length,0);
time=Date.parse("2026-12-26T00:00:00+07:00");
assert.equal((await svc.state(charlie)).freeActive,false);
await assert.rejects(svc.claimFree({username:"never-used"}),/สิทธิ์รับฟรีสิ้นสุด/);
assert.equal(doc("qa_sparks_wallets/charlie").autoPassOwned,5,
  "claim deadline is not an item expiration");
console.log("PASS QA Auto-Pass: free 5 once (no wallet), 160 purchase, Word/Sentence pass, credited vs real typing, QA write failure recovery, history, deadline and no duplicate debit");
