import React,{useEffect,useState} from "react";
import {createPortal} from "react-dom";
import "./butterbearCard.css";
type State={owned:boolean;active:boolean;monthlyClaimed:boolean;balance:number;purchasedAt:string;expiresAt:string;forfeited:boolean;birthdayClaimedAt:string};
export function useButterbear(username?:string,sessionId?:string){
 const [state,setState]=useState<State|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 async function request(action:string,extra:Record<string,unknown>={}){
  const response=await fetch("/api/sparks-admin",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"content-type":"application/json"},body:JSON.stringify({action,actorUsername:username,sessionId,...extra})});
  const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||"ไม่สามารถดำเนินการได้");return result as State;
 }
 useEffect(()=>{let live=true;setState(null);if(!username||!sessionId)return;const load=()=>{void request("butterbear-state").then(r=>{if(live)setState(r)}).catch(()=>{});};load();window.addEventListener("qa:butterbear-updated",load);window.addEventListener("qa:sparks-card-updated",load);window.addEventListener("focus",load);const timer=window.setInterval(load,60000);return()=>{live=false;window.clearInterval(timer);window.removeEventListener("focus",load);window.removeEventListener("qa:sparks-card-updated",load);window.removeEventListener("qa:butterbear-updated",load)};},[username,sessionId]);
 async function run(action:string,extra:Record<string,unknown>={}){
  if(busy)return;setBusy(true);setMessage("");try{const r=await request(action,extra);setState(r);setMessage("ดำเนินการสำเร็จ");window.dispatchEvent(new Event("qa:butterbear-updated"));window.dispatchEvent(new Event("qa:sparks-updated"));}catch(e){setMessage(e instanceof Error?e.message:"ทำรายการไม่สำเร็จ");}finally{setBusy(false);}
 }
 return {state,busy,message,run};
}
export function BearArt(){return <img className="bb-art" src="/images/butterbear-member.webp" alt="" draggable={false}/>}
export const bbDate=(value:string)=>value?new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Bangkok",day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(value)):"—";
export function ButterbearMemberCard({tier,year,displayName,cardNumber,birthdayDate,onCopy,preview=false,expiresAt=""}:{tier:{level:number;name:string};year:number;displayName:string;cardNumber:string;birthdayDate:string;onCopy:()=>void;preview?:boolean;expiresAt?:string}){
 const dob=/^\d{4}-\d{2}-\d{2}$/.test(birthdayDate)?birthdayDate.slice(8)+"/"+birthdayDate.slice(5,7)+"/"+birthdayDate.slice(0,4):"";
 return <div className="bb-artwork-card" aria-label="Butterbear – Golden Bakery Edition">
  <img className="bb-full-artwork" src="/images/butterbear-golden-bakery-card.webp" alt="" draggable={false}/>
  <span className="bb-artwork-level">LV.{tier.level}</span>
  <span className="bb-artwork-tier">{tier.name}</span>
  <span className="bb-artwork-edition">Golden Bakery Edition</span>
  {preview?<span className="bb-artwork-number">{cardNumber}</span>:<button className="bb-artwork-number" type="button" disabled={!cardNumber} onClick={onCopy} aria-label="คัดลอกหมายเลขบัตรสมาชิก">{cardNumber||"—"}</button>}
  <span className="bb-artwork-holder" style={{fontSize:displayName.length>26?"2.45cqw":displayName.length>20?"2.9cqw":"3.35cqw"}}>{displayName}</span>
  <span className="bb-artwork-dob">{dob||"—"}</span>
  <span className="bb-artwork-expiry">{expiresAt?"EXPIRES "+bbDate(expiresAt):"MEMBER YEAR "+year}</span>
 </div>
}
export default function ButterbearShop({username,sessionId,balance,tier={level:1,name:"Spark Starter"},year=2026}:{username:string;sessionId?:string;balance:number;tier?:{level:number;name:string};year?:number}){
 const {state,busy,message,run}=useButterbear(username,sessionId);const [confirm,setConfirm]=useState(false);
 return <section className="bb-shop"><div className="bb-shop-preview"><ButterbearMemberCard tier={tier} year={year} displayName="MEMBER NAME" cardNumber="•••• •••• ••••" birthdayDate="" onCopy={()=>{}} expiresAt={state?.active?state.expiresAt:""} preview/><small>ตัวอย่างบัตรสมาชิก</small></div><div className="bb-shop-info"><small>SC-001 · SPECIAL MEMBERSHIP COLLECTION</small><h3>Butterbear – Golden Bakery Edition</h3>{!state?<p>กำลังตรวจสอบสิทธิ์บัตร</p>:state.owned?<><strong>{state.active?"กำลังใช้งาน":state.forfeited?"สิ้นสุดสิทธิ์บัตร":"บัตรหมดอายุ"}</strong><p>วันที่ออกบัตร {bbDate(state.purchasedAt)} · วันหมดอายุ {bbDate(state.expiresAt)}</p></>:<><div className="bb-shop-prices"><div><small>แลกซื้อ</small><b>1,600</b> Sparks</div><div><small>รับคืน</small><b>3,600</b> Sparks</div></div><strong className="bb-net">รับเพิ่มสุทธิ 2,000 Sparks</strong><p>โบนัสเช็กอินเพิ่ม 20/วัน · วันเกิดเพิ่ม 500 · รายเดือน 300 Sparks · ส่วนลดเพิ่ม 5% (รอเปิดใช้งาน)</p><p>ซื้อได้ครั้งเดียว · อายุ 1 ปี · เปลี่ยนบัตรทันที ไม่สามารถสลับกลับได้ระหว่างอายุบัตร</p>{confirm?<><p>ยืนยันเปลี่ยนบัตรสมาชิกและหัก 1,600 Sparks พร้อมรับคืน 3,600 Sparks?</p><button type="button" disabled={busy||balance<1600} onClick={()=>void run("butterbear-buy",{expectedPrice:1600})}>ยืนยันแลกซื้อบัตร</button><button type="button" disabled={busy} onClick={()=>setConfirm(false)}>ยกเลิก</button></>:<button type="button" disabled={busy||balance<1600} onClick={()=>setConfirm(true)}>แลกซื้อบัตรพิเศษ</button>}</>}{message&&<p role="status">{message}</p>}</div></section>
}

