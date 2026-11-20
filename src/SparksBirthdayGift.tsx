import React, {useEffect,useMemo,useState} from "react";
import {invalidateSparksAccount} from "./qaSparksStore";

const POINTS=[50,75,100,150,200,300,400,500,750,1000];
const THRESHOLDS=[0,1000,5000,20000,50000,100000,150000,200000,300000,500000];
function levelIndex(earned:number) {
  let index=0;for(let i=1;i<THRESHOLDS.length;i++)if(earned>=THRESHOLDS[i])index=i;
  return index;
}
type Props={
  username:string;sessionId:string;earned:number;
  birthdayMMDD:string;birthdayClaimed2026At:string;
};
export default function SparksBirthdayGift({username,sessionId,earned,birthdayMMDD,birthdayClaimed2026At}:Props){
  const [value,setValue]=useState(birthdayMMDD?"2026-"+birthdayMMDD:"");
  const [saved,setSaved]=useState(birthdayMMDD);
  const [claimed,setClaimed]=useState(Boolean(birthdayClaimed2026At));
  const [working,setWorking]=useState(false);
  const [message,setMessage]=useState("");
  const [amount,setAmount]=useState(POINTS[levelIndex(earned)]);
  const today=useMemo(()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()),[]);
  const eligible=Boolean(saved)&&("2026-"+saved)<=today&&today.slice(0,4)==="2026";
  useEffect(()=>{setValue(birthdayMMDD?"2026-"+birthdayMMDD:"");setSaved(birthdayMMDD);setClaimed(Boolean(birthdayClaimed2026At));},[birthdayMMDD,birthdayClaimed2026At]);
  async function action(which:"save-member-birthday"|"claim-member-birthday"){
    setWorking(true);setMessage("");
    try{
      const res=await fetch("/api/sparks-admin",{method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({action:which,actorUsername:username,sessionId,
          ...(which==="save-member-birthday"?{birthdayMMDD:value.slice(5)}:{})})});
      const result=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(String(result.error||"ไม่สามารถทำรายการได้"));
      if(which==="save-member-birthday"){
        setSaved(String(result.birthdayMMDD||value.slice(5)));
        setMessage("บันทึกวันเกิดแล้ว สามารถรับโบนัสย้อนหลังปี 2569 ได้หากวันเกิดผ่านไปแล้ว");
      }else{
        setClaimed(true);
        if(Number(result.amount)>0)setAmount(Number(result.amount));
        setMessage(result.alreadyClaimed?"คุณได้รับโบนัสวันเกิดปี 2569 แล้ว":"รับโบนัสวันเกิดสำเร็จ เพิ่ม Sparks เข้ากระเป๋าแล้ว");
        invalidateSparksAccount(username);
        window.dispatchEvent(new Event("qa:sparks-updated"));
        window.setTimeout(()=>window.location.reload(),900);
      }
    }catch(error){setMessage(error instanceof Error?error.message:"เกิดข้อผิดพลาด กรุณาลองใหม่");}
    finally{setWorking(false);}
  }
  return <section className="qa-birthday-gift" aria-label="ของขวัญวันเกิดสมาชิก">
    <div><p className="qa-birthday-kicker">MEMBERSHIP BENEFIT · BIRTHDAY GIFT 2026</p>
    <h3>ของขวัญวันเกิดปี 2569</h3>
    <p>LV.{levelIndex(earned)+1} · รับสูงสุดตามระดับปัจจุบัน <strong>{amount.toLocaleString("en-US")} Sparks</strong></p>
    <p>สำหรับปี 2569 สมาชิกที่กรอกหรืออัปเดตวันเกิดหลังวันเกิดผ่านไปแล้ว รับย้อนหลังได้ 1 ครั้ง จนถึงวันที่ 31 ธันวาคม 2569</p></div>
    {!saved&&!claimed?<div className="qa-birthday-actions">
      <label htmlFor="sparks-birthday-input">ระบุวันและเดือนเกิด (ไม่ต้องกรอกปีเกิด)</label>
      <input id="sparks-birthday-input" type="date" min="2026-01-01" max="2026-12-31"
        value={value} disabled={working} onChange={e=>setValue(e.target.value)}/>
      <button type="button" disabled={working||!value} onClick={()=>void action("save-member-birthday")}>ยืนยันวันเกิด</button>
    </div>:null}
    {saved?<p className="qa-birthday-saved">วันเกิดที่ยืนยัน: {saved.slice(3)}/{saved.slice(0,2)} · {claimed?"รับของขวัญแล้ว":"ยังไม่ได้รับของขวัญ"}</p>:null}
    {saved&&!claimed?<button type="button" disabled={working||!eligible}
      onClick={()=>void action("claim-member-birthday")}>{working?"กำลังตรวจสอบ...":eligible?"รับของขวัญวันเกิด":"ยังไม่ถึงวันเกิดปี 2569"}</button>:null}
    {claimed?<p className="qa-birthday-claimed">ได้รับของขวัญวันเกิดปี 2569 แล้ว</p>:null}
    {message?<p role="status">{message}</p>:null}
  </section>;
}
