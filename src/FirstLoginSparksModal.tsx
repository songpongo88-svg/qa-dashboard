import React, { useEffect, useState } from "react";
import { claimFirstLoginSparks, FRUIT_CARDS, getSparksAccount, randomPrizeValues, type FirstLoginPrize } from "./qaSparksStore";
import "./qaSparks.css";

type ModalStatus = "checking" | "hidden" | "ready" | "claiming" | "revealed" | "dismissed";
const FRUIT_EMOJI = ["🍎", "🍌", "🍊", "🍇", "🍓", "🍉", "🍍", "🥭", "🍒", "🍑"];
const FRUIT_PHOTOS = [
  "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=360&h=330&fit=crop&auto=format&q=85",
  "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=360&h=330&fit=crop&auto=format&q=85",
  "https://images.unsplash.com/photo-1547514701-42782101795e?w=360&h=330&fit=crop&auto=format&q=85",
  "https://images.unsplash.com/photo-1537640538966-79f369143f8f?w=360&h=330&fit=crop&auto=format&q=85",
  "https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=360&h=330&fit=crop&auto=format&q=85",
  "https://images.unsplash.com/photo-1563114773-84221bd62daa?w=360&h=330&fit=crop&auto=format&q=85",
  "https://images.unsplash.com/photo-1550258987-190a2d41a8ba?w=360&h=330&fit=crop&auto=format&q=85",
  "https://images.unsplash.com/photo-1553279768-865429fa0078?w=360&h=330&fit=crop&auto=format&q=85",
  "https://images.unsplash.com/photo-1528825871115-3581a5387919?w=360&h=330&fit=crop&auto=format&q=85",
  "https://images.unsplash.com/photo-1629828874514-c1e5103f0550?w=360&h=330&fit=crop&auto=format&q=85"
];
export default function FirstLoginSparksModal({ username }: { username: string }) {
  const [status, setStatus] = useState<ModalStatus>("checking");
  const [selected, setSelected] = useState<string>("");
  const [prize, setPrize] = useState<FirstLoginPrize | null>(null);
  const [amounts, setAmounts] = useState<number[]>(randomPrizeValues);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setStatus("checking");
    setError("");
    setSelected("");
    setPrize(null);
    setAmounts(randomPrizeValues());
    if (!username) return;
    getSparksAccount(username).then((account) => {
      if (active) setStatus(account.firstLogin ? "hidden" : "ready");
    }).catch((reason) => {
      console.warn("Unable to verify Sparks first-login eligibility", reason);
      // Never offer an unverified grant or display a fake success.
      if (active) setStatus("hidden");
    });
    return () => { active = false; };
  }, [username]);

  useEffect(() => {
    if (status !== "ready" && status !== "claiming" && status !== "revealed") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [status]);

  if (status === "hidden" || status === "checking" || status === "dismissed") return null;

  const selectCard = async (card: typeof FRUIT_CARDS[number], index: number) => {
    if (status !== "ready") return;
    setSelected(card.id);
    setStatus("claiming");
    setError("");
    try {
      const received = await claimFirstLoginSparks(username, card, amounts[index]);
      setSelected(received.cardId);
      setPrize(received);
      setStatus("revealed");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ไม่สามารถบันทึก Sparks ได้ กรุณาลองอีกครั้ง");
      setSelected("");
      setStatus("ready");
    }
  };

  return <div className="qa-sparks-modal-backdrop" role="presentation">
    <section className="qa-sparks-modal" role="dialog" aria-modal="true" aria-labelledby="qa-sparks-welcome-title">
      <div className="qa-sparks-modal-top">
        <span className="qa-sparks-modal-badge">FIRST LOGIN REWARD</span>
        {status === "ready" ? <button type="button" className="qa-sparks-modal-close" onClick={() => setStatus("dismissed")} aria-label="ไว้ทีหลัง">×</button> : <span className="qa-sparks-modal-gift" aria-hidden="true">✧</span>}
      </div>
      <div className="qa-sparks-modal-heading">
        <span className="qa-sparks-modal-spark" aria-hidden="true">✧</span>
        <h2 id="qa-sparks-welcome-title">Welcome to My QA Sparks!</h2>
        <p>เลือกการ์ดผลไม้ 1 ใบ เพื่อรับ Sparks ต้อนรับ</p>
        <strong>สูงสุด 1,000 Sparks</strong>
      </div>
      <div className="qa-sparks-fruit-grid" aria-label="การ์ดผลไม้ 10 ใบ">
        {FRUIT_CARDS.map((card, index) => {
          const chosen = selected === card.id;
          const disabled = status !== "ready";
          return <button key={card.id} type="button"
            className={"qa-sparks-fruit-card" + (chosen ? " is-selected" : "") + (status === "revealed" && !chosen ? " is-muted" : "")}
            onClick={() => { void selectCard(card, index); }} disabled={disabled}
            aria-label={card.name + (chosen && prize ? ", " + prize.amount + " Sparks" : "")}
            aria-pressed={chosen}>
            <span className="qa-sparks-fruit-photo" aria-hidden="true"><span className="qa-sparks-fruit-photo-fallback">{FRUIT_EMOJI[index]}</span><img src={FRUIT_PHOTOS[index]} alt="" loading="eager" onError={(event) => { event.currentTarget.style.display = "none"; }}/></span>
            <span className="qa-sparks-fruit-name">{card.name}</span>
            {chosen && status === "claiming" ? <span className="qa-sparks-fruit-result">กำลังบันทึก...</span> : null}
            {chosen && status === "revealed" && prize ? <span className="qa-sparks-fruit-result">✧ {prize.amount.toLocaleString()} Sparks</span> : null}
          </button>;
        })}
      </div>
      {error ? <div className="qa-sparks-modal-error" role="alert">{error}</div> : null}
      {status === "revealed" && prize ? <>
        <p className="qa-sparks-modal-congrats" role="status">ยินดีด้วย! ได้รับ {prize.amount.toLocaleString()} Sparks</p>
        <button className="qa-sparks-modal-claim" type="button" onClick={() => setStatus("dismissed")}>รับ Sparks</button>
        <p className="qa-sparks-modal-footnote">บันทึกคะแนนเข้าบัญชีแล้ว · ดูรายการได้ใน History</p>
      </> : <>
        <p className="qa-sparks-modal-hint">{status === "claiming" ? "กำลังบันทึกผลการสุ่ม..." : "เลือกได้ 1 ใบเท่านั้น · สิทธิ์จะถูกบันทึกทันทีเมื่อเลือก"}</p>
        <button className="qa-sparks-modal-later" type="button" disabled={status === "claiming"} onClick={() => setStatus("dismissed")}>ไว้ทีหลัง</button>
      </>}
    </section>
  </div>;
}
