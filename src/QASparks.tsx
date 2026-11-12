import React, { useEffect, useMemo, useRef, useState } from "react";
import { EMPTY_SPARKS_ACCOUNT, getSparksAccount, invalidateSparksAccount, type SparksAccount } from "./qaSparksStore";
import "./qaSparks.css";
import SparksHistory from "./SparksHistory";
import FirstLoginSparksModal from "./FirstLoginSparksModal";
import SparksEmailAuth, { type SparksVerifiedActor } from "./SparksEmailAuth";
import SparksAdminPanel from "./SparksAdminPanel";
import SparksQaCredentialMigration from "./SparksQaCredentialMigration";
import TypingReliefRewardCard from "./TypingReliefRewardCard";
import QaAutoPassRewardCard from "./QaAutoPassRewardCard";
import DailyCheckinQuest from "./DailyCheckinQuest";
import ProfileMakeoverQuest from "./ProfileMakeoverQuest";
import TrueMoneyReward from "./TrueMoneyReward";
import AnnouncementShieldItem from "./AnnouncementShieldItem";
import FruitMatchGame from "./FruitMatchGame";
import SnakesLaddersGame from "./SnakesLaddersGame";
import SparksMiniGamesGallery, {type SparksGameChoice} from "./SparksMiniGamesGallery";
import QALottery from "./QALottery";
import SpecialRewardCenter from "./SpecialRewardCenter";
import LotteryTicketInventory from "./LotteryTicketInventory";
import { sparksCalendarYear } from "./qaSparksMemberLevels";
import MemberJourney, { SparksWalletSummary } from "./SparksMembership";

