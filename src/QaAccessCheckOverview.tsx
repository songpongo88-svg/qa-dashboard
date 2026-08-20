import React, { useEffect, useMemo, useState } from "react";
import {
  subscribeQaTypingChallengeOverview,
  updateQaTypingChallengeRepeatCount,
  type QaTypingChallenge,
  type QaTypingChallengeQueueOverview,
} from "./qaTypingChallengeStore";
import type { QaTypingChallengeHistoryRecord } from "./qaTypingChallengeHistoryStore";

type AgentOption = {
  username: string;
  displayName?: string;
  agentName?: string;
  role?: string;
  email?: string;
  teamName?: string;
  team?: string;
  department?: string;
};

type CurrentUser = {
  username?: string;
  displayName?: string;
};

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
    hour12: false,
  }).format(date).replace(",", "");
}

function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function clampRepeatCount(value: unknown) {
  return Math.max(1, Math.min(500, Math.floor(Number(value) || 1)));
}

function getTeamName(agent?: AgentOption | null) {
  return String(agent?.teamName || agent?.team || agent?.department || "").trim();
}

function challengeKey(username: string, challengeId: string) {
  return `${String(username).trim().toLowerCase()}::${challengeId}`;
}

export default function QaAccessCheckOverview({
  agents,
  history,
  currentUser,
  onOpenSetup,
}: {
  agents: AgentOption[];
  history: QaTypingChallengeHistoryRecord[];
  currentUser?: CurrentUser | null;
  onOpenSetup: (username: string) => void;
}) {
  const [overviewRows, setOverviewRows] = useState<QaTypingChallengeQueueOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [editingKey, setEditingKey] = useState("");
  const [draftRepeatCount, setDraftRepeatCount] = useState(1);
  const [savingKey, setSavingKey] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setLoadError("");
    return subscribeQaTypingChallengeOverview(
      (rows) => {
        setOverviewRows(rows);
        setLoading(false);
      },
      (nextError) => {
        console.warn("QA Access Check overview load failed", nextError);
        setOverviewRows([]);
        setLoading(false);
        setLoadError("ไม่สามารถโหลดรายการ QA Access Check ที่ค้างอยู่ได้");
      }
    );
  }, []);

  const agentMap = useMemo(() => {
    const map = new Map<string, AgentOption>();
    agents.forEach((agent) => {
      const username = String(agent.username || "").trim();
      if (username) map.set(username.toLowerCase(), agent);
    });
    return map;
  }, [agents]);

  const pendingRows = useMemo(() => {
    return overviewRows
      .filter((row) => row.queue.length > 0)
      .map((row) => {
        const agent = agentMap.get(row.username.toLowerCase()) || null;
        return {
          ...row,
          agent,
          displayName: String(agent?.agentName || agent?.displayName || row.displayName || row.username).trim(),
          teamName: getTeamName(agent),
        };
      })
      .sort((left, right) => left.displayName.localeCompare(right.displayName, "en", { sensitivity: "base" }));
  }, [overviewRows, agentMap]);

  const teamOptions = useMemo(() => {
    return [...new Set(pendingRows.map((row) => row.teamName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "en"));
  }, [pendingRows]);

  const visibleRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return pendingRows.filter((row) => {
      if (teamFilter !== "all" && row.teamName !== teamFilter) return false;
      if (!keyword) return true;
      const haystack = [
        row.username,
        row.displayName,
        row.agent?.role,
        row.teamName,
        ...row.queue.map((challenge) => challenge.word),
      ].join(" ").toLowerCase();
      return haystack.includes(keyword);
    });
  }, [pendingRows, search, teamFilter]);

  const pendingItemCount = useMemo(
    () => pendingRows.reduce((sum, row) => sum + row.queue.length, 0),
    [pendingRows]
  );
  const passCount = useMemo(() => history.filter((record) => record.result === "Pass").length, [history]);
  const unsuccessfulCount = useMemo(
    () => history.filter((record) => record.result === "Fail" || record.result === "Timeout").length,
    [history]
  );

  const beginEdit = (username: string, challenge: QaTypingChallenge) => {
    setMessage("");
    setError("");
    setEditingKey(challengeKey(username, challenge.id));
    setDraftRepeatCount(challenge.repeatCount);
  };

  const saveRepeatCount = async (username: string, challenge: QaTypingChallenge) => {
    const key = challengeKey(username, challenge.id);
    const nextCount = clampRepeatCount(draftRepeatCount);
    setMessage("");
    setError("");
    setSavingKey(key);
    try {
      await updateQaTypingChallengeRepeatCount(username, challenge.id, nextCount);
      setEditingKey("");
      setDraftRepeatCount(nextCount);
      setMessage(`แก้จำนวน${challenge.mode === "sentence" ? "รอบ" : "คำ"}ของ “${challenge.word}” เป็น ${nextCount} แล้ว`);
    } catch (saveError) {
      console.warn("Update QA Access Check repeat count failed", saveError);
      setError("แก้จำนวนคำ/รอบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSavingKey("");
    }
  };

  return (
    <div className="p-5 sm:p-6">
      <section className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-[0_18px_45px_rgba(76,29,149,0.08)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-600">Overview</div>
            <h2 className="mt-1 text-xl font-black text-slate-950">QA Access Check Pending Overview</h2>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              ดูว่าใครยังมีรายการค้าง อะไรที่ยังไม่ได้ทำ และแก้จำนวนคำ/จำนวนรอบของรายการที่ส่งไปแล้วได้จากหน้านี้
            </p>
          </div>
          <div className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-[10px] font-black text-violet-700">
            QA: {String(currentUser?.displayName || currentUser?.username || "-")}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-700">Pending Agents</div>
            <div className="mt-2 text-3xl font-black text-amber-900">{pendingRows.length}</div>
            <div className="mt-1 text-[10px] font-semibold text-amber-700">คนที่ยังมี Queue ค้าง</div>
          </div>
          <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">Pending Items</div>
            <div className="mt-2 text-3xl font-black text-violet-900">{pendingItemCount}</div>
            <div className="mt-1 text-[10px] font-semibold text-violet-700">รายการที่ยังต้องทำ</div>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">Pass History</div>
            <div className="mt-2 text-3xl font-black text-emerald-900">{passCount}</div>
            <div className="mt-1 text-[10px] font-semibold text-emerald-700">ผล Pass ที่บันทึกใน History</div>
          </div>
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-rose-700">Fail / Timeout</div>
            <div className="mt-2 text-3xl font-black text-rose-900">{unsuccessfulCount}</div>
            <div className="mt-1 text-[10px] font-semibold text-rose-700">ผลที่ยังไม่ผ่านใน History</div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Search</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search Agent, Username, Team หรือคำที่ส่งไป"
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Team</span>
            <select
              value={teamFilter}
              onChange={(event) => setTeamFilter(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
            >
              <option value="all">All Teams</option>
              {teamOptions.map((team) => <option key={team} value={team}>{team}</option>)}
            </select>
          </label>
        </div>

        {message ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800">{message}</div> : null}
        {error ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">{error}</div> : null}
        {loadError ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">{loadError}</div> : null}

        <div className="mt-5 space-y-4">
          {loading ? (
            <div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 px-5 py-12 text-center text-sm font-bold text-violet-500">กำลังโหลด Pending Queue...</div>
          ) : visibleRows.length ? visibleRows.map((row) => (
            <article key={row.username} className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-4 sm:px-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate text-sm font-black text-slate-950">{row.displayName}</div>
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[9px] font-black text-amber-700">PENDING {row.queue.length}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold text-slate-500">
                    <span>@{row.username}</span>
                    {row.agent?.role ? <span>{row.agent.role}</span> : null}
                    {row.teamName ? <span>Team: {row.teamName}</span> : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenSetup(row.username)}
                  className="rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-2 text-[10px] font-black text-violet-700 transition hover:bg-violet-100"
                >
                  Open Setup
                </button>
              </div>

              <div className="divide-y divide-slate-100">
                {row.queue.map((challenge, index) => {
                  const key = challengeKey(row.username, challenge.id);
                  const editing = editingKey === key;
                  const saving = savingKey === key;
                  const unitLabel = challenge.mode === "sentence" ? "รอบ" : "คำ";
                  return (
                    <div key={challenge.id} className="grid gap-4 px-4 py-4 sm:px-5 xl:grid-cols-[minmax(0,1fr)_150px_145px_150px_auto] xl:items-center">
                      <div className="min-w-0">
                        <div className="flex items-start gap-2.5">
                          <span className="inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-lg bg-violet-100 px-2 text-[10px] font-black text-violet-700">{index + 1}</span>
                          <div className="min-w-0">
                            <div className="break-words text-sm font-black text-slate-900">{challenge.word}</div>
                            <div className="mt-1 flex flex-wrap gap-2 text-[9px] font-semibold text-slate-500">
                              <span className="rounded-full bg-slate-100 px-2 py-1">{challenge.mode === "sentence" ? "Sentence Mode" : "Word Mode"}</span>
                              <span>ส่ง {formatDateTime(challenge.assignedAt)}</span>
                              {challenge.assignedBy ? <span>โดย {challenge.assignedBy}</span> : null}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Target</div>
                        {editing ? (
                          <input
                            type="number"
                            min={1}
                            max={500}
                            value={draftRepeatCount}
                            onChange={(event) => setDraftRepeatCount(Number(event.target.value))}
                            className="mt-1 w-full rounded-xl border border-violet-300 bg-white px-3 py-2 text-sm font-black text-slate-900 outline-none focus:ring-4 focus:ring-violet-100"
                          />
                        ) : (
                          <div className="mt-1 text-sm font-black text-slate-800">{challenge.repeatCount} {unitLabel}</div>
                        )}
                      </div>

                      <div>
                        <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Allowed Mistakes</div>
                        <div className="mt-1 text-sm font-black text-slate-800">{challenge.allowedMistakes} {unitLabel}</div>
                      </div>

                      <div>
                        <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Time Limit</div>
                        <div className="mt-1 text-sm font-black text-slate-800">{formatDuration(challenge.timeLimitSeconds)}</div>
                      </div>

                      <div className="flex flex-wrap gap-2 xl:justify-end">
                        {editing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void saveRepeatCount(row.username, challenge)}
                              disabled={saving}
                              className="rounded-xl bg-violet-600 px-3.5 py-2 text-[10px] font-black text-white transition hover:bg-violet-700 disabled:cursor-wait disabled:opacity-60"
                            >
                              {saving ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingKey("")}
                              disabled={saving}
                              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[10px] font-black text-slate-600 transition hover:bg-slate-50"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => beginEdit(row.username, challenge)}
                            className="rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-2 text-[10px] font-black text-violet-700 transition hover:bg-violet-100"
                          >
                            Edit {unitLabel}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          )) : (
            <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/60 px-5 py-12 text-center">
              <div className="text-base font-black text-emerald-800">ไม่มี QA Access Check ค้างในมุมมองนี้</div>
              <div className="mt-1 text-xs font-semibold text-emerald-700">Pending Queue ของ Agent ที่ตรงกับ Filter เป็น 0 รายการ</div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
