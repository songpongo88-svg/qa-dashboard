import { collection, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";
import { canonicalizeAgentName } from "./lib/agentIdentity";

const COACHING_SCHEDULE_COLLECTION = "qa_coaching_schedule";
const COACHING_SCHEDULE_CACHE_KEY = "qa-dashboard:coaching-schedule-cache:v1";

export type CoachingScheduleStatus = "Scheduled" | "Coached";

export type StoredCoachingSchedule = {
  id: string;
  agent: string;
  monthKey: string;
  monthLabel: string;
  date: string;
  time: string;
  note: string;
  status: CoachingScheduleStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

function safeDocId(value: unknown) {
  return (
    String(value || "")
      .trim()
      .replace(/[\\/#?\[\]]/g, "_")
      .replace(/\s+/g, "-")
      .slice(0, 180) || `coaching-schedule-${Date.now()}`
  );
}

function toSchedule(row: any, fallbackId = ""): StoredCoachingSchedule {
  return {
    id: String(row?.id || fallbackId || ""),
    agent: canonicalizeAgentName(row?.agent),
    monthKey: String(row?.monthKey || row?.month_key || ""),
    monthLabel: String(row?.monthLabel || row?.month_label || ""),
    date: String(row?.date || ""),
    time: String(row?.time || ""),
    note: String(row?.note || ""),
    status: row?.status === "Coached" ? "Coached" : "Scheduled",
    createdBy: canonicalizeAgentName(row?.createdBy || row?.created_by),
    createdAt: String(row?.createdAt || row?.created_at || ""),
    updatedAt: String(row?.updatedAt || row?.updated_at || ""),
  };
}

function sortSchedules(rows: StoredCoachingSchedule[]) {
  return [...rows].sort((a, b) => {
    const left = `${a.date || "9999-99-99"}T${a.time || "99:99"}`;
    const right = `${b.date || "9999-99-99"}T${b.time || "99:99"}`;
    return left.localeCompare(right);
  });
}

function readCache(): StoredCoachingSchedule[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(COACHING_SCHEDULE_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? sortSchedules(parsed.map((item) => toSchedule(item)).filter((item) => item.id))
      : [];
  } catch {
    return [];
  }
}

function writeCache(rows: StoredCoachingSchedule[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      COACHING_SCHEDULE_CACHE_KEY,
      JSON.stringify(sortSchedules(rows).slice(0, 500))
    );
  } catch {
    // Firestore remains the source of truth.
  }
}

export async function fetchStoredCoachingSchedules() {
  try {
    const snapshot = await getDocs(collection(firebaseDb, COACHING_SCHEDULE_COLLECTION));
    const rows = snapshot.docs
      .map((item) => toSchedule(item.data(), item.id))
      .filter((item) => item.id && item.agent && item.monthKey);
    writeCache(rows);
    return sortSchedules(rows);
  } catch (error) {
    const cached = readCache();
    if (cached.length) return cached;
    throw error;
  }
}

export async function upsertStoredCoachingSchedule(
  schedule: StoredCoachingSchedule
) {
  const now = new Date().toISOString();
  const normalized: StoredCoachingSchedule = {
    ...schedule,
    id: safeDocId(schedule.id),
    agent: canonicalizeAgentName(schedule.agent),
    createdBy: canonicalizeAgentName(schedule.createdBy),
    status: schedule.status === "Coached" ? "Coached" : "Scheduled",
    createdAt: schedule.createdAt || now,
    updatedAt: now,
  };

  await setDoc(
    doc(firebaseDb, COACHING_SCHEDULE_COLLECTION, normalized.id),
    {
      ...normalized,
      updatedAtServer: serverTimestamp(),
    },
    { merge: true }
  );

  const cached = readCache().filter((item) => item.id !== normalized.id);
  writeCache([normalized, ...cached]);
  return normalized;
}

export async function markCoachingSchedulesAsCoached(agent: string, monthKey: string) {
  const rows = await fetchStoredCoachingSchedules().catch(() => readCache());
  const matches = rows.filter(
    (item) =>
      canonicalizeAgentName(item.agent) === canonicalizeAgentName(agent) &&
      item.monthKey === monthKey &&
      item.status !== "Coached"
  );
  if (!matches.length) return rows;

  const saved = await Promise.all(
    matches.map((item) =>
      upsertStoredCoachingSchedule({ ...item, status: "Coached" })
    )
  );
  const savedById = new Map(saved.map((item) => [item.id, item]));
  const next = rows.map((item) => savedById.get(item.id) || item);
  writeCache(next);
  return sortSchedules(next);
}
