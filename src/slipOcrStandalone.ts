import {readPayoutSlipLocally} from "./localPayoutSlipOcr";
import {STANDARD_SLIP_FIELDS,standardSlipFromOcr,validateStandardSlip,diffStandardSlip,normalizeStandardSlip} from "./standardSlipFields.js";

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
  detail.append(el("summary","ตรวจและแก้ไขข้อมูลสลิป 7 รายการ"));
  const original=standardSlipFromOcr(f);
  const reviewed:Record<string,string>={...original};
  const reviewForm=el("div",undefined,"slip-standard-form");
  const reviewGrid=el("div",undefined,"slip-standard-grid");
  const inputMap=new Map<string,HTMLInputElement>();
  const diffCount=el("span","ข้อมูล OCR เดิม","slip-correction-summary");
  const reviewStatus=el("p","ข้อมูลที่ OCR อ่านไม่พบสามารถกรอกเพิ่มได้ ตรวจเทียบกับภาพก่อนยืนยัน","muted");
  const accept=el("button","ยืนยันข้อมูลที่ตรวจแล้ว","clear-btn slip-review-accept") as HTMLButtonElement;
  accept.type="button";
  const auditDetails=el("details",undefined,"slip-review-audit");
  auditDetails.append(el("summary","ดูข้อมูล OCR เดิมและรายการแก้ไข"));
  const audit=el("pre","ยังไม่ได้ยืนยันการตรวจข้อมูล");
  auditDetails.append(audit);
  const sync=()=>{
    const check=validateStandardSlip(reviewed);
    const changes=diffStandardSlip(original,reviewed);
    const count=Object.keys(changes).length;
    diffCount.textContent=count?"แก้ไขจากผล OCR "+count+" ช่อง":"ข้อมูล OCR เดิม";
    accept.disabled=!check.complete;
    reviewStatus.textContent=!check.complete?
      "ต้องตรวจสอบเพิ่มเติม: "+check.missing.concat(check.invalid).map(k=>STANDARD_SLIP_FIELDS.find(f=>f.key===k)?.label||k).join(", "):
      "ข้อมูลครบ 7 ช่องแล้ว โปรดตรวจภาพต้นฉบับก่อนยืนยัน";
    for(const [key,input] of inputMap){
      const changed=original[key]!==reviewed[key];
      input.dataset.manualEdit=changed?"true":"false";
      input.setAttribute("aria-label",(STANDARD_SLIP_FIELDS.find(f=>f.key===key)?.label||key)+(changed?" (แก้ไขด้วยตนเอง)":""));
    }
  };
  for(const {key,label} of STANDARD_SLIP_FIELDS){
    const wrap=el("label",undefined,"slip-standard-field");
    wrap.append(el("span",label,"slip-standard-label"));
    const input=el("input") as HTMLInputElement;
    input.type="text";
    input.value=original[key];
    input.placeholder=key==="payoutAt"?"DD/MM/พ.ศ. HH:mm":key==="amountTHB"?"1,405.00":"อ่านไม่พบ — กรุณาตรวจสอบ";
    input.autocomplete="off";
    input.dataset.slipField=key;
    input.maxLength=key==="transactionRef"?70:key==="payoutAt"?17:160;
    input.addEventListener("input",()=>{
      reviewed[key]=input.value;
      audit.textContent="มีการแก้ไขหลังการยืนยันครั้งก่อน กรุณาตรวจและยืนยันใหม่";
      sync();
    });
    inputMap.set(key,input);
    wrap.append(input);
    reviewGrid.append(wrap);
  }
  sync();
  accept.addEventListener("click",()=>{
    const check=validateStandardSlip(reviewed);
    if(!check.complete)return;
    const verified=normalizeStandardSlip(reviewed);
    const changes=diffStandardSlip(original,verified);
    // Public tester: keep the audit in memory only, NEVER persist bank data.
    const record={ocrOriginal:original,reviewed:verified,changes,
      checkedAt:new Date().toISOString(),checkedBy:"ผู้ใช้หน้าทดสอบ (ไม่เข้าสู่ระบบ)",
      status:"ข้อมูลที่ผู้ใช้ตรวจแล้ว ไม่ใช่การยืนยันเงินเข้าธนาคาร"};
    audit.textContent=JSON.stringify(record,null,2);
    reviewStatus.textContent="ตรวจข้อมูลครบทั้ง 7 รายการแล้ว (เฉพาะในหน้าทดสอบ ไม่บันทึก Paid)";
  });
  reviewForm.append(reviewGrid,diffCount,reviewStatus,accept,auditDetails);
  detail.append(reviewForm);
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
