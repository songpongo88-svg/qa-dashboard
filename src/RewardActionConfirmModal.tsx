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
};
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
export default function RewardActionConfirmModal({request,busy,error,onCancel,onConfirm}:{
  request:RewardConfirmation|null;
  busy:boolean;
  error?:string;
  onCancel:()=>void;
  onConfirm:()=>void;
}){
  const closeRef=useRef<HTMLButtonElement>(null);
  const modalRef=useRef<HTMLDialogElement>(null);
  const [imageFailed,setImageFailed]=useState(false);
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
    try{if(modal&&typeof modal.showModal==="function"&&!modal.open)modal.showModal();}
    catch{ /* Fallback remains visible in the dedicated fixed overlay. */ }
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
      document.body.style.overflow=previous;
      focused?.focus();
    };
  },[opened]);
  if(!request||typeof document==="undefined")return null;
  const isNetflix=request.kind==="netflix";
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
        {error?<p className="reward-confirm-error" role="alert">{error}</p>:null}
        <div className="reward-confirm-actions">
          <button type="button" className="reward-confirm-cancel" onClick={onCancel} disabled={busy}>ยกเลิก</button>
          <button type="button" className="reward-confirm-accept" data-reward-confirm-submit="true"
            onClick={onConfirm} disabled={busy}>{busy?"กำลังบันทึก...":buttonText}</button>
        </div>
      </div>
    </dialog>,document.body);
}
