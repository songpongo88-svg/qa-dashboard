import React, { useEffect, useMemo, useState } from "react";
import { fetchUsageLogs, isUsageLogConfigured, UsageLogEvent } from "./usageLog";
import PageHero from "./PageHero";

const PAGE_SIZE = 25;

function formatLogDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function formatInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getBangkokDateKey(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";
  return year && month && day ? `${year}-${month}-${day}` : "";
}

function csvCell(value: unknown) {
  const text = String(value ?? "").replace(/\r?\n/g, " ");
  return `"${text.replace(/"/g, '""')}"`;
}

function eventLabel(type: string) {
  const map: Record<string, string> = {
    login: "เข้าสู่ระบบ",
    logout: "ออกจากระบบ",
    tab_view: "เปิดหน้า",
    case_detail_open: "เปิดเคส",
    appeal_case_open: "เปิดเคส Appeal",
    pdf_generate: "สร้าง PDF",
  };
  return map[type] || type || "-";
}

function tabLabel(tab?: string) {
  const map: Record<string, string> = {
    dashboard: "Dashboard",
    summary: "Summary",
    coaching: "Coaching",
    appeal: "Appeal",
    "usage-log": "Usage Log",
  };
  return tab ? map[tab] || tab : "-";
}

function subTabLabel(value?: unknown) {
  const map: Record<string, string> = {
    overview: "ภาพรวม",
    "case-detail": "รายละเอียดเคส",
  };
  return typeof value === "string" ? map[value] || value : "";
}

function detailsLabel(item: UsageLogEvent) {
  if (item.event_type === "login") return "ผู้ใช้เข้าสู่ระบบ";
  if (item.event_type === "logout") return "ผู้ใช้ออกจากระบบ";
  if (item.event_type === "pdf_generate") {
    const pdfType = item.details?.pdfType === "appeal" ? "Appeal PDF" : "Case Detail PDF";
    return item.case_id ? `สร้าง ${pdfType} ของเคส ${item.case_id}` : `สร้าง ${pdfType}`;
  }
  if (item.event_type === "case_detail_open") {
    return item.case_id ? `เปิดดูรายละเอียดเคส ${item.case_id}` : "เปิดดูรายละเอียดเคส";
  }
  if (item.event_type === "appeal_case_open") {
    return item.case_id ? `เปิดดูเคส Appeal ${item.case_id}` : "เปิดดูเคส Appeal";
  }
  if (item.event_type === "tab_view") {
    const subTab = subTabLabel(item.details?.dashboardSubTab);
    const tabText = tabLabel(item.tab);
    return subTab ? `เปิดหน้า ${tabText} - ${subTab}` : `เปิดหน้า ${tabText}`;
  }

  const entries = Object.entries(item.details || {}).filter(([, value]) => value !== "" && value != null);
  if (!entries.length) return "-";
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(", ");
}

function eventTone(type: string) {
  if (type === "login") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (type === "logout") return "border-slate-200 bg-slate-50 text-slate-700";
  if (type === "pdf_generate") return "border-amber-200 bg-amber-50 text-amber-700";
  if (type.includes("case")) return "border-violet-200 bg-violet-50 text-violet-700";
  return "border-sky-200 bg-sky-50 text-sky-700";
}

