import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import PageHero from "./PageHero";
import {
  fetchScheduleMonths,
  findScheduleEntryForUser,
  normalizeScheduleName,
  saveScheduleMonth,
  subscribeScheduleMonth,
  type ShiftScheduleEntry,
  type ShiftScheduleMonth,
} from "./scheduleStore";

type ScheduleUser = {
  username: string;
  displayName: string;
  role: string;
  agentName: string;
};

type ParsedCandidate = {
  month: ShiftScheduleMonth;
  isDraft: boolean;
  employeeCount: number;
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTH_LOOKUP: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const STATUS_CODES = new Set(["OFF", "AL", "SL", "PL", "BL", "LW", "AB", "WFH"]);
const EDIT_OPTIONS = [
  "07:30-16:30",
  "08:00-17:00",
  "09:00-18:00",
  "10:00-19:00",
  "11:00-20:00",
  "12:00-21:00",
  "OFF", "AL", "SL", "PL", "BL", "LW", "AB",
];

const AUTO_WFH_START_TIMES = new Set(["07:30", "11:00", "12:00"]);

const SHIFT_SUMMARY_ROWS = [
  { start: "07:30", end: "16:30" },
  { start: "08:00", end: "17:00" },
  { start: "09:00", end: "18:00" },
  { start: "10:00", end: "19:00" },
  { start: "11:00", end: "20:00" },
  { start: "12:00", end: "21:00" },
];

const EMPLOYEE_SUMMARY_COLUMNS = ["BL", "AL", "SL", "PL", "LW", "AB", "TDO", "TWD", "TD"] as const;

function bangkokToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    monthKey: `${map.year}-${map.month}`,
    day: Number(map.day),
  };
}

function formatMonthLabel(monthKey: string) {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return monthKey;
  return `${MONTH_NAMES[Number(match[2]) - 1]} ${match[1]}`;
}

function parseMonthYear(text: unknown) {
  const value = String(text || "").trim();
  const match = value.match(/\b(JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:T(?:EMBER)?)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)\s*[.\-_/ ]*\s*(20\d{2}|\d{2})\b/i);
  if (!match) return "";
  const month = MONTH_LOOKUP[match[1].toLowerCase()];
  let year = Number(match[2]);
  if (year < 100) year += 2000;
  if (!month || year < 2000) return "";
  return `${year}-${String(month).padStart(2, "0")}`;
}

function detectSheetMonth(rows: any[][], sheetName: string) {
  for (const row of rows.slice(0, 18)) {
    for (const value of row.slice(0, 12)) {
      const detected = parseMonthYear(value);
      if (detected) return detected;
    }
  }
  return parseMonthYear(sheetName);
}

