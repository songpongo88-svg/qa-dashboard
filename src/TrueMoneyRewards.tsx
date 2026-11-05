import React,{useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
export type TrueMoneyItem={
 id:string; rewardId:string; name:string;amountBaht:number;price:number;
 redeemedAt:string;expiresAt:string;status:string;submittedAt:string;dueDate:string;paidAt:string;
};
const PRICE=7000;
function dateThai(value:string){
 if(!value)return "—";
 const d=new Date(value);
 return Number.isFinite(d.getTime())?d.toLocaleString("th-TH",{timeZone:"Asia/Bangkok",day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}):value;
}
function dueThai(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return "—";
 const d=new Date(value+"T12:00:00+07:00");
 return d.toLocaleDateString("th-TH",{timeZone:"Asia/Bangkok",day:"numeric",month:"long",year:"numeric"});
}
function Diamond({size=82}:{size?:number}){
 return <svg viewBox="0 0 140 140" width={size} height={size} aria-hidden="true"><defs><linearGradient id="tm-icon-gradient" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#ffebaf"/><stop offset=".5" stopColor="#f7b64b"/><stop offset="1" stopColor="#d88129"/></linearGradient></defs>
  <rect x="13" y="22" width="114" height="91" rx="22" fill="#fff" stroke="#c1a9df" strokeWidth="4"/>
  <rect x="26" y="35" width="88" height="63" rx="13" fill="#f8ddff"/>
  <path d="M28 52h84" stroke="#b986e1" strokeWidth="5"/>
  <circle cx="102" cy="92" r="33" fill="url(#tm-icon-gradient)" stroke="#fff8db" strokeWidth="5"/>
  <text x="102" y="99" fontWeight="900" fontSize="24" fill="#72410c" textAnchor="middle" fontFamily="Kanit,sans-serif">฿20</text>
  <path d="m35 7 3 9 9 3-9 3-3 9-3-9-9-3 9-3Z" fill="#ffe79c"/>
 </svg>;
}
async function request(action:string,username:string,sessionId:string,extra:Record<string,unknown>={}){
 const response=await fetch("/api/sparks-admin",{
  method:"POST",cache:"no-store",headers:{"content-type":"application/json"},
  body:JSON.stringify({action,actorUsername:username,sessionId,...extra}),
 });
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(String(result.error||"ไม่สามารถทำรายการได้"));
 return result;
}
function State({status,expiresAt}:{status:string;expiresAt:string}){
 const expired=status==="available"&&expiresAt&&Date.parse(expiresAt)<=Date.now();
 const current=expired?"expired":status;
 return <span className={"qa-sparks-item-status "+current}>{current==="paid"?"โอนสำเร็จ":current==="submitted"?"รอโอนเงิน":current==="expired"?"หมดอายุ":"พร้อมใช้"}</span>;
}
type RewardProps={username:string;sessionId:string;balance:number;loaded:boolean;onRedeem?:()=>void;};
export function TrueMoneyRewardCard({username,sessionId,balance,loaded,onRedeem}:RewardProps){
 const [open,setOpen]=useState(false),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const [theme,setTheme]=useState({accent:"#8533a8",dark:"#50245f"});
 const trigger=useRef<HTMLButtonElement>(null),closeRef=useRef<HTMLButtonElement>(null),purchaseId=useRef("");
 useEffect(()=>{purchaseId.current="";setOpen(false)},[username]);
 useEffect(()=>{
  if(!open)return;
  const old=document.body.style.overflow;document.body.style.overflow="hidden";closeRef.current?.focus();
  const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape"&&!busy)setOpen(false)};
  document.addEventListener("keydown",onKey);
  return ()=>{document.body.style.overflow=old;document.removeEventListener("keydown",onKey);trigger.current?.focus()};
 },[open,busy]);
 const openDetail=()=>{
  const style=trigger.current?window.getComputedStyle(trigger.current):null;
  setTheme({accent:style?.getPropertyValue("--sparks-accent").trim()||"#8533a8",
   dark:style?.getPropertyValue("--sparks-dark").trim()||"#50245f"});
  setConfirm(false);setError("");setNotice("");setOpen(true);
 };
 const redeem=async()=>{
  if(!loaded||balance<PRICE||busy||!username||!sessionId)return;
  setBusy(true);setError("");
  try{
   if(!purchaseId.current)purchaseId.current=crypto.randomUUID();
   const result=await request("redeem-truemoney",username,sessionId,{requestId:purchaseId.current});
   purchaseId.current="";setConfirm(false);
   setNotice(result.alreadyApplied?"รายการนี้เคยแลกแล้ว": "แลกสำเร็จ! Item TrueMoney 20 บาท ถูกเพิ่มใน My Items แล้ว");
   onRedeem?.();window.dispatchEvent(new Event("qa:sparks-updated"));
  }catch(e){setError(e instanceof Error?e.message:"แลกรางวัลไม่สำเร็จ")}
  finally{setBusy(false)}
 };
 return <>
  <button type="button" ref={trigger} className="qa-sparks-reward-tile qa-sparks-truemoney-tile" onClick={openDetail}
   aria-haspopup="dialog" aria-expanded={open} data-reward-item="truemoney-20">
   <span className="qa-sparks-reward-tile-art qa-sparks-truemoney-art"><Diamond size={139}/></span>
   <span className="qa-sparks-reward-tile-copy">
    <span className="qa-sparks-reward-tile-kicker">QA SPARKS · CASH REWARD <span className="qa-sparks-reward-tile-new">NEW</span></span>
    <strong className="qa-sparks-reward-tile-name">TrueMoney 20 บาท</strong>
    <span className="qa-sparks-reward-tile-subtitle">แลกเป็น Item พิเศษสำหรับรับเงินผ่าน TrueMoney</span>
    <span className="qa-sparks-reward-tile-footer"><span className="qa-sparks-reward-tile-price">✦ 7,000 <small>QA Sparks</small></span>
     <span className="qa-sparks-reward-tile-view">ดูรายละเอียด ›</span></span>
   </span>
  </button>
  {open&&typeof document!=="undefined"?createPortal(
   <div className="qa-sparks-reward-detail-backdrop" style={{"--sparks-accent":theme.accent,"--sparks-dark":theme.dark} as React.CSSProperties} onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setOpen(false)}}>
    <section className="qa-sparks-reward-detail-modal" role="dialog" aria-modal="true" aria-labelledby="tm-reward-title">
     <button ref={closeRef} type="button" className="qa-sparks-reward-detail-close" onClick={()=>setOpen(false)} disabled={busy} aria-label="ปิดรายละเอียด">×</button>
     <div className="qa-sparks-reward-detail-hero">
      <div className="qa-sparks-reward-detail-art qa-sparks-truemoney-hero"><Diamond size={220}/></div>
      <div className="qa-sparks-reward-detail-heading">
       <span className="qa-sparks-reward-detail-event-label">✦ QA SPARKS · DIGITAL CASH REWARD</span>
       <h2 id="tm-reward-title">TrueMoney 20 บาท</h2>
       <p>แลกรับ Item แล้วใช้ส่งคำขอรับเงิน 20 บาทผ่าน TrueMoney</p>
       <div className="qa-sparks-reward-detail-tags"><span>7,000 Sparks</span><span>อายุ Item 30 วัน</span></div>
      </div>
     </div>
     <div className="qa-sparks-reward-detail-scroll">
      <div className="qa-sparks-reward-detail-stats">
       <div><span>ราคาแลก</span><strong>7,000 <small>Sparks</small></strong></div>
       <div><span>มูลค่ารางวัล</span><strong>20 <small>บาท</small></strong></div>
       <div><span>อายุแต่ละ Item</span><strong>30 <small>วัน</small></strong></div>
      </div>
      <h3 className="qa-sparks-reward-detail-section-title">วิธีใช้งาน</h3>
      <div className="qa-sparks-reward-detail-steps">
       <div><b>01</b><strong>แลก Item</strong><p>ใช้ 7,000 Sparks และรับ Item เก็บไว้ใน My Items</p></div>
       <div><b>02</b><strong>กดใช้ภายใน 30 วัน</strong><p>กรอกเบอร์ TrueMoney 10 หลัก ระบบส่งคำขอไปยัง Tracker</p></div>
       <div><b>03</b><strong>รอรับเงิน</strong><p>Admin โอนเงินให้ภายใน 14 วันทำการ หลังจากส่งคำขอ</p></div>
      </div>
      <h3 className="qa-sparks-reward-detail-section-title">เงื่อนไขสำคัญ</h3>
      <ul className="qa-sparks-reward-detail-rules">
       <li>Item แต่ละชิ้นมีวันหมดอายุต่างกัน นับ 30 วันจากวันแลก</li>
       <li>ใช้ 1 ครั้งต่อ Item เท่านั้น หากเลยวันหมดอายุแล้วจะกดใช้ไม่ได้</li>
       <li>หลังส่งคำขอทันเวลา แม้ Item หมดอายุต่อมา คำขอยังดำเนินการต่อ</li>
       <li>วันครบกำหนดคำนวณจากวันทำการถัดไป ไม่รวมวันเสาร์และอาทิตย์</li>
       <li>ระบบไม่ได้โอนเงินจริงอัตโนมัติ Admin เป็นผู้โอนเงินและยืนยันสถานะ</li>
      </ul>
     </div>
     <div className="qa-sparks-reward-detail-action">
      {notice?<div role="status" className="qa-sparks-reward-detail-success">{notice}</div>:null}
      {error?<div role="alert" className="qa-sparks-reward-detail-error">{error}</div>:null}
      {confirm?<div className="qa-sparks-reward-detail-confirm"><strong>ยืนยันแลก TrueMoney 20 บาท</strong>
        <p>หัก 7,000 Sparks และรับ Item อายุ 30 วัน (ยังไม่ใช่การส่งคำขอรับเงิน)</p>
        <div><button type="button" className="qa-sparks-reward-detail-secondary" disabled={busy} onClick={()=>setConfirm(false)}>กลับ</button>
         <button type="button" className="qa-sparks-reward-detail-primary" disabled={busy||!loaded||balance<PRICE} onClick={()=>void redeem()}>{busy?"กำลังแลก":"ยืนยันแลก 7,000 Sparks"}</button></div>
       </div>:<div className="qa-sparks-reward-detail-purchase">
        <div className="qa-sparks-reward-detail-purchase-copy"><small>SPARKS คงเหลือ</small><strong>{loaded?balance.toLocaleString():"—"} <span>Sparks</span></strong></div>
        <button type="button" className="qa-sparks-reward-detail-primary" disabled={!loaded||balance<PRICE||busy} onClick={()=>setConfirm(true)}>
         {!loaded?"กำลังโหลด":balance<PRICE?"Sparks ไม่เพียงพอ":"แลก Item · 7,000 Sparks"}</button>
       </div>}
     </div>
    </section></div>,document.body):null}
 </>;
}
type ItemProps={username:string;sessionId:string;loaded:boolean;reloadToken?:number;};
export function MyTrueMoneyItems({username,sessionId,loaded,reloadToken=0}:ItemProps){
 const [items,setItems]=useState<TrueMoneyItem[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState("");
 const [selected,setSelected]=useState<TrueMoneyItem|null>(null),[phone,setPhone]=useState(""),[busy,setBusy]=useState(false);
 const [confirmation,setConfirmation]=useState(false),[notice,setNotice]=useState("");
 const fetchItems=async()=>{
  if(!username||!sessionId||!loaded)return;
  setLoading(true);
  try{const r=await request("list-truemoney-items",username,sessionId);setItems(r.items||[]);setError("")}
  catch(e){setError(e instanceof Error?e.message:"ไม่สามารถโหลด My Items ได้")}
  finally{setLoading(false)}
 };
 useEffect(()=>{void fetchItems()},[username,sessionId,loaded,reloadToken]);
 useEffect(()=>{
  const onRefresh=()=>void fetchItems();
  window.addEventListener("qa:items-updated",onRefresh);
  return()=>window.removeEventListener("qa:items-updated",onRefresh)
 },[username,sessionId,loaded]);
 const submit=async()=>{
  if(!selected||busy||!confirmation||!/^0\d{9}$/.test(phone))return;
  setBusy(true);setError("");
  try{
   const r=await request("use-truemoney-item",username,sessionId,{itemId:selected.id,receivingPhone:phone});
   setNotice(r.alreadyApplied?"คำขอนี้ส่งไปแล้ว":"ส่งคำขอแล้ว · รับเงินภายใน "+dueThai(r.item?.dueDate||""));
   setConfirmation(false);setPhone("");setSelected(null);await fetchItems();
   window.dispatchEvent(new Event("qa:items-updated"));
  }catch(e){setError(e instanceof Error?e.message:"ส่งคำขอไม่สำเร็จ");setConfirmation(false)}
  finally{setBusy(false)}
 };
 return <section className="qa-sparks-panel qa-sparks-inventory" aria-label="My Items">
   <div className="qa-sparks-inventory-heading"><h2>My Items</h2><button type="button" onClick={()=>void fetchItems()} disabled={loading}>รีเฟรช</button></div>
   <p>Item ของคุณแยกเป็นรายชิ้น พร้อมวันหมดอายุและสถานะคำขอรับเงิน</p>
   {loading?<span role="status">กำลังโหลด Item...</span>:null}
   {error?<div role="alert" className="qa-sparks-reward-detail-error">{error}</div>:null}
   {notice?<div role="status" className="qa-sparks-reward-detail-success">{notice}</div>:null}
   {items.length? <div className="qa-sparks-items-grid">{items.map(item=><article className="qa-sparks-inventory-item" key={item.id}>
     <div className="qa-sparks-inventory-icon"><Diamond size={77}/></div>
     <div className="qa-sparks-inventory-data"><strong>TrueMoney 20 บาท</strong><State status={item.status} expiresAt={item.expiresAt}/>
       <small>แลก {dateThai(item.redeemedAt)}</small>
       <small>Item หมดอายุ {dateThai(item.expiresAt)}</small>
       {item.submittedAt?<small>ส่งคำขอ {dateThai(item.submittedAt)} · โอนภายใน {dueThai(item.dueDate)}</small>:null}
       {item.paidAt?<small>ยืนยันโอน {dateThai(item.paidAt)}</small>:null}
     </div>
     {item.status==="available"&&Date.parse(item.expiresAt)>Date.now()?<button type="button" className="qa-sparks-item-use"
       onClick={()=>{setSelected(item);setPhone("");setConfirmation(false);setError("")}}>ใช้ Item</button>:null}
    </article>)}</div>:!loading?<div className="qa-sparks-inventory-empty">ยังไม่มี Item · ไปที่ Reward Center เพื่อแลกรางวัล</div>:null}
   {selected&&typeof document!=="undefined"?createPortal(<div className="qa-sparks-checkin-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setSelected(null)}}>
    <section className="qa-sparks-item-use-dialog" role="dialog" aria-modal="true" aria-labelledby="tm-use-title">
     <button type="button" className="qa-sparks-checkin-close" disabled={busy} onClick={()=>setSelected(null)} aria-label="ปิด">×</button>
     <h2 id="tm-use-title">ใช้ Item · TrueMoney 20 บาท</h2>
     <p>กรอกหมายเลขโทรศัพท์บัญชี TrueMoney ที่ต้องการรับเงิน (10 หลัก)</p>
     <label htmlFor="truemoney-receiver-phone">หมายเลข TrueMoney</label>
     <input id="truemoney-receiver-phone" type="tel" inputMode="numeric" autoComplete="off"
      maxLength={10} placeholder="0XXXXXXXXX" value={phone} disabled={busy}
      onChange={e=>{setPhone(e.target.value.replace(/\D/g,"").slice(0,10));setConfirmation(false)}}/>
     <p className="qa-sparks-item-use-reminder">เมื่อส่งคำขอแล้ว ไม่สามารถใช้ Item นี้ซ้ำได้ และไม่สามารถแก้หมายเลขจากหน้านี้ได้</p>
     {error?<div role="alert" className="qa-sparks-reward-detail-error">{error}</div>:null}
     {confirmation?<div className="qa-sparks-item-use-confirm"><strong>ตรวจสอบหมายเลข {phone}</strong><p>ยืนยันส่งคำขอรับ TrueMoney 20 บาทใช่หรือไม่?</p></div>:null}
     <div className="qa-sparks-item-use-buttons"><button type="button" onClick={()=>{setSelected(null);setConfirmation(false)}} disabled={busy}>ยกเลิก</button>
      {confirmation?<button type="button" className="qa-sparks-item-use" disabled={busy} onClick={()=>void submit()}>{busy?"กำลังส่ง":"ยืนยันส่งคำขอ"}</button>:
       <button type="button" className="qa-sparks-item-use" disabled={!/^0\d{9}$/.test(phone)||busy} onClick={()=>setConfirmation(true)}>ตรวจสอบและดำเนินการ</button>}</div>
    </section></div>,document.body):null}
  </section>;
}
