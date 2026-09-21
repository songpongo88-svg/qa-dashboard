import { collection, doc, getDocs, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";

export type ShiftScheduleEntry = {
  employeeId: string;
  agentName: string;
  nickname: string;
  section: string;
  date: string;
  shiftCode: string;
  shiftStart: string;
  shiftEnd: string;
  status: string;
  otText: string;
  note: string;
  sourceFill?: string;
  sourceFontColor?: string;
  workMode?: string;
  excelShiftCode?: string;
  excelShiftStart?: string;
  excelShiftEnd?: string;
  excelStatus?: string;
  excelOtText?: string;
  excelNote?: string;
  manualShift?: boolean;
  manualWorkMode?: boolean;
  manualOtEdited?: boolean;
  manualOtText?: string;
  manualNoteText?: string;
};

export type ShiftScheduleMonth = {
  monthKey: string;
  sourceFileName: string;
  sheetName: string;
  entries: ShiftScheduleEntry[];
  updatedBy: string;
  updatedAtIso: string;
};

const COLLECTION = "qa_shift_schedules";

export function normalizeScheduleName(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export async function fetchScheduleMonths() {
  const snapshot = await getDocs(collection(firebaseDb, COLLECTION));
  return snapshot.docs
    .map((item) => item.data() as ShiftScheduleMonth)
    .filter((item) => /^\d{4}-\d{2}$/.test(String(item.monthKey || "")))
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}

export function subscribeScheduleMonth(
  monthKey: string,
  onValue: (value: ShiftScheduleMonth | null) => void,
  onError?: (error: unknown) => void
) {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    onValue(null);
    return () => {};
  }
  return onSnapshot(
    doc(firebaseDb, COLLECTION, monthKey),
    (snapshot) => onValue(snapshot.exists() ? (snapshot.data() as ShiftScheduleMonth) : null),
    (error) => onError?.(error)
  );
}

export async function saveScheduleMonth(value: ShiftScheduleMonth) {
  const cleanEntries = value.entries.map((entry) => ({
    employeeId: String(entry.employeeId || ""),
    agentName: String(entry.agentName || ""),
    nickname: String(entry.nickname || ""),
    section: String(entry.section || ""),
    date: String(entry.date || ""),
    shiftCode: String(entry.shiftCode || ""),
    shiftStart: String(entry.shiftStart || ""),
    shiftEnd: String(entry.shiftEnd || ""),
    status: String(entry.status || ""),
    otText: String(entry.otText || ""),
    note: String(entry.note || ""),
    sourceFill: String(entry.sourceFill || ""),
    sourceFontColor: String(entry.sourceFontColor || ""),
    workMode: String(entry.workMode || ""),
    excelShiftCode: String(entry.excelShiftCode || ""),
    excelShiftStart: String(entry.excelShiftStart || ""),
    excelShiftEnd: String(entry.excelShiftEnd || ""),
    excelStatus: String(entry.excelStatus || ""),
    excelOtText: String(entry.excelOtText || ""),
    excelNote: String(entry.excelNote || ""),
    manualShift: Boolean(entry.manualShift),
    manualWorkMode: Boolean(entry.manualWorkMode),
    manualOtEdited: Boolean(entry.manualOtEdited),
    manualOtText: String(entry.manualOtText || ""),
    manualNoteText: String(entry.manualNoteText || ""),
  }));
  await setDoc(doc(firebaseDb, COLLECTION, value.monthKey), {
    ...value,
    entries: cleanEntries,
    updatedAtServer: serverTimestamp(),
  });
}

export function findScheduleEntryForUser(
  month: ShiftScheduleMonth | null,
  date: string,
  candidates: unknown[]
) {
  if (!month) return null;
  const names = new Set(candidates.map(normalizeScheduleName).filter(Boolean));
  return month.entries.find(
    (entry) => entry.date === date && names.has(normalizeScheduleName(entry.agentName))
  ) || null;
}
