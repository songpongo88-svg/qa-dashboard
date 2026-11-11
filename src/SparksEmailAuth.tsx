import React, { useEffect, useState } from "react";
import "./SparksEmailAuth.css";
import { signInSparksWithQaPassword } from "./sparksQaPasswordLogin";

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
  const [mode,setMode]=useState<"qa"|"otp">("qa");
  const [qaUsername,setQaUsername]=useState(username||"");
  const [qaPassword,setQaPassword]=useState("");
  const [email,setEmail]=useState("");
  const [pendingEmail,setPendingEmail]=useState("");
  const [code,setCode]=useState("");
  const [sent,setSent]=useState(false);
  const [rateLimited,setRateLimited]=useState(false);
  const [retrySeconds,setRetrySeconds]=useState(0);
  const [busy,setBusy]=useState(true);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");

  // The cooldown prevents repeated email sends; it does not guarantee that
  // the Supabase project-wide SMTP limit has recovered.
  useEffect(()=>{
    if(retrySeconds<=0)return;
    const timer=window.setTimeout(()=>setRetrySeconds(seconds=>Math.max(0,seconds-1)),1000);
    return()=>window.clearTimeout(timer);
  },[retrySeconds]);

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
        const result=await response.json().catch(()=>({}));
        if(!response.ok){
          if(alive && response.status===401 && result?.code!=="SPARKS_AUTH_REQUIRED")
            setMessage("Session QA Sparks หมดอายุแล้ว กรุณายืนยัน OTP ใหม่อีกครั้ง");
          else if(alive && response.status===403)
            setError(String(result?.error || "บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้ QA Sparks"));
          else if(alive && response.status>=500)
            setError("ยังตรวจสอบ Session ไม่สำเร็จ กรุณาลองเข้า QA Sparks อีกครั้ง");
          return;
        }
        if(alive && result?.actor?.username && (!username || result.actor.username.toLowerCase()===username.toLowerCase()))onVerified(result.actor);
      }catch(e){if(alive)setError(e instanceof Error?e.message:"ยืนยันอีเมลไม่สำเร็จ");}
      finally{if(alive)setBusy(false);}
    };
    void check();
    return()=>{alive=false};
    // The currently signed-in QA username is the only permitted subject.
  },[username]);
  const qaSignIn=async(event:React.FormEvent)=>{
    event.preventDefault();if(busy)return;
    setBusy(true);setError("");setMessage("");
    try{
      const actor=await signInSparksWithQaPassword(username||qaUsername,qaPassword);
      setQaPassword("");
      onVerified(actor);
    }catch(e){setError(e instanceof Error?e.message:"ไม่สามารถเข้า QA Sparks ด้วยบัญชี QA เดิมได้");}
    finally{setBusy(false);}
  };
  const send=async(event:React.FormEvent)=>{
    event.preventDefault();if(busy||retrySeconds>0)return;
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
      setPendingEmail(address);setSent(true);setCode("");
      setRateLimited(false);setRetrySeconds(0);
      setMessage("ส่งคำขอรหัส OTP ใหม่แล้ว กรุณาตรวจอีเมลฉบับล่าสุด แล้วกรอกรหัสในแท็บ QA Sparks นี้");
    }catch(e){
      const detail=e instanceof Error?e.message:"ส่งอีเมลไม่สำเร็จ";
      // Never request an old code after the user asks for a fresh OTP.
      // A rejected send must not display a verification field for an unsent code.
      setSent(false);setPendingEmail("");setCode("");
      if(/email rate limit exceeded|over_email_send_rate_limit|too many requests/i.test(detail)){
        setRateLimited(true);setRetrySeconds(60);
        setError("Supabase จำกัดการส่งอีเมล OTP จึงยังส่งรหัสใหม่ไม่ได้ กรุณาลองกดส่งรหัสใหม่เมื่อระบบอนุญาต หรือให้ผู้ดูแลตั้งค่า Custom SMTP เพื่อรองรับการส่งอีเมล");
      }else setError(detail);
    }
    finally{setBusy(false);}
  };
  const verify=async(event:React.FormEvent)=>{
    event.preventDefault();if(busy)return;
    setBusy(true);setError("");
    try{
      if(!/^[0-9]{6,8}$/.test(code))throw Error("กรุณากรอกรหัสยืนยัน 6–8 หลักจากอีเมล");
      if(!pendingEmail)throw Error("กรุณาส่งรหัสยืนยันไปยังอีเมลก่อน");
      const tokens=await authRequest("/auth/v1/verify",{email:pendingEmail,token:code.trim(),type:"email"});
      await exchange(tokens);
    }catch(e){setError(e instanceof Error?e.message:"ยืนยันรหัสไม่สำเร็จ");}
    finally{setBusy(false);}
  };
  return <main className="sparks-email-auth" aria-label="ยืนยันอีเมล QA Sparks">
    <section className="sparks-email-auth-card">
      <div className="sparks-email-auth-kicker">QA Sparks · Supabase Auth</div>
      <h2>{mode==="qa"?"เข้า QA Sparks ด้วย Username และ Password QA เดิม":"ยืนยันอีเมลเพื่อเข้าใช้ QA Sparks"}</h2>
      {busy && !sent && <p role="status">กำลังตรวจสอบ Session เดิมเพื่อเข้าใช้อัตโนมัติ...</p>}
      <p>{mode==="qa"?"ใช้บัญชี QA Dashboard เดิมได้เลย หลังผู้ดูแลซิงก์บัญชีเข้า Supabase แล้ว ไม่ต้องรับ OTP หรือสมัครบัญชีใหม่":"บัญชี QA Dashboard เดิมยังใช้ตามปกติ ยืนยัน QA Sparks ด้วยรหัสจากอีเมลในแท็บนี้โดยไม่ต้องเปิดเว็บใหม่"}</p>
      <div role="group" aria-label="เลือกวิธีเข้า QA Sparks" style={{display:"flex",gap:8,margin:"10px 0 16px",flexWrap:"wrap"}}>
        <button type="button" data-sparks-login-mode="qa" aria-pressed={mode==="qa"}
          onClick={()=>{setMode("qa");setError("");setMessage("");}}>ใช้บัญชี QA เดิม</button>
        <button type="button" data-sparks-login-mode="otp" aria-pressed={mode==="otp"}
          onClick={()=>{setMode("otp");setError("");setMessage("");}}>ยืนยันอีเมล OTP (สำรอง)</button>
      </div>
      {username ? <p className="sparks-email-auth-account">บัญชีที่กำลังใช้งาน: <strong>{username}</strong></p> : <p className="sparks-email-auth-account">เปิด QA Sparks โดยไม่ต้องเข้าสู่ระบบ QA Dashboard ก่อน</p>}
      {mode==="qa"?<form onSubmit={qaSignIn} data-sparks-qa-password-login="true">
        <label htmlFor="sparks-qa-username">Username QA</label>
        <input id="sparks-qa-username" required autoComplete="username" value={username||qaUsername}
          readOnly={Boolean(username)} disabled={busy||Boolean(username)}
          onChange={e=>setQaUsername(e.target.value)} placeholder="Username ที่ใช้ Login QA Dashboard"/>
        <label htmlFor="sparks-qa-password">รหัสผ่าน QA เดิม</label>
        <input id="sparks-qa-password" type="password" required autoComplete="current-password"
          value={qaPassword} disabled={busy} onChange={e=>setQaPassword(e.target.value)}
          placeholder="รหัสผ่านเดียวกับที่ใช้ Login QA"/>
        <button type="submit" disabled={busy||!(username||qaUsername)||!qaPassword}>
          {busy?"กำลังตรวจสอบบัญชี QA...":"เข้าใช้ QA Sparks"}
        </button>
      </form>:null}
      {mode==="otp"?<><form onSubmit={send}>
        <label htmlFor="sparks-auth-email">อีเมลที่ลงทะเบียนกับ QA Dashboard</label>
        <input id="sparks-auth-email" type="email" required autoComplete="email" value={email}
          disabled={busy||sent} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/>
        <button type="submit" disabled={busy||retrySeconds>0}>{busy?"กำลังส่งรหัส...":retrySeconds>0?`ลองส่งรหัสใหม่ได้อีกครั้งใน ${retrySeconds} วินาที`:sent||rateLimited?"ส่งรหัสใหม่":"ส่งรหัสยืนยัน"}</button>
      </form>
      {sent && <form onSubmit={verify} data-sparks-otp-in-place="true">
        <p className="sparks-email-auth-step-hint">เปิดอีเมลฉบับใหม่เพื่อดูรหัส แล้วกลับมากรอกในหน้า QA Sparks นี้ ไม่ต้องกดลิงก์เข้าสู่เว็บไซต์อื่น</p>
        <label htmlFor="sparks-auth-code">รหัสยืนยันจากอีเมล (6–8 หลัก)</label>
        <input id="sparks-auth-code" inputMode="numeric" maxLength={8} pattern="[0-9]{6,8}" autoComplete="one-time-code" required value={code}
          disabled={busy} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,8))} placeholder="กรอกรหัสยืนยัน"/>
        <button type="submit" disabled={busy||!/^[0-9]{6,8}$/.test(code)}>ยืนยันและเข้าใช้ Sparks ในแท็บนี้</button>
        <button className="sparks-email-auth-secondary" type="button" disabled={busy}
          onClick={()=>{setSent(false);setRateLimited(false);setPendingEmail("");setEmail("");setCode("");setMessage("");setError("");}}>เปลี่ยนอีเมล</button>
      </form>}
      {rateLimited && <p className="sparks-email-auth-step-hint" role="status">ครั้งนี้ยังไม่มี OTP ใหม่ถูกส่ง เมื่อครบเวลาพักการส่ง สามารถกดส่งรหัสใหม่อีกครั้งได้โดยไม่ต้องเปลี่ยนแท็บ ทั้งนี้ขึ้นอยู่กับโควตา Supabase</p>}
      </>:null}
      {message && <p role="status" className="sparks-email-auth-message">{message}</p>}
      {error && <p role="alert" className="sparks-email-auth-error">{error}</p>}
      <small>เข้าได้เฉพาะบัญชี QA ที่ซิงก์แล้วและมีสถานะ Active ตามข้อมูลพนักงานล่าสุด หากยังไม่มีข้อมูลตรวจสอบรหัสผ่านใน Supabase ให้ผู้ดูแลซิงก์บัญชีเดิมก่อน ระบบจะไม่แก้ไขคะแนน</small>
    </section>
  </main>;
}
