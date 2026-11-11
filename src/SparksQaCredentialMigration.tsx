import React,{useState} from "react";
import { collection, getDocsFromServer, orderBy, query } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";

// One-time, owner-controlled migration from QA User Management to Supabase Auth.
// No password values are rendered, cached here, logged or returned from the API.
export default function SparksQaCredentialMigration(){
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const [issues,setIssues]=useState<{username:string;reason:string}[]>([]);
 const [result,setResult]=useState<null|{submitted:number;eligible:number;created:number;updated:number;skipped:string[];failed:{username:string;state:string}[]}>(null);
 const run=async()=>{
  if(busy)return;
  setBusy(true);setMessage("");setError("");setResult(null);setIssues([]);
  try{
   // The canonical Supabase directory is owner-only and requires an active,
   // verified QA Owner Supabase session. It excludes suspended/stale identities.
   const directoryResponse=await fetch("/api/sparks-auth?action=migration-roster",{
     credentials:"same-origin",cache:"no-store",
   });
   const directory=await directoryResponse.json().catch(()=>({}));
   if(!directoryResponse.ok || directory.ok!==true || !Array.isArray(directory.usernames)) {
     throw Error("ต้องยืนยันตัวตนเจ้าของระบบใน Supabase ก่อน โดยใช้ OTP สำรองหนึ่งครั้ง แล้วกลับมาซิงก์บัญชี");
   }
   const activeNames=directory.usernames.map((value:unknown)=>String(value).trim().toLowerCase());
   const uniqueNames=new Set(activeNames);
   if(activeNames.length<1||activeNames.length>120||uniqueNames.size!==activeNames.length){
     throw Error("รายชื่อ Active ที่ยืนยันโดย Supabase ยังไม่สมบูรณ์ จึงไม่เริ่มย้ายรหัสผ่าน");
   }
   setMessage("กำลังตรวจข้อมูล QA จาก Firestore ล่าสุด และเทียบรายชื่อ "+activeNames.length+" บัญชี");
   // Do not call fetchStoredUserProfiles() here: it falls back to potentially
   // stale localStorage credentials when Firestore quota is exhausted.
   const source=await getDocsFromServer(query(collection(firebaseDb,"qa_user_profiles"),orderBy("username","asc")));
   if(source.empty)throw Error("Firestore ไม่ส่งข้อมูลพนักงาน จึงไม่เริ่มการซิงก์");
   const entriesByName=new Map<string,{username:string;password:string;passwordExpiresAt:string}>();
   // Diagnostics contain usernames and safe reason codes ONLY, never credentials.
   // They remain in component memory; they are not persisted or sent to logs.
   const problems=new Map<string,string>();
   const today=new Intl.DateTimeFormat("en-CA",{
     timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit",
   }).format(new Date());
   for(const snap of source.docs){
     const row=snap.data();
     const username=String(row.username||snap.id).trim().toLowerCase();
     if(!uniqueNames.has(username))continue;
     const password=typeof row.password==="string"?row.password:"";
     const expires=String(row.passwordExpiresAt||row.accessExpiresAt||"").trim();
     const start=String(row.suspendEffectiveDate||"").trim();
     const end=String(row.suspendEndDate||"").trim();
     const scheduledSuspension=Boolean(start) && start<=today &&
       !(row.suspendAutoReactivate===true && end && end<=today);
     let reason="";
     if(problems.has(username)||entriesByName.has(username))reason="พบ Username ซ้ำใน Firestore";
     else if(!/^[a-z0-9._-]{2,64}$/.test(username))reason="รูปแบบ Username ไม่รองรับ";
     else if(String(row.status||"").trim().toLowerCase()!=="active")reason="สถานะ Firestore ไม่ใช่ Active";
     else if(scheduledSuspension)reason="บัญชีมีคำสั่งระงับสิทธิ์ตามวันที่";
     else if(typeof row.password!=="string"||!password)reason="ไม่พบรหัสผ่าน QA ใน Firestore";
     else if(password.length<6)reason="รหัสผ่าน QA เดิมสั้นกว่า 6 ตัวอักษร";
     else if(password.length>128)reason="รหัสผ่าน QA เดิมยาวเกิน 128 ตัวอักษร";
     else if(expires&&!Number.isFinite(Date.parse(expires)))reason="รูปแบบวันหมดอายุรหัสผ่านไม่ถูกต้อง";
     else if(expires&&Date.parse(expires)<=Date.now())reason="รหัสผ่าน QA หมดอายุ";
     if(reason){
       problems.set(username,reason);
       entriesByName.delete(username);
       continue;
     }
     entriesByName.set(username,{username,password,passwordExpiresAt:expires});
   }
   const missing=activeNames.filter((name:string)=>!entriesByName.has(name));
   const pending=missing.map((name:string)=>({
     username:name,
     reason:problems.get(name)||"ไม่พบเอกสารบัญชีนี้ใน Firestore",
   }));
   // Accounts that never set a QA password may remain pending. Never
   // invent or reset their password, and never provision Suspended/stale
   // identities. Any other discrepancy still blocks the entire operation.
   if(pending.length) setIssues(pending);
   if(pending.some(item=>item.reason!=="ไม่พบรหัสผ่าน QA ใน Firestore")){
     throw Error("ยังไม่เริ่มย้าย: พบข้อมูลที่ต้องตรวจสอบเพิ่มเติม "+pending.length+
       " บัญชี ดูรายละเอียดด้านล่างก่อนซิงก์");
   }
   if(entriesByName.size===0){
     throw Error("ยังไม่เริ่มย้าย: ไม่มีบัญชีที่ตั้งรหัสผ่าน QA เดิมไว้");
   }
   const entries=activeNames.filter((name:string)=>entriesByName.has(name))
     .map((name:string)=>entriesByName.get(name)!);
   setMessage("ตรวจสอบข้อมูลสดครบ "+activeNames.length+" บัญชี: พร้อมซิงก์ "+
     entries.length+" บัญชี และรอตั้งรหัสผ่าน QA อีก "+pending.length+
     " บัญชี กำลังซิงก์เฉพาะบัญชีที่พร้อม");
   const aggregate={submitted:0,eligible:0,created:0,updated:0,
     skipped:[] as string[],failed:[] as {username:string;state:string}[]};
   for(let offset=0;offset<entries.length;offset+=5){
     setMessage("กำลังซิงก์บัญชี QA "+Math.min(offset+5,entries.length)+"/"+entries.length+" ...");
     const response=await fetch("/api/sparks-auth",{
       method:"POST",credentials:"same-origin",cache:"no-store",
       headers:{"content-type":"application/json"},
       body:JSON.stringify({action:"admin-migrate-qa-passwords",entries:entries.slice(offset,offset+5)}),
     });
     const data=await response.json().catch(()=>({}));
     if(!response.ok||data.ok!==true)
       throw Error("การซิงก์หยุดก่อนครบทุกคน ("+offset+"/"+entries.length+
         ") ข้อมูลเดิมยังอยู่ ให้ตรวจสอบสาเหตุ: "+String(data.code||data.error||"Unknown error"));
     aggregate.submitted+=Number(data.submitted)||0;
     aggregate.eligible+=Number(data.eligible)||0;
     aggregate.created+=Number(data.created)||0;
     aggregate.updated+=Number(data.updated)||0;
     if(Array.isArray(data.skipped))aggregate.skipped.push(...data.skipped);
     if(Array.isArray(data.failed))aggregate.failed.push(...data.failed);
   }
   if(aggregate.created+aggregate.updated!==entries.length ||
     aggregate.failed.length || aggregate.skipped.length){
     setResult(aggregate);
     throw Error("ซิงก์บัญชีที่พร้อมไม่ครบ "+entries.length+" คน กรุณาตรวจสอบรายชื่อที่ไม่สำเร็จ");
   }
   setResult(aggregate);
   setMessage(pending.length>0
     ? "ซิงก์สำเร็จ "+entries.length+"/"+activeNames.length+
       " บัญชี · อีก "+pending.length+
       " บัญชียังไม่มีรหัสผ่าน QA เมื่อพนักงานตั้งรหัสแล้วให้กลับมากดซิงก์อีกครั้ง"
     : "ซิงก์บัญชี QA Active ครบ "+activeNames.length+" บัญชีแล้ว");
  }catch(e){setError(e instanceof Error?e.message:"ไม่สามารถซิงก์บัญชี QA ได้");}
  finally{setBusy(false);}
 };
 return <section data-sparks-qa-password-migration="owner-only"
   style={{marginBottom:20,padding:18,border:"1px solid #ded7ee",borderRadius:15,background:"#fbf9ff"}}>
   <h3 style={{margin:"0 0 7px",fontSize:17,fontWeight:800}}>ย้ายบัญชี Login QA เดิมเข้า Sparks (ไม่ใช้ OTP)</h3>
   <p style={{fontSize:12,lineHeight:1.7,color:"#665879"}}>
    สำหรับเจ้าของระบบเท่านั้น · อ่านรายชื่อและรหัสผ่านจาก QA User Management เดิม
    แล้วส่งไปให้ Supabase Auth จัดเก็บเป็นรหัสผ่านแบบ Hash อย่างปลอดภัย
    พนักงานยังใช้ Username และรหัสผ่าน QA เดิม ไม่ต้องสมัครบัญชีใหม่
    ระบบไม่แก้ยอดคะแนน Item หรือ History และไม่เปิดสิทธิ์ให้บัญชี Suspended
   </p>
   <p style={{fontSize:11,color:"#875e4c"}}>
    ระบบอ่านข้อมูลสดจาก Firestore เท่านั้น ไม่ใช้แคชเก่า หากบัญชี Active บางคนยังไม่เคยตั้งรหัสผ่าน QA จะย้ายเฉพาะบัญชีที่พร้อมและเว้นบัญชีนั้นไว้รอตั้งรหัสผ่าน (ไม่สร้างรหัสแทน) หากพบข้อมูลผิดปกติอื่นหรือ Firestore ติดโควต้า ระบบจะหยุดก่อนย้าย
   </p>
   <button type="button" data-sparks-qa-migrate-passwords="true" disabled={busy}
     onClick={()=>void run()} style={{padding:"10px 15px",background:"#6851a6",color:"#fff",border:0,borderRadius:9,fontWeight:700}}>
     {busy?"กำลังซิงก์บัญชี QA...":"ซิงก์ Username และ Password QA เดิมไป Supabase"}
   </button>
   {message?<p role="status" style={{fontSize:12,color:"#5e4776"}}>{message}</p>:null}
   {error?<p role="alert" style={{fontSize:12,color:"#b3314d"}}>{error}</p>:null}
   {issues.length>0?<section data-sparks-qa-migration-issues="true" role="status"
     style={{marginTop:14,padding:14,border:"1px solid #f3bcc3",borderRadius:12,background:"#fff7f8"}}>
     <strong style={{display:"block",fontSize:14,color:"#9f1239",marginBottom:8}}>
       บัญชีรอตั้งรหัสผ่าน QA {issues.length} บัญชี — {result ? "ยังไม่ได้ย้ายบัญชีเหล่านี้" : "ตรวจพบระหว่างตรวจสอบ"}
     </strong>
     <p style={{fontSize:12,margin:"4px 0 10px",lineHeight:1.7}}>
       บัญชีเหล่านี้ยังไม่เคยตั้งรหัสผ่าน QA จึงคงรอการตั้งรหัสผ่านตามขั้นตอนเดิม
       บัญชีที่พร้อมสามารถย้ายก่อน ส่วนบัญชีรอให้กดซิงก์อีกครั้งหลังตั้งรหัสผ่าน
       ไม่ต้องส่งรหัสผ่านหรือ OTP ให้ผู้ดูแลคนอื่น และระบบจะไม่เปลี่ยนสถานะ Suspended อัตโนมัติ
     </p>
     <div style={{display:"grid",gap:7}}>
       {issues.map(issue=><div key={issue.username} style={{
         display:"flex",gap:10,justifyContent:"space-between",flexWrap:"wrap",
         padding:"9px 12px",borderRadius:8,background:"#fff",border:"1px solid #f9d4d8",
       }}>
         <strong style={{fontSize:13}}>{issue.username}</strong>
         <span style={{fontSize:12,color:"#9f1239"}}>{issue.reason}</span>
       </div>)}
     </div>
     <button type="button" className="sparks-email-auth-secondary" style={{
       marginTop:10,padding:"9px 13px",borderRadius:9,fontSize:12,
       border:"1px solid #e5b5c1",background:"#fff",color:"#83203b",fontWeight:600,
     }} onClick={()=>{
       const report="ผลตรวจสอบย้าย QA Sparks (ไม่มีรหัสผ่าน)\n"+
         issues.map(issue=>issue.username+" — "+issue.reason).join("\n");
       void navigator.clipboard?.writeText(report).then(
         ()=>setMessage("คัดลอกเฉพาะรายชื่อและสาเหตุแล้ว (ไม่มีรหัสผ่าน)"),
         ()=>setMessage("คัดลอกไม่สำเร็จ สามารถส่งภาพหน้าจอส่วนนี้แทนได้")
       );
     }}>คัดลอกรายชื่อและสาเหตุ (ไม่มีรหัสผ่าน)</button>
   </section>:null}
   {result?<div role="status" style={{fontSize:12,lineHeight:1.8}}>
     <strong>สร้างบัญชีที่ใช้รหัส QA เดิมได้ {result.created} บัญชี · อัปเดต {result.updated} บัญชี</strong>
     <div>บัญชีที่ยังไม่มีรหัสผ่าน QA และรอดำเนินการ {issues.length} บัญชี (ไม่ใช่การย้ายล้มเหลว)</div>
     <div>บัญชีที่ซิงก์ไม่สำเร็จ {result.skipped.length+result.failed.length} บัญชี</div>
     {result.skipped.length||result.failed.length?<div>กรุณาตรวจสอบรายชื่อ: {[...result.skipped,...result.failed.map(x=>x.username)].join(", ")}</div>:null}
     <div>พนักงานที่ซิงก์แล้วสามารถใช้ QA Username และ Password เดิมเข้า QA Sparks ได้โดยไม่ใช้ OTP</div>
   </div>:null}
 </section>;
}
