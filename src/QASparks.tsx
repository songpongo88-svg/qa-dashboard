import React, { useEffect, useMemo, useRef, useState } from "react";
import { EMPTY_SPARKS_ACCOUNT, getSparksAccount, invalidateSparksAccount, type SparksAccount, type SparksHistoryItem } from "./qaSparksStore";
import "./qaSparks.css";
import SparksAdminPanel from "./SparksAdminPanel";
import TypingReliefRewardCard from "./TypingReliefRewardCard";
import DailyCheckinQuest from "./DailyCheckinQuest";
import ProfileMakeoverQuest from "./ProfileMakeoverQuest";
import TrueMoneyReward from "./TrueMoneyReward";
import { SPARKS_ANNUAL_CAP, SPARKS_MEMBER_LEVELS, getSparksMemberLevel } from "./qaSparksMemberLevels";

type SparksView = "overview" | "quests" | "rewards" | "items" | "history" | "admin";
type SparksIconName = "spark" | "gift" | "clock" | "grid" | "receipt" | "crown" | "calendar" | "package";
const paths: Record<SparksIconName, React.ReactNode> = {
  spark: <path d="m12 2 2.7 6.7L22 12l-7.3 3.3L12 22l-2.7-6.7L2 12l7.3-3.3z"/>,
  gift: <><rect x="3" y="10" width="18" height="11" rx="2"/><path d="M2 7h20v4H2zM12 7v14M12 7C7 7 6 5.5 7 3.8c1.5-2.4 5 0 5 3.2Zm0 0c5 0 6-1.5 5-3.2-1.5-2.4-5 0-5 3.2Z"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  grid: <><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 9h6M9 13h6"/></>,
  crown: <><path d="m2 8 5 4 5-8 5 8 5-4-2 12H4z"/><path d="M5 16h14"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18m-12 5 2.5 2.5 4-4"/></>,
  package: <><path d="m3 8 9-5 9 5v10l-9 5-9-5z"/><path d="m3 8 9 5 9-5M12 13v10M7.5 5.5l9 5"/></>,
};
function SparksIcon({ name, size = 21 }: { name: SparksIconName; size?: number }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
function EmptyReward({ large = false }: { large?: boolean }) {
  return <section className={"qa-sparks-empty" + (large ? " qa-sparks-empty--large" : "")} aria-label="Reward Center ยังไม่มีของรางวัล">
    <div className="qa-sparks-illustration" aria-hidden="true">
      <span className="qa-sparks-illustration-halo"/>
      <span className="qa-sparks-illustration-emblem"><SparksIcon name="gift" size={57}/></span>
      <i className="qa-sparks-flare one"/><i className="qa-sparks-flare two"/>
    </div>
    <h3>ยังไม่มีของรางวัล</h3>
  </section>;
}
function formatDate(date: string) {
  const parsed = new Date(date);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : date;
}
function SparksHistory({ history, large = false }: { history: SparksHistoryItem[]; large?: boolean }) {
  const [filter, setFilter] = useState<"all" | "earn" | "spend">("all");
  const visible = history.filter((item) => filter === "all" || item.type === filter);
  return <section className={"qa-sparks-history-wrap" + (large ? " qa-sparks-history-wrap--large" : "")}>
    {history.length ? <div className="qa-sparks-history-filters" aria-label="กรองประวัติ Sparks">
      {([["all", "ทั้งหมด"], ["earn", "ได้รับ (+)"], ["spend", "ใช้ไป (−)"]] as const).map(([key, label]) => (
        <button key={key} type="button" className={filter === key ? "active" : ""} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>
      ))}
    </div> : <div className="qa-sparks-history-empty-message"><div className="qa-sparks-history-clock"><SparksIcon name="clock" size={49}/></div><h3>ยังไม่มีประวัติการได้รับหรือใช้ Sparks</h3></div>}
    <div className="qa-sparks-history-table" role="table" aria-label="ประวัติ QA Sparks">
      <div className="qa-sparks-history-head" role="row">
        <span role="columnheader">วันที่ / เวลา</span><span role="columnheader">รายการ</span>
        <span role="columnheader">Sparks (+/−)</span><span role="columnheader">รายละเอียด / คงเหลือ</span>
      </div>
      {visible.length ? visible.map((item) => <div className="qa-sparks-history-item" role="row" key={item.id}>
        <span role="cell">{formatDate(item.createdAt)}</span>
        <span role="cell">{item.title}</span>
        <strong role="cell" className={item.amount >= 0 ? "positive" : "negative"}>{item.amount > 0 ? "+" : ""}{item.amount.toLocaleString()} Sparks</strong>
        <span role="cell">{item.detail}<small>คงเหลือ {item.balanceAfter.toLocaleString()} Sparks</small></span>
      </div>) : <div className="qa-sparks-history-no-rows" role="row"><SparksIcon name="receipt" size={25}/><span>ยังไม่มีประวัติรายการ</span></div>}
    </div>
  </section>;
}

function MemberJourney({ earned, year }: { earned: number; year: number }) {
  const member = getSparksMemberLevel(earned);
  return <section className="qa-sparks-member-journey" aria-label="ระดับสมาชิก QA Sparks">
    <div className="qa-sparks-member-head">
      <div>
        <div className="qa-sparks-member-eyebrow">ANNUAL MEMBER JOURNEY · {year}</div>
        <h2><SparksIcon name="crown" size={21}/> LV.{member.current.level} {member.current.name}</h2>
        <p>{member.current.thaiName} · สมาชิกเลื่อนระดับตาม Sparks ที่ได้รับสะสมในปี {year} การแลกรางวัลไม่ทำให้ระดับลดลง</p>
      </div>
      <div className="qa-sparks-member-points">
        <span>คะแนนสะสมประจำปี</span>
        <strong>{member.annualEarned.toLocaleString()} <small>/ {SPARKS_ANNUAL_CAP.toLocaleString()} Sparks</small></strong>
        <span>{member.next ? `อีก ${member.nextRequired.toLocaleString()} คะแนน ถึง LV.${member.next.level} ${member.next.name}` : "ถึงระดับสูงสุดแล้ว · Spark Legend"}</span>
      </div>
    </div>
    <div className="qa-sparks-member-progress" role="progressbar" aria-valuemin={member.current.min} aria-valuemax={member.next?.min || SPARKS_ANNUAL_CAP}
      aria-valuenow={member.annualEarned} aria-label="ความคืบหน้าไปสู่ระดับสมาชิกถัดไป">
      <span style={{ width: member.progress + "%", backgroundColor: member.current.color }}/>
    </div>
    <div className="qa-sparks-member-ladder" aria-label="ระดับสมาชิกทั้งเจ็ด">
      {SPARKS_MEMBER_LEVELS.map((tier) => <div key={tier.level}
        className={"qa-sparks-member-tier" + (tier.level === member.current.level ? " current" : tier.level < member.current.level ? " attained" : "")}
        style={{ "--member-tier-color": tier.color } as React.CSSProperties}>
        <span className="qa-sparks-member-tier-emblem"><SparksIcon name={tier.level === 7 ? "crown" : "spark"} size={16}/></span>
        <span><strong>LV.{tier.level} {tier.name}</strong><small>{tier.min.toLocaleString()} Sparks</small></span>
      </div>)}
    </div>
    <div className="qa-sparks-member-footnote">
      <span>เพดานรับ Sparks {SPARKS_ANNUAL_CAP.toLocaleString()} คะแนน/ปี · เริ่มนับ Level ใหม่วันที่ 1 มกราคม · ยอด Sparks ที่ยังไม่ได้ใช้ยกไปปีถัดไป</span>
    </div>
  </section>;
}

export default function QASparks({ displayName = "", username = "", adminAccess = false, adminSessionId = "", active = true }: { displayName?: string; username?: string; adminAccess?: boolean; adminSessionId?: string; active?: boolean }) {
  const [view, setView] = useState<SparksView>("overview");
  const [account, setAccount] = useState<SparksAccount>(EMPTY_SPARKS_ACCOUNT);
  const [lastAccountLoadAt, setLastAccountLoadAt] = useState("");
  const [lastAccountUsername, setLastAccountUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const requestSequence = useRef(0);
  const historyLimit = view === "history" ? 100 : view === "overview" ? 5 : 0;
  useEffect(() => {
    setAccount(EMPTY_SPARKS_ACCOUNT);
    setLastAccountLoadAt("");
    setLastAccountUsername("");
    setError("");
  }, [username]);
  useEffect(() => {
    let alive = true;
    if (!username) return;
    const refresh = (force = false) => {
      if (!active || document.visibilityState === "hidden") return;
      const sequence = ++requestSequence.current;
      setLoading(true);
      void getSparksAccount(username, { historyLimit, forceRefresh: force }).then((result) => {
        if (alive && sequence === requestSequence.current) { setAccount(result); setLastAccountUsername(username); setLastAccountLoadAt(new Date().toISOString()); setError(""); }
      }).catch(() => {
        if (alive && sequence === requestSequence.current) setError("ไม่สามารถโหลดข้อมูล Sparks ได้ กรุณาลองอีกครั้ง");
      }).finally(() => { if (alive && sequence === requestSequence.current) setLoading(false); });
    };
    const changed = () => { invalidateSparksAccount(username); refresh(true); };
    const focused = () => refresh();
    refresh();
    window.addEventListener("qa:sparks-updated", changed);
    window.addEventListener("focus", focused);
    return () => { alive = false; window.removeEventListener("qa:sparks-updated", changed); window.removeEventListener("focus", focused); };
  }, [username, active, historyLimit]);

  const ownAccountSnapshot = useMemo(() => lastAccountLoadAt && lastAccountUsername.toLowerCase() === username.toLowerCase()
    ? { ...account, lastLoadedAt: lastAccountLoadAt } : null, [account, lastAccountLoadAt, lastAccountUsername, username]);
  const tabs: { key: SparksView; label: string; icon: SparksIconName }[] = [
    { key: "overview", label: "Overview", icon: "grid" },
    { key: "quests", label: "Quest Center", icon: "calendar" },
    { key: "rewards", label: "Reward Center", icon: "gift" },
    { key: "items", label: "My Items", icon: "package" },
    { key: "history", label: "History", icon: "clock" },
    ...(adminAccess ? [{ key: "admin" as SparksView, label: "Sparks Admin", icon: "crown" as SparksIconName }] : []),
  ];
  const balance = account.balance.toLocaleString();
  const walletLoaded = Boolean(lastAccountLoadAt && lastAccountUsername.toLowerCase() === username.toLowerCase());
  const member = getSparksMemberLevel(account.memberYearEarned);
  return <main data-qa-sparks="true" data-sparks-data-mode={username ? "account" : "not-configured"} className="qa-sparks-page">
    <div className="qa-sparks-container">
      <header className="qa-sparks-page-heading"><SparksIcon name="gift" size={26}/><div><div className="qa-sparks-eyebrow">QA Dashboard · Rewards</div><h1>My QA Sparks / Reward Center</h1></div></header>
      <section className="qa-sparks-hero">
        <div className="qa-sparks-hero-copy">
          <div className="qa-sparks-eyebrow">MY REWARDS</div><h2>My QA Sparks</h2>
          <p>ระบบสะสมและแลกรางวัลสำหรับ QA Dashboard</p>
          {displayName ? <div className="qa-sparks-owner">บัญชีผู้ใช้งาน: {displayName}</div> : null}
          <div className="qa-sparks-hero-row"><div className="qa-sparks-balance"><SparksIcon name="spark" size={30}/><strong>{balance}</strong><span>Sparks</span></div></div>
        </div>
        <div className="qa-sparks-hero-art" aria-hidden="true">
          <span className="qa-sparks-art-orbit"/><span className="qa-sparks-art-star first">✦</span><span className="qa-sparks-art-star second">✦</span>
          <div className="qa-sparks-gift"><div className="qa-sparks-gift-bow">∞</div><div className="qa-sparks-gift-lid"/><div className="qa-sparks-gift-box"><span/></div></div>
          <div className="qa-sparks-token"><SparksIcon name="spark" size={40}/></div>
        </div>
      </section>
      <section className="qa-sparks-metrics" aria-label="QA Sparks overview">
        {([
          ["Current Sparks", balance, "spark", "amber"],
          ["Available to Redeem", balance, "gift", "violet"],
          ["Reward Orders", String(account.rewardOrders), "receipt", "blue"],
          ["Member Level", walletLoaded ? `LV.${member.current.level} ${member.current.name}` : "—", "crown", "green"],
        ] as const).map(([label, value, icon, tone]) => (
          <div className={"qa-sparks-metric" + (label === "Member Level" ? " qa-sparks-member-metric" : "")} key={label}>
            <span className={"qa-sparks-metric-icon qa-sparks-tone-" + tone}><SparksIcon name={icon} size={27}/></span>
            <div><div className="qa-sparks-metric-label">{label}</div><strong>{value}</strong></div>
          </div>
        ))}
      </section>
      {error ? <div className="qa-sparks-inline-error" role="alert">{error}</div> : null}
      {loading ? <div className="qa-sparks-loading" role="status">กำลังอัปเดต Sparks...</div> : null}
      <nav className="qa-sparks-tabs" role="tablist" aria-label="QA Sparks sections">
        {tabs.map((tab) => <button type="button" role="tab" id={"qa-sparks-tab-" + tab.key}
          aria-controls={"qa-sparks-panel-" + tab.key} aria-selected={view === tab.key} tabIndex={view === tab.key ? 0 : -1}
          key={tab.key} className={view === tab.key ? "qa-sparks-tab active" : "qa-sparks-tab"} onClick={() => setView(tab.key)}>
          <SparksIcon name={tab.icon} size={19}/>{tab.label}
        </button>)}
      </nav>
      <div role="tabpanel" id={"qa-sparks-panel-" + view} aria-labelledby={"qa-sparks-tab-" + view} className="qa-sparks-content">
        {view === "overview" && walletLoaded ? <MemberJourney earned={account.memberYearEarned} year={account.memberYear}/> : null}
        {(view === "overview" || view === "quests") ? <section className="qa-sparks-compact-section qa-sparks-quest-center" aria-label="Quest Center">
          <div className="qa-sparks-compact-header"><h2><SparksIcon name="calendar" size={19}/> Quest Center</h2><span>2 Quests</span></div>
          <div className="qa-sparks-mini-grid qa-sparks-quest-grid">
            <DailyCheckinQuest username={username} sessionId={adminSessionId} claimedDays={account.dailyCheckinClaimedDays || []} loaded={walletLoaded}/>
            <ProfileMakeoverQuest username={username} claimedAt={account.profileMakeoverClaimedAt} loaded={walletLoaded}/>
          </div>
        </section> : null}
        {view === "overview" ? <div className="qa-sparks-dual">
          <section className="qa-sparks-panel"><h2><SparksIcon name="gift"/> Reward Center</h2><div className="qa-sparks-mini-grid qa-sparks-reward-grid"><TypingReliefRewardCard username={username} sessionId={adminSessionId} balance={account.balance} owned={account.typingReliefOwned} loaded={walletLoaded}/><TrueMoneyReward mode="reward" username={username} sessionId={adminSessionId} balance={account.balance} loaded={walletLoaded}/></div></section>
          <section className="qa-sparks-panel"><h2><SparksIcon name="clock"/> History</h2><SparksHistory history={account.history}/></section>
        </div> : view === "quests" ? null : view === "rewards" ? <section className="qa-sparks-panel qa-sparks-single"><h2><SparksIcon name="gift"/> Reward Center</h2><div className="qa-sparks-mini-grid qa-sparks-reward-grid"><TypingReliefRewardCard username={username} sessionId={adminSessionId} balance={account.balance} owned={account.typingReliefOwned} loaded={walletLoaded}/><TrueMoneyReward mode="reward" username={username} sessionId={adminSessionId} balance={account.balance} loaded={walletLoaded}/></div></section>
        : view === "items" ? <section className="qa-sparks-panel qa-sparks-single"><h2><SparksIcon name="package"/> My Items</h2>
          <div className="qa-sparks-mini-grid qa-sparks-inventory-grid">
            {walletLoaded && account.typingReliefOwned > 0 ? <TypingReliefRewardCard mode="inventory" username={username} sessionId={adminSessionId} balance={account.balance} owned={account.typingReliefOwned} loaded={walletLoaded}/> : null}
            <TrueMoneyReward mode="inventory" username={username} sessionId={adminSessionId} balance={account.balance} loaded={walletLoaded} hasOtherItems={walletLoaded && account.typingReliefOwned > 0}/>
          </div>
        </section>
        : view === "history" ? <section className="qa-sparks-panel qa-sparks-single"><h2><SparksIcon name="clock"/> History</h2><SparksHistory history={account.history} large/></section>
        : adminAccess ? <SparksAdminPanel actorUsername={username} sessionId={adminSessionId} ownAccount={ownAccountSnapshot} active={active} /> : null}
      </div>
    </div>
  </main>;
}

