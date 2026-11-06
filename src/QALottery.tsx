import React, { useCallback, useEffect, useState } from "react";
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
export default function QALottery({username,sessionId,balance,loaded}:{username:string;sessionId:string;balance:number;loaded:boolean}) {
  const [open,setOpen]=useState(false);
  const [data,setData]=useState<LotteryState|null>(null);
  const [digits,setDigits]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const request=useCallback(async(action:"qa-lottery-state"|"qa-lottery-buy",extra:Record<string,string>={})=>{
    const response=await fetch("/api/sparks-admin",{method:"POST",cache:"no-store",headers:{"content-type":"application/json"},
      body:JSON.stringify({action,actorUsername:username,sessionId,...extra})});
    const body=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(String(body.error||"ระบบ QA Lottery ยังไม่พร้อมใช้งาน"));
    return body;
  },[username,sessionId]);
  const refresh=useCallback(async()=>{
    if(!username||!sessionId) return;
    setBusy(true);setError("");
    try {setData(await request("qa-lottery-state"));}
    catch(e){setError(e instanceof Error?e.message:"ไม่สามารถโหลดข้อมูลได้");}
    finally{setBusy(false);}
  },[username,sessionId,request]);
  useEffect(()=>{setOpen(false);setData(null);setNotice("");setDigits("");setError("");},[username,sessionId]);
  async function buy(event:React.FormEvent) {
    event.preventDefault();
    if(!data || !/^[0-9]{6}$/.test(digits) || busy || !loaded || !username || !sessionId) return;
    if(!window.confirm("ยืนยันซื้อเลข "+digits+" งวด "+formattedDate(data.draw.date)+" ด้วย 120 Sparks หรือไม่?")) return;
    setBusy(true);setError("");setNotice("");
    try {
      const requestId=typeof crypto?.randomUUID==="function" ? crypto.randomUUID() : "ql-"+Date.now()+"-"+Math.random().toString(36).slice(2);
      const result=await request("qa-lottery-buy",{number:digits,drawDate:data.draw.date,requestId});
      setNotice(result.alreadyPurchased?"หมายเลขนี้ถูกบันทึกไว้แล้ว":"ซื้อหมายเลข "+digits+" เรียบร้อย หัก 120 Sparks");
      setDigits("");
      window.dispatchEvent(new CustomEvent("qa:sparks-updated"));
      setData(await request("qa-lottery-state"));
    } catch(e) {setError(e instanceof Error?e.message:"ไม่สามารถซื้อเลขได้ กรุณาตรวจสอบประวัติก่อนลองใหม่");}
    finally{setBusy(false);}
  }
  const tickets=data?.draw?.tickets||[];
  const available=loaded && balance>=120 && tickets.length<2;
  return <section className="ql-card" aria-label="QA Lottery">
    <div className="ql-card-head">
      <div><span className="ql-label">QUEST · EVERY DRAW</span><h3>QA Lottery</h3>
        <p>ซื้อเลข 6 หลักด้วย QA Sparks · อ้างอิงผลสลากกินแบ่งรัฐบาลจริง</p></div>
      <span className="ql-price">120 <small>Sparks / เลข</small></span>
    </div>
    <div className="ql-card-foot"><span>ทุกงวดวันที่ 1 และ 16 · จำกัด 2 ครั้ง / คน / งวด</span>
      <button type="button" className="ql-expand" onClick={()=>{if(!open){setOpen(true);void refresh();}else setOpen(false);}} aria-expanded={open}>
        {open?"ปิดรายละเอียด":"เลือกเลข / ตรวจรางวัล"}
      </button></div>
    {open ? <div className="ql-details">
      <PrizeList/>
      <p className="ql-muted">ตรวจรางวัลแยกทั้ง 3 ประเภทตามผล GLO จริง หากถูกหลายประเภท รับ Sparks สะสมตามที่ตรงทั้งหมด</p>
      {busy && !data ? <p className="ql-muted" role="status">กำลังโหลดข้อมูล QA Lottery...</p> : null}
      {error ? <p className="ql-error" role="alert">{error}</p> : null}
      {notice ? <p className="ql-success" role="status">{notice}</p> : null}
      {data ? <>
        <div className="ql-draw-head"><div><span>งวดที่เปิดซื้อ</span><strong>{formattedDate(data.draw.date)}</strong></div>
          <button type="button" className="ql-link" onClick={()=>void refresh()} disabled={busy}>ตรวจสอบข้อมูลใหม่</button></div>
        <div className="ql-usage"><span>ซื้อแล้ว {tickets.length} / {data.maxPerDraw} ครั้ง</span><span>คงเหลือ {points(balance)} Sparks</span></div>
        <form onSubmit={e=>void buy(e)} className="ql-buy">
          <label htmlFor="ql-number">หมายเลขสลาก 6 หลัก</label>
          <input id="ql-number" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={digits}
            placeholder="000000" disabled={busy||!available} onChange={e=>setDigits(e.target.value.replace(/[^0-9]/g,"").slice(0,6))} required/>
          <button type="submit" disabled={busy||!available||digits.length!==6}>{busy?"กำลังดำเนินการ...":!loaded?"กำลังโหลด Sparks":tickets.length>=2?"ครบสิทธิ์งวดนี้":balance<120?"Sparks ไม่เพียงพอ":"ยืนยันซื้อ · 120 Sparks"}</button>
        </form>
        <DrawTickets draw={data.draw}/>
        {data.previous && (data.previous.tickets.length>0||data.previous.officialResult) ? <div className="ql-prior">
          <h4>งวดก่อนหน้า · {formattedDate(data.previous.date)}</h4>
          {data.previous.officialResult ? <div className="ql-official"><span>รางวัลที่ 1: <b>{data.previous.officialResult.first}</b></span>
            <span>ท้าย 3 ตัว: <b>{data.previous.officialResult.back3.join(" / ")}</b></span>
            <span>ท้าย 2 ตัว: <b>{data.previous.officialResult.last2}</b></span></div> : <p className="ql-muted">รอประกาศผลอย่างเป็นทางการ</p>}
          <DrawTickets draw={data.previous}/></div> : null}
        <p className="ql-disclaimer">ปิดรับเลขเวลา 14:00 น. (ไทย) ในวันออกรางวัลตามงวดปกติ ผลรางวัลและการจ่าย Sparks จะอัปเดตหลัง GLO ประกาศครบและระบบตรวจสอบสำเร็จ ข้อมูลจากสำนักงานสลากกินแบ่งรัฐบาล</p>
      </>:null}
    </div>:null}
  </section>;
}
