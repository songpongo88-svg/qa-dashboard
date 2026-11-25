// One purchase per wallet; balance, ownership and both ledger entries commit atomically.
export const BUTTERBEAR_PRICE=1600, BUTTERBEAR_RETURN=3600, BUTTERBEAR_DAILY=20, BUTTERBEAR_BIRTHDAY=500, BUTTERBEAR_MONTHLY=300;
export const butterbearActive=w=>Boolean(w.butterbearPurchasedAt)&&w.memberCardSkin==="butterbear";
export function createButterbearService({readDoc,recordValue,firestoreRequest,updateWrite,createWrite,walletDocumentPath,walletKey,path,spendableBalance,annualEarnedFromWallet,currentMemberYear,intCount,bangkokQuestDate,fail}){
 const view=w=>({ok:true,owned:Boolean(w.butterbearPurchasedAt),active:butterbearActive(w),monthlyClaimed:w.butterbearMonthlyKey===bangkokQuestDate().slice(0,7),balance:spendableBalance(w)});
 return async function run(body,actor){
  const walletPath=walletDocumentPath(actor.username);
  if(body.action==="butterbear-state")return view(recordValue(await readDoc(walletPath)));
  for(let i=0;i<4;i++){
   try{
    const snap=await readDoc(walletPath),w=recordValue(snap),state=view(w),now=new Date().toISOString(),month=bangkokQuestDate().slice(0,7),year=currentMemberYear();
    const ledger=id=>path("qa_sparks_wallets",walletKey(actor.username),"history",id);
    const entry=(title,detail,amount,balanceAfter,source)=>({title,detail,amount,balanceAfter,source,type:amount>0?"earn":amount<0?"spend":"event",createdAt:now,performedBy:actor.username,status:"Completed"});
    let updates={},extra=[];
    if(body.action==="butterbear-buy"){
     if(state.owned)return {...state,alreadyApplied:true};
     if(Number(body.expectedPrice)!==BUTTERBEAR_PRICE)fail("ราคาไม่ตรงกับรายการ กรุณาตรวจสอบใหม่",409);
     if(state.balance<BUTTERBEAR_PRICE)fail("Sparks ไม่เพียงพอ",400);
     const after=state.balance-BUTTERBEAR_PRICE;
     updates={butterbearPurchasedAt:now,memberCardSkin:"butterbear",balance:after+BUTTERBEAR_RETURN,balanceYear:year,totalSpent:intCount(w.totalSpent)+BUTTERBEAR_PRICE,totalEarned:Math.max(intCount(w.totalEarned),intCount(w.firstLogin?.amount))+BUTTERBEAR_RETURN,memberYear:year,memberYearEarned:annualEarnedFromWallet(w,year)+BUTTERBEAR_RETURN,rewardOrders:intCount(w.rewardOrders)+1};
     extra=[createWrite(ledger("butterbear-card-purchase"),entry("Butterbear Special Edition","แลกซื้อดีไซน์บัตรสมาชิกพิเศษ",-BUTTERBEAR_PRICE,after,"member-card-purchase")),createWrite(ledger("butterbear-card-return"),entry("Butterbear Purchase Bonus","รับคะแนนคืนจากการแลกซื้อบัตรสมาชิก",BUTTERBEAR_RETURN,updates.balance,"member-card-bonus"))];
    }else if(body.action==="butterbear-select"){
     if(!state.owned)fail("ยังไม่ได้รับสิทธิ์บัตร Butterbear",403);
     if(!["default","butterbear"].includes(body.skin))fail("ไม่พบรูปแบบบัตร",400);
     updates={memberCardSkin:body.skin};
    }else if(body.action==="butterbear-monthly"){
     if(!state.active)fail("กรุณาเลือกใช้งานบัตร Butterbear ก่อนรับสิทธิ์",409);
     if(state.monthlyClaimed)return {...state,alreadyApplied:true};
     updates={butterbearMonthlyKey:month,balance:state.balance+BUTTERBEAR_MONTHLY,balanceYear:year,totalEarned:Math.max(intCount(w.totalEarned),intCount(w.firstLogin?.amount))+BUTTERBEAR_MONTHLY,memberYear:year,memberYearEarned:annualEarnedFromWallet(w,year)+BUTTERBEAR_MONTHLY};
     extra=[createWrite(ledger("butterbear-monthly-"+month),entry("Butterbear Monthly Gift","รับของขวัญประจำเดือน "+month,BUTTERBEAR_MONTHLY,updates.balance,"member-card-bonus"))];
    }else fail("ไม่พบรายการ",400);
    await firestoreRequest(":commit","POST",{writes:[updateWrite(walletPath,{...updates,username:actor.username,updatedAt:now},snap),...extra]});
    return view({...w,...updates});
   }catch(e){if(["ABORTED","FAILED_PRECONDITION","ALREADY_EXISTS"].includes(e?.firestoreStatus)&&i<3)continue;throw e;}
  }
  fail("ไม่สามารถบันทึกรายการพร้อมกันได้",409);
 };
}