function excelTimeToClock(value: number) {
  const totalMinutes = Math.round(value * 24 * 60);
  const minutes = ((totalMinutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function addMinutes(clock: string, add: number) {
  const match = clock.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";
  const base = Number(match[1]) * 60 + Number(match[2]);
  const value = (base + add) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function parseShiftValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 1) {
    const start = excelTimeToClock(value);
    const end = addMinutes(start, 9 * 60);
    return { shiftCode: `${start}-${end}`, shiftStart: start, shiftEnd: end, status: "" };
  }
  const raw = String(value ?? "").trim();
  const upper = raw.toUpperCase();
  if (!raw) return { shiftCode: "", shiftStart: "", shiftEnd: "", status: "" };
  if (STATUS_CODES.has(upper)) return { shiftCode: upper, shiftStart: "", shiftEnd: "", status: upper };
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric >= 0 && numeric < 1) {
    const start = excelTimeToClock(numeric);
    const end = addMinutes(start, 9 * 60);
    return { shiftCode: `${start}-${end}`, shiftStart: start, shiftEnd: end, status: "" };
  }
  const time = raw.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
  if (time) {
    return { shiftCode: `${time[1]}-${time[2]}`, shiftStart: time[1], shiftEnd: time[2], status: "" };
  }
  return { shiftCode: raw, shiftStart: "", shiftEnd: "", status: upper };
}

function parseEditedShift(value: string) {
  const raw = value.trim();
  const upper = raw.toUpperCase();
  if (STATUS_CODES.has(upper)) return { shiftCode: upper, shiftStart: "", shiftEnd: "", status: upper };
  const match = raw.match(/^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/);
  if (match) return { shiftCode: `${match[1]}-${match[2]}`, shiftStart: match[1], shiftEnd: match[2], status: "" };
  return { shiftCode: raw, shiftStart: "", shiftEnd: "", status: upper };
}

function normalizeExcelHex(value: unknown) {
  const raw = String(value || "").replace(/[^0-9A-F]/gi, "").toUpperCase();
  if (raw.length === 8) return `#${raw.slice(2)}`;
  if (raw.length === 6) return `#${raw}`;
  return "";
}

function isPinkishHex(value: string) {
  const match = value.match(/^#([0-9A-F]{6})$/i);
  if (!match) return false;
  const r = Number.parseInt(match[1].slice(0, 2), 16);
  const g = Number.parseInt(match[1].slice(2, 4), 16);
  const b = Number.parseInt(match[1].slice(4, 6), 16);
  return r >= 210 && r > g + 15 && b >= 120 && b > g - 20;
}

function extractCellAppearance(ws: any, address: string) {
  const cell = ws?.[address];
  const fill =
    normalizeExcelHex(cell?.s?.fill?.fgColor?.rgb) ||
    normalizeExcelHex(cell?.s?.fill?.bgColor?.rgb);
  const fontColor = normalizeExcelHex(cell?.s?.font?.color?.rgb);
  return { fill, fontColor };
}

function extractNote(ws: any, address: string) {
  const cell = ws?.[address];
  const commentSources = [
    ...(Array.isArray(cell?.c) ? cell.c : []),
    ...(Array.isArray(cell?.comments) ? cell.comments : []),
  ];
  const commentText = commentSources
    .map((comment: any) => String(comment?.t || comment?.text || comment?.T || comment?.r || "").trim())
    .filter(Boolean);
  const directNote = typeof cell?.note === "string" ? cell.note.trim() : "";
  if (directNote) commentText.push(directNote);
  return [...new Set(commentText)].join("\n").trim();
}

function extractOtText(note: string) {
  if (!note) return "";
  const lines = note.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const otLines = lines.filter((line) => /\bOT\b|โอที/i.test(line));
  if (otLines.length) return otLines.join(" · ");
  return "";
}

function sectionName(value: unknown) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.replace(/^Full Name/i, "").trim() || "Team";
}

function parseSheetCandidate(workbook: any, sheetName: string, fileName: string): ParsedCandidate | null {
  const ws = workbook.Sheets[sheetName];
  if (!ws) return null;
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: "" });
  const monthKey = detectSheetMonth(rows, sheetName);
  if (!monthKey) return null;

  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const daysInMonth = new Date(year, month, 0).getDate();
  const entries: ShiftScheduleEntry[] = [];
  let currentSection = "";
  let dayColumns = new Map<number, number>();

  rows.forEach((row, rowIndex) => {
    const firstCell = String(row?.[0] || "");
    if (/Full\s*Name/i.test(firstCell)) {
      currentSection = sectionName(firstCell);
      const dateRow = rows[rowIndex + 2] || [];
      dayColumns = new Map<number, number>();
      let started = false;
      let expected = 1;
      for (let col = 3; col < dateRow.length; col += 1) {
        const day = Number(dateRow[col]);
        if (!started) {
          if (day === 1) {
            started = true;
            dayColumns.set(col, 1);
            expected = 2;
          }
          continue;
        }
        if (day === expected && day <= daysInMonth) {
          dayColumns.set(col, day);
          expected += 1;
          if (day === daysInMonth) break;
        }
      }
      return;
    }

    const employeeId = String(row?.[0] || "").trim();
    const agentName = String(row?.[1] || "").trim();
    if (!/^RBH\d+/i.test(employeeId) || !agentName || !dayColumns.size) return;

    const nickname = String(row?.[2] || "").trim();
    dayColumns.forEach((day, col) => {
      const parsed = parseShiftValue(row?.[col]);
      const date = `${monthKey}-${String(day).padStart(2, "0")}`;
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: col });
      const note = extractNote(ws, address);
      const appearance = extractCellAppearance(ws, address);
      const workMode =
        !parsed.status && (AUTO_WFH_START_TIMES.has(parsed.shiftStart) || isPinkishHex(appearance.fill))
          ? "WFH"
          : "";
      entries.push({
        employeeId,
        agentName,
        nickname,
        section: currentSection || "Team",
        date,
        shiftCode: parsed.shiftCode,
        shiftStart: parsed.shiftStart,
        shiftEnd: parsed.shiftEnd,
        status: parsed.status,
        otText: extractOtText(note),
        note,
        sourceFill: appearance.fill,
        sourceFontColor: appearance.fontColor,
        workMode,
      });
    });
  });

  const employeeCount = new Set(entries.map((entry) => normalizeScheduleName(entry.agentName))).size;
  if (!entries.length || !employeeCount) return null;

  return {
    month: {
      monthKey,
      sourceFileName: fileName,
      sheetName,
      entries,
      updatedBy: "",
      updatedAtIso: new Date().toISOString(),
    },
    isDraft: /draft/i.test(sheetName),
    employeeCount,
  };
}

function canManageSchedule(role: unknown) {
  const value = String(role || "").toLowerCase();
  return /quality assurance|\bqa\b|supervisor|senior|team lead|department head/.test(value);
}

function entryLabel(entry: ShiftScheduleEntry | null) {
  if (!entry) return "ไม่มีข้อมูล";
  if (entry.status) return entry.status;
  if (entry.shiftStart && entry.shiftEnd) return `${entry.shiftStart}–${entry.shiftEnd}`;
  return entry.shiftCode || "—";
}

