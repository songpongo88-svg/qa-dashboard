import React,{useCallback,useEffect,useState} from "react";
import SparksEmailAuth from "./SparksEmailAuth";

type Incident={
  id:string;source:string;incident_key:string;start_at:string;
  planned_end_at?:string;actual_end_at?:string;state:string;
  award_count:number;sparks_paid:number;last_error?:string;
};
const isOwner=(username:string)=>username.trim().toLowerCase()==="songpon";
export async function recordDashboardMaintenance(
  operation:"schedule"|"close",
  interval:{scheduledStartAt:string;scheduledEndAt?:string;autoOpenEnabled?:boolean}
){
  if(!interval.scheduledStartAt)throw Error("ไม่พบเวลาเริ่ม Maintenance");
  const key="dashboard-"+interval.scheduledStartAt;
  const response=await fetch("/api/sparks-auth",{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({
      action:"maintenance-compensation",operation,key,
      startAt:interval.scheduledStartAt,
      plannedEndAt:interval.autoOpenEnabled?interval.scheduledEndAt||null:null,
      autoClose:operation==="schedule"&&interval.autoOpenEnabled===true,
    }),
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.ok)throw Error(String(result.error||"ยังบันทึกช่วงชดเชย QA Sparks ไม่สำเร็จ"));
  window.dispatchEvent(new Event("qa:sparks-maintenance-updated"));
  return result;
}
const localDate=(iso:string)=>{
  if(!iso)return "-";
  const date=new Date(iso);
  return Number.isNaN(date.getTime())?"-":
    new Intl.DateTimeFormat("th-TH",{timeZone:"Asia/Bangkok",dateStyle:"short",timeStyle:"short"}).format(date);
};
export default function MaintenanceSparksCompensation({
  username,scheduledStartAt,scheduledEndAt,autoOpenEnabled,active,
}:{
  username:string;scheduledStartAt:string;scheduledEndAt:string;
  autoOpenEnabled:boolean;active:boolean;
}){
  const owner=isOwner(username);
  const [verified,setVerified]=useState(false);
  const [loading,setLoading]=useState(false);
  const [incidents,setIncidents]=useState<Incident[]>([]);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const refresh=useCallback(async()=>{
    if(!owner)return;
    setLoading(true);
    try{
      const response=await fetch("/api/sparks-auth?action=maintenance-compensation",{
        credentials:"same-origin",cache:"no-store",
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!result.ok)throw Error(String(result.error||"ตรวจสอบข้อมูลชดเชยไม่สำเร็จ"));
      setVerified(true);setError("");
      setIncidents(Array.isArray(result.incidents)?result.incidents:[]);
    }catch(reason){
      setVerified(false);
      setError(reason instanceof Error?reason.message:"ยังโหลดรายการชดเชยไม่ได้");
    }finally{setLoading(false);}
  },[owner]);
  useEffect(()=>{
    if(!owner)return;
    void refresh();
    const onChange=()=>void refresh();
    window.addEventListener("qa:sparks-maintenance-updated",onChange);
    return()=>window.removeEventListener("qa:sparks-maintenance-updated",onChange);
  },[owner,refresh]);
  const registered=incidents.some(i=>i.source==="dashboard"&&
    i.incident_key==="dashboard-"+scheduledStartAt);
  const retry=async()=>{
    if(busy||!scheduledStartAt)return;
    setBusy(true);setError("");
    try{
      // Register the current incident without changing QA Dashboard state.
      await recordDashboardMaintenance("schedule",{scheduledStartAt,scheduledEndAt,autoOpenEnabled});
      await refresh();
    }catch(reason){setError(reason instanceof Error?reason.message:"ไม่สามารถซิงก์ Maintenance ได้")}
    finally{setBusy(false);}
  };
  const label=(state:string)=>state==="settled"?"จ่ายชดเชยแล้ว":state==="scheduled"?"รอเปิดระบบ":
    state==="review"?"ต้องตรวจสอบ":state==="closed"?"รอประมวลผล":state;
  return <section data-maintenance-compensation="true"
    className="mt-5 rounded-[24px] border border-indigo-200 bg-white p-5 shadow-sm" aria-label="QA Sparks Compensation">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">QA Sparks Compensation</h3>
        <p className="mt-1 text-sm text-slate-500">
          ชดเชยทุกบัญชี Active ที่มีสิทธิ์ในกิจกรรมซึ่งเสียสิทธิ์จาก Maintenance · ไม่ต้องยืนยันการเข้าเกม
        </p>
      </div>
      {owner&&<button type="button" onClick={()=>void refresh()} disabled={loading}
        className="rounded-xl border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-800">
        {loading?"กำลังตรวจสอบ...":"รีเฟรชสถานะ"}
      </button>}
    </div>
    <p className="mt-3 text-xs leading-6 text-slate-600">
      Daily Check-in 50 Sparks (24 พ.ย. พิเศษ 200) · Fruit Match สูงสุด 40 ต่อวันตามสิทธิ์คงเหลือ ·
      เหมืองแร่และ Hidden Treasure สุ่มตามอัตรารางวัลจริง · ไม่ให้รางวัลแชมป์หรือรางวัลสลากที่ไม่รับประกัน
    </p>
    <p className="mt-2 text-xs leading-5 text-slate-500">
      ชดเชยเมื่อช่วงปิดระบบทำให้สิทธิ์ของวันหรือช่วงเวลาของกิจกรรมหมดอายุ ก่อนที่ผู้เล่นจะใช้สิทธิ์ได้อีกครั้ง
      และจ่ายหลังเปิด QA Sparks โดยระบบจะตรวจประวัติและป้องกันการจ่ายซ้ำ
    </p>
    {!owner?<p className="mt-3 text-sm text-slate-600">
      การลงทะเบียนและตรวจสอบยอดชดเชยต้องใช้บัญชีเจ้าของ QA Sparks ที่ยืนยันแล้ว
    </p>:!verified?<div className="mt-4">
      <p role="alert" className="text-sm text-amber-800">
        กรุณายืนยันบัญชี QA Sparks เจ้าของระบบก่อนลงทะเบียนช่วง Maintenance เพื่อใช้ชดเชยอัตโนมัติ
      </p>
      <SparksEmailAuth username="songpon" onVerified={actor=>{
        if(actor.username.toLowerCase()==="songpon"&&actor.role==="Quality Assurance"){setVerified(true);void refresh()}
      }}/>
    </div>:<>
      {active&&scheduledStartAt&&!registered&&<div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
        <p className="text-sm text-amber-900">ช่วง Maintenance นี้ยังไม่ได้ลงทะเบียนชดเชย</p>
        <button type="button" disabled={busy} onClick={()=>void retry()}
          className="mt-2 rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white">
          {busy?"กำลังลงทะเบียน...":"ลงทะเบียนช่วงปิดระบบ"}
        </button>
      </div>}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[580px] text-left text-xs">
          <thead><tr className="border-b border-slate-200 text-slate-500">
            <th className="py-2">แหล่งที่ปิด</th><th>ช่วงเวลา</th><th>สถานะ</th><th>รายการชดเชย</th><th>Sparks จ่ายแล้ว</th>
          </tr></thead>
          <tbody>{incidents.slice(0,10).map(i=><tr key={i.id} className="border-b border-slate-100">
            <td className="py-2">{i.source==="dashboard"?"QA Dashboard":"QA Sparks"}</td>
            <td>{localDate(i.start_at)} – {localDate(i.actual_end_at||i.planned_end_at||"")}</td>
            <td>{label(i.state)}</td><td>{i.award_count||0}</td><td>{i.sparks_paid||0}</td>
          </tr>)}</tbody>
        </table>
        {!incidents.length&&<p className="mt-3 text-xs text-slate-500">ยังไม่มีการปิดระบบที่ลงทะเบียนหลังเปิดใช้ระบบชดเชย</p>}
      </div>
    </>}
    {error&&owner&&<p role="alert" className="mt-3 text-xs text-amber-800">{error}</p>}
  </section>;
}
