import React,{useEffect,useState} from "react";
const KNOWN=[
 {id:"daily-checkin-nov-2026",group:"Quest",name:"Daily Check-in",note:"9–22 พ.ย. 2026 · 50 Sparks/วัน"},
 {id:"profile-makeover-2026",group:"Quest",name:"Profile Makeover",note:"+150 Sparks อัตโนมัติ · ถึง 15 ธ.ค. 2026"},
 {id:"typing-relief",group:"Reward",name:"Typing Relief",note:"150 Sparks · ลดคำพิมพ์ 60%"},
 {id:"truemoney-20",group:"Reward",name:"TrueMoney 20 บาท",note:"7,000 Sparks · Item ใช้ได้ 30 วัน"},
] as const;
type Catalog=Record<string,boolean>;
export default function SparksCatalogManagement({username,sessionId}:{username:string;sessionId:string}){
 const [config,setConfig]=useState<Catalog>({}),[loading,setLoading]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [pending,setPending]=useState<{id:string;enabled:boolean}|null>(null),[reason,setReason]=useState("");
 const [saving,setSaving]=useState(false);
 const request=async(action:string,extra:Record<string,unknown>={})=>{
  const res=await fetch("/api/sparks-admin",{method:"POST",cache:"no-store",headers:{"content-type":"application/json"},
   body:JSON.stringify({action,actorUsername:username,sessionId,...extra})});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(String(data.error||"จัดการ Quest/Reward ไม่สำเร็จ"));
  return data;
 };
 const reload=async()=>{
  setLoading(true);try{const data=await request("admin-sparks-catalog");setConfig(data.items||{});setError("")}
  catch(e){setError(e instanceof Error?e.message:"โหลดข้อมูลไม่ได้")}finally{setLoading(false)}
 };
 useEffect(()=>{void reload()},[username,sessionId]);
 const save=async()=>{
  if(!pending||saving||reason.trim().length<5)return;
  setSaving(true);setError("");setNotice("");
  try{const r=await request("update-sparks-catalog",{catalogItem:pending.id,enabled:pending.enabled,reason:reason.trim()});
   setConfig(r.items||{});setPending(null);setReason("");
   setNotice("บันทึกสถานะ Quest/Reward แล้ว");
   window.dispatchEvent(new Event("qa:catalog-updated"));
  }catch(e){setError(e instanceof Error?e.message:"ไม่สามารถเปลี่ยนสถานะได้")}
  finally{setSaving(false)}
 };
 return <section className="qa-sparks-admin-catalog" aria-label="Quest and Reward Management">
  <div className="qa-sparks-inventory-heading"><h2>Quest / Reward Management</h2>
   <button type="button" disabled={loading||saving} onClick={()=>void reload()}>รีเฟรช</button></div>
  <p>เปิดหรือพักกิจกรรมและ Item ที่ประกาศแล้ว การหยุดแลกใหม่ไม่กระทบ Item ที่สมาชิกซื้อไว้หรือคำขอรอโอน</p>
  {error?<div className="qa-sparks-reward-detail-error" role="alert">{error}</div>:null}
  {notice?<div className="qa-sparks-reward-detail-success" role="status">{notice}</div>:null}
  {loading?<p role="status">กำลังโหลด Catalog...</p>:null}
  <div className="qa-sparks-catalog-grid">{KNOWN.map(item=><article className="qa-sparks-catalog-entry" key={item.id}>
   <span className="qa-sparks-catalog-group">{item.group}</span><strong>{item.name}</strong><small>{item.note}</small>
   <div className="qa-sparks-catalog-toggle"><span className={"qa-sparks-item-status "+(config[item.id]===false?"expired":"available")}>{config[item.id]===false?"พักรับชั่วคราว":"เปิดใช้งาน"}</span>
    <button type="button" disabled={loading||saving||!Object.hasOwn(config,item.id)} onClick={()=>{setError("");setNotice("");setPending({id:item.id,enabled:config[item.id]===false});setReason("")}}>
     {config[item.id]===false?"เปิดอีกครั้ง":"พักรับชั่วคราว"}</button>
   </div>
  </article>)}</div>
  <p className="qa-sparks-catalog-foot">การเพิ่ม Quest หรือ Item ประเภทใหม่ต้องกำหนดเงื่อนไขรางวัลและการตรวจสอบก่อนเปิดใช้งาน เพื่อป้องกันการแจก Sparks ผิดพลาด</p>
  {pending?<div className="qa-sparks-admin-overlay" role="presentation"><section className="qa-sparks-admin-dialog" role="dialog" aria-modal="true" aria-labelledby="qa-catalog-confirm-title">
   <h2 id="qa-catalog-confirm-title">ยืนยันเปลี่ยนสถานะ Quest / Reward</h2>
   <p><strong>{KNOWN.find(x=>x.id===pending.id)?.name}</strong> → {pending.enabled?"เปิดรับ":"พักรับชั่วคราว"}</p>
   <label htmlFor="qa-catalog-reason">เหตุผลการเปลี่ยนสถานะ</label>
   <textarea id="qa-catalog-reason" rows={3} maxLength={250} value={reason} onChange={e=>setReason(e.target.value)} placeholder="ระบุเหตุผลอย่างน้อย 5 ตัวอักษร"/>
   <div className="qa-sparks-admin-actions">
    <button type="button" className="secondary" onClick={()=>setPending(null)} disabled={saving}>ยกเลิก</button>
    <button type="button" disabled={saving||reason.trim().length<5} onClick={()=>void save()}>{saving?"กำลังบันทึก":"ยืนยันเปลี่ยนสถานะ"}</button>
   </div>
  </section></div>:null}
 </section>;
}
