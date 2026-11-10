import React, { useState } from "react";
import QASparks from "./QASparks";
import SparksEmailAuth, { type SparksVerifiedActor } from "./SparksEmailAuth";

const qaDashboardUrl = "/?tab=dashboard";
export default function SparksStandalone() {
  const [actor, setActor] = useState<SparksVerifiedActor|null>(null);
  const enabled = ["supabase","hybrid"].includes(String(import.meta.env?.VITE_SPARKS_AUTH_MODE || ""));
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
