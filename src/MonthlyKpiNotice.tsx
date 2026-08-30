import React, { useEffect, useMemo, useRef, useState } from "react";
import { calculateMonthlyKpi, getMonthlyKpiMessage, monthlyKpiNoticeKey, monthlyKpiSnapshot, type MonthlyKpiCase } from "./lib/monthlyKpi";
import "./monthlyKpiNotice.css";

export type MonthlyKpiAgentOption = {
  agent: string;
  cases: readonly MonthlyKpiCase[];
};

export default function MonthlyKpiNotice({
  cases,
  agent,
  monthKey,
  monthLabel,
  viewer,
  agentOptions = [],
  canBrowseAgents = false,
  autoOpen = true,
}: {
  cases: readonly MonthlyKpiCase[];
  agent: string;
  monthKey: string;
  monthLabel: string;
  viewer: string;
  agentOptions?: readonly MonthlyKpiAgentOption[];
  canBrowseAgents?: boolean;
  autoOpen?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [workspaceVisible, setWorkspaceVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const shownRef = useRef(new Map<string, string>());
  const availableAgents = useMemo(() => {
    const options = canBrowseAgents ? agentOptions : [];
    const unique = new Map<string, MonthlyKpiAgentOption>();
    options.forEach((option) => {
      const name = String(option.agent || "").trim();
      if (name && !unique.has(name.toLowerCase())) unique.set(name.toLowerCase(), { agent: name, cases: option.cases });
    });
    const selectedName = String(agent || "").trim();
    if (selectedName && !unique.has(selectedName.toLowerCase())) {
      unique.set(selectedName.toLowerCase(), { agent: selectedName, cases });
    }
    if (!unique.size && selectedName) unique.set(selectedName.toLowerCase(), { agent: selectedName, cases });
    return [...unique.values()];
  }, [agent, agentOptions, canBrowseAgents, cases]);
  const [activeAgent, setActiveAgent] = useState(agent || availableAgents[0]?.agent || "");

  useEffect(() => {
    setActiveAgent((current) => {
      const requested = String(agent || "").trim();
      if (requested && availableAgents.some((option) => option.agent === requested)) return requested;
      if (availableAgents.some((option) => option.agent === current)) return current;
      return availableAgents[0]?.agent || "";
    });
  }, [agent, availableAgents]);

  const activeIndex = Math.max(0, availableAgents.findIndex((option) => option.agent === activeAgent));
  const activeOption = availableAgents[activeIndex] || { agent, cases };
  const activeCases = activeOption.cases;
  const activeName = activeOption.agent;
  const result = useMemo(() => calculateMonthlyKpi(activeCases.map((item) => item.finalScore)), [activeCases]);
  const snapshot = useMemo(() => monthlyKpiSnapshot(activeCases), [activeCases]);
  const storageKey = monthlyKpiNoticeKey(`${viewer}${canBrowseAgents ? ":qa-all" : ""}`, activeName, monthKey);
  const message = getMonthlyKpiMessage(result);
  const showAgentBrowser = canBrowseAgents && availableAgents.length > 1;

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
    if (!autoOpen || seen === snapshot) return;
    // Wait for linked month/agent controls to settle before showing an automatic notice.
    const timer = window.setTimeout(() => {
      shownRef.current.set(storageKey, snapshot);
      try { window.sessionStorage.setItem(storageKey, snapshot); } catch { /* Still dismissible. */ }
      setOpen(true);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [autoOpen, snapshot, storageKey, viewer, workspaceVisible]);

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
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label={canBrowseAgents
            ? `เปิดเป้าคะแนน KPI ของ Agent ${availableAgents.length} คน เดือน ${monthLabel}`
            : `เปิดเป้าคะแนน KPI ของ ${activeName} เดือน ${monthLabel}`}
          data-tooltip="เป้าคะแนน KPI"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="7.5" />
            <circle cx="12" cy="12" r="3.5" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
          <span>KPI</span>
        </button>
      </div>
      <dialog ref={dialogRef} className="qmk-dialog" aria-labelledby="qmk-title" aria-describedby="qmk-subject"
        onCancel={(event) => { event.preventDefault(); setOpen(false); }}>
        <header className="qmk-header">
          <div className="qmk-eyebrow">KPI รายเดือน · เป้าหมาย 85</div>
          <h2 id="qmk-title">เป้าคะแนน KPI</h2>
          <p id="qmk-subject">{activeName} · {monthLabel}</p>
          <button type="button" className="qmk-close" aria-label="ปิดเป้าคะแนน KPI" onClick={() => setOpen(false)}>×</button>
        </header>
        <div className="qmk-body" data-tone={message.tone}>
          {showAgentBrowser ? (
            <div className="qmk-agent-browser">
              <label htmlFor="qmk-agent-select">เลือก Agent</label>
              <div className="qmk-agent-select-row">
                <select id="qmk-agent-select" value={activeName} onChange={(event) => setActiveAgent(event.target.value)}>
                  {availableAgents.map((option) => <option key={option.agent} value={option.agent}>{option.agent}</option>)}
                </select>
                <span>{activeIndex + 1} / {availableAgents.length}</span>
              </div>
            </div>
          ) : null}
          <div className="qmk-status">{message.status}</div>
          <div className="qmk-metrics">
            <div><div className="qmk-label">คะแนนเฉลี่ย</div><div className="qmk-number">{result.average === null ? "—" : result.average.toFixed(2)} <small>/ 100</small></div></div>
            <div><div className="qmk-label">จำนวนเคส</div><div className="qmk-number">{result.count} <small>/ 10 เคส</small></div></div>
          </div>
          <div className="qmk-track" role="progressbar" aria-label="จำนวนเคสที่ประเมินแล้ว" aria-valuemin={0} aria-valuemax={10} aria-valuenow={Math.min(result.count, 10)} aria-valuetext={`${result.count} จาก 10 เคส`}>
            {Array.from({ length: 10 }, (_, index) => <span key={index} className={index < result.count ? "qmk-done" : ""} />)}
          </div>
          <div className="qmk-caption"><span>สะสม {result.total.toFixed(2)}{result.count <= 10 ? " / 850" : ""}</span><span>{result.remaining ? `เหลือ ${result.remaining} เคส` : "ครบ 10 เคสแล้ว"}</span></div>
          <section className="qmk-notice" aria-label="เป้าคะแนนที่ต้องทำ">
            <div className="qmk-label-strong">{message.label}</div>
            <div className="qmk-target">{message.value} <small>{message.unit}</small></div>
            <p>{message.text}</p>
          </section>
          <p className="qmk-footnote">ใช้คะแนนล่าสุด รวมอุทธรณ์ที่อนุมัติ · ไม่รวม Test Case และเคสซ้ำ</p>
          {result.count > 10 ? <p className="qmk-footnote">เกิน 10 เคส: คำนวณจากทุกเคสจริงของเดือน</p> : null}
        </div>
        <footer className="qmk-footer">
          {showAgentBrowser ? (
            <div className="qmk-agent-nav" aria-label="เลื่อนดู Agent">
              <button type="button" disabled={activeIndex === 0} onClick={() => setActiveAgent(availableAgents[activeIndex - 1]?.agent || activeName)}>← ก่อนหน้า</button>
              <span>{activeIndex + 1} / {availableAgents.length}</span>
              <button type="button" disabled={activeIndex >= availableAgents.length - 1} onClick={() => setActiveAgent(availableAgents[activeIndex + 1]?.agent || activeName)}>คนถัดไป →</button>
            </div>
          ) : <span>แจ้งใหม่เมื่อข้อมูลคะแนนเดือนนี้เปลี่ยน</span>}
          <button type="button" className="qmk-acknowledge" onClick={() => setOpen(false)}>รับทราบ</button>
        </footer>
      </dialog>
    </div>
  );
}
