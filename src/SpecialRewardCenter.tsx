import React,{useCallback,useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {classifySpecialRewardItem,type ItemShelfFilter} from "./qaSparksItemStatus";
import "./specialRewards.css";
import ReceiptClaimForm from "./ReceiptClaimForm";

export type SpecialReward={id:string;title:string;brand:string;price:number;maxTHB:number;type:"receipt"|"email";monthlyLimit:number};
type Item={itemId:string;rewardId:string;title:string;price:number;status:string;redeemedAt:string;expiresAt:string;activatedAt:string;submittedAt?:string};
const REWARDS:SpecialReward[]=[
 {id:"punthai-65",title:"เครื่องดื่มพันธุ์ไทย",brand:"Punthai Coffee",price:6500,maxTHB:65,type:"receipt",monthlyLimit:1},
 {id:"netflix-1m",title:"Netflix 1 เดือน",brand:"Netflix",price:15000,maxTHB:0,type:"email",monthlyLimit:1},
 {id:"amazon-55",title:"เครื่องดื่ม Café Amazon",brand:"Café Amazon",price:8000,maxTHB:55,type:"receipt",monthlyLimit:1},
 {id:"seven-100",title:"ซื้อสินค้าที่ 7-Eleven",brand:"7-Eleven",price:20000,maxTHB:100,type:"receipt",monthlyLimit:1}
];
const PRODUCT_COPY:Record<string,{headline:string;description:string;benefit:string;terms:string}>={
 "punthai-65":{
   headline:"เติมความสดชื่นกับพันธุ์ไทย",
   description:"ให้ทุกวันมีเมนูแก้วโปรดมากขึ้น เปลี่ยน QA Sparks เป็นสิทธิ์รับเงินคืนสำหรับเครื่องดื่มจากพันธุ์ไทย",
   benefit:"คืนเงินตามยอดซื้อจริง สูงสุด 65 บาท",
   terms:"สำหรับเครื่องดื่มพันธุ์ไทย จำกัด 1 สิทธิ์ต่อเดือน"
 },
 "netflix-1m":{
   headline:"สนุกกับความบันเทิงบน Netflix",
   description:"เปลี่ยน Sparks ที่สะสมเป็นสิทธิ์รับชม Netflix นาน 1 เดือน สำหรับอีเมลที่เข้าเงื่อนไข",
   benefit:"สิทธิ์ใช้งาน Netflix นาน 1 เดือน",
   terms:"จำกัด 1 สิทธิ์ต่อเดือน เฉพาะอีเมลที่ไม่เคยถูกเรียกเก็บค่าสมาชิกมาก่อน"
 },
 "amazon-55":{
   headline:"เติมพลังกับ Café Amazon",
   description:"ใช้ Sparks แลกรับสิทธิ์คืนเงินสำหรับเครื่องดื่ม Café Amazon แก้วโปรด เลือกความสดชื่นในสไตล์ของคุณ",
   benefit:"คืนเงินตามยอดซื้อจริง สูงสุด 55 บาท",
   terms:"สำหรับเครื่องดื่ม Café Amazon จำกัด 1 สิทธิ์ต่อเดือน"
 },
 "seven-100":{
   headline:"ช้อปของโปรดที่ 7-Eleven",
   description:"เปลี่ยน Sparks เป็นสิทธิ์รับเงินคืนสำหรับการซื้อสินค้าที่ 7-Eleven จะของกินหรือของใช้ก็เลือกได้",
   benefit:"คืนเงินตามยอดซื้อจริง สูงสุด 100 บาท",
   terms:"สำหรับการซื้อสินค้าที่ 7-Eleven จำกัด 1 สิทธิ์ต่อเดือน"
 }
};
const LOGOS:Record<string,string>={
 "punthai-65":"https://cdn-th.orstatic.com/userphoto/doorphoto/8/6KY/01AT4G1C7FE17C3D8DC3B9px.jpg",
 "netflix-1m":"https://cdn.jsdelivr.net/npm/simple-icons@14.15.0/icons/netflix.svg",
 "amazon-55":"https://cdn-th.orstatic.com/userphoto/doorphoto/8/6L7/01AURF1DBC7D745270820Elv.jpg",
 "seven-100":"https://mpics.mgronline.com/pics/Images/567000007860201.JPEG"
};
const fmt=(v:number)=>Number(v||0).toLocaleString("th-TH");
const date=(v:string)=>v?new Date(v).toLocaleString("th-TH",{timeZone:"Asia/Bangkok",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
const expired=(item:Item)=>Boolean(item?.expiresAt&&Date.now()>=Date.parse(item.expiresAt));
function RewardImage({id}:{id:string}){
 const [failed,setFailed]=useState(false);
 return <span className={"sr-logo sr-logo--"+id}>
   {!failed?<img src={LOGOS[id]} alt={REWARDS.find(x=>x.id===id)?.brand||""} loading="lazy" onError={()=>setFailed(true)}/>:<span>{REWARDS.find(x=>x.id===id)?.brand||"QA Sparks"}</span>}
 </span>;
}
const statusText=(i:Item)=>i.status==="unused"?(expired(i)?"หมดอายุ":"พร้อมใช้")
  :i.status==="activated"?"รอส่งคำขอ"
  :i.status==="submitted"?"รอ Admin ตรวจสอบ"
  :i.status==="approved"?"อนุมัติแล้ว · รอดำเนินการ"
  :i.status==="paid"?"คืนเงินเรียบร้อย":i.status==="delivered"?"ส่งสิทธิ์แล้ว":i.status==="rejected"?"ไม่อนุมัติ":i.status;
function newRequestId(){return typeof crypto!=="undefined"&&typeof crypto.randomUUID==="function"
  ?crypto.randomUUID():"sr-"+Date.now()+"-"+Math.random().toString(36).slice(2);}
export default function SpecialRewardCenter({mode,username,sessionId,balance,loaded,hasOtherItems=false,inventoryFilter="available"}:{
 mode:"reward"|"inventory";username:string;sessionId:string;balance:number;loaded:boolean;hasOtherItems?:boolean;inventoryFilter?:ItemShelfFilter
}){
 const [items,setItems]=useState<Item[]>([]);
 const [inventoryLoaded,setInventoryLoaded]=useState(false);
 const [selectedReward,setSelectedReward]=useState<string|null>(null);
 const [selectedItem,setSelectedItem]=useState<string|null>(null);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [error,setError]=useState("");
 const [confirm,setConfirm]=useState(false);
 const [email,setEmail]=useState("");
 const [neverPaid,setNeverPaid]=useState(false);
 const requestId=useRef("");
 const panel=useRef<HTMLElement>(null);
 const closeRef=useRef<HTMLButtonElement>(null);
 const triggerRef=useRef<HTMLButtonElement|null>(null);
 const pending=useRef(false);pending.current=busy;
 const reward=REWARDS.find(r=>r.id===selectedReward);
 const item=items.find(i=>i.itemId===selectedItem)||null;
 const request=useCallback(async(action:string,extra:Record<string,unknown>={},signal?:AbortSignal)=>{
  const response=await fetch("/api/sparks-admin",{method:"POST",cache:"no-store",signal,
    headers:{"content-type":"application/json"},body:JSON.stringify({action,actorUsername:username,sessionId,...extra})});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(Error(String(body.error||"ไม่สามารถทำรายการได้")),{status:response.status});
  return body;
 },[username,sessionId]);
 const reload=useCallback(async()=>{
   const result=await request("special-rewards-mine");
   setItems(Array.isArray(result.items)?result.items:[]);setInventoryLoaded(true);
   return result;
 },[request]);
 useEffect(()=>{setItems([]);setInventoryLoaded(false);setSelectedReward(null);setSelectedItem(null);
  requestId.current="";},[username,sessionId]);
 useEffect(()=>{
   if(mode!=="inventory"||!loaded||!username||!sessionId)return;
   const update=()=>{setError("");void reload().catch(e=>setError(String(e.message||e)));};
   update();
   window.addEventListener("qa:sparks-items-refresh",update);
   return()=>window.removeEventListener("qa:sparks-items-refresh",update);
 },[mode,loaded,username,sessionId,reload]);
 const opened=Boolean(selectedReward);
 useEffect(()=>{
  if(!opened)return;
  const original=document.body.style.overflow;document.body.style.overflow="hidden";
  closeRef.current?.focus();
  const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!pending.current){setSelectedReward(null);setSelectedItem(null);}};
  document.addEventListener("keydown",onKey);
  return()=>{document.body.style.overflow=original;document.removeEventListener("keydown",onKey);triggerRef.current?.focus();};
 },[opened]);
 const open=(rewardId:string,itemId:string|null,event:React.MouseEvent<HTMLButtonElement>)=>{
   triggerRef.current=event.currentTarget;setSelectedReward(rewardId);setSelectedItem(itemId);
   setConfirm(false);setNotice("");setError("");setEmail("");setNeverPaid(false);requestId.current="";
 };
 const handle=async(action:string,extra:Record<string,unknown>={},signal?:AbortSignal)=>{
   setBusy(true);setError("");setNotice("");
   try{
     const response=await request(action,extra);
     await reload();
     if(action==="special-rewards-redeem"){setNotice("แลกสำเร็จ Item เพิ่มใน My Items แล้ว");setConfirm(false);}
     if(action==="special-rewards-activate")setNotice("กดใช้ Item แล้ว สามารถส่งข้อมูลรับสิทธิ์ได้");
     if(action==="special-rewards-submit")setNotice("ส่งคำขอให้ Admin ตรวจสอบเรียบร้อยแล้ว");
     // One explicit refresh per successful Item action, including 0-Sparks use.
     window.dispatchEvent(new CustomEvent("qa:sparks-updated"));
     return response;
   }catch(e){setError(e instanceof Error?e.message:"ทำรายการไม่สำเร็จ");return null;}
   finally{setBusy(false);}
 };
 const redeem=async()=>{
   if(!reward||busy)return;
   if(!requestId.current)requestId.current=newRequestId();
   await handle("special-rewards-redeem",{rewardId:reward.id,requestId:requestId.current});
 };
 const submit=async(e:React.FormEvent)=>{
   e.preventDefault();if(!reward||!item||busy)return;
   if(!neverPaid){setError("ต้องยืนยันเงื่อนไขอีเมล Netflix ก่อน");return;}
   await handle("special-rewards-submit",{itemId:item.itemId,email,neverPaid});
 };
 const display=mode==="inventory"?items.filter(i=>classifySpecialRewardItem(i)===inventoryFilter):[];
 return <>
  {mode==="reward"?REWARDS.slice().sort((a,b)=>b.price-a.price).map(r=><button key={r.id} type="button"
    className="qa-sparks-mini-item qa-sparks-mini-item--special" data-reward-item={r.id} style={{order:-r.price}}
    onClick={e=>open(r.id,null,e)}>
    <span className="qa-sparks-mini-art qa-sparks-mini-art--special"><RewardImage id={r.id}/></span>
    <strong className="qa-sparks-mini-name">{r.title}</strong>
    <span className="qa-sparks-mini-value qa-sparks-shop-price"><strong>{fmt(r.price)} Sparks</strong></span>
  </button>):<>
   {!inventoryLoaded&&loaded&&!error?<span role="status" className="qa-sparks-inventory-progress">กำลังโหลด Item...</span>:null}
   {error&&!opened?<span role="alert" className="sr-error">ไม่สามารถโหลด Item: {error}</span>:null}
   {display.map(i=><button key={i.itemId} type="button" className="qa-sparks-mini-item qa-sparks-mini-item--special"
      data-special-inventory-item={i.itemId} onClick={e=>open(i.rewardId,i.itemId,e)}>
      <span className="qa-sparks-mini-art qa-sparks-mini-art--special"><RewardImage id={i.rewardId}/><span className="qa-sparks-mini-quantity">×1</span></span>
      <strong className="qa-sparks-mini-name">{i.title}</strong>
      <span className="qa-sparks-mini-value">{statusText(i)}</span>
    </button>)}
   {inventoryLoaded&&display.length===0&&!hasOtherItems?<p className="sr-empty">ยังไม่มี Item ที่แลกไว้</p>:null}
  </>}
  {opened&&reward&&typeof document!=="undefined"?createPortal(
   <div className="sr-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy){setSelectedReward(null);setSelectedItem(null);}}}>
    <section className="sr-modal" ref={panel} role="dialog" aria-modal="true" aria-labelledby="sr-title">
     <button type="button" ref={closeRef} className="sr-close" disabled={busy} onClick={()=>{setSelectedReward(null);setSelectedItem(null);}}>×</button>
     <header className="sr-hero"><RewardImage id={reward.id}/><div>
      <small>QA SPARKS · REWARD CENTER</small><h2 id="sr-title">{reward.title}</h2>
      <p>{mode==="reward"?PRODUCT_COPY[reward.id].headline:reward.type==="email"?"สิทธิ์ใช้งาน Netflix 1 เดือน":"สิทธิ์คืนเงินสูงสุด "+reward.maxTHB+" บาท"}</p>
     </div></header>
     <div className="sr-body">
      {mode==="reward"?<div className="sr-product-detail" data-sr-reward-description="product">
        <div className="sr-product-promo">
          <span className="sr-product-label">QA SPARKS EXCLUSIVE REWARD</span>
          <h3>{PRODUCT_COPY[reward.id].headline}</h3>
          <p>{PRODUCT_COPY[reward.id].description}</p>
        </div>
        <div className="sr-facts sr-product-facts">
          <span><small>ใช้คะแนนแลก</small><strong>{fmt(reward.price)} <em>Sparks</em></strong></span>
          <span><small>มูลค่าสิทธิพิเศษ</small><strong>{reward.type==="email"?"1 เดือน":"฿"+fmt(reward.maxTHB)}</strong></span>
          <span><small>สิทธิ์แลกต่อเดือน</small><strong>1 <em>สิทธิ์</em></strong></span>
        </div>
        <div className="sr-product-overview">
          <h3>รายละเอียดรางวัล</h3>
          <p>{PRODUCT_COPY[reward.id].benefit}</p>
          <p>{PRODUCT_COPY[reward.id].terms}</p>
        </div>
        <div className="sr-product-conditions">
          <span><b>อายุ Item</b> 30 วันนับจากวันที่กดแลก</span>
          <span><b>การรับสิทธิ์</b> เข้า My Items หลังแลกสำเร็จ</span>
        </div>
      </div>:<section className="sr-item-guide" aria-label="วิธีใช้งาน Item">
        <h3>วิธีใช้งาน Item</h3>
        {reward.type==="receipt"?<ol>
          <li>กดใช้ Item ก่อนวันหมดอายุ</li>
          <li>ซื้อสินค้าของร้านที่เลือกหลังจากกดใช้ Item แล้ว และเก็บใบเสร็จ</li>
          <li>แนบภาพใบเสร็จให้ระบบอ่านเลขที่ วันเวลา และยอดสุทธิ ตรวจข้อมูลที่เติมให้ แล้วกรอกเบอร์พร้อมเพย์</li>
          <li>ส่งคำขอให้ Admin ตรวจสอบและดำเนินการคืนเงินตามยอดซื้อจริง สูงสุด {reward.maxTHB} บาท</li>
        </ol>:<ol>
          <li>กดใช้ Item ภายใน 30 วันนับจากวันที่แลก</li>
          <li>กรอกอีเมลที่จะใช้ดู Netflix ซึ่งต้องไม่เคยถูกเรียกเก็บค่าสมาชิกมาก่อน</li>
          <li>ส่งคำขอให้ Admin ตรวจสอบและจัดส่งสิทธิ์ใช้งาน 1 เดือน</li>
        </ol>}
        <p className="sr-hint">{reward.type==="receipt"?"ใบเสร็จต้องมีวันและเวลาตั้งแต่กดใช้ Item เป็นต้นไป และห้ามใช้เลขที่ใบเสร็จซ้ำ":"การตรวจสอบคุณสมบัติอีเมลและการจัดส่งสิทธิ์ดำเนินการโดย Admin"}</p>
      </section>}
      {item?<div className="sr-item-status"><strong>{statusText(item)}</strong><span>แลกเมื่อ {date(item.redeemedAt)}</span>
       <span>หมดอายุ {date(item.expiresAt)}</span>{item.activatedAt?<span>กดใช้เมื่อ {date(item.activatedAt)}</span>:null}</div>:null}
      {notice?<p className="sr-success" role="status">{notice}</p>:null}
      {error?<p className="sr-error" role="alert">{error}</p>:null}
      {mode==="reward"?<div className="sr-actions">
       {confirm?<><p>ยืนยันแลกรางวัลนี้ด้วย {fmt(reward.price)} Sparks ใช่หรือไม่?</p>
         <button type="button" onClick={()=>setConfirm(false)} disabled={busy}>กลับ</button>
         <button type="button" className="sr-primary" onClick={()=>void redeem()} disabled={!loaded||busy||balance<reward.price}>{busy?"กำลังบันทึก...":"ยืนยันแลก"}</button></>:
        <><span>คงเหลือ {fmt(balance)} Sparks</span><button type="button" className="sr-primary"
          disabled={!loaded||busy||balance<reward.price} onClick={()=>setConfirm(true)}>
          {balance<reward.price?"Sparks ไม่เพียงพอ":"แลกเป็น Item"}</button></>}</div>:null}
      {mode==="inventory"&&item?.status==="unused"&&!expired(item)?<button type="button"
       className="sr-primary sr-block" disabled={busy} onClick={()=>void handle("special-rewards-activate",{itemId:item.itemId})}>
       {busy?"กำลังบันทึก...":"กดใช้ Item"}</button>:null}
      {mode==="inventory"&&item?.status==="activated"?(reward.type==="receipt"?
       <ReceiptClaimForm key={username+":"+sessionId+":"+item.itemId} itemId={item.itemId} rewardId={reward.id}
        activatedAt={item.activatedAt} busy={busy} request={request} onBusyChange={setBusy}
        onSubmit={data=>handle("special-rewards-submit",{itemId:item.itemId,...data})}/>
       :<form className="sr-form" onSubmit={e=>void submit(e)}>
        <h3>ส่งข้อมูลเพื่อรับสิทธิ์</h3>
        <label>อีเมลสำหรับใช้งาน Netflix<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
        <label className="sr-checklabel"><input type="checkbox" checked={neverPaid} onChange={e=>setNeverPaid(e.target.checked)}/>
         ยืนยันว่าอีเมลนี้ไม่เคยเป็นสมาชิก Netflix แบบเรียกเก็บค่าบริการมาก่อน</label>
        <p className="sr-hint">ระบบไม่สามารถตรวจประวัติการชำระของ Netflix เองได้ Admin จะตรวจเงื่อนไขก่อนจัดส่งสิทธิ์</p>
        <button type="submit" className="sr-primary sr-block" disabled={busy||!neverPaid}>
         {busy?"กำลังส่ง...":"ส่งคำขอให้ Admin ตรวจสอบ"}</button>
       </form>):null}

     </div>
    </section>
   </div>,document.body):null}
 </>;
}
