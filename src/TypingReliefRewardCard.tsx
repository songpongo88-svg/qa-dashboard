import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TYPING_RELIEF, typingReliefAction } from "./typingReliefReward";

type Props = {
  username: string;
  sessionId: string;
  balance: number;
  owned: number;
  loaded: boolean;
  mode?: "reward" | "inventory";
};

/** A self-contained collectible illustration; no font icons, emoji, or external image requests. */
function TypingReliefArt({ large = false }: { large?: boolean }) {
  const prefix = useId().replace(/:/g, "");
  const gradient = (name: string) => `url(#${prefix}-${name})`;
  const keys = Array.from({ length: 12 }, (_, index) => ({
    x: 58 + (index % 6) * 32,
    y: 117 + Math.floor(index / 6) * 27,
  }));

  return <svg viewBox="0 0 340 235" role="img" aria-label="ตั๋ว Typing Relief ลอยเหนือคีย์บอร์ดสีม่วงทอง" className={large ? "qa-relief-art-svg large" : "qa-relief-art-svg"}>
    <defs>
      <linearGradient id={prefix + "-base"} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#f9f0ff"/><stop offset="55%" stopColor="#d4b1f8"/><stop offset="100%" stopColor="#a46ad9"/>
      </linearGradient>
      <linearGradient id={prefix + "-keyboard"} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#792fba"/><stop offset="65%" stopColor="#512282"/><stop offset="100%" stopColor="#351254"/>
      </linearGradient>
      <linearGradient id={prefix + "-ticket"} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#fff8ff"/><stop offset="100%" stopColor="#e6caff"/>
      </linearGradient>
      <linearGradient id={prefix + "-gold"} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#fff3bd"/><stop offset="47%" stopColor="#ffcf54"/><stop offset="100%" stopColor="#e79a14"/>
      </linearGradient>
      <filter id={prefix + "-shadow"} x="-40%" y="-50%" width="180%" height="200%">
        <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#58249b" floodOpacity=".33"/>
      </filter>
      <filter id={prefix + "-glow"} x="-120%" y="-120%" width="340%" height="340%">
        <feGaussianBlur stdDeviation="8"/>
      </filter>
    </defs>
    <ellipse cx="161" cy="206" rx="140" ry="15" fill="#5e2b8e" opacity=".22"/>
    <ellipse cx="154" cy="184" rx="124" ry="24" fill="#a269e5" opacity=".28" filter={gradient("glow")}/>
    <g transform="rotate(-13 179 83)" filter={gradient("shadow")}>
      <rect x="95" y="23" width="187" height="92" rx="15" fill={gradient("ticket")} stroke="#fff" strokeWidth="3"/>
      <path d="M229 25v88" stroke="#b989da" strokeWidth="2" strokeDasharray="5 6"/>
      <rect x="110" y="43" width="101" height="11" rx="5.5" fill="#ac76d3" opacity=".52"/>
      <rect x="110" y="63" width="69" height="7" rx="3.5" fill="#caa2e8"/>
      <rect x="110" y="77" width="82" height="7" rx="3.5" fill="#caa2e8"/>
      <circle cx="254" cy="68" r="17" fill={gradient("gold")}/>
      <path d="m254 53 4 11 11 4-11 4-4 11-4-11-11-4 11-4Z" fill="#fff6d8"/>
    </g>
    <g filter={gradient("shadow")} transform="rotate(-8 159 145)">
      <rect x="40" y="93" width="244" height="107" rx="25" fill={gradient("keyboard")} stroke="#f3d7ff" strokeWidth="5"/>
      <rect x="52" y="102" width="221" height="86" rx="18" fill={gradient("base")}/>
      {keys.map((key, index) => <rect key={index} x={key.x} y={key.y} width="25" height="18" rx="5.5" fill="#fff7ff" stroke="#ae7bd3" strokeWidth="1.4"/>)}
      <rect x="101" y="172" width="119" height="10" rx="5" fill="#fff9ff" opacity=".95"/>
    </g>
    <g filter={gradient("shadow")} transform="rotate(8 262 156)">
      <path d="M237 123h45a10 10 0 0 1 10 10v32h14l-46 48-46-48h13v-32a10 10 0 0 1 10-10Z" fill={gradient("gold")} stroke="#fff5c1" strokeWidth="4"/>
      <text x="260" y="156" textAnchor="middle" fontWeight="900" fontSize="25" fontFamily="Kanit, sans-serif" fill="#532569">60</text>
      <text x="260" y="180" textAnchor="middle" fontWeight="750" fontSize="19" fontFamily="Kanit, sans-serif" fill="#532569">%</text>
    </g>
    <path d="m48 29 5 12 12 5-12 5-5 12-5-12-12-5 12-5Z" fill="#ffd770"/>
    <path d="m295 37 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z" fill="#ffe9a7"/>
    <circle cx="24" cy="118" r="4" fill="#ffe9a7"/>
    <circle cx="313" cy="106" r="5" fill="#ffd47c"/>
  </svg>;
}

