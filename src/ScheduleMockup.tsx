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
  isHidden: boolean;
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
  "08:30-17:30",
  "09:00-18:00",
  "10:00-19:00",
  "11:00-20:00",
  "11:30-20:30",
  "12:00-21:00",
  "OFF", "AL", "SL", "PL", "BL", "LW", "AB",
];

const AUTO_WFH_START_TIMES = new Set(["07:30", "11:00", "12:00"]);

const SHIFT_SUMMARY_ROWS = [
  { start: "07:30", end: "16:30" },
  { start: "08:00", end: "17:00" },
  { start: "08:30", end: "17:30" },
  { start: "09:00", end: "18:00" },
  { start: "10:00", end: "19:00" },
  { start: "11:00", end: "20:00" },
  { start: "11:30", end: "20:30" },
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

function formatScheduleMonthHeader(monthKey: string) {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return monthKey.toUpperCase();
  const year = Number(match[1]);
  const month = Number(match[2]);
  return `${MONTH_NAMES[month - 1].slice(0, 3).toUpperCase()} ${year}`;
}

function scheduleWeekday(monthKey: string, day: number) {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return "";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, day);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
}

function isScheduleWeekend(monthKey: string, day: number) {
  const weekday = scheduleWeekday(monthKey, day);
  return weekday === "Sat" || weekday === "Sun";
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

function legacyDecimalClockToClock(value: number) {
  if (!Number.isFinite(value) || value < 0 || value >= 24) return "";
  const hour = Math.floor(value);
  const minute = Math.round((value - hour) * 100);
  if (minute < 0 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeClockToken(value: string) {
  const match = String(value || "").trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function singleClockFromShiftValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 0 && value < 1) return excelTimeToClock(value);
    if (value >= 1 && value < 24) return legacyDecimalClockToClock(value);
  }
  const raw = String(value ?? "").trim();
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    if (numeric >= 0 && numeric < 1) return excelTimeToClock(numeric);
    if (numeric >= 1 && numeric < 24) return legacyDecimalClockToClock(numeric);
  }
  return normalizeClockToken(raw);
}

function parseShiftValue(value: unknown) {
  const raw = String(value ?? "").trim();
  const upper = raw.toUpperCase();
  if (!raw && !(typeof value === "number" && Number.isFinite(value))) {
    return { shiftCode: "", shiftStart: "", shiftEnd: "", status: "" };
  }
  if (STATUS_CODES.has(upper)) return { shiftCode: upper, shiftStart: "", shiftEnd: "", status: upper };

  const range = raw.match(/^(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}[:.]\d{2})$/);
  if (range) {
    const start = normalizeClockToken(range[1]);
    const end = normalizeClockToken(range[2]);
    if (start && end) return { shiftCode: `${start}-${end}`, shiftStart: start, shiftEnd: end, status: "" };
  }

  const start = singleClockFromShiftValue(value);
  if (start) {
    const end = addMinutes(start, 9 * 60);
    return { shiftCode: `${start}-${end}`, shiftStart: start, shiftEnd: end, status: "" };
  }

  return { shiftCode: raw, shiftStart: "", shiftEnd: "", status: upper };
}
function parseEditedShift(value: string) {
  return parseShiftValue(value);
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

function normalizeClockNotationText(value: string) {
  return String(value || "").replace(/\b(\d{1,2})\.(\d{2})\b/g, "$1:$2");
}

function extractOtRanges(value: string) {
  const raw = normalizeClockNotationText(value);
  return [...raw.matchAll(/\b(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})\b/g)]
    .map((match) => ({
      start: normalizeClockToken(match[1]),
      end: normalizeClockToken(match[2]),
    }))
    .filter((range) => range.start && range.end);
}

function adjustBaseShiftForShortAfterOt(
  shift: { shiftCode: string; shiftStart: string; shiftEnd: string; status: string },
  otText: string
) {
  if (shift.status || !shift.shiftStart || !shift.shiftEnd) return shift;
  const shiftStartMinutes = parseClockMinutes(shift.shiftStart);
  if (shiftStartMinutes === null) return shift;

  for (const range of extractOtRanges(otText)) {
    if (range.start !== shift.shiftStart) continue;
    const startMinutes = parseClockMinutes(range.start);
    const endMinutes = parseClockMinutes(range.end);
    if (startMinutes === null || endMinutes === null) continue;
    const duration = (endMinutes - startMinutes + 1440) % 1440;

    if (duration > 0 && duration <= 4 * 60) {
      const baseStart = formatClockMinutes(shiftStartMinutes - 9 * 60);
      return {
        shiftCode: `${baseStart}-${shift.shiftStart}`,
        shiftStart: baseStart,
        shiftEnd: shift.shiftStart,
        status: "",
      };
    }
  }

  return shift;
}

function parseShiftValueWithNote(value: unknown, note: string) {
  const parsed = parseShiftValue(value);
  if (parsed.status) return parsed;
  return adjustBaseShiftForShortAfterOt(parsed, extractOtText(note));
}

