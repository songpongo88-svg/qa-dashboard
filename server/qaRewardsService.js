import {createHash} from "node:crypto";

// These are internal QA Sparks reimbursements, not official brand vouchers.
export const SPECIAL_REWARDS=Object.freeze([
 {id:"punthai-65",title:"เครื่องดื่มพันธุ์ไทย",brand:"Punthai Coffee",price:6500,maxTHB:65,type:"receipt",monthlyLimit:1},
 {id:"netflix-1m",title:"Netflix 1 เดือน",brand:"Netflix",price:15000,maxTHB:0,type:"email",monthlyLimit:1},
 {id:"amazon-55",title:"เครื่องดื่ม Café Amazon",brand:"Café Amazon",price:8000,maxTHB:55,type:"receipt",monthlyLimit:1},
 {id:"seven-100",title:"ซื้อสินค้าที่ 7-Eleven",brand:"7-Eleven",price:20000,maxTHB:100,type:"receipt",monthlyLimit:1}
]);
const VALIDITY=30*86400000,MAX_ITEMS=200;
const C="qa_sparks_special_reward_requests";
const RECEIPTS="qa_sparks_special_receipt_evidence";
const LOCKS="qa_sparks_special_receipt_locks";
const err=(s,status=400)=>{throw Object.assign(new Error(s),{status});};
const n=v=>Number.isSafeInteger(Number(v))&&Number(v)>=0?Number(v):0;
const hash=s=>createHash("sha256").update(s).digest("hex");
const rewardFor=id=>{const x=SPECIAL_REWARDS.find(r=>r.id===id);if(!x)err("ไม่พบรางวัลที่เลือก");return x;};
const requestId=x=>{const v=String(x||"").trim();if(!/^[a-zA-Z0-9_-]{12,100}$/.test(v))err("รหัสคำขอไม่ถูกต้อง");return v;};
const itemId=x=>{const v=String(x||"").trim();if(!/^sr-[a-zA-Z0-9_-]{12,100}$/.test(v))err("หมายเลข Item ไม่ถูกต้อง");return v;};
const localDate=d=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).format(d);
const ym=d=>{const p=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit"}).formatToParts(d);return p.find(x=>x.type==="year").value+"-"+p.find(x=>x.type==="month").value;};
const normalizeReceipt=v=>{
 const raw=String(v||"").trim().toUpperCase().replace(/\s+/g,"").replace(/[-_]/g,"");
 if(!/^[A-Z0-9ก-๙]{4,70}$/.test(raw))err("กรุณากรอกเลขที่ใบเสร็จ 4–70 ตัวอักษร");return raw;
};
const receiptKey=(rewardId,receiptNo)=>hash(rewardId+":"+normalizeReceipt(receiptNo));
const jsonDate=v=>Number.isFinite(Date.parse(v))?String(v):"";
function decodedImage(data){
 const matched=/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(data||""));
 if(!matched||matched[2].length>480000)err("กรุณาแนบรูปใบเสร็จ JPG, PNG หรือ WebP ขนาดไม่เกิน 350 KB");
 const buf=Buffer.from(matched[2],"base64");
 if(buf.length<3000||buf.length>350000)err("ขนาดภาพใบเสร็จไม่ถูกต้อง");
 const jpeg=buf[0]===0xff&&buf[1]===0xd8;
 const png=buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const webp=buf.toString("ascii",0,4)==="RIFF"&&buf.toString("ascii",8,12)==="WEBP";
 if(!(jpeg||png||webp))err("ไฟล์แนบไม่ใช่รูปภาพใบเสร็จที่รองรับ");
 return {bytes:buf,dataUrl:String(data),imageHash:hash(buf)};
}
async function maybeOcr(image,getAccessToken){
 // Cloud Vision is optional. Missing permission/quota triggers manual inspection,
 // not a false positive automatic approval or silent bypass.
 try{
  const token=await getAccessToken();
  const response=await fetch("https://vision.googleapis.com/v1/images:annotate",{
   method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
   body:JSON.stringify({requests:[{image:{content:image.bytes.toString("base64")},
     features:[{type:"TEXT_DETECTION",maxResults:1}]}]}),
   signal:AbortSignal.timeout(9000)});
  if(!response.ok)return {status:"manual",text:"",reason:"OCR service unavailable"};
  const data=await response.json();
  const text=String(data?.responses?.[0]?.fullTextAnnotation?.text||"").slice(0,12000);
  return {status:text?"scanned":"manual",text,reason:text?"":"Unable to read text"};
 }catch{return {status:"manual",text:"",reason:"OCR service unavailable"};}
}
const brandPattern=id=>({
 "punthai-65":/พันธุ์ไทย|พันธุไท|PUNTHAI|PUN THAI/i,
 "amazon-55":/AMAZON|อเมซอน|อเมซ่อน|CAF[EÉ]/i,
 "seven-100":/7-ELEVEN|7 ELEVEN|เซเว่น|7-11|CPALL/i
})[id];
function reviewOCR(ocr,reward,receiptNo,amount,receiptAt){
 if(ocr.status!=="scanned")return {status:"manual",reason:"OCR ไม่พร้อมหรืออ่านใบเสร็จไม่ครบ ต้องให้ Admin ตรวจสอบ"};
 const text=ocr.text;
 const plain=text.toUpperCase().replace(/[\\s\\-_]/g,"");
 const merchant=brandPattern(reward.id).test(text);
 const receipt=plain.includes(normalizeReceipt(receiptNo));
 const amountString=Number(amount).toFixed(2);
 const amountReg=new RegExp("(^|[^0-9])"+String(Number(amount)).replace(".","\\.")+"(?:\\.00)?([^0-9]|$)");
 const money=text.includes(amountString)||amountReg.test(text);
 const ts=new Date(receiptAt);
 const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Bangkok",day:"2-digit",month:"2-digit",year:"numeric"}).formatToParts(ts);
 const get=k=>parts.find(x=>x.type===k)?.value||"";
 const day=get("day"),month=get("month"),year=get("year");
 const thaiYear=String(Number(year)+543),thaiShort=thaiYear.slice(-2),short=year.slice(-2);
 const normalized=text.replace(/[.\\-]/g,"/").replace(/\\s+/g," ");
 const forms=[day+"/"+month+"/"+year,day+"/"+month+"/"+thaiYear,
   day+"/"+month+"/"+short,day+"/"+month+"/"+thaiShort,
   year+"/"+month+"/"+day,thaiYear+"/"+month+"/"+day];
 const date= forms.some(x=>normalized.includes(x));
 const missing=[!merchant?"อ่านชื่อร้านค้าไม่ชัด":null,!receipt?"เลขที่ใบเสร็จในภาพไม่ตรง/อ่านไม่ชัด":null,
   !money?"ยอดชำระไม่ชัด":null,!date?"วันที่ใบเสร็จไม่ชัด":null].filter(Boolean);
 return {status:missing.length?"manual":"matched",
   reason:missing.length?"ต้องให้ Admin ตรวจสอบ: "+missing.join(" · "):"OCR ตรวจพบร้านค้า เลขใบเสร็จ วันที่ และยอดเงินตรงกับข้อมูลที่กรอก"};
}