export default function TypingReliefRewardCard({ username, sessionId, balance, owned, loaded, mode = "reward" }: Props) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [latest, setLatest] = useState<{ balance: number; owned: number } | null>(null);
  const [themeAccent, setThemeAccent] = useState("");
  const [themeDark, setThemeDark] = useState("");
  const purchaseRequestId = useRef("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogId = useId();
  const effectiveBalance = latest && loaded ? latest.balance : balance;
  const effectiveOwned = latest && loaded ? latest.owned : owned;
  const availableSlots = Math.max(0, TYPING_RELIEF.maxOwned - effectiveOwned);
  const canBuy = loaded && Boolean(username) && Boolean(sessionId)
    && effectiveOwned < TYPING_RELIEF.maxOwned
    && effectiveBalance >= TYPING_RELIEF.price && !busy;

  useEffect(() => {
    setLatest(null);
    purchaseRequestId.current = "";
  }, [username]);

  useEffect(() => {
    if (latest && latest.balance === balance && latest.owned === owned) setLatest(null);
  }, [balance, owned, latest]);

  useEffect(() => {
    if (!detailOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        setConfirm(false);
        setDetailOpen(false);
      }
    };
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("keydown", onEscape);
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [detailOpen, busy]);

  const openDetails = () => {
    setError("");
    setNotice("");
    setConfirm(false);
    if (triggerRef.current) {
      const currentTheme = window.getComputedStyle(triggerRef.current);
      setThemeAccent(currentTheme.getPropertyValue("--sparks-accent").trim() || "#7e22ce");
      setThemeDark(currentTheme.getPropertyValue("--sparks-dark").trim() || "#581c87");
    }
    setDetailOpen(true);
  };
  const closeDetails = () => {
    if (busy) return;
    setConfirm(false);
    setDetailOpen(false);
  };
  const purchase = async () => {
    if (!canBuy) return;
    setBusy(true);
    setError("");
    try {
      if (!purchaseRequestId.current) purchaseRequestId.current = crypto.randomUUID();
      const result = await typingReliefAction("redeem-typing-relief", username, sessionId, { requestId: purchaseRequestId.current });
      purchaseRequestId.current = "";
      setLatest({ balance: result.balance, owned: result.owned });
      setConfirm(false);
      setNotice(result.alreadyApplied ? "รายการนี้เคยแลกแล้ว และสิทธิ์ถูกบันทึกไว้ในบัญชีแล้ว" : "แลกสำเร็จ! Typing Relief ถูกเก็บในบัญชี พร้อมใช้กับภารกิจ QA Access");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ไม่สามารถแลก Typing Relief ได้");
    } finally {
      setBusy(false);
    }
  };

  return <>
    <button type="button" className="qa-sparks-mini-item qa-sparks-mini-item--typing" data-reward-item="typing-relief" ref={triggerRef}
      aria-label={mode === "inventory" ? "เปิดรายละเอียด Typing Relief ที่มี " + effectiveOwned + " สิทธิ์" : "ดูรายละเอียดของรางวัล Typing Relief ราคา 150 QA Sparks"} aria-haspopup="dialog"
      aria-expanded={detailOpen} onClick={openDetails}>
      <span className="qa-sparks-mini-art qa-sparks-mini-art--typing">
        <TypingReliefArt/>
        {mode === "inventory" ? <span className="qa-sparks-mini-quantity">×{effectiveOwned}</span> : null}
      </span>
      <strong className="qa-sparks-mini-name">Typing Relief</strong>
      <span className="qa-sparks-mini-value">{mode === "inventory" ? effectiveOwned + " สิทธิ์" : TYPING_RELIEF.price + " Sparks"}</span>
    </button>

    {detailOpen && typeof document !== "undefined" ? createPortal(
      <div className="qa-sparks-reward-detail-backdrop" style={{ "--sparks-accent": themeAccent || "#7e22ce", "--sparks-dark": themeDark || "#581c87" } as React.CSSProperties}
        onMouseDown={(event) => { if (event.target === event.currentTarget) closeDetails(); }}>
        <section className="qa-sparks-reward-detail-modal" role="dialog" aria-modal="true" aria-labelledby={dialogId + "-title"} aria-describedby={dialogId + "-intro"}>
          <button ref={closeRef} className="qa-sparks-reward-detail-close" type="button" onClick={closeDetails} disabled={busy} aria-label="ปิดรายละเอียด Typing Relief">
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round"><path d="M5 5 19 19M19 5 5 19"/></svg>
          </button>
          <div className="qa-sparks-reward-detail-hero">
            <div className="qa-sparks-reward-detail-art"><TypingReliefArt large/></div>
            <div className="qa-sparks-reward-detail-heading">
              <span className="qa-sparks-reward-detail-event-label">✦ SPARKS EVENT · QA ACCESS REWARD</span>
              <h2 id={dialogId + "-title"}>Typing Relief</h2>
              <p id={dialogId + "-intro"}>ไอเทมช่วยแบ่งเบาภารกิจพิมพ์ ให้คุณมีทางเลือกก่อนเริ่ม QA Access Check</p>
              <div className="qa-sparks-reward-detail-tags">
                <span>ลดจำนวนคำพิมพ์ 60%</span><span>เก็บไว้ใช้ภายหลัง</span>
              </div>
            </div>
          </div>
          <div className="qa-sparks-reward-detail-scroll">
            <div className="qa-sparks-reward-detail-stats">
              <div><span>ราคาต่อสิทธิ์</span><strong>{TYPING_RELIEF.price} <small>QA Sparks</small></strong></div>
              <div><span>สิทธิ์ที่สะสม</span><strong>{loaded ? effectiveOwned : "—"}<small> / {TYPING_RELIEF.maxOwned} สิทธิ์</small></strong></div>
              <div><span>ซื้อเพิ่มได้</span><strong>{loaded ? availableSlots : "—"} <small>สิทธิ์</small></strong></div>
            </div>
            <h3 className="qa-sparks-reward-detail-section-title">วิธีใช้งาน</h3>
            <div className="qa-sparks-reward-detail-steps">
              <div><b>01</b><strong>แลกสิทธิ์</strong><p>ใช้ 150 Sparks เพื่อรับ Typing Relief 1 สิทธิ์ เก็บไว้ในบัญชีได้</p></div>
              <div><b>02</b><strong>รอภารกิจ QA Access</strong><p>เมื่อมีภารกิจพิมพ์ ระบบจะแสดงหน้าต่างถามว่าต้องการใช้สิทธิ์หรือไม่</p></div>
              <div><b>03</b><strong>เลือกได้เอง</strong><p>กดใช้เพื่อลดจำนวนคำพิมพ์ 60% ของภารกิจ หรือเลือกพิมพ์ตามปกติโดยไม่ใช้สิทธิ์</p></div>
            </div>
            <div className="qa-sparks-reward-detail-example">
              <div><span>ตัวอย่างภารกิจ</span><strong>100 <small>คำ</small></strong></div>
              <span className="qa-sparks-reward-detail-example-arrow">ลด 60% (60 คำ)</span>
              <div><span>หลังใช้ Typing Relief</span><strong>40 <small>คำ</small></strong></div>
            </div>
            <h3 className="qa-sparks-reward-detail-section-title">เงื่อนไขสำคัญ</h3>
            <ul className="qa-sparks-reward-detail-rules">
              <li>สะสมสิทธิ์ที่ยังไม่ได้ใช้ได้สูงสุด 10 สิทธิ์ ใช้ไป 1 สิทธิ์จึงซื้อเพิ่มได้อีก 1 สิทธิ์</li>
              <li>ใช้ได้เฉพาะ QA Access Check แบบพิมพ์คำ (Word Mode) ไม่ใช้กับแบบพิมพ์ประโยค</li>
              <li>จำนวนคำที่ต้องพิมพ์หลังใช้สิทธิ์คิดจาก 40% ของจำนวนคำที่ได้รับมอบหมาย โดยปัดเศษขึ้น และต้องพิมพ์อย่างน้อย 1 คำ</li>
              <li>ยังต้องพิมพ์ตามจำนวนคำที่เหลือให้ครบ และทำภารกิจให้ผ่านตามเงื่อนไขเดิม</li>
              <li>การเก็บสิทธิ์ไว้ไม่บังคับให้ใช้ เมื่อเลือกพิมพ์ตามปกติจะไม่หักสิทธิ์หรือ Sparks</li>
            </ul>
          </div>

          <div className="qa-sparks-reward-detail-action">
            {mode === "inventory" ? <div className="qa-sparks-reward-detail-inventory-note">
              <strong>คุณมี {effectiveOwned} สิทธิ์</strong>
              <p>เมื่อมีภารกิจ QA Access Check แบบ Word Mode ระบบจะให้เลือกใช้ Typing Relief ก่อนเริ่มพิมพ์</p>
            </div> : null}
            {notice ? <div role="status" className="qa-sparks-reward-detail-success">{notice}</div> : null}
            {error ? <div role="alert" className="qa-sparks-reward-detail-error">{error}</div> : null}
            {mode !== "inventory" && confirm ? <div className="qa-sparks-reward-detail-confirm">
              <strong>ยืนยันการแลก Typing Relief</strong>
              <p>ใช้ {TYPING_RELIEF.price} Sparks รับ 1 สิทธิ์ · หลังแลกคงเหลือ {effectiveBalance - TYPING_RELIEF.price} Sparks และมี {effectiveOwned + 1}/{TYPING_RELIEF.maxOwned} สิทธิ์</p>
              <div>
                <button className="qa-sparks-reward-detail-secondary" type="button" onClick={() => setConfirm(false)} disabled={busy}>กลับไปดูรายละเอียด</button>
                <button className="qa-sparks-reward-detail-primary" type="button" onClick={() => void purchase()} disabled={!canBuy}>{busy ? "กำลังแลก..." : "ยืนยันแลก 150 Sparks"}</button>
              </div>
            </div> : mode === "inventory" ? null : <div className="qa-sparks-reward-detail-purchase">
              <div className="qa-sparks-reward-detail-purchase-copy"><small>YOUR BALANCE</small><strong>{loaded ? effectiveBalance.toLocaleString() : "—"} <span>Sparks</span></strong></div>
              <button className="qa-sparks-reward-detail-primary" type="button" disabled={!canBuy} onClick={() => { setError(""); setNotice(""); setConfirm(true); }}>
                {!loaded ? "กำลังตรวจสอบยอด Sparks" : effectiveOwned >= TYPING_RELIEF.maxOwned ? "สะสมครบ 10 สิทธิ์แล้ว" : effectiveBalance < TYPING_RELIEF.price ? "Sparks ไม่เพียงพอ" : "แลก 1 สิทธิ์ · 150 Sparks"}
              </button>
            </div>}
          </div>
        </section>
      </div>, document.body) : null}
  </>;
}
