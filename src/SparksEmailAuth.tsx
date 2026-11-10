import React, { useEffect, useState } from "react";
import "./SparksEmailAuth.css";

export type SparksVerifiedActor = { username: string; displayName: string; role: string; status: string };
const URL = String(import.meta.env?.VITE_SPARKS_SUPABASE_AUTH_URL || "").replace(/\/$/, "");
const KEY = String(import.meta.env?.VITE_SPARKS_SUPABASE_PUBLISHABLE_KEY || "");
async function authRequest(path: string, data: Record<string,unknown>) {
  if (!URL || !KEY) throw Error("ระบบยืนยันอีเมลยังไม่ได้เปิดใช้งาน");
  const response = await fetch(URL + path, {
    method:"POST",cache:"no-store",
    headers:{"apikey":KEY,"content-type":"application/json"},
    body:JSON.stringify(data),
  });
  const result = await response.json().catch(()=>({}));
  if (!response.ok) throw Error(String(result.msg || result.error_description || result.error || "การยืนยันอีเมลไม่สำเร็จ"));
  return result;
}
export default function SparksEmailAuth({ username, onVerified }:{
  username?:string; onVerified:(actor:SparksVerifiedActor)=>void;
}) {
  const [email,setEmail]=useState("");
  const [code,setCode]=useState("");
  const [sent,setSent]=useState(false);
  const [rateLimited,setRateLimited]=useState(false);
  const [busy,setBusy]=useState(true);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");

  async function exchange(tokens: { access_token?: string; refresh_token?: string; expires_in?:number }) {
    if (!tokens.access_token || !tokens.refresh_token) throw Error("ไม่พบข้อมูลยืนยันตัวตนจากอีเมล");
    const response=await fetch("/api/sparks-auth",{
      method:"POST",credentials:"same-origin",cache:"no-store",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({action:"exchange", ...tokens}),
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok || payload.ok!==true || !payload.actor)throw Error(String(payload.error || "ตรวจสอบสิทธิ์พนักงานไม่ได้"));
    if(username && String(payload.actor.username).toLowerCase()!==username.toLowerCase()){
      await fetch("/api/sparks-auth",{method:"DELETE",credentials:"same-origin"}).catch(()=>{});
      throw Error("อีเมลนี้ไม่ตรงกับบัญชี QA Dashboard ที่กำลังใช้งาน กรุณาใช้อีเมลของบัญชีนี้");
    }
    onVerified(payload.actor as SparksVerifiedActor);
  }
  useEffect(()=>{
    let alive=true;
    const check=async()=>{
      try{
        // Magic Link can return an implicit Supabase session in URL hash.
        const hash=new URLSearchParams(window.location.hash.replace(/^#/,""));
        const access=hash.get("access_token"),refresh=hash.get("refresh_token");
        if(access && refresh){
          window.history.replaceState(window.history.state,"",window.location.pathname+window.location.search);
          await exchange({access_token:access,refresh_token:refresh,expires_in:Number(hash.get("expires_in"))||3600});
          return;
        }
        const response=await fetch("/api/sparks-auth",{credentials:"same-origin",cache:"no-store"});
        if(!response.ok)return;
        const result=await response.json();
        if(result?.actor?.username && (!username || result.actor.username.toLowerCase()===username.toLowerCase()))onVerified(result.actor);
      }catch(e){if(alive)setError(e instanceof Error?e.message:"ยืนยันอีเมลไม่สำเร็จ");}
      finally{if(alive)setBusy(false);}
    };
    void check();
    return()=>{alive=false};
    // The currently signed-in QA username is the only permitted subject.
  },[username]);
  const send=async(event:React.FormEvent)=>{
    event.preventDefault();if(busy)return;
    setBusy(true);setError("");setMessage("");
    try {
      const address=email.trim().toLowerCase();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))throw Error("กรุณากรอกอีเมลที่ถูกต้อง");
      // GoTrue reads redirect_to from the URL query string, not email_redirect_to
      // from the OTP JSON body. The redirect must also be allowlisted in Auth settings.
      const returnTo=window.location.origin+window.location.pathname+window.location.search;
      await authRequest("/auth/v1/otp?redirect_to="+encodeURIComponent(returnTo),{
        email:address,create_user:true,
      });
      setSent(true);setMessage("ส่งอีเมลยืนยันแล้ว หากได้รับรหัสให้กรอกด้านล่าง หรือกดลิงก์ในอีเมล");
    }catch(e){
      const detail=e instanceof Error?e.message:"ส่งอีเมลไม่สำเร็จ";
      if(/email rate limit exceeded|over_email_send_rate_limit|too many requests/i.test(detail)){
        setRateLimited(true);
        setError("Supabase จำกัดการส่งอีเมลชั่วคราว กรุณาอย่ากดส่งซ้ำ หากมี Magic Link ฉบับล่าสุดให้ใช้ลิงก์นั้นก่อน หรือกลับมาขอลิงก์ใหม่เมื่อระบบอนุญาต");
      }else setError(detail);
    }
    finally{setBusy(false);}
  };
  const verify=async(event:React.FormEvent)=>{
    event.preventDefault();if(busy)return;
    setBusy(true);setError("");
    try{
      const tokens=await authRequest("/auth/v1/verify",{email:email.trim().toLowerCase(),token:code.trim(),type:"email"});
      await exchange(tokens);
    }catch(e){setError(e instanceof Error?e.message:"ยืนยันรหัสไม่สำเร็จ");}
    finally{setBusy(false);}
  };
  return <main className="sparks-email-auth" aria-label="ยืนยันอีเมล QA Sparks">
    <section className="sparks-email-auth-card">
      <div className="sparks-email-auth-kicker">QA Sparks · Supabase Auth</div>
      <h2>ยืนยันอีเมลเพื่อเข้าใช้ QA Sparks</h2>
      <p>บัญชี QA Dashboard เดิมยังใช้ตามปกติ ส่วน QA Sparks จะยืนยันตัวตนแยกกันด้วยอีเมลของพนักงาน</p>
      {username ? <p className="sparks-email-auth-account">บัญชีที่กำลังใช้งาน: <strong>{username}</strong></p> : <p className="sparks-email-auth-account">เปิด QA Sparks โดยไม่ต้องเข้าสู่ระบบ QA Dashboard ก่อน</p>}
      <form onSubmit={send}>
        <label htmlFor="sparks-auth-email">อีเมลที่ลงทะเบียนกับ QA Dashboard</label>
        <input id="sparks-auth-email" type="email" required autoComplete="email" value={email}
          disabled={busy||rateLimited} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/>
        <button type="submit" disabled={busy||rateLimited}>{busy?"กำลังตรวจสอบ...":rateLimited?"จำกัดการส่งอีเมลชั่วคราว":sent?"ส่งอีเมลอีกครั้ง":"ส่งอีเมลยืนยัน"}</button>
      </form>
      {sent && <form onSubmit={verify}>
        <label htmlFor="sparks-auth-code">รหัสยืนยันจากอีเมล (หากได้รับรหัส 6–8 หลัก)</label>
        <input id="sparks-auth-code" inputMode="numeric" autoComplete="one-time-code" required value={code}
          disabled={busy} onChange={e=>setCode(e.target.value.trim())} placeholder="รหัสยืนยัน"/>
        <button type="submit" disabled={busy||!code.trim()}>ยืนยันและเข้าใช้ Sparks</button>
      </form>}
      {message && <p role="status" className="sparks-email-auth-message">{message}</p>}
      {error && <p role="alert" className="sparks-email-auth-error">{error}</p>}
      <small>เข้าได้เฉพาะบัญชีที่ยืนยันอีเมลแล้วและมีสถานะ Active ในข้อมูลพนักงานที่อัปเดตล่าสุด หากข้อมูลรายชื่อยังไม่ได้ซิงก์ ระบบจะปฏิเสธการเข้าใช้โดยไม่แก้ไขคะแนน</small>
    </section>
  </main>;
}
