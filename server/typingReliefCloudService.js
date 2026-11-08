import { createHash } from "node:crypto";

// Safely coordinates a Supabase Sparks entitlement with the Firebase-owned
// QA Access Check. No transaction claims to span the two databases. A durable
// Supabase operation is reserved first, then the Firestore challenge is updated
// with an idempotent marker, then the Supabase ledger is finalized. A retry
// resumes the same operation instead of consuming another item.
//
// If a challenge has disappeared or been replaced mid-flight, the reservation
// remains visible to reconciliation; it is NEVER silently refunded or marked
// complete without verifying the Firestore application.
export function createTypingReliefCloudService({
  firestoreRequest, readDoc, recordValue, path, updateWrite, createWrite,
  walletDocumentPath, walletKey, spendableBalance, currentMemberYear,
  listCollection,
}) {
  const check= (condition,message,status=409)=>{
    if(!condition)throw Object.assign(new Error(message),{status,code:"TYPING_RELIEF_RECONCILIATION_REQUIRED"});
  };
  const int=(v)=>Number.isSafeInteger(Number(v))&&Number(v)>=0?Number(v):0;
  const stableId=(username,challengeId)=>"typing-relief-use-"+
    createHash("sha256").update(username+"|"+challengeId).digest("hex").slice(0,40);
  const operationPath=(id)=>path("qa_sparks_typing_relief_operations",id);
  const challengePath=(username)=>path("qa_typing_challenges",username.replace(/\s+/g,"_"));
  const historyPath=(username,id)=>path("qa_sparks_wallets",walletKey(username),"history",id);
  function targetFrom(doc,challengeId){
    const data=recordValue(doc);
    const queue=Array.isArray(data.queue)?data.queue.map(x=>({...x})):[data];
    check(queue[0]?.id===challengeId,"QA Access Check เปลี่ยนจากภารกิจเดิมแล้ว ต้องตรวจรายการ Typing Relief ก่อนทำต่อ");
    const target=queue[0];
    check((target.mode||(/\s/.test(String(target.word||""))?"sentence":"word"))==="word",
      "Typing Relief ใช้ได้เฉพาะภารกิจแบบ Word Mode",400);
    return {queue,target};
  }
  const already=(op)=>({
    updated:false,alreadyApplied:true,balance:int(op.balanceAfter),
    owned:int(op.inventoryAfter),remainingWords:int(op.remainingWords),
    appliedWords:int(op.appliedWords)
  });
  async function finalize(actor,id,opDoc){
    const op=recordValue(opDoc);
    if(op.status==="completed")return already(op);
    check(op.status==="applying"||op.status==="reserved","สถานะ Typing Relief ไม่พร้อมสรุป");
    const currentChallenge=await readDoc(challengePath(actor.username));
    check(currentChallenge,"QA Access Check ถูกลบก่อนบันทึกผล Typing Relief");
    const {target}=targetFrom(currentChallenge,op.challengeId);
    check(target.typingReliefOperationId===id && target.typingReliefUsed===true
      && Number(target.repeatCount)===Number(op.remainingWords),
      "ยังไม่พบหลักฐานว่า QA Access Check ใช้ Typing Relief สำเร็จ");
    const now=new Date().toISOString();
    const ledger={
      createdAt:now,type:"redeem",source:"reward-activation",
      rewardId:"typing-relief",title:"Typing Relief Activated",
      detail:"ใช้ Typing Relief กับ QA Access Check",
      challengeId:op.challengeId,originalWords:op.originalWords,
      remainingWords:op.remainingWords,appliedWords:op.appliedWords,
      reductionPercent:60,amount:0,balanceAfter:op.balanceAfter,
      inventoryAfter:op.inventoryAfter,performedBy:actor.username,
      status:"Completed",operationId:id
    };
    const ledgerPath=historyPath(actor.username,id);
    const ledgerDoc=await readDoc(ledgerPath);
    if(ledgerDoc){
      const recorded=recordValue(ledgerDoc);
      check(recorded.operationId===id,"พบประวัติ Typing Relief ที่ไม่ตรงกับรายการนี้");
      if(op.status==="completed")return already(op);
      // The history record is durable; only the operation status needs retry.
      await firestoreRequest(":commit","POST",{writes:[
        updateWrite(operationPath(id),{status:"completed",completedAt:now},opDoc)
      ]});
      return already({...op,status:"completed"});
    }
    await firestoreRequest(":commit","POST",{writes:[
      updateWrite(operationPath(id),{status:"completed",completedAt:now},opDoc),
      createWrite(ledgerPath,ledger),
    ]});
    return {updated:true,balance:int(op.balanceAfter),owned:int(op.inventoryAfter),
      remainingWords:int(op.remainingWords),appliedWords:int(op.appliedWords)};
  }
  async function resume(actor,id,existing){
    const operation=recordValue(existing);
    check(operation.username===actor.username && operation.operationId===id,
      "ข้อมูลผู้ใช้ในรายการ Typing Relief ไม่ตรงกัน");
    if(operation.status==="completed")return already(operation);
    check(["reserved","applying"].includes(operation.status),
      "สถานะคำขอ Typing Relief ไม่ถูกต้อง");
    const qaDoc=await readDoc(challengePath(actor.username));
    check(qaDoc,"ภารกิจ QA Access Check ไม่อยู่ในระบบแล้ว กรุณาตรวจสอบรายการค้าง");
    const {queue,target}=targetFrom(qaDoc,operation.challengeId);
    if(target.typingReliefOperationId===id && target.typingReliefUsed===true){
      return finalize(actor,id,existing);
    }
    check(!target.typingReliefUsed,"ภารกิจถูกปรับด้วยสิทธิ์อื่นแล้ว ต้องตรวจสอบรายการค้าง");
    check(Number(target.repeatCount)===Number(operation.originalWords),
      "จำนวนคำของภารกิจถูกเปลี่ยนระหว่างทำรายการ กรุณาตรวจสอบก่อนใช้สิทธิ์");
    let opDoc=existing;
    if(operation.status==="reserved"){
      await firestoreRequest(":commit","POST",{writes:[
        updateWrite(operationPath(id),{status:"applying",applyingAt:new Date().toISOString()},existing),
      ]});
      opDoc=await readDoc(operationPath(id));
      check(opDoc,"ไม่พบข้อมูลการใช้ Typing Relief หลังจองสิทธิ์");
    }
    const next=[...queue];
    next[0]={...target,repeatCount:int(operation.remainingWords),typingReliefUsed:true,
      typingReliefOperationId:id};
    // Existing Firestore QA store continues to own the challenge queue.
    // Firestore rejects an update if an admin changed that queue meanwhile.
    await firestoreRequest(":commit","POST",{writes:[
      updateWrite(challengePath(actor.username),{queue:next,queueCount:next.length},qaDoc),
    ]});
    const current=await readDoc(operationPath(id));
    check(current,"ไม่พบรายการหลังปรับ QA Access Check");
    return finalize(actor,id,current);
  }
  async function use(body,actor){
    const challengeId=String(body?.challengeId||"").trim();
    check(Boolean(challengeId)&&challengeId.length<=180&&!challengeId.includes("/"),
      "ไม่พบภารกิจที่ต้องการใช้ Typing Relief",400);
    const id=stableId(actor.username,challengeId);
    const existing=await readDoc(operationPath(id));
    if(existing)return resume(actor,id,existing);
    const qaDoc=await readDoc(challengePath(actor.username));
    check(qaDoc,"ไม่พบภารกิจ QA Access Check",409);
    const {target}=targetFrom(qaDoc,challengeId);
    check(target.typingReliefUsed!==true,"ภารกิจนี้ถูกใช้สิทธิ์แล้ว");
    const words=Number(target.repeatCount);
    check(Number.isSafeInteger(words)&&words>=1&&words<=500,
      "จำนวนคำของภารกิจไม่ถูกต้อง",400);
    const remainingWords=Math.max(1,Math.ceil(words*0.4));
    const walletPath=walletDocumentPath(actor.username);
    const walletDoc=await readDoc(walletPath);
    const wallet=recordValue(walletDoc);
    const owned=int(wallet.typingReliefOwned);
    check(walletDoc&&owned>=1,"ไม่มี Typing Relief คงเหลือ กรุณาแลกก่อน",400);
    const now=new Date().toISOString();
    const balance=int(spendableBalance(wallet));
    const operation={
      operationId:id,username:actor.username,challengeId,
      status:"reserved",reservedAt:now,originalWords:words,remainingWords,
      appliedWords:words-remainingWords,
      balanceAfter:balance,inventoryAfter:owned-1,
      challengeVersion:qaDoc.updateTime||""
    };
    // CAS + immutable operation ID prevents concurrent tabs from using two items.
    try{
      await firestoreRequest(":commit","POST",{writes:[
        updateWrite(walletPath,{
          username:actor.username,balance,balanceYear:currentMemberYear(),
          typingReliefOwned:owned-1,typingReliefUsed:int(wallet.typingReliefUsed)+1,
          updatedAt:now
        },walletDoc),
        createWrite(operationPath(id),operation),
      ]});
    }catch(error){
      if(["ABORTED","FAILED_PRECONDITION"].includes(error?.firestoreStatus)){
        const collided=await readDoc(operationPath(id));
        if(collided)return resume(actor,id,collided);
      }
      throw error;
    }
    const reserved=await readDoc(operationPath(id));
    check(reserved,"ไม่พบข้อมูลจองสิทธิ์ Typing Relief");
    return resume(actor,id,reserved);
  }
  async function reconcilePending(limit=12){
    const capped=Math.max(1,Math.min(20,Number(limit)||12));
    const records=await listCollection("qa_sparks_typing_relief_operations");
    const pending=(records.documents||[]).filter(doc=>{
      const row=recordValue(doc);
      return ["reserved","applying"].includes(row.status)&&row.username&&row.challengeId;
    }).slice(0,capped);
    const output={scanned:pending.length,completed:0,unresolved:[]};
    for(const row of pending){
      const op=recordValue(row);
      try{await resume({username:op.username},op.operationId,row);output.completed++;}
      catch(error){output.unresolved.push({operationId:op.operationId,
        code:String(error?.code||"RECONCILIATION_RETRY_REQUIRED")});}
    }
    return output;
  }
  return {use,reconcilePending};
}
