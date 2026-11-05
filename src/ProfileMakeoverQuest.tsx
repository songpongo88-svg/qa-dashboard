import React,{useEffect,useState,useRef} from "react";
import {createPortal} from "react-dom";
type Props={username:string;sessionId:string;claimed:boolean;loaded:boolean};
export default function ProfileMakeoverQuest({username,sessionId,claimed,loaded}:Props){
 const [open,setOpen]=useState(false),[status,setStatus]=useState<{credited:boolean;expired:boolean}|null>(null);
 const ref=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  if(!username||!sessionId||!open)return;
  let live=true;
  const load=async()=>{
   try{
    const r=await fetch("/api/sparks-admin",{method:"POST",headers:{"content-type":"application/json"},
     body:JSON.stringify({action:"profile-makeover-status",actorUsername:username,sessionId})});
    if(r.ok){const v=await r.json();if(live)setStatus(v);}
   }catch{}
  };
  void load();
  const handler=()=>void load();
  window.addEventListener("qa:profile-quest-checked",handler);
  window.addEventListener("qa:sparks-updated",handler);
  return ()=>{live=false;window.removeEventListener("qa:profile-quest-checked",handler);window.removeEventListener("qa:sparks-updated",handler)};
 },[username,sessionId,open]);
 useEffect(()=>{
   if(!open)return;
   const escape=(e:KeyboardEvent)=>{if(e.key==="Escape")setOpen(false);};
   document.addEventListener("keydown",escape);
   return ()=>{document.removeEventListener("keydown",escape);ref.current?.focus()};
 },[open]);
 const done=claimed||Boolean(status?.credited);
 const ended=status?.expired || new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())>"2026-12-15";
 return <>
  <button ref={ref} type="button" className="qa-sparks-quest-tile qa-sparks-profile-quest-item" data-quest-item="profile-makeover"
   aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}>
    <span className="qa-sparks-quest-tile-art qa-sparks-profile-quest-art">
      <svg viewBox="0 0 120 120" width="106" height="106" aria-hidden="true"><defs><linearGradient id="photo-quest-grad" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#c287e2"/><stop offset="1" stopColor="#7838b3"/></linearGradient></defs>
      <rect x="16" y="16" width="88" height="88" rx="23" fill="#fff" stroke="#eac7f4" strokeWidth="4"/>
      <circle cx="60" cy="48" r="17" fill="url(#photo-quest-grad)"/>
      <path d="M28 93c0-19 14-31 32-31s32 12 32 31" fill="url(#photo-quest-grad)"/>
      <circle cx="91" cy="85" r="20" fill="#ffdf78" stroke="white" strokeWidth="3"/>
      <path d="m91 73 3 9 9 3-9 3-3 9-3-9-9-3 9-3Z" fill="#aa6a0a"/></svg>
      <span className="qa-sparks-quest-coin">✦ 150</span>
    </span>
    <span className="qa-sparks-quest-tile-details">
      <span className="qa-sparks-quest-eyebrow"><span>SPECIAL QUEST</span><span className={"qa-sparks-quest-state "+(done?"live":ended?"finished":"upcoming")}>{done?"รับรางวัลแล้ว":ended?"สิ้นสุดแล้ว":"Auto Reward"}</span></span>
      <strong>Profile Makeover</strong><span className="qa-sparks-quest-tile-dates">เปลี่ยนรูปโปรไฟล์จาก Default · ถึง 15 ธ.ค. 2026</span>
      <span className="qa-sparks-quest-tile-bottom"><span><b>+150</b> Sparks ครั้งเดียว</span><span>ดูรายละเอียด ›</span></span>
    </span>
  </button>
  {open&&typeof document!=="undefined"?createPortal(<div className="qa-sparks-checkin-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}>
   <section className="qa-sparks-checkin-modal qa-sparks-profile-quest-modal" role="dialog" aria-modal="true" aria-labelledby="qa-profile-quest-title">
    <button type="button" className="qa-sparks-checkin-close" onClick={()=>setOpen(false)} aria-label="ปิด">×</button>
    <div className="qa-sparks-checkin-hero">
     <span className="qa-sparks-checkin-hero-badge">✦ QA SPARKS QUEST #02 · SPECIAL EVENT</span>
     <div className="qa-sparks-checkin-hero-flex"><div className="qa-sparks-checkin-hero-icon"><svg viewBox="0 0 48 48" width="65" aria-hidden="true"><circle cx="24" cy="16" r="9" fill="#a76dcd"/><path d="M7 43q1-20 17-20t17 20Z" fill="#a76dcd"/></svg></div>
      <div><h2 id="qa-profile-quest-title">Profile Makeover</h2><p>เปลี่ยนรูปโปรไฟล์เป็นรูปของคุณเอง รับรางวัลอัตโนมัติ</p>
       <span className="qa-sparks-checkin-event-dates">+150 Sparks · ถึง 15 ธันวาคม 2026 เวลา 23:59 น. (เวลาไทย)</span></div></div>
    </div>
    <div className="qa-sparks-checkin-body">
     <div className="qa-sparks-checkin-stats"><div><span>รางวัล</span><strong>150 <small>Sparks</small></strong></div><div><span>รับได้</span><strong>1 <small>ครั้ง/บัญชี</small></strong></div><div><span>สถานะ</span><strong className="qa-sparks-profile-status">{!loaded?"กำลังโหลด":done?"สำเร็จ":ended?"สิ้นสุด":"รอตรวจสอบ"}</strong></div></div>
     <h3 className="qa-sparks-checkin-calendar-head">วิธีเข้าร่วม</h3>
     <div className="qa-sparks-checkin-rules">
      <p>ถ้าคุณใช้รูป Default ของ QA Dashboard ให้คลิกรูปโปรไฟล์ในแถบด้านซ้าย เลือกรูปและบันทึก ระบบจะตรวจสอบรูปจริงที่บันทึกไว้ก่อนให้รางวัล</p>
      <p>ถ้าคุณตั้งรูปโปรไฟล์ของตัวเองไว้อยู่แล้ว ระบบจะตรวจสอบและให้ 150 Sparks อัตโนมัติเมื่อเข้าใช้งาน ไม่ต้องเปลี่ยนรูปใหม่</p>
      <p>ไม่ต้องกดรับรางวัล เปลี่ยนรูปอีกกี่ครั้งก็ได้รับเพียงครั้งเดียว คะแนนนับใน Member Level และเพดาน 200,000 Sparks ต่อปี</p>
      <p>เมื่อเกินวันที่ 15 ธันวาคม 2026 จะไม่สามารถรับรางวัลเพิ่มได้</p>
     </div>
     <div className="qa-sparks-profile-note" role="status">{done?"Quest Completed · คุณได้รับ 150 QA Sparks แล้ว":ended?"กิจกรรมหมดเวลาแล้ว":"รางวัลจะเพิ่มให้อัตโนมัติเมื่อระบบตรวจพบรูปที่เปลี่ยนเองและบันทึกสิทธิ์สำเร็จ"}</div>
    </div>
   </section></div>,document.body):null}
 </>;
}
