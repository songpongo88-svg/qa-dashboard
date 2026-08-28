import React, { useEffect, useMemo, useRef, useState } from "react";
import { calculateMonthlyKpi, getMonthlyKpiMessage, monthlyKpiNoticeKey, monthlyKpiSnapshot, type MonthlyKpiCase } from "./lib/monthlyKpi";
import "./monthlyKpiNotice.css";

export default function MonthlyKpiNotice({ cases, agent, monthKey, monthLabel, viewer }: {
  cases: readonly MonthlyKpiCase[]; agent: string; monthKey: string; monthLabel: string; viewer: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [workspaceVisible, setWorkspaceVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const shownRef = useRef(new Map<string, string>());
  const result = useMemo(() => calculateMonthlyKpi(cases.map((item) => item.finalScore)), [cases]);
  const snapshot = useMemo(() => monthlyKpiSnapshot(cases), [cases]);
  const storageKey = monthlyKpiNoticeKey(viewer, agent, monthKey);
  const message = getMonthlyKpiMessage(result);

  useEffect(() => {
    // Workspaces are kept mounted while hidden. Never open a top-layer dialog
    // over Evaluate/Appeal or mark a hidden notification as already shown.
    const workspace = rootRef.current?.closest("[data-retained-workspace-tab]");
    const syncVisibility = () => setWorkspaceVisible(!workspace || workspace.getAttribute("aria-hidden") !== "true");
    syncVisibility();
    if (!workspace) return;
    const observer = new MutationObserver(syncVisibility);
    observer.observe(workspace, { attributes: true, attributeFilter: ["aria-hidden"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!workspaceVisible || !viewer) { setOpen(false); return; }
    let seen = shownRef.current.get(storageKey);
    try { seen = window.sessionStorage.getItem(storageKey) || seen; } catch { /* Memory fallback for blocked storage. */ }
    if (seen === snapshot) { setOpen(false); return; }
    // Wait for linked month/agent controls to settle before showing an automatic notice.
    const timer = window.setTimeout(() => {
      shownRef.current.set(storageKey, snapshot);
      try { window.sessionStorage.setItem(storageKey, snapshot); } catch { /* Still dismissible. */ }
      setOpen(true);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [snapshot, storageKey, viewer, workspaceVisible]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && workspaceVisible && !dialog.open) dialog.showModal();
    if ((!open || !workspaceVisible) && dialog.open) dialog.close();
    return () => { if (dialog.open) dialog.close(); };
  }, [open, workspaceVisible]);

  return (
    <div ref={rootRef} className="qa-monthly-kpi" data-monthly-kpi-notice="true">
      <div className="qmk-launcher">
        <span>เป้าคะแนนรายเดือน · {agent} · {monthLabel} · {result.count}/10 เคส</span>
        <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog">ดูเป้าคะแนน KPI <span aria-hidden="true">↗</span></button>
      </div>
      <dialog ref={dialogRef} className="qmk-dialog" aria-labelledby="qmk-title" aria-describedby="qmk-subject"
        onCancel={(event) => { event.preventDefault(); setOpen(false); }}>
        <header className="qmk-header">
          <div className="qmk-eyebrow">MONTHLY KPI · TARGET 85%</div>
          <h2 id="qmk-title">เป้าคะแนน KPI เดือนนี้</h2>
          <p id="qmk-subject">{agent} · {monthLabel}</p>
          <button type="button" className="qmk-close" aria-label="ปิดเป้าคะแนน KPI" onClick={() => setOpen(false)}>×</button>
        </header>
        <div className="qmk-body" data-tone={message.tone}>
          <div className="qmk-status">{message.status}</div>
          <div className="qmk-metrics">
            <div><div className="qmk-label">คะแนนเฉลี่ยปัจจุบัน</div><div className="qmk-number">{result.average === null ? "—" : result.average.toFixed(2)} <small>/ 100</small></div></div>
            <div><div className="qmk-label">ประเมินแล้ว</div><div className="qmk-number">{result.count} <small>/ 10 เคส</small></div></div>
          </div>
          <div className="qmk-track" role="progressbar" aria-label="จำนวนเคสที่ประเมินแล้ว" aria-valuemin={0} aria-valuemax={10} aria-valuenow={Math.min(result.count, 10)} aria-valuetext={`${result.count} จาก 10 เคส`}>
            {Array.from({ length: 10 }, (_, index) => <span key={index} className={index < result.count ? "qmk-done" : ""} />)}
          </div>
          <div className="qmk-caption"><span>คะแนนสะสม {result.total.toFixed(2)}{result.count <= 10 ? " / 850" : ""}</span><span>{result.remaining ? `เหลืออีก ${result.remaining} เคส` : "ครบโควต้าแล้ว"}</span></div>
          <section className="qmk-notice" aria-label="เป้าคะแนนที่ต้องทำ">
            <div className="qmk-label-strong">{message.label}</div>
            <div className="qmk-target">{message.value} <small>{message.unit}</small></div>
            <p>{message.text}</p>
          </section>
          <p className="qmk-footnote">ใช้คะแนนล่าสุดทั้งเดือนของคนนี้ รวมผลอุทธรณ์ที่อนุมัติแล้ว ไม่นับเคสซ้ำและไม่รวม Test Case</p>
          {result.count > 10 ? <p className="qmk-footnote">มีมากกว่า 10 เคส: คำนวณจากทุกเคสจริงของเดือนตาม Dashboard ไม่ตัดเคสออก</p> : null}
        </div>
        <footer className="qmk-footer"><span>แจ้งใหม่เมื่อข้อมูลคะแนนเดือนนี้เปลี่ยน</span><button type="button" onClick={() => setOpen(false)}>รับทราบ</button></footer>
      </dialog>
    </div>
  );
}
