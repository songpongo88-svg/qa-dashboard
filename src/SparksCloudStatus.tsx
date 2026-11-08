import React, { useCallback, useEffect, useState } from "react";
import "./sparksCloudStatus.css";

type CloudName = "firebase" | "supabase" | "unknown";
type CheckRow = {id:string; label:string; completed:boolean};
type CloudReport = {
  statusVersion:number;
  environment:"production" | "preview" | "development" | "unknown";
  qaDataProvider:CloudName;
  qaLoginProvider:CloudName;
  sparksApiProvider:CloudName;
  sparksApiReadOnly:boolean;
  cutoverVerified:boolean;
  migrationPhase:"complete" | "in-progress";
  reviewedSnapshot:{asOf:string;documents:number;scope:string};
  migrationChecks:CheckRow[];
  changeLog:string[];
  changeLogReviewedAt:string;
};

function nameOf(provider:CloudName):string {
  return provider === "firebase" ? "Firebase Cloud" : provider === "supabase" ? "Supabase Cloud" : "ตรวจสอบไม่ได้";
}

const browserProvider:CloudName =
  import.meta.env?.VITE_SPARKS_DATA_BACKEND === "supabase" ? "supabase" : "firebase";

export default function SparksCloudStatus({adminAccess=false}:{adminAccess?:boolean}) {
  const [report,setReport] = useState<CloudReport|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState(false);

  const refresh = useCallback(async (signal?:AbortSignal) => {
    setLoading(true);
    setError(false);
    try {
      const response=await fetch("/api/cloud-status",{cache:"no-store",signal});
      if(!response.ok)throw new Error("Cannot verify active Cloud status");
      const data=await response.json() as CloudReport;
      if(data.statusVersion!==1 || !["firebase","supabase"].includes(data.sparksApiProvider)
        || !Array.isArray(data.migrationChecks))throw new Error("Invalid Cloud status response");
      if(!signal?.aborted)setReport(data);
    }catch {
      if(!signal?.aborted){setError(true);setReport(null);}
    }finally {
      if(!signal?.aborted)setLoading(false);
    }
  },[]);

  useEffect(()=>{
    const controller=new AbortController();
    void refresh(controller.signal);
    return ()=>controller.abort();
  },[refresh]);

  const mismatch=report ? report.sparksApiProvider!==browserProvider : false;
  const safeCompleted=Boolean(report?.cutoverVerified && !mismatch
    && browserProvider==="supabase" && !report?.sparksApiReadOnly);
  const preview=Boolean(report?.sparksApiReadOnly && browserProvider==="supabase" && !mismatch);
  const phase=error?"ตรวจสอบ Cloud ไม่สำเร็จ":loading?"กำลังตรวจสอบ..."
    :mismatch?"ตั้งค่า Cloud ไม่ตรงกัน":safeCompleted?"ย้ายเสร็จและเปิดใช้แล้ว"
    :preview?"Supabase Preview · อ่านอย่างเดียว":"กำลังย้าย QA Sparks";
  const completeCount=report?.migrationChecks.filter(x=>x.completed).length??0;

  return <section className="qa-sparks-cloud-status" aria-label="Cloud Provider และสถานะการย้าย QA Sparks" data-cloud-status={error?"error":mismatch?"mismatch":safeCompleted?"complete":preview?"preview":"migrating"}>
    <div className="qa-sparks-cloud-heading">
      <div className="qa-sparks-cloud-title">
        <span className="qa-sparks-cloud-orbit" aria-hidden="true">◉</span>
        <div><strong>Cloud Status</strong><small>ฐานข้อมูลที่เว็บไซต์กำลังใช้งาน</small></div>
      </div>
      <div className="qa-sparks-cloud-heading-side">
        <span className="qa-sparks-cloud-phase">{phase}</span>
        <button className="qa-sparks-cloud-refresh" type="button" disabled={loading}
          onClick={()=>void refresh()} aria-label="ตรวจสอบสถานะ Cloud ใหม่" title="ตรวจสอบสถานะ Cloud ใหม่">↻</button>
      </div>
    </div>
    <div className="qa-sparks-cloud-providers">
      <div className="qa-sparks-cloud-provider">
        <span className="qa-sparks-cloud-provider-icon qa-sparks-cloud-provider-icon--qa" aria-hidden="true">QA</span>
        <div><span className="qa-sparks-cloud-provider-label">คะแนน QA / Case Detail / Login</span>
          <strong>{report?nameOf(report.qaDataProvider):"รอตรวจสอบ"}</strong></div>
        <span className="qa-sparks-cloud-live-marker">{report?"ใช้งานอยู่":"—"}</span>
      </div>
      <div className="qa-sparks-cloud-provider">
        <span className="qa-sparks-cloud-provider-icon qa-sparks-cloud-provider-icon--sparks" aria-hidden="true">✦</span>
        <div><span className="qa-sparks-cloud-provider-label">QA Sparks · ยอดแต้มและประวัติ</span>
          <strong>{report?nameOf(browserProvider):"รอตรวจสอบ"}</strong></div>
        <span className="qa-sparks-cloud-live-marker">{preview?"ทดลองอ่าน":report?"ใช้งานอยู่":"—"}</span>
      </div>
    </div>
    {mismatch?<p className="qa-sparks-cloud-warning" role="alert">
      ข้อมูล Cloud ของหน้าเว็บกับ API ไม่ตรงกัน (หน้าเว็บ: {nameOf(browserProvider)} / API: {nameOf(report!.sparksApiProvider)})
      กรุณาอย่าทำธุรกรรม Sparks และแจ้งผู้ดูแล
    </p>:null}
    {preview?<p className="qa-sparks-cloud-hint">
      เวอร์ชันนี้เป็นสำเนาทดสอบ ระบบจริงยังใช้ Firebase และปิดการเพิ่ม–หัก Sparks ใน Preview
    </p>:null}
    {error?<p role="status" className="qa-sparks-cloud-warning">ยังตรวจสอบฐานข้อมูลที่ใช้งานจริงไม่ได้ กรุณากด ↻ อีกครั้ง</p>:null}

    {adminAccess && report?<details className="qa-sparks-cloud-detail">
      <summary>รายละเอียดการย้ายระบบ <span>{safeCompleted?"เสร็จแล้ว":`${completeCount}/${report.migrationChecks.length} ขั้นตอนที่ตรวจผ่าน`}</span></summary>
      <p className="qa-sparks-cloud-snapshot">
        สำเนาข้อมูลที่ตรวจสอบเมื่อ {report.reviewedSnapshot.asOf.split("-").reverse().join("/")}:
        {" "}{report.reviewedSnapshot.documents.toLocaleString("en-US")} Documents
        <small>{report.reviewedSnapshot.scope}</small>
      </p>
      <ul className="qa-sparks-cloud-checks">
        {report.migrationChecks.map(item=><li key={item.id}>
          <span className={item.completed?"passed":"waiting"} aria-hidden="true">{item.completed?"✓":"○"}</span>{item.label}
        </li>)}
      </ul>
      <div className="qa-sparks-cloud-changes">
        <strong>แก้ไขล่าสุด · {report.changeLogReviewedAt.split("-").reverse().join("/")}</strong>
        <ul>{report.changeLog.map(item=><li key={item}>{item}</li>)}</ul>
      </div>
      <a className="qa-sparks-cloud-pr" href={safeCompleted?"https://github.com/songpongo88-svg/qa-dashboard/tree/main/migration/sparks-only":"https://github.com/songpongo88-svg/qa-dashboard/pull/195"} target="_blank" rel="noopener noreferrer">
        {safeCompleted?"ดูรายละเอียดการย้ายระบบและผลตรวจสอบ":"ดูรายการแก้ไขและงานที่ยังค้างบน GitHub"}
      </a>
      <p className="qa-sparks-cloud-warning-note">
        {safeCompleted?"ระบบยืนยันการสลับฐานข้อมูล Production แล้ว":
          "ยังไม่เปิดใช้งาน Supabase แทน Firebase บนเว็บไซต์จริง การตรวจสำเนาครบไม่ได้แปลว่าย้ายระบบเสร็จ"}
      </p>
    </details>:null}
  </section>;
}
