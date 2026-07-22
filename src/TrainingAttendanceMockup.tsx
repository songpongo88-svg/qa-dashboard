import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import PageHero from "./PageHero";
import { fetchUsageLogsByEventTypes, logUsageEvent } from "./usageLog";

type CurrentUser = {
  username: string;
  displayName: string;
  role: string;
  agentName: string;
  email?: string;
  loginAt: string;
} | null;

type UserAccount = {
  username: string;
  displayName: string;
  role: string;
  agentName: string;
  email?: string;
  teamLead?: string;
  teamName?: string;
  status?: string;
};

type TrainingSession = {
  id: string;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  round: string;
  trainer: string;
  status: "Draft" | "Active" | "Closed";
  note?: string;
  createdAt?: string;
  updatedAt?: string;
  closedAt?: string;
};

type RosterMember = {
  username: string;
  displayName: string;
  agentName: string;
  email: string;
  role: string;
  teamName: string;
  expectedToAttend: boolean;
  note: string;
};

type AttendanceRecord = {
  sessionId: string;
  userKey: string;
  checkInAt?: string;
  checkOutAt?: string;
  manualStatus?: AttendanceStatus;
  manualReason?: string;
  updatedBy?: string;
  updatedAt?: string;
};

type AttendanceStatus = "Not checked in" | "Checked in" | "Late" | "Checked out" | "Absent" | "Excused";

type TrainingState = {
  sessions: TrainingSession[];
  rosters: Record<string, RosterMember[]>;
  attendance: Record<string, Record<string, AttendanceRecord>>;
};

type TrainingAttendanceMockupProps = {
  currentUser: CurrentUser;
  accounts: UserAccount[];
  canViewTrainingCheckIn: boolean;
  canViewTrainingAttendance: boolean;
  canCheckInTrainingSelf: boolean;
  canManageTrainingSessions: boolean;
  canManageTrainingRoster: boolean;
  canManualUpdateTrainingAttendance: boolean;
  canExportTrainingAttendance: boolean;
};

const TRAINING_EVENT_TYPES = [
  "training_session_created",
  "training_session_updated",
  "training_session_closed",
  "training_roster_updated",
  "training_check_in",
  "training_check_out",
  "training_attendance_manual_update",
];

const TRAINING_STORAGE_KEY = "qa-dashboard:training-attendance-cache";

const SAMPLE_SESSION: TrainingSession = {
  id: "training-merchant-2026-06-30-r1",
  name: "Training Merchant",
  date: "2026-06-30",
  startTime: "09:00",
  endTime: "17:00",
  round: "1",
  trainer: "QA Team",
  status: "Draft",
  note: "First merchant training attendance session.",
  createdAt: new Date("2026-06-30T02:00:00.000Z").toISOString(),
};

function normalizeKey(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function memberKey(member: Pick<RosterMember, "username" | "email" | "agentName" | "displayName">) {
  return normalizeKey(member.username || member.email || member.agentName || member.displayName);
}

function userKeys(user: CurrentUser) {
  if (!user) return [];
  return [user.username, user.email, user.agentName, user.displayName].map(normalizeKey).filter(Boolean);
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", { hour12: false });
}

function sessionStart(session: TrainingSession) {
  const date = session.date || new Date().toISOString().slice(0, 10);
  const time = session.startTime || "00:00";
  return new Date(`${date}T${time}:00`);
}

function getAttendanceStatus(session: TrainingSession, member: RosterMember, record?: AttendanceRecord): AttendanceStatus {
  if (!member.expectedToAttend) return "Excused";
  if (record?.manualStatus) return record.manualStatus;
  if (!record?.checkInAt) return "Absent";
  if (record.checkOutAt) return "Checked out";
  const checkedIn = new Date(record.checkInAt);
  const start = sessionStart(session);
  if (!Number.isNaN(checkedIn.getTime()) && !Number.isNaN(start.getTime()) && checkedIn.getTime() > start.getTime()) return "Late";
  return "Checked in";
}

function statusClass(status: AttendanceStatus) {
  if (status === "Checked out" || status === "Checked in") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "Late") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "Excused") return "bg-sky-50 text-sky-700 border-sky-200";
  return "bg-rose-50 text-rose-700 border-rose-200";
}

