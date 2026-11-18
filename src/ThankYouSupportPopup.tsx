import React,{useEffect,useRef,useState} from "react";
import {thankYouSupportAmount,thankYouSupportPhase} from "./thankYouSupport2026.mjs";

type Notice = {phase:string;amount:number;creditAt?:string};
type Props = {username:string;sessionId:string};

// Uses only local time for scheduling; server chooses the actual phase and
// claims its one-time display atomically under the user's verified identity.
export default function ThankYouSupportPopup({username,sessionId}:Props) {
  const amount=thankYouSupportAmount(username);
  const [phase,setPhase]=useState<string|null>(()=>thankYouSupportPhase());
  const [notice,setNotice]=useState<Notice|null>(null);
  const attempted=useRef(new Set<string>());
  const retryAfter=useRef(0);
  const lastVisible=useRef(typeof document==="undefined" || document.visibilityState!=="hidden");
  const [checkTick,setCheckTick]=useState(0);
  useEffect(()=>{
    const check=()=>{
      const nowVisible=document.visibilityState!=="hidden";
      if(nowVisible && !lastVisible.current)setCheckTick(v=>v+1);
      lastVisible.current=nowVisible;
      const next=thankYouSupportPhase();
      setPhase(current=>current===next?current:next);
      if(next && Date.now()>=retryAfter.current && retryAfter.current>0) {
        retryAfter.current=0;setCheckTick(v=>v+1);
      }
    };
    const timer=window.setInterval(check,30_000);
    window.addEventListener("focus",check);
    document.addEventListener("visibilitychange",check);
    return()=>{window.clearInterval(timer);window.removeEventListener("focus",check);document.removeEventListener("visibilitychange",check);};
  },[]);
  useEffect(()=>{
    if(!amount || !username || !sessionId || !phase || (document.visibilityState==="hidden"))return;
    const key=username.trim().toLowerCase()+":"+sessionId+":"+phase;
    if(attempted.current.has(key))return;
    attempted.current.add(key);
    let live=true;
    const controller=new AbortController();
    void fetch("/api/sparks-admin",{
      method:"POST",headers:{"content-type":"application/json"},credentials:"same-origin",cache:"no-store",
      body:JSON.stringify({action:"thank-you-support-popup",actorUsername:username,sessionId}),
      signal:controller.signal,
    }).then(async response=>{
      if(!response.ok)throw new Error("Thank you Support verification unavailable");
      const result=await response.json();
      if(!live)return;
      if(result?.show===true && result.phase===phase &&
        result.amount===amount && result.creditConfirmed===true) {
        setNotice({phase,amount,creditAt:String(result.creditAt||"")});
        window.dispatchEvent(new Event("qa:sparks-updated"));
      }
      // Never display a popup for an unverified or uncredited wallet.
      if(result?.creditPending===true){attempted.current.delete(key);retryAfter.current=Date.now()+5*60_000;}
    }).catch(error=>{
      if(!live||controller.signal.aborted)return;
      console.warn("Thank you Support popup verification deferred",error);
      attempted.current.delete(key);retryAfter.current=Date.now()+5*60_000;
    });
    return()=>{live=false;controller.abort();};
  },[amount,username,sessionId,phase,checkTick]);

  if(!notice || !amount)return null;
  const isLaunch=notice.phase==="launch";
  const dayLabel=notice.phase==="nov21"?"21 พฤศจิกายน 2569":"22 พฤศจิกายน 2569";
  const bonusText=amount===1000
    ?"1,000 Sparks สำหรับวันที่ 21–22 พฤศจิกายน 2569 คิดเป็นวันละ 500 Sparks"
    :"500 Sparks พิเศษ สำหรับการสนับสนุนในช่วงวันที่ 21–22 พฤศจิกายน 2569";
  return <div data-thank-you-support-popup="true" role="presentation"
    style={{position:"fixed",inset:0,zIndex:999999,display:"flex",alignItems:"center",justifyContent:"center",padding:16,background:"rgba(20,12,38,.7)",backdropFilter:"blur(7px)"}}>
    <section role="dialog" aria-modal="true" aria-label="Thank you Support — QA Sparks" 
      style={{position:"relative",width:"100%",maxWidth:440,padding:"33px 28px 26px",borderRadius:28,
        background:"linear-gradient(155deg,#ffffff,#faf4ff)",color:"#2b194e",textAlign:"center",
        boxShadow:"0 25px 80px rgba(13,10,38,.4)",fontFamily:"Kanit,system-ui,sans-serif"}}>
      <button type="button" aria-label="ปิดประกาศ" onClick={()=>setNotice(null)}
        style={{position:"absolute",right:15,top:12,background:"#f0e5ff",border:"none",
          width:34,height:34,borderRadius:"50%",fontSize:22,cursor:"pointer",color:"#684091"}}>×</button>
      <div aria-hidden="true" style={{fontSize:56,lineHeight:1.3,marginBottom:10}}>🎁</div>
      <div style={{fontWeight:800,fontSize:25,letterSpacing:".01em"}}>Thank you Support</div>
      <div style={{color:"#8350ac",fontSize:13,marginTop:4}}>21–22 November 2026</div>
      <div style={{fontSize:44,fontWeight:850,margin:"15px 0 6px",color:"#743bd1"}}>
        +{amount.toLocaleString("en-US")} <span style={{fontSize:22}}>Sparks</span>
      </div>
      <div style={{fontWeight:700,fontSize:17,marginBottom:11}}>
        {isLaunch?"ขอบคุณสำหรับการสนับสนุน":("Thank you Support · "+dayLabel)}
      </div>
      <p style={{fontSize:14,lineHeight:1.9,margin:"0 0 12px",color:"#604b76"}}>
        {isLaunch
          ?("ระบบได้มอบ "+bonusText+" และเพิ่มคะแนนเต็มจำนวนเข้ากระเป๋าเรียบร้อยแล้ว โดยไม่ต้องกดรับ")
          :("วันนี้เป็นช่วงกิจกรรม Thank you Support ระบบมอบ "+bonusText+" ให้คุณครบแล้วตั้งแต่รอบแรก ไม่มีการเพิ่มคะแนนซ้ำ")}
      </p>
      <div style={{fontSize:12,color:"#8b76a2",marginBottom:20}}>From: QA Sparks System</div>
      <button type="button" onClick={()=>setNotice(null)}
        style={{background:"linear-gradient(100deg,#7935d3,#a15cdb)",border:0,color:"white",
          borderRadius:14,padding:"12px 35px",fontFamily:"inherit",fontSize:15,fontWeight:700,cursor:"pointer"}}>
        ปิดประกาศ
      </button>
    </section>
  </div>;
}
