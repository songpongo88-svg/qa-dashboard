// Peer-to-peer QA Sparks transfers. All writes run in one Supabase-backed
// Firestore-compatible transaction, with a fixed receipt preventing double debit.
const LIMIT=500;
const positive=value=>Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):0;
const error=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
const monthKey=()=>new Intl.DateTimeFormat("en-CA",{year:"numeric",month:"2-digit",timeZone:"Asia/Bangkok"}).format(new Date()).slice(0,7);
export function createSparksTransferService(db){
 const {firestoreRequest,readDoc,recordValue,path,updateWrite,createWrite,walletDocumentPath,
  spendableBalance,currentMemberYear,findProfileByUsername,isSuspendedProfile,listCollection,activeDirectory}=db;
 const monthPath=(username,key)=>path("qa_sparks_transfer_monthly_v1",encodeURIComponent(username)+"-"+key);
 const receiptPath=id=>path("qa_sparks_transfer_receipts_v1",id);
 async function readState(actor){
  const key=monthKey();
  const [walletDoc,monthDoc]=await Promise.all([readDoc(walletDocumentPath(actor.username)),readDoc(monthPath(actor.username,key))]);
  const used=positive(recordValue(monthDoc).sent);
  return {ok:true,month:key,monthlyLimit:LIMIT,sentThisMonth:used,remaining:Math.max(0,LIMIT-used),
   balance:spendableBalance(recordValue(walletDoc),currentMemberYear())};
 }
 async function recipients(actor){
  const members=activeDirectory
    ? (await activeDirectory()).map(row=>({username:row.username,displayName:row.displayName,status:"Active"}))
    : (await listCollection("qa_user_profiles",["username","displayName","firstName","lastName","status","suspendEffectiveDate","suspendEndDate","suspendAutoReactivate"])).documents.map(recordValue);
  const choices=members
    .filter(p=>p&&typeof p.username==="string"&&p.username.trim().toLowerCase()!==actor.username
      && !isSuspendedProfile(p)&&String(p.status||"Active").toLowerCase()!=="inactive")
    .map(p=>({username:p.username.toLowerCase(),
      displayName:String(p.displayName||[p.firstName,p.lastName].filter(Boolean).join(" ")||p.username).slice(0,120)}))
    .sort((a,b)=>a.displayName.localeCompare(b.displayName,"th"));
  return {ok:true,recipients:choices};
 }
 async function transfer(body,actor){
  const to=String(body.recipientUsername||"").trim().toLowerCase();
  const amount=Number(body.amount),id=String(body.requestId||"");
  if(!/^[a-z0-9._-]{2,90}$/.test(to)||to===actor.username)error("เลือกสมาชิกผู้รับที่ไม่ใช่บัญชีของตนเอง",400);
  if(!Number.isSafeInteger(amount)||amount<1||amount>LIMIT)error("โอนได้ครั้งละ 1–500 Sparks เท่านั้น",400);
  if(!/^[a-zA-Z0-9_-]{16,100}$/.test(id))error("รหัสยืนยันการโอนไม่ถูกต้อง",400);
  const target=activeDirectory
    ? (await activeDirectory()).find(row=>String(row.username||"").toLowerCase()===to)
    : await findProfileByUsername(to);
  if(!target||isSuspendedProfile(target)||String(target.status||"Active").toLowerCase()==="inactive")
    error("บัญชีผู้รับไม่พร้อมรับ Sparks",403);
  const month=monthKey(),year=currentMemberYear();
  for(let attempt=0;attempt<5;attempt++){
   const started=await firestoreRequest(":beginTransaction","POST",{options:{readWrite:{}}}),transaction=started?.transaction;
   if(!transaction)error("ไม่สามารถเริ่มธุรกรรมโอน Sparks ได้",503);
   let committed=false;
   try{
    const senderPath=walletDocumentPath(actor.username),targetPath=walletDocumentPath(to);
    const summaryPath=monthPath(actor.username,month),proofPath=receiptPath(id);
    const [proofDoc,senderDoc,receiverDoc,monthDoc]=await Promise.all([
      readDoc(proofPath,transaction),readDoc(senderPath,transaction),readDoc(targetPath,transaction),
      readDoc(summaryPath,transaction)
    ]);
    if(proofDoc){
      const existing=recordValue(proofDoc);
      if(existing.sender!==actor.username||existing.recipient!==to||existing.amount!==amount)
       error("รหัสรายการโอนถูกใช้กับข้อมูลอื่นแล้ว",409);
      return {ok:true,alreadyApplied:true,receipt:existing};
    }
    if(!senderDoc||!receiverDoc)error("ไม่พบกระเป๋า Sparks ของผู้ส่งหรือผู้รับ",404);
    const sender=recordValue(senderDoc),receiver=recordValue(receiverDoc),monthly=recordValue(monthDoc);
    const balance=spendableBalance(sender,year),recipientBalance=spendableBalance(receiver,year);
    const used=positive(monthly.sent);
    if(amount>LIMIT-used)error("ยอดโอนรวมเดือนนี้เกิน 500 Sparks (เหลือ "+Math.max(0,LIMIT-used)+")",409);
    if(balance<amount)error("Sparks คงเหลือไม่เพียงพอสำหรับโอน",409);
    const now=new Date().toISOString();
    const proof={sender:actor.username,recipient:to,recipientName:String(target.displayName||to).slice(0,120),
      amount,month,createdAt:now,status:"Completed",requestId:id};
    const writes=[
      updateWrite(senderPath,{username:actor.username,balance:balance-amount,balanceYear:year,
        totalTransferred:positive(sender.totalTransferred)+amount,updatedAt:now},senderDoc),
      updateWrite(targetPath,{username:to,balance:recipientBalance+amount,balanceYear:year,
        totalReceived:positive(receiver.totalReceived)+amount,updatedAt:now},receiverDoc),
      updateWrite(summaryPath,{username:actor.username,month,sent:used+amount,updatedAt:now},monthDoc),
      createWrite(proofPath,proof),
      createWrite(path("qa_sparks_wallets",encodeURIComponent(actor.username),"history","peer-transfer-out-"+id),{
        createdAt:now,type:"spend",source:"sparks-peer-transfer",title:"โอน Sparks ให้สมาชิก",
        amount:-amount,detail:"โอนให้ "+proof.recipientName+" ("+to+")",balanceAfter:balance-amount,
        performedBy:actor.username,recipientUsername:to,transferId:id,status:"Completed"}),
      createWrite(path("qa_sparks_wallets",encodeURIComponent(to),"history","peer-transfer-in-"+id),{
        createdAt:now,type:"earn",source:"sparks-peer-transfer",title:"รับ Sparks จากสมาชิก",
        amount,detail:"ได้รับจาก "+actor.username,balanceAfter:recipientBalance+amount,
        performedBy:actor.username,senderUsername:actor.username,transferId:id,status:"Completed"})
    ];
    await firestoreRequest(":commit","POST",{transaction,writes});
    committed=true;
    return {ok:true,receipt:proof,balanceAfter:balance-amount,remaining:LIMIT-used-amount};
   }catch(e){
    if(["ABORTED","FAILED_PRECONDITION"].includes(e?.firestoreStatus)&&attempt<4)continue;
    throw e;
   }finally{
    if(!committed)await firestoreRequest(":rollback","POST",{transaction}).catch(()=>{});
   }
  }
  error("มีการโอนพร้อมกัน กรุณาลองใหม่",409);
 }
 return {readState,recipients,transfer};
}
