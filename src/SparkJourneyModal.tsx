import React, { useEffect, useState } from "react";
import {
  claimSparkJourneySparks, SPARK_JOURNEY_ROUTES, type SparkJourneyPrize,
} from "./qaSparksStore";
import "./SparkJourneyModal.css";

type Stage = "choose" | "saving" | "travelling" | "revealed";
type Route = (typeof SPARK_JOURNEY_ROUTES)[number];

export const sparkJourneyPendingKey = (username: string) =>
  "qa:sparks:journey-pending:" + username.trim().toLowerCase();

export default function SparkJourneyModal({
  username, sessionId = "", initialPrize = null, onDismiss,
}: {
  username: string; sessionId?: string; initialPrize?: SparkJourneyPrize | null;
  onDismiss: (claimed: boolean) => void;
}) {
  const [stage, setStage] = useState<Stage>(initialPrize ? "revealed" : "choose");
  const [route, setRoute] = useState<Route | null>(
    initialPrize ? SPARK_JOURNEY_ROUTES.find((item) => item.id === initialPrize.routeId) || null : null
  );
  const [prize, setPrize] = useState<SparkJourneyPrize | null>(initialPrize);
  const [error, setError] = useState("");

  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = before; };
  }, []);
  useEffect(() => {
    if (stage !== "travelling") return;
    const timeout = window.setTimeout(() => setStage("revealed"), 3900);
    return () => window.clearTimeout(timeout);
  }, [stage]);
  const close = (claimed: boolean) => {
    if (claimed) {
      try { sessionStorage.removeItem(sparkJourneyPendingKey(username)); } catch {}
    }
    onDismiss(claimed);
  };
  const choose = async (item: Route) => {
    if (stage !== "choose") return;
    setRoute(item);
    setStage("saving");
    setError("");
    try {
      // One atomic server claim before the animation, so refresh cannot reroll.
      const awarded = await claimSparkJourneySparks(username, item.id, sessionId);
      try { sessionStorage.setItem(sparkJourneyPendingKey(username), "1"); } catch {}
      setPrize(awarded);
      setRoute(SPARK_JOURNEY_ROUTES.find((candidate) => candidate.id === awarded.routeId) || item);
      setStage("travelling");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "รับรางวัลไม่สำเร็จ กรุณาลองใหม่");
      setStage("choose");
      setRoute(null);
    }
  };
  return <div className="spark-journey-backdrop">
    <section role="dialog" aria-modal="true" aria-labelledby="spark-journey-title"
      className="spark-journey-dialog" data-spark-journey-stage={stage}>
      <header className="spark-journey-top">
        <span className="spark-journey-badge">QA SPARKS · SPECIAL QUEST</span>
        <span className="spark-journey-end">ถึง 25 DEC 2026</span>
        {stage === "choose" ? <button type="button" className="spark-journey-x"
          aria-label="ไว้ทีหลัง" onClick={() => close(false)}>×</button> : null}
      </header>
      <div className="spark-journey-heading">
        <span className="spark-journey-stars" aria-hidden="true">✧ ✦ ✧</span>
        <h2 id="spark-journey-title">THE SPARK JOURNEY</h2>
        <p>{stage === "choose" ? "เลือกการเดินทางในแบบของคุณ" : "จุดหมายปลายทาง Spark Land"}</p>
        <small>ทุกเส้นทางมีจุดหมายเดียวกัน แต่รางวัลของคุณจะเป็นเท่าไร?</small>
        <strong>150–800 QA Sparks</strong>
        <span className="spark-journey-rule">สุ่มรับรางวัล · 1 สิทธิ์ต่อบัญชี</span>
      </div>

      {stage === "choose" || stage === "saving" ? <>
        <div className="spark-journey-grid" aria-label="เลือกการเดินทาง 5 รูปแบบ">
          {SPARK_JOURNEY_ROUTES.map((item) =>
            <button key={item.id} type="button" onClick={() => { void choose(item); }}
              className={"spark-journey-route" + (route?.id === item.id ? " is-selected" : "")}
              disabled={stage !== "choose"} aria-pressed={route?.id === item.id}>
              <span className={"spark-journey-route-art spark-journey-route-art--" + item.id}
                aria-hidden="true"><span>{item.icon}</span></span>
              <span className="spark-journey-route-name">{item.name}</span>
              <span className="spark-journey-route-title">{item.title}</span>
              <span className="spark-journey-route-description">{item.description}</span>
              <span className="spark-journey-route-action">
                {stage === "saving" && route?.id === item.id ? "กำลังบันทึกสิทธิ์..." : "เลือกเส้นทาง"}
              </span>
            </button>)}
        </div>
        {error ? <p className="spark-journey-error" role="alert">{error}</p> : null}
        <button type="button" className="spark-journey-later" onClick={() => close(false)}
          disabled={stage !== "choose"}>ไว้ทีหลัง</button>
      </> : <>
        <div className={"spark-journey-scene spark-journey-scene--" + (route?.id || "boat") +
          (stage === "travelling" ? " is-travelling" : " is-arrived")}>
          <div className="spark-journey-sun" aria-hidden="true"/>
          <div className="spark-journey-cloud spark-journey-cloud--one" aria-hidden="true"/>
          <div className="spark-journey-cloud spark-journey-cloud--two" aria-hidden="true"/>
          <div className="spark-journey-hills" aria-hidden="true"/>
          <span className="spark-journey-vehicle" aria-hidden="true">{route?.icon}</span>
          <div className="spark-journey-destination" aria-hidden="true">🏰</div>
          <span className="spark-journey-destination-label">SPARK LAND</span>
        </div>
        {stage === "travelling" ? <>
          <p className="spark-journey-travel-text" role="status">
            กำลังเดินทางโดย{route?.title}ไปยัง Spark Land...
          </p>
          <div className="spark-journey-progress" aria-hidden="true"><span/></div>
        </> : prize ? <div className="spark-journey-win" role="status" aria-live="polite">
          <span className="spark-journey-confetti" aria-hidden="true">✧ ✦ ✧ ✦ ✧</span>
          <h3>เดินทางถึงจุดหมายแล้ว!</h3>
          <p>ยินดีด้วย คุณได้รับรางวัล</p>
          <strong>+ {prize.amount.toLocaleString()} Sparks</strong>
          <button type="button" className="spark-journey-finish"
            onClick={() => close(true)}>รับรางวัลและเข้าสู่ QA Sparks</button>
          <small>บันทึกคะแนนเข้าบัญชีแล้ว · ดูรายการได้ใน History</small>
        </div> : null}
      </>}
      <footer className="spark-journey-footer">⌖ DESTINATION: SPARK LAND</footer>
    </section>
  </div>;
}
