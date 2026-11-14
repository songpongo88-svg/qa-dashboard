import {readPayoutSlipLocally} from "./localPayoutSlipOcr";

const byId=(id:string)=>document.getElementById(id)!;
const fileInput=byId("file") as HTMLInputElement;
const clearButton=byId("clear") as HTMLButtonElement;
const status=byId("status");
const result=byId("result");
const list=byId("batch-items");
const batchSummary=byId("batch-summary");
const description=byId("description");
const MAX_FILES=20;
const MAX_BYTES=8*1024*1024;
let running=false;
let processed=0;
let completed=0;
let partial=0;
let failed=0;
let reviewCount=0;
const openImageUrls=new Map<HTMLDetailsElement,string>();
function releaseImages(){
  for(const url of openImageUrls.values())URL.revokeObjectURL(url);
  openImageUrls.clear();
}

function say(message:string,kind="info"){
  status.textContent=message;status.dataset.kind=kind;
}
const money=(v:number|null|undefined)=>v===null||v===undefined?"อ่านไม่พบ":
  v.toLocaleString("th-TH",{minimumFractionDigits:2,maximumFractionDigits:2})+" บาท";
function date(iso:string|undefined){
  if(!iso)return "อ่านไม่พบ";
  const value=new Date(iso);
  if(!Number.isFinite(value.getTime()))return "อ่านไม่พบ";
  return value.toLocaleString("th-TH",{timeZone:"Asia/Bangkok",day:"numeric",
    month:"long",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"});
}
function el<K extends keyof HTMLElementTagNameMap>(
  name:K,text?:string,className?:string
):HTMLElementTagNameMap[K]{
  const node=document.createElement(name);
  if(text!==undefined)node.textContent=text;
  if(className)node.className=className;
  return node;
}
function field(host:HTMLElement,label:string,value:string,wide=false){
  const box=el("div",undefined,"kv"+(wide?" wide":""));
  box.append(el("div",label,"key"),el("div",value||"อ่านไม่พบ","val"));
  host.append(box);
}
function progress(total:number){
  batchSummary.textContent=processed+"/"+total+" ไฟล์ · อ่านข้อมูลหลักครบ "+completed+
    " · อ่านได้บางส่วน "+partial+" · อ่านไม่ได้ "+failed+" · มีจุดต้องตรวจ "+reviewCount;
}
async function toDataUrl(file:File):Promise<string>{
  return await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result||""));
    reader.onerror=()=>reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
    reader.readAsDataURL(file);
  });
}
type Card={card:HTMLElement;badge:HTMLElement;glance:HTMLElement;details:HTMLElement};
function newCard(file:File,index:number):Card{
  const card=el("article",undefined,"slip-card");
  card.dataset.slipResult=String(index);
  const head=el("div",undefined,"slip-head");
  const name=el("div",(index+1)+". "+file.name,"slip-name");
  const badge=el("span","รออ่าน","slip-state");
  head.append(name,badge);
  const glance=el("div","รอประมวลผล","slip-glance");
  const details=el("div",undefined,"slip-detail");
  card.append(head,glance,details);
  list.append(card);
  return {card,badge,glance,details};
}
function setBadge(card:Card,text:string,kind:"ok"|"warn"|"error"){
  card.badge.textContent=text;
  card.badge.className="slip-state "+kind;
}
function showError(card:Card,text:string){
  setBadge(card,"อ่านไม่สำเร็จ","error");
  card.glance.textContent=text;
}
function showScan(card:Card,file:File,scan:Awaited<ReturnType<typeof readPayoutSlipLocally>>,duplicateOf=0){
  const f=scan.fields;
  const missing=f.missing||[];
  const issues=[...missing.map(x=>"อ่านไม่ครบ: "+x),...(f.reviewFlags||[])];
  if(duplicateOf)issues.push("เลขอ้างอิงซ้ำกับไฟล์ที่ "+duplicateOf+" โปรดตรวจภาพว่าเป็นสลิปซ้ำหรือ OCR อ่านผิดไฟล์");
  const meaningful=Boolean(f.payoutAt||f.transactionRef||f.amountTHB!==null||f.bank||f.recipientAccountMasked);
  if(f.amountCandidates?.length>1&&!f.amountCorrectedFromCurrencyGlyph)
    issues.push("OCR อ่านยอดเงินขัดแย้ง กรุณาเทียบกับภาพจริง");
  if(!f.bank)issues.push("OCR ระบุธนาคารผู้ออกสลิปไม่ได้ โปรดตรวจโลโก้จากภาพจริง");
  if(!meaningful){setBadge(card,"อ่านข้อความไม่ได้","error");failed++;}
  else if(missing.length||!f.bank||f.walletGlyphUncertain||duplicateOf||((f.referenceCandidates?.length||0)>1&&!f.transactionRef)){setBadge(card,"ต้องตรวจทาน","warn");partial++;}
  else {setBadge(card,"อ่านข้อมูลหลักครบ","ok");completed++;}
  if(issues.length)reviewCount++;
  card.glance.replaceChildren();
  card.glance.append(el("span",f.bank||"ไม่ทราบธนาคาร"));
  const transfer=el("span",undefined);
  transfer.append(el("strong",money(f.amountTHB)));
  card.glance.append(transfer);
  card.glance.append(el("span",date(f.payoutAt)));
  const detail=el("details");
  detail.append(el("summary","ดูข้อมูลทั้งหมดของสลิปนี้"));
  const grid=el("div",undefined,"grid");
  field(grid,"ธนาคารหรือ Wallet ที่ออกสลิป",f.bank?f.bank+(f.issuerSource&&f.issuerSource!=="branding"?" (ระบุจากข้อมูลประกอบ)":""):"");
  field(grid,"สถานะที่ปรากฏ",f.isSuccessful?"รายการสำเร็จ (ข้อความจากภาพ)":"อ่านข้อความสถานะไม่ชัด");
  field(grid,"วันที่และเวลา",date(f.payoutAt));
  field(grid,"ยอดเงิน",money(f.amountTHB));
  field(grid,"ค่าธรรมเนียม",money(f.feeTHB));
  field(grid,"หมายเลขอ้างอิง (สั้น)",f.shortReference||"");
  field(grid,"เลขที่อ้างอิง / เลขธุรกรรม",f.longReference||f.transactionRef||"",true);
  if((f.referenceCandidates?.length||0)>1)field(grid,"เลขอ้างอิงที่ OCR อ่านได้หลายค่า — ตรวจทาน",f.referenceCandidates!.join(" / "),true);
  field(grid,"ผู้โอน",f.senderName||"");
  field(grid,"ธนาคารผู้โอน",f.senderBank||"");
  field(grid,"เลขบัญชีผู้โอนที่แสดง",f.senderAccountMasked||"");
  field(grid,"ผู้รับ",f.recipientName||f.recipientLabel||"");
  field(grid,"ธนาคารผู้รับ",f.recipientBank||"");
  field(grid,"เลขบัญชีผู้รับที่แสดง",f.recipientAccountMasked||f.recipientVisibleSuffix||"",true);
  detail.append(grid);
  if(issues.length)detail.append(el("p",issues.join(" · "),"warning"));
  detail.append(el("p",scan.message,"muted"));
  const rawDetails=el("details");
  rawDetails.append(el("summary","ดูข้อความ OCR ของไฟล์นี้"));
  rawDetails.append(el("pre",scan.ocrText||"ไม่มีข้อความที่อ่านได้"));
  detail.append(rawDetails);
  const imageDetails=el("details");
  imageDetails.append(el("summary","ดูภาพต้นฉบับของไฟล์นี้"));
  const image=el("img") as HTMLImageElement;
  image.alt="ภาพสลิปที่เลือกทดสอบ: "+file.name;
  image.className="image";
  let objectUrl="";
  imageDetails.addEventListener("toggle",()=>{
    if(imageDetails.open){
      if(!objectUrl){objectUrl=URL.createObjectURL(file);openImageUrls.set(imageDetails,objectUrl);}
      image.src=objectUrl;
    }else if(objectUrl){
      image.removeAttribute("src");
      URL.revokeObjectURL(objectUrl);
      openImageUrls.delete(imageDetails);
      objectUrl="";
    }
  });
  imageDetails.append(image);
  detail.append(imageDetails);
  card.details.append(detail);
}

