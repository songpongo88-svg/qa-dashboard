import React,{useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import "./rewardActionConfirmModal.css";

export type RewardConfirmation={
  rewardId:string;
  itemName:string;
  recipientName:string;
  username:string;
  amountLabel:string;
  destinationLabel:string;
  requestedAt?:string;
  dueDate?:string;
  kind:"money"|"netflix";
  expectedAmountTHB?:number;
};
export type PayoutScan={ocrStatus:string;message:string;ocrText?:string;fields:{
  payoutAt:string;transactionRef:string;amountTHB:number|null;recipientLast4:string;recipientLabel:string;missing:string[];
}};
export type PayoutProof={slipImageData:string;slipOCRText:string;slipManualReview:boolean;slipManualReason:string;slipManualFields:{
  payoutAt:string;transactionRef:string;amountTHB:number;recipientLast4:string;
}};
async function shrinkSlip(file:File):Promise<string>{
  if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>8*1024*1024)throw Error("เลือกภาพ JPG/PNG/WebP ไม่เกิน 8 MB");
  const url=URL.createObjectURL(file),image=new Image();
  try{await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error("ไม่สามารถเปิดภาพสลิปได้"));image.src=url;});}
  finally{URL.revokeObjectURL(url);}
  const canvas=document.createElement("canvas"),max=1600,scale=Math.min(1,max/Math.max(image.width,image.height));
  canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  const ctx=canvas.getContext("2d");if(!ctx)throw Error("ไม่สามารถจัดเตรียมภาพสลิปได้");
  ctx.fillStyle="#ffffff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  for(const q of [0.86,0.73,0.6,0.48,0.36]){
    const data=canvas.toDataURL("image/jpeg",q);
    if(data.length<465000)return data;
  }
  throw Error("ภาพสลิปมีรายละเอียดมากเกินไป กรุณาใช้ภาพที่คมชัดและครอปเฉพาะสลิป");
}

