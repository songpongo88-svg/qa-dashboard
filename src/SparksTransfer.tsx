import React,{useCallback,useEffect,useState} from "react";
import "./sparksTransfer.css";

type Recipient={username:string;displayName:string};
type TransferState={month:string;monthlyLimit:number;sentThisMonth:number;remaining:number;balance:number};
export default function SparksTransfer({username,sessionId,active}:{username:string;sessionId:string;active:boolean}){
 const [summary,setSummary]=useState<TransferState|null>(null);
 const [loading,setLoading]=useState(true);
 const [recipients,setRecipients]=useState<Recipient[]>([]);
 const [recipient,setRecipient]=useState("");
 const [amount,setAmount]=useState(""),[pending,setPending]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const [confirm,setConfirm]=useState(false);
 const [requestId,setRequestId]=useState("");
 const call=useCallback(async(action:string,extra:Record<string,unknown>={})=>{
  const response=await fetch("/api/sparks-admin",{method:"POST",credentials:"same-origin",
   headers:{"content-type":"application/json"},cache:"no-store",
   body:JSON.stringify({action,actorUsername:username,sessionId,...extra})});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(String(body.error||"ทำรายการไม่สำเร็จ"));
  return body;
 },[username,sessionId]);
 const refresh=useCallback(async()=>{
  setLoading(true);
  try{
   const [state,people]=await Promise.all([call("sparks-transfer-state"),call("sparks-transfer-recipients")]);
   setSummary(state);setRecipients(people.recipients||[]);setError("");
  }catch(error){
   setSummary(null);setRecipients([]);
   throw error;
  }finally{setLoading(false);}
 },[call]);
 useEffect(()=>{if(!active)return;let live=true;
  void refresh().catch(e=>{if(live)setError(e instanceof Error?e.message:"โหลดข้อมูลไม่สำเร็จ")});
  return()=>{live=false};
 },[refresh,active]);
 const chosen=recipients.find(x=>x.username===recipient),qty=Number(amount);
 const eligible=Boolean(!loading&&chosen&&summary&&Number.isSafeInteger(qty)&&qty>=1&&qty<=Math.min(summary.remaining,summary.balance,500));
 const submit=async()=>{
  if(!eligible||pending)return;
  setPending(true);setError("");setNotice("");
  const id=requestId||crypto.randomUUID();
  setRequestId(id);
  try{
   const done=await call("sparks-transfer-submit",{recipientUsername:recipient,amount:qty,requestId:id});
   setConfirm(false);setRecipient("");setAmount("");setRequestId("");
   setNotice("โอน "+done.receipt.amount+" Sparks สำเร็จ ให้ "+done.receipt.recipientName+" ("+done.receipt.recipient+")");
   window.dispatchEvent(new Event("qa:sparks-updated"));
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:"โอนไม่สำเร็จ");}
  finally{setPending(false);}
 };
 return <section className="sparks-transfer" aria-label="โอน QA Sparks ให้สมาชิก">
  <div className="sparks-transfer-head"><h2>โอน Sparks ให้กัน</h2><p>โอนจากยอด Sparks ของตัวเองให้สมาชิก QA ที่ยัง Active · ไม่เกิน 500 Sparks รวมต่อเดือน</p></div>
  <div className="sparks-transfer-summary">
   <div><small>ยอด Sparks ของฉัน</small><strong>{summary?summary.balance.toLocaleString("th-TH"):"—"}</strong></div>
   <div><small>โอนไปแล้วเดือนนี้</small><strong>{summary?summary.sentThisMonth+" / 500":"— / 500"}</strong></div>
   <div><small>โอนได้อีก</small><strong>{summary?summary.remaining+" Sparks":"— Sparks"}</strong></div>
  </div>
  {!summary&&!loading?<p className="sparks-transfer-error" role="status">ยังไม่สามารถตรวจสอบยอด Sparks และรายชื่อสมาชิกได้ กรุณาเข้าสู่ระบบ QA Sparks ด้วยอีเมลที่ยืนยันแล้ว หรือลองโหลดข้อมูลใหม่</p>:null}
  {loading?<p role="status">กำลังตรวจสอบข้อมูลโอน Sparks จาก Supabase...</p>:null}
  {!summary?<button className="sparks-transfer-primary" type="button" disabled={loading} onClick={()=>void refresh().catch(e=>setError(e instanceof Error?e.message:"โหลดข้อมูลไม่สำเร็จ"))}>ลองโหลดข้อมูลอีกครั้ง</button>:null}
  <label htmlFor="transfer-member">ผู้รับ Sparks</label>
  <select id="transfer-member" value={recipient} onChange={e=>{setRecipient(e.target.value);setConfirm(false);setRequestId("");}} disabled={pending||loading||!summary}>
   <option value="">เลือกสมาชิกผู้รับ</option>
   {recipients.map(person=><option key={person.username} value={person.username}>{person.displayName} ({person.username})</option>)}
  </select>
  <label htmlFor="transfer-amount">จำนวนที่ต้องการโอน (Sparks)</label>
  <input id="transfer-amount" type="number" min={1} step={1} max={Math.min(summary?.remaining??500,500)}
   placeholder="ระบุจำนวน เช่น 100" value={amount} disabled={pending||loading||!summary}
   onChange={e=>{setAmount(e.target.value);setConfirm(false);setRequestId("");}}/>
  <p className="sparks-transfer-explain">วงเงินโอนรีเซ็ตวันที่ 1 ของเดือน เวลา 00:00 น. (ประเทศไทย) · ผู้รับได้รับคะแนนทันที · ไม่สามารถโอนให้ตัวเอง</p>
  {error?<p className="sparks-transfer-error" role="alert">{error}</p>:null}
  {notice?<p className="sparks-transfer-success" role="status">{notice}</p>:null}
  {!confirm?<button className="sparks-transfer-primary" type="button" disabled={!eligible||pending} onClick={()=>setConfirm(true)}>ตรวจสอบก่อนยืนยันโอน</button>
   :<div className="sparks-transfer-confirm" role="group" aria-label="ยืนยันการโอน Sparks">
    <strong>ยืนยันโอน {qty} Sparks</strong>
    <p>จากบัญชี {username} ไปยัง {chosen?.displayName} ({recipient})</p>
    <p>หลังโอนเหลือ {(summary!.balance-qty).toLocaleString("th-TH")} Sparks · วงเงินเดือนนี้เหลือ {summary!.remaining-qty} Sparks</p>
    <div><button type="button" onClick={()=>{setConfirm(false);setRequestId("");}} disabled={pending}>ยกเลิก</button>
    <button className="sparks-transfer-primary" type="button" disabled={pending} onClick={()=>void submit()}>{pending?"กำลังโอน…":"ยืนยันโอน Sparks"}</button></div>
   </div>}
  <p className="sparks-transfer-footnote">การโอนสำเร็จจะแสดงทั้งใน History ของผู้ส่งและผู้รับ และไม่เพิ่มแต้มที่สร้างใหม่ในระบบ</p>
 </section>;
}
