import React, { useEffect, useState } from "react";
import QASparks from "./QASparks";
import SparksEmailAuth, { type SparksVerifiedActor } from "./SparksEmailAuth";

const qaDashboardUrl = "/?tab=dashboard";
type SyncStatus = {
  last_attempt_at: string | null;
  last_result: "started"|"success"|"failed"|"not_run";
  last_error_code: string | null;
  last_success_at: string | null;
  current_roster_snapshot_at: string | null;
};
function SparksSyncHealth() {
  const [status,setStatus]=useState<SyncStatus|null>(null);
  const [error,setError]=useState(false);
  useEffect(()=>{
    let active=true;
    fetch("/api/sparks-auth?action=sync-status",{credentials:"same-origin",cache:"no-store"})
      .then(async response=>{
        if(!response.ok)throw Error("Status unavailable");
        const payload=await response.json();
        if(!payload?.ok||!payload?.status)throw Error("Status unavailable");
        if(active)setStatus(payload.status);
      })
      .catch(()=>{if(active)setError(true)});
    return ()=>{active=false};
  },[]);
  const fmt=(value:string|null)=>value
    ? new Intl.DateTimeFormat("th-TH",{timeZone:"Asia/Bangkok",dateStyle:"medium",timeStyle:"short"})
      .format(new Date(value)) : "—";
  const text=status?.last_result==="success"
    ? "ซิงก์รายชื่อสำเร็จ "+fmt(status.last_success_at)
    : status?.last_result==="failed"
      ? "ซิงก์ไม่สำเร็จ ("+String(status.last_error_code||"ตรวจสอบสถานะ")+"); รายชื่อเดิมยังถูกเก็บไว้"
      : status?.last_result==="started"
        ? "กำลังตรวจสถานะรายชื่อรอบล่าสุด"
        : "ยังไม่มีรายงานว่าซิงก์รายชื่ออัตโนมัติสำเร็จ";
  return <div role="status" style={{padding:"7px 24px",fontSize:12,
    background:"#f4f6fc",color:"#4b5563",borderBottom:"1px solid #e5e7ef"}}>
    {error?"สถานะซิงก์รายชื่อ: ตรวจสอบไม่ได้":!status?"กำลังตรวจสถานะซิงก์รายชื่อ...":text}
    {status?.current_roster_snapshot_at && status.last_result!=="success"
      ? " · ข้อมูลสำรองล่าสุด "+fmt(status.current_roster_snapshot_at) : ""}
  </div>;
}
export default function SparksStandalone() {
  const [actor, setActor] = useState<SparksVerifiedActor|null>(null);
  const enabled = ["supabase","hybrid"].includes(String(import.meta.env?.VITE_SPARKS_AUTH_MODE || ""));
  useEffect(()=>{
    if(!actor)return;
    let current=true;
    const validate=async()=>{
      try{
        const response=await fetch("/api/sparks-auth",{credentials:"same-origin",cache:"no-store"});
        if(!current)return;
        if(response.status===401 || response.status===403){setActor(null);return;}
        if(!response.ok)return;
        const payload=await response.json();
        if(current && (
          payload?.actor?.username?.toLowerCase()!==actor.username.toLowerCase() ||
          payload?.actor?.status!=="Active"
        ))setActor(null);
      }catch{/* An outage does not clear the session; server authorization remains mandatory. */}
    };
    window.addEventListener("focus",validate);
    return()=>{current=false;window.removeEventListener("focus",validate)};
  },[actor?.username]);
  if (!enabled) return <main style={{maxWidth:600,margin:"70px auto",padding:24}}>
    <h2>QA Sparks</h2>
    <p>ทางเข้าผ่านอีเมลยังไม่ได้เปิดใช้งานบนเว็บไซต์นี้</p>
    <a href={qaDashboardUrl}>กลับไป QA Dashboard</a>
  </main>;
  return <div data-qa-sparks-independent-entry="true" style={{minHeight:"100vh",background:"#f7f8fd"}}>
    <header style={{padding:"16px 24px",background:"#fff",borderBottom:"1px solid #e4e7f0",display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap"}}>
      <div><strong style={{color:"#303dba"}}>QA Sparks</strong><span style={{marginLeft:10,color:"#6b7280",fontSize:13}}>เข้าสู่ระบบรางวัลแยกจาก QA Dashboard</span></div>
      <a href={qaDashboardUrl} style={{color:"#4750af",fontSize:13}}>กลับไป QA Dashboard</a>
    </header>
    {actor?.username.toLowerCase()==="songpon" && actor.role==="Quality Assurance" && <SparksSyncHealth />}
    {!actor ? <SparksEmailAuth onVerified={setActor}/> : (
      <QASparks
        key={actor.username}
        username={actor.username}
        displayName={actor.displayName}
        adminAccess={actor.role === "Quality Assurance" && actor.username === "songpon"}
        adminSessionId="supabase-email-auth"
        active={true}
        verifiedSparksActor={actor}
      />
    )}
  </div>;
}
