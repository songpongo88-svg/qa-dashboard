import React,{useState} from "react";
import { fetchStoredUserProfiles } from "./userRoleStore";

// One-time, owner-controlled migration from QA User Management to Supabase Auth.
// No password values are rendered, cached here, logged or returned from the API.
export default function SparksQaCredentialMigration(){
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const [result,setResult]=useState<null|{submitted:number;eligible:number;created:number;updated:number;skipped:string[];failed:{username:string;state:string}[]}>(null);
 const run=async()=>{
  if(busy)return;
  setBusy(true);setMessage("");setError("");setResult(null);
  try{
   const profiles=await fetchStoredUserProfiles();
   // QA's effective profile status includes scheduled indefinite suspensions.
   const active=profiles.filter(profile=>profile.status==="Active");
   const seen=new Set<string>();
   const entries=active.filter(p=>{
    const key=p.username.trim().toLowerCase();
    if(!/^[a-z0-9._-]{2,64}$/.test(key)||seen.has(key))return false;
    seen.add(key);return true;
   }).map(profile=>({
    username:profile.username,
    password:profile.password,
    passwordExpiresAt:profile.passwordExpiresAt||"",
   }));
   if(entries.length<1)throw Error("ไม่พบข้อมูล Username และ Password QA ที่อ่านได้จากระบบเดิม กรุณาเข้า QA Dashboard ด้วยบัญชีเจ้าของระบบก่อน");
   setMessage("กำลังย้ายข้อมูลตรวจสอบรหัสผ่านสำหรับ "+entries.length+" บัญชี QA ที่ Active โดยไม่นำรหัสผ่านมาแสดง");
   // Batches of five keep Vercel and Supabase Auth requests within normal
   // serverless time limits; one click migrates all eligible QA employees.
   const aggregate={submitted:0,eligible:0,created:0,updated:0,
     skipped:[] as string[],failed:[] as {username:string;state:string}[]};
   for(let offset=0;offset<entries.length;offset+=5){
     setMessage("กำลังซิงก์บัญชี QA "+(Math.min(offset+5,entries.length))+"/"+entries.length+" ...");
     const response=await fetch("/api/sparks-auth",{
       method:"POST",credentials:"same-origin",cache:"no-store",
       headers:{"content-type":"application/json"},
       body:JSON.stringify({action:"admin-migrate-qa-passwords",entries:entries.slice(offset,offset+5)}),
     });
     const data=await response.json().catch(()=>({}));
     if(!response.ok||data.ok!==true)
       throw Error("ซิงก์บางส่วนไม่สำเร็จ (ดำเนินการไปแล้ว "+offset+" บัญชี) กดปุ่มอีกครั้งเพื่อทำรายการที่เหลือ: "+String(data.error||"Unknown error"));
     aggregate.submitted+=Number(data.submitted)||0;
     aggregate.eligible+=Number(data.eligible)||0;
     aggregate.created+=Number(data.created)||0;
     aggregate.updated+=Number(data.updated)||0;
     if(Array.isArray(data.skipped))aggregate.skipped.push(...data.skipped);
     if(Array.isArray(data.failed))aggregate.failed.push(...data.failed);
   }
   setResult(aggregate);
   setMessage("ตรวจสอบผลการย้ายบัญชี QA เรียบร้อยแล้ว");
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
    หาก Firestore ติดโควต้า ระบบอาจอ่านข้อมูลจากแคชในเบราว์เซอร์ ข้อมูลที่ไม่มีรหัสผ่านหรือหมดอายุจะไม่ถูกย้าย
   </p>
   <button type="button" data-sparks-qa-migrate-passwords="true" disabled={busy}
     onClick={()=>void run()} style={{padding:"10px 15px",background:"#6851a6",color:"#fff",border:0,borderRadius:9,fontWeight:700}}>
     {busy?"กำลังซิงก์บัญชี QA...":"ซิงก์ Username และ Password QA เดิมไป Supabase"}
   </button>
   {message?<p role="status" style={{fontSize:12,color:"#5e4776"}}>{message}</p>:null}
   {error?<p role="alert" style={{fontSize:12,color:"#b3314d"}}>{error}</p>:null}
   {result?<div role="status" style={{fontSize:12,lineHeight:1.8}}>
     <strong>สร้างบัญชีที่ใช้รหัส QA เดิมได้ {result.created} บัญชี · อัปเดต {result.updated} บัญชี</strong>
     <div>รายชื่อที่ไม่สามารถซิงก์ได้ {result.skipped.length+result.failed.length} บัญชี</div>
     {result.skipped.length||result.failed.length?<div>กรุณาตรวจสอบรายชื่อ: {[...result.skipped,...result.failed.map(x=>x.username)].join(", ")}</div>:null}
     <div>พนักงานที่ซิงก์แล้วสามารถใช้ QA Username และ Password เดิมเข้า QA Sparks ได้โดยไม่ใช้ OTP</div>
   </div>:null}
 </section>;
}
