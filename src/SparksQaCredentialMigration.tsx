import React,{useState} from "react";
import { collection, getDocsFromServer, orderBy, query } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";

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
   const today=new Intl.DateTimeFormat("en-CA",{
     timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit",
   }).format(new Date());
   const rejected=new Set<string>();
   for(const snap of source.docs){
     const row=snap.data();
     const username=String(row.username||snap.id).trim().toLowerCase();
     if(!uniqueNames.has(username))continue;
     const password=typeof row.password==="string"?row.password:"";
     const expires=String(row.passwordExpiresAt||row.accessExpiresAt||"").trim();
     const start=String(row.suspendEffectiveDate||"").trim();
     const end=String(row.suspendEndDate||"").trim();
     const suspended=String(row.status||"").trim().toLowerCase()!=="active" ||
       (Boolean(start) && start<=today && !(row.suspendAutoReactivate===true && end && end<=today));
     const expired=Boolean(expires) && (!Number.isFinite(Date.parse(expires)) || Date.parse(expires)<=Date.now());
     if(entriesByName.has(username) || !/^[a-z0-9._-]{2,64}$/.test(username) ||
       suspended || expired || password.length<6 || password.length>128){
       rejected.add(username);
       continue;
     }
     entriesByName.set(username,{username,password,passwordExpiresAt:expires});
   }
   for(const name of rejected)entriesByName.delete(name);
   const missing=activeNames.filter((name:string)=>!entriesByName.has(name));
   if(missing.length>0){
     throw Error("ยังไม่เริ่มย้าย: พบ Username/Password ที่ใช้ได้ "+entriesByName.size+
       "/"+activeNames.length+" บัญชี ข้อมูลไม่ครบหรือรหัสหมดอายุ กรุณาตรวจสอบข้อมูลต้นทางก่อน");
   }
   const entries=activeNames.map((name:string)=>entriesByName.get(name)!);
   setMessage("ตรวจสอบครบ "+entries.length+"/"+activeNames.length+
     " บัญชีแล้ว กำลังซิงก์รหัสผ่าน QA เดิมโดยไม่แสดงรหัสผ่าน");
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
   if(aggregate.created+aggregate.updated!==activeNames.length ||
     aggregate.failed.length || aggregate.skipped.length){
     setResult(aggregate);
     throw Error("ย้ายบัญชีได้ไม่ครบ "+activeNames.length+" คน กรุณาตรวจสอบรายชื่อที่ไม่สำเร็จ");
   }
   setResult(aggregate);
   setMessage("ซิงก์บัญชี QA Active ครบตามรายชื่อที่ตรวจสอบแล้ว");
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
    ระบบอ่านข้อมูลสดจาก Firestore เท่านั้น ไม่ใช้แคชเก่าที่อาจมีรหัสผ่านไม่ตรงกัน หาก Firestore ติดโควต้า ระบบจะหยุดก่อนย้ายและไม่กระทบคะแนน
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