const IMAGE_BY_REWARD:Record<string,string>={
  "truemoney-20":"/rewards/truemoney-20.webp",
  "punthai-65":"https://cdn-th.orstatic.com/userphoto/doorphoto/8/6KY/01AT4G1C7FE17C3D8DC3B9px.jpg",
  "netflix-1m":"https://cdn.jsdelivr.net/npm/simple-icons@14.15.0/icons/netflix.svg",
  "amazon-55":"https://cdn-th.orstatic.com/userphoto/doorphoto/8/6L7/01AURF1DBC7D745270820Elv.jpg",
  "seven-100":"https://mpics.mgronline.com/pics/Images/567000007860201.JPEG"
};
function dateLabel(value?:string){
  if(!value)return "";
  const date=/^\d{4}-\d{2}-\d{2}$/.test(value)?new Date(value+"T12:00:00+07:00"):new Date(value);
  return Number.isFinite(date.getTime())?date.toLocaleString("th-TH",{
    timeZone:"Asia/Bangkok",day:"numeric",month:"long",year:"numeric",
    ...(value.includes("T")?{hour:"2-digit",minute:"2-digit"}:{})
  }):"";
}
export default function RewardActionConfirmModal({request,busy,error,onCancel,onConfirm,onAnalyze}:{
  request:RewardConfirmation|null;
  busy:boolean;
  error?:string;
  onCancel:()=>void;
  onConfirm:(proof?:PayoutProof)=>void;
  onAnalyze:(imageData:string)=>Promise<PayoutScan>;
}){
  const closeRef=useRef<HTMLButtonElement>(null);
  const modalRef=useRef<HTMLDialogElement>(null);
  const [imageFailed,setImageFailed]=useState(false);
  const [slipImageData,setSlipImageData]=useState("");
  const [scan,setScan]=useState<PayoutScan|null>(null);
  const [scanning,setScanning]=useState(false);
  const [scanError,setScanError]=useState("");
  const [manualReason,setManualReason]=useState("");
  const [manualDate,setManualDate]=useState("");
  const [manualRef,setManualRef]=useState("");
  const [manualAmount,setManualAmount]=useState("");
  const [manualRecipient,setManualRecipient]=useState("");
  const onFile=async(file?:File)=>{
    if(!file)return;
    setScanning(true);setScanError("");setScan(null);setSlipImageData("");
    try{
      const data=await shrinkSlip(file);
      setSlipImageData(data);
      const result=await onAnalyze(data);
      setScan(result);
      setManualRef(result.fields.transactionRef||"");
      setManualAmount(result.fields.amountTHB!==null?String(result.fields.amountTHB):"");
      setManualRecipient(result.fields.recipientLast4||"");
      if(result.fields.payoutAt){
        const date=new Date(result.fields.payoutAt);
        const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date);
        const get=(part:string)=>parts.find(p=>p.type===part)?.value||"";
        setManualDate(get("year")+"-"+get("month")+"-"+get("day")+"T"+get("hour")+":"+get("minute"));
      }
    }catch(e){setScanError(e instanceof Error?e.message:"อ่านสลิปไม่สำเร็จ");}
    finally{setScanning(false);}
  };
  useEffect(()=>{setSlipImageData("");setScan(null);setScanError("");setManualReason("");
    setManualDate("");setManualRef("");setManualAmount("");setManualRecipient("");},[request?.username,request?.requestedAt,request?.rewardId]);

  const opened=Boolean(request);
  const currentBusy=useRef(busy);
  currentBusy.current=busy;
  const closeCallback=useRef(onCancel);
  closeCallback.current=onCancel;
  useEffect(()=>{setImageFailed(false);},[request?.rewardId]);
  useEffect(()=>{
    if(!opened)return;
    const previous=document.body.style.overflow;
    const focused=document.activeElement instanceof HTMLElement?document.activeElement:null;
    document.body.style.overflow="hidden";
    const modal=modalRef.current;
    // Native dialog enters the browser top layer: no Dashboard overlay,
    // theme or z-index can cover the Admin confirmation.
    try{
      if(modal&&typeof modal.showModal==="function"&&!modal.open)modal.showModal();
      else if(modal&&!modal.open)modal.setAttribute("open","");
    }catch{
      // Keep the fixed dialog visible even if the native top layer is unavailable.
      modal?.setAttribute("open","");
    }
    closeRef.current?.focus();
    const keydown=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();if(!currentBusy.current)closeCallback.current();return;}
      if(event.key!=="Tab"||!modalRef.current)return;
      const elements=[...modalRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])'
      )].filter(el=>el.getClientRects().length>0||el===document.activeElement);
      if(!elements.length)return;
      const first=elements[0],last=elements[elements.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    const nativeCancel=(event:Event)=>{event.preventDefault();if(!currentBusy.current)closeCallback.current();};
    modal?.addEventListener("cancel",nativeCancel);
    document.addEventListener("keydown",keydown);
    return()=>{
      document.removeEventListener("keydown",keydown);
      modal?.removeEventListener("cancel",nativeCancel);
      try{if(modal?.open&&typeof modal.close==="function")modal.close();}catch{}
      modal?.removeAttribute("open");
      document.body.style.overflow=previous;
      focused?.focus();
    };
  },[opened]);
  if(!request||typeof document==="undefined")return null;
  const isNetflix=request.kind==="netflix";
  const needsManual=!!scan&&(scan.ocrStatus!=="local"||scan.fields.missing.length>0);
  const expectedRecipient=String(request.destinationLabel||"").replace(/\D/g,"").slice(-4);
  const amountMismatch=scan?.fields.amountTHB!==null&&scan?.fields.amountTHB!==undefined&&
    Number(scan.fields.amountTHB)!==Number(request.expectedAmountTHB);
  const recipientMismatch=!!scan?.fields.recipientLast4&&scan.fields.recipientLast4!==expectedRecipient;
  const manualReady=!needsManual||(manualReason.trim().length>=12&&manualDate&&manualRef.trim().length>=6&&
    Number(manualAmount)===Number(request.expectedAmountTHB)&&manualRecipient===expectedRecipient);
  const canConfirm=isNetflix||!!(slipImageData&&scan&&!scanning&&!amountMismatch&&!recipientMismatch&&manualReady);
  const submit=()=>{
    if(isNetflix){onConfirm();return;}
    if(!canConfirm||!scan)return;
    onConfirm({slipImageData,slipOCRText:scan.ocrText||"",slipManualReview:needsManual,slipManualReason:manualReason.trim(),
      slipManualFields:{payoutAt:manualDate?manualDate+":00+07:00":"",transactionRef:manualRef,
        amountTHB:Number(manualAmount),recipientLast4:manualRecipient}});
  };

  const title=isNetflix?"ยืนยันการส่งสิทธิ์ Netflix":"ยืนยันการโอนเงินจริง";
  const buttonText=isNetflix?"ยืนยันว่าส่งสิทธิ์แล้ว":"ยืนยันว่าโอนเงินจริงแล้ว";
  const image=IMAGE_BY_REWARD[request.rewardId];
  return createPortal(<dialog className="reward-confirm-modal" data-reward-confirm-overlay="true" ref={modalRef}
     onMouseDown={event=>{
       // A click outside the dialog content targets the native dialog backdrop.
       if(event.target===event.currentTarget&&!busy)onCancel();
     }}
       role="dialog" aria-modal="true" aria-labelledby="reward-confirm-title" aria-describedby="reward-confirm-help">
      <button type="button" className="reward-confirm-close" aria-label="ปิดหน้าต่างยืนยัน"
        disabled={busy} onClick={onCancel} ref={closeRef}>×</button>
      <div className="reward-confirm-hero">
        <div className={"reward-confirm-art"+(isNetflix?" reward-confirm-art--netflix":"")}>
          {!imageFailed&&image?<img src={image} alt={"ภาพรางวัล "+request.itemName}
              onError={()=>setImageFailed(true)}/>:<span>{isNetflix?"Netflix":"QA Sparks"}</span>}
        </div>
        <div>
          <span className="reward-confirm-eyebrow">QA SPARKS · ADMIN CONFIRMATION</span>
          <h2 id="reward-confirm-title">{title}</h2>
          <p>{request.itemName}</p>
        </div>
      </div>
      <div className="reward-confirm-body">
        <p className="reward-confirm-lead" id="reward-confirm-help">
          โปรดตรวจสอบรายการนี้ให้ตรงกับหลักฐานการดำเนินการจริง ก่อนเปลี่ยนสถานะคำขอ
        </p>
        <div className="reward-confirm-details">
          <div><span>รางวัลที่กำลังยืนยัน</span><strong>{request.itemName}</strong></div>
          <div><span>ผู้รับสิทธิ์</span><strong>{request.recipientName} (@{request.username})</strong></div>
          <div><span>{isNetflix?"สิทธิ์ที่ส่ง":"ยอดเงินที่โอน"}</span><strong>{request.amountLabel}</strong></div>
          <div><span>{isNetflix?"อีเมลรับสิทธิ์":"หมายเลขรับเงิน"}</span><strong>{request.destinationLabel}</strong></div>
          {dateLabel(request.requestedAt)?<div><span>วันส่งคำขอ</span><strong>{dateLabel(request.requestedAt)}</strong></div>:null}
          {dateLabel(request.dueDate)?<div><span>กำหนดดำเนินการ</span><strong>{dateLabel(request.dueDate)}</strong></div>:null}
        </div>
        <div className="reward-confirm-warning" role="note">
          <strong>{isNetflix?"ยืนยันหลังจัดส่งสิทธิ์จริงแล้วเท่านั้น":"ยืนยันหลังโอนเงินจริงแล้วเท่านั้น"}</strong>
          <p>{isNetflix
            ?"ระบบจะบันทึกว่าได้ส่งสิทธิ์ Netflix แล้ว แต่ไม่ได้สร้างหรือส่งสิทธิ์ Netflix ให้โดยอัตโนมัติ"
            :"ระบบจะบันทึกสถานะว่าโอนเงินจริงแล้ว แต่จะไม่โอนเงินให้อัตโนมัติ"}</p>
        </div>
        {!isNetflix?<section className="reward-slip-upload">
          <h3>สลิปหลักฐานการโอนเงินจริง</h3>
          <label className="reward-slip-file">เลือกภาพสลิป (JPG, PNG, WebP)
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||scanning}
              onChange={e=>{void onFile(e.target.files?.[0]);e.target.value="";}}/>
          </label>
          {slipImageData?<img className="reward-slip-preview" src={slipImageData} alt="ภาพสลิปโอนเงินที่แนบ"/>:null}
          {scanning?<p role="status">กำลังอ่านวันที่ เวลา ยอดเงิน เลขอ้างอิง และข้อมูลผู้รับ…</p>:null}
          {scan?<div className="reward-slip-fields">
            <strong>ผลอ่านสลิป: {scan.ocrStatus==="local"?"อ่านภาพในเครื่องแล้ว":"ต้องตรวจด้วยตนเอง"}</strong>
            <div>วัน–เวลา: {dateLabel(scan.fields.payoutAt)||"—"}</div>
            <div>เลขอ้างอิง: {scan.fields.transactionRef||"—"}</div>
            <div>ยอดโอน: {scan.fields.amountTHB===null?"—":scan.fields.amountTHB+" บาท"}</div>
            <div>เลขท้ายผู้รับ: {scan.fields.recipientLast4||"—"}</div>
            {needsManual?<p>อ่านไม่ครบ: {scan.fields.missing.join(", ")||"บริการ OCR ไม่พร้อมใช้งาน"}</p>:null}
            {amountMismatch||recipientMismatch?<p className="reward-confirm-error" role="alert">ข้อมูลยอดเงินหรือผู้รับไม่ตรงกับคำขอ กรุณาเลือกสลิปที่ถูกต้อง</p>:null}
          </div>:null}
          {needsManual?<div className="reward-slip-manual">
            <strong>ตรวจสอบและกรอกข้อมูลจากสลิปด้วยตนเอง</strong>
            <label>วัน–เวลาโอน <input type="datetime-local" value={manualDate} onChange={e=>setManualDate(e.target.value)} disabled={busy||Boolean(scan?.fields.payoutAt)}/></label>
            <label>เลขอ้างอิง <input value={manualRef} onChange={e=>setManualRef(e.target.value)} disabled={busy||Boolean(scan?.fields.transactionRef)} maxLength={70}/></label>
            <label>ยอดโอน (บาท) <input type="number" step="0.01" min="0" value={manualAmount} onChange={e=>setManualAmount(e.target.value)} disabled={busy||scan?.fields.amountTHB!==null}/></label>
            <label>เลขท้ายผู้รับ 4 หลัก <input inputMode="numeric" maxLength={4} value={manualRecipient} onChange={e=>setManualRecipient(e.target.value)} disabled={busy||Boolean(scan?.fields.recipientLast4)}/></label>
            <label>เหตุผลที่ตรวจสอบเอง <textarea maxLength={350} rows={2} value={manualReason} onChange={e=>setManualReason(e.target.value)} disabled={busy} placeholder="ระบุว่าได้ตรวจภาพสลิปและหลักฐานจากแอปธนาคารอย่างไร"/></label>
            <p>การกรอกเองจะถูกบันทึกว่า Manual Review ไม่ใช่การยืนยันจากธนาคาร</p>
          </div>:null}
          {scanError?<p className="reward-confirm-error" role="alert">{scanError}</p>:null}
        </section>:null}
        {error?<p className="reward-confirm-error" role="alert">{error}</p>:null}
        <div className="reward-confirm-actions">
          <button type="button" className="reward-confirm-cancel" onClick={onCancel} disabled={busy}>ยกเลิก</button>
          <button type="button" className="reward-confirm-accept" data-reward-confirm-submit="true"
            onClick={submit} disabled={busy||!canConfirm}>{busy?"กำลังบันทึก...":buttonText}</button>
        </div>
      </div>
    </dialog>,document.body);
}