function emptyState(): TrainingState {
  return {
    sessions: [SAMPLE_SESSION],
    rosters: { [SAMPLE_SESSION.id]: [] },
    attendance: {},
  };
}

function readLocalState(): TrainingState {
  try {
    const parsed = JSON.parse(localStorage.getItem(TRAINING_STORAGE_KEY) || "");
    if (parsed && Array.isArray(parsed.sessions) && parsed.rosters && parsed.attendance) return parsed;
  } catch {
    // Ignore broken local cache.
  }
  return emptyState();
}

function writeLocalState(state: TrainingState) {
  localStorage.setItem(TRAINING_STORAGE_KEY, JSON.stringify(state));
}

function replayTrainingLogs(logs: any[], fallback: TrainingState): TrainingState {
  const sessions = new Map<string, TrainingSession>();
  const rosters: Record<string, RosterMember[]> = { ...fallback.rosters };
  const attendance: Record<string, Record<string, AttendanceRecord>> = { ...fallback.attendance };

  fallback.sessions.forEach((session) => sessions.set(session.id, session));

  [...logs]
    .sort((a, b) => new Date(a.created_at || "").getTime() - new Date(b.created_at || "").getTime())
    .forEach((log) => {
      const details = log.details || {};
      const session = details.session as TrainingSession | undefined;
      const sessionId = String(details.sessionId || session?.id || "");
      if ((log.event_type === "training_session_created" || log.event_type === "training_session_updated") && session?.id) {
        sessions.set(session.id, { ...(sessions.get(session.id) || {}), ...session });
      }
      if (log.event_type === "training_session_closed" && sessionId) {
        const current = sessions.get(sessionId);
        if (current) sessions.set(sessionId, { ...current, status: "Closed", closedAt: String(details.closedAt || log.created_at || "") });
      }
      if (log.event_type === "training_roster_updated" && sessionId) {
        rosters[sessionId] = Array.isArray(details.roster) ? details.roster as RosterMember[] : [];
      }
      if ((log.event_type === "training_check_in" || log.event_type === "training_check_out" || log.event_type === "training_attendance_manual_update") && sessionId) {
        const record = details.attendance as AttendanceRecord | undefined;
        if (!record?.userKey) return;
        attendance[sessionId] = { ...(attendance[sessionId] || {}), [record.userKey]: record };
      }
    });

  return {
    sessions: Array.from(sessions.values()).sort((a, b) => `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`)),
    rosters,
    attendance,
  };
}

function makeBlankRosterMember(): RosterMember {
  return {
    username: "",
    displayName: "",
    agentName: "",
    email: "",
    role: "Admin Live Chat",
    teamName: "",
    expectedToAttend: true,
    note: "",
  };
}

