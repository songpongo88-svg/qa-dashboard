import * as XLSX from "xlsx";
import type { ShiftScheduleEntry, ShiftScheduleMonth } from "./scheduleStore";

/**
 * Export the imported baseline from saved SCH rows, not the subsequently
 * edited live schedule. Old uploads stored parsed rows rather than the
 * original Excel binary, so this is a reconstruction, not an exact copy.
 * This helper never reads or writes Firestore.
 */
const cellText = (value: unknown): string => String(value ?? "").trim();
const identity = (entry: ShiftScheduleEntry): string =>
  cellText(entry.employeeId).toLocaleLowerCase() ||
  cellText(entry.agentName).toLocaleLowerCase().replace(/\s+/g, " ");

export function uploadedShiftValue(entry: ShiftScheduleEntry): string {
  // The excel* fields are retained when an administrator manually edits SCH.
  const originalStatus = cellText(entry.excelStatus);
  if (originalStatus) return originalStatus;
  const originalCode = cellText(entry.excelShiftCode);
  if (originalCode) return originalCode;
  const originalStart = cellText(entry.excelShiftStart);
  const originalEnd = cellText(entry.excelShiftEnd);
  if (originalStart && originalEnd) return `${originalStart}-${originalEnd}`;

  // Older rows might not have the imported baseline fields. Never quietly
  // claim a manually edited value is the uploaded original.
  if (entry.manualShift) return "ไม่พบค่ากะต้นฉบับ";
  return cellText(entry.status || entry.shiftCode) ||
    (entry.shiftStart && entry.shiftEnd ? `${entry.shiftStart}-${entry.shiftEnd}` : "");
}

export function uploadedOtAndNote(entry: ShiftScheduleEntry): { ot: string; note: string } {
  const ot = entry.excelOtText !== undefined
    ? cellText(entry.excelOtText)
    : entry.manualOtEdited
      ? "ไม่พบข้อมูล OT ต้นฉบับ"
      : cellText(entry.otText);
  const note = entry.excelNote !== undefined
    ? cellText(entry.excelNote)
    : entry.manualNoteText
      ? "ไม่พบหมายเหตุต้นฉบับ"
      : cellText(entry.note);
  return { ot, note };
}

function safeMonthKey(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new Error("Invalid SCH month");
  return value;
}

function sourceDateLabels(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const days = new Date(year, month, 0).getDate();
  return Array.from({ length: days }, (_, index) => `${String(index + 1).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`);
}

export type ScheduleDisplayFormat = {
  shift: (entry: ShiftScheduleEntry) => string;
  workMode: (entry: ShiftScheduleEntry) => string;
  ot: (entry: ShiftScheduleEntry) => string;
};

