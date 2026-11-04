import React, { useState } from "react";
import "./qaSparks.css";

type SparksView = "overview" | "rewards" | "history";
type SparksIconName = "spark" | "gift" | "clock" | "grid" | "receipt" | "crown" | "info" | "shield" | "settings";

const paths: Record<SparksIconName, React.ReactNode> = {
  spark: <><path d="m12 2 2.7 6.7L22 12l-7.3 3.3L12 22l-2.7-6.7L2 12l7.3-3.3z" /></>,
  gift: <><rect x="3" y="10" width="18" height="11" rx="2"/><path d="M2 7h20v4H2zM12 7v14M12 7C7 7 6 5.5 7 3.8c1.5-2.4 5 0 5 3.2Zm0 0c5 0 6-1.5 5-3.2-1.5-2.4-5 0-5 3.2Z" /></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2" /></>,
  grid: <><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 9h6M9 13h6" /></>,
  crown: <><path d="m2 8 5 4 5-8 5 8 5-4-2 12H4z" /><path d="M5 16h14" /></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01" /></>,
  shield: <><path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5zM9 12l2 2 4-4" /></>,
  settings: <><circle cx="12" cy="12" r="3.1"/><path d="m10 2-.5 2-2 .9-1.8-1.1-2 2 1.1 1.8-.9 2-2 .5v2.8l2 .5.9 2-1.1 1.8 2 2 1.8-1.1 2 .9.5 2h2.8l.5-2 2-.9 1.8 1.1 2-2-1.1-1.8.9-2 2-.5v-2.8l-2-.5-.9-2 1.1-1.8-2-2-1.8 1.1-2-.9-.5-2z"/></>,
};
function SparksIcon({ name, size = 21, className = "" }: { name: SparksIconName; size?: number; className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size}
    className={className} fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function EmptyReward({ large = false }: { large?: boolean }) {
  return <section className={"qa-sparks-empty" + (large ? " qa-sparks-empty--large" : "")} aria-label="Reward Center ยังไม่มีของรางวัล">
    <div className="qa-sparks-illustration" aria-hidden="true">
      <span className="qa-sparks-illustration-halo" />
      <span className="qa-sparks-illustration-emblem"><SparksIcon name="gift" size={57}/></span>
      <i className="qa-sparks-flare one" /><i className="qa-sparks-flare two" />
    </div>
    <h3>ยังไม่มีของรางวัลในขณะนี้</h3>
    <p>ระบบแลกรางวัลเตรียมโครงสร้างไว้แล้ว<br/>รอเพิ่มรายการและเงื่อนไขการแลกภายหลัง</p>
    <button type="button" disabled title="ยังไม่มีรายการรางวัลให้แลก"><SparksIcon name="gift" size={17}/> เปิดดูรางวัล</button>
  </section>;
}
function EmptyHistory({ large = false }: { large?: boolean }) {
  return <section className={"qa-sparks-empty qa-sparks-history-empty" + (large ? " qa-sparks-empty--large" : "")} aria-label="ยังไม่มีประวัติ Sparks">
    <div className="qa-sparks-history-clock"><SparksIcon name="clock" size={49}/></div>
    <h3>ยังไม่มีประวัติการได้รับหรือใช้ Sparks</h3>
    <p>เมื่อเปิดใช้งาน ระบบจะแสดงรายการได้รับและแลกรางวัลที่นี่</p>
    <div className="qa-sparks-history-table" role="table" aria-label="ประวัติ QA Sparks">
      <div className="qa-sparks-history-head" role="row">
        <span role="columnheader">วันที่ / เวลา</span><span role="columnheader">รายการ</span>
        <span role="columnheader">Sparks (+/−)</span><span role="columnheader">รายละเอียด</span>
      </div>
      <div className="qa-sparks-history-no-rows" role="row"><SparksIcon name="receipt" size={25}/><span>ยังไม่มีประวัติรายการ</span></div>
    </div>
  </section>;
}

export default function QASparks({ displayName = "" }: { displayName?: string }) {
  const [view, setView] = useState<SparksView>("overview");
  const tabs: { key: SparksView; label: string; icon: SparksIconName }[] = [
    { key: "overview", label: "Overview", icon: "grid" },
    { key: "rewards", label: "Reward Center", icon: "gift" },
    { key: "history", label: "History", icon: "clock" },
  ];
  return <main data-qa-sparks="true" data-sparks-data-mode="not-configured" className="qa-sparks-page">
    <div className="qa-sparks-container">
      <header className="qa-sparks-page-heading">
        <SparksIcon name="gift" size={26}/>
        <div><div className="qa-sparks-eyebrow">QA Dashboard · Rewards</div><h1>My QA Sparks / Reward Center</h1></div>
      </header>

      <section className="qa-sparks-hero">
        <div className="qa-sparks-hero-copy">
          <div className="qa-sparks-eyebrow">MY REWARDS</div>
          <h2>My QA Sparks</h2>
          <p>ระบบสะสมและแลกรางวัลสำหรับ QA Dashboard</p>
          {displayName ? <div className="qa-sparks-owner">บัญชีผู้ใช้งาน: {displayName}</div> : null}
          <div className="qa-sparks-hero-row">
            <div className="qa-sparks-balance"><SparksIcon name="spark" size={30}/><strong>0</strong><span>Sparks</span></div>
            <div className="qa-sparks-status">
              <span className="qa-sparks-pill"><SparksIcon name="settings" size={16}/> Setup in progress</span>
              <span className="qa-sparks-pill"><SparksIcon name="gift" size={16}/> No rewards yet</span>
              <span className="qa-sparks-pill"><SparksIcon name="clock" size={16}/> History ready</span>
              <div className="qa-sparks-hero-note"><SparksIcon name="info" size={16}/> เงื่อนไขการได้รับ Sparks จะกำหนดภายหลัง</div>
            </div>
          </div>
        </div>
        <div className="qa-sparks-hero-art" aria-hidden="true">
          <span className="qa-sparks-art-orbit"/><span className="qa-sparks-art-star first">✦</span><span className="qa-sparks-art-star second">✦</span>
          <div className="qa-sparks-gift"><div className="qa-sparks-gift-bow">∞</div><div className="qa-sparks-gift-lid"/><div className="qa-sparks-gift-box"><span/></div></div>
          <div className="qa-sparks-token"><SparksIcon name="spark" size={40}/></div>
        </div>
      </section>

      <section className="qa-sparks-metrics" aria-label="QA Sparks overview">
        {([
          ["Current Sparks", "0", "spark", "amber"],
          ["Available to Redeem", "0", "gift", "violet"],
          ["Reward Orders", "0", "receipt", "blue"],
          ["Member Level", "Not set", "crown", "green"],
        ] as const).map(([label, value, icon, tone]) => (
          <div className="qa-sparks-metric" key={label}>
            <span className={"qa-sparks-metric-icon qa-sparks-tone-"+tone}><SparksIcon name={icon} size={27}/></span>
            <div><div className="qa-sparks-metric-label">{label}</div><strong>{value}</strong></div>
          </div>
        ))}
      </section>
      <p className="qa-sparks-placeholder-disclosure">ยอดและสถานะขณะนี้เป็นค่าเริ่มต้นของหน้า UI ยังไม่มีการกำหนดเงื่อนไขสะสมหรือเชื่อมข้อมูลการแลกรางวัลจริง</p>

      <nav className="qa-sparks-tabs" role="tablist" aria-label="QA Sparks sections">
        {tabs.map((tab) => (
          <button type="button" role="tab" id={"qa-sparks-tab-"+tab.key}
            aria-controls={"qa-sparks-panel-"+tab.key} aria-selected={view===tab.key}
            tabIndex={view===tab.key?0:-1} key={tab.key}
            className={view===tab.key?"qa-sparks-tab active":"qa-sparks-tab"}
            onClick={()=>setView(tab.key)}>
            <SparksIcon name={tab.icon} size={19}/>{tab.label}
          </button>
        ))}
      </nav>

      <div role="tabpanel" id={"qa-sparks-panel-"+view} aria-labelledby={"qa-sparks-tab-"+view} className="qa-sparks-content">
        {view === "overview" ? <div className="qa-sparks-dual">
          <section className="qa-sparks-panel"><h2><SparksIcon name="gift"/> Reward Center</h2><EmptyReward/></section>
          <section className="qa-sparks-panel"><h2><SparksIcon name="clock"/> History</h2><EmptyHistory/></section>
        </div> : view === "rewards" ? <section className="qa-sparks-panel qa-sparks-single"><h2><SparksIcon name="gift"/> Reward Center</h2><EmptyReward large/></section>
        : <section className="qa-sparks-panel qa-sparks-single"><h2><SparksIcon name="clock"/> History</h2><EmptyHistory large/></section>}
      </div>

      <section className="qa-sparks-notes">
        <div className="qa-sparks-notes-heading"><SparksIcon name="info" size={23}/> หมายเหตุการใช้งาน</div>
        <ul><li>ยังไม่กำหนดเงื่อนไขการได้รับ Sparks</li><li>ยังไม่มีรายการของรางวัล</li>
          <li>เตรียมหน้าระบบแลกรางวัลไว้เพื่อกำหนดรายละเอียดภายหลัง</li>
          <li>QA Sparks แยกจาก QA Score, KPI และ Incentive</li></ul>
      </section>
    </div>
  </main>;
}
