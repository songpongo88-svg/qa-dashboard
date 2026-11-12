import React,{useCallback,useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {classifyTrueMoneyItem,type ItemShelfFilter} from "./qaSparksItemStatus";

export const TRUE_MONEY_REWARD={id:"truemoney-20-thb",price:10000,value:20,validDays:30,paymentBusinessDays:14} as const;
type Item={itemId:string;rewardId:string;status:"unused"|"requested";redeemedAt:string;expiresAt:string;valueTHB:number;requestedAt?:string;requestId?:string};
type Request={requestId:string;itemId:string;status:string;dueDate:string;createdAt:string;amountTHB:number;phoneMasked:string;payoutConfirmedAt?:string};
type Detail={items:Item[];requests:Request[]};
type Props={username:string;sessionId:string;balance:number;loaded:boolean;mode:"reward"|"inventory";hasOtherItems?:boolean;inventoryFilter?:ItemShelfFilter};
function date(value:string){
  const parsed=new Date(value);
  return Number.isFinite(parsed.getTime())?parsed.toLocaleString("th-TH",{
    timeZone:"Asia/Bangkok",year:"numeric",month:"short",day:"numeric",
    hour:"2-digit",minute:"2-digit",hour12:false,
  }):"—";
}
function dueDate(value:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value||""))return "—";
  const parsed=new Date(value+"T12:00:00Z");
  return parsed.toLocaleDateString("th-TH",{
    timeZone:"Asia/Bangkok",day:"numeric",month:"long",year:"numeric",
  });
}
function MoneyArt(){
  return <img src="/rewards/truemoney-20.webp" alt="TrueMoney Wallet 20 THB" className="qa-money-art-svg" loading="lazy"/>;
}
async function api(action:string,actorUsername:string,sessionId:string,extra:Record<string,unknown>={}){
  const response=await fetch("/api/sparks-admin",{
    method:"POST",headers:{"content-type":"application/json"},cache:"no-store",
    body:JSON.stringify({action,actorUsername,sessionId,...extra}),
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok) {
    const raw=String(body.error||"");
    const technical=/Firestore|Firebase|RESOURCE_EXHAUSTED|quota|read.?limit|Google Cloud|database|service.account|unauthenticated/i.test(raw);
    throw new Error(technical ? "ระบบรางวัลไม่พร้อมใช้งานชั่วคราว กรุณาลองอีกครั้งภายหลัง" : raw || "ไม่สามารถทำรายการ TrueMoney ได้");
  }
  return body;
}
function RewardCard({open,price}:{open:()=>void;price:number}){
  return <button type="button" className="qa-sparks-mini-item qa-sparks-mini-item--money" data-reward-item="truemoney-20" style={{order:-price}} onClick={open}
    aria-haspopup="dialog" aria-label={"ดูรายละเอียด TrueMoney 20 บาท ราคา "+price.toLocaleString("en-US")+" Sparks"}>
    <span className="qa-sparks-mini-art qa-sparks-mini-art--money"><MoneyArt/></span>
    <strong className="qa-sparks-mini-name">TrueMoney 20 ฿</strong>
    <span className="qa-sparks-mini-value qa-sparks-shop-price"><strong>{price.toLocaleString("en-US")} Sparks</strong></span>
  </button>;
}
export default function TrueMoneyReward({username,sessionId,balance,loaded,mode,hasOtherItems=false,inventoryFilter="available"}:Props){
  const [open,setOpen]=useState(false);
  const [price,setPrice]=useState<number>(TRUE_MONEY_REWARD.price);
  const [priceReady,setPriceReady]=useState(mode!=="reward");
  const [items,setItems]=useState<Item[]>([]);
  const [requests,setRequests]=useState<Request[]>([]);
  const [inventoryLoaded,setInventoryLoaded]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [confirm,setConfirm]=useState(false);
  const [selected,setSelected]=useState("");
  const [phone,setPhone]=useState("");
  const [balanceAfter,setBalanceAfter]=useState<number|null>(null);
  const requestId=useRef("");
  const closeRef=useRef<HTMLButtonElement>(null);
  const themeRef=useRef<HTMLDivElement>(null);
  const [theme,setTheme]=useState("#8a4398");
  const effectiveBalance=balanceAfter??balance;
  const detailItem=items.find(item=>item.itemId===selected);
  const detailRequest=requests.find(row=>row.itemId===selected);
  const detailExpired=detailItem ? Date.parse(detailItem.expiresAt)<=Date.now() : false;
  const canUseSelected=Boolean(detailItem && detailItem.status==="unused" && !detailExpired);
  useEffect(()=>{if(balanceAfter!==null&&balance===balanceAfter)setBalanceAfter(null);},[balance,balanceAfter]);
  const refreshPrice=useCallback(async()=>{
    if(!username||!sessionId)return;
    const result:{price:number}=await api("get-truemoney-price",username,sessionId);
    if(!Number.isSafeInteger(result.price)||result.price<1)throw new Error("ไม่สามารถตรวจสอบราคารางวัลได้");
    setPrice(result.price);setPriceReady(true);
  },[username,sessionId]);
  useEffect(()=>{
    if(mode!=="reward")return;
    setPriceReady(false);
    void refreshPrice().catch(e=>setError(String(e?.message||e)));
    const changed=()=>{setPriceReady(false);void refreshPrice().catch(e=>setError(String(e?.message||e)));};
    window.addEventListener("qa:truemoney-price-updated",changed);
    return()=>window.removeEventListener("qa:truemoney-price-updated",changed);
  },[mode,refreshPrice]);
  const refresh=useCallback(async()=>{
    if(!username||!sessionId)return;
    const result:Detail=await api("list-my-truemoney",username,sessionId);
    setItems(result.items||[]);setRequests(result.requests||[]);
    setInventoryLoaded(true);
  },[username,sessionId]);
  useEffect(()=>{setItems([]);setRequests([]);setInventoryLoaded(false);setBalanceAfter(null);requestId.current="";},[username]);
  useEffect(()=>{
    if(mode!=="inventory")return;
    const reload=()=>{void refresh().catch(e=>setError(String(e?.message||e)));};
    reload();
    window.addEventListener("qa:sparks-items-refresh",reload);
    return()=>window.removeEventListener("qa:sparks-items-refresh",reload);
  },[mode,refresh]);
  useEffect(()=>{
    if(!open)return;
    const old=document.body.style.overflow;document.body.style.overflow="hidden";
    closeRef.current?.focus();
    const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!busy)setOpen(false);};
    document.addEventListener("keydown",onKey);
    return()=>{document.body.style.overflow=old;document.removeEventListener("keydown",onKey);};
  },[open,busy]);
  const show=()=>{
    setOpen(true);setError("");setNotice("");setConfirm(false);
    if(mode==="reward"){setPriceReady(false);void refreshPrice().catch(e=>setError(String(e?.message||e)));}
    if(themeRef.current){
      const values=window.getComputedStyle(themeRef.current);
      setTheme(values.getPropertyValue("--sparks-accent").trim()||"#8a4398");
    }
  };
  const buy=async()=>{
    if(!loaded||!priceReady||effectiveBalance<price||busy)return;
    setBusy(true);setError("");
    try{
      if(!requestId.current)requestId.current=crypto.randomUUID();
      const result=await api("redeem-truemoney",username,sessionId,{requestId:requestId.current,expectedPrice:price});
      requestId.current="";
      setBalanceAfter(result.balance);
      setConfirm(false);
      setNotice("แลกสำเร็จ! Item TrueMoney 20 บาทถูกเก็บไว้ใน My Items แล้ว อายุ 30 วันนับจากเวลาแลก");
      await refresh();window.dispatchEvent(new Event("qa:sparks-updated"));
    }catch(e){setError(e instanceof Error?e.message:"แลกไม่สำเร็จ");setPriceReady(false);void refreshPrice().catch(()=>{});}
    finally{setBusy(false);}
  };
  const useItem=async()=>{
    if(!selected||!/^0\d{9}$/.test(phone)||busy)return;
    setBusy(true);setError("");
    try{
      const result=await api("use-truemoney-item",username,sessionId,{itemId:selected,phone});
      setSelected("");setPhone("");
      setNotice("ส่งคำขอสำเร็จ · รับเงินภายในวันที่ "+dueDate(result.dueDate)+" (นับ 14 วันทำการ ไม่รวมเสาร์–อาทิตย์)");
      await refresh();window.dispatchEvent(new Event("qa:sparks-updated"));
    }catch(e){setError(e instanceof Error?e.message:"ส่งคำขอไม่สำเร็จ");}
    finally{setBusy(false);}
  };
  const renderInventory=()=>{
    if (!loaded || !inventoryLoaded) return error ? null : <p className="qa-sparks-inventory-progress" role="status">กำลังโหลด Item ของคุณ...</p>;
    if (items.length===0) {
      return !hasOtherItems && !error ? <div className="qa-sparks-inventory-empty" data-items-empty="true">
        <strong>ยังไม่มี Item ในคลัง</strong><span>Item ที่แลกจาก Reward Center จะปรากฏที่นี่</span>
      </div> : null;
    }
    const now=Date.now();
    return items.filter(item=>classifyTrueMoneyItem(item,requests.find(row=>row.itemId===item.itemId))===inventoryFilter).map(item=>{
      const expired=Date.parse(item.expiresAt)<=now;
      const request=requests.find(row=>row.itemId===item.itemId);
      const status=request?.status==="paid"?"โอนสำเร็จ":item.status==="requested"?"รอโอนเงิน":expired?"หมดอายุ":"พร้อมใช้";
      return <button type="button" className="qa-sparks-mini-item qa-sparks-mini-item--money qa-sparks-inventory-item"
        data-owned-item={item.itemId} key={item.itemId} aria-haspopup="dialog"
        aria-label={"เปิด TrueMoney 20 บาท " + status + " หมดอายุ " + date(item.expiresAt)}
        onClick={()=>{setSelected(item.itemId);setPhone("");show();}}>
        <span className="qa-sparks-mini-art qa-sparks-mini-art--money">
          <MoneyArt/><span className="qa-sparks-mini-quantity">×1</span>
        </span>
        <strong className="qa-sparks-mini-name">TrueMoney 20 ฿</strong>
        <span className={"qa-sparks-mini-value" + (expired ? " is-expired" : "")}>{status}</span>
      </button>;
    });
  };
  return <div ref={themeRef} className={"qa-money-reward-root" + (mode==="inventory" ? " qa-money-reward-root--inventory" : "")}>
    {mode==="reward"?<RewardCard open={show} price={price}/>:renderInventory()}
    {error&&!open?<p role="alert" className="qa-money-error">{error}</p>:null}
    {open&&typeof document!=="undefined"?createPortal(
      <div className="qa-money-modal-backdrop" style={{"--sparks-accent":theme} as React.CSSProperties}
        onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setOpen(false);}}>
        <section className="qa-money-modal" role="dialog" aria-modal="true" aria-labelledby="qa-money-title">
          <button type="button" ref={closeRef} className="qa-money-modal-close" onClick={()=>setOpen(false)} disabled={busy} aria-label="ปิดรายละเอียด">×</button>
          <div className="qa-money-modal-hero"><MoneyArt/><div><small>QA SPARKS DIGITAL REWARD</small><h2 id="qa-money-title">TrueMoney 20 THB</h2><p>{mode==="reward"?"เปลี่ยน Sparks เป็นสิทธิ์รับเงิน TrueMoney 20 บาท":"รายละเอียดและวิธีใช้สิทธิ์ TrueMoney ของคุณ"}</p></div></div>
          <div className="qa-money-modal-content">
            <div className="qa-money-modal-stats"><span>{price.toLocaleString("en-US")} Sparks / Item</span><span>อายุ 30 วัน</span><span>รับเงินใน 14 วันทำการ</span></div>
            {mode==="reward"?<section className="qa-money-product-detail" data-reward-description="product">
              <small>QA SPARKS EXCLUSIVE REWARD</small>
              <h3>รับเครดิต TrueMoney มูลค่า 20 บาท</h3>
              <p>นำคะแนน QA Sparks ที่สะสมมาแลกเป็นสิทธิ์รับเงิน TrueMoney Wallet มูลค่า 20 บาท</p>
              <div className="qa-money-product-specs">
                <span><small>มูลค่าสิทธิพิเศษ</small><strong>20 บาท</strong></span>
                <span><small>คะแนนที่ใช้แลก</small><strong>{price.toLocaleString("en-US")} Sparks</strong></span>
              </div>
              <p className="qa-money-product-terms">Item มีอายุ 30 วันหลังแลก · ส่งคำขอรับเงินผ่าน My Items · ดำเนินการภายใน 14 วันทำการนับจากวันที่ส่งคำขอ</p>
            </section>:<section className="qa-money-product-guide" aria-label="วิธีใช้งาน TrueMoney Item">
              <h3>วิธีใช้งาน Item</h3>
              <ol>
                <li>เลือก Item TrueMoney ที่แลกไว้ใน My Items และกดใช้ก่อนหมดอายุ 30 วัน</li>
                <li>กรอกหมายเลขโทรศัพท์ TrueMoney 10 หลักให้ถูกต้อง</li>
                <li>ยืนยันส่งคำขอ และตรวจวันกำหนดรับเงินใน My Items</li>
                <li>เมื่อ Admin โอนเงินจริงแล้ว สถานะคำขอจะเปลี่ยนเป็นโอนแล้ว (ภายใน 14 วันทำการหลังส่งคำขอ)</li>
              </ol>
              <p>Item ใช้ได้เพียงครั้งเดียวและมีวันหมดอายุแยกกัน หากส่งคำขอก่อนหมดอายุ คำขอจะดำเนินการต่อจนเสร็จสิ้น</p>
            </section>}
            {selected && detailItem ? <div className="qa-money-modal-claim">
              <h3>Item ของคุณ · TrueMoney 20 บาท</h3>
              <p>แลกเมื่อ: {date(detailItem.redeemedAt)}</p>
              <p>หมดอายุ: {date(detailItem.expiresAt)}</p>
              {detailRequest ? <div className="qa-money-item-status-detail"><strong>{detailRequest.status==="paid"?"โอนเงินสำเร็จ":"รอโอนเงิน"}</strong>
                <p>หมายเลขรับเงิน: {detailRequest.phoneMasked}</p>
                <p>กำหนดได้รับเงินภายใน: {dueDate(detailRequest.dueDate)}</p>
              </div> : null}
              {canUseSelected ? <>
                <label htmlFor="qa-money-phone">หมายเลขโทรศัพท์ TrueMoney (10 หลัก)</label>
                <input id="qa-money-phone" type="tel" inputMode="numeric" maxLength={10} value={phone}
                  onChange={e=>setPhone(e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="0XXXXXXXXX"/>
                <p>ตรวจสอบหมายเลขให้ถูกต้องก่อนส่งคำขอ Item นี้ใช้งานได้ครั้งเดียว</p>
                <div className="qa-money-action-row"><button type="button" onClick={()=>{setSelected("");setOpen(false);}}>กลับไป My Items</button>
                  <button type="button" disabled={!/^0\d{9}$/.test(phone)||busy} onClick={()=>void useItem()}>{busy?"กำลังส่ง...":"ยืนยันส่งคำขอ"}</button></div>
              </> : !detailRequest ? <p>Item นี้หมดอายุแล้ว ไม่สามารถใช้งานได้</p> : null}
            </div> : mode === "inventory" ? null : <div className="qa-money-modal-claim">
              <h3>แลกรับ Item</h3><p>ยอด Sparks: {loaded?effectiveBalance.toLocaleString():"—"}</p>
              {confirm?<><p>ยืนยันใช้ {price.toLocaleString("en-US")} Sparks เพื่อรับ Item TrueMoney 20 บาท?</p><div className="qa-money-action-row"><button type="button" onClick={()=>setConfirm(false)}>กลับ</button><button type="button" disabled={busy||!loaded||!priceReady||effectiveBalance<price} onClick={()=>void buy()}>{busy?"กำลังแลก...":"ยืนยันแลก "+price.toLocaleString("en-US")+" Sparks"}</button></div></>:<button type="button" disabled={!loaded||!priceReady||effectiveBalance<price} onClick={()=>setConfirm(true)}>{!priceReady?"กำลังตรวจสอบราคา...":effectiveBalance<price?"Sparks ไม่เพียงพอ":"แลก 1 Item · "+price.toLocaleString("en-US")+" Sparks"}</button>}
            </div>}
            {notice?<p className="qa-money-success" role="status">{notice}</p>:null}
            {error?<p className="qa-money-error" role="alert">{error}</p>:null}
          </div>
        </section>
      </div>,document.body):null}
  </div>;
}
