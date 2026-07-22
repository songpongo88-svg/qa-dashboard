import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import PageHero from "./PageHero";
import { type UsageLogEvent } from "./usageLog";
import { fetchAppealEvents, writeAppealEvent } from "./appealStore";
import { fetchCachedStaticResponse } from "./staticFileCache";

type CurrentUser = {
  username: string;
  displayName: string;
  role: string;
  agentName: string;
  email?: string;
  loginAt: string;
} | null;

export type AppealCaseOverride = {
  caseId: string;
  note: string;
  addedAt: string;
  addedBy: string;
  targetAgent: string;
};

const RAW_DATA_FILE_NAMES = ["QA_RawData_March-May2026.xlsx"];

function normalizeCaseId(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function findHeaderIndex(headers: unknown[], expected: string) {
  const normalizedExpected = normalizeText(expected);
  return headers.findIndex((header) => normalizeText(header) === normalizedExpected);
}

async function loadCaseOwnerMap() {
  const owners = new Map<string, string>();
  await Promise.all(
    RAW_DATA_FILE_NAMES.map(async (fileName) => {
      try {
        const response = await fetchCachedStaticResponse(`/${fileName}`);
        if (!response.ok) return;
        const buffer = await response.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
        const sheet = workbook.Sheets["Raw_Data"] || workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
        const headerIndex = rows.findIndex((row) => {
          const normalized = row.map((value) => normalizeText(value));
          return normalized.includes("agent name") && normalized.includes("case id");
        });
        if (headerIndex < 0) return;

        const headers = rows[headerIndex];
        const caseIdIndex = findHeaderIndex(headers, "Case ID");
        const agentIndex = findHeaderIndex(headers, "Agent Name");
        if (caseIdIndex < 0 || agentIndex < 0) return;

        rows.slice(headerIndex + 1).forEach((row) => {
          const caseId = normalizeCaseId(row[caseIdIndex]);
          const agent = String(row[agentIndex] || "").trim();
          if (caseId && agent) owners.set(caseId, agent);
        });
      } catch {
        // Ignore missing optional RawData files.
      }
    })
  );
  return owners;
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function buildAppealCaseOverrides(logs: UsageLogEvent[]) {
  const overrides = new Map<string, AppealCaseOverride>();
  const sortedLogs = [...logs].sort(
    (a, b) => new Date(a.created_at || "").getTime() - new Date(b.created_at || "").getTime()
  );

  sortedLogs.forEach((log) => {
    if (log.event_type !== "appeal_case_override_added" && log.event_type !== "appeal_case_override_removed") return;
    const caseId = normalizeCaseId(log.case_id || log.details?.caseId);
    if (!caseId) return;

    if (log.event_type === "appeal_case_override_removed") {
      overrides.delete(caseId);
      return;
    }

    overrides.set(caseId, {
      caseId,
      note: String(log.details?.note || ""),
      addedAt: String(log.details?.addedAt || log.created_at || ""),
      addedBy: String(log.details?.addedBy || log.display_name || log.username || ""),
      targetAgent: String(log.target_agent || log.details?.targetAgent || ""),
    });
  });

  return Array.from(overrides.values()).sort(
    (a, b) => new Date(b.addedAt || "").getTime() - new Date(a.addedAt || "").getTime()
  );
}

export default function AppealOverrideMockup({ currentUser }: { currentUser: CurrentUser }) {
  const [logs, setLogs] = useState<UsageLogEvent[]>([]);
  const [caseIdInput, setCaseIdInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [manualAgentInput, setManualAgentInput] = useState("");
  const [caseOwnerMap, setCaseOwnerMap] = useState<Map<string, string>>(new Map());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const overrides = useMemo(() => buildAppealCaseOverrides(logs), [logs]);
  const existingCaseIds = useMemo(() => new Set(overrides.map((item) => item.caseId)), [overrides]);
  const selectedCaseOwner = caseOwnerMap.get(normalizeCaseId(caseIdInput)) || "";

  const loadOverrides = async () => {
    try {
      const nextLogs = await fetchAppealEvents([
        "appeal_case_override_added",
        "appeal_case_override_removed",
      ], { limit: 1000, forceRefresh: true }) as UsageLogEvent[];
      setLogs(nextLogs);
    } catch {
      setMessage("Unable to load appeal override list.");
    }
  };

  useEffect(() => {
    void loadOverrides();
    void loadCaseOwnerMap().then(setCaseOwnerMap);
  }, []);

  const addOverride = async () => {
    if (!currentUser || busy) return;
    const caseId = normalizeCaseId(caseIdInput);
    if (!caseId) {
      setMessage("Please enter a Case ID.");
      return;
    }
    if (existingCaseIds.has(caseId)) {
      setMessage(`${caseId} is already allowed for appeal submission.`);
      return;
    }
    const targetAgent = selectedCaseOwner || manualAgentInput.trim();
    if (!targetAgent) {
      setMessage("Please enter the case owner because this Case ID was not found in RawData.");
      return;
    }

    setBusy(true);
    setMessage("");
    const addedAt = new Date().toISOString();
    await writeAppealEvent(currentUser, "appeal_case_override_added", {
      tab: "appeal-override",
      case_id: caseId,
      target_agent: targetAgent,
      details: {
        caseId,
        targetAgent,
        note: noteInput.trim(),
        addedAt,
        addedBy: currentUser.displayName || currentUser.username,
      },
    });
    setCaseIdInput("");
    setNoteInput("");
    setManualAgentInput("");
    await loadOverrides();
    setMessage(`${caseId} can now submit appeal after deadline. Task sent to ${targetAgent}.`);
    setBusy(false);
  };

  const removeOverride = async (caseId: string) => {
    if (!currentUser || busy) return;
    setBusy(true);
    setMessage("");
    await writeAppealEvent(currentUser, "appeal_case_override_removed", {
      tab: "appeal-override",
      case_id: caseId,
      details: {
        caseId,
        removedAt: new Date().toISOString(),
        removedBy: currentUser.displayName || currentUser.username,
      },
    });
    await loadOverrides();
    setMessage(`${caseId} override was removed.`);
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-[#f7f3ff] text-slate-950">
      <PageHero
        eyebrow="Appeals"
        title="Late Appeal"
        subtitle="เปิดสิทธิ์ให้เคสที่เลือกยื่นอุทธรณ์หลังหมดเวลา โดยคงกฎการส่งครั้งเดียว"
      />

      <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
          <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr_auto] lg:items-end">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-violet-700">Case ID</span>
              <input
                value={caseIdInput}
                onChange={(event) => setCaseIdInput(event.target.value.toUpperCase())}
                placeholder="AA233242"
                className="mt-2 w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-violet-700">Reason / Note</span>
              <input
                value={noteInput}
                onChange={(event) => setNoteInput(event.target.value)}
                placeholder="Optional note for why this case is allowed after deadline"
                className="mt-2 w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
              />
            </label>
            <label className="block lg:col-span-2">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-violet-700">Case Owner</span>
              <input
                value={selectedCaseOwner || manualAgentInput}
                onChange={(event) => setManualAgentInput(event.target.value)}
                disabled={Boolean(selectedCaseOwner)}
                placeholder="Auto from RawData, or enter Agent name if not found"
                className="mt-2 w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </label>
            <button
              type="button"
              onClick={addOverride}
              disabled={busy}
              className="rounded-2xl bg-violet-700 px-6 py-3 text-sm font-extrabold text-white shadow-[0_12px_28px_rgba(109,40,217,0.25)] transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Allow Appeal
            </button>
          </div>

          {message ? (
            <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-800">
              {message}
            </div>
          ) : null}
        </section>

        <section className="mt-6 overflow-hidden rounded-[28px] border border-violet-100 bg-white shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-violet-100 px-5 py-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-violet-700">Allowed Cases</div>
              <div className="mt-1 text-sm text-slate-500">{overrides.length} active override case(s)</div>
            </div>
            <button
              type="button"
              onClick={() => void loadOverrides()}
              className="rounded-2xl border border-violet-200 bg-white px-4 py-2 text-sm font-bold text-violet-700 transition hover:bg-violet-50"
            >
              Refresh
            </button>
          </div>

          {overrides.length ? (
            <div className="divide-y divide-slate-100">
              {overrides.map((item) => (
                <div key={item.caseId} className="grid gap-4 px-5 py-4 md:grid-cols-[150px_180px_1fr_220px_auto] md:items-center">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Case ID</div>
                    <div className="mt-1 text-lg font-extrabold text-slate-950">{item.caseId}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Owner</div>
                    <div className="mt-1 text-sm font-extrabold text-slate-950">{item.targetAgent || "-"}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Note</div>
                    <div className="mt-1 text-sm font-medium text-slate-700">{item.note || "-"}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Added</div>
                    <div className="mt-1 text-sm font-semibold text-slate-700">{formatDateTime(item.addedAt)}</div>
                    <div className="text-xs text-slate-500">{item.addedBy}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeOverride(item.caseId)}
                    disabled={busy}
                    className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-12 text-center text-sm font-semibold text-slate-500">
              No override cases yet.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