function noteLines(value: string) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function mergeNoteText(excelNote: string, manualNote: string) {
  return [...new Set([...noteLines(excelNote), ...noteLines(manualNote)])].join("\n");
}

function manualNoteDelta(fullNote: string, excelNote: string) {
  const excelLines = new Set(noteLines(excelNote));
  return noteLines(fullNote).filter((line) => !excelLines.has(line)).join("\n");
}

function combineScheduleCandidates(candidates: ParsedCandidate[]): { month: ShiftScheduleMonth; employeeCount: number; sheetCount: number; hiddenCount: number; skippedDraftCount: number } | null {
  if (!candidates.length) return null;

  const nonDraft = candidates.filter((candidate) => !candidate.isDraft);
  const activeCandidates = nonDraft.length ? nonDraft : candidates;
  const entries: ShiftScheduleEntry[] = [];
  const seenEntryKeys = new Set<string>();

  activeCandidates.forEach((candidate) => {
    candidate.month.entries.forEach((entry) => {
      const employeeKey = entry.employeeId
        ? entry.employeeId.trim().toLowerCase()
        : normalizeScheduleName(entry.agentName);
      const key = `${employeeKey}|${entry.date}`;
      if (seenEntryKeys.has(key)) return;
      seenEntryKeys.add(key);
      entries.push(entry);
    });
  });

  const first = activeCandidates[0];
  const employeeCount = new Set(
    entries.map((entry) => entry.employeeId?.trim().toLowerCase() || normalizeScheduleName(entry.agentName))
  ).size;

  return {
    month: {
      ...first.month,
      sheetName: activeCandidates.map((candidate) => candidate.month.sheetName).join(" + "),
      entries,
    },
    employeeCount,
    sheetCount: activeCandidates.length,
    hiddenCount: activeCandidates.filter((candidate) => candidate.isHidden).length,
    skippedDraftCount: candidates.length - activeCandidates.length,
  };
}

function mergeImportedScheduleMonth(
  imported: ShiftScheduleMonth,
  existing: ShiftScheduleMonth | null
): ShiftScheduleMonth {
  if (!existing) return imported;

  const byEmployeeDate = new Map<string, ShiftScheduleEntry>();
  const byNameDate = new Map<string, ShiftScheduleEntry>();
  existing.entries.forEach((entry) => {
    if (entry.employeeId) byEmployeeDate.set(`${entry.employeeId.toLowerCase()}|${entry.date}`, entry);
    byNameDate.set(`${normalizeScheduleName(entry.agentName)}|${entry.date}`, entry);
  });

  const entries = imported.entries.map((incoming) => {
    const current =
      (incoming.employeeId
        ? byEmployeeDate.get(`${incoming.employeeId.toLowerCase()}|${incoming.date}`)
        : undefined) ||
      byNameDate.get(`${normalizeScheduleName(incoming.agentName)}|${incoming.date}`);

    if (!current) return incoming;

    const manualShift = Boolean(current.manualShift);
    const explicitWorkModeOverride = current.workModeOverride || "";
    const inferredManualWfh =
      explicitWorkModeOverride === "WFH" ||
      Boolean(current.manualWorkMode) ||
      (
        !explicitWorkModeOverride &&
        current.workMode === "WFH" &&
        !AUTO_WFH_START_TIMES.has(current.shiftStart) &&
        !isPinkishHex(current.sourceFill || "")
      );

    const currentExcelOt = current.excelOtText ?? extractOtText(current.excelNote ?? current.note ?? "");
    const inferredManualOt =
      current.manualOtEdited === true ||
      (
        current.manualOtEdited === undefined &&
        Boolean(current.otText) &&
        current.otText.trim() !== currentExcelOt.trim()
      );
    const manualOtText =
      current.manualOtText !== undefined
        ? current.manualOtText
        : inferredManualOt
          ? current.otText
          : "";

    const incomingExcelNote = incoming.excelNote ?? incoming.note ?? "";
    const manualNoteText =
      current.manualNoteText !== undefined
        ? current.manualNoteText
        : current.excelNote !== undefined
          ? ""
          : manualNoteDelta(current.note || "", incomingExcelNote);

    const effectiveShift = manualShift ? current : incoming;
    const effectiveWorkMode =
      explicitWorkModeOverride === "Workspace"
        ? ""
        : inferredManualWfh
          ? "WFH"
          : manualShift && AUTO_WFH_START_TIMES.has(effectiveShift.shiftStart)
            ? "WFH"
            : incoming.workMode || "";

    return {
      ...incoming,
      shiftCode: effectiveShift.shiftCode,
      shiftStart: effectiveShift.shiftStart,
      shiftEnd: effectiveShift.shiftEnd,
      status: effectiveShift.status,
      workMode: effectiveWorkMode,
      otText: inferredManualOt ? manualOtText : (incoming.excelOtText ?? incoming.otText ?? ""),
      note: mergeNoteText(incomingExcelNote, manualNoteText),
      manualShift,
      manualWorkMode: explicitWorkModeOverride === "WFH" || inferredManualWfh,
      workModeOverride: explicitWorkModeOverride,
      manualOtEdited: inferredManualOt,
      manualOtText,
      manualNoteText,
      sourceFill: manualShift ? current.sourceFill : incoming.sourceFill,
      sourceFontColor: manualShift ? current.sourceFontColor : incoming.sourceFontColor,
    };
  });

  return { ...imported, entries };
}

