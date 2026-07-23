import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";

const SYSTEM_SETTINGS_COLLECTION = "qa_system_settings";
const GLOBAL_MAINTENANCE_DOCUMENT = "global";
const TEMPLATE_DOCUMENT = "maintenance_templates";
const STATE_CACHE_KEY = "qa-dashboard:maintenance-control-v61";
const TEMPLATE_CACHE_KEY = "qa-dashboard:maintenance-templates-v61";

export type MaintenanceSeverity = "planned" | "important" | "emergency";
export type MaintenanceStatus = "open" | "scheduled" | "active" | "completed";

export type MaintenanceReasonTemplate = {
  id: string;
  name: string;
  title: string;
  message: string;
  severity: MaintenanceSeverity;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type MaintenanceControlState = {
  enabled: boolean;
  status: MaintenanceStatus;
  message: string;
  title: string;
  reasonId: string;
  reasonName: string;
  severity: MaintenanceSeverity;
  scheduledStartAt: string;
  scheduledEndAt: string;
  autoOpenEnabled: boolean;
  updatedAt: string;
  updatedBy: string;
};

export const DEFAULT_MAINTENANCE_REASONS: MaintenanceReasonTemplate[] = [
  {
    id: "system-update",
    name: "อัปเดตระบบและปรับปรุงประสิทธิภาพ",
    title: "ระบบอยู่ระหว่างการปรับปรุง",
    message: "ขณะนี้ระบบอยู่ระหว่างการอัปเดตและปรับปรุงประสิทธิภาพ กรุณากลับมาใช้งานอีกครั้งตามเวลาที่แจ้ง",
    severity: "planned",
    active: true,
  },
  {
    id: "qa-data-update",
    name: "อัปเดตข้อมูล QA",
    title: "ระบบอยู่ระหว่างอัปเดตข้อมูล",
    message: "ทีมงานกำลังอัปเดตข้อมูล QA เพื่อให้ข้อมูลในระบบถูกต้องและเป็นปัจจุบัน",
    severity: "planned",
    active: true,
  },
  {
    id: "permission-update",
    name: "อัปเดตสิทธิ์และบัญชีผู้ใช้",
    title: "กำลังปรับปรุงสิทธิ์การใช้งาน",
    message: "ระบบปิดใช้งานชั่วคราวเพื่ออัปเดตสิทธิ์ บทบาท และบัญชีผู้ใช้งาน",
    severity: "important",
    active: true,
  },
  {
    id: "database-maintenance",
    name: "บำรุงรักษาฐานข้อมูล",
    title: "ระบบอยู่ระหว่างบำรุงรักษา",
    message: "ทีมงานกำลังบำรุงรักษาฐานข้อมูลเพื่อเพิ่มความเสถียรและความปลอดภัยของระบบ",
    severity: "important",
    active: true,
  },
  {
    id: "urgent-fix",
    name: "แก้ไขข้อผิดพลาดเร่งด่วน",
    title: "ระบบปิดใช้งานชั่วคราว",
    message: "ตรวจพบปัญหาที่จำเป็นต้องแก้ไขเร่งด่วน ระบบจึงปิดใช้งานชั่วคราวเพื่อดำเนินการแก้ไข",
    severity: "emergency",
    active: true,
  },
];

export const DEFAULT_MAINTENANCE_CONTROL_STATE: MaintenanceControlState = {
  enabled: false,
  status: "open",
  message: "",
  title: "ระบบอยู่ระหว่างการปรับปรุง",
  reasonId: "",
  reasonName: "",
  severity: "planned",
  scheduledStartAt: "",
  scheduledEndAt: "",
  autoOpenEnabled: false,
  updatedAt: "",
  updatedBy: "",
};

function safeReadLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeWriteLocal<T>(key: string, value: T) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local cache is only a fallback.
  }
}

function normalizeSeverity(value: unknown): MaintenanceSeverity {
  return value === "important" || value === "emergency" ? value : "planned";
}

function normalizeStatus(value: unknown, enabled: boolean): MaintenanceStatus {
  if (value === "scheduled" || value === "active" || value === "completed") {
    return value;
  }

  return enabled ? "active" : "open";
}

