import React,{useCallback,useEffect,useState} from "react";
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
    return()=>{window.clearInterval(timer);window.removeEventListener("focus",refresh);};
  },[refresh,poll]);
  return {status,refresh};
}
export function SparksPausedNotice({status,ownerLink=false}:{status:SparksStatus|null;ownerLink?:boolean}){
  return <section data-sparks-access-closed="true" role="status" style={{
    maxWidth:660,margin:"42px auto",padding:"32px 24px",
    textAlign:"center",borderRadius:18,border:"1px solid #e0e6ee",
    background:"#fff",boxShadow:"0 8px 32px #24354a12",color:"#273547"
  }}>
    <h2 style={{fontSize:23,fontWeight:800,margin:"0 0 12px"}}>QA Sparks ปิดให้บริการชั่วคราว</h2>
    <p style={{lineHeight:1.75}}>{status?.message||"กำลังตรวจสอบสถานะระบบ..."}</p>
    <p style={{fontSize:13,color:"#687589",lineHeight:1.8}}>
      ระหว่างย้ายฐานข้อมูล ระบบหยุดการเปิดกระเป๋า การเล่นเกม การแลกรางวัล และการใช้ Item
      โดยไม่ลบคะแนนหรือประวัติเดิม
    </p>
    {ownerLink&&<p><a href="/?sparks=1" style={{fontWeight:700,color:"#334eaa"}}>จัดการเปิด–ปิด QA Sparks (ผู้ดูแลระบบ)</a></p>}
    <p style={{fontSize:12,color:"#7c8795"}}>QA Dashboard ยังใช้งานได้ตามปกติ</p>
  </section>;
}
export default function SparksAccessGate({username,children}:{username:string;children:React.ReactNode}){
  const {status}=useSparksStatus();
  if(status?.enabled===true)return <>{children}</>;
  return <SparksPausedNotice status={status} ownerLink={username.trim().toLowerCase()==="songpon"}/>;
}

/** Gate always-mounted QA Dashboard Sparks side effects without polling. */
export function SparksEnabledOnly({children}:{children:React.ReactNode}){
  const {status}=useSparksStatus(false);
  return status?.enabled===true?<>{children}</>:null;
}
