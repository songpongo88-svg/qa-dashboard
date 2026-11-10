import { createHash } from "node:crypto";

// QA Access Auto-Pass: 1 item completes 1 current QA typing assignment.
// Sparks balances and item inventory live in Supabase, QA Access assignments
// and pass records remain in Firebase. Use a durable, resumable operation;
// never imply a cross-database atomic transaction.
export const AUTO_PASS_PRICE = 160;
export const AUTO_PASS_FREE_QUANTITY = 5;
export const AUTO_PASS_FREE_START = Date.parse("2026-11-11T00:00:00+07:00");
export const AUTO_PASS_FREE_END_EXCLUSIVE = Date.parse("2026-12-26T00:00:00+07:00");
export const AUTO_PASS_FREE_HISTORY_ID = "qa-auto-pass-free-2026";

export function autoPassFreeActive(at=Date.now()) {
  const time=at instanceof Date?at.getTime():Number(at);
  return Number.isFinite(time)&&time>=AUTO_PASS_FREE_START&&time<AUTO_PASS_FREE_END_EXCLUSIVE;
}

export function createQaAutoPassService({
  firestoreRequest, readDoc, recordValue, path, updateWrite, createWrite,
  walletDocumentPath, walletKey, spendableBalance, currentMemberYear,
  listCollection, documentsResource, clock=()=>Date.now(),
}) {
  const check=(ok,message,status=409)=>{if(!ok)throw Object.assign(new Error(message),{status,code:"QA_AUTO_PASS_NOT_APPLIED"});};
  const count=v=>Number.isSafeInteger(Number(v))&&Number(v)>=0?Number(v):0;
  const walletHistory=(username,id)=>path("qa_sparks_wallets",walletKey(username),"history",id);
  const operationPath=id=>path("qa_sparks_auto_pass_operations",id);
  const challengePath=username=>path("qa_typing_challenges",username.trim().toLowerCase().replace(/\//g,"__").replace(/\s+/g," "));
  const qaHistoryPath=id=>path("qa_typing_challenge_history",id);
  const operationId=(username,challengeId)=>"qa-auto-pass-use-"+
    createHash("sha256").update(username+"|"+challengeId).digest("hex").slice(0,40);
  const currentChallenge=(snap,id)=>{
    const row=recordValue(snap);
    const queue=Array.isArray(row.queue)?row.queue.map(x=>({...x})):[row];
    const head=queue[0];
    check(head&&head.id===id,"QA Access Check เปลี่ยนภารกิจแล้ว ยังไม่หัก Auto-Pass",409);
    check(head.mode==="word"||head.mode==="sentence"
      ||(head.word&&head.repeatCount),"ไม่พบภารกิจ QA Access Check ที่รองรับ Auto-Pass",400);
    check(Number.isSafeInteger(Number(head.repeatCount))&&Number(head.repeatCount)>=1
      &&Number(head.repeatCount)<=500,"จำนวนคำหรือรอบไม่ถูกต้อง",400);
    check(!head.autoPassOperationId,"ภารกิจนี้เคยใช้ Auto-Pass แล้ว",409);
    return {head,queue,row};
  };
  const readBalance=wallet=>count(spendableBalance(wallet));
  async function state(actor) {
    const wallet=recordValue(await readDoc(walletDocumentPath(actor.username)));
    return {
      owned:count(wallet.autoPassOwned),balance:readBalance(wallet),
      freeClaimed:Boolean(wallet.autoPassFreeClaimedAt),
      freeActive:autoPassFreeActive(clock()),freeQuantity:AUTO_PASS_FREE_QUANTITY,
      normalPrice:AUTO_PASS_PRICE,freeEndDate:"2026-12-25",
    };
  }
  async function claimFree(actor){
    check(autoPassFreeActive(clock()),"สิทธิ์รับฟรีสิ้นสุดวันที่ 25 ธันวาคม 2026 แล้ว",400);
    const walletPath=walletDocumentPath(actor.username);
    const ledgerPath=walletHistory(actor.username,AUTO_PASS_FREE_HISTORY_ID);
    for(let attempt=0;attempt<4;attempt++){
      const [walletDoc,prior]=await Promise.all([readDoc(walletPath),readDoc(ledgerPath)]);
      const wallet=recordValue(walletDoc);
      if(prior||wallet.autoPassFreeClaimedAt){
        return {alreadyApplied:true,owned:count(wallet.autoPassOwned),freeClaimed:true};
      }
      const now=new Date(clock()).toISOString(),owned=count(wallet.autoPassOwned)+AUTO_PASS_FREE_QUANTITY;
      const balance=readBalance(wallet);
      const updates={
        username:actor.username,balance,balanceYear:currentMemberYear(),
        autoPassOwned:owned,autoPassFreeClaimedAt:now,
        autoPassReceived:count(wallet.autoPassReceived)+AUTO_PASS_FREE_QUANTITY,
        updatedAt:now,
      };
      const history={
        createdAt:now,type:"reward",source:"qa-auto-pass-free",rewardId:"qa-access-auto-pass",
        title:"QA Access Auto-Pass · Free 5",
        detail:"รับฟรี 5 สิทธิ์พร้อมกัน 1 ครั้งต่อบัญชี ภายใน 25 ธันวาคม 2026",
        quantity:AUTO_PASS_FREE_QUANTITY,amount:0,balanceAfter:balance,
        inventoryAfter:owned,performedBy:actor.username,status:"Completed",
      };
      try {
        await firestoreRequest(":commit","POST",{writes:[
          updateWrite(walletPath,updates,walletDoc),createWrite(ledgerPath,history),
        ]});
        return {updated:true,freeClaimed:true,owned,granted:AUTO_PASS_FREE_QUANTITY,balance};
      }catch(error){
        if(["ABORTED","FAILED_PRECONDITION"].includes(error?.firestoreStatus)&&attempt<3)continue;
        throw error;
      }
    }
    check(false,"มีการรับสิทธิ์พร้อมกัน กรุณาลองใหม่");
  }
  async function purchase(body,actor){
    const expected=Number(body.expectedPrice);
    check(expected===AUTO_PASS_PRICE,"ราคามีการเปลี่ยนแปลง กรุณาเปิด Item ใหม่",409);
    const requestId=String(body.requestId||"").trim();
    check(/^[a-zA-Z0-9_-]{16,100}$/.test(requestId),"รหัสรายการซื้อไม่ถูกต้อง",400);
    const walletPath=walletDocumentPath(actor.username);
    const ledgerPath=walletHistory(actor.username,"qa-auto-pass-buy-"+requestId);
    for(let attempt=0;attempt<4;attempt++){
      const [walletDoc,existing]=await Promise.all([readDoc(walletPath),readDoc(ledgerPath)]);
      const wallet=recordValue(walletDoc);
      if(existing){
        const prior=recordValue(existing);
        check(prior.rewardId==="qa-access-auto-pass"&&prior.source==="reward-redemption",
          "รหัสรายการซ้ำกับรางวัลอื่น");
        return {alreadyApplied:true,owned:count(prior.inventoryAfter),balance:count(prior.balanceAfter)};
      }
      const balance=readBalance(wallet);
      check(balance>=AUTO_PASS_PRICE,"Sparks ไม่เพียงพอ ต้องใช้ 160 Sparks",400);
      const owned=count(wallet.autoPassOwned)+1;
      const now=new Date(clock()).toISOString(),nextBalance=balance-AUTO_PASS_PRICE;
      const changes={
        username:actor.username,balance:nextBalance,balanceYear:currentMemberYear(),
        autoPassOwned:owned,autoPassPurchased:count(wallet.autoPassPurchased)+1,
        totalSpent:count(wallet.totalSpent)+AUTO_PASS_PRICE,
        rewardOrders:count(wallet.rewardOrders)+1,updatedAt:now,
      };
      const ledger={
        createdAt:now,type:"spend",source:"reward-redemption",
        rewardId:"qa-access-auto-pass",title:"QA Access Auto-Pass Purchased",
        detail:"ซื้อ QA Access Auto-Pass 1 สิทธิ์",amount:-AUTO_PASS_PRICE,
        price:AUTO_PASS_PRICE,inventoryAfter:owned,balanceAfter:nextBalance,
        performedBy:actor.username,requestId,status:"Completed",
      };
      try{
        await firestoreRequest(":commit","POST",{writes:[
          updateWrite(walletPath,changes,walletDoc),createWrite(ledgerPath,ledger),
        ]});
        return {updated:true,owned,balance:nextBalance};
      }catch(error){
        if(["ABORTED","FAILED_PRECONDITION"].includes(error?.firestoreStatus)&&attempt<3)continue;
        throw error;
      }
    }
    check(false,"มีการซื้อพร้อมกัน กรุณาลองใหม่");
  }
  const already=op=>({updated:false,alreadyApplied:true,owned:count(op.inventoryAfter),balance:count(op.balanceAfter),completed:true});
  async function finalize(actor,id,operationDoc,qaProof){
    const op=recordValue(operationDoc);
    if(op.status==="completed")return already(op);
    check(qaProof,"ยังไม่พบหลักฐานผ่าน QA Access Check ด้วย Auto-Pass",409);
    const proof=recordValue(qaProof);
    check(proof.operationId===id&&proof.username?.toLowerCase()===actor.username.toLowerCase()
      &&proof.completionMethod==="auto-pass"&&proof.challengeId===op.challengeId,
      "หลักฐาน QA Access Auto-Pass ไม่ตรงกับรายการที่ใช้",409);
    const ledgerPath=walletHistory(actor.username,id),oldLedger=await readDoc(ledgerPath);
    const now=new Date(clock()).toISOString();
    const writes=[updateWrite(operationPath(id),{status:"completed",completedAt:now},operationDoc)];
    if(!oldLedger){
      writes.push(createWrite(ledgerPath,{
        createdAt:now,type:"redeem",source:"reward-activation",
        rewardId:"qa-access-auto-pass",title:"QA Access Auto-Pass Used",
        detail:"ผ่าน QA Access Check ด้วย Auto-Pass ("+(op.mode==="sentence"?"Sentence Mode":"Word Mode")+")",
        challengeId:op.challengeId,mode:op.mode,quantity:1,
        amount:0,balanceAfter:op.balanceAfter,
        inventoryAfter:op.inventoryAfter,performedBy:actor.username,
        operationId:id,status:"Completed",
      }));
    }else{
      check(recordValue(oldLedger).operationId===id,"ประวัติการใช้ Item ซ้ำไม่ตรงกับรายการนี้");
    }
    await firestoreRequest(":commit","POST",{writes});
    return {updated:true,owned:count(op.inventoryAfter),balance:count(op.balanceAfter),completed:true};
  }
  async function resume(actor,id,opDoc){
    const op=recordValue(opDoc);
    check(op.username===actor.username&&op.operationId===id,"ข้อมูลบัญชีในรายการ Auto-Pass ไม่ตรงกัน");
    if(op.status==="completed")return already(op);
    check(op.status==="reserved","การใช้ Auto-Pass ยังไม่พร้อมดำเนินการ");
    const proofPath=qaHistoryPath(id);
    const existingProof=await readDoc(proofPath);
    if(existingProof)return finalize(actor,id,opDoc,existingProof);
    const qaPath=challengePath(actor.username);
    const qaDoc=await readDoc(qaPath);
    check(qaDoc,"ไม่พบภารกิจต้นฉบับ กรุณาตรวจสอบรายการ Auto-Pass ที่ค้าง",409);
    const {head,queue,row}=currentChallenge(qaDoc,op.challengeId);
    check(head.word===op.word&&head.assignedAt===op.assignedAt&&
      Number(head.repeatCount)===Number(op.repeatCount),
      "ภารกิจเปลี่ยนแปลงหลังจอง Auto-Pass กรุณาตรวจสอบก่อนดำเนินการ",409);
    const remainder=queue.slice(1);
    const now=new Date(clock()).toISOString();
    const qaHistory={
      username:actor.username,displayName:head.displayName||op.displayName||actor.username,
      word:head.word,repeatCount:Number(head.repeatCount),
      // The user is credited with completion by a licensed item, NOT actual typing.
      typedCount:Number(head.repeatCount),correctCount:Number(head.repeatCount),
      actualTypedCount:0,mistakeCount:0,allowedMistakes:Number(head.allowedMistakes)||0,
      timeLimitSeconds:Number(head.timeLimitSeconds)||60,timeUsedSeconds:0,
      result:"Pass",completionMethod:"auto-pass",completedViaItem:"qa-access-auto-pass",
      challengeId:op.challengeId,operationId:id,
      completedAt:now,assignedAt:head.assignedAt||"",assignedBy:head.assignedBy||"",
      createdAtServer:now,
    };
    const qaWrite=remainder.length
      ?updateWrite(qaPath,{queue:remainder,queueCount:remainder.length,
          displayName:remainder[0]?.displayName||"",updatedAtServer:now},qaDoc)
      :{delete:documentsResource+"/"+qaPath,currentDocument:qaDoc.updateTime?{updateTime:qaDoc.updateTime}:undefined};
    // Single Firebase commit: no fabricated Pass row unless queue completion
    // is committed at the same time. Supabase item is already reserved.
    await firestoreRequest(":commit","POST",{writes:[
      qaWrite,createWrite(proofPath,qaHistory),
    ]});
    const durableProof=await readDoc(proofPath);
    check(durableProof,"ไม่พบหลักฐานการผ่าน QA Access Check หลังบันทึก",409);
    return finalize(actor,id,opDoc,durableProof);
  }
  async function use(body,actor){
    const challengeId=String(body.challengeId||"").trim();
    check(Boolean(challengeId)&&challengeId.length<=180&&!challengeId.includes("/"),
      "กรุณาเลือกภารกิจ QA Access Check ก่อนใช้ Item",400);
    const id=operationId(actor.username,challengeId);
    const operationDoc=await readDoc(operationPath(id));
    if(operationDoc)return resume(actor,id,operationDoc);
    const qaDoc=await readDoc(challengePath(actor.username));
    check(qaDoc,"ไม่มี QA Access Check ที่ต้องทำ",409);
    const {head}=currentChallenge(qaDoc,challengeId);
    const walletPath=walletDocumentPath(actor.username);
    const walletDoc=await readDoc(walletPath);
    const wallet=recordValue(walletDoc),owned=count(wallet.autoPassOwned);
    check(walletDoc&&owned>0,"ไม่มี QA Access Auto-Pass คงเหลือ",400);
    const now=new Date(clock()).toISOString(),balance=readBalance(wallet);
    const operation={
      operationId:id,username:actor.username,challengeId,
      word:head.word,mode:head.mode||(/\s/.test(String(head.word))?"sentence":"word"),
      assignedAt:head.assignedAt||"",displayName:head.displayName||actor.displayName||actor.username,
      repeatCount:Number(head.repeatCount),status:"reserved",reservedAt:now,
      inventoryAfter:owned-1,balanceAfter:balance,
    };
    try{
      await firestoreRequest(":commit","POST",{writes:[
        updateWrite(walletPath,{username:actor.username,
          autoPassOwned:owned-1,autoPassUsed:count(wallet.autoPassUsed)+1,
          updatedAt:now},walletDoc),
        createWrite(operationPath(id),operation),
      ]});
    }catch(error){
      if(["ABORTED","FAILED_PRECONDITION"].includes(error?.firestoreStatus)){
        const collided=await readDoc(operationPath(id));
        if(collided)return resume(actor,id,collided);
      }
      throw error;
    }
    const persisted=await readDoc(operationPath(id));
    check(persisted,"ระบบจองสิทธิ์แล้วแต่ยังตรวจรายการไม่สำเร็จ กรุณาลองใหม่",503);
    return resume(actor,id,persisted);
  }
  async function reconcilePending(limit=12){
    const max=Math.min(20,Math.max(1,Number(limit)||12));
    const docs=await listCollection("qa_sparks_auto_pass_operations");
    const pending=(docs.documents||[]).filter(d=>recordValue(d).status==="reserved").slice(0,max);
    const out={scanned:pending.length,completed:0,unresolved:[]};
    for(const doc of pending){
      const op=recordValue(doc);
      try{await resume({username:op.username,displayName:op.displayName},op.operationId,doc);out.completed++;}
      catch(error){out.unresolved.push({operationId:op.operationId,code:String(error?.code||"QA_AUTO_PASS_RETRY_REQUIRED")});}
    }
    return out;
  }
  return {state,claimFree,purchase,use,reconcilePending};
}
