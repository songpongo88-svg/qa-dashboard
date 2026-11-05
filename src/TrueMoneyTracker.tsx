import React,{useCallback,useEffect,useState} from "react";

type Request={requestId:string;itemId:string;username:string;displayName:string;phone:string;
  amountTHB:number;status:string;createdAt:string;dueDate:string;payoutConfirmedAt?:string;payoutConfirmedBy?:string};
type Props={actorUsername:string;sessionId:string;adminReady:boolean};
function asDay(v:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v||""))return "—";
  return new Date(v+"T12:00:00Z").toLocaleDateString("th-TH",{timeZone:"Asia/Bangkok",day:"numeric",month:"long",year:"numeric"});
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
    const response=await fetch("/api/sparks-admin",{method:"POST",headers:{"content-type":"application/json"},cache:"no-store",
      body:JSON.stringify({action,actorUsername,sessionId,...extra})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(String(result.error||"โหลด Tracker ไม่สำเร็จ"));
    return result;
  },[actorUsername,sessionId]);
  const reload=useCallback(async()=>{
    if(!adminReady)return;
    setLoading(true);setError("");
    try{const result=await call("list-truemoney-tracker");setRequests(result.requests||[]);setLoaded(true);}
    catch(e){setError(e instanceof Error?e.message:"โหลด Tracker ไม่ได้");}
    finally{setLoading(false);}
  },[adminReady,call]);
  useEffect(()=>{if(adminReady)void reload();},[adminReady,reload]);
  const markPaid=async()=>{
    if(!selected||!adminReady||busy)return;
    setBusy(true);setError("");
    try{
      const result=await call("mark-truemoney-paid",{itemId:selected});
      setMessage(result.alreadyApplied?"คำขอนี้โอนสำเร็จแล้ว":"บันทึกว่าโอน TrueMoney 20 บาทสำเร็จแล้ว");
      setSelected(null);await reload();
    }catch(e){setError(e instanceof Error?e.message:"ยืนยันโอนเงินไม่ได้");}
    finally{setBusy(false);}
  };
  const filtered=requests.filter(r=>status==="all"||r.status===status);
  const current=requests.find(r=>r.itemId===selected);
  return <section className="qa-money-tracker" aria-label="TrueMoney Redemption Tracker">
    <header><div><h2>TrueMoney Redemption Tracker</h2><p>ตรวจสอบคำขอรับเงิน 20 บาท และยืนยันหลังจากโอนเงินจริงแล้วเท่านั้น</p></div><button type="button" onClick={()=>void reload()} disabled={!adminReady||loading}>รีเฟรช Tracker</button></header>
    <div className="qa-money-tracker-filters">
      {(["pending","paid","all"] as const).map(option=><button type="button" key={option}
        className={status===option?"active":""} onClick={()=>setStatus(option)}>{option==="pending"?"รอโอน":option==="paid"?"โอนแล้ว":"ทั้งหมด"}</button>)}
      <span>{filtered.length} รายการ</span>
    </div>
    {!adminReady?<p>ต้องยืนยันสิทธิ์ Sparks Admin ก่อนดู Tracker</p>:null}
    {loading?<p>กำลังโหลดคำขอ...</p>:null}
    {error?<p role="alert" className="qa-money-error">{error}</p>:null}
    {message?<p role="status" className="qa-money-success">{message}</p>:null}
    {loaded&&filtered.length===0?<p>ยังไม่มีรายการสถานะนี้</p>:null}
    <div className="qa-money-tracker-list">
      {filtered.map(request=><article key={request.requestId} className="qa-money-tracker-request">
        <div><strong>{request.displayName||request.username}</strong><small>@{request.username}</small></div>
        <div><span>TrueMoney {request.amountTHB} บาท</span><strong>{request.phone}</strong></div>
        <div><small>ส่งคำขอ {new Date(request.createdAt).toLocaleString("th-TH",{timeZone:"Asia/Bangkok"})}</small><strong>กำหนด {asDay(request.dueDate)}</strong></div>
        <div><span className={request.status==="paid"?"paid":"pending"}>{request.status==="paid"?"โอนแล้ว":"รอโอนเงิน"}</span>{request.status==="pending"?<button type="button" disabled={!adminReady} onClick={()=>setSelected(request.itemId)}>ยืนยันโอนสำเร็จ</button>:<small>ยืนยันโดย {request.payoutConfirmedBy||"Admin"}</small>}</div>
      </article>)}
    </div>
    {current?<div className="qa-money-tracker-confirm-overlay">
      <section role="dialog" aria-modal="true" aria-labelledby="qa-money-payout-confirm">
        <h3 id="qa-money-payout-confirm">ยืนยันการโอน TrueMoney สำเร็จ</h3>
        <p>คุณได้โอนเงินจริง <strong>{current.amountTHB} บาท</strong> ให้ <strong>{current.displayName||current.username}</strong> หมายเลข <strong>{current.phone}</strong> แล้วใช่หรือไม่?</p>
        <p>การกดปุ่มนี้จะบันทึกสถานะเท่านั้น ระบบจะไม่โอนเงินอัตโนมัติ</p>
        <div><button type="button" onClick={()=>setSelected(null)} disabled={busy}>ยกเลิก</button><button type="button" disabled={busy} onClick={()=>void markPaid()}>{busy?"กำลังบันทึก...":"ยืนยันว่าโอนเงินจริงแล้ว"}</button></div>
      </section>
    </div>:null}
  </section>;
}
