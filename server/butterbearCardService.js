// One purchase per wallet; balance, ownership and both ledger entries commit atomically.
export const BUTTERBEAR_PRICE=1600, BUTTERBEAR_RETURN=3600, BUTTERBEAR_DAILY=20, BUTTERBEAR_BIRTHDAY=500, BUTTERBEAR_MONTHLY=300;
export function butterbearExpiresAt(w){
 const purchased=new Date(w.butterbearPurchasedAt||"");if(!Number.isFinite(purchased.getTime()))return "";
 const local=new Date(purchased.getTime()+7*3600000),m=local.getUTCMonth();local.setUTCFullYear(local.getUTCFullYear()+1);if(local.getUTCMonth()!==m)local.setUTCDate(0);
 return new Date(local.getTime()-7*3600000).toISOString();
}
export const butterbearActive=(w,now=Date.now())=>Boolean(w.butterbearPurchasedAt)&&!w.butterbearForfeitedAt&&Date.parse(butterbearExpiresAt(w))>now;
export function createButterbearService({readDoc,recordValue,firestoreRequest,updateWrite,createWrite,walletDocumentPath,walletKey,path,spendableBalance,annualEarnedFromWallet,currentMemberYear,intCount,bangkokQuestDate,fail}){
 const view=w=>({ok:true,owned:Boolean(w.butterbearPurchasedAt),active:butterbearActive(w),purchasedAt:w.butterbearPurchasedAt||"",expiresAt:butterbearExpiresAt(w),forfeited:Boolean(w.butterbearForfeitedAt),birthdayClaimedAt:w["birthdayClaimed"+currentMemberYear()+"At"]||"",monthlyClaimed:w.butterbearMonthlyKey===bangkokQuestDate().slice(0,7),balance:spendableBalance(w)});
 return async function run(body,actor){
  const walletPath=walletDocumentPath(actor.username);
  if(body.action==="butterbear-state"){const snap=await readDoc(walletPath),w=recordValue(snap);if(!w.butterbearPurchasedAt||butterbearActive(w)||w.butterbearForfeitedAt||w.butterbearExpiredAt)return view(w);try{const stamp=butterbearExpiresAt(w);if(stamp&&Date.parse(stamp)<=Date.now())await firestoreRequest(":commit","POST",{writes:[updateWrite(walletPath,{butterbearExpiredAt:stamp,memberCardSkin:"default",updatedAt:new Date().toISOString()},snap),createWrite(path("qa_sparks_wallets",walletKey(actor.username),"history","butterbear-card-expired"),{createdAt:stamp,type:"event",source:"member-card-expired",title:"Special Membership Card Expired",detail:"บัตรสมาชิกพิเศษหมดอายุ กลับไปใช้บัตร Default",amount:0,balanceAfter:spendableBalance(w),performedBy:actor.username,status:"Completed"})]});}catch(e){if(!["ABORTED","FAILED_PRECONDITION","ALREADY_EXISTS"].includes(e?.firestoreStatus))throw e;}return view(w);}
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
     extra=[createWrite(ledger("butterbear-card-purchase"),entry("Special Membership Card Purchase","แลกซื้อบัตร Butterbear – Golden Bakery Edition",-BUTTERBEAR_PRICE,after,"member-card-purchase")),createWrite(ledger("butterbear-card-return"),entry("Special Membership Card Bonus","รับคะแนนคืนจากการแลกซื้อบัตรสมาชิก",BUTTERBEAR_RETURN,updates.balance,"member-card-bonus"))];
    }else if(body.action==="butterbear-select"){
     fail("ไม่สามารถสลับบัตรสมาชิกได้",409);
    }else if(body.action==="butterbear-monthly"){
     if(!state.active)fail("บัตรสมาชิกพิเศษไม่อยู่ในระยะเวลาใช้งาน",409);
     if(state.monthlyClaimed)return {...state,alreadyApplied:true};
     updates={butterbearMonthlyKey:month,balance:state.balance+BUTTERBEAR_MONTHLY,balanceYear:year,totalEarned:Math.max(intCount(w.totalEarned),intCount(w.firstLogin?.amount))+BUTTERBEAR_MONTHLY,memberYear:year,memberYearEarned:annualEarnedFromWallet(w,year)+BUTTERBEAR_MONTHLY};
     extra=[createWrite(ledger("butterbear-monthly-"+month),entry("Special Card Monthly Gift","รับของขวัญประจำเดือน "+month,BUTTERBEAR_MONTHLY,updates.balance,"member-card-bonus"))];
    }else fail("ไม่พบรายการ",400);
    await firestoreRequest(":commit","POST",{writes:[updateWrite(walletPath,{...updates,username:actor.username,updatedAt:now},snap),...extra]});
    return view({...w,...updates});
   }catch(e){if(["ABORTED","FAILED_PRECONDITION","ALREADY_EXISTS"].includes(e?.firestoreStatus)&&i<3)continue;throw e;}
  }
  fail("ไม่สามารถบันทึกรายการพร้อมกันได้",409);
 };
}
