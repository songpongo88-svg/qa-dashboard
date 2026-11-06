import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./qaLottery.css";

type Ticket = {id:string;number:string;createdAt:string;paidAt:string|null;prize:number;matched:string[]};
type Draw = {date:string;status:"published"|"pending";officialResult?:{date:string;first:string;back3:string[];last2:string;source:string}|null;tickets:Ticket[]};
type LotteryState = {price:number;maxPerDraw:number;draw:Draw;previous:Draw|null;cutoffTime:string;timeZone:string};
const points = (amount:number) => Number(amount||0).toLocaleString("th-TH");
const formattedDate = (value:string) => {
  const date = new Date(value+"T00:00:00+07:00");
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("th-TH",{timeZone:"Asia/Bangkok",day:"numeric",month:"long",year:"numeric"}) : value;
};
function PrizeList() {
  return <div className="ql-prizes" aria-label="รางวัล QA Lottery">
    <div><span>6 หลัก</span><strong>3,000</strong><small>Sparks</small></div>
    <div><span>ท้าย 3 ตัว</span><strong>1,500</strong><small>Sparks</small></div>
    <div><span>ท้าย 2 ตัว</span><strong>1,000</strong><small>Sparks</small></div>
  </div>;
}
function DrawTickets({draw}: {draw:Draw}) {
  if (!draw.tickets.length) return <p className="ql-muted">ยังไม่มีหมายเลขที่ซื้อในงวดนี้</p>;
  return <div className="ql-ticket-list">{draw.tickets.map(ticket=><div className="ql-ticket" key={ticket.id}>
    <div><strong>{ticket.number}</strong><small>ซื้อเมื่อ {new Date(ticket.createdAt).toLocaleString("th-TH",{timeZone:"Asia/Bangkok"})}</small></div>
    {ticket.paidAt ? <span className={ticket.prize>0?"ql-win":"ql-lost"}>{ticket.prize>0?"+ "+points(ticket.prize)+" Sparks":"ไม่ถูกรางวัล"}</span> : <span className="ql-pending">รอตรวจผล</span>}
  </div>)}</div>;
}
function LotteryTicketArt({large=false}:{large?:boolean}) {
  return <svg className={large?"ql-art-svg ql-art-svg--large":"ql-art-svg"} aria-hidden="true" viewBox="0 0 116 116" fill="none">
    <defs>
      <linearGradient id="ql-ticket-fill" x1="19" y1="8" x2="97" y2="105" gradientUnits="userSpaceOnUse">
        <stop stopColor="#fff9fe"/><stop offset="1" stopColor="#e9c4ff"/>
      </linearGradient>
      <linearGradient id="ql-ticket-band" x1="21" y1="31" x2="99" y2="52" gradientUnits="userSpaceOnUse">
        <stop stopColor="#a56fe4"/><stop offset="1" stopColor="#ce90e8"/>
      </linearGradient>
    </defs>
    <ellipse cx="59" cy="101" rx="35" ry="7" fill="#9051bd" opacity=".18"/>
    <g transform="rotate(-9 58 58)">
      <path d="M19 19a7 7 0 0 1 7-7h64a7 7 0 0 1 7 7v17a9 9 0 0 0 0 18v37a7 7 0 0 1-7 7H26a7 7 0 0 1-7-7V54a9 9 0 0 0 0-18V19Z" fill="url(#ql-ticket-fill)" stroke="#a775cf" strokeWidth="2.4"/>
      <path d="M22 30h72v25H22z" fill="url(#ql-ticket-band)"/>
      <text x="58" y="39" fill="#fff" textAnchor="middle" fontSize="9" fontWeight="900">QA LOTTERY</text>
      <text x="58" y="51" fill="#fffbe9" textAnchor="middle" fontSize="13" fontWeight="900" letterSpacing="1">123456</text>
      <path d="M29 66h58" stroke="#b083d7" strokeWidth="2" strokeDasharray="4 3" strokeLinecap="round"/>
      <circle cx="42" cy="78" r="7" fill="#ffce67" stroke="#f9ad4e" strokeWidth="1.3"/>
      <path d="m39 78 2 2 4-5" stroke="#915c15" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M55 75h27M55 81h21M30 90h54" stroke="#bb98d6" strokeWidth="2.3" strokeLinecap="round"/>
    </g>
    <path d="m92 13 2.9 7.1L102 23l-7.1 2.9L92 33l-2.9-7.1L82 23l7.1-2.9L92 13Z" fill="#f4c452" stroke="#fff2c8" strokeWidth="1.7"/>
  </svg>;
}

