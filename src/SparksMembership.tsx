import React, { useEffect, useRef, useState } from "react";
import { SPARKS_MEMBER_LEVELS, SPARKS_TOP_LEVEL_POINTS, getSparksMemberLevel, type MemberLevel } from "./qaSparksMemberLevels";
import "./sparksMembership.css";

const finishes = ["Silver Minimal", "Emerald Trail", "Sapphire Motion", "Amethyst Facet", "Champagne Art Deco", "Ruby Silk", "Midnight Gold", "Copper Trophy", "Celestial Orbit", "Obsidian Prism"];
const number = (value: number) => value.toLocaleString("en-US");

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

function MemberCard({ tier, year, displayName }: { tier: MemberLevel; year: number; displayName: string }) {
  return <div className="qa-card-wrap">
    <div className="qa-member-card" data-tier={tier.level} aria-label={`บัตรสมาชิก LV.${tier.level} ${tier.name} ของ ${displayName} ปี ${year}`}>
      <div className="qa-mcard-art" aria-hidden="true"><b className="qa-shape qa-art-a"/><b className="qa-shape qa-art-b"/><b className="qa-shape qa-art-c"/><b className="qa-shape qa-art-d"/></div>
      <div className="qa-mcard-emblem"><MembershipSymbol level={tier.level}/></div>
      <div className="qa-mcard-mast">
        <div className="qa-mcard-brand">
          <span className="qa-orbit-crest" data-member-emblem="orbit-crest" aria-hidden="true"><b className="qa-orbit-path-back"/><b className="qa-orbit-rim"><b className="qa-orbit-core"><b className="qa-orbit-mono">QA</b></b></b><b className="qa-orbit-path"/><b className="qa-orbit-glint"/></span>
          <div><div className="qa-wordmark">QA SPARKS</div><div className="qa-wordmark-sub">ANNUAL MEMBER</div></div>
        </div>
        <span className="qa-level-mark">LV.{tier.level}</span>
      </div>
      <div className="qa-mcard-main"><h3>{tier.name}</h3><p>{finishes[tier.level - 1]}</p></div>
      <div className="qa-mcard-bottom"><div className="qa-holder"><span>MEMBER NAME</span><strong>{displayName}</strong></div><div className="qa-year"><span>MEMBER YEAR</span>{year}</div></div>
    </div>
  </div>;
}

export default function MemberJourney({ earned, year, displayName }: { earned: number; year: number; displayName: string }) {
  const member = getSparksMemberLevel(earned);
  const [guideOpen, setGuideOpen] = useState(false);
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

  return <section className="qa-sparks-membership" aria-label="ระดับสมาชิก QA Sparks" onKeyDown={event => {
    if (event.key === "Escape" && guideOpen) { event.preventDefault(); event.stopPropagation(); setGuideOpen(false); }
  }}>
    {guideOpen ? <div className="qa-guide" id="qa-sparks-member-guide">
      <header className="qa-gallery-top"><div><p className="qa-member-collection">MEMBERSHIP COLLECTION · {year}</p><h2>ระดับสมาชิก QA Sparks</h2><p>10 ระดับ · เกณฑ์จาก Sparks ที่ได้รับสะสมประจำปี</p></div><button ref={closeButton} type="button" className="qa-action" onClick={() => setGuideOpen(false)}>← กลับหน้าสมาชิก</button></header>
      <div className="qa-gallery-grid">
        {SPARKS_MEMBER_LEVELS.map(tier => <article key={tier.level} className="qa-gallery-entry" data-member-state={tier.level === member.current.level ? "current" : tier.level < member.current.level ? "attained" : "upcoming"}>
          <MemberCard tier={tier} year={year} displayName={displayName}/>
          <div className="qa-gallery-meta"><div><h3>LV.{tier.level} {tier.name}</h3><p>สะสมตั้งแต่ {number(tier.min)} Sparks / ปี</p></div><span className={"qa-tier-state" + (tier.level === member.current.level ? " qa-tier-state-current" : "")}>{tier.level === member.current.level ? "ระดับปัจจุบัน" : tier.level < member.current.level ? "ผ่านแล้ว" : "ยังไม่ถึงระดับ"}</span></div>
        </article>)}
      </div>
      <p className="qa-guide-note">การแลกของรางวัลไม่ทำให้ระดับลดลง · เริ่มนับคะแนนสะสมและระดับสมาชิกใหม่วันที่ 1 มกราคม</p>
      <div className="qa-gallery-bottom"><button type="button" className="qa-action" onClick={() => setGuideOpen(false)}>← กลับหน้าสมาชิก</button></div>
    </div> : <>
      <div className="qa-section-top"><div><h2>บัตรสมาชิกของคุณ</h2><p>ANNUAL MEMBERSHIP · {year}</p></div><button ref={openButton} type="button" className="qa-action" aria-expanded={false} onClick={() => setGuideOpen(true)}>ดูระดับสมาชิกทั้งหมด ↗</button></div>
      <div className="qa-membership">
        <div className="qa-current-card"><MemberCard tier={member.current} year={year} displayName={displayName}/></div>
        <div className="qa-member-summary">
          <p className="qa-annual-label">คะแนนสะสมประจำปี {year}</p><p className="qa-annual-total">{number(member.annualEarned)} <span>Sparks · สะสมไม่จำกัด</span></p>
          <div className="qa-current-pill">LV.{member.current.level} · ระดับปัจจุบัน</div>
          {member.next ? <p className="qa-next-copy">อีก <strong>{number(member.nextRequired)} Sparks</strong> ถึง<br/>LV.{member.next.level} {member.next.name}</p> : <p className="qa-next-copy"><strong>ถึงระดับสูงสุดแล้ว · Spark Immortal</strong><br/>ยังสะสม Sparks ต่อได้ไม่จำกัด</p>}
          <div className="qa-track" role="progressbar" aria-label="ความคืบหน้าไปสู่ระดับสมาชิกถัดไป" aria-valuemin={member.current.min} aria-valuemax={member.next?.min || SPARKS_TOP_LEVEL_POINTS} aria-valuenow={Math.min(member.annualEarned, member.next?.min || SPARKS_TOP_LEVEL_POINTS)} aria-valuetext={member.next ? `${number(member.annualEarned)} Sparks อีก ${number(member.nextRequired)} Sparks ถึง LV.${member.next.level}` : `${number(member.annualEarned)} Sparks ถึงระดับสูงสุดแล้ว`}><div className="qa-track-fill" style={{ width: `${progress}%` }}/></div>
          <div className="qa-track-labels"><span>LV.{member.current.level} · {number(member.current.min)}</span>{member.next ? <span>LV.{member.next.level} · {number(member.next.min)}</span> : <span>ระดับสูงสุด</span>}</div>
          <p className="qa-member-note">ระดับสมาชิกคำนวณจาก Sparks ที่ได้รับสะสมในปีนี้<br/>การแลกของรางวัลไม่ทำให้ระดับลดลง</p>
        </div>
      </div>
      <details className="qa-rules"><summary>เงื่อนไขคะแนนและระดับสมาชิก</summary><p>สะสม Sparks ได้ไม่จำกัด · LV.10 เริ่มที่ {number(SPARKS_TOP_LEVEL_POINTS)} คะแนนสะสมประจำปี · ยอด Sparks ที่ยังไม่ได้ใช้หมดอายุวันที่ 31 ธันวาคม เวลา 23:59 น. (เวลาไทย) · เริ่มนับคะแนนสะสมและระดับสมาชิกใหม่วันที่ 1 มกราคม</p></details>
    </>}
  </section>;
}
