import {readPayoutSlipLocally} from "./localPayoutSlipOcr";
const byId=(id:string)=>document.getElementById(id)!;
const fileInput=byId("file") as HTMLInputElement;
const status=byId("status");
const result=byId("result");
const fields=byId("fields");
const warning=byId("warnings");
const preview=byId("preview") as HTMLImageElement;
const raw=byId("raw");
const description=byId("description");
let chosenObjectUrl="";
let active=0;
function say(message:string,kind="info"){
  status.textContent=message;status.dataset.kind=kind;
}
const money=(v:number|null|undefined)=>v===null||v===undefined?"อ่านไม่พบ":v.toLocaleString("th-TH",{minimumFractionDigits:2,maximumFractionDigits:2})+" บาท";
function date(iso:string|undefined){
  if(!iso)return "อ่านไม่พบ";
  const value=new Date(iso);
  if(!Number.isFinite(value.getTime()))return "อ่านไม่พบ";
  return value.toLocaleString("th-TH",{timeZone:"Asia/Bangkok",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"});
}
function field(label:string,value:string,wide=false){
  const box=document.createElement("div");box.className="kv"+(wide?" wide":"");
  const key=document.createElement("div");key.className="key";key.textContent=label;
  const val=document.createElement("div");val.className="val";val.textContent=value||"อ่านไม่พบ";
  box.append(key,val);fields.append(box);
}
async function toDataUrl(file:File):Promise<string>{
  return await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result||""));
    reader.onerror=()=>reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
    reader.readAsDataURL(file);
  });
}
fileInput.addEventListener("change",async()=>{
  const file=fileInput.files?.[0];if(!file)return;
  const turn=++active;
  result.classList.add("hidden");fields.replaceChildren();warning.classList.add("hidden");
  if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>8*1024*1024){
    say("ใช้รูปภาพ JPG, PNG, WebP ที่มีขนาดไม่เกิน 8 MB เท่านั้น","warn");return;
  }
  fileInput.disabled=true;
  say("กำลังอ่านข้อความภาษาไทยและอังกฤษจากภาพในเครื่อง… อาจใช้เวลาสักครู่");
  try{
    const data=await toDataUrl(file);
    const scan=await readPayoutSlipLocally(data);
    if(turn!==active)return;
    const f=scan.fields;
    field("ธนาคารหรือ Wallet ที่ออกสลิป",f.bank||"");
    field("สถานะที่ปรากฏ",f.isSuccessful?"รายการสำเร็จ (ข้อความจากภาพ)":"อ่านข้อความสถานะไม่ชัด");
    field("วันที่และเวลา",date(f.payoutAt));
    field("ยอดเงิน",money(f.amountTHB));
    field("ค่าธรรมเนียม",money(f.feeTHB));
    field("หมายเลขอ้างอิง (สั้น)",f.shortReference||"");
    field("เลขที่อ้างอิง / เลขธุรกรรม",f.longReference||f.transactionRef||"",true);
    field("ผู้โอน",f.senderName||"");
    field("ธนาคารผู้โอน",f.senderBank||"");
    field("เลขบัญชีผู้โอนที่แสดง",f.senderAccountMasked||"");
    field("ผู้รับ",f.recipientName||f.recipientLabel||"");
    field("ธนาคารผู้รับ",f.recipientBank||"");
    field("เลขบัญชีผู้รับที่แสดง",f.recipientAccountMasked||f.recipientVisibleSuffix||"",true);
    const issues=[...(f.missing||[]).map(x=>"อ่านไม่ครบ: "+x),...(f.reviewFlags||[])];
    if(f.amountCandidates?.length>1)issues.push("OCR อ่านยอดเงินได้มากกว่าหนึ่งค่า กรุณาเทียบกับรูปต้นฉบับ");
    warning.classList.toggle("hidden",issues.length===0);
    warning.textContent=issues.join(" · ");
    raw.textContent=scan.ocrText||"ไม่มีข้อความที่อ่านได้";
    if(chosenObjectUrl)URL.revokeObjectURL(chosenObjectUrl);
    chosenObjectUrl=URL.createObjectURL(file);
    preview.src=chosenObjectUrl;
    description.textContent=scan.message;
    result.classList.remove("hidden");
    say(f.missing?.length?"อ่านข้อความได้บางส่วน กรุณาตรวจข้อมูลที่ขาดด้านล่าง":"อ่านข้อความเสร็จแล้ว กรุณาตรวจเทียบกับสลิปต้นฉบับ",f.missing?.length?"warn":"done");
  }catch(error){
    say(error instanceof Error?error.message:"อ่านสลิปไม่สำเร็จ โปรดลองใหม่","warn");
  }finally{
    fileInput.disabled=false;
  }
});
window.addEventListener("pagehide",()=>{if(chosenObjectUrl)URL.revokeObjectURL(chosenObjectUrl);});
