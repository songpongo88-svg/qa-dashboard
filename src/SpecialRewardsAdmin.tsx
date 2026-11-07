import React,{useCallback,useState} from "react";
import "./specialRewards.css";
type Request={requestId:string;itemId:string;rewardId:string;title:string;username:string;displayName:string;
 status:string;createdAt:string;amountTHB?:number;payoutTHB?:number;promptPay?:string;email?:string;
 ocrStatus?:string;ocrNote?:string;receiptNumber?:string;receiptAt?:string;adminNote?:string;
 resolvedAt?:string;resolvedBy?:string};
export default function SpecialRewardsAdmin({actorUsername,sessionId,adminReady}:{actorUsername:string;sessionId:string;adminReady:boolean}){
 const [rows,setRows]=useState<Request[]>([]);
 const [loaded,setLoaded]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [receiptImages,setReceiptImages]=useState<Record<string,string>>({});
 const [notes,setNotes]=useState<Record<string,string>>({});
 const [filter,setFilter]=useState<"pending"|"all"|"completed">("pending");
 const call=useCallback(async(action:string,extra:Record<string,unknown>={})=>{
  const response=await fetch("/api/sparks-admin",{method:"POST",cache:"no-store",headers:{"content-type":"application/json"},
    body:JSON.stringify({action,actorUsername,sessionId,...extra})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(String(result.error||"ไม่สามารถทำรายการได้"));
  return result;
 },[actorUsername,sessionId]);
 const refresh=async()=>{
  if(!adminReady)return;
  setBusy(true);setError("");
  try{const result=await call("special-rewards-admin-list");setRows(result.requests||[]);setLoaded(true);}
  catch(e){setError(e instanceof Error?e.message:"ไม่สามารถโหลด Tracker ได้");}
  finally{setBusy(false);}
 };
 const viewReceipt=async(id:string)=>{
  if(receiptImages[id]){setReceiptImages(prev=>({...prev,[id]:""}));return;}
  setBusy(true);setError("");
  try{const result=await call("special-rewards-admin-receipt",{itemId:id});
   setReceiptImages(prev=>({...prev,[id]:result.imageData}));
  }catch(e){setError(e instanceof Error?e.message:"ไม่สามารถเปิดใบเสร็จได้");}
  finally{setBusy(false);}
 };
 const action=async(row:Request,decision:"approve"|"reject"|"complete")=>{
  if(!adminReady||busy)return;
  if(decision==="complete"&&!window.confirm("คุณได้โอนเงินคืนจริงหรือจัดส่ง Netflix แล้วใช่หรือไม่? ระบบเพียงบันทึกสถานะ ไม่โอนเงินเอง"))return;
  if(decision==="reject"&&(!notes[row.itemId]||notes[row.itemId].trim().length<4)){setError("กรุณาระบุเหตุผลการปฏิเสธอย่างน้อย 4 ตัวอักษร");return;}
  setBusy(true);setError("");setMessage("");
  try{
   const result=await call("special-rewards-admin-action",{itemId:row.itemId,decision,note:notes[row.itemId]||""});
   setRows(previous=>previous.map(r=>r.itemId===row.itemId?{...r,status:result.status,resolvedBy:actorUsername}:r));
   setMessage("บันทึกผล "+row.title+" สำเร็จ · "+result.status);
  }catch(e){setError(e instanceof Error?e.message:"บันทึกสถานะไม่สำเร็จ");}
  finally{setBusy(false);}
 };
 const data=rows.filter(row=>filter==="all"||filter==="completed"
  ?filter==="all"||["rejected","paid","delivered"].includes(row.status)
  :["pending_review","approved"].includes(row.status));
 return <section className="sr-admin" aria-label="Reward Redemption Tracker">
  <header><h2>Reward Redemption Tracker <small>พันธุ์ไทย · Netflix · Café Amazon · 7-Eleven</small></h2>
   <button type="button" disabled={!adminReady||busy} onClick={()=>void refresh()}>{busy?"กำลังทำรายการ...":"รีเฟรชคำขอ"}</button></header>
  <div className="qa-money-tracker-filters">
   {([["pending","รอตรวจสอบ"],["completed","เสร็จสิ้น"],["all","ทั้งหมด"]] as const).map(([id,label])=>
    <button type="button" key={id} className={filter===id?"active":""} disabled={busy} onClick={()=>setFilter(id)}>{label}</button>)}
   <span>{data.length} รายการ</span>
  </div>
  {!adminReady?<p role="alert" className="sr-error">ต้องยืนยันสิทธิ์ Sparks Admin ก่อนจัดการรายการ</p>:null}
  {error?<p className="sr-error" role="alert">{error}</p>:null}
  {message?<p className="sr-success" role="status">{message}</p>:null}
  {loaded&&data.length===0?<p>ไม่มีรายการในสถานะนี้</p>:null}
  <div className="sr-admin-list">
   {data.map(row=><article key={row.requestId} className="sr-admin-card">
     <div><div><strong>{row.title}</strong><span> · {row.displayName||row.username} (@{row.username})</span></div>
       <strong>{row.status}</strong></div>
     <p>ส่งคำขอ {new Date(row.createdAt).toLocaleString("th-TH",{timeZone:"Asia/Bangkok"})}</p>
     {row.receiptNumber?<><p>เลขที่ใบเสร็จ: <b>{row.receiptNumber}</b> · วันที่ซื้อ: {row.receiptAt?new Date(row.receiptAt).toLocaleString("th-TH",{timeZone:"Asia/Bangkok"}):"—"}</p>
       <p>ยอดจ่ายจริง: {row.amountTHB} บาท · <b>ยอดคืน: {row.payoutTHB} บาท</b> · พร้อมเพย์: <b>{row.promptPay}</b></p>
       <p>ผลตรวจ OCR: {row.ocrStatus||"manual"} · {row.ocrNote||"รอตรวจสอบด้วยตนเอง"}</p>
       <button type="button" disabled={busy} onClick={()=>void viewReceipt(row.itemId)}>
        {receiptImages[row.itemId]?"ซ่อนภาพใบเสร็จ":"ดูภาพใบเสร็จ"}</button>
       {receiptImages[row.itemId]?<img src={receiptImages[row.itemId]} className="sr-admin-receipt-image" alt="ภาพใบเสร็จประกอบการตรวจสอบ"/>:null}
      </>:null}
     {row.email?<p>อีเมล Netflix: <b>{row.email}</b> · ผู้ใช้รับรองว่าไม่เคยถูกเรียกเก็บค่าสมาชิก (ต้องตรวจสอบเงื่อนไขด้วยตนเอง)</p>:null}
     {["pending_review","approved"].includes(row.status)?<>
       <label>หมายเหตุ Admin / เหตุผลปฏิเสธ<input value={notes[row.itemId]||""} maxLength={350}
         onChange={e=>setNotes(prev=>({...prev,[row.itemId]:e.target.value}))} placeholder="รายละเอียดการตรวจสอบ"/></label>
       <div className="sr-admin-actions">
        {row.status==="pending_review"?<button type="button" className="sr-admin-primary" disabled={busy} onClick={()=>void action(row,"approve")}>อนุมัติคำขอ</button>:null}
        {row.status==="approved"?<button type="button" className="sr-admin-primary" disabled={busy} onClick={()=>void action(row,"complete")}>
          {row.rewardId==="netflix-1m"?"ยืนยันส่งสิทธิ์ Netflix แล้ว":"ยืนยันว่าโอนเงินจริงแล้ว"}
        </button>:null}
        <button type="button" disabled={busy} onClick={()=>void action(row,"reject")}>ไม่อนุมัติ</button>
       </div>
     </>:<p>บันทึกผลโดย {row.resolvedBy||"Admin"}{row.adminNote?" · "+row.adminNote:""}</p>}
   </article>)}
  </div>
 </section>;
}
