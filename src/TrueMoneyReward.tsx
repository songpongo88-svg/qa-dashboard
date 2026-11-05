import React,{useCallback,useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";

export const TRUE_MONEY_REWARD={id:"truemoney-20-thb",price:7000,value:20,validDays:30,paymentBusinessDays:14} as const;
type Item={itemId:string;rewardId:string;status:"unused"|"requested";redeemedAt:string;expiresAt:string;valueTHB:number;requestedAt?:string;requestId?:string};
type Request={requestId:string;itemId:string;status:string;dueDate:string;createdAt:string;amountTHB:number;phoneMasked:string;payoutConfirmedAt?:string};
type Detail={items:Item[];requests:Request[]};
type Props={username:string;sessionId:string;balance:number;loaded:boolean;mode:"reward"|"inventory"};
function date(value:string){
  const parsed=new Date(value);
  return Number.isFinite(parsed.getTime())?parsed.toLocaleString("th-TH",{
    timeZone:"Asia/Bangkok",year:"numeric",month:"short",day:"numeric",
    hour:"2-digit",minute:"2-digit",hour12:false,
  }):"—";
}
function dueDate(value:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value||""))return "—";
  const parsed=new Date(value+"T12:00:00Z");
  return parsed.toLocaleDateString("th-TH",{
    timeZone:"Asia/Bangkok",day:"numeric",month:"long",year:"numeric",
  });
}
function MoneyArt(){
  return <svg viewBox="0 0 220 160" role="img" aria-label="TrueMoney 20 บาท QA Sparks Event" className="qa-money-art-svg">
    <defs><linearGradient id="qa-money-grad" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#ff9e7c"/><stop offset=".56" stopColor="#fa5179"/><stop offset="1" stopColor="#bb3eaa"/></linearGradient><filter id="qa-money-shadow"><feDropShadow dx="0" dy="7" stdDeviation="5" floodOpacity=".3"/></filter></defs>
    <circle cx="110" cy="82" r="69" fill="#ffffff63"/><circle cx="110" cy="82" r="55" fill="none" stroke="#ffffffa5" strokeDasharray="5 7"/>
    <g filter="url(#qa-money-shadow)" transform="rotate(-10 110 80)">
      <rect x="33" y="39" width="157" height="101" rx="20" fill="url(#qa-money-grad)" stroke="#fff" strokeWidth="4"/>
      <rect x="50" y="55" width="124" height="68" rx="13" fill="#ffffff2a" stroke="#ffe0e5" strokeWidth="1.8"/>
      <text x="112" y="89" fill="white" fontWeight="900" fontFamily="Kanit,sans-serif" fontSize="32" textAnchor="middle">฿20</text>
      <text x="112" y="110" fill="white" fontWeight="750" fontFamily="Kanit,sans-serif" fontSize="12" textAnchor="middle">TrueMoney</text>
    </g><path d="m29 16 4 11 11 4-11 4-4 11-4-11-11-4 11-4Z" fill="#ffe49a"/>
    <path d="m190 27 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z" fill="#fff3c2"/>
  </svg>;
}
async function api(action:string,actorUsername:string,sessionId:string,extra:Record<string,unknown>={}){
  const response=await fetch("/api/sparks-admin",{
    method:"POST",headers:{"content-type":"application/json"},cache:"no-store",
    body:JSON.stringify({action,actorUsername,sessionId,...extra}),
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(String(body.error||"ไม่สามารถทำรายการ TrueMoney ได้"));
  return body;
}
function RewardCard({open}:{open:()=>void}){
  return <button type="button" className="qa-money-reward-tile" data-reward-item="truemoney-20" onClick={open}
    aria-haspopup="dialog" aria-label="ดูรายละเอียด TrueMoney 20 บาท ราคา 7,000 Sparks">
    <span className="qa-money-reward-tile-art"><MoneyArt/></span>
    <span className="qa-money-reward-tile-info">
      <small>QA SPARKS · DIGITAL REWARD</small>
      <strong>TrueMoney 20 THB</strong>
      <span>Item รับสิทธิ์โอนเงินผ่าน TrueMoney</span>
      <span className="qa-money-reward-price"><b>✦ 7,000</b> Sparks <span>ดูรายละเอียด ›</span></span>
    </span>
  </button>;
}
export default function TrueMoneyReward({username,sessionId,balance,loaded,mode}:Props){
  const [open,setOpen]=useState(false);
  const [items,setItems]=useState<Item[]>([]);
  const [requests,setRequests]=useState<Request[]>([]);
  const [inventoryLoaded,setInventoryLoaded]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [confirm,setConfirm]=useState(false);
  const [selected,setSelected]=useState("");
  const [phone,setPhone]=useState("");
  const [balanceAfter,setBalanceAfter]=useState<number|null>(null);
  const requestId=useRef("");
  const closeRef=useRef<HTMLButtonElement>(null);
  const themeRef=useRef<HTMLDivElement>(null);
  const [theme,setTheme]=useState("#8a4398");
  const effectiveBalance=balanceAfter??balance;
  useEffect(()=>{if(balanceAfter!==null&&balance===balanceAfter)setBalanceAfter(null);},[balance,balanceAfter]);
  const refresh=useCallback(async()=>{
    if(!username||!sessionId)return;
    const result:Detail=await api("list-my-truemoney",username,sessionId);
    setItems(result.items||[]);setRequests(result.requests||[]);
    setInventoryLoaded(true);
  },[username,sessionId]);
  useEffect(()=>{setItems([]);setRequests([]);setInventoryLoaded(false);setBalanceAfter(null);requestId.current="";},[username]);
  useEffect(()=>{if(mode!=="inventory")return;void refresh().catch(e=>setError(String(e?.message||e)));},[mode,refresh]);
  useEffect(()=>{
    if(!open)return;
    const old=document.body.style.overflow;document.body.style.overflow="hidden";
    closeRef.current?.focus();
    const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!busy)setOpen(false);};
    document.addEventListener("keydown",onKey);
    return()=>{document.body.style.overflow=old;document.removeEventListener("keydown",onKey);};
  },[open,busy]);
  const show=()=>{
    setOpen(true);setError("");setNotice("");setConfirm(false);
    if(themeRef.current){
      const values=window.getComputedStyle(themeRef.current);
      setTheme(values.getPropertyValue("--sparks-accent").trim()||"#8a4398");
    }
  };
  const buy=async()=>{
    if(!loaded||effectiveBalance<7000||busy)return;
    setBusy(true);setError("");
    try{
      if(!requestId.current)requestId.current=crypto.randomUUID();
      const result=await api("redeem-truemoney",username,sessionId,{requestId:requestId.current});
      requestId.current="";
      setBalanceAfter(result.balance);
      setConfirm(false);
      setNotice("แลกสำเร็จ! Item TrueMoney 20 บาทถูกเก็บไว้ใน My Items แล้ว อายุ 30 วันนับจากเวลาแลก");
      await refresh();window.dispatchEvent(new Event("qa:sparks-updated"));
    }catch(e){setError(e instanceof Error?e.message:"แลกไม่สำเร็จ");}
    finally{setBusy(false);}
  };
  const useItem=async()=>{
    if(!selected||!/^0\d{9}$/.test(phone)||busy)return;
    setBusy(true);setError("");
    try{
      const result=await api("use-truemoney-item",username,sessionId,{itemId:selected,phone});
      setSelected("");setPhone("");
      setNotice("ส่งคำขอสำเร็จ · รับเงินภายในวันที่ "+dueDate(result.dueDate)+" (นับ 14 วันทำการ ไม่รวมเสาร์–อาทิตย์)");
      await refresh();window.dispatchEvent(new Event("qa:sparks-updated"));
    }catch(e){setError(e instanceof Error?e.message:"ส่งคำขอไม่สำเร็จ");}
    finally{setBusy(false);}
  };
  const renderInventory=()=>{
    const now=Date.now();
    return <div className="qa-money-inventory">
      <div className="qa-money-inventory-heading"><strong>My Items · TrueMoney</strong><button type="button" onClick={()=>void refresh().catch(e=>setError(e.message))}>รีเฟรช</button></div>
      {!inventoryLoaded?<p>กำลังโหลด Item ของคุณ...</p>:items.length===0?<p>ยังไม่มี Item TrueMoney ที่แลกไว้</p>:items.map(item=>{
        const expired=Date.parse(item.expiresAt)<=now;
        const request=requests.find(row=>row.itemId===item.itemId);
        return <article className="qa-money-item" key={item.itemId}>
          <span className="qa-money-item-icon"><MoneyArt/></span>
          <span className="qa-money-item-desc">
            <strong>TrueMoney 20 บาท</strong><small>Item {item.itemId.slice(-8)}</small>
            <span>แลก: {date(item.redeemedAt)}</span>
            <span>หมดอายุ: {date(item.expiresAt)}</span>
            <b>{request?.status==="paid"?"โอนเงินสำเร็จ":item.status==="requested"?"ส่งคำขอแล้ว":expired?"Item หมดอายุ":"พร้อมใช้งาน"}</b>
            {request?<span>กำหนดรับเงินภายใน {dueDate(request.dueDate)} · {request.phoneMasked}</span>:null}
          </span>
          {item.status==="unused"&&!expired?<button type="button" onClick={()=>{setSelected(item.itemId);setPhone("");setError("");setNotice("");show();}}>ใช้ Item</button>:null}
        </article>;
      })}
      {requests.length?<div className="qa-money-requests"><strong>My Requests</strong>{requests.map(req=><p key={req.requestId}>
        TrueMoney {req.amountTHB} บาท · {req.status==="paid"?"โอนเงินสำเร็จ":"รอโอนเงิน"} · กำหนด {dueDate(req.dueDate)}
      </p>)}</div>:null}
    </div>;
  };
  return <div ref={themeRef} className="qa-money-reward-root">
    {mode==="reward"?<RewardCard open={show}/>:renderInventory()}
    {error&&!open?<p role="alert" className="qa-money-error">{error}</p>:null}
    {open&&typeof document!=="undefined"?createPortal(
      <div className="qa-money-modal-backdrop" style={{"--sparks-accent":theme} as React.CSSProperties}
        onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setOpen(false);}}>
        <section className="qa-money-modal" role="dialog" aria-modal="true" aria-labelledby="qa-money-title">
          <button type="button" ref={closeRef} className="qa-money-modal-close" onClick={()=>setOpen(false)} disabled={busy} aria-label="ปิดรายละเอียด">×</button>
          <div className="qa-money-modal-hero"><MoneyArt/><div><small>QA SPARKS DIGITAL REWARD</small><h2 id="qa-money-title">TrueMoney 20 THB</h2><p>แลกเป็น Item ก่อน แล้วค่อยกดใช้เพื่อส่งคำขอรับเงินจริง</p></div></div>
          <div className="qa-money-modal-content">
            <div className="qa-money-modal-stats"><span>7,000 Sparks / Item</span><span>อายุ 30 วัน</span><span>รับเงินใน 14 วันทำการ</span></div>
            <h3>วิธีใช้</h3>
            <p>1. แลก 7,000 Sparks รับ Item TrueMoney 20 บาทเข้า My Items พร้อมวันหมดอายุแยกตามชิ้น</p>
            <p>2. ภายใน 30 วันนับจากเวลาแลก กดใช้ Item และระบุเบอร์ TrueMoney 10 หลัก</p>
            <p>3. ส่งคำขอเข้าระบบ Tracker แล้วรับเงินภายในวันที่ระบบระบุ โดยนับ 14 วันทำการจากวันทำการถัดไป (ไม่รวมวันเสาร์–อาทิตย์)</p>
            <p>4. Admin โอนเงินจริงด้วยตนเอง และยืนยันสถานะโอนสำเร็จใน Tracker</p>
            <p>ใช้ Item 1 ครั้งต่อชิ้นเท่านั้น เมื่อหมดอายุจะไม่สามารถส่งคำขอใหม่ได้ แต่คำขอที่ส่งก่อนหมดอายุยังดำเนินการต่อได้</p>
            {selected?<div className="qa-money-modal-claim">
              <h3>ใช้ Item TrueMoney 20 บาท</h3><label htmlFor="qa-money-phone">หมายเลขรับเงิน TrueMoney (10 หลัก)</label>
              <input id="qa-money-phone" type="tel" inputMode="numeric" maxLength={10} value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="0XXXXXXXXX"/>
              <p>เมื่อยืนยัน ระบบจะส่งคำขอเข้า Tracker และล็อก Item ชิ้นนี้ไม่ให้ส่งซ้ำ</p>
              <div className="qa-money-action-row"><button type="button" onClick={()=>setSelected("")}>ยกเลิก</button><button type="button" disabled={!/^0\d{9}$/.test(phone)||busy} onClick={()=>void useItem()}>{busy?"กำลังส่ง...":"ยืนยันส่งคำขอ"}</button></div>
            </div>:<div className="qa-money-modal-claim">
              <h3>แลกรับ Item</h3><p>ยอด Sparks: {loaded?effectiveBalance.toLocaleString():"—"}</p>
              {confirm?<><p>ยืนยันใช้ 7,000 Sparks เพื่อรับ Item TrueMoney 20 บาท?</p><div className="qa-money-action-row"><button type="button" onClick={()=>setConfirm(false)}>กลับ</button><button type="button" disabled={busy||!loaded||effectiveBalance<7000} onClick={()=>void buy()}>{busy?"กำลังแลก...":"ยืนยันแลก 7,000 Sparks"}</button></div></>:<button type="button" disabled={!loaded||effectiveBalance<7000} onClick={()=>setConfirm(true)}>{effectiveBalance<7000?"Sparks ไม่เพียงพอ":"แลก 1 Item · 7,000 Sparks"}</button>}
            </div>}
            {notice?<p className="qa-money-success" role="status">{notice}</p>:null}
            {error?<p className="qa-money-error" role="alert">{error}</p>:null}
          </div>
        </section>
      </div>,document.body):null}
  </div>;
}
