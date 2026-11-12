import React,{useState} from "react";

// Owner-only presentation. The browser sends only the currently authenticated
// QA session ID and requested action; the server reads Firebase credentials,
// verifies the active QA directory, and provisions Supabase Auth over HTTPS.
// No password (or password hash) ever flows through this component.
type Issue={username:string;reason:string};
type Audit={
 checked:number;active:number;suspended:number;ready:number;eligibleActive:number;
 pending:Issue[];blocked:Issue[];excluded?:Issue[];canStartStagedMigration:boolean;
};
type ImportResult={ok:boolean;code:string;audit:Audit;submitted?:number;
 created?:number;updated?:number;failed?:Issue[]};
export default function SparksQaCredentialMigration({actorUsername,sessionId}:{
 actorUsername:string;sessionId:string;
}){
 const [busy,setBusy]=useState(false);
 const [audit,setAudit]=useState<Audit|null>(null);
 const [result,setResult]=useState<ImportResult|null>(null);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const call=async(action:"qa-password-preflight"|"qa-password-migrate-server")=>{
   if(busy)return;
   setBusy(true);setError("");setMessage("");
   if(action==="qa-password-preflight")setAudit(null);
   if(action==="qa-password-migrate-server")setResult(null);
   try{
     const response=await fetch("/api/sparks-admin",{
       method:"POST",credentials:"same-origin",cache:"no-store",
       headers:{"content-type":"application/json"},
       body:JSON.stringify({action,actorUsername,sessionId}),
     });
     const body=await response.json().catch(()=>({}));
     if(body.audit)setAudit(body.audit as Audit);
     else if(action==="qa-password-preflight"&&body.ok===true)setAudit(body as Audit);
     if(action==="qa-password-migrate-server"&&body.audit)setResult(body as ImportResult);
     if(!response.ok||body.ok!==true){
       const stage=body.stage==="owner-session"?"ตรวจสิทธิ์ QA Session"
         :body.stage==="source-credentials"?"อ่านบัญชี QA จาก Firestore"
         :body.stage==="supabase-import"?"นำเข้าบัญชี Supabase":"ตรวจบัญชี QA";
       const detail=body.code==="QA_CREDENTIAL_SERVER_COOLDOWN"
         ?"เซิร์ฟเวอร์ยังพักการอ่าน Firestore จากข้อผิดพลาดก่อนหน้า คำขอนี้ไม่ได้อ่านข้อมูลใหม่ กรุณาลองอีกครั้งเมื่อครบเวลาพัก "+Math.max(1,Math.ceil(Number(body.retryAfterSeconds||0)/60))+" นาที (รหัส: QA_CREDENTIAL_SERVER_COOLDOWN)"
         :body.code==="QA_CREDENTIAL_FIRESTORE_LIMIT"
         ?"Firestore ตอบ 429 ขณะ "+stage+" (อ่านจริงแล้วในคำขอนี้) — ไม่ใช่โควต้าของระบบแลกรางวัลบน Supabase ยังไม่มีการย้ายรหัสผ่านในคำขอนี้"
         :body.code==="QA_CREDENTIAL_SOURCE_UNAVAILABLE"
         ?"ไม่สามารถ "+stage+" ได้ กรุณาตรวจการเชื่อมต่อ Google Cloud ของเซิร์ฟเวอร์"
         :body.code==="QA_CREDENTIAL_IMPORT_UNAVAILABLE"
         ?"ระบบนำเข้าบัญชี Supabase ติดต่อไม่ได้ จึงยังไม่ยืนยันการย้าย"
         :body.code==="QA_CREDENTIAL_OWNER_SESSION_INVALID"
         ?"การตรวจสิทธิ์เจ้าของระบบไม่ผ่าน กรุณา Login QA Dashboard ใหม่"
         :body.code==="SOURCE_ROSTER_MISMATCH"
         ?"รายชื่อพนักงานที่ตรวจสอบได้ไม่ตรงกับ 21 บัญชีที่อนุญาตให้ย้าย จึงยังไม่ได้ส่งรหัสผ่านไป Supabase"
         :body.code==="SOURCE_CREDENTIAL_BLOCKED"
         ?"พบข้อมูลบัญชีผิดปกติ จึงหยุดย้ายก่อนโดยไม่กระทบผู้ใช้งานเดิม"
         :body.code==="REMOTE_IMPORT_REJECTED"
         ?"Supabase ปฏิเสธคำขอย้ายบัญชี ตรวจสอบสถานะเซิร์ฟเวอร์ก่อนลองใหม่"
         :body.code==="PARTIAL_IMPORT"
         ?"ย้ายได้บางบัญชี ระบบเก็บข้อมูลเดิมไว้และอนุญาตให้ตรวจสอบก่อนทำต่อ"
         :String(body.error||body.code||"ตรวจสอบข้อมูลบัญชีไม่สำเร็จ");
       throw Error(detail+(typeof body.code==="string"?" (รหัส: "+body.code+")":""));
     }
     if(action==="qa-password-preflight")
       setMessage("ตรวจข้อมูล QA สดแล้ว: พร้อมย้าย "+body.ready+" บัญชี รอตั้งรหัสผ่าน "+body.pending.length+" บัญชี");
     else setMessage("Supabase Auth รับบัญชีเดิมสำเร็จ "+
       (Number(body.created||0)+Number(body.updated||0))+" บัญชี · "+
       "บัญชีที่ยังไม่มีรหัสผ่าน QA "+body.audit.pending.length+" บัญชี");
   }catch(e){setError(e instanceof Error?e.message:"ไม่สามารถดำเนินการได้");}
   finally{setBusy(false);}
 };
 const pending=audit?.pending||[],blocked=audit?.blocked||[],excluded=audit?.excluded||[];
 return <section data-sparks-qa-password-migration="owner-only"
   style={{marginBottom:20,padding:18,border:"1px solid #ded7ee",borderRadius:15,background:"#fbf9ff"}}>
   <h3 style={{margin:"0 0 7px",fontSize:17,fontWeight:800}}>ย้ายบัญชี QA เดิมเข้า Supabase Auth</h3>
   <p style={{fontSize:12,lineHeight:1.7,color:"#665879"}}>
     สำหรับเจ้าของระบบเท่านั้น · พนักงานใช้ Username/Password QA เดิม ไม่ต้องสมัครใหม่หรือรับ OTP
     · ส่งรหัสผ่านจาก Firebase ไปยัง Supabase ผ่านเซิร์ฟเวอร์ที่ยืนยันสิทธิ์เท่านั้น
     · ไม่เปลี่ยนคะแนน Sparks, Item หรือ History
   </p>
   <div style={{display:"flex",gap:9,flexWrap:"wrap"}}>
     <button type="button" data-sparks-qa-migration-preflight="true" disabled={busy||!sessionId}
       onClick={()=>void call("qa-password-preflight")} style={{
         padding:"10px 15px",border:"1px solid #c4addf",background:"#fff",
         color:"#51347a",borderRadius:9,fontWeight:700}}>
       {busy?"กำลังตรวจสอบ...":"ตรวจความพร้อมบัญชี QA"}
     </button>
     <button type="button" data-sparks-qa-migrate-passwords="server-only" disabled={busy||!sessionId}
       onClick={()=>void call("qa-password-migrate-server")} style={{
         padding:"10px 15px",background:"#6851a6",color:"#fff",border:0,borderRadius:9,fontWeight:700}}>
       {busy?"กำลังย้ายบัญชี...":"ตรวจและย้ายบัญชีที่พร้อมไป Supabase"}
     </button>
   </div>
   {!sessionId ? <p role="alert" style={{fontSize:12,lineHeight:1.6,color:"#9e233d"}}>ไม่พบ QA Session สำหรับย้ายบัญชี ปุ่มจึงยังใช้ไม่ได้ กรุณา Login QA Dashboard ใหม่ด้วยบัญชีเจ้าของระบบ</p> : null}
   {audit?<p role="status" style={{fontSize:12,lineHeight:1.6}}>
     ตรวจบัญชีทั้งหมด {audit.checked} · Active {audit.active} · มีสิทธิ์ย้าย {audit.eligibleActive} · พร้อมย้าย {audit.ready}
     · รอตั้งรหัสผ่าน {pending.length} · Suspended {audit.suspended} · แยกบัญชีมีเงื่อนไขระงับ {excluded.length}
   </p>:null}
   {message?<p role="status" style={{fontSize:12,color:"#5e4776"}}>{message}</p>:null}
   {error?<p role="alert" style={{fontSize:12,color:"#b3314d"}}>{error}</p>:null}
   {pending.length>0?<div data-sparks-migration-pending="true" style={{
     marginTop:8,padding:12,borderRadius:9,background:"#fff",border:"1px solid #eacde2"}}>
     <strong>บัญชีรอตั้งรหัสผ่าน QA ({pending.length})</strong>
     <p style={{fontSize:12,margin:"5px 0"}}>
       {pending.map(x=>x.username).join(", ")} · คงบัญชีเดิมไว้ ไม่สร้างรหัสให้พนักงาน
     </p>
   </div>:null}
   {excluded.length>0?<p role="status" style={{fontSize:12,color:"#725581"}}>
     แยกออกจากการย้ายเพื่อรักษาสถานะระงับ: {excluded.map(x=>x.username).join(", ")}
   </p>:null}
   {blocked.length>0?<p role="alert" style={{fontSize:12,color:"#a62434"}}>
     หยุดการย้าย: พบข้อมูลบัญชีที่ไม่ผ่านเงื่อนไข {blocked.map(x=>x.username+" ("+x.reason+")").join(", ")}
   </p>:null}
   {result?.ok?<p role="status" data-sparks-migration-success="true" style={{
     fontWeight:700,fontSize:13,color:"#385c40"}}>
     บัญชีที่พร้อมย้ายสำเร็จ {Number(result.created||0)+Number(result.updated||0)}/{result.submitted||0} ·
     บัญชีที่เหลือจะเข้า Supabase หลังตั้งรหัสผ่าน QA
   </p>:null}
 </section>;
}
