import React,{useCallback,useEffect,useState} from "react";
import SparksEmailAuth,{type SparksVerifiedActor} from "./SparksEmailAuth";
import SparksQaCredentialMigration from "./SparksQaCredentialMigration";
import "./sparksPausedLanding.css";
export type SparksStatus={enabled:boolean;message:string;unavailable?:boolean;updatedAt?:string};
const message="QA Sparks ปิดปรับปรุงชั่วคราว ระหว่างย้ายระบบฐานข้อมูล";
export function useSparksStatus(poll=true){
  const [status,setStatus]=useState<SparksStatus|null>(null);
  const refresh=useCallback(async()=>{
    try{
      const response=await fetch("/api/sparks-auth?action=access",{cache:"no-store",credentials:"same-origin"});
      const data=await response.json();
      if(!response.ok||typeof data.enabled!=="boolean")throw Error("Unavailable");
      setStatus({enabled:data.enabled,message:String(data.message||message),unavailable:Boolean(data.unavailable),updatedAt:data.updatedAt||""});
    }catch{setStatus({enabled:false,message,unavailable:true});}
  },[]);
  useEffect(()=>{
    void refresh();
    if(!poll)return;
    const timer=window.setInterval(()=>void refresh(),30000);
    window.addEventListener("focus",refresh);
    window.addEventListener("qa:sparks-access-changed",refresh);
    return()=>{
      window.clearInterval(timer);
      window.removeEventListener("focus",refresh);
      window.removeEventListener("qa:sparks-access-changed",refresh);
    };
  },[refresh,poll]);
  return {status,refresh};
}
export function SparksPausedNotice({status,ownerLink=false}:{status:SparksStatus|null;ownerLink?:boolean}){
  return <section data-sparks-access-closed="true" role="status" className="sparks-paused-hero">
    <div className="sparks-paused-stars" aria-hidden="true"><span>✦</span><span>✧</span><span>✦</span><span>✧</span><span>✦</span><span>✧</span></div>
    <img className="sparks-paused-mascot" src="/sparks-maintenance-mascot.svg" alt="" aria-hidden="true" />
    <img className="sparks-paused-chest" src="/sparks-maintenance-chest.svg" alt="" aria-hidden="true" />
    <div className="sparks-paused-clouds sparks-paused-clouds--back" aria-hidden="true" />
    <div className="sparks-paused-content">
      <div className="sparks-paused-brand"><span className="sparks-paused-brand-star" aria-hidden="true">★</span><span>QA Sparks</span></div>
      <div className="sparks-paused-eyebrow">ประกาศสถานะการให้บริการ</div>
      <div className="sparks-paused-notice-card">
        <span className="sparks-paused-status-pill"><span aria-hidden="true" className="sparks-paused-status-dot" />ปิดให้บริการชั่วคราว</span>
        <h2>QA Sparks ปิดให้บริการชั่วคราว</h2>
        <p className="sparks-paused-main-message">{status?.message||"กำลังตรวจสอบสถานะระบบ..."}</p>
        <p className="sparks-paused-explainer">
          ระหว่างย้ายฐานข้อมูล ระบบหยุดการเปิดกระเป๋า การเล่นเกม การแลกรางวัล และการใช้ Item
          โดยไม่ลบคะแนนหรือประวัติเดิม
        </p>
        <div className="sparks-paused-safe-note">
          <span className="sparks-paused-check" aria-hidden="true">✓</span>
          <span>คะแนน Item และประวัติเดิมยังคงอยู่ · QA Dashboard ใช้งานได้ตามปกติ</span>
        </div>
      </div>
      {ownerLink&&<p className="sparks-paused-owner-hint">ผู้ดูแลระบบสามารถควบคุมการเปิดใช้งานได้จากแผงด้านล่าง</p>}
    </div>
    <div className="sparks-paused-clouds sparks-paused-clouds--front" aria-hidden="true" />
  </section>;
}
export default function SparksAccessGate({username,sessionId,children}:{username:string;sessionId:string;children:React.ReactNode}){
  const {status}=useSparksStatus();
  if(status?.enabled===true)return <>{children}</>;
  return <div className="sparks-paused-shell">
    <SparksPausedNotice status={status} ownerLink={username.trim().toLowerCase()==="songpon"}/>
    {username.trim().toLowerCase()==="songpon"&&<>
      <SparksQaCredentialMigration actorUsername={username} sessionId={sessionId}/>
      <SparksOwnerAccessControl username={username}/>
    </>}
  </div>;
}

