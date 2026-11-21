import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SPARKS_MEMBER_LEVELS, SPARKS_TOP_LEVEL_POINTS, getSparksMemberLevel, type MemberLevel } from "./qaSparksMemberLevels";
import "./sparksMembership.css";

const finishes = ["Silver Minimal", "Emerald Trail", "Sapphire Motion", "Amethyst Facet", "Champagne Art Deco", "Ruby Silk", "Midnight Gold", "Copper Trophy", "Celestial Orbit", "Obsidian Prism"];
const number = (value: number) => value.toLocaleString("en-US");
const birthdayPoints=[50,75,100,150,200,300,400,500,750,1000];
const checkinBonus=[0,5,5,10,10,15,15,20,20,25];
function memberDiscount(level:number){return level>=9?10:level>=7?8:level>=5?5:level>=3?3:0;}
function localBangkokDate(){
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const find=(key:string)=>parts.find(part=>part.type===key)?.value||"";
  return find("year")+"-"+find("month")+"-"+find("day");
}


function MembershipSymbol({ level }: { level: number }) {
  const marks = [
    <path d="m12 2 2.7 6.7L22 12l-7.3 3.3L12 22l-2.7-6.7L2 12l7.3-3.3z"/>,
    <><circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6z"/></>,
    <><path d="m3 17 6-6 4 4 8-11M14 4h7v7"/></>,
    <><path d="m6 3-5 7 11 12L23 10l-5-7zM1 10h22M6 3l6 19 6-19"/></>,
    <><circle cx="12" cy="8" r="6"/><path d="m8 13-2 9 6-3 6 3-2-9"/></>,
    <path d="M12 2c1 5-5 6-5 11 0 2 1 3 2 4-4-1-5-4-5-6-3 10 13 17 16 5 1-5-3-7-3-11-1 3-2 4-3 4 0-3-1-5-2-7Z"/>,
    <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9-6.2-3.3-6.2 3.3 1.2-6.9-5-4.9 6.9-1z"/>,
    <><path d="M7 3h10v6a5 5 0 0 1-10 0zM7 5H3v3a4 4 0 0 0 5 4M17 5h4v3a4 4 0 0 1-5 4M12 14v5M8 22v-3h8v3"/></>,
    <><path d="m2 8 5 4 5-8 5 8 5-4-2 12H4zM5 16h14"/></>,
    <path d="M12 12c-2-4-3-6-6-6a6 6 0 0 0 0 12c3 0 4-2 6-6s3-6 6-6a6 6 0 0 1 0 12c-3 0-4-2-6-6Z"/>,
  ];
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{marks[level - 1]}</svg>;
}

function MemberCard({ tier, year, displayName, cardNumber = "", birthdayDate = "" }: { tier: MemberLevel; year: number; displayName: string; cardNumber?: string; birthdayDate?: string }) {
  const formattedDOB = /^\d{4}-\d{2}-\d{2}$/.test(birthdayDate)
    ? birthdayDate.slice(8,10)+"/"+birthdayDate.slice(5,7)+"/"+birthdayDate.slice(0,4) : "";
  return <div className="qa-card-wrap">
    <div className="qa-member-card" data-tier={tier.level} data-card-finish="metal-foil" aria-label={`บัตรสมาชิก LV.${tier.level} ${tier.name} ของ ${displayName} ปี ${year}`}>
      <div className="qa-mcard-art" aria-hidden="true"><b className="qa-shape qa-art-a"/><b className="qa-shape qa-art-b"/><b className="qa-shape qa-art-c"/><b className="qa-shape qa-art-d"/></div>
      <div className="qa-mcard-emblem"><MembershipSymbol level={tier.level}/></div>
      <div className="qa-mcard-mast">
        <div className="qa-mcard-brand">
          <span className="qa-orbit-crest" data-member-emblem="orbit-crest" aria-hidden="true"><b className="qa-orbit-path-back"/><b className="qa-orbit-rim"><b className="qa-orbit-core"><b className="qa-orbit-mono">QA</b></b></b><b className="qa-orbit-path"/><b className="qa-orbit-glint"/></span>
          <div><div className="qa-wordmark">QA SPARKS</div><div className="qa-wordmark-sub">ANNUAL MEMBER</div></div>
        </div>
        <span className="qa-level-mark">LV.{tier.level}</span>
      </div>
      <div className="qa-mcard-main"><h3>{tier.name}</h3><p>{finishes[tier.level - 1]}</p>
        {/^\d{12}$/.test(cardNumber) ? <div className="qa-mcard-cardid"><span>MEMBER CARD NO.</span><strong>{cardNumber}</strong></div> : null}
      </div>
      {formattedDOB ? <div className="qa-mcard-birthday-plate">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-14 4h3m4 0h3m-10 4h3"/></svg>
        <div><span>DATE OF BIRTH</span><strong>{formattedDOB}</strong></div>
      </div> : null}
      <div className="qa-mcard-bottom"><div className="qa-holder"><span>MEMBER NAME</span><strong>{displayName}</strong></div><div className="qa-year"><span>MEMBER YEAR</span>{year}</div></div>
    </div>
  </div>;
}

