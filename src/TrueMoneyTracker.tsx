import React,{useCallback,useState} from "react";

type Request={
  requestId:string;itemId:string;username:string;displayName:string;phone:string;
  amountTHB:number;status:string;createdAt:string;dueDate:string;
  payoutConfirmedAt?:string;payoutConfirmedBy?:string;
};
type Props={actorUsername:string;sessionId:string;adminReady:boolean};
function asDay(v:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v||""))return "—";
  return new Date(v+"T12:00:00Z").toLocaleDateString("th-TH",{
    timeZone:"Asia/Bangkok",day:"numeric",month:"long",year:"numeric",
  });
}
function describeError(error:unknown){
  return error instanceof Error?error.message:"ไม่สามารถยืนยันการโอนได้ กรุณาตรวจสอบสถานะอีกครั้ง";
}
export default function TrueMoneyTracker({actorUsername,sessionId,adminReady}:Props){
  const [requests,setRequests]=useState<Request[]>([]);
  const [loaded,setLoaded]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [selected,setSelected]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState<"pending"|"paid"|"all">("pending");

  const call=useCallback(async(action:string,extra:Record<string,unknown>={})=>{
    // The server may be slow when Firestore quota is exhausted. Always settle
    // the UI with a visible message rather than leaving a button spinning.
    const controller=new AbortController();
    const timeout=window.setTimeout(()=>controller.abort(),25000);
    try{
      const response=await fetch("/api/sparks-admin",{
        method:"POST",headers:{"content-type":"application/json"},cache:"no-store",
        signal:controller.signal,
        body:JSON.stringify({action,actorUsername,sessionId,...extra}),
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(String(result.error||"คำขอไม่สำเร็จ (HTTP "+response.status+")"));
      return result;
    }catch(reason){
      if(reason instanceof Error&&reason.name==="AbortError")
        throw new Error("ระบบตอบกลับช้าเกินไป อาจบันทึกสำเร็จแล้ว กรุณากดรีเฟรช Tracker เพื่อตรวจสถานะก่อนยืนยันซ้ำ");
      throw reason;
    }finally{
      window.clearTimeout(timeout);
    }
  },[actorUsername,sessionId]);

  const reload=useCallback(async()=>{
    if(!adminReady)return;
    setLoading(true);setError("");
    try{
      const result=await call("list-truemoney-tracker");
      setRequests(Array.isArray(result.requests)?result.requests:[]);
      setLoaded(true);
      setSelected(null);
    }catch(e){setError(describeError(e));}
    finally{setLoading(false);}
  },[adminReady,call]);

  // Explicit Admin click only: avoid background reads while quota is limited.
  const markPaid=async()=>{
    if(!selected||busy)return;
    const current=requests.find(row=>row.itemId===selected);
    if(!adminReady){
      setError("สิทธิ์ Sparks Admin ไม่พร้อม กรุณายืนยันสิทธิ์ก่อนทำรายการ");
      return;
    }
    if(!current||current.status!=="pending"){
      setError("สถานะรายการเปลี่ยนไปแล้ว กรุณารีเฟรช Tracker");
      return;
    }
    setBusy(true);setError("");setMessage("");
    try{
      const result=await call("mark-truemoney-paid",{itemId:selected});
      if(result.status!=="paid")throw new Error("เซิร์ฟเวอร์ไม่ได้ยืนยันสถานะว่าโอนแล้ว กรุณาตรวจสอบ Tracker");
      // Server confirms the write. Move this row to Paid locally so we do not
      // make an additional Firestore read merely to reflect success.
      setRequests(previous=>previous.map(row=>row.itemId===selected?{
        ...row,status:"paid",
        payoutConfirmedBy:actorUsername,
        payoutConfirmedAt:result.paidAt||row.payoutConfirmedAt,
      }:row));
      setMessage(result.alreadyApplied
        ?"รายการนี้ถูกยืนยันว่าโอนแล้วก่อนหน้านี้"
        :"บันทึกสถานะว่าโอน TrueMoney 20 บาทสำเร็จแล้ว");
      setSelected(null);
    }catch(e){setError(describeError(e));}
    finally{setBusy(false);}
  };
  const filtered=requests.filter(row=>status==="all"||row.status===status);
  const choose=(itemId:string)=>{
    if(busy)return;
    setError("");setMessage("");setSelected(itemId);
  };

  return <section className="qa-money-tracker" aria-label="TrueMoney Redemption Tracker">
    <header>
      <div><h2>TrueMoney Redemption Tracker</h2>
        <p>ตรวจสอบคำขอรับเงิน 20 บาท และยืนยันหลังจากโอนเงินจริงแล้วเท่านั้น</p></div>
      <button type="button" disabled={!adminReady||loading||busy} onClick={()=>void reload()}>
        {loading?"กำลังรีเฟรช...":"รีเฟรช Tracker"}
      </button>
    </header>
    <div className="qa-money-tracker-filters">
      {(["pending","paid","all"] as const).map(option=><button type="button" key={option}
        className={status===option?"active":""} onClick={()=>setStatus(option)} disabled={busy}>
        {option==="pending"?"รอโอน":option==="paid"?"โอนแล้ว":"ทั้งหมด"}
      </button>)}
      <span>{filtered.length} รายการ</span>
    </div>
    {!adminReady?<p role="alert">ต้องยืนยันสิทธิ์ Sparks Admin ก่อนจัดการ Tracker</p>:null}
    {loading?<p role="status">กำลังโหลดคำขอ...</p>:null}
    {error&&!selected?<p role="alert" className="qa-money-error">{error}</p>:null}
    {message?<p role="status" className="qa-money-success">{message}</p>:null}
    {loaded&&filtered.length===0?<p>ยังไม่มีรายการสถานะนี้</p>:null}
    <div className="qa-money-tracker-list">
      {filtered.map(request=><article key={request.requestId} className="qa-money-tracker-request">
        <div><strong>{request.displayName||request.username}</strong><small>@{request.username}</small></div>
        <div><span>TrueMoney {request.amountTHB} บาท</span><strong>{request.phone}</strong></div>
        <div><small>ส่งคำขอ {new Date(request.createdAt).toLocaleString("th-TH",{timeZone:"Asia/Bangkok"})}</small>
          <strong>กำหนด {asDay(request.dueDate)}</strong></div>
        <div>
          <span className={request.status==="paid"?"paid":"pending"}>
            {request.status==="paid"?"โอนแล้ว":"รอโอนเงิน"}
          </span>
          {request.status==="pending"
            ?<button type="button" data-truemoney-paid-action={selected===request.itemId?"confirm":"open"}
              aria-label={selected===request.itemId?"ยืนยันว่าโอนเงินจริงแล้ว":"ตรวจสอบรายการก่อนยืนยันโอน"}
              disabled={!adminReady||busy}
              onClick={()=>{
                if(selected===request.itemId){void markPaid();}
                else choose(request.itemId);
              }}>
              {busy&&selected===request.itemId?"กำลังบันทึก...":
                selected===request.itemId?"ยืนยันว่าโอนเงินจริงแล้ว":"ยืนยันโอนสำเร็จ"}
            </button>
            :<small>ยืนยันโดย {request.payoutConfirmedBy||"Admin"}</small>}
        </div>
        {selected===request.itemId&&request.status==="pending"
          ?<div className="qa-money-tracker-inline-confirm" role="group" aria-label="ตรวจสอบก่อนยืนยันสถานะโอนแล้ว">
            <strong>ตรวจสอบการโอนเงินอีกครั้ง</strong>
            <p>คุณได้โอนเงินจริง <b>{request.amountTHB} บาท</b> ให้ <b>{request.displayName||request.username}</b> หมายเลข <b>{request.phone}</b> แล้วใช่หรือไม่?</p>
            <p>ปุ่มนี้เปลี่ยนสถานะคำขอเท่านั้น <b>ระบบไม่โอนเงินจริงอัตโนมัติ</b></p>
            <p className="qa-money-tracker-step-instruction" role="status"><b>ขั้นตอนที่ 2:</b> ตรวจสอบข้อมูลให้ครบ แล้วกดปุ่มสีส้ม <b>ยืนยันว่าโอนเงินจริงแล้ว</b> ด้านบนของรายการเดิมอีกครั้ง</p>
            {error?<p role="alert" className="qa-money-error">{error}</p>:null}
            {busy?<p role="status" className="qa-money-tracker-confirm-progress">รับคำสั่งแล้ว กำลังบันทึกสถานะกับเซิร์ฟเวอร์...</p>:null}
            {!adminReady?<p role="alert" className="qa-money-error">สิทธิ์ Admin ไม่พร้อมใช้งาน</p>:null}
            <div className="qa-money-tracker-inline-actions">
              <button type="button" onClick={()=>{setSelected(null);setError("");}} disabled={busy}>ยกเลิก</button>
            </div>
          </div>:null}
      </article>)}
    </div>
  </section>;
}
