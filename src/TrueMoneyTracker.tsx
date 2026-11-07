import React,{useCallback,useState} from "react";
import RewardActionConfirmModal from "./RewardActionConfirmModal";

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
      <button type="button" disabled={loading||busy} onClick={()=>void reload()}>
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
    {!adminReady?<p role="status" className="qa-money-error">ระบบยังตรวจสถานะ Admin จากการโหลด Wallet ไม่สำเร็จ สามารถกดตรวจสอบหรือรีเฟรช Tracker ได้ แต่เซิร์ฟเวอร์จะตรวจสิทธิ์ก่อนยืนยันการโอนทุกครั้ง</p>:null}
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
              aria-label={"ตรวจสอบการโอน TrueMoney "+request.amountTHB+" บาท ของ "+(request.displayName||request.username)}
              disabled={busy}
              aria-haspopup="dialog" aria-expanded={selected===request.itemId}
              title="เปิด Pop-up ตรวจสอบและยืนยันการโอน TrueMoney"
              onPointerDown={event=>event.stopPropagation()}
              onClick={event=>{event.preventDefault();event.stopPropagation();choose(request.itemId);}}>
              {busy&&selected===request.itemId?"กำลังบันทึก...":"ตรวจสอบและยืนยันการโอน"}
            </button>
            :<small>ยืนยันโดย {request.payoutConfirmedBy||"Admin"}</small>}
        </div>

      </article>)}
    </div>
    <RewardActionConfirmModal
      request={selected&&requests.find(r=>r.itemId===selected&&r.status==="pending")?(()=>{
        const r=requests.find(x=>x.itemId===selected)!;
        return {rewardId:"truemoney-20",itemName:"TrueMoney 20 บาท",recipientName:r.displayName||r.username,
          username:r.username,amountLabel:r.amountTHB+" บาท",destinationLabel:r.phone,
          requestedAt:r.createdAt,dueDate:r.dueDate,kind:"money" as const};
      })():null}
      busy={busy} error={selected?error:""}
      onCancel={()=>{if(!busy){setSelected(null);setError("");}}}
      onConfirm={()=>void markPaid()}/>
  </section>;
}