export function SparksWalletSummary({ balance, rewardOrders, compact = false }: { balance: number; rewardOrders: number; compact?: boolean }) {
  return <div className={"qa-member-wallet" + (compact ? " qa-member-wallet--compact" : "")} aria-label="ยอด Sparks และรายการแลกรางวัล">
    <div className="qa-wallet-balance" data-sparks-metric="Current Sparks">
      <p className="qa-wallet-label"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m12 2 2.7 6.7L22 12l-7.3 3.3L12 22l-2.7-6.7L2 12l7.3-3.3z"/></svg>Sparks พร้อมแลกรางวัล</p>
      <p className="qa-wallet-total" data-sparks-metric="Available to Redeem"><strong>{number(balance)}</strong><span>Sparks</span></p>
      {!compact ? <p className="qa-wallet-caption">ยอดคงเหลือปัจจุบันของคุณ</p> : null}
    </div>
    <div className="qa-wallet-orders" data-sparks-metric="Reward Orders"><p className="qa-wallet-label">รายการแลกรางวัล</p><p className="qa-order-total"><strong>{number(rewardOrders)}</strong><span>รายการ</span></p></div>
  </div>;
}

export default function MemberJourney({ earned, year, displayName, balance, rewardOrders, username, sessionId, birthdayDate = "", birthdayClaimed2026At = "" }: { earned: number; year: number; displayName: string; balance: number; rewardOrders: number; username?: string; sessionId?: string; birthdayDate?: string; birthdayClaimed2026At?: string }) {
  const member = getSparksMemberLevel(earned);
  const [guideOpen, setGuideOpen] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [storedDOB, setStoredDOB] = useState(birthdayDate);
  useEffect(()=>setStoredDOB(birthdayDate),[birthdayDate]);
  useEffect(()=>{
    const listener=(event:Event)=>{
      const detail=(event as CustomEvent<{username:string;birthdayDate:string}>).detail;
      if(detail?.username?.toLowerCase()===username?.toLowerCase() && detail.birthdayDate)
        setStoredDOB(detail.birthdayDate);
    };
    window.addEventListener("qa:sparks-birthday-updated",listener);
    return()=>window.removeEventListener("qa:sparks-birthday-updated",listener);
  },[username]);
  const [benefitsOpen,setBenefitsOpen]=useState(false);
  const [giftClaimed,setGiftClaimed]=useState(Boolean(birthdayClaimed2026At));
  const [giftBusy,setGiftBusy]=useState(false);
  const [giftMessage,setGiftMessage]=useState("");
  const benefitsTrigger=useRef<HTMLButtonElement>(null);
  const benefitsClose=useRef<HTMLButtonElement>(null);
  useEffect(()=>setGiftClaimed(Boolean(birthdayClaimed2026At)),[birthdayClaimed2026At]);
  useEffect(()=>{
    if(!benefitsOpen)return;
    benefitsClose.current?.focus();
    const dismiss=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();setBenefitsOpen(false);}};
    window.addEventListener("keydown",dismiss);
    return()=>{window.removeEventListener("keydown",dismiss);benefitsTrigger.current?.focus();};
  },[benefitsOpen]);
  const localDate=localBangkokDate();
  const observedBirthday=storedDOB.slice(5)==="02-29"?"02-28":storedDOB.slice(5);
  const eligibleBirthdayGift=Boolean(storedDOB)&&localDate.startsWith("2026-")&&observedBirthday<=localDate.slice(5);
  const level=member.current.level;
  const bonus=checkinBonus[level-1];
  const discount=memberDiscount(level);
  async function claimBirthday(){
    if(giftBusy||giftClaimed||!eligibleBirthdayGift||!username||!sessionId)return;
    setGiftBusy(true);setGiftMessage("");
    try{
      const response=await fetch("/api/sparks-admin",{method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"content-type":"application/json"},body:JSON.stringify({
          action:"claim-member-birthday",actorUsername:username,sessionId
        })});
      const result=await response.json().catch(()=>({}));
      if(!response.ok||result.ok===false)throw new Error(String(result.error||"ไม่สามารถรับของขวัญได้"));
      setGiftClaimed(true);
      setGiftMessage(result.alreadyClaimed?"รับของขวัญไปแล้ว":"รับของขวัญวันเกิดสำเร็จ เพิ่ม "+Number(result.amount||0).toLocaleString("en-US")+" Sparks");
      window.dispatchEvent(new Event("qa:sparks-updated"));
    }catch(error){setGiftMessage(error instanceof Error?error.message:"ไม่สามารถรับของขวัญได้");}
    finally{setGiftBusy(false);}
  }

  const [cardActive, setCardActive] = useState(false);
  useEffect(() => {
    if(!username)return;
    let alive=true;
    const load=()=>{void fetch("/api/sparks-admin",{method:"POST",credentials:"same-origin",cache:"no-store",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({action:"member-card-state",actorUsername:username,sessionId})})
      .then(async response=>response.ok?response.json():null)
      .then(data=>{if(alive){setCardActive(data?.cardActive===true);
        setCardNumber(data?.cardActive?String(data.cardNumber||""):"");}})
      .catch(()=>{});};
    load();window.addEventListener("qa:sparks-card-updated",load);
    return()=>{alive=false;window.removeEventListener("qa:sparks-card-updated",load);};
  },[username,sessionId]);
  const openButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const progress = member.next ? (member.annualEarned - member.current.min) / (member.next.min - member.current.min) * 100 : 100;

  useEffect(() => {
    if (guideOpen) {
      closeButton.current?.focus({ preventScroll: true });
      wasOpen.current = true;
    } else if (wasOpen.current) {
      openButton.current?.focus();
      wasOpen.current = false;
    }
  }, [guideOpen]);

  return <section className="qa-sparks-membership" data-member-tier={member.current.level} style={{ "--member-accent": member.current.color } as React.CSSProperties} aria-label="ระดับสมาชิก QA Sparks" onKeyDown={event => {
    if (event.key === "Escape" && guideOpen) { event.preventDefault(); event.stopPropagation(); setGuideOpen(false); }
  }}>
    {guideOpen ? <div className="qa-guide" id="qa-sparks-member-guide">
      <header className="qa-gallery-top"><div><p className="qa-member-collection">MEMBERSHIP COLLECTION · {year}</p><h2>ระดับสมาชิก QA Sparks</h2><p>10 ระดับ · เกณฑ์จาก Sparks ที่ได้รับสะสมประจำปี</p></div><button ref={closeButton} type="button" className="qa-action" onClick={() => setGuideOpen(false)}>← กลับหน้าสมาชิก</button></header>
      <div className="qa-gallery-grid">
        {SPARKS_MEMBER_LEVELS.map(tier => <article key={tier.level} className="qa-gallery-entry" data-member-state={tier.level === member.current.level ? "current" : tier.level < member.current.level ? "attained" : "upcoming"}>
          <MemberCard tier={tier} year={year} displayName={displayName} cardNumber={cardNumber} birthdayDate={storedDOB}/>
          <div className="qa-gallery-meta"><div><h3>LV.{tier.level} {tier.name}</h3><p>สะสมตั้งแต่ {number(tier.min)} Sparks / ปี</p></div><span className={"qa-tier-state" + (tier.level === member.current.level ? " qa-tier-state-current" : "")}>{tier.level === member.current.level ? "ระดับปัจจุบัน" : tier.level < member.current.level ? "ผ่านแล้ว" : "ยังไม่ถึงระดับ"}</span></div>
        </article>)}
      </div>
      <p className="qa-guide-note">การแลกของรางวัลไม่ทำให้ระดับลดลง · เริ่มนับคะแนนสะสมและระดับสมาชิกใหม่วันที่ 1 มกราคม</p>
      <div className="qa-gallery-bottom"><button type="button" className="qa-action" onClick={() => setGuideOpen(false)}>← กลับหน้าสมาชิก</button></div>
    </div> : <div className="qa-membership" data-member-wallet="integrated">
      <div className="qa-section-top"><div><p>ANNUAL MEMBERSHIP · {year}</p><h2>บัตรสมาชิกของคุณ</h2></div><button ref={openButton} type="button" className="qa-action" aria-expanded={false} onClick={() => setGuideOpen(true)}>ดูระดับสมาชิกทั้งหมด <span aria-hidden="true">↗</span></button></div>
      <div className="qa-member-hero">
        <button ref={benefitsTrigger} type="button" className="qa-member-card-trigger"
          onClick={()=>setBenefitsOpen(true)} aria-haspopup="dialog" aria-label={`เปิดดูสิทธิพิเศษบัตรสมาชิก Level ${level}`}>
          <div className="qa-current-card"><MemberCard tier={member.current} year={year} displayName={displayName} cardNumber={cardNumber} birthdayDate={storedDOB}/></div>
        </button>
        <div className="qa-benefits-hint">แตะบัตรเพื่อดูสิทธิพิเศษสมาชิก <span aria-hidden="true">↗</span></div>
        <div className="qa-member-card-controls">
          <span className={cardActive?"qa-card-status-active":"qa-card-status-inactive"}>
            {cardActive?"บัตรเปิดใช้งานแล้ว · PIN 6 หลัก":"บัตรยังไม่เปิดใช้งาน · กรุณาตั้ง PIN 6 หลัก"}
          </span>
          <button type="button" className="qa-action" onClick={()=>window.dispatchEvent(new Event("qa:sparks-card-open"))}>
            {cardActive?"จัดการบัตร / เปลี่ยน PIN":"เปิดใช้งานบัตรและตั้ง PIN"}
          </button>
        </div>
      </div>
      <div className="qa-member-summary">
        <SparksWalletSummary balance={balance} rewardOrders={rewardOrders}/>
        <div className="qa-member-progress">
          <div className="qa-progress-heading"><div><p className="qa-annual-label">คะแนนสะสมประจำปี {year}</p><p className="qa-annual-total">{number(member.annualEarned)} <span>Sparks · สะสมไม่จำกัด</span></p></div><span className="qa-current-pill">LV.{member.current.level} · ระดับปัจจุบัน</span></div>
          {member.next ? <p className="qa-next-copy">อีก <strong>{number(member.nextRequired)} Sparks</strong> ถึง <span>LV.{member.next.level} {member.next.name}</span></p> : <p className="qa-next-copy"><strong>ถึงระดับสูงสุดแล้ว · Spark Immortal</strong><br/>ยังสะสม Sparks ต่อได้ไม่จำกัด</p>}
          <div className="qa-track" role="progressbar" aria-label="ความคืบหน้าไปสู่ระดับสมาชิกถัดไป" aria-valuemin={member.current.min} aria-valuemax={member.next?.min || SPARKS_TOP_LEVEL_POINTS} aria-valuenow={Math.min(member.annualEarned, member.next?.min || SPARKS_TOP_LEVEL_POINTS)} aria-valuetext={member.next ? `${number(member.annualEarned)} Sparks อีก ${number(member.nextRequired)} Sparks ถึง LV.${member.next.level}` : `${number(member.annualEarned)} Sparks ถึงระดับสูงสุดแล้ว`}><div className="qa-track-fill" style={{ width: `${progress}%` }}/></div>
          <div className="qa-track-labels"><span>LV.{member.current.level} · {number(member.current.min)}</span>{member.next ? <span>LV.{member.next.level} · {number(member.next.min)}</span> : <span>ระดับสูงสุด</span>}</div>
          <p className="qa-member-note">ระดับสมาชิกอิงคะแนนที่ได้รับในปีนี้ การแลกรางวัลไม่ทำให้ระดับลดลง</p>
        </div>
      </div>
      <details className="qa-rules"><summary>เงื่อนไขคะแนนและระดับสมาชิก</summary><p>สะสม Sparks ได้ไม่จำกัด · LV.10 เริ่มที่ {number(SPARKS_TOP_LEVEL_POINTS)} คะแนนสะสมประจำปี · ยอด Sparks ที่ยังไม่ได้ใช้หมดอายุวันที่ 31 ธันวาคม เวลา 23:59 น. (เวลาไทย) · เริ่มนับคะแนนสะสมและระดับสมาชิกใหม่วันที่ 1 มกราคม</p></details>
    </div>}
    {benefitsOpen&&typeof document!=="undefined"?createPortal(
      <div className="qa-member-benefits-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!giftBusy)setBenefitsOpen(false);}}>
        <section role="dialog" aria-modal="true" aria-labelledby="qa-member-benefits-title" className="qa-member-benefits-dialog">
          <header className="qa-member-benefits-header">
            <div><span className="qa-benefits-overline">QA SPARKS · MEMBER BENEFITS</span>
              <h2 id="qa-member-benefits-title">สิทธิพิเศษของสมาชิก LV.{level}</h2>
              <p>{member.current.name} · {member.current.thaiName}</p></div>
            <button ref={benefitsClose} type="button" className="qa-benefits-close" aria-label="ปิดหน้าต่างสิทธิพิเศษ" onClick={()=>setBenefitsOpen(false)}>×</button>
          </header>
          <div className="qa-benefits-level-heading">สิทธิ์ที่ปลดล็อกแล้ว</div>
          <div className="qa-member-benefits-grid">
            <article><span>Daily Check-in</span><strong>{bonus>0?"+"+bonus+" Sparks / วัน":"สิทธิ์พื้นฐาน"}</strong><small>รับโบนัสตามระดับสูงสุดที่ปลดล็อก ในวันที่มีกิจกรรม Check-in</small></article>
            <article><span>Birthday Gift</span><strong>{number(birthdayPoints[level-1])} Sparks</strong><small>รับได้ปีละครั้ง · จำนวนตามระดับสมาชิกเมื่อกดรับ</small></article>
          </div>
          <div className="qa-benefits-level-heading">สิทธิพิเศษเพิ่มเติม</div>
          <div className="qa-member-benefits-grid">
            <article className="qa-benefit-upcoming"><span>Item Discount</span>
              <strong>{discount>0?discount+"%":"ยังไม่ปลดล็อก"}</strong>
              <small>{discount>0?"ระดับของคุณมีสิทธิ์ตามแผนแบบ B · ระบบส่วนลดรอเปิดใช้งาน":"เริ่มปลดล็อกระดับ 3 · ระบบส่วนลดรอเปิดใช้งาน"}</small>
            </article>
            <article className="qa-benefit-upcoming"><span>VIP Exclusive Benefits</span>
              <strong>{level>=6?"VIP Member":"ยังไม่ปลดล็อก"}</strong>
              <small>Item VIP · ตราโปรไฟล์ · Monthly Surprise อยู่ระหว่างเตรียมเปิด</small>
            </article>
          </div>
          <div className="qa-member-birthday-action">
            <strong>ของขวัญวันเกิด 2569</strong>
            <p>{!storedDOB?"กรุณาบันทึกวันเกิดเพื่อเปิดรับสิทธิ์":giftClaimed?"รับของขวัญวันเกิดปีนี้แล้ว":eligibleBirthdayGift?"มีสิทธิ์กดรับของขวัญย้อนหลังปี 2569":localDate.startsWith("2026-")?"ยังไม่ถึงวันเกิดของคุณในปีนี้":"พ้นระยะเวลารับย้อนหลังปี 2569"}</p>
            {eligibleBirthdayGift&&!giftClaimed?
              <button type="button" disabled={giftBusy} onClick={()=>void claimBirthday()}>
                {giftBusy?"กำลังยืนยันสิทธิ์...":"รับของขวัญวันเกิด "+number(birthdayPoints[level-1])+" Sparks"}
              </button>:null}
            {giftMessage?<p role="status">{giftMessage}</p>:null}
          </div>
          <footer><button type="button" className="qa-action" onClick={()=>setBenefitsOpen(false)}>ปิดหน้าต่าง</button></footer>
        </section>
      </div>,document.body):null}
  </section>;
}