function makeSessionId(name: string, date: string, round: string) {
  const slug = `${name}-${date}-r${round}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return slug || `training-${Date.now()}`;
}

export default function TrainingAttendanceMockup({
  currentUser,
  accounts,
  canViewTrainingCheckIn,
  canViewTrainingAttendance,
  canCheckInTrainingSelf,
  canManageTrainingSessions,
  canManageTrainingRoster,
  canManualUpdateTrainingAttendance,
  canExportTrainingAttendance,
}: TrainingAttendanceMockupProps) {
  const [state, setState] = useState<TrainingState>(() => readLocalState());
  const [selectedSessionId, setSelectedSessionId] = useState(() => readLocalState().sessions[0]?.id || SAMPLE_SESSION.id);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState({ name: "", date: "", round: "", status: "all", user: "", attendance: "all" });
  const [sessionDraft, setSessionDraft] = useState<TrainingSession>(() => ({
    id: "",
    name: "Training Merchant",
    date: "2026-06-30",
    startTime: "09:00",
    endTime: "17:00",
    round: "1",
    trainer: currentUser?.displayName || "QA Team",
    status: "Draft",
    note: "",
  }));
  const [rosterDraft, setRosterDraft] = useState<RosterMember>(() => makeBlankRosterMember());

  const selectedSession = state.sessions.find((item) => item.id === selectedSessionId) || state.sessions[0] || SAMPLE_SESSION;
  const roster = state.rosters[selectedSession.id] || [];
  const attendance = state.attendance[selectedSession.id] || {};
  const selfKeys = userKeys(currentUser);
  const selfMember = roster.find((member) => selfKeys.includes(memberKey(member)));
  const selfRecord = selfMember ? attendance[memberKey(selfMember)] : undefined;

  useEffect(() => {
    writeLocalState(state);
  }, [state]);

  async function refreshTrainingData(forceMessage = true) {
    setLoading(true);
    try {
      const logs = await fetchUsageLogsByEventTypes(TRAINING_EVENT_TYPES, { limit: 5000, forceRefresh: true, cacheTtlMs: 0 });
      const next = replayTrainingLogs(logs, readLocalState());
      setState(next);
      if (!next.sessions.some((item) => item.id === selectedSessionId)) setSelectedSessionId(next.sessions[0]?.id || SAMPLE_SESSION.id);
      if (forceMessage) setMessage(`Refresh complete: loaded ${logs.length} training log(s).`);
    } catch (error) {
      console.warn("Training refresh failed", error);
      if (forceMessage) setMessage("Central refresh failed. Showing local cached training data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshTrainingData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function persistEvent(eventType: string, details: Record<string, unknown>, nextState: TrainingState) {
    setState(nextState);
    const ok = await logUsageEvent(currentUser, eventType, { details: { ...details, tab: "training-attendance" } });
    setMessage(ok ? "Saved to central training log." : "Saved locally. Central log sync failed; refresh later after connection is available.");
  }

  function upsertSession() {
    if (!canManageTrainingSessions) return;
    const id = sessionDraft.id || makeSessionId(sessionDraft.name, sessionDraft.date, sessionDraft.round);
    const session: TrainingSession = { ...sessionDraft, id, updatedAt: new Date().toISOString() };
    if (!session.name.trim() || !session.date) {
      setMessage("Please enter training name and date.");
      return;
    }
    const exists = state.sessions.some((item) => item.id === id);
    const sessions = exists ? state.sessions.map((item) => item.id === id ? session : item) : [session, ...state.sessions];
    const next = { ...state, sessions, rosters: { ...state.rosters, [id]: state.rosters[id] || [] } };
    setSelectedSessionId(id);
    void persistEvent(exists ? "training_session_updated" : "training_session_created", { session }, next);
  }

  function closeSession() {
    if (!canManageTrainingSessions) return;
    const session = { ...selectedSession, status: "Closed" as const, closedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const next = { ...state, sessions: state.sessions.map((item) => item.id === session.id ? session : item) };
    void persistEvent("training_session_closed", { sessionId: session.id, closedAt: session.closedAt }, next);
  }

  function addRosterMember(member: RosterMember) {
    if (!canManageTrainingRoster) return;
    const clean: RosterMember = {
      ...member,
      username: member.username.trim(),
      displayName: member.displayName.trim(),
      agentName: member.agentName.trim() || member.displayName.trim(),
      email: member.email.trim(),
      role: member.role.trim() || "Admin Live Chat",
      teamName: member.teamName.trim(),
    };
    if (!clean.username && !clean.email && !clean.agentName && !clean.displayName) {
      setMessage("Please add at least one user identifier.");
      return;
    }
    const key = memberKey(clean);
    const nextRoster = [...roster.filter((item) => memberKey(item) !== key), clean].sort((a, b) => a.displayName.localeCompare(b.displayName));
    const next = { ...state, rosters: { ...state.rosters, [selectedSession.id]: nextRoster } };
    setRosterDraft(makeBlankRosterMember());
    void persistEvent("training_roster_updated", { sessionId: selectedSession.id, roster: nextRoster }, next);
  }

  function removeRosterMember(member: RosterMember) {
    if (!canManageTrainingRoster) return;
    const nextRoster = roster.filter((item) => memberKey(item) !== memberKey(member));
    const next = { ...state, rosters: { ...state.rosters, [selectedSession.id]: nextRoster } };
    void persistEvent("training_roster_updated", { sessionId: selectedSession.id, roster: nextRoster }, next);
  }

  function addAccountToRoster(username: string) {
    const account = accounts.find((item) => item.username === username);
    if (!account) return;
    addRosterMember({
      username: account.username,
      displayName: account.displayName,
      agentName: account.agentName || account.displayName,
      email: account.email || "",
      role: account.role,
      teamName: account.teamName || "",
      expectedToAttend: true,
      note: "",
    });
  }

  function saveAttendance(member: RosterMember, patch: Partial<AttendanceRecord>, eventType: string) {
    const key = memberKey(member);
    const record: AttendanceRecord = {
      sessionId: selectedSession.id,
      userKey: key,
      ...(attendance[key] || {}),
      ...patch,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.displayName || currentUser?.username || "Unknown",
    };
    const next = {
      ...state,
      attendance: {
        ...state.attendance,
        [selectedSession.id]: { ...attendance, [key]: record },
      },
    };
    void persistEvent(eventType, { sessionId: selectedSession.id, attendance: record }, next);
  }

  function checkInSelf() {
    if (!selfMember || !canCheckInTrainingSelf || selectedSession.status !== "Active") return;
    saveAttendance(selfMember, { checkInAt: new Date().toISOString(), manualStatus: undefined }, "training_check_in");
  }

  function checkOutSelf() {
    if (!selfMember || !canCheckInTrainingSelf || selectedSession.status !== "Active" || !selfRecord?.checkInAt) return;
    saveAttendance(selfMember, { checkOutAt: new Date().toISOString(), manualStatus: undefined }, "training_check_out");
  }

  function manualStatus(member: RosterMember, manualStatus: AttendanceStatus) {
    if (!canManualUpdateTrainingAttendance) return;
    const reason = window.prompt("Reason for manual attendance update") || "";
    saveAttendance(member, { manualStatus, manualReason: reason }, "training_attendance_manual_update");
  }

  const visibleRows = useMemo(() => {
    return state.sessions.flatMap((session) => {
      const sessionRoster = state.rosters[session.id] || [];
      const records = state.attendance[session.id] || {};
      return sessionRoster.map((member) => {
        const record = records[memberKey(member)];
        const status = getAttendanceStatus(session, member, record);
        return { session, member, record, status };
      });
    }).filter((row) => {
      const keyword = normalizeKey(`${row.member.displayName} ${row.member.agentName} ${row.member.email} ${row.member.username}`);
      if (filter.name && !normalizeKey(row.session.name).includes(normalizeKey(filter.name))) return false;
      if (filter.date && row.session.date !== filter.date) return false;
      if (filter.round && !normalizeKey(row.session.round).includes(normalizeKey(filter.round))) return false;
      if (filter.status !== "all" && row.session.status !== filter.status) return false;
      if (filter.user && !keyword.includes(normalizeKey(filter.user))) return false;
      if (filter.attendance !== "all" && row.status !== filter.attendance) return false;
      return true;
    });
  }, [filter, state]);

  const summary = useMemo(() => {
    const rows = roster.map((member) => getAttendanceStatus(selectedSession, member, attendance[memberKey(member)]));
    return {
      total: roster.length,
      checkedIn: rows.filter((status) => status === "Checked in" || status === "Late" || status === "Checked out").length,
      checkedOut: rows.filter((status) => status === "Checked out").length,
      absent: rows.filter((status) => status === "Absent").length,
      late: rows.filter((status) => status === "Late").length,
    };
  }, [attendance, roster, selectedSession]);

  function exportExcel() {
    if (!canExportTrainingAttendance) return;
    const rows = visibleRows.length ? visibleRows : roster.map((member) => ({
      session: selectedSession,
      member,
      record: attendance[memberKey(member)],
      status: getAttendanceStatus(selectedSession, member, attendance[memberKey(member)]),
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows.map((row) => ({
      "Training Name": row.session.name,
      Date: row.session.date,
      Round: row.session.round,
      Trainer: row.session.trainer,
      "Session Status": row.session.status,
      Username: row.member.username,
      "Display Name": row.member.displayName,
      "Agent Name": row.member.agentName,
      Email: row.member.email,
      Role: row.member.role,
      Team: row.member.teamName,
      "Expected To Attend": row.member.expectedToAttend ? "Yes" : "No",
      "Attendance Status": row.status,
      "Check In": formatDateTime(row.record?.checkInAt),
      "Check Out": formatDateTime(row.record?.checkOutAt),
      "Manual Reason": row.record?.manualReason || "",
      Note: row.member.note,
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Training_Attendance");
    XLSX.writeFile(workbook, `training_attendance_${selectedSession.date || "export"}.xlsx`);
  }

  if (!canViewTrainingCheckIn && !canViewTrainingAttendance) {
    return (
      <div className="rounded-3xl border border-rose-100 bg-rose-50 p-6 text-rose-700">
        You do not have permission to view Training Check-in.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Quality"
        title="Training"
        subtitle="สร้าง Session จัดรายชื่อ และบันทึกเวลาเข้าออกการอบรม"
        workspaceTitle="Training Workspace"
        workspaceSubtitle="ข้อมูลการเข้าอบรมของทีม QA"
      />

      <section className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-5">
          {[
            ["Session", selectedSession.name],
            ["Date", selectedSession.date],
            ["Roster", String(summary.total)],
            ["Checked in", String(summary.checkedIn)],
            ["Absent", String(summary.absent)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-500">{label}</div>
              <div className="mt-2 text-2xl font-black text-slate-950">{value}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select
            value={selectedSession.id}
            onChange={(event) => setSelectedSessionId(event.target.value)}
            className="min-w-[280px] rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-bold text-slate-900"
          >
            {state.sessions.map((session) => (
              <option key={session.id} value={session.id}>{session.name} | {session.date} | Round {session.round} | {session.status}</option>
            ))}
          </select>
          <button type="button" onClick={() => void refreshTrainingData()} className="rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-black text-violet-700">
            {loading ? "Refreshing..." : "Refresh Training Data"}
          </button>
          {canExportTrainingAttendance ? (
            <button type="button" onClick={exportExcel} className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white">
              Export Excel
            </button>
          ) : null}
          {message ? <span className="text-sm font-semibold text-slate-600">{message}</span> : null}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_1.6fr]">
        <section className="space-y-4">
          <div className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-sm">
            <div className="text-[11px] font-black uppercase tracking-[0.24em] text-violet-600">My Check-in</div>
            <div className="mt-2 text-2xl font-black text-slate-950">{currentUser?.displayName || "-"}</div>
            <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
              {selfMember ? (
                <>
                  <div>Status: <span className={`rounded-full border px-2 py-1 text-xs font-black ${statusClass(getAttendanceStatus(selectedSession, selfMember, selfRecord))}`}>{getAttendanceStatus(selectedSession, selfMember, selfRecord)}</span></div>
                  <div className="mt-2">Check in: {formatDateTime(selfRecord?.checkInAt)}</div>
                  <div>Check out: {formatDateTime(selfRecord?.checkOutAt)}</div>
                </>
              ) : (
                "You are not in this session roster. You can view attendance, but cannot check in or check out."
              )}
            </div>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                disabled={!selfMember || !canCheckInTrainingSelf || selectedSession.status !== "Active" || Boolean(selfRecord?.checkInAt)}
                onClick={checkInSelf}
                className="rounded-2xl bg-violet-700 px-4 py-3 text-sm font-black text-white disabled:bg-slate-300"
              >
                Check In
              </button>
              <button
                type="button"
                disabled={!selfMember || !canCheckInTrainingSelf || selectedSession.status !== "Active" || !selfRecord?.checkInAt || Boolean(selfRecord?.checkOutAt)}
                onClick={checkOutSelf}
                className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:bg-slate-300"
              >
                Check Out
              </button>
            </div>
          </div>

          {canManageTrainingSessions ? (
            <div className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-sm">
              <div className="text-lg font-black text-slate-950">Manage Session</div>
              <div className="mt-4 grid gap-3">
                <input value={sessionDraft.name} onChange={(event) => setSessionDraft({ ...sessionDraft, name: event.target.value })} className="rounded-2xl border border-violet-100 px-4 py-3 text-sm font-bold" placeholder="Training name" />
                <div className="grid grid-cols-2 gap-3">
                  <input type="date" value={sessionDraft.date} onChange={(event) => setSessionDraft({ ...sessionDraft, date: event.target.value })} className="rounded-2xl border border-violet-100 px-4 py-3 text-sm font-bold" />
                  <input value={sessionDraft.round} onChange={(event) => setSessionDraft({ ...sessionDraft, round: event.target.value })} className="rounded-2xl border border-violet-100 px-4 py-3 text-sm font-bold" placeholder="Round" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input type="time" value={sessionDraft.startTime} onChange={(event) => setSessionDraft({ ...sessionDraft, startTime: event.target.value })} className="rounded-2xl border border-violet-100 px-4 py-3 text-sm font-bold" />
                  <input type="time" value={sessionDraft.endTime} onChange={(event) => setSessionDraft({ ...sessionDraft, endTime: event.target.value })} className="rounded-2xl border border-violet-100 px-4 py-3 text-sm font-bold" />
                </div>
                <input value={sessionDraft.trainer} onChange={(event) => setSessionDraft({ ...sessionDraft, trainer: event.target.value })} className="rounded-2xl border border-violet-100 px-4 py-3 text-sm font-bold" placeholder="Trainer" />
                <select value={sessionDraft.status} onChange={(event) => setSessionDraft({ ...sessionDraft, status: event.target.value as TrainingSession["status"] })} className="rounded-2xl border border-violet-100 px-4 py-3 text-sm font-bold">
                  <option>Draft</option>
                  <option>Active</option>
                  <option>Closed</option>
                </select>
                <button type="button" onClick={upsertSession} className="rounded-2xl bg-violet-700 px-4 py-3 text-sm font-black text-white">Save Session</button>
                <button type="button" onClick={() => setSessionDraft(selectedSession)} className="rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-black text-violet-700">Edit Selected</button>
                <button type="button" onClick={closeSession} className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-black text-rose-700">Close Selected Session</button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-[28px] border border-violet-100 bg-white shadow-sm">
          <div className="border-b border-violet-100 p-5">
            <div className="text-[11px] font-black uppercase tracking-[0.24em] text-violet-600">Attendance Roster</div>
            <div className="mt-1 text-2xl font-black text-slate-950">{selectedSession.name}</div>
            <div className="mt-1 text-sm font-semibold text-slate-500">{selectedSession.date} | {selectedSession.startTime}-{selectedSession.endTime} | Round {selectedSession.round}</div>
          </div>

          {canManageTrainingRoster ? (
            <div className="border-b border-violet-100 bg-violet-50/40 p-5">
              <div className="grid gap-3 md:grid-cols-3">
                <select onChange={(event) => event.target.value && addAccountToRoster(event.target.value)} className="rounded-2xl border border-violet-100 px-4 py-3 text-sm font-bold" value="">
                  <option value="">Add user from directory</option>
                  {accounts.filter((account) => account.status !== "Suspended").map((account) => (
                    <option key={account.username} value={account.username}>{account.displayName} | {account.role}</option>
                  ))}
                </select>
                <input value={rosterDraft.displayName} onChange={(event) => setRosterDraft({ ...rosterDraft, displayName: event.target.value, agentName: event.target.value })} className="rounded-2xl border border-violet-100 px-4 py-3 text-sm font-bold" placeholder="Display name" />
                <input value={rosterDraft.email} onChange={(event) => setRosterDraft({ ...rosterDraft, email: event.target.value })} className="rounded-2xl border border-violet-100 px-4 py-3 text-sm font-bold" placeholder="Email" />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <input value={rosterDraft.username} onChange={(event) => setRosterDraft({ ...rosterDraft, username: event.target.value })} className="rounded-2xl border border-violet-100 px-4 py-3 text-sm font-bold" placeholder="Username" />
                <input value={rosterDraft.role} onChange={(event) => setRosterDraft({ ...rosterDraft, role: event.target.value })} className="rounded-2xl border border-violet-100 px-4 py-3 text-sm font-bold" placeholder="Role" />
                <input value={rosterDraft.teamName} onChange={(event) => setRosterDraft({ ...rosterDraft, teamName: event.target.value })} className="rounded-2xl border border-violet-100 px-4 py-3 text-sm font-bold" placeholder="Team" />
                <button type="button" onClick={() => addRosterMember(rosterDraft)} className="rounded-2xl bg-violet-700 px-4 py-3 text-sm font-black text-white">Add to Roster</button>
              </div>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-slate-950 text-white">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Role / Team</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Check In</th>
                  <th className="px-4 py-3">Check Out</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {roster.length ? roster.map((member) => {
                  const key = memberKey(member);
                  const record = attendance[key];
                  const status = getAttendanceStatus(selectedSession, member, record);
                  const isSelf = selfKeys.includes(key);
                  return (
                    <tr key={key} className="border-b border-slate-100">
                      <td className="px-4 py-3">
                        <div className="font-black text-slate-950">{member.displayName || member.agentName || member.username}</div>
                        <div className="text-xs font-semibold text-slate-500">{member.email || member.username}</div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-600">{member.role}<br />{member.teamName || "-"}</td>
                      <td className="px-4 py-3"><span className={`rounded-full border px-2.5 py-1 text-xs font-black ${statusClass(status)}`}>{status}</span></td>
                      <td className="px-4 py-3 font-semibold text-slate-600">{formatDateTime(record?.checkInAt)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-600">{formatDateTime(record?.checkOutAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {isSelf && selectedSession.status === "Active" ? (
                            <>
                              <button type="button" disabled={Boolean(record?.checkInAt)} onClick={() => saveAttendance(member, { checkInAt: new Date().toISOString(), manualStatus: undefined }, "training_check_in")} className="rounded-xl bg-violet-700 px-3 py-2 text-xs font-black text-white disabled:bg-slate-300">Check In</button>
                              <button type="button" disabled={!record?.checkInAt || Boolean(record?.checkOutAt)} onClick={() => saveAttendance(member, { checkOutAt: new Date().toISOString(), manualStatus: undefined }, "training_check_out")} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:bg-slate-300">Check Out</button>
                            </>
                          ) : null}
                          {canManualUpdateTrainingAttendance ? (
                            <select value="" onChange={(event) => event.target.value && manualStatus(member, event.target.value as AttendanceStatus)} className="rounded-xl border border-violet-100 px-2 py-2 text-xs font-bold">
                              <option value="">Manual update</option>
                              <option value="Checked in">Checked in</option>
                              <option value="Checked out">Checked out</option>
                              <option value="Late">Late</option>
                              <option value="Absent">Absent</option>
                              <option value="Excused">Excused</option>
                            </select>
                          ) : null}
                          {canManageTrainingRoster ? <button type="button" onClick={() => removeRosterMember(member)} className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-black text-rose-700">Remove</button> : null}
                        </div>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">No roster yet. QA/Supervisor can add participants above.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-sm">
        <div className="text-[11px] font-black uppercase tracking-[0.24em] text-violet-600">History / Report</div>
        <div className="mt-4 grid gap-3 md:grid-cols-6">
          <input value={filter.name} onChange={(event) => setFilter({ ...filter, name: event.target.value })} className="rounded-2xl border border-violet-100 px-4 py-3 text-sm font-bold" placeholder="Training Name" />
          <input type="date" value={filter.date} onChange={(event) => setFilter({ ...filter, date: event.target.value })} className="rounded-2xl border border-violet-100 px-4 py-3 text-sm font-bold" />
          <input value={filter.round} onChange={(event) => setFilter({ ...filter, round: event.target.value })} className="rounded-2xl border border-violet-100 px-4 py-3 text-sm font-bold" placeholder="Round" />
          <input value={filter.user} onChange={(event) => setFilter({ ...filter, user: event.target.value })} className="rounded-2xl border border-violet-100 px-4 py-3 text-sm font-bold" placeholder="User" />
          <select value={filter.status} onChange={(event) => setFilter({ ...filter, status: event.target.value })} className="rounded-2xl border border-violet-100 px-4 py-3 text-sm font-bold">
            <option value="all">All sessions</option>
            <option value="Draft">Draft</option>
            <option value="Active">Active</option>
            <option value="Closed">Closed</option>
          </select>
          <select value={filter.attendance} onChange={(event) => setFilter({ ...filter, attendance: event.target.value })} className="rounded-2xl border border-violet-100 px-4 py-3 text-sm font-bold">
            <option value="all">All attendance</option>
            <option>Not checked in</option>
            <option>Checked in</option>
            <option>Late</option>
            <option>Checked out</option>
            <option>Absent</option>
            <option>Excused</option>
          </select>
        </div>
        <div className="mt-4 text-sm font-semibold text-slate-500">Showing {visibleRows.length} roster row(s). Report includes roster members even when they never checked in.</div>
      </section>
    </div>
  );
}
