import React,{useEffect,useState} from "react";
import {createPortal} from "react-dom";
import MiningBoostArt from "./MiningBoostArt";
import "./miningBoost.css";
type State={boostOwned:number;boostBoughtToday:number;boostPrice:number};
export default function MiningBoostCard({username,sessionId,mode="reward"}:{username:string;sessionId:string;mode?:"reward"|"inventory"}){
  const [state,setState]=useState<State|null>(null),[open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const request=async(action:string)=>{
    const response=await fetch("/api/sparks-admin",{method:"POST",credentials:"same-origin",cache:"no-store",
      headers:{"content-type":"application/json"},body:JSON.stringify({action,actorUsername:username,sessionId})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(String(data.error||"ไม่สามารถดำเนินการได้"));
    return data;
  };
  const refresh=()=>{if(!username||!sessionId)return;void request("mining-state").then(data=>setState(data)).catch(()=>{});};
  useEffect(()=>{refresh();const listener=()=>refresh();window.addEventListener("qa:sparks-updated",listener);
    return()=>window.removeEventListener("qa:sparks-updated",listener);},[username,sessionId]);
  useEffect(()=>{if(!open)return;const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!busy)setOpen(false);};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);},[open,busy]);
  const owned=state?.boostOwned||0;
  if(mode==="inventory"&&(!state||owned<1))return null;
  const buy=async()=>{
    if(busy||!state||state.boostBoughtToday>=2)return;
    setBusy(true);setError("");setNotice("");
    try{
      const data=await request("mining-boost-buy");
      setState(previous=>previous?{...previous,boostOwned:data.owned,boostBoughtToday:data.boughtToday}:null);
      setNotice("ซื้อสำเร็จ! เพิ่ม Mining Lucky Boost 1 ชิ้นใน My Items แล้ว");
      window.dispatchEvent(new Event("qa:sparks-updated"));
    }catch(e){setError(e instanceof Error?e.message:"ซื้อ Item ไม่สำเร็จ");}
    finally{setBusy(false);}
  };
  return <>
    <button type="button" className="qa-sparks-mini-item qa-mb-card" data-reward-item="mining-lucky-boost" style={mode==="reward"?{order:-25}:undefined}
      onClick={()=>{setOpen(true);setError("");setNotice("");}} aria-haspopup="dialog" aria-expanded={open}>
      <span className="qa-sparks-mini-art"><MiningBoostArt/>{mode==="inventory"?<span className="qa-sparks-mini-quantity">×{owned}</span>:null}</span>
      <strong className="qa-sparks-mini-name">Mining Lucky Boost +40%</strong>
      <span className="qa-sparks-mini-value">{mode==="inventory"?owned+" ชิ้น":
        <span className="qa-sparks-shop-price"><strong className="qa-mb-price">25 Sparks</strong><small>ซื้อได้ 2 ครั้ง/วัน</small></span>}</span>
    </button>
    {open&&typeof document!=="undefined"?createPortal(
      <div className="qa-mb-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setOpen(false);}}>
        <section className="qa-mb-modal" role="dialog" aria-modal="true" aria-labelledby="qa-mb-title" aria-describedby="qa-mb-intro">
          <header className="qa-mb-hero">
            <div className="qa-mb-hero-art"><MiningBoostArt large/></div>
            <div className="qa-mb-hero-copy">
              <span className="qa-mb-eyebrow">ไอเทมพิเศษสำหรับเหมืองแร่</span>
              <h2 id="qa-mb-title">Mining Lucky Boost <span>+40%</span></h2>
              <p id="qa-mb-intro">เพิ่มโอกาสได้รับรางวัลมูลค่าสูงเมื่อขุดเหมืองแร่ โดยไม่เพิ่มจำนวนครั้งที่ขุด</p>
            </div>
            <button type="button" className="qa-mb-close" onClick={()=>setOpen(false)} aria-label="ปิดรายละเอียด">×</button>
          </header>
          <div className="qa-mb-scroll">
            <div className="qa-mb-columns">
              <section className="qa-mb-section">
                <h3>✦ ไอเทมนี้ช่วยอะไร?</h3>
                <p>เมื่อเปิดใช้ก่อนขุด ระบบจะเพิ่ม<strong>โอกาสสุ่มรางวัลระดับสูงอีก 40% จากโอกาสเดิม</strong> ไม่ใช่เพิ่ม Sparks ที่ได้รับ 40%</p>
                <div className="qa-mb-chance" aria-label="ตัวอย่างโอกาสเดิม 5 เปอร์เซ็นต์ เพิ่มเป็น 7 เปอร์เซ็นต์">
                  <div><small>โอกาสเดิม</small><strong>5%</strong></div>
                  <span className="qa-mb-arrow">➜</span>
                  <div><small>เมื่อใช้ไอเทม</small><strong>7%</strong></div>
                </div>
                <p className="qa-mb-tip">ตัวอย่างประกอบ: 5% × 1.40 = 7% ไม่รับประกันว่าจะได้รางวัลใหญ่</p>
              </section>
              <section className="qa-mb-section">
                <h3>✦ วิธีใช้งาน</h3>
                <div className="qa-mb-steps">
                  <div><b>1</b><span>ซื้อไอเทมจาก Reward Center และเก็บไว้ใน My Items</span></div>
                  <div><b>2</b><span>เข้าเหมืองแร่ช่วงเวลา 14:00–16:00 น.</span></div>
                  <div><b>3</b><span>เลือก “ใช้ Mining Lucky Boost” ก่อนกดขุด</span></div>
                  <div><b>4</b><span>ขุดสำเร็จจึงหักไอเทม 1 ชิ้น</span></div>
                </div>
              </section>
            </div>
            <div className="qa-mb-stats">
              <div className="qa-mb-stat"><span>ราคาไอเทม</span><strong>25 Sparks / ชิ้น</strong></div>
              <div className="qa-mb-stat"><span>ซื้อได้สูงสุด</span><strong>2 ครั้ง / วัน</strong></div>
              <div className="qa-mb-stat"><span>เวลาเปิดเหมือง</span><strong>14:00–16:00 น.</strong></div>
            </div>
            <ul className="qa-mb-rules">
              <li>ซื้อครั้งละ 1 ชิ้น รีเซ็ตสิทธิ์ซื้อเวลา 00:00 น. (เวลาไทย)</li>
              <li>สะสมไอเทมได้ไม่จำกัด และไม่มีวันหมดอายุ</li>
              <li>ใช้ได้ 1 ชิ้นต่อการขุด 1 ครั้ง ห้ามใช้ซ้อน</li>
              <li>ขุดได้วันละ 1 ครั้ง รางวัลปกติยังอยู่ที่ 1–1,500 Sparks</li>
              <li>Admin คืน 25 Sparks ได้เฉพาะไอเทมที่ยังไม่ได้ใช้</li>
            </ul>
            {notice?<div className="qa-mb-alert" role="status">{notice}</div>:null}
            {error?<div className="qa-mb-alert qa-mb-alert-error" role="alert">{error}</div>:null}
          </div>
          <footer className="qa-mb-footer">
            <div className="qa-mb-owned">
              <span>My Items <strong>{owned} ชิ้น</strong></span>
              <span>ซื้อวันนี้ <strong>{state?.boostBoughtToday??"—"}/2 ครั้ง</strong></span>
            </div>
            {mode==="reward"?<button type="button" className="qa-mb-buy" disabled={busy||!state||state.boostBoughtToday>=2} onClick={()=>void buy()}>
              {busy?"กำลังซื้อ...":state&&state.boostBoughtToday>=2?"ซื้อครบ 2 ครั้งแล้ว":"ซื้อไอเทม 25 Sparks"}
            </button>:<button className="qa-mb-buy" type="button" onClick={()=>setOpen(false)}>ปิดรายละเอียด</button>}
          </footer>
        </section>
      </div>,document.body):null}
  </>;
}