export default function UsageLogMockup() {
  const [logs, setLogs] = useState<UsageLogEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");
  const [selectedDate, setSelectedDate] = useState(formatInputDate(new Date()));
  const [currentPage, setCurrentPage] = useState(1);

  const loadLogs = async () => {
    try {
      setIsLoading(true);
      setError("");
      setLogs(await fetchUsageLogs(5000));
    } catch (err: any) {
      setError(err?.message || "โหลด Usage Log ไม่สำเร็จ");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const users = useMemo(() => {
    return Array.from(new Set(logs.map((item) => item.display_name || item.username || "-"))).sort();
  }, [logs]);

  const eventTypes = useMemo(() => {
    return Array.from(new Set(logs.map((item) => item.event_type || "-"))).sort();
  }, [logs]);

  const filteredLogs = logs.filter((item) => {
    const userName = item.display_name || item.username || "-";
    const matchUser = userFilter === "all" || userName === userFilter;
    const matchEvent = eventFilter === "all" || item.event_type === eventFilter;
    const logDateKey = getBangkokDateKey(item.created_at);
    const matchDate = !selectedDate || logDateKey === selectedDate;
    return matchUser && matchEvent && matchDate;
  });

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedLogs = filteredLogs.slice((safeCurrentPage - 1) * PAGE_SIZE, safeCurrentPage * PAGE_SIZE);
  const pageStart = filteredLogs.length ? (safeCurrentPage - 1) * PAGE_SIZE + 1 : 0;
  const pageEnd = Math.min(safeCurrentPage * PAGE_SIZE, filteredLogs.length);

  useEffect(() => {
    setCurrentPage(1);
  }, [userFilter, eventFilter, selectedDate]);

  const handleGenerateLog = () => {
    const headers = ["Time", "User", "Agent", "Role", "Event", "Page", "Case ID", "Details"];
    const rows = filteredLogs.map((item) => [
      formatLogDate(item.created_at),
      item.display_name || item.username || "-",
      item.agent_name || "-",
      item.role || "-",
      eventLabel(item.event_type),
      tabLabel(item.tab),
      item.case_id || "-",
      detailsLabel(item),
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `usage-log_${selectedDate || "all"}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f6f2ff] via-[#fcfbff] to-[#f3e8ff] px-5 py-6 lg:px-8">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <div className="overflow-hidden rounded-[30px] border border-violet-200 bg-white shadow-[0_18px_50px_rgba(88,28,135,0.10)]">
          <PageHero
            eyebrow="Administration"
            title="System Activity Log"
            subtitle="Audit user activity such as login, page access, case detail views, appeal activity, and PDF generation."
          />

          <div className="grid gap-4 border-b border-violet-100 bg-violet-50/50 px-5 py-4 lg:grid-cols-[1fr_190px_190px_190px_140px_170px]">
            <div className="rounded-2xl border border-violet-100 bg-white px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-700">Logs On Selected Date</div>
              <div className="mt-1 text-2xl font-extrabold text-slate-950">{filteredLogs.length}</div>
            </div>

            <select
              value={userFilter}
              onChange={(event) => setUserFilter(event.target.value)}
              className="rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none"
            >
              <option value="all">All Users</option>
              {users.map((user) => (
                <option key={user} value={user}>
                  {user}
                </option>
              ))}
            </select>

            <select
              value={eventFilter}
              onChange={(event) => setEventFilter(event.target.value)}
              className="rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none"
            >
              <option value="all">All Events</option>
              {eventTypes.map((eventType) => (
                <option key={eventType} value={eventType}>
                  {eventLabel(eventType)}
                </option>
              ))}
            </select>

            <label className="rounded-2xl border border-violet-200 bg-white px-4 py-2">
              <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-violet-700">Log Date</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="mt-1 w-full bg-transparent text-sm font-semibold text-slate-700 outline-none"
              />
            </label>

            <button
              type="button"
              onClick={loadLogs}
              className="rounded-2xl bg-violet-700 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-violet-800"
            >
              Refresh
            </button>

            <button
              type="button"
              onClick={handleGenerateLog}
              disabled={!filteredLogs.length}
              className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Generate Log
            </button>
          </div>

          {!isUsageLogConfigured() ? (
            <div className="px-6 py-8 text-sm leading-7 text-amber-800">
              ยังไม่ได้ตั้งค่า Supabase ให้เพิ่ม `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY` ใน environment ก่อนใช้งานจริง
            </div>
          ) : isLoading ? (
            <div className="px-6 py-10 text-center text-sm text-slate-500">กำลังโหลด Usage Log...</div>
          ) : error ? (
            <div className="px-6 py-8 text-sm text-rose-700">{error}</div>
          ) : (
            <div>
              <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-5 py-4 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
                <div className="font-semibold">
                  Showing {pageStart}-{pageEnd} of {filteredLogs.length} log(s)
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={safeCurrentPage <= 1}
                    className="rounded-xl border border-violet-200 bg-white px-4 py-2 text-xs font-bold text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                  >
                    Previous
                  </button>
                  <span className="rounded-xl bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700">
                    Page {safeCurrentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    disabled={safeCurrentPage >= totalPages}
                    className="rounded-xl border border-violet-200 bg-white px-4 py-2 text-xs font-bold text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                  >
                    Next
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[1180px] w-full text-sm">
                <thead>
                  <tr className="bg-slate-950 text-[11px] uppercase tracking-[0.12em] text-white">
                    <th className="px-4 py-3 text-left">Time</th>
                    <th className="px-4 py-3 text-left">User</th>
                    <th className="px-4 py-3 text-left">Role</th>
                    <th className="px-4 py-3 text-left">Activity</th>
                    <th className="px-4 py-3 text-left">Page</th>
                    <th className="px-4 py-3 text-left">Case ID</th>
                    <th className="px-4 py-3 text-left">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLogs.length ? (
                    paginatedLogs.map((item, index) => (
                      <tr key={item.id || `${item.created_at}-${index}`} className="border-t border-slate-200 bg-white">
                        <td className="px-4 py-3 font-semibold text-slate-800">{formatLogDate(item.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-950">{item.display_name || item.username || "-"}</div>
                          <div className="text-xs text-slate-500">{item.agent_name || "-"}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{item.role || "-"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${eventTone(item.event_type)}`}>
                            {eventLabel(item.event_type)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{tabLabel(item.tab)}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{item.case_id || "-"}</td>
                        <td className="max-w-[420px] px-4 py-3 text-sm leading-6 text-slate-700">
                          {detailsLabel(item)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                        ยังไม่มี log ตามตัวกรองนี้
                      </td>
                    </tr>
                  )}
                </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
