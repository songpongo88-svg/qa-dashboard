import React, { useState } from "react";
import { TYPING_RELIEF, typingReliefAction } from "./typingReliefReward";

type Props = {
  username: string;
  sessionId: string;
  balance: number;
  owned: number;
  loaded: boolean;
};

export default function TypingReliefRewardCard({ username, sessionId, balance, owned, loaded }: Props) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const remainingSlots = Math.max(0, TYPING_RELIEF.maxOwned - owned);
  const canBuy = loaded && Boolean(username) && Boolean(sessionId) && owned < TYPING_RELIEF.maxOwned
    && balance >= TYPING_RELIEF.price && !busy;

  const purchase = async () => {
    if (!canBuy) return;
    setBusy(true);
    setError("");
    try {
      const requestId = crypto.randomUUID();
      const result = await typingReliefAction("redeem-typing-relief", username, sessionId, { requestId });
      setConfirm(false);
      setNotice(result.alreadyApplied ? "รายการนี้เคยแลกแล้ว" : "แลก Typing Relief สำเร็จ เก็บสิทธิ์ไว้ในบัญชีแล้ว");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "แลก Typing Relief ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return <article className="qa-sparks-reward-item" aria-label="Typing Relief">
    <div className="qa-sparks-reward-item-icon" aria-hidden="true">
      <svg width="58" height="58" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="7" y="18" width="50" height="31" rx="7"/>
        <path d="M15 27h2m7 0h2m7 0h2m7 0h2m7 0h2M15 35h2m7 0h2m7 0h2m7 0h2m7 0h2M22 42h21"/>
        <path d="m44 9 4 4-4 4M48 13H35"/>
      </svg>
    </div>
    <div className="qa-sparks-reward-item-body">
      <span className="qa-sparks-reward-item-category">QA ACCESS CHECK · DIGITAL REWARD</span>
      <h3>Typing Relief</h3>
      <p>สิทธิ์ลดจำนวนคำพิมพ์ใน QA Access ได้สูงสุด 60 คำต่อ 1 สิทธิ์</p>
      <div className="qa-sparks-reward-item-pills">
        <span>ลดสูงสุด 60 คำ</span><span>สะสมได้ 10 สิทธิ์</span><span>เก็บไว้ใช้ทีหลังได้</span>
      </div>
      <div className="qa-sparks-reward-item-owned">สิทธิ์ที่มี: <strong>{loaded ? owned : "—"}/10</strong>{loaded ? ` · ซื้อเพิ่มได้อีก ${remainingSlots} สิทธิ์` : " · กำลังตรวจสอบยอด"}</div>
      <div className="qa-sparks-reward-item-footer">
        <div><strong>150</strong> <span>QA Sparks / สิทธิ์</span></div>
        <button type="button" onClick={() => { setError(""); setNotice(""); setConfirm(true); }} disabled={!canBuy}>
          {busy ? "กำลังแลก..." : owned >= TYPING_RELIEF.maxOwned ? "สิทธิ์เต็ม 10/10" : !loaded ? "รอเชื่อมต่อ Firestore" : balance < TYPING_RELIEF.price ? "Sparks ไม่เพียงพอ" : "แลก 1 สิทธิ์"}
        </button>
      </div>
      <p className="qa-sparks-reward-item-footnote">เมื่อ QA Access บังคับพิมพ์ สามารถเลือกใช้สิทธิ์หรือพิมพ์ตามปกติได้ · สิทธิ์ไม่ใช้แทนการพิมพ์ประโยค</p>
      {notice ? <p role="status" className="qa-sparks-reward-item-success">{notice}</p> : null}
      {error ? <p role="alert" className="qa-sparks-inline-error">{error}</p> : null}
    </div>
    {confirm ? <div className="qa-sparks-reward-confirm-overlay" role="presentation">
      <div role="dialog" aria-modal="true" aria-label="ยืนยันแลก Typing Relief" className="qa-sparks-reward-confirm">
        <h3>ยืนยันแลก Typing Relief</h3>
        <p>ใช้ <strong>150 Sparks</strong> เพื่อรับสิทธิ์ลดจำนวนคำพิมพ์ 60 คำ จำนวน 1 สิทธิ์</p>
        <p>หลังแลก: Sparks คงเหลือ <strong>{balance - TYPING_RELIEF.price}</strong> · สิทธิ์สะสม <strong>{owned + 1}/10</strong></p>
        <div>
          <button type="button" onClick={() => setConfirm(false)} disabled={busy}>ยกเลิก</button>
          <button type="button" onClick={() => void purchase()} disabled={!canBuy}>{busy ? "กำลังบันทึก..." : "ยืนยันแลก 150 Sparks"}</button>
        </div>
      </div>
    </div> : null}
  </article>;
}