export function createQaRewardsService(db){
 const {firestoreRequest,readDoc,recordValue,updateWrite,createWrite,
   walletDocumentPath,currentMemberYear,spendableBalance,listCollection,path,getAccessToken}=db;
 const wpath=username=>walletDocumentPath(username);
 const itemList=wallet=>Array.isArray(wallet.specialRewardItems)?wallet.specialRewardItems.filter(x=>x&&typeof x.itemId==="string").slice(-MAX_ITEMS):[];
 const hpath=(username,suffix)=>path("qa_sparks_wallets",encodeURIComponent(username),"history",suffix);
 const rpath=id=>path(C,id),evidencePath=id=>path(RECEIPTS,id);
 async function txRun(callback){
  for(let attempt=0;attempt<4;attempt++){
   const started=await firestoreRequest(":beginTransaction","POST",{options:{readWrite:{}}});
   const transaction=started?.transaction;if(!transaction)err("ไม่สามารถเริ่มบันทึก Sparks ได้",503);
   let done=false;
   try{
    const {result,writes}=await callback(transaction);
    if(writes.length){await firestoreRequest(":commit","POST",{transaction,writes});done=true;}
    return result;
   }catch(e){if(["ABORTED","FAILED_PRECONDITION"].includes(e?.firestoreStatus)&&attempt<3)continue;throw e;}
   finally{if(!done)await firestoreRequest(":rollback","POST",{transaction}).catch(()=>{});}
  }
  err("มีรายการพร้อมกัน กรุณาลองใหม่",409);
 }
 async function mine(actor){
  const wallet=recordValue(await readDoc(wpath(actor.username)));
  return {catalog:SPECIAL_REWARDS,items:itemList(wallet),expiryDays:30};
 }
 async function redeem(body,actor){
  const reward=rewardFor(body.rewardId),reqId=requestId(body.requestId),item="sr-"+reqId,wp=wpath(actor.username);
  return txRun(async txn=>{
   const hp=hpath(actor.username,"special-redeem-"+reqId);
   const [wd,hd]=await Promise.all([readDoc(wp,txn),readDoc(hp,txn)]);
   const wallet=recordValue(wd),items=itemList(wallet),year=currentMemberYear();
   if(hd){
     const entry=recordValue(hd);
     if(entry.itemId===item)return {writes:[],result:{alreadyApplied:true,item:items.find(x=>x.itemId===item)||null}};
     err("รหัสการแลกนี้ถูกใช้งานแล้ว",409);
   }
   if(items.length>=MAX_ITEMS)err("จำนวน Item เต็ม กรุณาติดต่อ Admin",409);
   const now=new Date(),month=ym(now);
   if(items.filter(x=>x.rewardId===reward.id&&ym(new Date(x.redeemedAt))===month).length>=reward.monthlyLimit)
     err("แลกรางวัลประเภทนี้ครบ 1 สิทธิ์ในเดือนนี้แล้ว",409);
   const balance=spendableBalance(wallet,year);
   if(balance<reward.price)err("Sparks ไม่เพียงพอสำหรับรางวัลนี้",409);
   const itemRow={itemId:item,rewardId:reward.id,title:reward.title,price:reward.price,
     status:"unused",redeemedAt:now.toISOString(),expiresAt:new Date(now.getTime()+VALIDITY).toISOString(),
     activatedAt:"",submittedAt:"",requestId:""};
   const next=balance-reward.price;
   return {writes:[
     updateWrite(wp,{username:actor.username,balance:next,balanceYear:year,
       totalSpent:n(wallet.totalSpent)+reward.price,rewardOrders:n(wallet.rewardOrders)+1,
       specialRewardItems:[...items,itemRow],updatedAt:now.toISOString()},wd),
     createWrite(hp,{createdAt:now.toISOString(),type:"spend",source:"special-reward",
       rewardId:reward.id,itemId:item,title:reward.title+" Redeemed",
       detail:"แลก "+reward.price+" Sparks · อายุ 30 วัน",amount:-reward.price,
       balanceAfter:next,performedBy:actor.username,status:"Completed"})
   ],result:{updated:true,item:itemRow,balance:next}};
  });
 }
 async function activate(body,actor){
  const id=itemId(body.itemId),wp=wpath(actor.username);
  return txRun(async txn=>{
   const wd=await readDoc(wp,txn),wallet=recordValue(wd),items=itemList(wallet),index=items.findIndex(x=>x.itemId===id);
   if(index<0)err("Item ไม่อยู่ในบัญชีนี้",403);
   const item=items[index];if(item.status!=="unused")return {writes:[],result:{item}};
   const now=new Date();if(now.getTime()>=Date.parse(item.expiresAt))err("Item หมดอายุ 30 วันแล้ว",409);
   const next=[...items];next[index]={...item,status:"activated",activatedAt:now.toISOString()};
   return {writes:[updateWrite(wp,{specialRewardItems:next,updatedAt:now.toISOString()},wd)],
    result:{updated:true,item:next[index]}};
  });
 }
 async function receiptCheck(body,actor){
   const reward=rewardFor(body.rewardId);
   if(reward.type!=="receipt")err("รางวัลนี้ไม่ใช้ใบเสร็จ");
   const key=receiptKey(reward.id,body.receiptNumber);
   const existing=await readDoc(path(LOCKS,key));
   return {duplicate:Boolean(existing),valid:true};
 }
 async function submit(body,actor){
   const id=itemId(body.itemId),wp=wpath(actor.username);
   const wallet=recordValue(await readDoc(wp));const it=itemList(wallet).find(x=>x.itemId===id);
   if(!it)err("Item ไม่อยู่ในบัญชีนี้",403);
   const reward=rewardFor(it.rewardId);
   if(it.status!=="activated")err("กรุณากดใช้ Item ก่อนส่งคำขอ",409);
   if(!jsonDate(it.activatedAt))err("ไม่พบเวลาที่กดใช้ Item",409);
   let details={},image=null;
   if(reward.type==="receipt"){
     const phone=String(body.promptPay||"").trim();
     if(!/^0[0-9]{9}$/.test(phone))err("กรุณากรอกเบอร์พร้อมเพย์ 10 หลัก",400);
     const no=normalizeReceipt(body.receiptNumber);
     const amount=Number(body.amountTHB),time=String(body.receiptAt||"");
     if(!Number.isFinite(amount)||amount<=0||amount>30000||Math.round(amount*100)!==amount*100)
       err("ยอดเงินตามใบเสร็จไม่ถูกต้อง",400);
     const millis=Date.parse(time);
     if(!Number.isFinite(millis)||millis<Date.parse(it.activatedAt)||millis>Date.now()+5*60000)
       err("วันและเวลาใบเสร็จต้องอยู่หลังเวลากดใช้ Item และไม่เกินเวลาปัจจุบัน",400);
     image=decodedImage(body.imageData);
     const ocr=await maybeOcr(image,getAccessToken);
     const verify=reviewOCR(ocr,reward,no,amount,new Date(millis).toISOString());
     details={receiptNumber:no,receiptAt:new Date(millis).toISOString(),amountTHB:amount,
       payoutTHB:Math.round(Math.min(amount,reward.maxTHB)*100)/100,
       promptPay:phone,ocrStatus:verify.status,ocrNote:verify.reason,imageHash:image.imageHash};
   }else{
     const email=String(body.email||"").trim().toLowerCase();
     if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))err("อีเมล Netflix ไม่ถูกต้อง",400);
     if(body.neverPaid!==true)err("ต้องยืนยันว่าอีเมลไม่เคยเป็นสมาชิก Netflix ที่ถูกเรียกเก็บค่าบริการมาก่อน",400);
     details={email,neverPaidAttested:true};
   }
   const noKey=reward.type==="receipt"?path(LOCKS,receiptKey(reward.id,details.receiptNumber)):"";
   const imageKey=image?path(LOCKS,"image-"+image.imageHash):"";
   return txRun(async txn=>{
     const requestPath=rpath(id);
     const reads=[readDoc(wp,txn),readDoc(requestPath,txn)];
     if(noKey)reads.push(readDoc(noKey,txn),readDoc(imageKey,txn));
     const documents=await Promise.all(reads);
     const currentWallet=recordValue(documents[0]),items=itemList(currentWallet),index=items.findIndex(x=>x.itemId===id);
     if(index<0)err("Item ไม่อยู่ในบัญชีนี้",403);
     const current=items[index];
     if(documents[1]||current.status==="submitted"||current.status==="paid"||current.status==="delivered"){
       const previous=recordValue(documents[1]);
       if(previous.username===actor.username)return {writes:[],result:{alreadyApplied:true,request:publicRequest(previous)}};
       err("คำขอเคยถูกส่งแล้ว",409);
     }
     if(current.status!=="activated")err("Item ยังไม่พร้อมส่งคำขอ",409);
     if(reward.type==="receipt"&&(documents[2]||documents[3]))
       err("เลขที่ใบเสร็จหรือรูปใบเสร็จนี้เคยใช้ส่งคำขอแล้ว ไม่สามารถส่งซ้ำได้",409);
     const now=new Date().toISOString(),next=[...items];
     next[index]={...current,status:"submitted",submittedAt:now,requestId:id};
     const request={requestId:id,itemId:id,rewardId:reward.id,title:reward.title,
       username:actor.username,displayName:actor.displayName,status:"pending_review",
       createdAt:now,redeemedAt:current.redeemedAt,activatedAt:current.activatedAt,...details};
     const writes=[
       updateWrite(wp,{specialRewardItems:next,updatedAt:now},documents[0]),
       createWrite(requestPath,request),
       createWrite(hpath(actor.username,"special-submit-"+id),{
         createdAt:now,type:"earn",source:"special-reward",rewardId:reward.id,itemId:id,
         title:reward.title+" Request",detail:"ส่งคำขอให้ Admin ตรวจสอบ",
         amount:0,balanceAfter:spendableBalance(currentWallet),performedBy:actor.username,status:"Completed"})
     ];
     if(noKey){
       writes.push(createWrite(noKey,{rewardId:reward.id,receiptNumber:details.receiptNumber,
         requestId:id,createdAt:now}));
       writes.push(createWrite(imageKey,{rewardId:reward.id,requestId:id,createdAt:now}));
       writes.push(createWrite(evidencePath(id),{requestId:id,username:actor.username,
         imageData:image.dataUrl,imageHash:image.imageHash,createdAt:now}));
     }
     return {writes,result:{updated:true,request:publicRequest(request)}};
   });
 }
 function publicRequest(r){
   const {promptPay,email,...safe}=r;
   return {...safe,promptPayMasked:promptPay?"******"+promptPay.slice(-4):"",email:email||""};
 }
 async function adminList(){
   const found=await listCollection(C,["requestId","itemId","rewardId","title","username","displayName",
     "status","createdAt","amountTHB","payoutTHB","promptPay","email","ocrStatus","ocrNote",
     "receiptNumber","receiptAt","adminNote","resolvedAt","resolvedBy"]);
   return {requests:found.documents.map(recordValue).sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))),
     truncated:found.truncated};
 }
 async function adminReceipt(body){
   const id=itemId(body.itemId);
   const req=recordValue(await readDoc(rpath(id)));
   if(!req.itemId)err("ไม่พบคำขอ",404);
   if(rewardFor(req.rewardId).type!=="receipt")err("รายการนี้ไม่ใช้ใบเสร็จ");
   const image=recordValue(await readDoc(evidencePath(id)));
   if(!image.imageData)err("ยังไม่มีภาพใบเสร็จ",404);
   return {imageData:image.imageData,receiptNumber:req.receiptNumber,receiptAt:req.receiptAt};
 }
 async function adminAction(body,admin){
   const id=itemId(body.itemId),action=String(body.decision||"");
   if(!["approve","reject","complete"].includes(action))err("การดำเนินการไม่ถูกต้อง");
   const note=String(body.note||"").trim().slice(0,350);
   if(action==="reject"&&note.length<4)err("กรุณาระบุเหตุผลที่ไม่อนุมัติ",400);
   return txRun(async txn=>{
    const reqpath=rpath(id),reqdoc=await readDoc(reqpath,txn),request=recordValue(reqdoc);
    if(!reqdoc)err("ไม่พบคำขอ",404);
    const wp=wpath(request.username);
    const walletDoc=await readDoc(wp,txn),wallet=recordValue(walletDoc),items=itemList(wallet),
      index=items.findIndex(i=>i.itemId===id),reward=rewardFor(request.rewardId);
    if(index<0)err("Item ของคำขอไม่อยู่ในบัญชี",409);
    let status;
    if(action==="approve"){
      if(request.status==="approved")return {writes:[],result:{status:"approved",alreadyApplied:true}};
      if(request.status!=="pending_review")err("สถานะรายการไม่พร้อมอนุมัติ",409);
      status="approved";
    }else if(action==="reject"){
      if(request.status==="rejected")return {writes:[],result:{status:"rejected",alreadyApplied:true}};
      if(!["pending_review","approved"].includes(request.status))err("สถานะรายการไม่พร้อมปฏิเสธ",409);
      status="rejected";
    }else{
      if(["paid","delivered"].includes(request.status))return {writes:[],result:{status:request.status,alreadyApplied:true}};
      if(request.status!=="approved")err("ต้องอนุมัติคำขอก่อนยืนยันการจ่ายหรือจัดส่งสิทธิ์",409);
      status=reward.type==="email"?"delivered":"paid";
    }
    const now=new Date().toISOString(),next=[...items];
    next[index]={...next[index],status,processedAt:now};
    const hp=hpath(request.username,"special-admin-"+action+"-"+id);
    const hdoc=await readDoc(hp,txn);
    if(hdoc)return {writes:[],result:{status:request.status,alreadyApplied:true}};
    const writes=[
      updateWrite(reqpath,{status,adminNote:note||String(request.adminNote||""),
        resolvedAt:now,resolvedBy:admin.username},reqdoc),
      updateWrite(wp,{specialRewardItems:next,updatedAt:now},walletDoc),
      createWrite(hp,{createdAt:now,type:"earn",source:"special-reward-admin",rewardId:reward.id,
        itemId:id,title:reward.title+" · "+status,detail:note||"Admin บันทึกสถานะ "+status,
        amount:0,balanceAfter:spendableBalance(wallet),performedBy:admin.username,status:"Completed"})
    ];
    return {writes,result:{updated:true,status}};
   });
 }
 return {mine,redeem,activate,receiptCheck,submit,adminList,adminReceipt,adminAction};
}