export function ButterbearRewardItem({username,sessionId,balance,tier,year}:{username:string;sessionId?:string;balance:number;tier:{level:number;name:string};year:number}){
 const {state}=useButterbear(username,sessionId);
 const [open,setOpen]=useState(false);
 useEffect(()=>{if(!open)return;const close=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(false)};window.addEventListener("keydown",close);return()=>window.removeEventListener("keydown",close)},[open]);
 return <>
 <button type="button" className="qa-sparks-mini-item bb-reward-item" data-reward-item="butterbear-special-card" style={{order:-1600}} aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}>
  <span className="qa-sparks-mini-art bb-reward-art"><ButterbearMemberCard tier={tier} year={year} displayName="MEMBER NAME" cardNumber="•••• •••• ••••" birthdayDate="" expiresAt={state?.active?state.expiresAt:""} onCopy={()=>{}} preview/></span>
  <strong className="qa-sparks-mini-name">Butterbear<br/>Golden Bakery Edition</strong>
  <span className="qa-sparks-mini-value">{state?.owned?<><small>บัตรสมาชิกพิเศษ</small><strong>{state.active?"กำลังใช้งาน":state.forfeited?"สิ้นสุดสิทธิ์":"หมดอายุ"}</strong>{state.active&&<small>ถึง {bbDate(state.expiresAt)}</small>}</>:state?<><small>ราคาแลก</small><strong>1,600 Sparks</strong></>:<small>กำลังตรวจสอบสิทธิ์</small>}</span>
  <span className="bb-reward-details">ดูรายละเอียด ›</span>
 </button>
 {open&&typeof document!=="undefined"?createPortal(<div className="qa-member-benefits-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}><section className="qa-member-benefits-dialog bb-reward-dialog" role="dialog" aria-modal="true" aria-label="รายละเอียดบัตร Butterbear"><header className="qa-member-benefits-header"><div><span className="qa-benefits-overline">SPECIAL MEMBERSHIP COLLECTION</span><h2>Butterbear – Golden Bakery Edition</h2></div><button type="button" className="qa-benefits-close" aria-label="ปิด" onClick={()=>setOpen(false)}>×</button></header><ButterbearShop username={username} sessionId={sessionId} balance={balance} tier={tier} year={year}/></section></div>,document.body):null}
 </>
}
