import React,{useCallback,useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import "./lotteryTicketInventory.css";
import {classifyLotteryTicket,type ItemShelfFilter} from "./qaSparksItemStatus";

type Ticket={id:string;number:string;drawDate:string;createdAt:string;paidAt?:string|null;prize:number;matched:string[];status?:string};
const date=(iso:string)=>new Date(iso.includes("T")?iso:iso+"T12:00:00+07:00").toLocaleDateString("th-TH",{day:"numeric",month:"short",year:"numeric",timeZone:"Asia/Bangkok"});
export default function LotteryTicketInventory({username,sessionId,loaded,inventoryFilter="processing"}:{username:string;sessionId:string;loaded:boolean;inventoryFilter?:ItemShelfFilter}){
 const [tickets,setTickets]=useState<Ticket[]>([]);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 const [selected,setSelected]=useState<string|null>(null);
 const trigger=useRef<HTMLButtonElement|null>(null);
 const closeRef=useRef<HTMLButtonElement>(null);
 const refresh=useCallback(async()=>{
  if(!username||!sessionId||!loaded)return;
  setLoading(true);setError("");
  try{
   const response=await fetch("/api/sparks-admin",{method:"POST",cache:"no-store",headers:{"content-type":"application/json"},
    body:JSON.stringify({action:"qa-lottery-my-tickets",actorUsername:username,sessionId})});
   const body=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(String(body.error||"ไม่สามารถโหลดตั๋วได้"));
   setTickets(Array.isArray(body.tickets)?body.tickets:[]);
  }catch(e){setError(e instanceof Error?e.message:"ไม่สามารถโหลดตั๋วได้");}
  finally{setLoading(false);}
 },[username,sessionId,loaded]);
 useEffect(()=>{setTickets([]);setSelected(null);},[username,sessionId]);
 useEffect(()=>{
  void refresh();
  const update=()=>{void refresh();};
  window.addEventListener("qa:sparks-items-refresh",update);
  return()=>window.removeEventListener("qa:sparks-items-refresh",update);
 },[refresh]);
 useEffect(()=>{
  if(!selected)return;
  const old=document.body.style.overflow;document.body.style.overflow="hidden";
  closeRef.current?.focus();
  const key=(e:KeyboardEvent)=>{if(e.key==="Escape")setSelected(null);};
  document.addEventListener("keydown",key);
  return()=>{document.removeEventListener("keydown",key);document.body.style.overflow=old;trigger.current?.focus();};
 },[selected]);
 const ticket=tickets.find(t=>t.id===selected);
 return <>
  {loading?<p className="qa-sparks-inventory-progress" role="status">กำลังตรวจสอบตั๋ว QA Lottery...</p>:null}
  {error?<p className="sr-error" role="alert">{error}</p>:null}
  {tickets.filter(t=>classifyLotteryTicket(t)===inventoryFilter).map(t=><button type="button" key={t.id} className="qa-sparks-mini-item qa-lottery-item" data-lottery-ticket={t.number}
    onClick={e=>{trigger.current=e.currentTarget;setSelected(t.id);}}>
    <span className="qa-sparks-mini-art qa-lottery-ticket-art">
      <span className="qa-lottery-ticket-icon">QA LOTTERY</span>
      <strong className="qa-lottery-ticket-digits">{t.number}</strong>
      <span className="qa-lottery-ticket-draw">{date(t.drawDate)}</span>
      <span className="qa-sparks-mini-corner">×1</span>
    </span>
    <strong className="qa-sparks-mini-name">Lottery #{t.number}</strong>
    <span className="qa-sparks-mini-value">{t.paidAt?(t.prize>0?"+"+t.prize.toLocaleString()+" Sparks":"ตรวจผลแล้ว"):"รอผลรางวัล"}</span>
  </button>)}

  {ticket&&typeof document!=="undefined"?createPortal(<div className="lt-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null);}}>
   <section className="lt-modal" role="dialog" aria-modal="true" aria-labelledby="lt-ticket-title">
    <button type="button" ref={closeRef} className="lt-close" onClick={()=>setSelected(null)} aria-label="ปิดรายละเอียดตั๋ว">×</button>
    <small>MY QA SPARKS · LOTTERY TICKET</small>
    <h2 id="lt-ticket-title">ตั๋ว QA Lottery</h2>
    <div className="lt-number">{ticket.number}</div>
    <div className="lt-facts"><span>งวด {date(ticket.drawDate)}</span><span>ซื้อเมื่อ {date(ticket.createdAt)}</span><span>120 Sparks</span></div>
    {ticket.paidAt?<div className="lt-result">
      <strong>{ticket.prize>0?"ถูกรางวัล +"+ticket.prize.toLocaleString()+" Sparks":"ไม่ถูกรางวัล"}</strong>
      <p>{ticket.matched?.length?"ประเภทที่ตรง: "+ticket.matched.map(x=>x==="first"?"รางวัลที่ 1":x==="back3"?"เลขท้าย 3 ตัว":"เลขท้าย 2 ตัว").join(" · "):"ตรวจรางวัลเสร็จแล้ว"}</p>
    </div>:<p className="lt-result">รอผลสลากกินแบ่งรัฐบาลและการตรวจสอบจากระบบ</p>}
    <button type="button" className="lt-refresh" disabled={loading} onClick={()=>void refresh()}>{loading?"กำลังตรวจ...":"ตรวจผลใหม่"}</button>
   </section>
  </div>,document.body):null}
 </>;
}