export default function QALottery({username,sessionId,balance,loaded}:{username:string;sessionId:string;balance:number;loaded:boolean}) {
  const [open,setOpen]=useState(false);
  const [data,setData]=useState<LotteryState|null>(null);
  const [digits,setDigits]=useState("");
  const [confirmNumber,setConfirmNumber]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [modalTheme,setModalTheme]=useState({accent:"#8651bb",dark:"#572a69",soft:"#faf0ff"});
  const trigger=useRef<HTMLButtonElement>(null);
  const closeButton=useRef<HTMLButtonElement>(null);
  const dialog=useRef<HTMLElement>(null);
  const busyRef=useRef(busy);
  const pendingPurchase=useRef<{drawDate:string;number:string;requestId:string}|null>(null);
  busyRef.current=busy;
  const request=useCallback(async(action:"qa-lottery-state"|"qa-lottery-buy",extra:Record<string,string>={})=>{
    const response=await fetch("/api/sparks-admin",{method:"POST",cache:"no-store",headers:{"content-type":"application/json"},
      body:JSON.stringify({action,actorUsername:username,sessionId,...extra})});
    const body=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(String(body.error||"ระบบ QA Lottery ยังไม่พร้อมใช้งาน"));
    return body;
  },[username,sessionId]);
  const refresh=useCallback(async()=>{
    if(!username||!sessionId)return;
    setBusy(true);setError("");
    try{setData(await request("qa-lottery-state"));}
    catch(e){setError(e instanceof Error?e.message:"ไม่สามารถโหลดข้อมูลได้");}
    finally{setBusy(false);}
  },[username,sessionId,request]);

  useEffect(()=>{
    setOpen(false);setData(null);setNotice("");setDigits("");setError("");setConfirmNumber("");
    pendingPurchase.current=null;
  },[username,sessionId]);

  useEffect(()=>{
    if(!open)return;
    const before=document.body.style.overflow;
    document.body.style.overflow="hidden";
    closeButton.current?.focus();
    const keydown=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){if(!busyRef.current){event.preventDefault();setOpen(false);}return;}
      if(event.key!=="Tab"||!dialog.current)return;
      const focusable=[...dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')];
      if(!focusable.length)return;
      if(event.shiftKey&&document.activeElement===focusable[0]){event.preventDefault();focusable[focusable.length-1].focus();}
      if(!event.shiftKey&&document.activeElement===focusable[focusable.length-1]){event.preventDefault();focusable[0].focus();}
    };
    document.addEventListener("keydown",keydown);
    return()=>{document.body.style.overflow=before;document.removeEventListener("keydown",keydown);trigger.current?.focus();};
  },[open]);

  const openDetails=()=>{
    if(trigger.current){
      const css=window.getComputedStyle(trigger.current);
      setModalTheme({
        accent:css.getPropertyValue("--sparks-accent").trim()||"#8651bb",
        dark:css.getPropertyValue("--sparks-dark").trim()||"#572a69",
        soft:css.getPropertyValue("--sparks-soft").trim()||"#faf0ff",
      });
    }
    setNotice("");setError("");setConfirmNumber("");setOpen(true);void refresh();
  };
  const prepareBuy=(event:React.FormEvent)=>{
    event.preventDefault();
    if(!data||!/^[0-9]{6}$/.test(digits)||busy||!loaded||!username||!sessionId)return;
    setConfirmNumber(digits);setError("");setNotice("");
  };
  async function buy() {
    if(!data||!confirmNumber||busy||!loaded)return;
    const drawDate=data.draw.date;
    const number=confirmNumber;
    setBusy(true);setError("");setNotice("");
    try{
      const prior=pendingPurchase.current;
      const requestId=prior&&prior.drawDate===drawDate&&prior.number===number
        ?prior.requestId
        :typeof crypto!=="undefined"&&typeof crypto.randomUUID==="function"
          ?crypto.randomUUID()
          :"ql-"+Date.now()+"-"+Math.random().toString(36).slice(2);
      pendingPurchase.current={drawDate,number,requestId};
      const result=await request("qa-lottery-buy",{number,drawDate,requestId});
      pendingPurchase.current=null;
      setNotice(result.alreadyPurchased?"หมายเลขนี้ถูกบันทึกไว้แล้ว":"ซื้อหมายเลข "+number+" เรียบร้อย หัก 120 Sparks");
      setConfirmNumber("");setDigits("");
      window.dispatchEvent(new CustomEvent("qa:sparks-updated"));
      try{setData(await request("qa-lottery-state"));}
      catch{setError("ซื้อสำเร็จ แต่ยังโหลดรายการล่าสุดไม่ได้ กรุณากดตรวจสอบข้อมูลใหม่");}
    }catch(e){setError(e instanceof Error?e.message:"ไม่สามารถซื้อเลขได้ กรุณาตรวจสอบรายการก่อนลองใหม่");}
    finally{setBusy(false);}
  }

  const tickets=data?.draw?.tickets||[];
  const available=loaded&&balance>=120&&tickets.length<2;
  return <>
    <button type="button" ref={trigger} data-quest-item="qa-lottery"
      className="qa-sparks-mini-item qa-sparks-mini-item--lottery"
      aria-label="เปิด QA Lottery · ซื้อเลข 6 หลัก 120 Sparks ต่อครั้ง จำกัด 2 ครั้งต่องวด"
      aria-haspopup="dialog" aria-expanded={open} onClick={openDetails}>
      <span className="qa-sparks-mini-art qa-sparks-mini-art--lottery">
        <LotteryTicketArt/>
        <span className="qa-sparks-mini-corner">120</span>
      </span>
      <strong className="qa-sparks-mini-name">QA Lottery</strong>
      <span className="qa-sparks-mini-value">120 Sparks/ใบ</span>
      <span className="qa-sparks-mini-hint">งวดวันที่ 1 และ 16</span>
    </button>
    {open&&typeof document!=="undefined"?createPortal(
      <div className="ql-modal-backdrop" style={{
        "--sparks-accent":modalTheme.accent,"--sparks-dark":modalTheme.dark,"--sparks-soft":modalTheme.soft,
      } as React.CSSProperties} onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setOpen(false);}}>
        <section className="ql-modal" role="dialog" aria-modal="true" ref={dialog}
          aria-labelledby="ql-modal-title" aria-describedby="ql-modal-desc">
          <button type="button" ref={closeButton} className="ql-modal-close" aria-label="ปิดรายละเอียด QA Lottery"
            disabled={busy} onClick={()=>setOpen(false)}>×</button>
          <header className="ql-modal-hero">
            <div className="ql-modal-hero-art"><LotteryTicketArt large/></div>
            <div>
              <span className="ql-modal-eyebrow">QA SPARKS · QUEST CENTER</span>
              <h2 id="ql-modal-title">QA Lottery</h2>
              <p id="ql-modal-desc">เลือกเลข 6 หลัก ลุ้นรับ Sparks โดยอ้างอิงผลสลากกินแบ่งรัฐบาลจริง</p>
              <span className="ql-modal-chip">งวดวันที่ 1 และ 16 ของทุกเดือน</span>
            </div>
          </header>
          <div className="ql-modal-body">
            <div className="ql-summary-grid">
              <div><small>ราคา / หมายเลข</small><strong>120 <span>Sparks</span></strong></div>
              <div><small>สิทธิ์ซื้อ / งวด</small><strong>2 <span>ครั้ง</span></strong></div>
              <div><small>ตรวจรางวัล</small><strong>3 <span>ประเภท</span></strong></div>
            </div>
            <h3>รางวัลที่มีสิทธิ์ได้รับ</h3>
            <PrizeList/>
            <p className="ql-muted">ใช้ผลจาก GLO แยกรางวัลที่ 1, เลขท้าย 3 ตัว และเลขท้าย 2 ตัว หากถูกรางวัลมากกว่า 1 ประเภทในหมายเลขเดียวกัน จะได้รับ Sparks รวมตามที่ถูกจริง</p>
            {busy&&!data?<p role="status" className="ql-loading">กำลังโหลดรายละเอียดงวด...</p>:null}
            {error?<p role="alert" className="ql-error">{error}</p>:null}
            {notice?<p role="status" className="ql-success">{notice}</p>:null}
            {data?<section className="ql-draw">
              <div className="ql-draw-head"><div><small>งวดที่เปิดให้เลือกเลข</small><strong>{formattedDate(data.draw.date)}</strong></div>
                <button className="ql-link" type="button" disabled={busy} onClick={()=>void refresh()}>ตรวจสอบข้อมูลใหม่</button></div>
              <div className="ql-usage"><span>ซื้อแล้ว <b>{tickets.length} / {data.maxPerDraw}</b> ครั้ง</span><span>ยอดคงเหลือ <b>{points(balance)}</b> Sparks</span></div>
              <form className="ql-buy" onSubmit={prepareBuy}>
                <label htmlFor="ql-number">กรอกเลขที่ต้องการ 6 หลัก</label>
                <div className="ql-buy-row">
                  <input id="ql-number" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                    autoComplete="off" value={digits} placeholder="000000" required
                    disabled={busy||!available||Boolean(confirmNumber)}
                    onChange={event=>{setDigits(event.target.value.replace(/[^0-9]/g,"").slice(0,6));pendingPurchase.current=null;}}/>
                  <button type="submit" disabled={busy||!available||digits.length!==6||Boolean(confirmNumber)}>
                    {!loaded?"กำลังตรวจยอด Sparks":tickets.length>=2?"ครบสิทธิ์งวดนี้":balance<120?"Sparks ไม่เพียงพอ":"ซื้อเลข · 120 Sparks"}
                  </button>
                </div>
              </form>
              {confirmNumber?<div className="ql-confirm" role="group" aria-label="ยืนยันการซื้อ QA Lottery">
                <p>ยืนยันซื้อหมายเลข <strong>{confirmNumber}</strong> งวด {formattedDate(data.draw.date)} ด้วย 120 Sparks?</p>
                <div>
                  <button type="button" className="ql-cancel" disabled={busy} onClick={()=>setConfirmNumber("")}>กลับไปแก้ไข</button>
                  <button type="button" className="ql-confirm-buy" disabled={busy} onClick={()=>void buy()}>
                    {busy?"กำลังบันทึก...":"ยืนยันหัก 120 Sparks"}
                  </button>
                </div>
              </div>:null}
              <h3>หมายเลขที่ซื้อในงวดนี้</h3>
              <DrawTickets draw={data.draw}/>
            </section>:null}
            {data?.previous&&(data.previous.tickets.length>0||data.previous.officialResult)?<section className="ql-prior">
              <h3>งวดก่อนหน้า · {formattedDate(data.previous.date)}</h3>
              {data.previous.officialResult?<div className="ql-official">
                <span>รางวัลที่ 1: <b>{data.previous.officialResult.first}</b></span>
                <span>เลขท้าย 3 ตัว: <b>{data.previous.officialResult.back3.join(" / ")}</b></span>
                <span>เลขท้าย 2 ตัว: <b>{data.previous.officialResult.last2}</b></span>
              </div>:<p className="ql-muted">รอผลอย่างเป็นทางการ</p>}
              <DrawTickets draw={data.previous}/>
            </section>:null}
            <div className="ql-modal-rules">
              <h3>เงื่อนไขการเข้าร่วม</h3>
              <p>ใช้ Sparks จากยอดที่มีอยู่ซื้อได้ไม่เกิน 2 ครั้งต่อคนต่องวด (120 Sparks ต่อหมายเลข) และปิดรับเวลา 14:00 น. ตามเวลาไทยในวันออกรางวัลปกติ</p>
              <p>ระบบจะตรวจผลสลากกินแบ่งรัฐบาลตามประเภทของ GLO จริง และจ่าย Sparks หลังยืนยันผลครบเท่านั้น หากแหล่งข้อมูลไม่พร้อม ระบบจะรอตรวจใหม่และไม่จ่ายรางวัลก่อนกำหนด</p>
            </div>
          </div>
        </section>
      </div>,document.body):null}
  </>;
}