type SparksView = "overview" | "quests" | "games" | "rewards" | "items" | "history" | "admin";
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
export default function QASparks({ displayName = "", username = "", adminAccess = false, adminSessionId = "", active = true, verifiedSparksActor = null }: { displayName?: string; username?: string; adminAccess?: boolean; adminSessionId?: string; active?: boolean; verifiedSparksActor?: SparksVerifiedActor | null }) {
  const [view, setView] = useState<SparksView>("overview");
  const emailAuthMode = String(import.meta.env?.VITE_SPARKS_AUTH_MODE || "legacy");
  const normalizedSparksUser = username.trim().toLowerCase();
  // Every employee may voluntarily switch to Supabase login without modifying
  // the legacy fallback until OTP delivery and roster data are fully reviewed.
  // This local preference never grants access: server checks Supabase identity.
  const [emailAuthChoices,setEmailAuthChoices] = useState<Record<string,boolean>>({});
  const choiceKey = "qa:sparks:supabase-login:" + normalizedSparksUser;
  const rememberedChoice = (() => {
    if(!normalizedSparksUser || typeof window==="undefined")return false;
    try{return window.localStorage.getItem(choiceKey)==="1";}
    catch{return false;}
  })();
  const emailOptedIn = emailAuthChoices[normalizedSparksUser] ?? rememberedChoice;
  const chooseEmailAuth = (enabled:boolean) => {
    if(!normalizedSparksUser)return;
    try {
      if(enabled)window.localStorage.setItem(choiceKey,"1");
      else window.localStorage.removeItem(choiceKey);
    } catch {/* Browser storage does not control authorization. */}
    setEmailAuthChoices(current=>({...current,[normalizedSparksUser]:enabled}));
  };
  // Hybrid mode must allow the owner to return to the existing, server-verified
  // QA Dashboard session when the Supabase email provider is rate-limited.
  // The backend validates the QA session, role, suspension and policy before
  // any Sparks admin action; client state never grants admin privileges.
  const emailAuthEnabled = emailAuthMode === "supabase" || (
    emailAuthMode === "hybrid" && (Boolean(verifiedSparksActor) || emailOptedIn)
  );
  const [verifiedActor, setVerifiedActor] = useState<SparksVerifiedActor | null>(verifiedSparksActor);
  const sparksAllowed = !emailAuthEnabled || (verifiedActor?.username.toLowerCase() === username.toLowerCase() && Boolean(username));
  const sparksSessionId = emailAuthEnabled ? "supabase-email-auth" : adminSessionId;
  useEffect(()=>{
    if (!emailAuthEnabled || !sparksAllowed || !active) return;
    let current=true;
    void fetch("/api/sparks-auth",{credentials:"same-origin",cache:"no-store"})
      .then(async response=>{
        if(!current)return;
        if(response.status===401 || response.status===403){
          setVerifiedActor(null);
          return;
        }
        if(!response.ok)return; // temporary service errors must not destroy the session
        const payload=await response.json();
        if(current && (
          payload?.actor?.username?.toLowerCase()!==username.toLowerCase() ||
          payload?.actor?.status!=="Active"
        ))setVerifiedActor(null);
      }).catch(()=>{}); // server still checks every wallet and redemption request
    return()=>{current=false};
  },[emailAuthEnabled,sparksAllowed,active,username]);
  const [itemShelf,setItemShelf] = useState<"available"|"processing"|"history">("available");
  const [itemClock,setItemClock] = useState(0);
  const [gamesOpened, setGamesOpened] = useState(false);
  const [gameMode,setGameMode]=useState<SparksGameChoice|null>(null);
  const [account, setAccount] = useState<SparksAccount>(EMPTY_SPARKS_ACCOUNT);
  const [lastAccountLoadAt, setLastAccountLoadAt] = useState("");
  const [lastAccountUsername, setLastAccountUsername] = useState("");
  const [error, setError] = useState("");
  const [retryTick,setRetryTick]=useState(0);
  const [loading, setLoading] = useState(false);
  const requestSequence = useRef(0);
  const historyLimit = view === "history" ? 100 : view === "overview" ? 5 : 0;
  // Expiry transitions update locally while My Items is open; no extra API reads.
  useEffect(()=>{
    if(view!=="items"||!active)return;
    const interval=window.setInterval(()=>setItemClock(value=>value+1),60_000);
    return()=>window.clearInterval(interval);
  },[view,active]);
  useEffect(() => {
    setAccount(EMPTY_SPARKS_ACCOUNT);
    setLastAccountLoadAt("");
    setLastAccountUsername("");
    setError("");
  }, [username]);
  useEffect(() => {
    let alive = true;
    if (!username || !sparksAllowed) return;
    const refresh = (force = false) => {
      if (!active || document.visibilityState === "hidden") return;
      const sequence = ++requestSequence.current;
      setLoading(true);
      void getSparksAccount(username, { historyLimit, forceRefresh: force, sessionId: sparksSessionId }).then((result) => {
        if (alive && sequence === requestSequence.current) { setAccount(result); setLastAccountUsername(username); setLastAccountLoadAt(new Date().toISOString()); setError(""); }
      }).catch((failure) => {
        if(alive && sequence===requestSequence.current){
          const code=String(failure?.code||"").toLowerCase();
          const details=String(failure?.message||"");
          const message=code==="firebase-auth-quota"
            ?"Firebase จำกัดการตรวจสอบสิทธิ์ QA ชั่วคราว ไม่ใช่โควตาของกระเป๋า Sparks บน Supabase คะแนนเดิมไม่ได้ถูกลบ"
            :code.includes("resource-exhausted")||/quota|resource.exhausted/i.test(details)
            ?"ฐานข้อมูล Sparks ถึงขีดจำกัดการอ่านชั่วคราว กรุณารอให้โควตาพร้อมใช้งาน"
            :code.includes("permission")||code.includes("unauthenticated")||/session|สิทธิ์/i.test(details)
              ?"ไม่สามารถยืนยันสิทธิ์ในการอ่าน Sparks กรุณาออกจากระบบแล้ว Login ใหม่"
              :"ยังเชื่อมต่อข้อมูลกระเป๋า Sparks ไม่สำเร็จ ("+(code||"network")+"). ข้อมูลคะแนนเดิมไม่ได้ถูกลบ";
          setError(message);
          console.error("QA Sparks wallet read failed",code,details);
        }
      }).finally(() => { if (alive && sequence === requestSequence.current) setLoading(false); });
    };
    const changed = () => { invalidateSparksAccount(username); refresh(true); };
    const focused = () => refresh();
    refresh();
    window.addEventListener("qa:sparks-updated", changed);
    window.addEventListener("focus", focused);
    return () => { alive = false; window.removeEventListener("qa:sparks-updated", changed); window.removeEventListener("focus", focused); };
  }, [username, active, historyLimit, sparksSessionId, retryTick, sparksAllowed]);

  // Local-only midnight rollover: do not poll Firestore or create quota pressure.
  // The next normal refresh loads the current year's actual wallet.
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      const year = sparksCalendarYear();
      setAccount(current => current.memberYear === year ? current :
        { ...current, memberYear: year, memberYearEarned: 0, balance: 0 });
    }, 60_000);
    return () => window.clearInterval(id);
  }, [active]);

  const ownAccountSnapshot = useMemo(() => lastAccountLoadAt && lastAccountUsername.toLowerCase() === username.toLowerCase()
    ? { ...account, lastLoadedAt: lastAccountLoadAt } : null, [account, lastAccountLoadAt, lastAccountUsername, username]);
  const tabs: { key: SparksView; label: string; icon: SparksIconName }[] = [
    { key: "overview", label: "Overview", icon: "grid" },
    { key: "quests", label: "Quest Center", icon: "calendar" },
    { key: "games", label: "Mini Games", icon: "grid" },
    { key: "rewards", label: "Reward Center", icon: "gift" },
    { key: "items", label: "My Items", icon: "package" },
    { key: "history", label: "History", icon: "clock" },
    ...(adminAccess && (!emailAuthEnabled || (verifiedActor?.role === "Quality Assurance" && verifiedActor?.username === "songpon")) && import.meta.env?.VITE_SPARKS_CLOUD_READ_ONLY !== "1" ? [{ key: "admin" as SparksView, label: "Sparks Admin", icon: "crown" as SparksIconName }] : []),
  ];
  const walletLoaded = Boolean(lastAccountLoadAt && lastAccountUsername.toLowerCase() === username.toLowerCase());
  if (emailAuthEnabled && !sparksAllowed) return <div data-sparks-employee-email-login="true">
    <SparksEmailAuth username={username} onVerified={actor=>{
      setVerifiedActor(actor);
      if(emailAuthMode==="hybrid")chooseEmailAuth(true);
    }}/>
    {emailAuthMode==="hybrid" && !verifiedSparksActor && <div style={{textAlign:"center",padding:"0 16px 24px"}}>
      <button type="button" data-sparks-legacy-fallback="true" onClick={()=>{
        void fetch("/api/sparks-auth",{method:"DELETE",credentials:"same-origin"}).catch(()=>{}).finally(()=>{
          chooseEmailAuth(false);
          setVerifiedActor(null);
        });
      }}>กลับไปใช้บัญชี QA Dashboard เดิม (ไม่ต้อง OTP)</button>
    </div>}
  </div>;
  return <main data-qa-sparks="true" data-sparks-data-mode={username ? "account" : "not-configured"} className="qa-sparks-page">
    <div className="qa-sparks-container">
      <header className="qa-sparks-page-heading"><SparksIcon name="gift" size={26}/><div><div className="qa-sparks-eyebrow">QA Dashboard · Rewards</div><h1>My QA Sparks / Reward Center</h1></div></header>
      <section className="qa-sparks-hero qa-sparks-hero--membership">
        <div className="qa-sparks-hero-copy">
          <div className="qa-sparks-eyebrow">MY REWARDS</div><h2>My QA Sparks</h2>
          <p>ระบบสะสมและแลกรางวัลสำหรับ QA Dashboard</p>
        </div>
        {displayName || username ? <div className="qa-sparks-member-owner"><span className="qa-sparks-owner-avatar" aria-hidden="true">QA</span><div><small>บัญชีผู้ใช้งาน</small><span>{displayName || username}</span></div></div> : null}
      </section>
      {emailAuthMode==="hybrid" && Boolean(normalizedSparksUser) && <section
        className="qa-sparks-auth-status" data-sparks-auth-mode={emailAuthEnabled?"supabase":"qa-session"}
        aria-label="สถานะการเข้าสู่ระบบ QA Sparks">
        <div className="qa-sparks-auth-status-copy">
          <strong>{emailAuthEnabled && verifiedActor?.username.toLowerCase()===normalizedSparksUser
            ?"เชื่อมต่อ Supabase Auth แล้ว":"กำลังใช้ QA Dashboard Login เดิม"}</strong>
          <span>{emailAuthEnabled
            ?"ยืนยันตัวตนผ่าน Supabase สำหรับ QA Sparks โดยไม่ต้องใช้ Firebase Session"
            :"การยืนยันตัวตนสำหรับ Sparks ยังใช้ QA Session ซึ่งอาจใช้โควต้า Firestore"}</span>
        </div>
        {emailAuthEnabled ? <button type="button" data-sparks-supabase-signout="true"
          onClick={()=>{
            void fetch("/api/sparks-auth",{method:"DELETE",credentials:"same-origin"}).finally(()=>{
              chooseEmailAuth(false);
              setVerifiedActor(null);
            });
          }}>ออกจาก QA Sparks (Supabase)</button> :
          <button type="button" data-sparks-supabase-optin="true"
            onClick={()=>chooseEmailAuth(true)}>เข้าใช้ Sparks ผ่าน Supabase</button>}
      </section>}
      {import.meta.env?.VITE_SPARKS_CLOUD_READ_ONLY === "1" ? <div role="status" className="qa-sparks-inline-error" style={{borderColor:"#a5b4fc",background:"#eef2ff",color:"#312e81"}}>
        <strong>SUPABASE PREVIEW · อ่านข้อมูลอย่างเดียว</strong> — นี่คือเว็บทดสอบสำหรับเทียบยอด Sparks และประวัติ
        ระบบปิดการรับแต้ม แลกรางวัล เล่นเกม และการทำธุรกรรมทั้งหมด รวมถึงปุ่ม Sparks Admin ไว้ การกดทำรายการจะไม่เปลี่ยนคะแนนจริง
      </div> : null}
      {error ? <div className="qa-sparks-inline-error" role="alert">{error} <button type="button" style={{marginLeft:12,textDecoration:"underline",fontWeight:700}} onClick={()=>{invalidateSparksAccount(username);setRetryTick(n=>n+1);}}>ลองโหลดอีกครั้ง</button></div> : null}
      {walletLoaded&&account.historyUnavailable&&historyLimit>0?<div className="qa-sparks-inline-error" role="status">โหลดกระเป๋า Sparks ได้แล้ว แต่ประวัติบางรายการยังไม่พร้อมแสดง ข้อมูลประวัติเดิมไม่ได้ถูกลบ</div>:null}
      {walletLoaded&&account.recoverySource==="server"?<div className="qa-sparks-loading" role="status">ยอดกระเป๋านี้ได้รับการยืนยันจากเซิร์ฟเวอร์ QA Sparks</div>:null}
      {loading ? <div className="qa-sparks-loading" role="status">กำลังอัปเดต Sparks...</div> : null}
      <nav className="qa-sparks-tabs" role="tablist" aria-label="QA Sparks sections">
        {tabs.map((tab) => <button type="button" role="tab" id={"qa-sparks-tab-" + tab.key}
          aria-controls={"qa-sparks-panel-" + tab.key} aria-selected={view === tab.key} tabIndex={view === tab.key ? 0 : -1}
          key={tab.key} className={view === tab.key ? "qa-sparks-tab active" : "qa-sparks-tab"} onClick={() => { if (tab.key === "games") {setGamesOpened(true);setGameMode(null);} setView(tab.key); }}>
          <SparksIcon name={tab.icon} size={19}/>{tab.label}
        </button>)}
      </nav>
      <div role="tabpanel" id={"qa-sparks-panel-" + view} aria-labelledby={"qa-sparks-tab-" + view} className="qa-sparks-content">
        {gamesOpened && view==="games" ? <section className="qa-sparks-games-container" aria-label="Mini Games">
          {gameMode===null
            ? <SparksMiniGamesGallery privateSnakes={adminAccess&&username.trim().toLowerCase()==="songpon"} onSelect={choice=>{if(choice==="fruit"||(choice==="snakes"&&adminAccess&&username.trim().toLowerCase()==="songpon"))setGameMode(choice);}}/>
            : <>
                <div className="qa-sparks-game-backbar">
                  <button type="button" data-sparks-back-to-games="true" onClick={()=>setGameMode(null)}>‹ กลับไปเลือกเกม</button>
                  <span>{gameMode==="snakes"?"บันไดงู Multiplayer":"Fruit Match"}</span>
                </div>
                {gameMode==="snakes"&&adminAccess&&username.trim().toLowerCase()==="songpon" ? <SnakesLaddersGame privateTest key={username+":"+sparksSessionId+":snakes"} username={username} sessionId={sparksSessionId}/> : gameMode==="fruit" ? <FruitMatchGame key={username+":"+sparksSessionId+":fruit"} username={username} sessionId={sparksSessionId}/> : null}
              </>}
        </section> : null}
        {view === "overview" && walletLoaded ? <MemberJourney key={username + ":" + account.memberYear} earned={account.memberYearEarned} year={account.memberYear} displayName={displayName || username} balance={account.balance} rewardOrders={account.rewardOrders}/> : null}
        {view !== "overview" && view !== "admin" && view !== "games" && walletLoaded ? <section className="qa-sparks-membership qa-sparks-wallet-strip" aria-label="ยอด Sparks ของคุณ"><SparksWalletSummary balance={account.balance} rewardOrders={account.rewardOrders} compact/></section> : null}
        {(view === "overview" || view === "quests") ? <section className="qa-sparks-compact-section qa-sparks-quest-center" aria-label="Quest Center">
          <div className="qa-sparks-compact-header"><h2><SparksIcon name="calendar" size={19}/> Quest Center</h2><span>3 Quests</span></div>
          <div className="qa-sparks-mini-grid qa-sparks-quest-grid">
            <DailyCheckinQuest username={username} sessionId={sparksSessionId} claimedDays={account.dailyCheckinClaimedDays || []} loaded={walletLoaded}/>
            <ProfileMakeoverQuest username={username} claimedAt={account.profileMakeoverClaimedAt} loaded={walletLoaded}/>
            <QALottery username={username} sessionId={sparksSessionId} balance={account.balance} loaded={walletLoaded}/>
          </div>
        </section> : null}
        {view === "overview" ? <div className="qa-sparks-dual">
          <section className="qa-sparks-panel"><h2><SparksIcon name="gift"/> Reward Center</h2><div className="qa-sparks-mini-grid qa-sparks-reward-grid"><TypingReliefRewardCard username={username} sessionId={sparksSessionId} balance={account.balance} owned={account.typingReliefOwned} loaded={walletLoaded}/><QaAutoPassRewardCard username={username} sessionId={sparksSessionId} balance={account.balance} owned={account.autoPassOwned} freeClaimedAt={account.autoPassFreeClaimedAt} loaded={walletLoaded}/><TrueMoneyReward mode="reward" username={username} sessionId={sparksSessionId} balance={account.balance} loaded={walletLoaded}/><AnnouncementShieldItem mode="reward" username={username} sessionId={sparksSessionId} balance={account.balance}/><SpecialRewardCenter mode="reward" username={username} sessionId={sparksSessionId} balance={account.balance} loaded={walletLoaded}/></div></section>
          <section className="qa-sparks-panel"><h2><SparksIcon name="clock"/> History</h2><SparksHistory history={account.history}/></section>
        </div> : view === "quests" || view === "games" ? null : view === "rewards" ? <section className="qa-sparks-panel qa-sparks-single"><h2><SparksIcon name="gift"/> Reward Center</h2><div className="qa-sparks-mini-grid qa-sparks-reward-grid"><TypingReliefRewardCard username={username} sessionId={sparksSessionId} balance={account.balance} owned={account.typingReliefOwned} loaded={walletLoaded}/><QaAutoPassRewardCard username={username} sessionId={sparksSessionId} balance={account.balance} owned={account.autoPassOwned} freeClaimedAt={account.autoPassFreeClaimedAt} loaded={walletLoaded}/><TrueMoneyReward mode="reward" username={username} sessionId={sparksSessionId} balance={account.balance} loaded={walletLoaded}/><AnnouncementShieldItem mode="reward" username={username} sessionId={sparksSessionId} balance={account.balance}/><SpecialRewardCenter mode="reward" username={username} sessionId={sparksSessionId} balance={account.balance} loaded={walletLoaded}/></div></section>
        : view === "items" ? <section className="qa-sparks-panel qa-sparks-single qa-sparks-items-panel" data-inventory-clock={itemClock}>
          <h2><SparksIcon name="package"/> My Items</h2>
          <p className="qa-sparks-items-description">เลือกดู Item ตามสถานะ โดยรายการที่ใช้แล้วหรือหมดอายุจะเก็บไว้ในประวัติ ไม่ลบข้อมูลย้อนหลัง</p>
          <div className="qa-sparks-items-toolbar">
            <span>รายการทั้งหมดเก็บไว้ตามสถานะ ไม่มีการลบประวัติ</span>
            <button type="button" onClick={()=>window.dispatchEvent(new Event("qa:sparks-items-refresh"))}>
              รีเฟรชสถานะ Item
            </button>
          </div>
          <div className="qa-sparks-items-tabs" role="group" aria-label="เลือกสถานะ My Items">
            {([["available","พร้อมใช้งาน"],["processing","กำลังดำเนินการ"],["history","ประวัติ Item"]] as const).map(([key,label])=>
              <button key={key} type="button" aria-pressed={itemShelf===key} className={itemShelf===key?"active":""}
                onClick={()=>setItemShelf(key)}>{label}</button>)}
          </div>
          <div className="qa-sparks-mini-grid qa-sparks-inventory-grid" data-item-shelf={itemShelf}>
            {itemShelf==="available"&&walletLoaded&&account.typingReliefOwned>0
              ?<TypingReliefRewardCard mode="inventory" username={username} sessionId={sparksSessionId}
                  balance={account.balance} owned={account.typingReliefOwned} loaded={walletLoaded}/>:null}
            {itemShelf==="available"&&walletLoaded&&account.autoPassOwned>0
              ?<QaAutoPassRewardCard mode="inventory" username={username} sessionId={sparksSessionId}
                  balance={account.balance} owned={account.autoPassOwned}
                  freeClaimedAt={account.autoPassFreeClaimedAt} loaded={walletLoaded}/>:null}
            <AnnouncementShieldItem mode="inventory" username={username} sessionId={sparksSessionId} balance={account.balance} inventoryFilter={itemShelf}/>
            <TrueMoneyReward mode="inventory" username={username} sessionId={sparksSessionId} balance={account.balance}
              loaded={walletLoaded} hasOtherItems={true} inventoryFilter={itemShelf}/>
            <SpecialRewardCenter mode="inventory" username={username} sessionId={sparksSessionId}
              balance={account.balance} loaded={walletLoaded} hasOtherItems={true} inventoryFilter={itemShelf}/>
            <LotteryTicketInventory username={username} sessionId={sparksSessionId} loaded={walletLoaded}
              inventoryFilter={itemShelf}/>
          </div>
          <div className="qa-sparks-items-state-empty" role="status">
            {itemShelf==="available"?"ยังไม่มี Item ที่พร้อมใช้งาน":
              itemShelf==="processing"?"ไม่มี Item ที่กำลังดำเนินการ":"ยังไม่มีประวัติ Item ในหมวดนี้"}
          </div>
        </section>
        : view === "history" ? <section className="qa-sparks-panel qa-sparks-single"><h2><SparksIcon name="clock"/> History</h2><SparksHistory history={account.history} large/></section>
        : adminAccess ? <div>
          {/* Visibility is owner-role gated here. Server validates the real QA session or verified Supabase Auth on every action. */}
          {username.trim().toLowerCase()==="songpon" && import.meta.env?.VITE_SPARKS_CLOUD_READ_ONLY !== "1"
            ? <SparksQaCredentialMigration actorUsername={username} sessionId={adminSessionId}/> : null}
          <SparksAdminPanel key={username + ":" + sparksSessionId} actorUsername={username} sessionId={sparksSessionId} ownAccount={ownAccountSnapshot} active={active} />
        </div> : null}
      </div>
    </div>
    {username && active && import.meta.env?.VITE_SPARKS_CLOUD_READ_ONLY !== "1"
      ? <FirstLoginSparksModal key={username+":"+sparksSessionId}
          username={username} sessionId={sparksSessionId} /> : null}
  </main>;
}