/** Keeps the existing Excel layout, but selects the values rendered by SCH. */
function createScheduleWorkbook(
  month: ShiftScheduleMonth,
  source: "uploaded" | "displayed",
  display?: ScheduleDisplayFormat,
): XLSX.WorkBook {
  const monthKey = safeMonthKey(cellText(month.monthKey));
  const current = source === "displayed";
  const shift = (entry: ShiftScheduleEntry) => current && display
    ? cellText(display.shift(entry))
    : uploadedShiftValue(entry);
  const scheduleCell = (entry: ShiftScheduleEntry) => {
    const value = shift(entry);
    const mode = current && display ? cellText(display.workMode(entry)) : "";
    return mode ? `${value} (${mode})` : value;
  };
  const noteDetails = (entry: ShiftScheduleEntry) => current
    ? { ot: cellText(display?.ot(entry) || entry.otText), note: cellText(entry.note) }
    : uploadedOtAndNote(entry);
  const dates = sourceDateLabels(monthKey);
  const names = new Map<string, { agent: ShiftScheduleEntry; dates: Map<string, ShiftScheduleEntry> }>();
  for (const entry of month.entries || []) {
    const key = identity(entry);
    if (!key || !cellText(entry.date).startsWith(monthKey + "-")) continue;
    let person = names.get(key);
    if (!person) {
      person = { agent: entry, dates: new Map() };
      names.set(key, person);
    }
    person.dates.set(cellText(entry.date), entry);
  }
  const people = [...names.values()].sort((a, b) =>
    cellText(a.agent.section).localeCompare(cellText(b.agent.section), "th") ||
    cellText(a.agent.agentName).localeCompare(cellText(b.agent.agentName), "th"));

  const grid: (string | number)[][] = [
    [current ? "SCH — ตารางกะล่าสุดหลังนำเข้าและแก้ไขในระบบ" : "SCH — ตารางกะจากข้อมูลที่เคยอัปโหลด", monthKey],
    ["Source file", cellText(month.sourceFileName) || "ไม่ทราบชื่อไฟล์"],
    ["Imported sheet", cellText(month.sheetName) || "ไม่ทราบชื่อ Sheet"],
    ["หมายเหตุ", current
      ? "ตาราง SCH ปัจจุบันหลังนำเข้าและปรับกะ/WFH/Workspace/OT/วันลาในระบบ ไม่ใช่ไฟล์ Excel ต้นฉบับ"
      : "สร้างใหม่จากข้อมูลที่ระบบบันทึกไว้ ไม่ใช่ไฟล์ Excel ต้นฉบับทั้งไฟล์ และไม่รวมการแก้ไขกะ/OT ภายหลัง"],
    [],
    ["Employee ID", "Full Name", "Nickname", "Section", ...dates],
  ];
  const otNotes: (string | number)[][] = [
    ["Employee ID", "Full Name", "Section", "Date",
      current ? "Current Shift / Mode" : "Uploaded Shift",
      current ? "Current OT" : "Uploaded OT", current ? "Current Note" : "Uploaded Note"],
  ];
  for (const person of people) {
    const agent = person.agent;
    grid.push([
      cellText(agent.employeeId), cellText(agent.agentName), cellText(agent.nickname),
      cellText(agent.section),
      ...dates.map((dateLabel) => {
        const [dd, mm, yyyy] = dateLabel.split("/");
        const entry = person.dates.get(`${yyyy}-${mm}-${dd}`);
        return entry ? scheduleCell(entry) : "";
      }),
    ]);
    for (const dateLabel of dates) {
      const [dd, mm, yyyy] = dateLabel.split("/");
      const date = `${yyyy}-${mm}-${dd}`;
      const entry = person.dates.get(date);
      if (!entry) continue;
      const { ot, note } = noteDetails(entry);
      if (!ot && !note) continue;
      otNotes.push([
        cellText(agent.employeeId), cellText(agent.agentName),
        cellText(agent.section), dateLabel, scheduleCell(entry), ot, note,
      ]);
    }
  }

  const workbook = XLSX.utils.book_new();
  const gridSheet = XLSX.utils.aoa_to_sheet(grid);
  gridSheet["!cols"] = [
    { wch: 17 }, { wch: 32 }, { wch: 17 }, { wch: 21 },
    ...dates.map(() => ({ wch: 17 })),
  ];
  gridSheet["!autofilter"] = { ref: `A6:${XLSX.utils.encode_col(3 + dates.length)}${Math.max(6, grid.length)}` };
  XLSX.utils.book_append_sheet(workbook, gridSheet, current ? "Current Schedule" : "Uploaded Schedule");

  const noteSheet = XLSX.utils.aoa_to_sheet(otNotes);
  noteSheet["!cols"] = [
    { wch: 17 }, { wch: 32 }, { wch: 23 }, { wch: 15 },
    { wch: 19 }, { wch: 21 }, { wch: 76 },
  ];
  XLSX.utils.book_append_sheet(workbook, noteSheet, current ? "Current OT Notes" : "Uploaded OT Notes");

  const info = XLSX.utils.aoa_to_sheet([
    ["SCH Export Information", ""],
    ["Month", monthKey],
    ["Imported file name", cellText(month.sourceFileName)],
    ["Imported sheet name(s)", cellText(month.sheetName)],
    ["Staff", people.length],
    ["Data source", "ข้อมูล SCH ที่บันทึกไว้ในระบบ"],
    ["Version", current
      ? "Latest SCH view: processed schedule plus saved Dashboard edits"
      : "Uploaded baseline (excel* fields; excludes Dashboard edits)"],
    ["Original-file limitation", "ระบบเดิมไม่ได้เก็บไฟล์ต้นฉบับ จึงไม่สามารถกู้คืนสูตร การจัดหน้า Sheet อื่น หรือรูปแบบเซลล์ทั้งหมดได้"],
    [current ? "Work mode" : "Missing baseline", current
      ? "แสดง WFH/Workspace ตามการประมวลผลใน SCH รวมถึงการเปลี่ยนแปลงล่าสุด"
      : "ค่าที่แก้ไขแล้วแต่ไม่มี excel* เก็บไว้จะระบุว่าไม่พบค่าต้นฉบับ แทนการเดา"],
  ]);
  info["!cols"] = [{ wch: 26 }, { wch: 95 }];
  XLSX.utils.book_append_sheet(workbook, info, "Export Info");
  return workbook;
}

export function createUploadedScheduleWorkbook(month: ShiftScheduleMonth): XLSX.WorkBook {
  return createScheduleWorkbook(month, "uploaded");
}

export function createDisplayedScheduleWorkbook(
  month: ShiftScheduleMonth, display: ScheduleDisplayFormat,
): XLSX.WorkBook {
  return createScheduleWorkbook(month, "displayed", display);
}

export function displayedScheduleExportFileName(month: ShiftScheduleMonth) {
  return `SCH_Current_${safeMonthKey(cellText(month.monthKey))}.xlsx`;
}

export function uploadedScheduleExportFileName(month: ShiftScheduleMonth) {
  const key = safeMonthKey(cellText(month.monthKey));
  return `SCH_Uploaded_${key}.xlsx`;
}
