import React, {useCallback, useState} from 'react';

// QA Dashboard-specific status; intentionally independent of QA Sparks.
// Never provides a button to activate failover or change evaluation scores.
type StandbyStatus={
  ok:boolean;
  primary:'firestore';
  standby:'local-postgresql';
  standbyRole:'archive-only';
  bridgeStatus:'not_configured'|'not_reachable'|'reachable_read_only';
  archiveStatus:'unverified'|'archived_counts_match';
  currentFirestoreParity:'not_verified';
  dataProxyEnabled:boolean;
  failoverEnabled:false;
  writeEnabled:false;
  syncBackVerified:false;
  checkedAt:string;
  archivedDocuments?:number;
  snapshotReadiness?:{
    snapshotCopied:boolean;
    candidatesVerified:boolean;
    documentCount:number;
    sourceEvaluations:number;
    candidateEvaluations:number;
    datasetCount:number;
    freshnessVerified:boolean;
    remainingChecks:string[];
  };
};
const statusColor=(ok:boolean)=>ok?'text-emerald-700':'text-amber-800';
const reasonDescriptions:Record<string,string>={
  live_snapshot_missing:'ยังไม่มีข้อมูลล่าสุดจาก Firestore ที่ตรวจสอบครบ',
  snapshot_copy_unverified:'ยังตรวจสอบเอกสารสำรองล่าสุดไม่ครบทุกฉบับ',
  evaluation_candidate_unverified:'ยังไม่ได้ตรวจคะแนนและเคสต้นฉบับในชุดข้อมูลล่าสุด',
  source_snapshot_not_fresh:'ข้อมูลที่สำรองไว้ไม่ใหม่พอสำหรับการสลับระบบ',
  standby_mode_requires_review:'สถานะฐานสำรองต้องตรวจสอบโดยผู้ดูแล',
  standby_writes_not_frozen:'ยังไม่ยืนยันการล็อกข้อมูลระหว่างตรวจสอบ',
  outbox_not_empty:'ยังมีรายการบันทึกหรือข้อขัดแย้งที่ต้องซิงก์กลับ',
  independent_live_parity_not_certified:'ยังไม่ผ่านการเทียบข้อมูลล่าสุดกับ Firestore โดยอิสระ',
  local_login_and_roles_not_certified:'Login และสิทธิ์ผู้ใช้ผ่านฐานสำรองยังไม่ผ่านการรับรอง',
  qa_write_and_failback_not_certified:'การประเมิน อุทธรณ์ ลายเซ็น และการซิงก์กลับยังไม่ผ่านการรับรอง',
};