function normalizeState(row: any): MaintenanceControlState {
  const enabled = row?.enabled === true;

  return {
    enabled,
    status: normalizeStatus(row?.status, enabled),
    message: String(row?.message || ""),
    title: String(row?.title || "ระบบอยู่ระหว่างการปรับปรุง"),
    reasonId: String(row?.reasonId || ""),
    reasonName: String(row?.reasonName || ""),
    severity: normalizeSeverity(row?.severity),
    scheduledStartAt: String(row?.scheduledStartAt || ""),
    scheduledEndAt: String(row?.scheduledEndAt || ""),
    autoOpenEnabled: row?.autoOpenEnabled === true,
    updatedAt: String(row?.updatedAt || ""),
    updatedBy: String(row?.updatedBy || ""),
  };
}

function normalizeTemplate(row: any): MaintenanceReasonTemplate | null {
  const id = String(row?.id || "").trim();
  const name = String(row?.name || "").trim();
  if (!id || !name) return null;

  return {
    id,
    name,
    title: String(row?.title || "ระบบอยู่ระหว่างการปรับปรุง"),
    message: String(row?.message || ""),
    severity: normalizeSeverity(row?.severity),
    active: row?.active !== false,
    createdAt: String(row?.createdAt || ""),
    updatedAt: String(row?.updatedAt || ""),
  };
}

export async function fetchMaintenanceControlState() {
  try {
    const snapshot = await getDoc(
      doc(firebaseDb, SYSTEM_SETTINGS_COLLECTION, GLOBAL_MAINTENANCE_DOCUMENT)
    );

    const state = snapshot.exists()
      ? normalizeState(snapshot.data())
      : DEFAULT_MAINTENANCE_CONTROL_STATE;

    safeWriteLocal(STATE_CACHE_KEY, state);
    return state;
  } catch {
    return safeReadLocal(
      STATE_CACHE_KEY,
      DEFAULT_MAINTENANCE_CONTROL_STATE
    );
  }
}

export async function saveMaintenanceControlState(
  state: MaintenanceControlState
) {
  const nextState = normalizeState(state);

  await setDoc(
    doc(firebaseDb, SYSTEM_SETTINGS_COLLECTION, GLOBAL_MAINTENANCE_DOCUMENT),
    {
      ...nextState,
      updatedAt: nextState.updatedAt || new Date().toISOString(),
      updatedAtServer: serverTimestamp(),
    },
    { merge: true }
  );

  safeWriteLocal(STATE_CACHE_KEY, nextState);
  return nextState;
}

export async function fetchMaintenanceReasonTemplates() {
  try {
    const snapshot = await getDoc(
      doc(firebaseDb, SYSTEM_SETTINGS_COLLECTION, TEMPLATE_DOCUMENT)
    );

    const storedTemplates = snapshot.exists()
      ? (snapshot.data()?.templates || [])
          .map(normalizeTemplate)
          .filter(Boolean) as MaintenanceReasonTemplate[]
      : [];

    const templates = storedTemplates.length
      ? storedTemplates
      : DEFAULT_MAINTENANCE_REASONS;

    safeWriteLocal(TEMPLATE_CACHE_KEY, templates);
    return templates;
  } catch {
    return safeReadLocal(
      TEMPLATE_CACHE_KEY,
      DEFAULT_MAINTENANCE_REASONS
    );
  }
}

export async function saveMaintenanceReasonTemplates(
  templates: MaintenanceReasonTemplate[]
) {
  const normalized = templates
    .map(normalizeTemplate)
    .filter(Boolean) as MaintenanceReasonTemplate[];

  await setDoc(
    doc(firebaseDb, SYSTEM_SETTINGS_COLLECTION, TEMPLATE_DOCUMENT),
    {
      templates: normalized,
      updatedAt: new Date().toISOString(),
      updatedAtServer: serverTimestamp(),
    },
    { merge: true }
  );

  safeWriteLocal(TEMPLATE_CACHE_KEY, normalized);
  return normalized;
}

export function isMaintenanceOwnerUsername(username: unknown) {
  return String(username || "").trim().toLowerCase() === "songpon";
}