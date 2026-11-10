import React,{useEffect,useState} from "react";
import {createPortal} from "react-dom";
import {qaAutoPassAction} from "./qaAutoPassAction";

const FREE_END=Date.parse("2026-12-26T00:00:00+07:00");
const FREE_START=Date.parse("2026-11-11T00:00:00+07:00");
const PRICING=160;
type Props={
  username:string;sessionId:string;balance:number;owned:number;
  freeClaimedAt:string;loaded:boolean;mode?:"reward"|"inventory";
};

function AutoPassArtwork() {
  return <svg viewBox="0 0 112 112" role="img" aria-label="QA Access Auto-Pass ตั๋วผ่านภารกิจสีม่วงทอง" className="qa-auto-pass-art">
    <defs>
      <linearGradient id="qaAutoPassCard" x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="#fdf3ff"/><stop offset=".6" stopColor="#d3b3ff"/><stop offset="1" stopColor="#8866ce"/>
      </linearGradient>
      <linearGradient id="qaAutoPassSeal" x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="#fff4b0"/><stop offset="1" stopColor="#ffbc4e"/>
      </linearGradient>
    </defs>
    <rect width="112" height="112" rx="19" fill="url(#qaAutoPassCard)"/>
    <g transform="rotate(-12 55 57)">
      <rect x="19" y="28" width="74" height="53" rx="10" fill="#fff9ff" stroke="#763bb7" strokeWidth="3"/>
      <path d="M43 29V80" stroke="#c5a4df" strokeDasharray="4 4"/>
      <path d="M52 43h29M52 51h24M52 59h18" stroke="#ac81d5" strokeLinecap="round" strokeWidth="4"/>
      <circle cx="29" cy="55" r="12" fill="url(#qaAutoPassSeal)"/>
      <path d="m24 54 4 4 7-8" stroke="#633c97" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    </g>
    <circle cx="83" cy="80" r="20" fill="#7043b7" stroke="#fff5c7" strokeWidth="3"/>
    <path d="m73 80 7 7 13-17" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <path d="m13 12 3 5 5 3-5 3-3 5-3-5-5-3 5-3z" fill="#ffda64"/>
  </svg>;
}
export default function QaAutoPassRewardCard({
  username,sessionId,balance,owned,freeClaimedAt,loaded,mode="reward",
}:Props){
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [confirmBuy,setConfirmBuy]=useState(false);
  const [local,setLocal]=useState<{owned:number;balance:number;freeClaimed:boolean}|null>(null);
  const [time,setTime]=useState(()=>Date.now());
  useEffect(()=>{
    const update=()=>setTime(Date.now());
    const timer=window.setInterval(update,60_000);
    window.addEventListener("focus",update);
    return()=>{window.clearInterval(timer);window.removeEventListener("focus",update)};
  },[]);
  useEffect(()=>{setLocal(null);setSuccess("");setError("");},[username]);
  useEffect(()=>{
    if(local&&local.owned===owned&&local.balance===balance)setLocal(null);
  },[local,owned,balance]);
  const quantity=local?.owned??owned;
  const sparks=local?.balance??balance;
  const claimed=local?.freeClaimed??Boolean(freeClaimedAt);
  const freeActive=time>=FREE_START&&time<FREE_END;
  const canClaim=loaded&&Boolean(username)&&Boolean(sessionId)&&freeActive&&!claimed&&!busy;
  const canPurchase=loaded&&Boolean(username)&&Boolean(sessionId)&&sparks>=PRICING&&!busy;
  const run=async(type:"auto-pass-claim-free"|"auto-pass-buy")=>{
    if(type==="auto-pass-claim-free"&&!canClaim)return;
    if(type==="auto-pass-buy"&&!canPurchase)return;
    setError("");setSuccess("");setBusy(true);
    try{
      const result=await qaAutoPassAction(type,username,sessionId,
        type==="auto-pass-buy"?{requestId:crypto.randomUUID(),expectedPrice:PRICING}:{});
      setLocal({owned:Number(result.owned??quantity),balance:Number(result.balance??sparks),
        freeClaimed:type==="auto-pass-claim-free"||claimed});
      setConfirmBuy(false);
      setSuccess(type==="auto-pass-claim-free"
        ?result.alreadyApplied?"บัญชีนี้รับฟรีครบ 5 สิทธิ์แล้ว":"รับฟรี 5 สิทธิ์เรียบร้อย! ดูจำนวนใน My Items ได้ทันที"
        :"ซื้อ QA Access Auto-Pass 1 สิทธิ์สำเร็จ");
    }catch(reason){setError(reason instanceof Error?reason.message:"ไม่สามารถดำเนินการได้");}
    finally{setBusy(false);}
  };
  return <>
    <button type="button" data-reward-item="qa-access-auto-pass"
      className="qa-sparks-mini-item qa-auto-pass-item"
      style={mode==="reward"?{order:-PRICING}:undefined}
      onClick={()=>{setTime(Date.now());setError("");setSuccess("");setConfirmBuy(false);setOpen(true)}}
      aria-haspopup="dialog" aria-label={"เปิดรายละเอียด QA Access Auto-Pass"+(mode==="inventory"?" คงเหลือ "+quantity+" สิทธิ์":"")}>
      <span className="qa-sparks-mini-art"><AutoPassArtwork/>
        {mode==="inventory"?<span className="qa-sparks-mini-quantity">×{quantity}</span>:null}
        {mode==="reward"&&freeActive&&!claimed?<span className="qa-auto-pass-free-badge">FREE ×5</span>:null}
      </span>
      <strong className="qa-sparks-mini-name">QA Access Auto-Pass</strong>
      <span className="qa-sparks-mini-value">{mode==="inventory"?quantity+" สิทธิ์":
        freeActive&&!claimed?"ฟรี 5 สิทธิ์":PRICING+" Sparks"}</span>
    </button>
    {open&&typeof document!=="undefined"?createPortal(
      <div className="qa-auto-pass-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setOpen(false)}}>
        <section className="qa-auto-pass-modal" role="dialog" aria-modal="true" aria-label="QA Access Auto-Pass">
          <button type="button" className="qa-auto-pass-close" aria-label="ปิด" disabled={busy}
            onClick={()=>setOpen(false)}>×</button>
          <div className="qa-auto-pass-modal-top">
            <AutoPassArtwork/>
            <div>
              <small>QA SPARKS · SPECIAL ITEM</small>
              <h2>QA Access Auto-Pass</h2>
              <p>ข้ามภารกิจพิมพ์ และให้ระบบบันทึกว่าผ่าน QA Access Check ทันที โดยไม่ต้องพิมพ์เอง</p>
              <span>ใช้ได้ทั้ง Word Mode และ Sentence Mode</span>
            </div>
          </div>
          <div className="qa-auto-pass-modal-body">
            {mode==="reward"&&freeActive&&!claimed?<div className="qa-auto-pass-offer">
              <strong>รับฟรี 5 สิทธิ์พร้อมกัน</strong>
              <p>ปกติ 160 Sparks ต่อสิทธิ์ · กดรับฟรีได้ 1 ครั้งต่อบัญชี
              ภายในวันที่ 25 ธันวาคม 2026 เวลา 23:59 น. (เวลาไทย)</p>
            </div>:null}
            <div className="qa-auto-pass-stats">
              <div><span>สิทธิ์คงเหลือ</span><strong>{loaded?quantity:"—"}</strong></div>
              <div><span>ราคาปกติ</span><strong>160 <small>Sparks</small></strong></div>
              <div><span>ใช้ต่อภารกิจ</span><strong>1 <small>สิทธิ์</small></strong></div>
            </div>
            <h3>วิธีใช้งาน</h3>
            <p>เมื่อมี QA Access Check ระบบจะให้คุณเลือกว่าจะใช้ Auto-Pass หรือพิมพ์เอง
            หากกดใช้และยืนยัน ระบบจะหัก 1 สิทธิ์ พร้อมให้ผ่านภารกิจปัจจุบันทันที
            และไปยังภารกิจถัดไปหรือหน้า QA ตามปกติ</p>
            <p>ระบบบันทึกในประวัติว่า <b>Pass via Auto-Pass</b> แยกจากการพิมพ์จริง
            ไม่หักสิทธิ์อัตโนมัติ และใช้กับทั้ง Word Mode และ Sentence Mode</p>
            <h3>เงื่อนไข</h3>
            <ul>
              <li>กดรับฟรีครั้งเดียว ระบบเพิ่มให้ครบ 5 สิทธิ์ใน My Items เป็นการ์ดเดียวพร้อมจำนวนคงเหลือ</li>
              <li>วันสุดท้ายของการรับฟรีคือ 25 ธันวาคม 2026 ไม่ใช่วันหมดอายุของ Item</li>
              <li>ซื้อสิทธิ์ใหม่ได้ในราคา 160 Sparks ต่อสิทธิ์ ไม่คืน Sparks ให้รายการซื้อเก่า</li>
              <li>ใช้ 1 สิทธิ์ต่อ 1 ภารกิจ ต้องกดยืนยันก่อนใช้ทุกครั้ง</li>
            </ul>
            {success?<p className="qa-auto-pass-success" role="status">{success}</p>:null}
            {error?<p className="qa-auto-pass-error" role="alert">{error}</p>:null}
          </div>
          <div className="qa-auto-pass-footer">
            {mode==="inventory"?<strong>My Items · คงเหลือ {loaded?quantity:"—"} สิทธิ์</strong>:
              canClaim?<button type="button" disabled={busy} onClick={()=>void run("auto-pass-claim-free")}>
                {busy?"กำลังรับฟรี...":"รับฟรี 5 สิทธิ์"}</button>:
              <>
                {freeActive&&claimed?<span>รับฟรีแล้ว 1/1 ครั้ง</span>:null}
                {confirmBuy?<div className="qa-auto-pass-confirm">
                    <span>ยืนยันซื้อ 1 สิทธิ์ ราคา 160 Sparks · คงเหลือ {sparks-PRICING} Sparks</span>
                    <button type="button" disabled={!canPurchase} onClick={()=>void run("auto-pass-buy")}>
                      {busy?"กำลังซื้อ...":"ยืนยันซื้อ 160 Sparks"}</button>
                    <button type="button" className="qa-auto-pass-secondary" onClick={()=>setConfirmBuy(false)}>ยกเลิก</button>
                  </div>:<button type="button" disabled={!canPurchase} onClick={()=>setConfirmBuy(true)}>
                    {sparks<PRICING?"Sparks ไม่เพียงพอ":"ซื้อเพิ่ม 1 สิทธิ์ · 160 Sparks"}</button>}
              </>}
          </div>
        </section>
      </div>,document.body):null}
  </>;
}
