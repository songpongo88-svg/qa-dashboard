import React,{useEffect,useState} from "react";
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
  const owned=state?.boostOwned||0;
  if(mode==="inventory"&&(!state||owned<1))return null;
  const buy=async()=>{
    if(busy||!state||state.boostBoughtToday>=2)return;
    setBusy(true);setError("");setNotice("");
    try{const data=await request("mining-boost-buy");setState(previous=>previous?{...previous,boostOwned:data.owned,boostBoughtToday:data.boughtToday}:null);
      setNotice("ซื้อ Item สำเร็จ · เก็บไว้ใน My Items แล้ว");window.dispatchEvent(new Event("qa:sparks-updated"));}
    catch(e){setError(e instanceof Error?e.message:"ซื้อ Item ไม่สำเร็จ");}
    finally{setBusy(false);}
  };
  return <>
    <button type="button" className="qa-sparks-mini-item qa-mining-boost-card" data-reward-item="mining-lucky-boost"
      onClick={()=>setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
      <span className="qa-sparks-mini-art" style={{display:"grid",placeItems:"center",background:"linear-gradient(135deg,#f4e5ff,#dab7f5)"}}>
        <svg viewBox="0 0 160 125" width="100%" height="100%" role="img" aria-label="อุปกรณ์ขุดแร่ทองคำกับคริสตัลสีม่วง">
          <path d="M35 109L95 23" stroke="#9e572d" strokeWidth="13" strokeLinecap="round"/>
          <path d="M31 47Q78 -3 132 41L98 35Q69 27 42 63Z" fill="#e4bd51" stroke="#a5781b" strokeWidth="4"/>
          <path d="M106 97l22-39 22 39-22 20Z" fill="#8643d3" stroke="#d9b6ff" strokeWidth="4"/>
          <path d="M115 89l13-31 7 31-7 28Z" fill="#c9a1ff"/>
          <circle cx="129" cy="27" r="18" fill="#ffe3a0"/><text x="129" y="32" textAnchor="middle" fontSize="14" fill="#6d3c00" fontWeight="900">+</text>
        </svg>
        {mode==="inventory"?<span className="qa-sparks-mini-quantity">×{owned}</span>:null}
      </span>
      <strong className="qa-sparks-mini-name">Mining Lucky Boost +40%</strong>
      <span className="qa-sparks-mini-value">{mode==="inventory"?owned+" ชิ้น":<span className="qa-sparks-shop-price"><strong>25 Sparks</strong><small>ซื้อได้ 2 ครั้ง/วัน</small></span>}</span>
    </button>
    {open?<div className="qa-sparks-reward-detail-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false);}}>
      <section className="qa-sparks-reward-detail-modal" role="dialog" aria-modal="true" aria-label="Mining Lucky Boost +40%">
        <button type="button" className="qa-sparks-reward-detail-close" onClick={()=>setOpen(false)} aria-label="ปิด">×</button>
        <div className="qa-sparks-reward-detail-heading"><h2>Mining Lucky Boost +40%</h2></div>
        <div className="qa-sparks-reward-detail-scroll" style={{padding:20}}>
          <p>เพิ่มโอกาสพบรางวัลเหมืองแร่ระดับสูง (301–1,500 Sparks) อีก 40% จากโอกาสเดิม ไม่ใช่เพิ่มจำนวน Sparks ที่ได้รับ</p>
          <p>ราคา 25 Sparks / ชิ้น · ซื้อครั้งละ 1 ชิ้น · สูงสุด 2 ครั้ง/วัน (เวลาไทย) · สะสมได้ไม่จำกัด · ไม่มีวันหมดอายุ</p>
          <p>คงสิทธิ์ขุดเหมืองวันละ 1 ครั้ง เวลา 14:00–16:00 น. เลือกเปิดใช้ก่อนขุดและใช้ได้ 1 ชิ้นต่อการขุด 1 ครั้ง</p>
          <p>คงเหลือใน My Items: <strong>{owned} ชิ้น</strong> · วันนี้ซื้อแล้ว <strong>{state?.boostBoughtToday??"—"}/2 ครั้ง</strong></p>
          {error?<p role="alert" className="qa-sparks-reward-detail-error">{error}</p>:null}
          {notice?<p role="status" className="qa-sparks-reward-detail-success">{notice}</p>:null}
        </div>
        {mode==="reward"?<div className="qa-sparks-reward-detail-action">
          <button className="qa-sparks-reward-detail-primary" type="button" disabled={busy||!state||state.boostBoughtToday>=2} onClick={()=>void buy()}>
            {busy?"กำลังซื้อ...":state&&state.boostBoughtToday>=2?"ซื้อครบ 2 ครั้งวันนี้แล้ว":"ซื้อ 25 Sparks"}
          </button></div>:null}
      </section>
    </div>:null}
  </>;
}
