import React,{useEffect,useMemo,useState} from "react";
import {invalidateSparksAccount} from "./qaSparksStore";
import {getSparksMemberLevel} from "./qaSparksMemberLevels";

const POINTS=[50,75,100,150,200,300,400,500,750,1000];
type Props={username:string;sessionId:string;earned:number;birthdayDate:string;birthdayMMDD:string;birthdayClaimed2026At:string};
function bangkokDay(){
 const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 const get=(type:string)=>parts.find(p=>p.type===type)?.value||"";
 return [get("year"),get("month"),get("day")].join("-");
}
function validDOB(value:string,max:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value>max||value<"1900-01-01")return false;
 const [y,m,d]=value.split("-").map(Number);
 const date=new Date(Date.UTC(y,m-1,d));
 return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;
}
export default function SparksBirthdayGift({username,sessionId,earned,birthdayDate,birthdayMMDD,birthdayClaimed2026At}:Props){
 const today=useMemo(bangkokDay,[]);
 const [value,setValue]=useState("");
 const [saved,setSaved]=useState(birthdayDate);
 const [claimed,setClaimed]=useState(Boolean(birthdayClaimed2026At));
 const [working,setWorking]=useState(false);
 const [message,setMessage]=useState("");
 const [amount,setAmount]=useState(POINTS[getSparksMemberLevel(earned).current.level-1]);
 useEffect(()=>{setSaved(birthdayDate);setClaimed(Boolean(birthdayClaimed2026At));},[birthdayDate,birthdayClaimed2026At]);
 const oldMMDD=!saved?birthdayMMDD:"";
 const mmdd=saved?saved.slice(5):oldMMDD;
 const anniversary=mmdd==="02-29"?"02-28":mmdd;
 const eligible=Boolean(saved)&&today.startsWith("2026-")&&anniversary<=today.slice(5);
 const valid=validDOB(value,today)&&(!oldMMDD||value.slice(5)===oldMMDD);
 async function action(which:"save-member-birthday"|"claim-member-birthday"){
  if(working)return;
  setWorking(true);setMessage("");
  try{
   const res=await fetch("/api/sparks-admin",{method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({action:which,actorUsername:username,sessionId,...(which==="save-member-birthday"?{birthdayDate:value}:{})})});
   const result=await res.json().catch(()=>({}));
   if(!res.ok)throw new Error(String(result.error||"ไม่สามารถทำรายการได้"));
   if(which==="save-member-birthday"){
    const confirmed=String(result.birthdayDate||value);
    setSaved(confirmed);setValue("");
    window.dispatchEvent(new CustomEvent("qa:sparks-birthday-updated",{detail:{username,birthdayDate:confirmed}}));
    setMessage("บันทึกวันเกิดสำเร็จ วันเกิดแสดงบนบัตรสมาชิกแล้ว");
   }else{
    setClaimed(true);
    if(Number(result.amount)>0)setAmount(Number(result.amount));
    setMessage(result.alreadyClaimed?"คุณรับโบนัสวันเกิดปี 2569 ไปแล้ว":"รับโบนัสวันเกิดสำเร็จ เพิ่ม Sparks เข้ากระเป๋าแล้ว");
    invalidateSparksAccount(username);
    window.dispatchEvent(new Event("qa:sparks-updated"));
    window.setTimeout(()=>window.location.reload(),900);
   }
  }catch(error){setMessage(error instanceof Error?error.message:"เกิดข้อผิดพลาด กรุณาลองใหม่");}
  finally{setWorking(false);}
 }
 // The completed birthday moves to the member card; its bonus is claimed in the card's Benefits popup.
 // This entire registration panel disappears immediately after a successful save.
 if(saved)return null;
 return <section className="qa-birthday-gift" aria-label="ของขวัญวันเกิดสมาชิก">
  <div><p className="qa-birthday-kicker">MEMBERSHIP BENEFIT · BIRTHDAY GIFT 2026</p>
  <h3>ของขวัญวันเกิดปี 2569</h3>
  <p>LV.{getSparksMemberLevel(earned).current.level} · โบนัสวันเกิดตามระดับปัจจุบัน <strong>{amount.toLocaleString("en-US")} Sparks</strong></p>
  <p>สำหรับปี 2569 สมาชิกที่บันทึกวันเกิดหลังวันเกิดผ่านไปแล้ว รับย้อนหลังได้ 1 ครั้ง จนถึงวันที่ 31 ธันวาคม 2569</p></div>
  {!saved?<div className="qa-birthday-actions">
   <label htmlFor="sparks-birthday-input">เลือกวัน เดือน และปีเกิด (ค.ศ.)</label>
   <input id="sparks-birthday-input" type="date" min="1900-01-01" max={today} value={value}
    disabled={working} onChange={e=>setValue(e.target.value)}/>
   {oldMMDD?<small>ระบบมีวัน/เดือนเกิดเดิม {oldMMDD.slice(3)}/{oldMMDD.slice(0,2)} — กรุณาระบุปีเกิดให้ครบ โดยคงวันและเดือนเดิม</small>:null}
   <button type="button" disabled={working||!valid} onClick={()=>void action("save-member-birthday")}>ยืนยันวันเกิด</button>
  </div>:null}
  {saved?<p className="qa-birthday-saved">บันทึกวันเกิดแล้ว · ข้อมูลแสดงบนบัตรสมาชิกและไม่สามารถแก้ไขเองได้</p>:null}
  {saved&&!claimed?<button type="button" disabled={working||!eligible} onClick={()=>void action("claim-member-birthday")}>
   {working?"กำลังตรวจสอบ...":eligible?"รับของขวัญวันเกิด":today.startsWith("2026-")?"ยังไม่ถึงวันเกิดปี 2569":"หมดเขตรับของขวัญปี 2569"}
  </button>:null}
  {claimed?<p className="qa-birthday-claimed">ได้รับของขวัญวันเกิดปี 2569 แล้ว</p>:null}
  {message?<p role="status">{message}</p>:null}
 </section>;
}
