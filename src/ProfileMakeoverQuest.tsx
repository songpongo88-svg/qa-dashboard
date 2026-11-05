import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchStoredProfilePhoto } from "./profilePhotoStore";

export const PROFILE_MAKEOVER_QUEST = {
  id: "profile-makeover-2026", end: "2026-12-15", reward: 150,
} as const;

function checkDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part=(name:string)=>parts.find((row)=>row.type===name)?.value||"";
  return [part("year"),part("month"),part("day")].join("-");
}

export function ProfileMakeoverAutoClaim({ username, sessionId }: { username:string;sessionId:string }) {
  const busy=useRef(false);
  const completed=useRef(false);
  const lastIdentity=useRef("");
  useEffect(()=>{
    const identity=username.toLowerCase()+":"+sessionId;
    if(identity!==lastIdentity.current){lastIdentity.current=identity;completed.current=false;}
    if(!username || !sessionId || checkDate()>"2026-12-15")return;
    let alive=true;
    const inspect=async()=>{
      if(busy.current || completed.current || !alive || checkDate()>"2026-12-15")return;
      busy.current=true;
      try{
        const photo=await fetchStoredProfilePhoto(username);
        if(!alive || !photo?.photoDataUrl) return;
        const response=await fetch("/api/sparks-admin",{
          method:"POST",headers:{"content-type":"application/json"},cache:"no-store",
          body:JSON.stringify({action:"claim-profile-makeover",actorUsername:username,sessionId}),
        });
        const result=await response.json().catch(()=>({}));
        if(!alive)return;
        if(response.ok && (result.updated || result.alreadyClaimed)){
          completed.current=true;
          if(result.updated){
            window.dispatchEvent(new Event("qa:sparks-updated"));
            window.dispatchEvent(new CustomEvent("qa:profile-quest-reward",{detail:{amount:150}}));
          }
        }
      }catch{
        // No local rewards are granted when Firestore is offline.
      }finally{busy.current=false;}
    };
    void inspect();
    const onChange=(event:Event)=>{
      const updated=(event as CustomEvent<{username?:string}>).detail?.username;
      if(updated && updated.toLowerCase()!==username.toLowerCase())return;
      void inspect();
    };
    const onFocus=()=>void inspect();
    window.addEventListener("qa-profile-photo-updated",onChange);
    window.addEventListener("focus",onFocus);
    return()=>{alive=false;window.removeEventListener("qa-profile-photo-updated",onChange);window.removeEventListener("focus",onFocus);};
  },[username,sessionId]);
  return null;
}

type Props={username:string;claimedAt:string;loaded:boolean};
export default function ProfileMakeoverQuest({username,claimedAt,loaded}:Props){
  const [open,setOpen]=useState(false);
  const close=useRef<HTMLButtonElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  const today=checkDate();
  const done=Boolean(claimedAt);
  const expired=today>PROFILE_MAKEOVER_QUEST.end;
  useEffect(()=>{
    if(!open)return;
    const overflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    close.current?.focus();
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(false);};
    document.addEventListener("keydown",escape);
    return()=>{document.body.style.overflow=overflow;document.removeEventListener("keydown",escape);trigger.current?.focus();};
  },[open]);
  return <>
    <button type="button" ref={trigger} data-quest-item="profile-makeover" className="qa-sparks-mini-item qa-sparks-mini-item--profile"
      aria-label={"เปิดรายละเอียด Quest Profile Makeover · +150 Sparks · " + (loaded && done ? "รับรางวัลแล้ว" : expired ? "สิ้นสุดกิจกรรม" : "รอทำภารกิจ")}
      aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}>
      <span className="qa-sparks-mini-art qa-sparks-mini-art--profile">
        <span className="qa-sparks-profile-avatar"><svg viewBox="0 0 64 64" width="80" height="80" fill="none" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="#fff6fd" stroke="#c783d5" strokeWidth="3"/><circle cx="32" cy="25" r="11" fill="#b986d4"/><path d="M11 52c4-20 38-20 42 0" fill="#b986d4"/><path d="m47 14 3 6 7 2-7 3-3 7-3-7-7-3 7-2Z" fill="#ffce5d"/></svg></span>
        <span className="qa-sparks-mini-corner">+150</span>
        {loaded && done ? <span className="qa-sparks-mini-done" aria-label="รับรางวัลแล้ว">✓</span> : null}
      </span>
      <strong className="qa-sparks-mini-name">Profile Makeover</strong>
      <span className="qa-sparks-mini-value">+150 Sparks</span>
    </button>
    {open&&typeof document!=="undefined"?createPortal(
      <div className="qa-sparks-profile-quest-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false);}}>
        <section role="dialog" aria-modal="true" aria-labelledby="qa-profile-quest-title" className="qa-sparks-profile-quest-dialog">
          <button type="button" ref={close} className="qa-sparks-profile-quest-close" aria-label="ปิดรายละเอียด" onClick={()=>setOpen(false)}>×</button>
          <div className="qa-sparks-profile-quest-banner"><span>SPECIAL QUEST · QA SPARKS</span><h2 id="qa-profile-quest-title">Profile Makeover</h2><p>ปรับลุคโปรไฟล์ของคุณ รับรางวัล 150 Sparks!</p></div>
          <div className="qa-sparks-profile-quest-detail">
            <div className="qa-sparks-profile-quest-facts"><div><small>รางวัล</small><strong>+150 Sparks</strong></div><div><small>รับได้</small><strong>ครั้งเดียว</strong></div><div><small>สิ้นสุด</small><strong>15 ธ.ค. 2026</strong></div></div>
            <h3>เงื่อนไขภารกิจ</h3>
            <p>เปลี่ยนจากรูปโปรไฟล์เริ่มต้นของ QA Dashboard เป็นรูปที่เลือกเอง เมื่อบันทึกภาพลงระบบสำเร็จ ระบบจะตรวจสอบและเพิ่มรางวัลให้อัตโนมัติ ไม่ต้องกดรับ</p>
            <p>หากคุณเปลี่ยนรูปโปรไฟล์ไว้แล้วก่อนกิจกรรมเริ่ม ระบบจะตรวจสอบรูปที่บันทึกอยู่และให้ 150 Sparks ได้ทันที ไม่ต้องเปลี่ยนรูปซ้ำ</p>
            <p>รับรางวัลได้เพียง 1 ครั้งต่อบัญชี เปลี่ยนรูปอีกไม่ทำให้ได้คะแนนเพิ่ม คะแนนนับรวม Member Level และเพดาน 200,000 Sparks ต่อปี</p>
            <div className={"qa-sparks-profile-quest-status"+(done?" completed":"")}>
              {!loaded?"กำลังตรวจสอบข้อมูล Quest":done?"Quest Completed · ได้รับ +150 Sparks แล้ว":expired?"สิ้นสุดกิจกรรมแล้ว":"ยังไม่สำเร็จ · ใช้รูปโปรไฟล์ของคุณเองเพื่อรับอัตโนมัติ"}
            </div>
            <p className="qa-sparks-profile-quest-help">เปลี่ยนรูปได้ที่รูปโปรไฟล์บริเวณเมนูด้านซ้ายของ QA Dashboard</p>
          </div>
        </section>
      </div>,document.body):null}
  </>;
}
