import React,{useCallback,useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import "./specialRewards.css";

export type SpecialReward={id:string;title:string;brand:string;price:number;maxTHB:number;type:"receipt"|"email";monthlyLimit:number};
type Item={itemId:string;rewardId:string;title:string;price:number;status:string;redeemedAt:string;expiresAt:string;activatedAt:string;submittedAt?:string};
const REWARDS:SpecialReward[]=[
 {id:"punthai-65",title:"เครื่องดื่มพันธุ์ไทย",brand:"Punthai Coffee",price:6500,maxTHB:65,type:"receipt",monthlyLimit:1},
 {id:"netflix-1m",title:"Netflix 1 เดือน",brand:"Netflix",price:15000,maxTHB:0,type:"email",monthlyLimit:1},
 {id:"amazon-55",title:"เครื่องดื่ม Café Amazon",brand:"Café Amazon",price:8000,maxTHB:55,type:"receipt",monthlyLimit:1},
 {id:"seven-100",title:"ซื้อสินค้าที่ 7-Eleven",brand:"7-Eleven",price:20000,maxTHB:100,type:"receipt",monthlyLimit:1}
];
const LOGOS:Record<string,string>={
 "punthai-65":"https://cdn-th.orstatic.com/userphoto/doorphoto/8/6KY/01AT4G1C7FE17C3D8DC3B9px.jpg",
 "netflix-1m":"https://cdn.jsdelivr.net/npm/simple-icons@14.15.0/icons/netflix.svg",
 "amazon-55":"https://cdn-th.orstatic.com/userphoto/doorphoto/8/6L7/01AURF1DBC7D745270820Elv.jpg",
 "seven-100":"https://mpics.mgronline.com/pics/Images/567000007860201.JPEG"
};
const fmt=(v:number)=>Number(v||0).toLocaleString("th-TH");
const date=(v:string)=>v?new Date(v).toLocaleString("th-TH",{timeZone:"Asia/Bangkok",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
const expired=(item:Item)=>Boolean(item?.expiresAt&&Date.now()>=Date.parse(item.expiresAt));
function RewardImage({id}:{id:string}){
 const [failed,setFailed]=useState(false);
 return <span className={"sr-logo sr-logo--"+id}>
   {!failed?<img src={LOGOS[id]} alt={REWARDS.find(x=>x.id===id)?.brand||""} loading="lazy" onError={()=>setFailed(true)}/>:<span>{REWARDS.find(x=>x.id===id)?.brand||"QA Sparks"}</span>}
 </span>;
}
const statusText=(i:Item)=>i.status==="unused"?(expired(i)?"หมดอายุ":"พร้อมใช้")
  :i.status==="activated"?"รอส่งคำขอ"
  :i.status==="submitted"?"รอ Admin ตรวจสอบ"
  :i.status==="approved"?"อนุมัติแล้ว · รอดำเนินการ"
  :i.status==="paid"?"คืนเงินเรียบร้อย":i.status==="delivered"?"ส่งสิทธิ์แล้ว":i.status==="rejected"?"ไม่อนุมัติ":i.status;
function newRequestId(){return typeof crypto!=="undefined"&&typeof crypto.randomUUID==="function"
  ?crypto.randomUUID():"sr-"+Date.now()+"-"+Math.random().toString(36).slice(2);}
async function compressedReceipt(file:File){
 if(!/^image\/(jpeg|png|webp)$/i.test(file.type))throw Error("กรุณาเลือกรูป JPG, PNG หรือ WebP");
 if(file.size>12*1024*1024)throw Error("รูปภาพใหญ่เกินไป (สูงสุด 12 MB ก่อนบีบอัด)");
 const image=new Image();const url=URL.createObjectURL(file);
 try{
  await new Promise<void>((resolve,reject)=>{
   image.onload=()=>resolve();image.onerror=()=>reject(Error("ไม่สามารถอ่านรูปใบเสร็จได้"));image.src=url;
  });
  const max=1300,scale=Math.min(1,max/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas=document.createElement("canvas");
  canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);
  const context=canvas.getContext("2d");if(!context)throw Error("ไม่สามารถเตรียมรูปใบเสร็จได้");
  context.fillStyle="#fff";context.fillRect(0,0,canvas.width,canvas.height);
  context.drawImage(image,0,0,canvas.width,canvas.height);
  let output=canvas.toDataURL("image/jpeg",.75);
  if(output.length>440000)output=canvas.toDataURL("image/jpeg",.52);
  if(output.length>440000)throw Error("รูปภาพยังใหญ่เกินไป กรุณาถ่ายใบเสร็จให้ชัดและใกล้ขึ้น");
  return output;
 }finally{URL.revokeObjectURL(url);}
}
export default function SpecialRewardCenter({mode,username,sessionId,balance,loaded,hasOtherItems=false}:{
 mode:"reward"|"inventory";username:string;sessionId:string;balance:number;loaded:boolean;hasOtherItems?:boolean
}){
 const [items,setItems]=useState<Item[]>([]);
 const [inventoryLoaded,setInventoryLoaded]=useState(false);
 const [selectedReward,setSelectedReward]=useState<string|null>(null);
 const [selectedItem,setSelectedItem]=useState<string|null>(null);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [error,setError]=useState("");
 const [confirm,setConfirm]=useState(false);
 const [receiptNo,setReceiptNo]=useState("");
 const [receiptAt,setReceiptAt]=useState("");
 const [paidAmount,setPaidAmount]=useState("");
 const [promptpay,setPromptpay]=useState("");
 const [imageData,setImageData]=useState("");
 const [email,setEmail]=useState("");
 const [neverPaid,setNeverPaid]=useState(false);
 const [receiptValid,setReceiptValid]=useState(false);
 const [receiptDuplicate,setReceiptDuplicate]=useState(false);
 const requestId=useRef("");
 const panel=useRef<HTMLElement>(null);
 const closeRef=useRef<HTMLButtonElement>(null);
 const triggerRef=useRef<HTMLButtonElement|null>(null);
 const pending=useRef(false);pending.current=busy;
 const reward=REWARDS.find(r=>r.id===selectedReward);
 const item=items.find(i=>i.itemId===selectedItem)||null;
 const request=useCallback(async(action:string,extra:Record<string,unknown>={})=>{
  const response=await fetch("/api/sparks-admin",{method:"POST",cache:"no-store",
    headers:{"content-type":"application/json"},body:JSON.stringify({action,actorUsername:username,sessionId,...extra})});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(String(body.error||"ไม่สามารถทำรายการได้"));
  return body;
 },[username,sessionId]);
 const reload=useCallback(async()=>{
   const result=await request("special-rewards-mine");
   setItems(Array.isArray(result.items)?result.items:[]);setInventoryLoaded(true);
   return result;
 },[request]);
 useEffect(()=>{setItems([]);setInventoryLoaded(false);setSelectedReward(null);setSelectedItem(null);
  requestId.current="";},[username,sessionId]);
 useEffect(()=>{if(mode!=="inventory"||!loaded||!username||!sessionId)return;void reload().catch(e=>setError(String(e.message||e)));},[mode,loaded,username,sessionId,reload]);
 const opened=Boolean(selectedReward);
 useEffect(()=>{
  if(!opened)return;
  const original=document.body.style.overflow;document.body.style.overflow="hidden";
  closeRef.current?.focus();
  const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!pending.current){setSelectedReward(null);setSelectedItem(null);}};
  document.addEventListener("keydown",onKey);
  return()=>{document.body.style.overflow=original;document.removeEventListener("keydown",onKey);triggerRef.current?.focus();};
 },[opened]);
 const open=(rewardId:string,itemId:string|null,event:React.MouseEvent<HTMLButtonElement>)=>{
   triggerRef.current=event.currentTarget;setSelectedReward(rewardId);setSelectedItem(itemId);
   setConfirm(false);setNotice("");setError("");setReceiptNo("");setReceiptAt("");
   setPaidAmount("");setPromptpay("");setImageData("");setEmail("");setNeverPaid(false);
   setReceiptValid(false);setReceiptDuplicate(false);requestId.current="";
 };
 const handle=async(action:string,extra:Record<string,unknown>={})=>{
   setBusy(true);setError("");setNotice("");
   try{
     const response=await request(action,extra);
     await reload();
     if(action==="special-rewards-redeem"){window.dispatchEvent(new CustomEvent("qa:sparks-updated"));setNotice("แลกสำเร็จ Item เพิ่มใน My Items แล้ว");setConfirm(false);}
     if(action==="special-rewards-activate")setNotice("กดใช้ Item แล้ว สามารถส่งข้อมูลรับสิทธิ์ได้");
     if(action==="special-rewards-submit")setNotice("ส่งคำขอให้ Admin ตรวจสอบเรียบร้อยแล้ว");
     return response;
   }catch(e){setError(e instanceof Error?e.message:"ทำรายการไม่สำเร็จ");return null;}
   finally{setBusy(false);}
 };
 const redeem=async()=>{
   if(!reward||busy)return;
   if(!requestId.current)requestId.current=newRequestId();
   await handle("special-rewards-redeem",{rewardId:reward.id,requestId:requestId.current});
 };
 const checkReceipt=async()=>{
   if(!reward||!receiptNo.trim())return;
   setBusy(true);setError("");setReceiptValid(false);
   try{
    const result=await request("special-rewards-receipt-check",{rewardId:reward.id,receiptNumber:receiptNo});
    setReceiptDuplicate(Boolean(result.duplicate));setReceiptValid(!result.duplicate);
    if(result.duplicate)setError("เลขที่ใบเสร็จนี้ถูกใช้ส่งคำขอแล้ว ไม่สามารถส่งซ้ำได้");
   }catch(e){setError(e instanceof Error?e.message:"ไม่สามารถตรวจเลขใบเสร็จได้");}
   finally{setBusy(false);}
 };
 const submit=async(e:React.FormEvent)=>{
   e.preventDefault();if(!reward||!item||busy)return;
   if(reward.type==="receipt"){
    if(!receiptValid||receiptDuplicate){setError("กรุณาตรวจเลขที่ใบเสร็จจนยืนยันว่าไม่ซ้ำก่อนส่งคำขอ");return;}
    if(!imageData){setError("กรุณาแนบรูปใบเสร็จก่อนส่งคำขอ");return;}
    const iso=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(receiptAt)?receiptAt+":00+07:00":"";
    if(!iso){setError("กรุณาระบุวันและเวลาในใบเสร็จ");return;}
    await handle("special-rewards-submit",{itemId:item.itemId,receiptNumber:receiptNo,
      receiptAt:iso,amountTHB:Number(paidAmount),promptPay:promptpay,imageData});
   }else{
    if(!neverPaid){setError("ต้องยืนยันเงื่อนไขอีเมล Netflix ก่อน");return;}
    await handle("special-rewards-submit",{itemId:item.itemId,email,neverPaid});
   }
 };
 const display=mode==="inventory"?items:[];
 return <>
  {mode==="reward"?REWARDS.map(r=><button key={r.id} type="button"
    className="qa-sparks-mini-item qa-sparks-mini-item--special" data-reward-item={r.id}
    onClick={e=>open(r.id,null,e)}>
    <span className="qa-sparks-mini-art qa-sparks-mini-art--special"><RewardImage id={r.id}/></span>
    <strong className="qa-sparks-mini-name">{r.title}</strong>
    <span className="qa-sparks-mini-value">{fmt(r.price)} Sparks</span>
  </button>):<>
   {!inventoryLoaded&&loaded?<span role="status" className="qa-sparks-inventory-progress">กำลังโหลด Item...</span>:null}
   {display.map(i=><button key={i.itemId} type="button" className="qa-sparks-mini-item qa-sparks-mini-item--special"
      data-special-inventory-item={i.itemId} onClick={e=>open(i.rewardId,i.itemId,e)}>
      <span className="qa-sparks-mini-art qa-sparks-mini-art--special"><RewardImage id={i.rewardId}/><span className="qa-sparks-mini-quantity">×1</span></span>
      <strong className="qa-sparks-mini-name">{i.title}</strong>
      <span className="qa-sparks-mini-value">{statusText(i)}</span>
    </button>)}
   {inventoryLoaded&&display.length===0&&!hasOtherItems?<p className="sr-empty">ยังไม่มี Item ที่แลกไว้</p>:null}
  </>}
  {opened&&reward&&typeof document!=="undefined"?createPortal(
   <div className="sr-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy){setSelectedReward(null);setSelectedItem(null);}}}>
    <section className="sr-modal" ref={panel} role="dialog" aria-modal="true" aria-labelledby="sr-title">
     <button type="button" ref={closeRef} className="sr-close" disabled={busy} onClick={()=>{setSelectedReward(null);setSelectedItem(null);}}>×</button>
     <header className="sr-hero"><RewardImage id={reward.id}/><div>
      <small>QA SPARKS · REWARD CENTER</small><h2 id="sr-title">{reward.title}</h2>
      <p>{reward.type==="email"?"รับสิทธิ์ Netflix 1 เดือน":'คืนเงินตามใบเสร็จไม่เกิน '+reward.maxTHB+' บาท'}</p>
     </div></header>
     <div className="sr-body">
      <div className="sr-facts"><span><small>ราคา</small><strong>{fmt(reward.price)} Sparks</strong></span>
       <span><small>จำกัดการแลก</small><strong>1 ครั้ง/เดือน</strong></span>
       <span><small>อายุ Item</small><strong>30 วันหลังแลก</strong></span></div>
      <h3>วิธีใช้งาน</h3>
      {reward.type==="receipt"?
        <p>แลก Item → กดใช้ Item ก่อนหมดอายุ → ซื้อสินค้าและรับใบเสร็จที่ออกตั้งแต่เวลากดใช้ Item → กรอกเลขใบเสร็จ แนบภาพ และเบอร์พร้อมเพย์ → Admin ตรวจสอบและดำเนินการคืนเงินตามยอดจริง สูงสุด {reward.maxTHB} บาท</p>
       :<p>แลก Item → กดใช้ภายใน 30 วัน → กรอกอีเมลที่ไม่เคยถูกเรียกเก็บค่าสมาชิก Netflix มาก่อน → Admin ตรวจสอบและจัดส่งสิทธิ์ใช้บริการ 1 เดือน</p>}
      <p className="sr-hint">แต่ละ Item มีวันหมดอายุแยกกัน เงินหรือสิทธิ์ไม่ได้ส่งให้อัตโนมัติเมื่อแลก</p>
      {item?<div className="sr-item-status"><strong>{statusText(item)}</strong><span>แลกเมื่อ {date(item.redeemedAt)}</span>
       <span>หมดอายุ {date(item.expiresAt)}</span>{item.activatedAt?<span>กดใช้เมื่อ {date(item.activatedAt)}</span>:null}</div>:null}
      {notice?<p className="sr-success" role="status">{notice}</p>:null}
      {error?<p className="sr-error" role="alert">{error}</p>:null}
      {mode==="reward"?<div className="sr-actions">
       {confirm?<><p>ยืนยันแลกรางวัลนี้ด้วย {fmt(reward.price)} Sparks ใช่หรือไม่?</p>
         <button type="button" onClick={()=>setConfirm(false)} disabled={busy}>กลับ</button>
         <button type="button" className="sr-primary" onClick={()=>void redeem()} disabled={!loaded||busy||balance<reward.price}>{busy?"กำลังบันทึก...":"ยืนยันแลก"}</button></>:
        <><span>คงเหลือ {fmt(balance)} Sparks</span><button type="button" className="sr-primary"
          disabled={!loaded||busy||balance<reward.price} onClick={()=>setConfirm(true)}>
          {balance<reward.price?"Sparks ไม่เพียงพอ":"แลกเป็น Item"}</button></>}</div>:null}
      {mode==="inventory"&&item?.status==="unused"&&!expired(item)?<button type="button"
       className="sr-primary sr-block" disabled={busy} onClick={()=>void handle("special-rewards-activate",{itemId:item.itemId})}>
       {busy?"กำลังบันทึก...":"กดใช้ Item"}</button>:null}
      {mode==="inventory"&&item?.status==="activated"?<form className="sr-form" onSubmit={e=>void submit(e)}>
       <h3>ส่งข้อมูลเพื่อรับสิทธิ์</h3>
       {reward.type==="receipt"?<>
        <label>เลขที่ใบเสร็จ<input required value={receiptNo} onChange={e=>{setReceiptNo(e.target.value);setReceiptValid(false);setReceiptDuplicate(false);}} placeholder="เลขที่ใบเสร็จ"/></label>
        <button type="button" className="sr-check" disabled={busy||receiptNo.trim().length<4} onClick={()=>void checkReceipt()}>
         {busy?"กำลังตรวจสอบ...":"ตรวจเลขที่ใบเสร็จซ้ำ"}</button>
        {receiptValid?<p role="status" className="sr-success">เลขที่ใบเสร็จไม่ซ้ำในระบบ ณ เวลาตรวจ</p>:null}
        {receiptDuplicate?<p role="alert" className="sr-error">เลขที่ใบเสร็จถูกใช้แล้ว ส่งคำขอไม่ได้</p>:null}
        <label>วันที่และเวลาที่ออกใบเสร็จ<input type="datetime-local" required value={receiptAt} onChange={e=>setReceiptAt(e.target.value)}/></label>
        <label>ยอดชำระจริง (บาท)<input type="number" min=".01" max="30000" step=".01" value={paidAmount} required onChange={e=>setPaidAmount(e.target.value)}/></label>
        <label>เบอร์พร้อมเพย์ 10 หลัก<input inputMode="numeric" pattern="0[0-9]{9}" maxLength={10} required value={promptpay} onChange={e=>setPromptpay(e.target.value.replace(/\D/g,"").slice(0,10))}/></label>
        <label>ภาพใบเสร็จ (JPG, PNG, WebP)
          <input type="file" accept="image/jpeg,image/png,image/webp" required={!imageData} disabled={busy}
            onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{setError("");setBusy(true);setImageData(await compressedReceipt(file));}catch(ex){setError(ex instanceof Error?ex.message:"ไม่สามารถแนบภาพได้");}finally{setBusy(false);}}}/>
        </label>
        {imageData?<img className="sr-preview" src={imageData} alt="ตัวอย่างใบเสร็จที่แนบ"/>:null}
        <p className="sr-hint">ระบบตรวจเลขที่ใบเสร็จและภาพซ้ำทุกบัญชี หาก OCR อ่านไม่ครบ Admin จะตรวจหลักฐานด้วยตนเอง</p>
       </>:<>
        <label>อีเมลสำหรับใช้งาน Netflix<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
        <label className="sr-checklabel"><input type="checkbox" checked={neverPaid} onChange={e=>setNeverPaid(e.target.checked)}/>
         ยืนยันว่าอีเมลนี้ไม่เคยเป็นสมาชิก Netflix แบบเรียกเก็บค่าบริการมาก่อน</label>
        <p className="sr-hint">ระบบไม่สามารถตรวจประวัติการชำระของ Netflix เองได้ Admin จะตรวจเงื่อนไขก่อนจัดส่งสิทธิ์</p>
       </>}
       <button type="submit" className="sr-primary sr-block" disabled={busy||(reward.type==="receipt"?(!receiptValid||receiptDuplicate||!imageData):!neverPaid)}>
        {busy?"กำลังส่ง...":"ส่งคำขอให้ Admin ตรวจสอบ"}</button>
      </form>:null}
     </div>
    </section>
   </div>,document.body):null}
 </>;
}
