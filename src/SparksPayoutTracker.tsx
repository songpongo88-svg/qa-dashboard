import React,{useEffect,useState} from "react";
type Payout={id:string;username:string;displayName:string;receivingPhone:string;amountBaht:number;submittedAt:string;dueDate:string;status:string;paidAt:string;paidBy:string};
const formatTime=(iso:string)=>{const date=new Date(iso);return Number.isFinite(date.getTime())?date.toLocaleString("th-TH",{timeZone:"Asia/Bangkok",dateStyle:"medium",timeStyle:"short"}):"—"};
const dateThai=(date:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return "—";
 return new Date(date+"T12:00:00+07:00").toLocaleDateString("th-TH",{timeZone:"Asia/Bangkok",dateStyle:"long"})};
export default function SparksPayoutTracker({username,sessionId}:{username:string;sessionId:string}){
 const [requests,setRequests]=useState<Payout[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [selected,setSelected]=useState<Payout|null>(null),[busy,setBusy]=useState(false);
 const request=async(action:string,input:Record<string,unknown>={})=>{
  const res=await fetch("/api/sparks-admin",{method:"POST",cache:"no-store",headers:{"content-type":"application/json"},
   body:JSON.stringify({action,actorUsername:username,sessionId,...input})});
  const result=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(String(result.error||"ไม่สามารถอ่าน Tracker ได้"));
  return result;
 };
 const load=async()=>{if(!username||!sessionId)return;
  setLoading(true);try{const r=await request("list-truemoney-requests");setRequests(r.requests||[]);setError("")}
  catch(e){setError(e instanceof Error?e.message:"โหลด Tracker ไม่สำเร็จ")}finally{setLoading(false)}
 };
 useEffect(()=>{void load()},[username,sessionId]);
 const confirm=async()=>{
  if(!selected||busy)return;
  setBusy(true);setError("");setNotice("");
  try{
   const result=await request("complete-truemoney-payout",{itemId:selected.id});
   setNotice(result.alreadyApplied?"คำขอรายการนี้ได้รับการยืนยันไปแล้ว":"ยืนยันว่าโอนเงินจริง 20 บาทเรียบร้อย และแจ้งสถานะผู้ใช้แล้ว");
   setSelected(null);await load();
  }catch(e){setError(e instanceof Error?e.message:"ไม่สามารถยืนยันการโอนเงินได้")}
  finally{setBusy(false)}
 };
 const pending=requests.filter(r=>r.status==="pending"),completed=requests.filter(r=>r.status==="paid");
 return <section className="qa-sparks-admin-payouts" aria-label="TrueMoney Redemption Tracker">
  <div className="qa-sparks-inventory-heading"><h2>TrueMoney Redemption Tracker</h2>
   <button type="button" disabled={loading||busy} onClick={()=>void load()}>รีเฟรชคำขอ</button></div>
  <p>รายการขอรับเงิน 20 บาท · ระบบไม่ได้โอนเงินอัตโนมัติ โปรดตรวจสอบการโอนเงินจริงก่อนกดยืนยัน</p>
  <div className="qa-sparks-payout-summary"><span>รอโอน: <strong>{pending.length}</strong></span><span>โอนสำเร็จ: <strong>{completed.length}</strong></span></div>
  {loading?<p role="status">กำลังตรวจสอบ Tracker...</p>:null}
  {error?<div role="alert" className="qa-sparks-reward-detail-error">{error}</div>:null}
  {notice?<div role="status" className="qa-sparks-reward-detail-success">{notice}</div>:null}
  {requests.length?<div className="qa-sparks-payout-list">{requests.map(item=><article key={item.id} className="qa-sparks-payout-item">
    <div><strong>{item.displayName||item.username}</strong><small>@{item.username}</small>
     <span>หมายเลขรับเงิน TrueMoney: <strong>{item.receivingPhone}</strong></span>
     <span>ส่งคำขอ {formatTime(item.submittedAt)}</span>
     <span>ต้องโอนเงินภายใน {dateThai(item.dueDate)}</span>
     {item.paidAt?<span>ยืนยันโอน {formatTime(item.paidAt)} โดย {item.paidBy}</span>:null}
    </div>
    <div className="qa-sparks-payout-side"><strong>฿20</strong>
     <span className={"qa-sparks-item-status "+(item.status==="paid"?"paid":"submitted")}>{item.status==="paid"?"โอนสำเร็จ":"รอโอนเงิน"}</span>
     {item.status==="pending"?<button type="button" className="qa-sparks-item-use" onClick={()=>setSelected(item)}>ยืนยันโอนสำเร็จ</button>:null}
    </div>
   </article>)}</div>:!loading?<p className="qa-sparks-inventory-empty">ยังไม่มีคำขอรับ TrueMoney</p>:null}
  {selected?<div className="qa-sparks-admin-overlay" role="presentation"><section className="qa-sparks-admin-dialog" role="dialog" aria-modal="true" aria-labelledby="tm-admin-confirm-title">
   <h2 id="tm-admin-confirm-title">ยืนยันการโอน TrueMoney 20 บาท</h2>
   <p>ผู้รับ: <strong>{selected.displayName||selected.username}</strong></p>
   <p>หมายเลขรับเงิน: <strong>{selected.receivingPhone}</strong></p>
   <p>ยอดเงินที่โอน: <strong>20 บาท</strong></p>
   <div className="qa-sparks-admin-confirm"><strong>โปรดกดยืนยันต่อเมื่อคุณโอนเงินจริงให้ผู้รับสำเร็จแล้วเท่านั้น</strong>
    <p>การกดปุ่มไม่ใช่การสั่งโอนเงินจากระบบ เป็นเพียงบันทึกยืนยันรายการ</p></div>
   <div className="qa-sparks-admin-actions">
    <button type="button" className="secondary" disabled={busy} onClick={()=>setSelected(null)}>ยกเลิก</button>
    <button type="button" disabled={busy} onClick={()=>void confirm()}>{busy?"กำลังบันทึก":"ฉันโอนเงินจริงสำเร็จแล้ว"}</button>
   </div>
  </section></div>:null}
 </section>;
}