/** Gate always-mounted QA Dashboard Sparks side effects without polling. */
export function SparksEnabledOnly({children}:{children:React.ReactNode}){
  const {status}=useSparksStatus(false);
  return status?.enabled===true?<>{children}</>:null;
}

/**
 * Owner's access switch, visible in the existing QA Dashboard > QA Sparks >
 * Sparks Admin tab and again while Sparks is paused. The QA login alone is
 * not authorization: the API verifies a live Supabase owner session and the
 * database RPC enforces the owner identity independently.
 */
export function SparksOwnerAccessControl({username}:{username:string}){
  const owner=username.trim().toLowerCase()==="songpon";
  const {status,refresh}=useSparksStatus();
  const [actor,setActor]=useState<SparksVerifiedActor|null>(null);
  const [checking,setChecking]=useState(true);
  const [showAuth,setShowAuth]=useState(false);
  const [confirmTarget,setConfirmTarget]=useState<boolean|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [feedback,setFeedback]=useState("");
  useEffect(()=>{
    if(!owner)return;
    let alive=true;
    const check=async()=>{
      try{
        const response=await fetch("/api/sparks-auth",{credentials:"same-origin",cache:"no-store"});
        const result=await response.json().catch(()=>({}));
        if(alive&&response.ok&&result?.actor?.username?.toLowerCase()==="songpon"
           &&result.actor.role==="Quality Assurance"&&result.actor.status==="Active")
          setActor(result.actor);
      }catch{/* The server verifies the owner again on every change. */}
      finally{if(alive)setChecking(false);}
    };
    void check();
    return()=>{alive=false};
  },[owner]);
  if(!owner)return null;
  const verified=actor?.username.toLowerCase()==="songpon"&&
    actor.role==="Quality Assurance"&&actor.status==="Active";
  const change=async()=>{
    if(confirmTarget===null||!verified||busy)return;
    const next=confirmTarget;
    setBusy(true);setError("");setFeedback("");
    try{
      const response=await fetch("/api/sparks-auth",{
        method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({action:"access-set",enabled:next})
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok||result?.enabled!==next)
        throw Error(String(result.error||"บันทึกการเปลี่ยนสถานะไม่สำเร็จ"));
      setConfirmTarget(null);
      setFeedback(next?"เปิด QA Sparks สำเร็จ":"ปิด QA Sparks สำเร็จ");
      await refresh();
      window.dispatchEvent(new Event("qa:sparks-access-changed"));
    }catch(reason){
      setError(reason instanceof Error?reason.message:"บันทึกการเปลี่ยนสถานะไม่สำเร็จ");
    }finally{setBusy(false);}
  };
  return <section className="sparks-owner-console" data-sparks-owner-control="true" aria-label="ควบคุมการเข้าใช้งาน QA Sparks"
    style={{border:"1px solid #d8deea",borderRadius:16,padding:18,background:"#fff",maxWidth:780,margin:"16px auto 22px",boxShadow:"0 4px 24px #202e4810"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
      <div>
        <strong style={{fontSize:17,color:"#263248"}}>ควบคุมการเข้าใช้งาน QA Sparks</strong>
        <p style={{margin:"5px 0 0",fontSize:13,color:"#62718c"}}>เปิดหรือปิดการใช้งานสำหรับพนักงานทุกคน โดยไม่ลบคะแนนและ Item</p>
      </div>
      <span data-sparks-access-status={status?.enabled===true?"open":"closed"}
        style={{borderRadius:999,padding:"6px 12px",fontSize:12,fontWeight:700,
          background:status?.enabled===true?"#e5f6ee":"#fbe8ec",
          color:status?.enabled===true?"#176645":"#a6273b"}}>
        {status===null?"กำลังตรวจสอบสถานะ":status.unavailable?"ตรวจสอบสถานะไม่ได้":status.enabled?"เปิดให้พนักงานใช้งาน":"ปิดชั่วคราว"}
      </span>
    </div>
    <div style={{display:"flex",gap:12,marginTop:16,alignItems:"center",flexWrap:"wrap"}}>
      <button type="button" data-sparks-toggle-owner="true"
        disabled={busy||status===null||Boolean(status?.unavailable)||checking}
        onClick={()=>{
          setError("");setFeedback("");
          if(!verified){setShowAuth(true);return;}
          setConfirmTarget(status?.enabled!==true);
        }}
        style={{border:0,borderRadius:10,padding:"11px 17px",fontWeight:750,color:"#fff",
          background:status?.enabled===true?"#ac2f43":"#236c50",
          opacity:busy||status===null||Boolean(status?.unavailable)||checking?.6:1,
          cursor:"pointer"}}>
        {checking?"กำลังตรวจสิทธิ์...":busy?"กำลังบันทึก...":
          status?.enabled===true?"ปิด QA Sparks สำหรับพนักงาน":"เปิด QA Sparks สำหรับพนักงาน"}
      </button>
      <span style={{fontSize:12,color:"#65728a"}}>{verified?"ยืนยันสิทธิ์เจ้าของระบบแล้ว":"ต้องยืนยันบัญชีเจ้าของระบบผ่าน Supabase ก่อนเปลี่ยนสถานะ"}</span>
    </div>
    {showAuth&&!verified&&<div data-sparks-owner-verify="true"
      style={{marginTop:16,padding:14,border:"1px solid #d9e3f5",borderRadius:12,background:"#f8faff"}}>
      <div style={{fontWeight:700,marginBottom:8,color:"#32435f"}}>ยืนยันบัญชีเจ้าของ QA Sparks</div>
      <SparksEmailAuth username="songpon" onVerified={verifiedActor=>{
        if(verifiedActor.username.toLowerCase()==="songpon"&&verifiedActor.role==="Quality Assurance"
           &&verifiedActor.status==="Active"){
          setActor(verifiedActor);setShowAuth(false);
        }else setError("บัญชีนี้ไม่ใช่เจ้าของ QA Sparks");
      }}/>
    </div>}
    {confirmTarget!==null&&verified&&<div role="group" aria-label="ยืนยันการเปลี่ยนสถานะ QA Sparks"
      style={{marginTop:15,padding:14,borderRadius:12,background:"#f8f9fd",border:"1px solid #dfe5ef"}}>
      <p style={{margin:"0 0 12px",fontSize:13,fontWeight:700}}>
        {confirmTarget?"ยืนยันเปิด QA Sparks ให้พนักงานทุกคนใช้งาน?":"ยืนยันปิด QA Sparks สำหรับพนักงานทุกคน?"}
      </p>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button type="button" disabled={busy} onClick={()=>void change()}
          style={{border:0,borderRadius:8,padding:"9px 14px",background:confirmTarget?"#236c50":"#ac2f43",color:"#fff",fontWeight:700}}>
          {busy?"กำลังบันทึก...":"ยืนยัน"+(confirmTarget?"เปิด":"ปิด")}
        </button>
        <button type="button" disabled={busy} onClick={()=>setConfirmTarget(null)}
          style={{border:"1px solid #ccd5e5",borderRadius:8,padding:"9px 14px",background:"#fff",fontWeight:700}}>ยกเลิก</button>
      </div>
    </div>}
    {error&&<p role="alert" style={{fontSize:13,color:"#b12a39",margin:"10px 0 0"}}>{error}</p>}
    {feedback&&<p role="status" style={{fontSize:13,color:"#26724f",margin:"10px 0 0"}}>{feedback}</p>}
  </section>;
}