function sectionName(value: unknown) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const cleaned = text
    .replace(/^Full Name/i, "")
    .replace(/^Name\s+/i, "")
    .replace(/^Name$/i, "")
    .replace(/\bSernior\b/gi, "Senior")
    .replace(/\bVitual\b/gi, "Virtual")
    .replace(/Non[_ ]+Voice/gi, "Non Voice")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "Team";
}

function isScheduleTemplatePerson(agentName: unknown, nickname: unknown) {
  const name = String(agentName || "").replace(/\s+/g, " ").trim();
  const nick = String(nickname || "").replace(/\s+/g, " ").trim();
  return /^Nickname$/i.test(nick) || /^Name\s+Chat[- ]?Non\s*Voice$/i.test(name);
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

  let currentSection = "Team";
  let dayColumns = new Map<number, number>();
  let employeeIdCol = -1;
  let agentNameCol = 0;
  let nicknameCol = 1;

  const buildDayColumns = (dateRow: any[]) => {
    const result = new Map<number, number>();
    let started = false;
    let expected = 1;
    for (let col = 0; col < dateRow.length; col += 1) {
      const day = Number(dateRow[col]);
      if (!started) {
        if (day === 1) {
          started = true;
          result.set(col, 1);
          expected = 2;
        }
        continue;
      }
      if (day === expected && day <= daysInMonth) {
        result.set(col, day);
        expected += 1;
        if (day === daysInMonth) break;
      }
    }
    return result;
  };

  rows.forEach((row, rowIndex) => {
    const headerCol = row.findIndex((value) => {
      const text = String(value || "").replace(/\s+/g, " ").trim();
      return /Full\s*Name/i.test(text) || /^Name$/i.test(text);
    });

    if (headerCol >= 0) {
      currentSection = sectionName(row[headerCol]);

      let bestDayColumns = new Map<number, number>();
      for (let offset = 1; offset <= 4; offset += 1) {
        const candidate = buildDayColumns(rows[rowIndex + offset] || []);
        if (candidate.size > bestDayColumns.size) bestDayColumns = candidate;
      }
      dayColumns = bestDayColumns;
      if (!dayColumns.size) return;

      const firstDayCol = Math.min(...dayColumns.keys());
      employeeIdCol = -1;
      agentNameCol = headerCol;
      nicknameCol = headerCol + 1;

      for (let lookahead = rowIndex + 1; lookahead < Math.min(rows.length, rowIndex + 18); lookahead += 1) {
        const sample = rows[lookahead] || [];
        for (let col = 0; col < firstDayCol; col += 1) {
          if (/^RBH\d+/i.test(String(sample[col] || "").trim())) {
            employeeIdCol = col;
            agentNameCol = col + 1;
            nicknameCol = col + 2;
            break;
          }
        }
        if (employeeIdCol >= 0) break;
      }

      const nicknameHeaderCol = row.findIndex((value) => /Nickname/i.test(String(value || "")));
      if (employeeIdCol < 0 && nicknameHeaderCol >= 0) nicknameCol = nicknameHeaderCol;
      return;
    }

    if (!dayColumns.size) return;

    const employeeId = employeeIdCol >= 0 ? String(row?.[employeeIdCol] || "").trim() : "";
    const agentName = String(row?.[agentNameCol] || "").replace(/\s+/g, " ").trim();
    const nickname = String(row?.[nicknameCol] || "").replace(/\s+/g, " ").trim();

    const hasScheduleValue = [...dayColumns.keys()].some((col) => String(row?.[col] ?? "").trim() !== "");
    if (!employeeId && agentName && !nickname && !hasScheduleValue && !/Headcount|\d{1,2}:\d{2}/i.test(agentName)) {
      currentSection = agentName;
      return;
    }

    if (!agentName || !nickname) return;
    if (isScheduleTemplatePerson(agentName, nickname)) return;
    if (employeeId && !/^RBH\d+/i.test(employeeId)) return;
    if (/Headcount|^\d{1,2}:\d{2}/i.test(agentName)) return;

    dayColumns.forEach((day, col) => {
      const date = `${monthKey}-${String(day).padStart(2, "0")}`;
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: col });
      const note = extractNote(ws, address);
      const parsed = parseShiftValueWithNote(row?.[col], note);
      const excelOtText = extractOtText(note);
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
        otText: excelOtText,
        note,
        sourceFill: appearance.fill,
        sourceFontColor: appearance.fontColor,
        workMode,
        excelShiftCode: parsed.shiftCode,
        excelShiftStart: parsed.shiftStart,
        excelShiftEnd: parsed.shiftEnd,
        excelStatus: parsed.status,
        excelOtText,
        excelNote: note,
        manualShift: false,
        manualWorkMode: false,
        workModeOverride: "",
        manualOtEdited: false,
        manualOtText: "",
        manualNoteText: "",
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
    isHidden: false,
    employeeCount,
  };
}

function canManageSchedule(role: unknown) {
  const value = String(role || "").toLowerCase();
  return /quality assurance|\bqa\b|supervisor|senior|team lead|department head/.test(value);
}

function entryBaseShift(entry: ShiftScheduleEntry | null) {
  if (!entry) return null;

  if (entry.shiftStart && entry.shiftEnd) {
    const start = normalizeClockToken(entry.shiftStart);
    const end = normalizeClockToken(entry.shiftEnd);
    if (start && end) {
      return adjustBaseShiftForShortAfterOt(
        { shiftCode: `${start}-${end}`, shiftStart: start, shiftEnd: end, status: "" },
        entry.otText || extractOtText(entry.note || "")
      );
    }
  }

  const fallback = parseShiftValue(entry.status || entry.shiftCode || "");
  return !fallback.status && fallback.shiftStart && fallback.shiftEnd
    ? adjustBaseShiftForShortAfterOt(fallback, entry.otText || extractOtText(entry.note || ""))
    : null;
}

function entryExcelBaseShift(entry: ShiftScheduleEntry) {
  if (entry.excelShiftStart && entry.excelShiftEnd) {
    const start = normalizeClockToken(entry.excelShiftStart);
    const end = normalizeClockToken(entry.excelShiftEnd);
    if (start && end) {
      return adjustBaseShiftForShortAfterOt(
        { shiftCode: `${start}-${end}`, shiftStart: start, shiftEnd: end, status: "" },
        entry.excelOtText || extractOtText(entry.excelNote || "")
      );
    }
  }

  const fallback = parseShiftValue(entry.excelStatus || entry.excelShiftCode || "");
  return !fallback.status && fallback.shiftStart && fallback.shiftEnd
    ? adjustBaseShiftForShortAfterOt(fallback, entry.excelOtText || extractOtText(entry.excelNote || ""))
    : null;
}

function entryLabel(entry: ShiftScheduleEntry | null) {
  if (!entry) return "ไม่มีข้อมูล";
  const base = entryBaseShift(entry);
  if (base) return `${base.shiftStart}–${base.shiftEnd}`;
  if (entry.status) return entry.status;
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
  const raw = normalizeClockNotationText(value);
  const ranges = extractOtRanges(raw);
  if (ranges.length) return ranges.flatMap((range) => [range.start, range.end]);

  const withoutDuration = raw.replace(/\(\s*\d{1,2}:\d{2}\s*\)/g, " ");
  return [...withoutDuration.matchAll(/\b(\d{1,2}:\d{2})\b/g)]
    .map((match) => normalizeClockToken(match[1]))
    .filter(Boolean);
}

function scheduleCellLabel(entry: ShiftScheduleEntry | null) {
  if (!entry) return "—";
  const base = entryBaseShift(entry);
  if (!base) return entry.status || entry.shiftCode || "—";

  const baseStart = parseClockMinutes(base.shiftStart);
  const baseEnd = parseClockMinutes(base.shiftEnd);
  if (baseStart === null || baseEnd === null) return `${base.shiftStart}-${base.shiftEnd}`;

  const otTimes = extractOtClockTimes(entry.otText)
    .map(parseClockMinutes)
    .filter((value): value is number => value !== null);

  const validOtStartTimes = otTimes.filter((value) => value <= baseStart);
  const validOtEndTimes = otTimes.filter((value) => value >= baseEnd);
  const start = validOtStartTimes.length ? Math.min(baseStart, ...validOtStartTimes) : baseStart;
  const end = validOtEndTimes.length ? Math.max(baseEnd, ...validOtEndTimes) : baseEnd;
  return `${formatClockMinutes(start)}-${formatClockMinutes(end)}`;
}

function isScheduleChangedEntry(entry: ShiftScheduleEntry | null) {
  if (!entry?.note) return false;
  const note = entry.note.toLowerCase();
  return /(แลก|เปลี่ยน(?:กะ|เวลา|ตาราง|เป็น)?|สลับ|เดิม|swap|switch|change(?:d)?\s*(?:shift|schedule|time)?)/i.test(note);
}

function isWfhEntry(entry: ShiftScheduleEntry | null) {
  if (!entry) return false;
  const base = entryBaseShift(entry);
  if (!base) return false;
  if (entry.workModeOverride === "Workspace") return false;
  if (entry.workModeOverride === "WFH") return true;
  return Boolean(
    entry.workMode === "WFH" ||
    AUTO_WFH_START_TIMES.has(base.shiftStart) ||
    (!entry.workMode && isPinkishHex(entry.sourceFill || ""))
  );
}

function isWorkingEntry(entry: ShiftScheduleEntry | null) {
  return Boolean(entryBaseShift(entry));
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
  if (isWorkingEntry(entry)) return "border-slate-200 bg-white text-slate-800";
  if (entry.status === "OFF") return "border-emerald-300 bg-emerald-100 text-emerald-700";
  if (["BL", "AL", "SL", "PL", "LW"].includes(entry.status)) return "border-yellow-400 bg-yellow-300 text-red-600";
  if (entry.status === "AB") return "border-red-600 bg-red-500 text-white";
  if (entry.status) return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-white text-slate-800";
}

function entryStyle(entry: ShiftScheduleEntry | null): React.CSSProperties | undefined {
  if (!entry || !isWorkingEntry(entry) || isWfhEntry(entry) || isScheduleChangedEntry(entry) || !entry.sourceFill) return undefined;
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
  const countStatus = (status: string) => mine.filter((entry) => !isWorkingEntry(entry) && entry.status === status).length;
  const twd = mine.filter((entry) => isWorkingEntry(entry)).length;
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
    ? isWorkingEntry(entry)
      ? `วันนี้ · ${scheduleCellLabel(entry)} · ${workModeLabel(entry)}`
      : `วันนี้ · ${entry.status || entry.shiftCode || "—"}`
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
  const [candidateMonthKey, setCandidateMonthKey] = useState("ALL");
  const [selectedCandidateKeys, setSelectedCandidateKeys] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [editEntry, setEditEntry] = useState<ShiftScheduleEntry | null>(null);
  const [editShift, setEditShift] = useState("");
  const [editOt, setEditOt] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editWfh, setEditWfh] = useState(false);
  const [editWfhTouched, setEditWfhTouched] = useState(false);
  const canManage = canManageSchedule(currentUser.role);

  const candidateMonthKeys = useMemo(
    () => [...new Set(candidates.map((candidate) => candidate.month.monthKey))].sort((a, b) => b.localeCompare(a)),
    [candidates]
  );

  const filteredCandidates = useMemo(
    () => candidateMonthKey === "ALL"
      ? candidates
      : candidates.filter((candidate) => candidate.month.monthKey === candidateMonthKey),
    [candidates, candidateMonthKey]
  );

  const candidateKey = (candidate: ParsedCandidate) => `${candidate.month.monthKey}||${candidate.month.sheetName}`;

  const selectedCandidates = useMemo(
    () => candidates.filter((candidate) => selectedCandidateKeys.includes(candidateKey(candidate))),
    [candidates, selectedCandidateKeys]
  );

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
      if (isScheduleTemplatePerson(entry.agentName, entry.nickname)) return;
      const key = normalizeScheduleName(entry.agentName);
      if (!map.has(key)) {
        map.set(key, {
          employeeId: entry.employeeId,
          agentName: entry.agentName,
          nickname: entry.nickname,
          section: sectionName(entry.section),
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
      if (isScheduleTemplatePerson(entry.agentName, entry.nickname)) return;
      if (!isWorkingEntry(entry)) return;
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

  const employeeSummaryWidth = EMPLOYEE_SUMMARY_COLUMNS.length * 44;
  const scheduleTableMinWidth = 230 + daysInMonth * 92 + employeeSummaryWidth;

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
      const sheetVisibility = new Map<string, number>(
        (workbook.Workbook?.Sheets || []).map((sheet: any) => [String(sheet?.name || ""), Number(sheet?.Hidden || 0)])
      );
      const next = workbook.SheetNames
        .map((name) => {
          const candidate = parseSheetCandidate(workbook, name, file.name);
          if (!candidate) return null;
          return { ...candidate, isHidden: (sheetVisibility.get(name) || 0) > 0 };
        })
        .filter(Boolean) as ParsedCandidate[];
      next.sort((a, b) => {
        const currentDiff = Number(b.month.monthKey === today.monthKey) - Number(a.month.monthKey === today.monthKey);
        if (currentDiff) return currentDiff;
        const draftDiff = Number(a.isDraft) - Number(b.isDraft);
        if (draftDiff) return draftDiff;
        return b.month.monthKey.localeCompare(a.month.monthKey);
      });
      setCandidates(next);
      setCandidateMonthKey("ALL");
      setSelectedCandidateKeys([]);
      const hiddenCount = next.filter((candidate) => candidate.isHidden).length;
      setMessage(
        next.length
          ? `พบ ${next.length} ตารางรายเดือน${hiddenCount ? ` · มีชีตซ่อน ${hiddenCount} ชีต` : ""} เลือกเดือนที่ต้องการนำเข้า`
          : "ไม่พบชีตรายเดือนที่อ่านได้"
      );
    } catch (error) {
      console.error("Parse shift schedule failed", error);
      setCandidates([]);
      setMessage("อ่านไฟล์ไม่สำเร็จ กรุณาใช้ไฟล์ Excel ตารางกะรูปแบบเดิม");
    }
  };

  const toggleCandidateSelection = (candidate: ParsedCandidate, checked: boolean) => {
    const key = candidateKey(candidate);
    setSelectedCandidateKeys((current) => {
      if (!checked) return current.filter((item) => item !== key);
      const sameMonthKeys = candidates
        .filter((item) => item.month.monthKey === candidate.month.monthKey)
        .map(candidateKey);
      return [...current.filter((item) => !sameMonthKeys.includes(item)), key];
    });
  };

  const selectAllVisibleSheets = () => {
    const preferredByMonth = new Map<string, ParsedCandidate>();
    filteredCandidates.forEach((candidate) => {
      const current = preferredByMonth.get(candidate.month.monthKey);
      if (!current || (current.isDraft && !candidate.isDraft)) preferredByMonth.set(candidate.month.monthKey, candidate);
    });
    setSelectedCandidateKeys((current) => {
      const visibleMonthKeys = new Set(filteredCandidates.map((candidate) => candidate.month.monthKey));
      const kept = current.filter((key) => {
        const candidate = candidates.find((item) => candidateKey(item) === key);
        return candidate ? !visibleMonthKeys.has(candidate.month.monthKey) : false;
      });
      return [...kept, ...[...preferredByMonth.values()].map(candidateKey)];
    });
  };

  const clearVisibleSheetSelection = () => {
    const visibleKeys = new Set(filteredCandidates.map(candidateKey));
    setSelectedCandidateKeys((current) => current.filter((key) => !visibleKeys.has(key)));
  };

  const importSelected = async () => {
    if (!selectedCandidates.length) return;
    setImporting(true);
    setMessage("");
    try {
      const existingByMonth = new Map(months.map((item) => [item.monthKey, item]));
      if (month) existingByMonth.set(month.monthKey, month);
      const importedMonthKeys: string[] = [];

      for (const candidate of selectedCandidates) {
        const targetMonth = candidate.month;
        const existingMonth = existingByMonth.get(targetMonth.monthKey) || null;
        const mergedMonth = mergeImportedScheduleMonth(targetMonth, existingMonth);
        const savedMonth: ShiftScheduleMonth = {
          ...mergedMonth,
          updatedBy: currentUser.displayName || currentUser.username,
          updatedAtIso: new Date().toISOString(),
        };
        await saveScheduleMonth(savedMonth);
        existingByMonth.set(targetMonth.monthKey, savedMonth);
        importedMonthKeys.push(targetMonth.monthKey);
        window.dispatchEvent(new CustomEvent("qa-schedule-updated", { detail: { monthKey: targetMonth.monthKey } }));
      }

      const firstImported = selectedCandidates[0];
      setSelectedMonthKey(firstImported.month.monthKey);
      setMessage(`นำเข้าแล้ว ${selectedCandidates.length} Sheet · ${new Set(importedMonthKeys).size} เดือน`);
      setCandidates([]);
      setCandidateMonthKey("ALL");
      setSelectedCandidateKeys([]);
      await refreshMonths();
    } catch (error) {
      console.error("Save schedule months failed", error);
      setMessage("บันทึกตารางกะไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setImporting(false);
    }
  };
  const openEdit = (entry: ShiftScheduleEntry) => {
    if (!canManage) return;
    setEditEntry(entry);
    const base = entryBaseShift(entry);
    setEditShift(base?.shiftCode || entry.shiftCode || entry.status || "");
    setEditOt(entry.otText || "");
    setEditNote(entry.note || "");
    setEditWfh(isWfhEntry(entry));
    setEditWfhTouched(false);
  };

  const saveEdit = async () => {
    if (!month || !editEntry) return;
    const parsed = parseEditedShift(editShift);
    const excelBase = entryExcelBaseShift(editEntry);
    const baselineShiftCode = excelBase?.shiftCode || editEntry.excelShiftCode || editEntry.shiftCode;
    const baselineShiftStart = excelBase?.shiftStart || editEntry.excelShiftStart || editEntry.shiftStart;
    const baselineShiftEnd = excelBase?.shiftEnd || editEntry.excelShiftEnd || editEntry.shiftEnd;
    const baselineStatus = excelBase ? "" : (editEntry.excelStatus ?? editEntry.status);
    const manualShift =
      parsed.shiftCode !== baselineShiftCode ||
      parsed.shiftStart !== baselineShiftStart ||
      parsed.shiftEnd !== baselineShiftEnd ||
      parsed.status !== baselineStatus;

    const excelOtText = editEntry.excelOtText ?? extractOtText(editEntry.excelNote ?? editEntry.note ?? "");
    const manualOtEdited = editOt.trim() !== excelOtText.trim();
    const manualOtText = manualOtEdited ? editOt.trim() : "";
    const excelNote = editEntry.excelNote ?? editEntry.note ?? "";
    const manualNoteText = manualNoteDelta(editNote.trim(), excelNote);
    const previousWorkModeOverride = editEntry.workModeOverride || "";
    const nextWorkModeOverride =
      parsed.status
        ? ""
        : editWfhTouched
          ? (editWfh ? "WFH" : "Workspace")
          : previousWorkModeOverride;
    const manualWorkMode = nextWorkModeOverride === "WFH";
    const nextWorkMode =
      !parsed.status &&
      (
        nextWorkModeOverride === "WFH" ||
        (
          nextWorkModeOverride !== "Workspace" &&
          (AUTO_WFH_START_TIMES.has(parsed.shiftStart) || isPinkishHex(editEntry.sourceFill || ""))
        )
      )
        ? "WFH"
        : "";

    const nextEntry: ShiftScheduleEntry = {
      ...editEntry,
      ...parsed,
      otText: manualOtEdited ? manualOtText : excelOtText,
      note: mergeNoteText(excelNote, manualNoteText),
      workMode: nextWorkMode,
      excelShiftCode: editEntry.excelShiftCode ?? editEntry.shiftCode,
      excelShiftStart: editEntry.excelShiftStart ?? editEntry.shiftStart,
      excelShiftEnd: editEntry.excelShiftEnd ?? editEntry.shiftEnd,
      excelStatus: editEntry.excelStatus ?? editEntry.status,
      excelOtText,
      excelNote,
      manualShift,
      manualWorkMode,
      workModeOverride: nextWorkModeOverride,
      manualOtEdited,
      manualOtText,
      manualNoteText,
      sourceFill: manualShift ? "" : editEntry.sourceFill,
      sourceFontColor: manualShift ? "" : editEntry.sourceFontColor,
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
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <label className="block sm:w-[260px]">
                    <span className="text-xs font-semibold text-violet-800">แสดง Sheet ของเดือน</span>
                    <select
                      value={candidateMonthKey}
                      onChange={(event) => setCandidateMonthKey(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800"
                    >
                      <option value="ALL">ทุกเดือน</option>
                      {candidateMonthKeys.map((key) => (
                        <option key={key} value={key}>{formatMonthLabel(key)}</option>
                      ))}
                    </select>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={selectAllVisibleSheets}
                      className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50"
                    >
                      เลือกทั้งหมดที่แสดง
                    </button>
                    <button
                      type="button"
                      onClick={clearVisibleSheetSelection}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      ล้างที่เลือก
                    </button>
                  </div>
                </div>

                <div className="mt-3 max-h-[280px] space-y-2 overflow-y-auto pr-1">
                  {filteredCandidates.map((candidate) => {
                    const key = candidateKey(candidate);
                    const checked = selectedCandidateKeys.includes(key);
                    return (
                      <label
                        key={key}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                          checked ? "border-violet-400 bg-white shadow-sm" : "border-violet-100 bg-white/70 hover:bg-white"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => toggleCandidateSelection(candidate, event.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 accent-violet-700"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-slate-900">{candidate.month.sheetName}</span>
                            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">{formatMonthLabel(candidate.month.monthKey)}</span>
                            {candidate.isHidden ? <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">Hidden</span> : null}
                            {candidate.isDraft ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Draft</span> : null}
                          </div>
                          <div className="mt-0.5 text-[10px] text-slate-500">{candidate.employeeCount} คน</div>
                        </div>
                      </label>
                    );
                  })}
                </div>

                <div className="mt-3 flex flex-col gap-2 border-t border-violet-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-violet-800">
                    เลือกแล้ว <span className="font-black">{selectedCandidates.length}</span> Sheet
                    <span className="ml-2 text-[10px] text-violet-600">เลือกหลายเดือนได้พร้อมกัน · 1 Sheet ต่อเดือน</span>
                  </div>
                  <button
                    type="button"
                    disabled={importing || !selectedCandidates.length}
                    onClick={() => void importSelected()}
                    className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {importing ? "กำลังนำเข้า..." : `นำเข้า ${selectedCandidates.length} Sheet`}
                  </button>
                </div>
                <div className="mt-2 text-[10px] text-violet-700">ปุ่ม “เลือกทั้งหมดที่แสดง” จะเลือก Sheet หลักของแต่ละเดือนก่อน Draft อัตโนมัติ และ Hidden Sheet ยังเลือกเองได้</div>
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
                    <tr>
                      <th
                        rowSpan={3}
                        className="sticky left-0 z-40 min-w-[230px] border-r-2 border-slate-300 bg-slate-950 px-3 py-2 text-left align-middle text-white"
                      >
                        Agent
                      </th>
                      <th
                        colSpan={daysInMonth}
                        className="border-b border-r border-violet-950 bg-violet-800 px-2 py-1 text-center text-[10px] font-black uppercase tracking-[0.08em] text-white"
                      >
                        {formatScheduleMonthHeader(selectedMonthKey)}
                      </th>
                      <th
                        colSpan={EMPLOYEE_SUMMARY_COLUMNS.length}
                        className="border-b border-slate-700 bg-slate-950"
                      />
                    </tr>
                    <tr>
                      {Array.from({ length: daysInMonth }, (_, index) => {
                        const day = index + 1;
                        const weekend = isScheduleWeekend(selectedMonthKey, day);
                        return (
                          <th
                            key={`weekday-${day}`}
                            className={`min-w-[92px] border-b border-r px-2 py-1 text-center text-[10px] font-black ${
                              weekend
                                ? "border-red-700 bg-red-600 text-white"
                                : "border-slate-300 bg-white text-slate-950"
                            }`}
                          >
                            {scheduleWeekday(selectedMonthKey, day)}
                          </th>
                        );
                      })}
                      {EMPLOYEE_SUMMARY_COLUMNS.map((column) => (
                        <th
                          key={column}
                          rowSpan={2}
                          className={`min-w-[44px] border-b border-l px-2 py-1 text-center align-middle text-[10px] font-black ${
                            ["BL", "AL", "SL", "PL", "LW"].includes(column)
                              ? "border-yellow-400 bg-yellow-300 text-red-600"
                              : column === "AB"
                                ? "border-red-700 bg-red-500 text-white"
                                : "border-slate-500 bg-slate-300 text-slate-950"
                          }`}
                        >
                          {column}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {Array.from({ length: daysInMonth }, (_, index) => {
                        const day = index + 1;
                        const weekend = isScheduleWeekend(selectedMonthKey, day);
                        const isToday = selectedMonthKey === today.monthKey && day === today.day;
                        return (
                          <th
                            key={`date-${day}`}
                            className={`min-w-[92px] border-b border-r px-2 py-1 text-center text-[10px] font-black ${
                              weekend
                                ? "border-red-700 bg-red-600 text-white"
                                : isToday
                                  ? "border-violet-400 bg-violet-100 text-violet-900"
                                  : "border-slate-300 bg-white text-slate-950"
                            }`}
                          >
                            {day}
                          </th>
                        );
                      })}
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
                            className={`sticky left-0 z-40 min-w-[230px] overflow-hidden border-b border-r-2 border-slate-300 px-3 py-2 ${personIndex % 2 ? "bg-slate-50" : "bg-white"}`}
                            style={{ width: 230, minWidth: 230, maxWidth: 230 }}
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
                                className={`min-w-[44px] border-b border-l px-2 py-2 text-center font-black ${
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
                        <td className="sticky left-0 z-[8] min-w-[230px] border-b border-r-2 border-slate-300 bg-amber-50 px-3 py-2 font-bold text-slate-800">
                          {shift.start}–{shift.end}
                        </td>
                        {Array.from({ length: daysInMonth }, (_, index) => {
                          const day = index + 1;
                          const date = `${selectedMonthKey}-${String(day).padStart(2, "0")}`;
                          const count = (workingEntriesByDate.get(date) || []).filter((entry) => entryBaseShift(entry)?.shiftStart === shift.start).length;
                          return (
                            <td key={date} className="border-b border-r border-slate-200 bg-white px-2 py-2 text-center font-bold text-slate-700">
                              {count}
                            </td>
                          );
                        })}
                        {EMPLOYEE_SUMMARY_COLUMNS.map((column) => (
                          <td key={column} className="min-w-[44px] border-b border-l border-slate-200 bg-slate-50" />
                        ))}
                      </tr>
                    ))}
                    <tr className="bg-violet-700 text-white">
                      <td className="sticky left-0 z-[8] min-w-[230px] border-r-2 border-slate-300 bg-violet-700 px-3 py-2 font-black">
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
                        <td key={column} className="min-w-[44px] border-l border-violet-500 bg-violet-700" />
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {month ? (
            <>
              <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-3">
                <div className="text-[11px] font-bold text-slate-700">Note · Summary Abbreviations</div>
                <div className="mt-2 grid gap-x-5 gap-y-1.5 text-[10px] leading-5 text-slate-600 sm:grid-cols-2 xl:grid-cols-3">
                  <div><span className="font-black text-red-600">BL</span> — Birthday Leave <span className="text-slate-500">(วันลาหยุดในวันเกิด)</span></div>
                  <div><span className="font-black text-red-600">AL</span> — Annual Leave <span className="text-slate-500">(ลาพักร้อนประจำปี)</span></div>
                  <div><span className="font-black text-red-600">SL</span> — Sick Leave <span className="text-slate-500">(ลาป่วย)</span></div>
                  <div><span className="font-black text-red-600">PL</span> — Personal Leave <span className="text-slate-500">(ลากิจ)</span></div>
                  <div><span className="font-black text-red-600">LW</span> — Leave Without Pay <span className="text-slate-500">(ลาไม่รับค่าจ้าง)</span></div>
                  <div><span className="font-black text-red-600">AB</span> — Absent <span className="text-slate-500">(ขาดงาน)</span></div>
                  <div><span className="font-black text-slate-800">TDO</span> — Total Days Off <span className="text-slate-500">(จำนวนวันหยุดรวมทั้งหมด)</span></div>
                  <div><span className="font-black text-slate-800">TWD</span> — Total Working Days <span className="text-slate-500">(จำนวนวันทำงานจริงรวมทั้งหมด)</span></div>
                  <div><span className="font-black text-slate-800">TD</span> — Total Days <span className="text-slate-500">(จำนวนวันทั้งหมดของเดือน)</span></div>
                </div>
              </div>
              <div className="border-t border-slate-100 px-5 py-3 text-[11px] text-slate-500">
                Last update: {month.updatedAtIso ? new Date(month.updatedAtIso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "—"} · {month.updatedBy || "—"}
                {canManage ? " · คลิกช่องวันที่เพื่อแก้ไขกะ/OT" : ""}
              </div>
            </>
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
                    onChange={(event) => {
                      setEditWfh(event.target.checked);
                      setEditWfhTouched(true);
                    }}
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