export default function QaStandbySystemStatus(){
  const [state,setState]=useState<StandbyStatus|null>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const check=useCallback(async()=>{
    if(loading)return;
    setLoading(true);
    setError('');
    try{
      const response=await fetch('/api/cron/expire-additional-appeals?qaStatus=1',{
        method:'GET',headers:{accept:'application/json'},
        credentials:'same-origin',cache:'no-store',
        signal:AbortSignal.timeout(11000),
      });
      if(!response.ok)throw new Error('preview_status_unavailable');
      const data=await response.json() as StandbyStatus;
      if(data?.ok!==true||data.primary!=='firestore'||
        data.standby!=='local-postgresql'||data.failoverEnabled!==false||
        data.writeEnabled!==false||data.syncBackVerified!==false||
        data.currentFirestoreParity!=='not_verified'||
        !['not_configured','not_reachable','reachable_read_only'].includes(data.bridgeStatus))
        throw new Error('invalid_status_response');
      setState(data);
    }catch{
      setState(null);
      setError('ยังตรวจสถานะจากเซิร์ฟเวอร์ Preview ไม่ได้ — ไม่ได้หมายความว่าข้อมูล QA หาย');
    }finally{setLoading(false);}
  },[loading]);

  const bridge=state?.bridgeStatus==='reachable_read_only';
  const bridgeText=state?.bridgeStatus==='reachable_read_only'
    ? 'เชื่อมถึง PostgreSQL ได้ (อ่านสถานะเท่านั้น)'
    : state?.bridgeStatus==='not_configured'
    ? 'ยังไม่ได้ตั้งค่าเส้นทาง Cloudflare Worker'
    : state?.bridgeStatus==='not_reachable'
    ? 'ยังเชื่อมต่อ API บนคอมจาก Preview ไม่ได้'
    : 'ยังไม่ตรวจ';
  return (
    <section data-qa-standby-status="preview-safe" className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.17em] text-slate-500">QA Dashboard · Backup & Failover</p>
          <h3 className="mt-1 text-xl font-bold text-slate-900">สถานะเซิร์ฟเวอร์สำรองบนคอม</h3>
          <p className="mt-1 text-sm text-slate-600">ตรวจสถานะด้วยตัวเองได้ โดยไม่อ่านคะแนนจาก Firestore และไม่บันทึกเคส</p>
        </div>
        <button type="button" onClick={()=>void check()} disabled={loading}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60">
          {loading?'กำลังตรวจสอบ…':'ตรวจการเชื่อมต่อ'}
        </button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">ฐานข้อมูลหลัก (Primary)</p>
          <p className="mt-1 text-sm font-bold text-slate-900">Firestore</p>
          <p className="mt-1 text-xs text-slate-500">เว็บไซต์ยังไม่ได้เปลี่ยนฐานหลัก</p>
        </div>
        <div className="rounded-2xl bg-amber-50 p-3">
          <p className="text-xs text-amber-700">ฐานสำรอง (Standby)</p>
          <p className="mt-1 text-sm font-bold text-amber-900">PostgreSQL · ยังไม่เปิด Failover</p>
          <p className="mt-1 text-xs text-amber-800">ยังไม่ได้อนุญาตให้บันทึกคะแนนจริงผ่านฐานสำรอง</p>
        </div>
        <div className="rounded-2xl border border-slate-200 p-3">
          <p className="text-xs text-slate-500">การเชื่อมต่อจาก Preview ถึงคอม</p>
          <p className={'mt-1 text-sm font-semibold '+statusColor(bridge)}>{bridgeText}</p>
          <p className="mt-1 text-xs text-slate-500">
            {state?.archiveStatus==='archived_counts_match'&&typeof state.archivedDocuments==='number'
              ? 'ตรวจยอดนำเข้าข้อมูลเก่า '+state.archivedDocuments.toLocaleString('th-TH')+' รายการ (ไม่ใช่การยืนยันข้อมูลล่าสุด)'
              : 'ยังไม่ยืนยันยอดข้อมูลสำรองผ่านเครือข่าย'}
          </p>
        </div>
        <div className="rounded-2xl border border-amber-200 p-3">
          <p className="text-xs text-slate-500">การตรวจข้อมูลล่าสุดและการซิงก์กลับ</p>
          <p className="mt-1 text-sm font-semibold text-amber-800">ยังไม่ผ่านการรับรอง</p>
          <p className="mt-1 text-xs text-slate-500">ห้ามใช้สำเนาเก่าเขียนทับผล QA หรือเปิดรับงานจริง</p>
        </div>
      </div>
      {state?.snapshotReadiness ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/40 p-4" data-qa-standby-readiness="unverified">
          <h4 className="text-sm font-bold text-slate-900">ผลตรวจความพร้อมใช้งานผ่านฐานสำรอง</h4>
          <p className="mt-1 text-xs text-slate-700">
            สำเนาใหม่: {state.snapshotReadiness.snapshotCopied?'ตรวจการคัดลอกแล้ว':'ยังไม่ครบ'} ·
            คะแนนต้นฉบับ: {state.snapshotReadiness.candidatesVerified?'ตรวจแล้ว':'ยังไม่ผ่าน'} ·
            {state.snapshotReadiness.documentCount.toLocaleString('th-TH')} เอกสาร
            จาก {state.snapshotReadiness.datasetCount} กลุ่มข้อมูล
          </p>
          <p className="mt-1 text-xs text-slate-700">
            ผลประเมินจาก Snapshot: {state.snapshotReadiness.sourceEvaluations.toLocaleString('th-TH')} เคส ·
            ยืนยันคะแนนเดิม: {state.snapshotReadiness.candidateEvaluations.toLocaleString('th-TH')} เคส
          </p>
          <p className="mt-2 text-xs font-semibold text-amber-900">ส่วนที่ยังไม่ผ่านก่อนเปิดใช้งานจริง</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-700">
            {state.snapshotReadiness.remainingChecks.map(code=>(
              <li key={code}>{reasonDescriptions[code]||'รายการตรวจสอบความปลอดภัยที่ยังไม่ผ่าน'}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-900">ตอนนี้ยังไม่อนุญาตให้บันทึกคะแนนผ่าน PostgreSQL</p>
        </div>
      ) : null}
      {state?.checkedAt ? (
        <p className="mt-3 text-xs text-slate-500">
          ตรวจล่าสุด: {new Date(state.checkedAt).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})}
        </p>
      ) : null}
      {error ? <p role="alert" className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}
      <p className="mt-3 text-xs leading-6 text-slate-600">
        หากขึ้นว่าเชื่อมต่อได้ หมายถึงอ่านสถานะจากคอมได้เท่านั้น ไม่ได้ยืนยันว่า Login, ประเมิน,
        อุทธรณ์, ลายเซ็น หรือการคืนข้อมูลกลับ Firestore ทำงานผ่านฐานสำรองแล้ว
      </p>
    </section>
  );
}
