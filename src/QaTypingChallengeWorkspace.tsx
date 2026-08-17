import React, { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import PageHero from "./PageHero";
import QaTypingChallengeAdmin from "./QaTypingChallengeAdmin";
import { fetchStoredProfilePhoto } from "./profilePhotoStore";
import { registerTHSarabunNew } from "./THSarabunNew-jsPDF";
import {
  subscribeQaTypingChallengeHistory,
  type QaTypingChallengeHistoryRecord,
  type QaTypingChallengeHistoryResult,
} from "./qaTypingChallengeHistoryStore";

type AgentOption = {
  username: string;
  displayName: string;
  agentName: string;
  role: string;
  email?: string;
};

type CurrentUser = {
  username?: string;
  displayName?: string;
  role?: string;
};

type WorkspaceView = "setup" | "history";
type ResultFilter = "All" | QaTypingChallengeHistoryResult;

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date).replace(",", "");
}

function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function historyResultClass(result: QaTypingChallengeHistoryResult) {
  if (result === "Pass") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (result === "Timeout") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function downloadHistoryPdf(records: QaTypingChallengeHistoryRecord[], scopeLabel: string) {
  if (!records.length) {
    window.alert("ยังไม่มีประวัติสำหรับ Generate PDF");
    return;
  }

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  registerTHSarabunNew(doc as any);

  const setFont = (style: "normal" | "bold" = "normal") => {
    try {
      doc.setFont("THSarabunNew", style);
    } catch {
      doc.setFont("helvetica", style);
    }
  };

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 7.5;
  const bottom = pageH - 8;
  const tableW = pageW - marginX * 2;
  const widths = [32, 46, 34, 20, 20, 20, 20, 22, 22, 22, 22];
  const headers = ["Date / Time", "Agent", "Word", "Target", "Typed", "Correct", "Wrong", "Allowed", "Time Limit", "Time Used", "Result"];
  const purple: [number, number, number] = [112, 48, 160];
  const lightPurple: [number, number, number] = [246, 242, 252];
  const grid: [number, number, number] = [210, 210, 220];
  let y = 10;

  const drawHeaderBlock = () => {
    doc.setFillColor(purple[0], purple[1], purple[2]);
    doc.roundedRect(marginX, y, tableW, 18, 2.5, 2.5, "F");
    setFont("bold");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(17);
    doc.text("QA ACCESS CHECK HISTORY", marginX + 5, y + 7);
    setFont("normal");
    doc.setFontSize(10.5);
    doc.text(`Scope: ${scopeLabel}`, marginX + 5, y + 12.5);
    doc.text(`Generated: ${formatDateTime(new Date().toISOString())}`, pageW - marginX - 5, y + 12.5, { align: "right" });
    y += 22;
  };

  const drawTableHeader = () => {
    let x = marginX;
    setFont("bold");
    doc.setFontSize(9.5);
    headers.forEach((header, index) => {
      doc.setFillColor(lightPurple[0], lightPurple[1], lightPurple[2]);
      doc.setDrawColor(grid[0], grid[1], grid[2]);
      doc.rect(x, y, widths[index], 8, "FD");
      doc.setTextColor(71, 42, 96);
      doc.text(header, x + widths[index] / 2, y + 5.1, { align: "center" });
      x += widths[index];
    });
    y += 8;
  };

  const addPage = () => {
    doc.addPage("a4", "landscape");
    y = 10;
    drawHeaderBlock();
    drawTableHeader();
  };

  drawHeaderBlock();
  drawTableHeader();

  records.forEach((record) => {
    const values = [
      formatDateTime(record.completedAt),
      record.displayName || record.username,
      record.word,
      String(record.repeatCount),
      String(record.typedCount),
      String(record.correctCount),
      String(record.mistakeCount),
      String(record.allowedMistakes),
      formatDuration(record.timeLimitSeconds),
      formatDuration(record.timeUsedSeconds),
      record.result,
    ];

    setFont("normal");
    doc.setFontSize(9.2);
    const lineSets = values.map((value, index) => doc.splitTextToSize(String(value || "-"), Math.max(5, widths[index] - 2.5)).slice(0, 2));
    const maxLines = Math.max(1, ...lineSets.map((lines) => lines.length));
    const rowH = Math.max(7.5, 2.8 + maxLines * 3.2);

    if (y + rowH > bottom) addPage();

    let x = marginX;
    lineSets.forEach((lines, index) => {
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(grid[0], grid[1], grid[2]);
      doc.rect(x, y, widths[index], rowH, "FD");
      doc.setTextColor(32, 36, 44);
      const centered = index >= 3;
      lines.forEach((line: string, lineIndex: number) => {
        doc.text(
          line,
          centered ? x + widths[index] / 2 : x + 1.3,
          y + 4.3 + lineIndex * 3.2,
          centered ? { align: "center" } : undefined
        );
      });
      x += widths[index];
    });
    y += rowH;
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    setFont("normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 100, 110);
    doc.text(`Page ${page} / ${pageCount}`, pageW - marginX, pageH - 4, { align: "right" });
  }

  const safeScope = scopeLabel.replace(/[^a-zA-Z0-9ก-๙_-]+/g, "_").replace(/^_+|_+$/g, "") || "History";
  const fileName = `QA_Access_Check_History_${safeScope}_${new Date().toISOString().slice(0, 10)}.pdf`;
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export default function QaTypingChallengeWorkspace({
  agentOptions,
  currentUser,
  canManage = false,
}: {
  agentOptions?: AgentOption[];
  currentUser?: CurrentUser | null;
  canManage?: boolean;
}) {
  const currentUsername = String(currentUser?.username || "").trim();
  const agents = useMemo(
    () =>
      (agentOptions || [])
        .filter((agent) => String(agent.username || "").trim())
        .slice()
        .sort((a, b) =>
          String(a.agentName || a.displayName || a.username).localeCompare(
            String(b.agentName || b.displayName || b.username),
            "en"
          )
        ),
    [agentOptions]
  );

  const [view, setView] = useState<WorkspaceView>(canManage ? "setup" : "history");
  const [selectedUsername, setSelectedUsername] = useState("");
  const [profilePhoto, setProfilePhoto] = useState("");
  const [history, setHistory] = useState<QaTypingChallengeHistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [historyAgentFilter, setHistoryAgentFilter] = useState("all");
  const [historyResultFilter, setHistoryResultFilter] = useState<ResultFilter>("All");

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.username === selectedUsername) || null,
    [agents, selectedUsername]
  );

  useEffect(() => {
    if (!canManage) setView("history");
  }, [canManage]);

  useEffect(() => {
    if (!canManage) return;
    if (!selectedUsername && agents.length) setSelectedUsername(agents[0].username);
    if (selectedUsername && !agents.some((agent) => agent.username === selectedUsername)) {
      setSelectedUsername(agents[0]?.username || "");
    }
  }, [agents, selectedUsername, canManage]);

  useEffect(() => {
    setHistoryLoading(true);
    setHistoryError("");
    return subscribeQaTypingChallengeHistory(
      (records) => {
        setHistory(records);
        setHistoryLoading(false);
      },
      (error) => {
        console.warn("QA Access Check history load failed", error);
        setHistory([]);
        setHistoryLoading(false);
        setHistoryError("ไม่สามารถโหลดประวัติ QA Access Check ได้");
      }
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    const username = String(selectedAgent?.username || "").trim();
    setProfilePhoto("");
    if (!username) return;

    const load = async () => {
      const photo = await fetchStoredProfilePhoto(username);
      if (!cancelled) setProfilePhoto(photo?.photoDataUrl || "");
    };

    void load();
    const handleUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ username?: string }>).detail;
      if (String(detail?.username || "").trim().toLowerCase() === username.toLowerCase()) void load();
    };
    window.addEventListener("qa-profile-photo-updated", handleUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("qa-profile-photo-updated", handleUpdated);
    };
  }, [selectedAgent?.username]);

  const initials = useMemo(() => {
    const source = String(selectedAgent?.agentName || selectedAgent?.displayName || selectedAgent?.username || "AG").trim();
    const parts = source.split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("") || "AG";
  }, [selectedAgent]);

  const scopedHistory = useMemo(() => {
    if (canManage) return history;
    const key = currentUsername.toLowerCase();
    return history.filter((record) => record.username.trim().toLowerCase() === key);
  }, [history, canManage, currentUsername]);

  const historyAgentOptions = useMemo(() => {
    const map = new Map<string, string>();
    scopedHistory.forEach((record) => {
      if (record.username) map.set(record.username, record.displayName || record.username);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], "en"));
  }, [scopedHistory]);

  const visibleHistory = useMemo(() => {
    return scopedHistory.filter((record) => {
      const agentMatches = !canManage || historyAgentFilter === "all" || record.username === historyAgentFilter;
      const resultMatches = historyResultFilter === "All" || record.result === historyResultFilter;
      return agentMatches && resultMatches;
    });
  }, [scopedHistory, canManage, historyAgentFilter, historyResultFilter]);

  const historyScopeLabel = useMemo(() => {
    if (!canManage) return currentUser?.displayName || currentUsername || "My_History";
    if (historyAgentFilter === "all") return "All_Agents";
    return historyAgentOptions.find(([username]) => username === historyAgentFilter)?.[1] || historyAgentFilter;
  }, [canManage, currentUser?.displayName, currentUsername, historyAgentFilter, historyAgentOptions]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/60 p-4 text-slate-950 sm:p-6" style={{ fontFamily: "'Kanit', sans-serif" }}>
      <div className="mx-auto max-w-[1440px] overflow-hidden rounded-[30px] border border-violet-100 bg-white/60 shadow-sm">
        <PageHero
          eyebrow="QUALITY CONTROL"
          title="QA Access Check"
          subtitle={canManage ? "กำหนดคำให้ Agent พิมพ์ก่อนดูผล QA และตรวจสอบประวัติการทำแบบสรุป" : "ตรวจสอบประวัติ QA Access Check ของคุณ"}
          workspaceTitle="QA Access Control"
          workspaceSubtitle="Typing verification and summary history"
        />

        <div className="border-b border-violet-100 bg-white px-5 pt-4 sm:px-6">
          <div className="flex gap-2">
            {canManage ? (
              <button
                type="button"
                onClick={() => setView("setup")}
                className={`rounded-t-2xl px-5 py-3 text-sm font-black transition ${view === "setup" ? "bg-violet-600 text-white" : "bg-violet-50 text-violet-700 hover:bg-violet-100"}`}
              >
                Setup
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setView("history")}
              className={`rounded-t-2xl px-5 py-3 text-sm font-black transition ${view === "history" ? "bg-violet-600 text-white" : "bg-violet-50 text-violet-700 hover:bg-violet-100"}`}
            >
              {canManage ? "History" : "My History"}
            </button>
          </div>
        </div>

        {view === "setup" && canManage ? (
          <div className="grid gap-5 p-5 xl:grid-cols-[360px_minmax(0,1fr)] sm:p-6">
            <aside className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-600">Target Agent</div>
              <h2 className="mt-1 text-lg font-black text-slate-950">เลือกผู้รับ QA Access Check</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">โจทย์จะผูกกับ Username ของ Agent โดยตรง และมีได้ 1 ชุดที่กำลังใช้งานต่อคน</p>

              <label className="mt-5 block">
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Agent Full Name</span>
                <select
                  value={selectedUsername}
                  onChange={(event) => setSelectedUsername(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm font-bold text-slate-900 outline-none transition focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
                >
                  <option value="">Select agent</option>
                  {agents.map((agent) => (
                    <option key={agent.username} value={agent.username}>
                      {agent.agentName || agent.displayName || agent.username}{agent.role ? ` - ${agent.role}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              {selectedAgent ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm">
                      {profilePhoto ? (
                        <img src={profilePhoto} alt={`${selectedAgent.agentName || selectedAgent.displayName} profile`} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-base font-black text-violet-700">{initials}</div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-slate-950">{selectedAgent.agentName || selectedAgent.displayName}</div>
                      <div className="mt-0.5 truncate text-xs font-bold text-violet-700">{selectedAgent.role || "Agent"}</div>
                      <div className="mt-1 truncate text-[10px] font-semibold text-slate-500">@{selectedAgent.username}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-xs font-semibold text-slate-400">
                  เลือก Agent เพื่อกำหนด QA Access Check
                </div>
              )}

              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-800">
                <span className="font-black">History:</span> เก็บเฉพาะผลสรุป เช่น จำนวนที่พิมพ์ ถูก ผิด เวลา และผล Pass/Fail/Timeout โดยไม่เก็บข้อความที่ Agent พิมพ์จริง
              </div>
            </aside>

            <main className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-[0_18px_45px_rgba(76,29,149,0.08)] sm:p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-600">Challenge Setup</div>
                  <h2 className="mt-1 text-xl font-black text-slate-950">กำหนดคำและเกณฑ์การผ่าน</h2>
                </div>
                <button type="button" onClick={() => setView("history")} className="rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-xs font-black text-violet-700 transition hover:bg-violet-100">
                  ดู History
                </button>
              </div>

              {selectedAgent ? (
                <QaTypingChallengeAdmin agent={selectedAgent} currentUser={currentUser} />
              ) : (
                <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50/70 px-6 text-center">
                  <div>
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-2xl">⌨</div>
                    <div className="mt-4 text-base font-black text-slate-700">ยังไม่ได้เลือก Agent</div>
                    <div className="mt-1 text-sm text-slate-500">เลือกชื่อจากด้านซ้ายเพื่อเริ่มกำหนดคำ</div>
                  </div>
                </div>
              )}
            </main>
          </div>
        ) : (
          <div className="p-5 sm:p-6">
            <section className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-[0_18px_45px_rgba(76,29,149,0.08)] sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-600">{canManage ? "History" : "My History"}</div>
                  <h2 className="mt-1 text-xl font-black text-slate-950">ประวัติ QA Access Check</h2>
                  <p className="mt-1 text-xs font-semibold text-slate-500">แสดงเฉพาะข้อมูลสรุปของการทำแต่ละครั้ง ไม่มีการจัดเก็บข้อความที่พิมพ์จริง</p>
                </div>
                <button
                  type="button"
                  onClick={() => downloadHistoryPdf(visibleHistory, historyScopeLabel)}
                  disabled={!visibleHistory.length}
                  className="rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-3 text-sm font-black text-white shadow-[0_12px_26px_rgba(109,40,217,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Generate PDF
                </button>
              </div>

              <div className={`mt-5 grid gap-3 ${canManage ? "md:grid-cols-[minmax(0,1fr)_220px_180px]" : "md:grid-cols-[minmax(0,1fr)_180px]"}`}>
                {canManage ? (
                  <label className="block">
                    <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Agent</span>
                    <select value={historyAgentFilter} onChange={(event) => setHistoryAgentFilter(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100">
                      <option value="all">All Agents</option>
                      {historyAgentOptions.map(([username, name]) => <option key={username} value={username}>{name}</option>)}
                    </select>
                  </label>
                ) : (
                  <div className="rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-800">
                    {currentUser?.displayName || currentUsername || "My History"}
                  </div>
                )}
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Result</span>
                  <select value={historyResultFilter} onChange={(event) => setHistoryResultFilter(event.target.value as ResultFilter)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100">
                    <option value="All">All Results</option>
                    <option value="Pass">Pass</option>
                    <option value="Fail">Fail</option>
                    <option value="Timeout">Timeout</option>
                  </select>
                </label>
                <div className="flex items-end">
                  <div className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-center text-xs font-black text-slate-600">{visibleHistory.length} record(s)</div>
                </div>
              </div>

              {historyError ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{historyError}</div> : null}

              <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-[1180px] w-full border-collapse text-left text-xs">
                  <thead className="bg-violet-50 text-violet-800">
                    <tr>
                      {["Date / Time", "Agent", "Word", "Target", "Typed", "Correct", "Wrong", "Allowed", "Time Limit", "Time Used", "Result"].map((header) => (
                        <th key={header} className="border-b border-violet-100 px-3 py-3 font-black">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {historyLoading ? (
                      <tr><td colSpan={11} className="px-4 py-12 text-center text-sm font-bold text-slate-400">กำลังโหลด History...</td></tr>
                    ) : visibleHistory.length ? (
                      visibleHistory.map((record) => (
                        <tr key={record.id} className="transition hover:bg-slate-50/80">
                          <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-600">{formatDateTime(record.completedAt)}</td>
                          <td className="px-3 py-3"><div className="font-black text-slate-900">{record.displayName || record.username}</div><div className="text-[10px] font-semibold text-slate-400">@{record.username}</div></td>
                          <td className="px-3 py-3 text-sm font-black text-violet-700">{record.word}</td>
                          <td className="px-3 py-3 text-center font-black text-slate-700">{record.repeatCount}</td>
                          <td className="px-3 py-3 text-center font-black text-slate-700">{record.typedCount}</td>
                          <td className="px-3 py-3 text-center font-black text-emerald-700">{record.correctCount}</td>
                          <td className="px-3 py-3 text-center font-black text-rose-600">{record.mistakeCount}</td>
                          <td className="px-3 py-3 text-center font-black text-slate-700">{record.allowedMistakes}</td>
                          <td className="px-3 py-3 text-center font-bold text-slate-600">{formatDuration(record.timeLimitSeconds)}</td>
                          <td className="px-3 py-3 text-center font-bold text-slate-600">{formatDuration(record.timeUsedSeconds)}</td>
                          <td className="px-3 py-3"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black ${historyResultClass(record.result)}`}>{record.result}</span></td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={11} className="px-4 py-12 text-center"><div className="text-sm font-black text-slate-500">ยังไม่มีประวัติ QA Access Check</div><div className="mt-1 text-xs font-semibold text-slate-400">เมื่อมีการ Pass, Fail หรือ Timeout ระบบจะแสดงข้อมูลสรุปที่นี่</div></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