function parseClockMinutes(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function formatClockMinutes(value: number) {
  const normalized = ((value % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function extractOtClockTimes(value: string) {
  return [...String(value || "").matchAll(/\b(\d{1,2}:\d{2})\b/g)]
    .map((match) => match[1])
    .filter(Boolean);
}

function scheduleCellLabel(entry: ShiftScheduleEntry | null) {
  if (!entry) return "—";
  if (entry.status) return entry.status;
  if (!entry.shiftStart || !entry.shiftEnd) return entry.shiftStart || entry.shiftCode || "—";

  const baseStart = parseClockMinutes(entry.shiftStart);
  const baseEnd = parseClockMinutes(entry.shiftEnd);
  if (baseStart === null || baseEnd === null) return `${entry.shiftStart}-${entry.shiftEnd}`;

  const otTimes = extractOtClockTimes(entry.otText)
    .map(parseClockMinutes)
    .filter((value): value is number => value !== null);

  const validOtEndTimes = otTimes.filter((value) => value >= baseEnd);
  const end = validOtEndTimes.length ? Math.max(baseEnd, ...validOtEndTimes) : baseEnd;
  return `${formatClockMinutes(baseStart)}-${formatClockMinutes(end)}`;
}

function isScheduleChangedEntry(entry: ShiftScheduleEntry | null) {
  if (!entry?.note) return false;
  const note = entry.note.toLowerCase();
  return /(แลก|เปลี่ยน(?:กะ|เวลา|ตาราง|เป็น)?|สลับ|เดิม|swap|switch|change(?:d)?\s*(?:shift|schedule|time)?)/i.test(note);
}

function isWfhEntry(entry: ShiftScheduleEntry | null) {
  return Boolean(
    entry &&
    !entry.status &&
    (
      entry.workMode === "WFH" ||
      AUTO_WFH_START_TIMES.has(entry.shiftStart) ||
      (!entry.workMode && isPinkishHex(entry.sourceFill || ""))
    )
  );
}

function isWorkingEntry(entry: ShiftScheduleEntry | null) {
  return Boolean(entry && !entry.status && entry.shiftStart);
}

function workModeLabel(entry: ShiftScheduleEntry | null) {
  if (!isWorkingEntry(entry)) return "";
  const mode = isWfhEntry(entry) ? "WFH" : "Workspace";
  return entry?.otText ? `${mode}, OT` : mode;
}

function entryTone(entry: ShiftScheduleEntry | null) {
  if (!entry) return "border-slate-200 bg-slate-50 text-slate-500";
  if (isScheduleChangedEntry(entry)) return "border-orange-400 bg-orange-200 text-orange-950";
  if (isWfhEntry(entry)) return "border-pink-300 bg-pink-200 text-pink-950";
  if (entry.status === "OFF") return "border-emerald-300 bg-emerald-100 text-emerald-700";
  if (["BL", "AL", "SL", "PL", "LW"].includes(entry.status)) return "border-yellow-400 bg-yellow-300 text-red-600";
  if (entry.status === "AB") return "border-red-600 bg-red-500 text-white";
  if (entry.status) return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-white text-slate-800";
}

function entryStyle(entry: ShiftScheduleEntry | null): React.CSSProperties | undefined {
  if (!entry || entry.status || isWfhEntry(entry) || isScheduleChangedEntry(entry) || !entry.sourceFill) return undefined;
  return {
    backgroundColor: entry.sourceFill,
    color: entry.sourceFontColor || undefined,
  };
}

function formatOtLabel(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const cleaned = raw
    .replace(/^\+\s*/g, "")
    .replace(/^OT\s*[:：]?\s*/i, "")
    .trim();
  return cleaned ? `+ OT ${cleaned}` : "+ OT";
}

function employeeScheduleSummary(
  entries: ShiftScheduleEntry[],
  agentName: string,
  daysInMonth: number
) {
  const mine = entries.filter((entry) => normalizeScheduleName(entry.agentName) === normalizeScheduleName(agentName));
  const countStatus = (status: string) => mine.filter((entry) => entry.status === status).length;
  const twd = mine.filter((entry) => !entry.status && Boolean(entry.shiftStart)).length;
  return {
    BL: countStatus("BL"),
    AL: countStatus("AL"),
    SL: countStatus("SL"),
    PL: countStatus("PL"),
    LW: countStatus("LW"),
    AB: countStatus("AB"),
    TDO: countStatus("OFF"),
    TWD: twd,
    TD: daysInMonth,
  };
}

export function ScheduleSidebarCard({
  currentUser,
  collapsed = false,
  onOpen,
}: {
  currentUser: ScheduleUser;
  collapsed?: boolean;
  onOpen: () => void;
}) {
  const today = useMemo(() => bangkokToday(), []);
  const [month, setMonth] = useState<ShiftScheduleMonth | null>(null);

  useEffect(() => subscribeScheduleMonth(today.monthKey, setMonth, () => setMonth(null)), [today.monthKey]);

  const entry = useMemo(
    () => findScheduleEntryForUser(month, today.date, [currentUser.agentName, currentUser.displayName, currentUser.username]),
    [currentUser, month, today.date]
  );

  const summary = entry
    ? entry.status
      ? `วันนี้ · ${entry.status}`
      : `วันนี้ · ${scheduleCellLabel(entry)} · ${workModeLabel(entry)}`
    : month
      ? "วันนี้ · ไม่พบชื่อใน SCH"
      : "วันนี้ · ยังไม่มีตาราง";

  return (
    <button
      type="button"
      onClick={onOpen}
      title={summary}
      className={`mt-2 flex w-full items-center rounded-xl border border-white/15 bg-white/10 text-white transition hover:bg-white/20 ${collapsed ? "justify-center px-2 py-2" : "gap-2 px-2.5 py-2 text-left"}`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-violet-100" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 3v4M17 3v4M3 10h18" />
      </svg>
      {!collapsed ? (
        <span className="qa-sidebar-label min-w-0 flex-1">
          <span className="block text-[9px] font-normal uppercase tracking-[0.12em] text-violet-300">SCH</span>
          <span className="block truncate text-[10px] font-medium text-white">{summary}</span>
        </span>
      ) : null}
    </button>
  );
}

export function ScheduleMockup({ currentUser }: { currentUser: ScheduleUser }) {
  const today = useMemo(() => bangkokToday(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const scrollSyncRef = useRef<"top" | "table" | null>(null);
  const [months, setMonths] = useState<ShiftScheduleMonth[]>([]);
  const [selectedMonthKey, setSelectedMonthKey] = useState(today.monthKey);
  const [month, setMonth] = useState<ShiftScheduleMonth | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [candidates, setCandidates] = useState<ParsedCandidate[]>([]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [importing, setImporting] = useState(false);
  const [editEntry, setEditEntry] = useState<ShiftScheduleEntry | null>(null);
  const [editShift, setEditShift] = useState("");
  const [editOt, setEditOt] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editWfh, setEditWfh] = useState(false);
  const canManage = canManageSchedule(currentUser.role);

  const refreshMonths = async () => {
    try {
      const next = await fetchScheduleMonths();
      setMonths(next);
      if (!next.some((item) => item.monthKey === selectedMonthKey) && next.length && selectedMonthKey !== today.monthKey) {
        setSelectedMonthKey(next[0].monthKey);
      }
    } catch (error) {
      console.error("Load schedule months failed", error);
    }
  };

  useEffect(() => { void refreshMonths(); }, []);

  useEffect(() => {
    setLoading(true);
    return subscribeScheduleMonth(
      selectedMonthKey,
      (value) => {
        setMonth(value);
        setLoading(false);
      },
      (error) => {
        console.error("Load schedule month failed", error);
        setMonth(null);
        setLoading(false);
      }
    );
  }, [selectedMonthKey]);

  const todayEntry = useMemo(
    () => findScheduleEntryForUser(
      selectedMonthKey === today.monthKey ? month : null,
      today.date,
      [currentUser.agentName, currentUser.displayName, currentUser.username]
    ),
    [currentUser, month, selectedMonthKey, today.date, today.monthKey]
  );

  const people = useMemo(() => {
    if (!month) return [];
    const map = new Map<string, { employeeId: string; agentName: string; nickname: string; section: string }>();
    month.entries.forEach((entry) => {
      const key = normalizeScheduleName(entry.agentName);
      if (!map.has(key)) {
        map.set(key, {
          employeeId: entry.employeeId,
          agentName: entry.agentName,
          nickname: entry.nickname,
          section: entry.section,
        });
      }
    });
    return [...map.values()];
  }, [month]);

  const peopleBySection = useMemo(() => {
    const groups = new Map<string, typeof people>();
    people.forEach((person) => {
      const section = person.section || "Team";
      const list = groups.get(section) || [];
      list.push(person);
      groups.set(section, list);
    });
    return [...groups.entries()];
  }, [people]);

  const entriesByPersonDate = useMemo(() => {
    const map = new Map<string, ShiftScheduleEntry>();
    month?.entries.forEach((entry) => map.set(`${normalizeScheduleName(entry.agentName)}|${entry.date}`, entry));
    return map;
  }, [month]);

  const workingEntriesByDate = useMemo(() => {
    const map = new Map<string, ShiftScheduleEntry[]>();
    month?.entries.forEach((entry) => {
      if (entry.status || !entry.shiftStart) return;
      const list = map.get(entry.date) || [];
      list.push(entry);
      map.set(entry.date, list);
    });
    return map;
  }, [month]);

  const daysInMonth = useMemo(() => {
    const match = selectedMonthKey.match(/^(\d{4})-(\d{2})$/);
    return match ? new Date(Number(match[1]), Number(match[2]), 0).getDate() : 31;
  }, [selectedMonthKey]);

  const employeeSummaryWidth = EMPLOYEE_SUMMARY_COLUMNS.length * 56;
  const scheduleTableMinWidth = 286 + daysInMonth * 118 + employeeSummaryWidth;

  const syncHorizontalScroll = (source: "top" | "table") => {
    if (scrollSyncRef.current && scrollSyncRef.current !== source) return;
    const from = source === "top" ? topScrollRef.current : tableScrollRef.current;
    const to = source === "top" ? tableScrollRef.current : topScrollRef.current;
    if (!from || !to) return;
    scrollSyncRef.current = source;
    to.scrollLeft = from.scrollLeft;
    window.requestAnimationFrame(() => {
      scrollSyncRef.current = null;
    });
  };

  const handleFile = async (file: File) => {
    setMessage("");
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: false, cellStyles: true });
      const next = workbook.SheetNames
        .filter((name) => !/^\s*D_/i.test(name))
        .map((name) => parseSheetCandidate(workbook, name, file.name))
        .filter(Boolean) as ParsedCandidate[];
      next.sort((a, b) => {
        const currentDiff = Number(b.month.monthKey === today.monthKey) - Number(a.month.monthKey === today.monthKey);
        if (currentDiff) return currentDiff;
        const draftDiff = Number(a.isDraft) - Number(b.isDraft);
        if (draftDiff) return draftDiff;
        return b.month.monthKey.localeCompare(a.month.monthKey);
      });
      setCandidates(next);
      setCandidateIndex(0);
      setMessage(next.length ? `พบ ${next.length} ตารางรายเดือนในไฟล์ เลือกเดือนที่ต้องการนำเข้า` : "ไม่พบชีตรายเดือนที่อ่านได้");
    } catch (error) {
      console.error("Parse shift schedule failed", error);
      setCandidates([]);
      setMessage("อ่านไฟล์ไม่สำเร็จ กรุณาใช้ไฟล์ Excel ตารางกะรูปแบบเดิม");
    }
  };

  const importSelected = async () => {
    const candidate = candidates[candidateIndex];
    if (!candidate) return;
    setImporting(true);
    setMessage("");
    try {
      await saveScheduleMonth({
        ...candidate.month,
        updatedBy: currentUser.displayName || currentUser.username,
        updatedAtIso: new Date().toISOString(),
      });
      setSelectedMonthKey(candidate.month.monthKey);
      setMessage(`นำเข้า ${formatMonthLabel(candidate.month.monthKey)} แล้ว · ${candidate.employeeCount} คน`);
      setCandidates([]);
      await refreshMonths();
      window.dispatchEvent(new CustomEvent("qa-schedule-updated", { detail: { monthKey: candidate.month.monthKey } }));
    } catch (error) {
      console.error("Save schedule month failed", error);
      setMessage("บันทึกตารางกะไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setImporting(false);
    }
  };

  const openEdit = (entry: ShiftScheduleEntry) => {
    if (!canManage) return;
    setEditEntry(entry);
    setEditShift(entry.shiftCode || entry.status || "");
    setEditOt(entry.otText || "");
    setEditNote(entry.note || "");
    setEditWfh(isWfhEntry(entry));
  };

  const saveEdit = async () => {
    if (!month || !editEntry) return;
    const parsed = parseEditedShift(editShift);
    const shiftChanged = parsed.shiftCode !== editEntry.shiftCode || parsed.status !== editEntry.status;
    const nextWorkMode =
      !parsed.status && (editWfh || AUTO_WFH_START_TIMES.has(parsed.shiftStart))
        ? "WFH"
        : "";
    const nextEntry: ShiftScheduleEntry = {
      ...editEntry,
      ...parsed,
      otText: editOt.trim(),
      note: editNote.trim(),
      workMode: nextWorkMode,
      sourceFill: shiftChanged ? "" : editEntry.sourceFill,
      sourceFontColor: shiftChanged ? "" : editEntry.sourceFontColor,
    };
    const nextMonth: ShiftScheduleMonth = {
      ...month,
      entries: month.entries.map((entry) =>
        entry.agentName === editEntry.agentName && entry.date === editEntry.date ? nextEntry : entry
      ),
      updatedBy: currentUser.displayName || currentUser.username,
      updatedAtIso: new Date().toISOString(),
    };
    try {
      await saveScheduleMonth(nextMonth);
      setMonth(nextMonth);
      setEditEntry(null);
      setMessage(`อัปเดต ${editEntry.agentName} · ${editEntry.date} แล้ว`);
      await refreshMonths();
      window.dispatchEvent(new CustomEvent("qa-schedule-updated", { detail: { monthKey: nextMonth.monthKey } }));
    } catch (error) {
      console.error("Update schedule entry failed", error);
      setMessage("แก้ไขตารางไม่สำเร็จ");
    }
  };

  const selectedCandidate = candidates[candidateIndex];

  return (
    <div className="min-h-screen bg-[#f6f7fb] pb-10 font-['Kanit']">
      <PageHero
        eyebrow="SHIFT SCHEDULE"
        title="SCH"
        subtitle="อัปโหลดตารางกะรายเดือน ดูกะวันนี้ และแก้ไขกะ/OT ได้ใน QA Dashboard"
        workspaceTitle="Shift Schedule"
        workspaceSubtitle="Monthly schedule · Shift · OT"
      />

      <div className="mx-auto max-w-[1720px] space-y-5 px-5 py-6 lg:px-8">
        <div className="grid gap-4 lg:grid-cols-[1fr_1.35fr]">
          <section className="rounded-[22px] border border-violet-200 bg-white p-5 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-600">Today</div>
            <div className="mt-2 text-xl font-bold text-slate-950">{currentUser.agentName || currentUser.displayName}</div>
            <div
              className={`mt-4 inline-flex rounded-2xl border px-4 py-3 text-base font-bold ${entryTone(todayEntry)}`}
              style={entryStyle(todayEntry)}
            >
              <span>{scheduleCellLabel(todayEntry)}</span>
              {isWorkingEntry(todayEntry) ? (
                <span className="ml-2 text-xs font-semibold opacity-80">· {workModeLabel(todayEntry)}</span>
              ) : null}
            </div>
            {todayEntry?.note ? <div className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-500">{todayEntry.note}</div> : null}
            {selectedMonthKey !== today.monthKey ? <div className="mt-3 text-xs text-slate-400">การ์ด Today จะแสดงเมื่อเลือกเดือนปัจจุบัน</div> : null}
          </section>

          <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-base font-bold text-slate-950">นำเข้าตารางกะจาก Excel</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">อัปโหลดเดือนย้อนหลังหรือเดือนปัจจุบันได้ · นำเข้าเดือนเดิมอีกครั้งจะอัปเดตข้อมูลเดือนนั้น</div>
              </div>
              {canManage ? (
                <>
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleFile(file);
                    event.currentTarget.value = "";
                  }} />
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-800">
                    Upload Excel
                  </button>
                </>
              ) : (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500">View only</span>
              )}
            </div>

            {candidates.length ? (
              <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
                <label className="text-xs font-semibold text-violet-800">เลือกชีตที่จะนำเข้า</label>
                <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                  <select value={candidateIndex} onChange={(event) => setCandidateIndex(Number(event.target.value))} className="min-w-0 flex-1 rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm text-slate-800">
                    {candidates.map((candidate, index) => (
                      <option key={`${candidate.month.sheetName}-${index}`} value={index}>
                        {formatMonthLabel(candidate.month.monthKey)} · {candidate.month.sheetName}{candidate.isDraft ? " (Draft)" : ""} · {candidate.employeeCount} คน
                      </option>
                    ))}
                  </select>
                  <button type="button" disabled={importing} onClick={() => void importSelected()} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                    {importing ? "กำลังนำเข้า..." : selectedCandidate ? `นำเข้า ${formatMonthLabel(selectedCandidate.month.monthKey)}` : "นำเข้า"}
                  </button>
                </div>
                {selectedCandidate?.isDraft ? <div className="mt-2 text-xs font-semibold text-amber-700">ชีตนี้เป็น Draft กรุณาตรวจสอบก่อนนำเข้า</div> : null}
              </div>
            ) : null}
            {message ? <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">{message}</div> : null}
          </section>
        </div>

        <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <div className="text-base font-bold text-slate-950">Monthly Schedule</div>
              <div className="mt-1 text-xs text-slate-500">{month ? `Source: ${month.sourceFileName} · ${month.sheetName}` : "เลือกเดือนหรืออัปโหลดไฟล์"}</div>
            </div>
            <select value={selectedMonthKey} onChange={(event) => setSelectedMonthKey(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">
              {[...new Set([today.monthKey, ...months.map((item) => item.monthKey)])].sort((a, b) => b.localeCompare(a)).map((key) => (
                <option key={key} value={key}>{formatMonthLabel(key)}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">กำลังโหลดตาราง...</div>
          ) : !month ? (
            <div className="p-10 text-center">
              <div className="text-base font-bold text-slate-700">ยังไม่มีตาราง {formatMonthLabel(selectedMonthKey)}</div>
              <div className="mt-2 text-sm text-slate-500">อัปโหลดไฟล์ Excel แล้วเลือกชีตของเดือนนี้เพื่อเพิ่มข้อมูล</div>
            </div>
          ) : (
            <div className="relative">
              <div
                ref={topScrollRef}
                onScroll={() => syncHorizontalScroll("top")}
                className="sticky top-0 z-30 overflow-x-auto overflow-y-hidden border-b border-slate-200 bg-white/95"
                aria-label="เลื่อนตารางกะซ้ายขวา"
              >
                <div style={{ width: scheduleTableMinWidth, height: 14 }} />
              </div>
              <div
                ref={tableScrollRef}
                onScroll={() => syncHorizontalScroll("table")}
                className="max-h-[68vh] overflow-auto"
              >
                <table className="min-w-max border-collapse text-xs" style={{ minWidth: scheduleTableMinWidth }}>
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-slate-950 text-white">
                      <th className="sticky left-0 z-30 min-w-[286px] border-r-2 border-slate-300 bg-slate-950 px-3 py-3 text-left">Agent</th>
                      {Array.from({ length: daysInMonth }, (_, index) => {
                        const day = index + 1;
                        const isToday = selectedMonthKey === today.monthKey && day === today.day;
                        return <th key={day} className={`min-w-[118px] border-r border-slate-700 px-2 py-3 text-center ${isToday ? "bg-violet-700" : ""}`}>{day}</th>;
                      })}
                      {EMPLOYEE_SUMMARY_COLUMNS.map((column) => (
                        <th
                          key={column}
                          className={`min-w-[56px] border-l border-slate-700 px-2 py-3 text-center font-black ${
                            ["BL", "AL", "SL", "PL", "LW"].includes(column)
                              ? "bg-yellow-300 text-red-600"
                              : column === "AB"
                                ? "bg-red-500 text-white"
                                : "bg-slate-300 text-slate-950"
                          }`}
                        >
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  {peopleBySection.map(([section, sectionPeople]) => (
                    <tbody key={section}>
                      <tr>
                        <td
                          colSpan={daysInMonth + 1 + EMPLOYEE_SUMMARY_COLUMNS.length}
                          className="border-b border-violet-300 bg-violet-100 px-3 py-2 text-left text-[11px] font-black uppercase tracking-[0.08em] text-violet-900"
                        >
                          {section}
                        </td>
                      </tr>
                      {sectionPeople.map((person, personIndex) => (
                        <tr key={person.agentName} className={personIndex % 2 ? "bg-slate-50/60" : "bg-white"}>
                          <td
                            className={`sticky left-0 z-40 min-w-[286px] overflow-hidden border-b border-r-2 border-slate-300 px-3 py-2 ${personIndex % 2 ? "bg-slate-50" : "bg-white"}`}
                            style={{ width: 286, minWidth: 286, maxWidth: 286 }}
                          >
                            <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-violet-600">{person.employeeId || "—"}</div>
                            <div className="mt-0.5 font-semibold text-slate-900">{person.agentName}</div>
                            <div className="mt-0.5 text-[10px] text-slate-500">{person.nickname || "—"}</div>
                          </td>
                          {Array.from({ length: daysInMonth }, (_, index) => {
                            const day = index + 1;
                            const date = `${selectedMonthKey}-${String(day).padStart(2, "0")}`;
                            const entry = entriesByPersonDate.get(`${normalizeScheduleName(person.agentName)}|${date}`) || null;
                            const isToday = selectedMonthKey === today.monthKey && day === today.day;
                            return (
                              <td key={date} className={`border-b border-r border-slate-200 p-1.5 text-center ${isToday ? "bg-violet-50" : ""}`}>
                                <button
                                  type="button"
                                  disabled={!entry || !canManage}
                                  onClick={() => entry && openEdit(entry)}
                                  title={entry?.note || entry?.otText || entryLabel(entry)}
                                  className={`relative min-h-[54px] w-full rounded-lg border px-2 py-2 text-[10px] font-semibold leading-4 ${entryTone(entry)} ${canManage && entry ? "hover:ring-2 hover:ring-violet-200" : ""}`}
                                  style={entryStyle(entry)}
                                >
                                  {isWorkingEntry(entry) ? (
                                    <span className="absolute right-1.5 top-1 flex items-center gap-0.5 whitespace-nowrap text-[8px] font-black tracking-wide">
                                      <span className={isWfhEntry(entry) ? "text-pink-700" : "text-slate-500"}>
                                        {isWfhEntry(entry) ? "WFH" : "Workspace"}
                                      </span>
                                      {entry?.otText ? (
                                        <>
                                          <span className="text-slate-400">,</span>
                                          <span className="text-red-600">OT</span>
                                        </>
                                      ) : null}
                                    </span>
                                  ) : null}
                                  <span className="block whitespace-nowrap px-1 pt-3">{scheduleCellLabel(entry)}</span>
                                </button>
                              </td>
                            );
                          })}
                          {(() => {
                            const summary = employeeScheduleSummary(month.entries, person.agentName, daysInMonth);
                            return EMPLOYEE_SUMMARY_COLUMNS.map((column) => (
                              <td
                                key={column}
                                className={`min-w-[56px] border-b border-l px-2 py-2 text-center font-black ${
                                  ["BL", "AL", "SL", "PL", "LW"].includes(column)
                                    ? "border-yellow-300 bg-yellow-50 text-red-600"
                                    : column === "AB"
                                      ? "border-red-300 bg-red-50 text-red-700"
                                      : "border-slate-300 bg-slate-100 text-slate-800"
                                }`}
                              >
                                {summary[column]}
                              </td>
                            ));
                          })()}
                        </tr>
                      ))}
                    </tbody>
                  ))}
                  <tbody>
                    <tr>
                      <td
                        colSpan={daysInMonth + 1}
                        className="border-y border-amber-300 bg-amber-50 px-3 py-2 text-left text-[11px] font-black uppercase tracking-[0.08em] text-amber-900"
                      >
                        Shift Headcount
                      </td>
                    </tr>
                    {SHIFT_SUMMARY_ROWS.map((shift) => (
                      <tr key={shift.start} className="bg-white">
                        <td className="sticky left-0 z-[8] min-w-[286px] border-b border-r-2 border-slate-300 bg-amber-50 px-3 py-2 font-bold text-slate-800">
                          {shift.start}–{shift.end}
                        </td>
                        {Array.from({ length: daysInMonth }, (_, index) => {
                          const day = index + 1;
                          const date = `${selectedMonthKey}-${String(day).padStart(2, "0")}`;
                          const count = (workingEntriesByDate.get(date) || []).filter((entry) => entry.shiftStart === shift.start).length;
                          return (
                            <td key={date} className="border-b border-r border-slate-200 bg-white px-2 py-2 text-center font-bold text-slate-700">
                              {count}
                            </td>
                          );
                        })}
                        {EMPLOYEE_SUMMARY_COLUMNS.map((column) => (
                          <td key={column} className="min-w-[56px] border-b border-l border-slate-200 bg-slate-50" />
                        ))}
                      </tr>
                    ))}
                    <tr className="bg-violet-700 text-white">
                      <td className="sticky left-0 z-[8] min-w-[286px] border-r-2 border-slate-300 bg-violet-700 px-3 py-2 font-black">
                        Headcount Per Day
                      </td>
                      {Array.from({ length: daysInMonth }, (_, index) => {
                        const day = index + 1;
                        const date = `${selectedMonthKey}-${String(day).padStart(2, "0")}`;
                        const count = (workingEntriesByDate.get(date) || []).length;
                        return (
                          <td key={date} className="border-r border-violet-500 px-2 py-2 text-center font-black">
                            {count}
                          </td>
                        );
                      })}
                      {EMPLOYEE_SUMMARY_COLUMNS.map((column) => (
                        <td key={column} className="min-w-[56px] border-l border-violet-500 bg-violet-700" />
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {month ? (
            <div className="border-t border-slate-100 px-5 py-3 text-[11px] text-slate-500">
              Last update: {month.updatedAtIso ? new Date(month.updatedAtIso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "—"} · {month.updatedBy || "—"}
              {canManage ? " · คลิกช่องวันที่เพื่อแก้ไขกะ/OT" : ""}
            </div>
          ) : null}
        </section>
      </div>

      {editEntry ? (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setEditEntry(null);
        }}>
          <div className="w-full max-w-lg rounded-[24px] border border-white/60 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-bold text-slate-950">แก้ไข SCH</div>
                <div className="mt-1 text-sm text-slate-500">{editEntry.agentName} · {editEntry.date}</div>
              </div>
              <button type="button" onClick={() => setEditEntry(null)} className="h-9 w-9 rounded-full bg-slate-100 text-lg text-slate-600">×</button>
            </div>
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Shift / Status</span>
                <input list="qa-sch-shifts" value={editShift} onChange={(event) => setEditShift(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                <datalist id="qa-sch-shifts">{EDIT_OPTIONS.map((option) => <option key={option} value={option} />)}</datalist>
              </label>
              {!parseEditedShift(editShift).status ? (
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-pink-200 bg-pink-50 px-3 py-3">
                  <span>
                    <span className="block text-xs font-bold text-pink-900">WFH</span>
                    <span className="block text-[10px] text-pink-700">ติ๊กเพื่อกำหนดกะนี้เป็น Work From Home และใช้พื้นหลังสีชมพู</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={editWfh}
                    onChange={(event) => setEditWfh(event.target.checked)}
                    className="h-5 w-5 accent-pink-600"
                  />
                </label>
              ) : null}
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">OT</span>
                <input value={editOt} onChange={(event) => setEditOt(event.target.value)} placeholder="เช่น 18:00-19:00" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                {editOt.trim() ? (
                  <span className="mt-1 block text-[10px] font-bold text-rose-600">
                    ตารางจะรวมเวลาถึง OT และแสดงคำว่า OT ที่มุมขวาบน
                  </span>
                ) : null}
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Note / ประวัติการเปลี่ยนกะ</span>
                <textarea value={editNote} onChange={(event) => setEditNote(event.target.value)} rows={5} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEditEntry(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">ยกเลิก</button>
              <button type="button" onClick={() => void saveEdit()} className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white">บันทึก</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ScheduleMockup;