fileInput.addEventListener("change",async()=>{
  if(running)return;
  const files=Array.from(fileInput.files||[]);
  fileInput.value="";
  if(!files.length)return;
  if(files.length>MAX_FILES){
    say("เลือกได้สูงสุด "+MAX_FILES+" ไฟล์ต่อรอบ กรุณาแบ่งเลือกเป็นชุด","warn");
    return;
  }
  running=true;fileInput.disabled=true;clearButton.disabled=true;
  processed=0;completed=0;partial=0;failed=0;reviewCount=0;
  releaseImages();
  list.replaceChildren();
  result.classList.remove("hidden");
  description.textContent="ผลการอ่านแยกตามภาพ · ทุกรายการเป็นเพียงผล OCR ไม่ใช่หลักฐานยืนยันเงินเข้า";
  const cards=files.map(newCard);
  const seenReferences=new Map<string,number>();
  progress(files.length);
  say("กำลังอ่านข้อความจากสลิป 0/"+files.length+" ไฟล์ ในเบราว์เซอร์ของคุณ");
  try{
    // OCR sequentially to avoid exhausting resources on low-powered devices.
    for(let i=0;i<files.length;i++){
      const file=files[i],card=cards[i];
      card.badge.textContent="กำลังอ่าน";
      say("กำลังอ่านไฟล์ "+(i+1)+"/"+files.length+": "+file.name);
      try{
        if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>MAX_BYTES)
          throw new Error("รองรับ JPG, PNG, WebP ขนาดไม่เกิน 8 MB ต่อไฟล์");
        const data=await toDataUrl(file);
        const scan=await readPayoutSlipLocally(data);
        const ref=String(scan.fields.transactionRef||"").trim().toUpperCase();
        const duplicateOf=ref?(seenReferences.get(ref)||0):0;
        if(ref&&!duplicateOf)seenReferences.set(ref,i+1);
        showScan(card,file,scan,duplicateOf);
      }catch(error){
        failed++;
        showError(card,error instanceof Error?error.message:"ไม่สามารถอ่านสลิปนี้ได้");
      }
      processed++;
      progress(files.length);
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    say("อ่านครบ "+processed+" ไฟล์: ข้อมูลหลักครบ "+completed+" · บางส่วน "+partial+" · อ่านไม่ได้ "+failed,
      failed||partial?"warn":"done");
  }finally{
    running=false;fileInput.disabled=false;clearButton.disabled=false;
  }
});
clearButton.addEventListener("click",()=>{
  if(running)return;
  releaseImages();
  list.replaceChildren();result.classList.add("hidden");
  processed=completed=partial=failed=reviewCount=0;
  batchSummary.textContent="ยังไม่มีไฟล์ที่เลือก";
  clearButton.disabled=true;
  say("ล้างผลการทดสอบแล้ว สามารถเลือกหลายภาพรอบใหม่ได้");
});
