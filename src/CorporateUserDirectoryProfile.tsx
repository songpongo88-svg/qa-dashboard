import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { collection, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { jsPDF } from "jspdf";
import { firebaseDb } from "./firebaseClient";
import { registerTHSarabunNew } from "./THSarabunNew-jsPDF";
import { fetchStoredProfilePhoto } from "./profilePhotoStore";

type DirectoryStatusView = "active" | "suspended";
type LifecycleMode = "active" | "scheduled" | "suspended" | "offboarding";
type DeviceStatus = "Assigned" | "Not Assigned" | "Repair" | "Returned";
type ReturnStatus = "Pending" | "Scheduled" | "Complete" | "Incomplete" | "Lost";
type DeviceCondition = "Not Checked" | "Normal" | "Used" | "Damaged" | "Repair Required";

type DirectoryUserRow = {
  username: string;
  displayName: string;
  agentName: string;
  email?: string;
  teamLead?: string;
  teamName?: string;
  status: "Active" | "Suspended";
  suspendReason?: string;
  suspendEffectiveDate?: string;
  suspendEndDate?: string;
  suspendAutoReactivate?: boolean;
  effectiveRole: string;
  normalizedUsername: string;
};

export type CorporateUserAccountUpdate = {
  username: string;
  displayName: string;
  agentName: string;
  email: string;
  role: string;
  teamLead: string;
  teamName: string;
  status: "Active" | "Suspended";
  suspendReason: string;
  suspendEffectiveDate: string;
  suspendEndDate: string;
  suspendAutoReactivate: boolean;
};

type WorkDevice = {
  id: string;
  isPrimary: boolean;
  status: DeviceStatus;
  brand: string;
  model: string;
  series: string;
  os: string;
  assetId: string;
  serialNumber: string;
  imei: string;
  imei2: string;
  workSim: string;
  simPackage: string;
  assignedDate: string;
  note: string;
  returnStatus: ReturnStatus;
  returnDate: string;
  returnedBy: string;
  receivedBy: string;
  condition: DeviceCondition;
  returnNote: string;
  returnedItems: Record<string, boolean>;
};

type HistoryChange = {
  field: string;
  before: string;
  after: string;
};

type HistoryItem = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  updatedBy?: string;
  category?: string;
  changes?: HistoryChange[];
};

type UserMeta = {
  docId: string;
  preferredName: string;
  employeeId: string;
  officeNumber: string;
  extension: string;
  officeUsage: string;
  backupOfficeNumber: string;
  contactNote: string;
  devices: WorkDevice[];
  lifecycleMode: LifecycleMode;
  suspendReason: string;
  effectiveDate: string;
  endDate: string;
  autoReactivate: boolean;
  approver: string;
  lifecycleNote: string;
  offboardingStatus: "Working" | "In Progress" | "Completed";
  employmentEndDate: string;
  offboardingNote: string;
  history: HistoryItem[];
  passwordIssuedAt: string;
  updatedAt: string;
};

type Props = {
  rows: DirectoryUserRow[];
  updatedByName: string;
  canManageUsers: boolean;
  canManageTeams: boolean;
  rolePermissions: Record<string, Record<string, boolean>>;
  statusView: DirectoryStatusView;
  onStatusViewChange: (value: DirectoryStatusView) => void;
  onCreateUser: () => void;
  onExportPdf: () => void;
  onEditDirectory: () => void;
  onOpenTeams: () => void;
  onManageTeams: () => void;
  onSaveAccount: (update: CorporateUserAccountUpdate) => Promise<void>;
};

const EMPTY_ITEMS = {
  device: false,
  workSim: false,
  cable: false,
  adapter: false,
  accessories: false,
  companyDataWiped: false,
};

const CONTACT_USAGE = "ใช้สำหรับโทรออกและติดต่อประสานงานผ่านสำนักงาน";

function emptyDevice(index = 0): WorkDevice {
  return {
    id: `device-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    isPrimary: index === 0,
    status: "Not Assigned",
    brand: "",
    model: "",
    series: "",
    os: "",
    assetId: "",
    serialNumber: "",
    imei: "",
    imei2: "",
    workSim: "",
    simPackage: "",
    assignedDate: "",
    note: "",
    returnStatus: "Pending",
    returnDate: "",
    returnedBy: "",
    receivedBy: "",
    condition: "Not Checked",
    returnNote: "",
    returnedItems: { ...EMPTY_ITEMS },
  };
}

function emptyMeta(): UserMeta {
  return {
    docId: "",
    preferredName: "",
    employeeId: "",
    officeNumber: "",
    extension: "",
    officeUsage: CONTACT_USAGE,
    backupOfficeNumber: "",
    contactNote: "",
    devices: [],
    lifecycleMode: "active",
    suspendReason: "",
    effectiveDate: "",
    endDate: "",
    autoReactivate: false,
    approver: "",
    lifecycleNote: "",
    offboardingStatus: "Working",
    employmentEndDate: "",
    offboardingNote: "",
    history: [],
    passwordIssuedAt: "",
    updatedAt: "",
  };
}

function safeId(value: unknown) {
  return String(value || "").trim().replace(/\//g, "__").replace(/\s+/g, " ") || "unknown";
}

function normalizeUsername(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function cloneMeta(value: UserMeta) {
  return JSON.parse(JSON.stringify(value)) as UserMeta;
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts.slice(0, 2).map((part) => part[0].toUpperCase()).join("") : "U";
}

function avatarClass(role: string) {
  if (role === "Quality Assurance") return "from-fuchsia-500 to-violet-700";
  if (role === "Supervisor") return "from-sky-500 to-blue-700";
  if (role === "Senior") return "from-amber-400 to-orange-600";
  if (role === "Virtual Rider") return "from-emerald-400 to-teal-700";
  return "from-violet-500 to-indigo-700";
}

function todayBangkok() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(new Date());
}

function thaiDate(value: string) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("th-TH", { dateStyle: "long", timeZone: "Asia/Bangkok" }).format(date);
}

function formatDateTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("th-TH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Bangkok",
      }).format(date);
}

function valueOrDash(value: unknown) {
  return String(value || "").trim() || "-";
}

function digitsOnly(value: unknown) {
  return String(value || "").replace(/\D+/g, "");
}

function cleanContactNote(value: unknown) {
  return String(value || "")
    .replace(
      /(?:^|\s*[|•·]\s*)ชื่อเรียก\s+[^|•·]+/gi,
      ""
    )
    .replace(/\s*[|•·]\s*(?=\s*[|•·]|$)/g, "")
    .replace(/^[\s|•·-]+|[\s|•·-]+$/g, "")
    .trim();
}

function extractSimPackage(
  noteValue: unknown,
  fallbackValue: unknown
) {
  const fallback = String(fallbackValue || "").trim();
  if (fallback) return fallback;

  const match = String(noteValue || "").match(
    /แพ็กเกจ\s*Work\s*SIM\s*([A-Za-z0-9._/-]+)/i
  );

  return match?.[1] || "";
}

function cleanDeviceNote(value: unknown) {
  return String(value || "")
    .replace(
      /(?:^|\s*[|•·]\s*)แพ็กเกจ\s*Work\s*SIM\s*[A-Za-z0-9._/-]+/gi,
      ""
    )
    .replace(/\s*[|•·]\s*(?=\s*[|•·]|$)/g, "")
    .replace(/^[\s|•·-]+|[\s|•·-]+$/g, "")
    .trim();
}
function normalizeSuspensionDate(value: string) {
  const text = String(value || "").trim();
  if (!text) return "";

  const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const slashMatch = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (slashMatch) {
    return `${slashMatch[3]}-${slashMatch[2].padStart(2, "0")}-${slashMatch[1].padStart(2, "0")}`;
  }

  return "";
}

function splitLegacySuspensionFields(
  reasonValue: string,
  effectiveDateValue: string
) {
  const originalReason = String(reasonValue || "").trim();
  let effectiveDate = normalizeSuspensionDate(
    effectiveDateValue
  );

  if (!effectiveDate) {
    effectiveDate = normalizeSuspensionDate(
      originalReason
    );
  }

  const legacyLabelPattern =
    /terminate\s*\/\s*suspend\s*date|terminate\s*date|suspend\s*date/i;
  const isLegacyCombinedValue =
    legacyLabelPattern.test(originalReason);

  let suspendReason = originalReason;

  if (isLegacyCombinedValue) {
    suspendReason = originalReason
      .replace(
        /(?:--|—|–|-)?\s*(?:terminate\s*\/\s*suspend\s*date|terminate\s*date|suspend\s*date)\s*[:\-]?\s*(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})?/gi,
        ""
      )
      .replace(/^[\s—–\-:]+|[\s—–\-:]+$/g, "")
      .trim();

    if (!suspendReason) {
      suspendReason =
        "สิ้นสุดการปฏิบัติงาน";
    }
  }

  return {
    suspendReason,
    effectiveDate,
  };
}
function deviceFromData(raw: any, index: number): WorkDevice {
  const returnedItems = raw?.returnedItems || raw?.returnChecklist || {};
  return {
    id: String(raw?.id || `device-${index + 1}`),
    isPrimary: raw?.isPrimary === true || index === 0,
    status:
      raw?.status === "Assigned" || raw?.deviceStatus === "Assigned"
        ? "Assigned"
        : raw?.status === "Repair" || raw?.deviceStatus === "Repair"
          ? "Repair"
          : raw?.status === "Returned" || raw?.deviceStatus === "Returned"
            ? "Returned"
            : "Not Assigned",
    brand: String(raw?.brand || raw?.deviceBrand || ""),
    model: String(raw?.model || raw?.deviceModel || ""),
    series: String(raw?.series || raw?.deviceSeries || ""),
    os: String(raw?.os || raw?.operatingSystem || ""),
    assetId: String(raw?.assetId || ""),
    serialNumber: String(raw?.serialNumber || ""),
    imei: String(raw?.imei || ""),
    imei2: String(raw?.imei2 || ""),
    workSim: digitsOnly(
      raw?.workSim || raw?.workSimNumber || ""
    ),
    simPackage: extractSimPackage(
      raw?.note || raw?.deviceNote || "",
      raw?.simPackage ||
        raw?.workSimPackage ||
        raw?.phonePackage ||
        ""
    ),
    assignedDate: String(raw?.assignedDate || ""),
    note: cleanDeviceNote(
      raw?.note || raw?.deviceNote || ""
    ),
    returnStatus:
      raw?.returnStatus === "Scheduled" ||
      raw?.returnStatus === "Complete" ||
      raw?.returnStatus === "Incomplete" ||
      raw?.returnStatus === "Lost"
        ? raw.returnStatus
        : "Pending",
    returnDate: String(raw?.returnDate || ""),
    returnedBy: String(raw?.returnedBy || ""),
    receivedBy: String(raw?.receivedBy || ""),
    condition:
      raw?.condition === "Normal" ||
      raw?.condition === "Used" ||
      raw?.condition === "Damaged" ||
      raw?.condition === "Repair Required"
        ? raw.condition
        : "Not Checked",
    returnNote: String(raw?.returnNote || ""),
    returnedItems: {
      device: returnedItems.device === true,
      workSim: returnedItems.workSim === true,
      cable: returnedItems.cable === true,
      adapter: returnedItems.adapter === true,
      accessories: returnedItems.accessories === true,
      companyDataWiped: returnedItems.companyDataWiped === true,
    },
  };
}

function metaFromData(id: string, data: any): UserMeta {
  let devices: WorkDevice[] = Array.isArray(data?.devices)
    ? data.devices.map(deviceFromData)
    : [];

  if (!devices.length && (data?.deviceBrand || data?.deviceModel || data?.assetId || data?.serialNumber)) {
    devices = [
      deviceFromData(
        {
          id: "legacy-primary",
          isPrimary: true,
          deviceStatus: data.deviceStatus,
          deviceBrand: data.deviceBrand,
          deviceModel: data.deviceModel,
          deviceSeries: data.deviceSeries,
          operatingSystem: data.operatingSystem,
          assetId: data.assetId,
          serialNumber: data.serialNumber,
          imei: data.imei,
          imei2: data.imei2,
          workSimNumber: data.workSimNumber,
          workSimPackage:
            data.workSimPackage || data.phonePackage,
          assignedDate: data.assignedDate,
          deviceNote: data.deviceNote,
        },
        0
      ),
    ];
  }

  if (devices.length && !devices.some((device) => device.isPrimary)) {
    devices[0].isPrimary = true;
  }

  return {
    docId: id,
    preferredName: String(data?.preferredName || ""),
    employeeId: String(data?.employeeId || ""),
    officeNumber: digitsOnly(
      data?.officeNumber ||
        data?.officeContactNumber ||
        data?.outboundCallerNumber ||
        ""
    ),
    extension: digitsOnly(
      data?.extension || data?.officeExtension || ""
    ),
    officeUsage: String(
      data?.officeUsage ||
        data?.officeContactUsage ||
        CONTACT_USAGE
    ),
    backupOfficeNumber: digitsOnly(
      data?.backupOfficeNumber ||
        data?.secondaryOfficeContact ||
        ""
    ),
    contactNote: cleanContactNote(
      data?.contactNote ||
        data?.officeContactNote ||
        ""
    ),
    devices,
    lifecycleMode:
      data?.lifecycleMode === "scheduled" ||
      data?.lifecycleMode === "suspended" ||
      data?.lifecycleMode === "offboarding"
        ? data.lifecycleMode
        : "active",
    suspendReason: String(data?.suspendReason || ""),
    effectiveDate: String(data?.effectiveDate || data?.suspendEffectiveDate || ""),
    endDate: String(data?.endDate || data?.suspendEndDate || ""),
    autoReactivate: data?.autoReactivate === true || data?.suspendAutoReactivate === true,
    approver: String(data?.approver || data?.lifecycleApprover || ""),
    lifecycleNote: String(data?.lifecycleNote || data?.lifecycleDetail || ""),
    offboardingStatus:
      data?.offboardingStatus === "In Progress" ||
      data?.offboardingStatus === "Completed"
        ? data.offboardingStatus
        : data?.lifecycleMode === "offboarding"
          ? "In Progress"
          : "Working",
    employmentEndDate: String(
      data?.employmentEndDate ||
        data?.offboardingEndDate ||
        (data?.lifecycleMode === "offboarding"
          ? data?.effectiveDate ||
            data?.suspendEffectiveDate ||
            ""
          : "")
    ),
    offboardingNote: String(data?.offboardingNote || ""),
    history: Array.isArray(data?.history)
      ? data.history
      : Array.isArray(data?.profileHistory)
        ? data.profileHistory
        : [],
    passwordIssuedAt: String(data?.passwordIssuedAt || ""),
    updatedAt: String(data?.updatedAt || ""),
  };
}

function hydrateMeta(meta: UserMeta, user: DirectoryUserRow): UserMeta {
  const normalizedSuspension =
    splitLegacySuspensionFields(
      meta.suspendReason ||
        user.suspendReason ||
        "",
      meta.effectiveDate ||
        user.suspendEffectiveDate ||
        ""
    );
  const effectiveDate =
    normalizedSuspension.effectiveDate;
  let lifecycleMode: LifecycleMode =
    "active";

  if (user.status === "Suspended") {
    lifecycleMode = "suspended";
  } else if (effectiveDate) {
    lifecycleMode =
      effectiveDate > todayBangkok()
        ? "scheduled"
        : "suspended";
  }

  return {
    ...meta,
    lifecycleMode,
    suspendReason:
      normalizedSuspension.suspendReason,
    effectiveDate,
    endDate:
      meta.endDate ||
      user.suspendEndDate ||
      "",
    autoReactivate:
      meta.autoReactivate ||
      user.suspendAutoReactivate === true,
  };
}
function lifecycleLabel(mode: LifecycleMode, status: "Active" | "Suspended") {
  if (mode === "scheduled") return "ตั้งเวลาระงับ";
  if (mode === "suspended" || status === "Suspended") return "Suspended";
  return "Active";
}

function lifecycleClass(mode: LifecycleMode, status: "Active" | "Suspended") {
  if (mode === "scheduled") return "bg-amber-50 text-amber-700";
  if (mode === "suspended" || status === "Suspended") return "bg-rose-50 text-rose-700";
  return "bg-emerald-50 text-emerald-700";
}

function statusLabel(value: DeviceStatus) {
  if (value === "Assigned") return "กำลังใช้งาน";
  if (value === "Repair") return "อยู่ระหว่างซ่อม";
  if (value === "Returned") return "คืนอุปกรณ์แล้ว";
  return "ยังไม่มีอุปกรณ์";
}

function returnLabel(value: ReturnStatus) {
  if (value === "Scheduled") return "นัดหมายคืนแล้ว";
  if (value === "Complete") return "คืนครบแล้ว";
  if (value === "Incomplete") return "คืนไม่ครบ";
  if (value === "Lost") return "อุปกรณ์สูญหาย";
  return "รอดำเนินการคืน";
}

function conditionLabel(value: DeviceCondition) {
  if (value === "Normal") return "ปกติ";
  if (value === "Used") return "มีรอยใช้งาน";
  if (value === "Damaged") return "ชำรุด";
  if (value === "Repair Required") return "ต้องส่งซ่อม";
  return "ยังไม่ได้ตรวจสอบ";
}


function hasDeviceData(device: WorkDevice) {
  return Boolean(
    [
      device.brand,
      device.model,
      device.series,
      device.os,
      device.assetId,
      device.serialNumber,
      device.imei,
      device.imei2,
      device.workSim,
      device.simPackage,
      device.assignedDate,
      device.note,
    ].some((value) => String(value || "").trim())
  );
}

function effectiveDeviceStatus(
  device: WorkDevice
): DeviceStatus {
  if (
    device.status === "Not Assigned" &&
    hasDeviceData(device)
  ) {
    return "Assigned";
  }

  return device.status;
}

function auditText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || "ไม่ได้ระบุ";
}

function deviceAuditSummary(
  device: WorkDevice
) {
  return [
    [device.brand, device.model]
      .filter(Boolean)
      .join(" "),
    device.assetId
      ? `Asset ${device.assetId}`
      : "",
    device.workSim
      ? `Work SIM ${device.workSim}`
      : "",
    statusLabel(
      effectiveDeviceStatus(device)
    ),
  ]
    .filter(Boolean)
    .join(" · ");
}

function buildProfileAuditChanges(
  beforeAccount: CorporateUserAccountUpdate,
  afterAccount: CorporateUserAccountUpdate,
  beforeMeta: UserMeta,
  afterMeta: UserMeta
): HistoryChange[] {
  const changes: HistoryChange[] = [];

  const add = (
    field: string,
    before: unknown,
    after: unknown,
    formatter: (
      value: unknown
    ) => string = auditText
  ) => {
    const beforeText = formatter(before);
    const afterText = formatter(after);

    if (beforeText === afterText) return;

    changes.push({
      field,
      before: beforeText,
      after: afterText,
    });
  };

  const dateFormatter = (value: unknown) => {
    const text = String(value || "").trim();
    return text ? thaiDate(text) : "ไม่ได้ระบุ";
  };

  add(
    "ชื่อ–นามสกุล",
    beforeAccount.displayName,
    afterAccount.displayName
  );
  add(
    "Agent Name",
    beforeAccount.agentName,
    afterAccount.agentName
  );
  add(
    "อีเมล",
    beforeAccount.email,
    afterAccount.email
  );
  add(
    "Role",
    beforeAccount.role,
    afterAccount.role
  );
  add(
    "ทีม",
    beforeAccount.teamName,
    afterAccount.teamName
  );
  add(
    "หัวหน้าทีม",
    beforeAccount.teamLead,
    afterAccount.teamLead
  );
  add(
    "สถานะบัญชี",
    beforeAccount.status,
    afterAccount.status
  );

  add(
    "ชื่อเล่น",
    beforeMeta.preferredName,
    afterMeta.preferredName
  );
  add(
    "รหัสพนักงาน",
    beforeMeta.employeeId,
    afterMeta.employeeId
  );
  add(
    "เบอร์สำนักงาน",
    beforeMeta.officeNumber,
    afterMeta.officeNumber
  );
  add(
    "เบอร์ต่อภายใน",
    beforeMeta.extension,
    afterMeta.extension
  );
  add(
    "หมายเลขสำนักงานสำรอง",
    beforeMeta.backupOfficeNumber,
    afterMeta.backupOfficeNumber
  );
  add(
    "หมายเหตุการติดต่อ",
    beforeMeta.contactNote,
    afterMeta.contactNote
  );

  add(
    "วันที่มีผลระงับบัญชี",
    beforeMeta.effectiveDate,
    afterMeta.effectiveDate,
    dateFormatter
  );
  add(
    "เหตุผลการระงับบัญชี",
    beforeMeta.suspendReason,
    afterMeta.suspendReason
  );

  add(
    "สถานะ Offboarding",
    beforeMeta.offboardingStatus,
    afterMeta.offboardingStatus,
    (value) =>
      value === "In Progress"
        ? "อยู่ระหว่าง Offboarding"
        : value === "Completed"
          ? "สิ้นสุดงานแล้ว"
          : "ยังไม่ได้เริ่ม"
  );
  add(
    "วันที่สิ้นสุดงาน",
    beforeMeta.employmentEndDate,
    afterMeta.employmentEndDate,
    dateFormatter
  );
  add(
    "หมายเหตุ Offboarding",
    beforeMeta.offboardingNote,
    afterMeta.offboardingNote
  );

  const deviceCount = Math.max(
    beforeMeta.devices.length,
    afterMeta.devices.length
  );

  for (
    let index = 0;
    index < deviceCount;
    index += 1
  ) {
    const beforeDevice =
      beforeMeta.devices[index];
    const afterDevice =
      afterMeta.devices[index];
    const prefix =
      `อุปกรณ์เครื่องที่ ${index + 1}`;

    if (!beforeDevice && afterDevice) {
      add(
        prefix,
        "",
        deviceAuditSummary(afterDevice)
      );
      continue;
    }

    if (beforeDevice && !afterDevice) {
      add(
        prefix,
        deviceAuditSummary(beforeDevice),
        ""
      );
      continue;
    }

    if (!beforeDevice || !afterDevice) {
      continue;
    }

    add(
      `${prefix} · สถานะ`,
      statusLabel(
        effectiveDeviceStatus(beforeDevice)
      ),
      statusLabel(
        effectiveDeviceStatus(afterDevice)
      )
    );
    add(
      `${prefix} · รุ่น`,
      [beforeDevice.brand, beforeDevice.model]
        .filter(Boolean)
        .join(" "),
      [afterDevice.brand, afterDevice.model]
        .filter(Boolean)
        .join(" ")
    );
    add(
      `${prefix} · Asset ID`,
      beforeDevice.assetId,
      afterDevice.assetId
    );
    add(
      `${prefix} · Serial Number`,
      beforeDevice.serialNumber,
      afterDevice.serialNumber
    );
    add(
      `${prefix} · IMEI`,
      beforeDevice.imei,
      afterDevice.imei
    );
    add(
      `${prefix} · Work SIM`,
      beforeDevice.workSim,
      afterDevice.workSim
    );
    add(
      `${prefix} · แพ็กเกจ Work SIM`,
      beforeDevice.simPackage,
      afterDevice.simPackage
    );
    add(
      `${prefix} · วันที่มอบหมาย`,
      beforeDevice.assignedDate,
      afterDevice.assignedDate,
      dateFormatter
    );
    add(
      `${prefix} · สถานะการคืน`,
      returnLabel(beforeDevice.returnStatus),
      returnLabel(afterDevice.returnStatus)
    );
    add(
      `${prefix} · วันที่คืน`,
      beforeDevice.returnDate,
      afterDevice.returnDate,
      dateFormatter
    );
    add(
      `${prefix} · สภาพอุปกรณ์`,
      conditionLabel(beforeDevice.condition),
      conditionLabel(afterDevice.condition)
    );
    add(
      `${prefix} · ผู้ส่งคืน`,
      beforeDevice.returnedBy,
      afterDevice.returnedBy
    );
    add(
      `${prefix} · ผู้รับคืน`,
      beforeDevice.receivedBy,
      afterDevice.receivedBy
    );
    add(
      `${prefix} · รายการคืน`,
      JSON.stringify(
        beforeDevice.returnedItems
      ),
      JSON.stringify(
        afterDevice.returnedItems
      ),
      (value) => {
        try {
          const parsed = JSON.parse(
            String(value || "{}")
          ) as Record<string, boolean>;
          const labels: Record<
            string,
            string
          > = {
            device: "ตัวเครื่อง",
            workSim: "Work SIM",
            cable: "สายชาร์จ",
            adapter: "หัวชาร์จ",
            accessories:
              "เคส / อุปกรณ์เสริม",
            companyDataWiped:
              "ล้างข้อมูลบริษัทแล้ว",
          };

          const selected = Object.entries(
            parsed
          )
            .filter(([, checked]) => checked)
            .map(
              ([key]) => labels[key] || key
            );

          return selected.length
            ? selected.join(", ")
            : "ยังไม่มีรายการที่คืน";
        } catch {
          return "ยังไม่มีรายการที่คืน";
        }
      }
    );
  }

  return changes.slice(0, 80);
}

function auditHistoryTitle(
  changes: HistoryChange[]
) {
  const fields = changes.map(
    (change) => change.field
  );
  const suspensionOnly = fields.every(
    (field) =>
      field.includes("ระงับบัญชี") ||
      field === "สถานะบัญชี"
  );
  const offboardingOnly = fields.every(
    (field) =>
      field.includes("Offboarding") ||
      field.includes("สิ้นสุดงาน") ||
      field.includes("อุปกรณ์เครื่องที่")
  );
  const deviceOnly = fields.every(
    (field) =>
      field.includes("อุปกรณ์เครื่องที่")
  );
  const accountOnly = fields.every(
    (field) =>
      [
        "ชื่อ–นามสกุล",
        "Agent Name",
        "อีเมล",
        "Role",
        "ทีม",
        "หัวหน้าทีม",
        "ชื่อเล่น",
        "รหัสพนักงาน",
        "เบอร์สำนักงาน",
        "เบอร์ต่อภายใน",
        "หมายเลขสำนักงานสำรอง",
        "หมายเหตุการติดต่อ",
      ].includes(field)
  );

  if (suspensionOnly) {
    const cancelled = changes.some(
      (change) =>
        change.field.includes(
          "วันที่มีผลระงับบัญชี"
        ) &&
        change.after === "ไม่ได้ระบุ"
    );

    return cancelled
      ? "ยกเลิกกำหนดการระงับบัญชี"
      : "กำหนดวันระงับบัญชี";
  }

  if (offboardingOnly) {
    return "อัปเดต Offboarding";
  }

  if (deviceOnly) {
    return "อัปเดตข้อมูลอุปกรณ์";
  }

  if (accountOnly) {
    return "แก้ไขข้อมูลบัญชี";
  }

  return "แก้ไขข้อมูล Profile";
}
function Section({
  id,
  icon,
  title,
  subtitle,
  action,
  children,
}: {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-lg text-violet-700">
            {icon}
          </div>
          <div>
            <div className="text-base font-semibold text-slate-950">{title}</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</div>
          </div>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  editing,
  onChange,
  type = "text",
  options,
  textarea,
  placeholder,
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange?: (value: string) => void;
  type?: string;
  options?: Array<{ value: string; label: string }>;
  textarea?: boolean;
  placeholder?: string;
}) {
  const rawValue = String(value || "").trim();
  const emptyInView =
    !rawValue ||
    rawValue === "-" ||
    rawValue === "ยังไม่ระบุ";

  if (!editing && emptyInView) {
    return null;
  }

  const display =
    options?.find(
      (option) => option.value === value
    )?.label ||
    (type === "date" && value
      ? thaiDate(value)
      : valueOrDash(value));
  return (
    <div className="grid grid-cols-[minmax(145px,0.75fr)_minmax(0,1.25fr)] gap-4 border-b border-slate-100 py-2.5 last:border-0">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="min-w-0">
        {editing && onChange ? (
          options ? (
            <select
              value={value}
              onChange={(event) => onChange(event.target.value)}
              title={`เลือก${label}`}
              className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
            >
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : textarea ? (
            <textarea
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder={placeholder}
              title={`แก้ไข${label}`}
              className="min-h-[82px] w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
            />
          ) : (
            <input
              type={type}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder={placeholder}
              title={`แก้ไข${label}`}
              className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
            />
          )
        ) : (
          <div className="break-words text-sm font-medium leading-6 text-slate-900">{display}</div>
        )}
      </div>
    </div>
  );
}

export default function CorporateUserDirectoryProfile({
  rows,
  updatedByName,
  canManageUsers,
  canManageTeams,
  rolePermissions,
  statusView,
  onStatusViewChange,
  onCreateUser,
  onExportPdf,
  onEditDirectory,
  onOpenTeams,
  onManageTeams,
  onSaveAccount,
}: Props) {
  const manageRef = useRef<HTMLDivElement | null>(null);
  const pdfRef = useRef<HTMLDivElement | null>(null);
  const [metaMap, setMetaMap] = useState<Record<string, UserMeta>>({});
  const [selectedUsername, setSelectedUsername] = useState("");
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [deviceFilter, setDeviceFilter] = useState("all");
  const [manageOpen, setManageOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [accountDraft, setAccountDraft] = useState<CorporateUserAccountUpdate | null>(null);
  const [metaDraft, setMetaDraft] = useState<UserMeta>(emptyMeta());
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [profilePhotos, setProfilePhotos] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    let cancelled = false;
    let requestNumber = 0;

    const loadProfilePhotos = async () => {
      const currentRequest = ++requestNumber;
      const usernames = Array.from(
        new Set(
          rows
            .map((row) => row.username)
            .filter(Boolean)
        )
      );

      const entries = await Promise.all(
        usernames.map(async (username) => {
          const storedPhoto =
            await fetchStoredProfilePhoto(username);

          return [
            normalizeUsername(username),
            storedPhoto?.photoDataUrl || "",
          ] as const;
        })
      );

      if (
        !cancelled &&
        currentRequest === requestNumber
      ) {
        setProfilePhotos(
          Object.fromEntries(entries)
        );
      }
    };

    const refreshProfilePhotos: EventListener =
      () => {
        void loadProfilePhotos();
      };

    void loadProfilePhotos();
    window.addEventListener(
      "focus",
      refreshProfilePhotos
    );
    window.addEventListener(
      "qa-profile-photo-updated",
      refreshProfilePhotos
    );

    return () => {
      cancelled = true;
      window.removeEventListener(
        "focus",
        refreshProfilePhotos
      );
      window.removeEventListener(
        "qa-profile-photo-updated",
        refreshProfilePhotos
      );
    };
  }, [rows]);

  useEffect(() => {
    let cancelled = false;
    getDocs(collection(firebaseDb, "qa_user_profiles"))
      .then((snapshot) => {
        const next: Record<string, UserMeta> = {};
        snapshot.docs.forEach((item) => {
          const data = item.data() as any;
          const username = normalizeUsername(data.username || item.id);
          if (username) next[username] = metaFromData(item.id, data);
        });
        if (!cancelled) setMetaMap(next);
      })
      .catch(() => {
        if (!cancelled) setMetaMap({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const closeMenus = (event: MouseEvent) => {
      const target = event.target as Node;
      if (manageRef.current && !manageRef.current.contains(target)) setManageOpen(false);
      if (pdfRef.current && !pdfRef.current.contains(target)) setPdfOpen(false);
    };
    document.addEventListener("mousedown", closeMenus);
    return () => document.removeEventListener("mousedown", closeMenus);
  }, []);

  const hydrated = useMemo(() => {
    const next: Record<string, UserMeta> = {};
    rows.forEach((row) => {
      next[row.normalizedUsername] = hydrateMeta(metaMap[row.normalizedUsername] || emptyMeta(), row);
    });
    return next;
  }, [metaMap, rows]);

  const roles = useMemo(
    () => Array.from(new Set(rows.map((row) => row.effectiveRole))).filter(Boolean).sort((a, b) => a.localeCompare(b)),
    [rows]
  );
  const teams = useMemo(
    () =>
      Array.from(new Set(rows.map((row) => row.teamName || "Unassigned Team"))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const expectedStatus = statusView === "active" ? "Active" : "Suspended";
    const keyword = search.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (row.status !== expectedStatus) return false;
        const meta = hydrated[row.normalizedUsername] || emptyMeta();
        const deviceText = meta.devices
          .map((device) =>
            [device.brand, device.model, device.assetId, device.serialNumber, device.imei, device.workSim].join(" ")
          )
          .join(" ");
        const searchable = [
          row.displayName,
          row.username,
          row.email,
          row.teamName,
          row.effectiveRole,
          meta.officeNumber,
          meta.extension,
          deviceText,
        ]
          .join(" ")
          .toLowerCase();
        const assigned = meta.devices.some((device) => device.status === "Assigned");
        return (
          (!keyword || searchable.includes(keyword)) &&
          (roleFilter === "all" || row.effectiveRole === roleFilter) &&
          (teamFilter === "all" || (row.teamName || "Unassigned Team") === teamFilter) &&
          (deviceFilter === "all" || (deviceFilter === "assigned" ? assigned : !assigned))
        );
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [deviceFilter, hydrated, roleFilter, rows, search, statusView, teamFilter]);

  useEffect(() => {
    if (filteredRows.some((row) => row.normalizedUsername === selectedUsername)) return;
    setSelectedUsername(filteredRows[0]?.normalizedUsername || "");
  }, [filteredRows, selectedUsername]);

  const user = filteredRows.find((row) => row.normalizedUsername === selectedUsername) || null;
  const savedMeta = user ? hydrated[user.normalizedUsername] || emptyMeta() : emptyMeta();
  const meta = editing ? metaDraft : savedMeta;
  const account =
    editing && accountDraft
      ? accountDraft
      : user
        ? {
            username: user.username,
            displayName: user.displayName,
            agentName: user.agentName,
            email: user.email || "",
            role: user.effectiveRole,
            teamLead: user.teamLead || "",
            teamName: user.teamName || "",
            status: user.status,
            suspendReason: savedMeta.suspendReason,
            suspendEffectiveDate: savedMeta.effectiveDate,
            suspendEndDate: savedMeta.endDate,
            suspendAutoReactivate: savedMeta.autoReactivate,
          }
        : null;

  const selectedDevice =
    meta.devices.find((device) => device.id === selectedDeviceId) ||
    meta.devices.find((device) => device.isPrimary) ||
    meta.devices[0] ||
    null;

  useEffect(() => {
    const next = savedMeta.devices.find((device) => device.isPrimary) || savedMeta.devices[0];
    setSelectedDeviceId(next?.id || "");
  }, [savedMeta.devices, user?.normalizedUsername]);

  const permissionCount = user
    ? Object.values(rolePermissions[user.effectiveRole] || {}).filter(Boolean).length
    : 0;

  const contactHasData = Boolean(
    [
      meta.officeNumber,
      meta.extension,
      meta.backupOfficeNumber,
      meta.contactNote,
    ].some((value) =>
      String(value || "").trim()
    )
  );
  const offboardingStarted =
    meta.offboardingStatus !== "Working" ||
    Boolean(
      meta.employmentEndDate ||
        meta.offboardingNote
    );
  const suspensionConfigured =
    Boolean(
      meta.effectiveDate ||
        meta.suspendReason
    ) ||
    account?.status === "Suspended";


  const discard = () =>
    !editing ||
    window.confirm("มีข้อมูลในโปรไฟล์ที่ยังไม่ได้บันทึก ต้องการยกเลิกการแก้ไขหรือไม่?");

  const changeView = (view: DirectoryStatusView) => {
    if (view === statusView || !discard()) return;
    setEditing(false);
    onStatusViewChange(view);
  };

  const chooseUser = (username: string) => {
    if (username === selectedUsername || !discard()) return;
    setEditing(false);
    setSelectedUsername(username);
  };

  const beginEdit = () => {
    if (!user) return;
    setAccountDraft({
      username: user.username,
      displayName: user.displayName,
      agentName: user.agentName || user.displayName,
      email: user.email || "",
      role: user.effectiveRole,
      teamLead: user.teamLead || "",
      teamName: user.teamName || "",
      status: user.status,
      suspendReason: savedMeta.suspendReason,
      suspendEffectiveDate: savedMeta.effectiveDate,
      suspendEndDate: savedMeta.endDate,
      suspendAutoReactivate: savedMeta.autoReactivate,
    });
    setMetaDraft(cloneMeta(savedMeta));
    setEditing(true);
    setToast("เปิดโหมดแก้ไขทั้งโปรไฟล์บนหน้าเดิมแล้ว");
  };

  const updateMeta = <K extends keyof UserMeta>(key: K, value: UserMeta[K]) => {
    setMetaDraft((current) => ({ ...current, [key]: value }));
  };

  const updateAccount = <K extends keyof CorporateUserAccountUpdate>(
    key: K,
    value: CorporateUserAccountUpdate[K]
  ) => {
    setAccountDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const updateDevice = <K extends keyof WorkDevice>(id: string, key: K, value: WorkDevice[K]) => {
    setMetaDraft((current) => ({
      ...current,
      devices: current.devices.map((device) => (device.id === id ? { ...device, [key]: value } : device)),
    }));
  };

  const addDevice = () => {
    const next = emptyDevice(metaDraft.devices.length);
    setMetaDraft((current) => ({ ...current, devices: [...current.devices, next] }));
    setSelectedDeviceId(next.id);
    setToast(`เพิ่มอุปกรณ์เครื่องที่ ${metaDraft.devices.length + 1} แล้ว`);
  };

  const removeDevice = (id: string) => {
    if (!window.confirm("ต้องการลบอุปกรณ์เครื่องนี้ออกจากโปรไฟล์หรือไม่?")) return;
    setMetaDraft((current) => {
      const removed = current.devices.find((device) => device.id === id);
      const remaining = current.devices.filter((device) => device.id !== id);
      if (removed?.isPrimary && remaining.length) remaining[0] = { ...remaining[0], isPrimary: true };
      return { ...current, devices: remaining };
    });
    setSelectedDeviceId(metaDraft.devices.find((device) => device.id !== id)?.id || "");
  };

  const makePrimary = (id: string) => {
    setMetaDraft((current) => ({
      ...current,
      devices: current.devices.map((device) => ({ ...device, isPrimary: device.id === id })),
    }));
    setToast("ตั้งเป็นอุปกรณ์หลักแล้ว");
  };

  const clearSuspension = () => {
    if (!editing) return;

    updateMeta("effectiveDate", "");
    updateMeta("suspendReason", "");
    updateMeta("endDate", "");
    updateMeta("autoReactivate", false);
    updateMeta("approver", "");
    updateMeta("lifecycleNote", "");
    updateMeta("lifecycleMode", "active");
    updateAccount("status", "Active");
    setToast(
      "ยกเลิกกำหนดการระงับแล้ว กดบันทึกการเปลี่ยนแปลงเพื่อยืนยัน"
    );
  };

  const startOffboarding = () => {
    if (!editing) return;

    updateMeta(
      "offboardingStatus",
      "In Progress"
    );
    setToast(
      "เริ่ม Offboarding แล้ว กรุณากรอกข้อมูลที่เกี่ยวข้อง"
    );
  };

  const cancelOffboarding = () => {
    if (!editing) return;

    updateMeta(
      "offboardingStatus",
      "Working"
    );
    updateMeta("employmentEndDate", "");
    updateMeta("offboardingNote", "");
    setToast(
      "ยกเลิก Offboarding แล้ว กดบันทึกการเปลี่ยนแปลงเพื่อยืนยัน"
    );
  };

  const save = async () => {
    if (!user || !accountDraft) return;

    if (!accountDraft.displayName.trim()) {
      setToast(
        "กรุณาระบุชื่อ–นามสกุล"
      );
      return;
    }

    const hasSuspensionInput = Boolean(
      metaDraft.effectiveDate ||
        metaDraft.suspendReason.trim()
    );

    if (
      hasSuspensionInput &&
      (!metaDraft.effectiveDate ||
        !metaDraft.suspendReason.trim())
    ) {
      setToast(
        "กรุณาระบุวันที่มีผลและเหตุผลการระงับให้ครบ"
      );
      document
        .getElementById(
          "profile-lifecycle"
        )
        ?.scrollIntoView({
          behavior: "smooth",
        });
      return;
    }

    const suspensionDue =
      hasSuspensionInput &&
      metaDraft.effectiveDate <=
        todayBangkok();

    const nextStatus:
      | "Active"
      | "Suspended" =
      hasSuspensionInput
        ? suspensionDue
          ? "Suspended"
          : "Active"
        : accountDraft.status;

    const nextLifecycleMode:
      LifecycleMode =
      hasSuspensionInput
        ? nextStatus === "Suspended"
          ? "suspended"
          : "scheduled"
        : nextStatus === "Suspended"
          ? "suspended"
          : "active";

    const normalizedDevices =
      metaDraft.devices.map(
        (device) => {
          const normalized = {
            ...device,
            workSim: digitsOnly(
              device.workSim
            ),
            simPackage: String(
              device.simPackage || ""
            ).trim(),
            note: cleanDeviceNote(
              device.note
            ),
          };

          return {
            ...normalized,
            status:
              normalized.status ===
                "Not Assigned" &&
              hasDeviceData(normalized)
                ? "Assigned"
                : normalized.status,
          };
        }
      );

    const nextMetaBase: UserMeta = {
      ...metaDraft,
      preferredName: String(
        metaDraft.preferredName || ""
      ).trim(),
      officeNumber: digitsOnly(
        metaDraft.officeNumber
      ),
      extension: digitsOnly(
        metaDraft.extension
      ),
      backupOfficeNumber: digitsOnly(
        metaDraft.backupOfficeNumber
      ),
      contactNote: cleanContactNote(
        metaDraft.contactNote
      ),
      devices: normalizedDevices,
      lifecycleMode:
        nextLifecycleMode,
      suspendReason:
        hasSuspensionInput
          ? metaDraft.suspendReason.trim()
          : "",
      effectiveDate:
        hasSuspensionInput
          ? metaDraft.effectiveDate
          : "",
      endDate: "",
      autoReactivate: false,
      approver: "",
      lifecycleNote: "",
      docId:
        metaDraft.docId ||
        safeId(user.username),
      updatedAt:
        new Date().toISOString(),
    };

    const update: CorporateUserAccountUpdate =
      {
        ...accountDraft,
        displayName:
          accountDraft.displayName.trim(),
        agentName:
          accountDraft.agentName.trim() ||
          accountDraft.displayName.trim(),
        email: accountDraft.email.trim(),
        role: accountDraft.role.trim(),
        teamLead:
          accountDraft.teamLead.trim(),
        teamName:
          accountDraft.teamName.trim(),
        status: nextStatus,
        suspendReason:
          nextMetaBase.suspendReason,
        suspendEffectiveDate:
          nextMetaBase.effectiveDate,
        suspendEndDate: "",
        suspendAutoReactivate: false,
      };

    const originalAccount:
      CorporateUserAccountUpdate = {
      username: user.username,
      displayName: user.displayName,
      agentName:
        user.agentName ||
        user.displayName,
      email: user.email || "",
      role: user.effectiveRole,
      teamLead: user.teamLead || "",
      teamName: user.teamName || "",
      status: user.status,
      suspendReason:
        savedMeta.suspendReason,
      suspendEffectiveDate:
        savedMeta.effectiveDate,
      suspendEndDate:
        savedMeta.endDate,
      suspendAutoReactivate:
        savedMeta.autoReactivate,
    };

    const auditChanges =
      buildProfileAuditChanges(
        originalAccount,
        update,
        savedMeta,
        nextMetaBase
      );

    if (!auditChanges.length) {
      setToast(
        "ยังไม่มีข้อมูลที่เปลี่ยนแปลง"
      );
      setEditing(false);
      setAccountDraft(null);
      return;
    }

    const historyItem: HistoryItem = {
      id: `history-${Date.now()}`,
      title:
        auditHistoryTitle(
          auditChanges
        ),
      detail: auditChanges
        .slice(0, 3)
        .map(
          (change) =>
            `${change.field}: ${change.before} → ${change.after}`
        )
        .join(" · "),
      createdAt:
        new Date().toISOString(),
      updatedBy:
        updatedByName ||
        "System",
      category: auditHistoryTitle(
        auditChanges
      ),
      changes: auditChanges,
    };

    const nextMeta: UserMeta = {
      ...nextMetaBase,
      history: [
        historyItem,
        ...metaDraft.history,
      ].slice(0, 80),
    };

    const primary =
      nextMeta.devices.find(
        (device) => device.isPrimary
      ) || nextMeta.devices[0];

    setSaving(true);

    try {
      await setDoc(
        doc(
          firebaseDb,
          "qa_user_profiles",
          nextMeta.docId
        ),
        {
          username: user.username,
          preferredName:
            nextMeta.preferredName,
          employeeId:
            nextMeta.employeeId,
          officeNumber:
            nextMeta.officeNumber,
          officeContactNumber:
            nextMeta.officeNumber,
          extension: nextMeta.extension,
          officeExtension:
            nextMeta.extension,
          officeUsage:
            nextMeta.officeUsage,
          officeContactUsage:
            nextMeta.officeUsage,
          backupOfficeNumber:
            nextMeta.backupOfficeNumber,
          secondaryOfficeContact:
            nextMeta.backupOfficeNumber,
          contactNote:
            nextMeta.contactNote,
          officeContactNote:
            nextMeta.contactNote,
          devices: nextMeta.devices,
          lifecycleMode:
            nextMeta.lifecycleMode,
          suspendReason:
            update.suspendReason,
          effectiveDate:
            update.suspendEffectiveDate,
          suspendEffectiveDate:
            update.suspendEffectiveDate,
          endDate: "",
          suspendEndDate: "",
          autoReactivate: false,
          suspendAutoReactivate: false,
          approver: "",
          lifecycleNote: "",
          offboardingStatus:
            nextMeta.offboardingStatus,
          employmentEndDate:
            nextMeta.employmentEndDate,
          offboardingNote:
            nextMeta.offboardingNote,
          history: nextMeta.history,
          profileHistory:
            nextMeta.history,
          deviceStatus:
            primary?.status ||
            "Not Assigned",
          deviceBrand:
            primary?.brand || "",
          deviceModel:
            primary?.model || "",
          deviceSeries:
            primary?.series || "",
          operatingSystem:
            primary?.os || "",
          assetId:
            primary?.assetId || "",
          serialNumber:
            primary?.serialNumber || "",
          imei: primary?.imei || "",
          imei2: primary?.imei2 || "",
          workSimNumber:
            primary?.workSim || "",
          workPhoneNumber:
            primary?.workSim || "",
          phoneNumber:
            primary?.workSim || "",
          workSimPackage:
            primary?.simPackage || "",
          phonePackage:
            primary?.simPackage || "",
          outboundCallerNumber:
            nextMeta.officeNumber,
          assignedDate:
            primary?.assignedDate || "",
          deviceNote:
            primary?.note || "",
          updatedAt:
            nextMeta.updatedAt,
          updatedAtServer:
            serverTimestamp(),
        },
        { merge: true }
      );

      await onSaveAccount(update);
      setMetaMap((current) => ({
        ...current,
        [user.normalizedUsername]:
          nextMeta,
      }));
      setEditing(false);
      setAccountDraft(null);
      setToast(
        "บันทึกข้อมูลและเพิ่มประวัติการแก้ไขแล้ว"
      );
      onStatusViewChange(
        nextStatus === "Suspended"
          ? "suspended"
          : "active"
      );
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : "บันทึกข้อมูลไม่สำเร็จ"
      );
    } finally {
      setSaving(false);
    }
  };

  const copyContact = async () => {
    if (!user) return;
    const primary = savedMeta.devices.find((device) => device.isPrimary) || savedMeta.devices[0];
    const text = [
      user.displayName,
      savedMeta.officeNumber ? `เบอร์สำนักงาน: ${savedMeta.officeNumber}` : "",
      savedMeta.extension ? `เบอร์ต่อ: ${savedMeta.extension}` : "",
      primary?.workSim ? `Work SIM: ${primary.workSim}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    if (!text) {
      setToast("ยังไม่มีข้อมูลติดต่อให้คัดลอก");
      return;
    }
    await navigator.clipboard?.writeText(text);
    setToast("คัดลอกข้อมูลติดต่อแล้ว");
  };

  const exportUserPdf = (kind: "profile" | "suspension" | "offboarding") => {
    if (!user) return;
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    registerTHSarabunNew(pdf);
    let y = 18;
    const add = (label: string, value: string) => {
      const cleanedValue = String(value || "").trim();
      if (!cleanedValue || cleanedValue === "-") return;
      const lines = pdf.splitTextToSize(`${label}: ${cleanedValue}`, 175) as string[];
      if (y + lines.length * 6 > 280) {
        pdf.addPage();
        y = 18;
      }
      pdf.setFont("THSarabunNew", "normal");
      pdf.setFontSize(12);
      pdf.text(lines, 15, y);
      y += Math.max(6, lines.length * 6);
    };
    const section = (title: string) => {
      if (y > 270) {
        pdf.addPage();
        y = 18;
      }
      pdf.setFont("THSarabunNew", "bold");
      pdf.setFontSize(15);
      pdf.text(title, 15, y);
      y += 8;
    };

    pdf.setFont("THSarabunNew", "bold");
    pdf.setFontSize(20);
    pdf.text(
      kind === "profile"
        ? "Corporate User Profile"
        : kind === "suspension"
          ? "Suspended Account Report"
          : "Offboarding & Device Return Form",
      15,
      y
    );
    y += 10;
    add("User", user.displayName);
    add("ชื่อเล่น", savedMeta.preferredName);
    add("Username", user.username);

    if (kind === "profile") {
      section("Account & Contact");
      add("Email", user.email || "-");
      add("Role", user.effectiveRole);
      add("Team", user.teamName || "-");
      add("Office Number", savedMeta.officeNumber);
      add("Extension", savedMeta.extension);
    }

    if (kind !== "offboarding") {
      section("Account Lifecycle");
      add("Status", lifecycleLabel(savedMeta.lifecycleMode, user.status));
      add("Effective Date", thaiDate(savedMeta.effectiveDate));
      add("End Date", thaiDate(savedMeta.endDate));
      add("Reason", savedMeta.suspendReason);
      add("Approver", savedMeta.approver);
    }

    section(`Devices (${savedMeta.devices.length})`);
    savedMeta.devices.forEach((device, index) => {
      add(
        `Device ${index + 1}`,
        [device.brand, device.model, device.assetId, returnLabel(device.returnStatus), conditionLabel(device.condition)]
          .filter(Boolean)
          .join(" · ")
      );
    });

    pdf.save(`${user.username}-${kind}-${todayBangkok()}.pdf`);
    setPdfOpen(false);
    setToast("สร้างเอกสาร PDF แล้ว");
  };

  const accountOptions = roles.map((role) => ({ value: role, label: role }));
  const teamOptions = [
    { value: "", label: "ยังไม่ระบุทีม" },
    ...teams.filter((team) => team !== "Unassigned Team").map((team) => ({ value: team, label: team })),
  ];

  return (
    <div
      data-corporate-user-directory-v65="true"
      data-unsaved-changes={editing ? "true" : "false"}
      className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(58,34,111,0.09)]"
    >
      {toast ? (
        <div className="fixed right-5 top-5 z-[240] rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
          {toast}
        </div>
      ) : null}

      <header className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div data-user-directory-header-copy-v73="true" className="text-[11px] font-medium uppercase tracking-[0.2em] text-violet-700">User Management</div>
          <div className="mt-1 text-2xl font-semibold text-slate-950">User Directory</div>
          <div className="mt-1 text-sm text-slate-500">
            ดูและจัดการโปรไฟล์ผู้ใช้งาน Role ทีม ข้อมูลติดต่อ อุปกรณ์ และสถานะบัญชี
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {canManageUsers ? (
            <button
              type="button"
              title="สร้างบัญชีผู้ใช้งานใหม่"
              onClick={onCreateUser}
              className="rounded-xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-4 py-2.5 text-sm font-medium text-white"
            >
              + เพิ่มผู้ใช้
            </button>
          ) : null}
          <div ref={manageRef} className="relative">
            <button
              type="button"
              title="เปิดเมนูจัดการหลายบัญชีและทีม"
              onClick={() => setManageOpen((current) => !current)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700"
            >
              ⚙ การจัดการ ▾
            </button>
            {manageOpen ? (
              <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                {canManageUsers ? (
                  <button
                    type="button"
                    title="เปิดหน้าจัดการหลายบัญชีสำหรับงาน Bulk"
                    onClick={() => {
                      setManageOpen(false);
                      onEditDirectory();
                    }}
                    className="w-full rounded-xl px-3 py-3 text-left text-sm hover:bg-violet-50"
                  >
                    <b>จัดการหลายบัญชี</b>
                    <span className="mt-1 block text-xs text-slate-500">ใช้เฉพาะงาน Bulk ที่ต้องแก้หลายคนพร้อมกัน</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  title="เปิดมุมมองทีม"
                  onClick={() => {
                    setManageOpen(false);
                    onOpenTeams();
                  }}
                  className="w-full rounded-xl px-3 py-3 text-left text-sm hover:bg-violet-50"
                >
                  <b>มุมมองทีม</b>
                </button>
                {canManageTeams ? (
                  <button
                    type="button"
                    title="เปิดหน้าจัดการทีม"
                    onClick={() => {
                      setManageOpen(false);
                      onManageTeams();
                    }}
                    className="w-full rounded-xl px-3 py-3 text-left text-sm hover:bg-violet-50"
                  >
                    <b>จัดการทีม</b>
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-fit gap-1 rounded-2xl border border-slate-200 bg-white p-1">
          <button
            type="button"
            title="แสดงบัญชี Active รวมบัญชีที่ตั้งเวลาระงับในอนาคต"
            onClick={() => changeView("active")}
            className={`rounded-xl px-4 py-2.5 text-sm font-medium ${
              statusView === "active" ? "bg-violet-700 text-white" : "text-slate-600"
            }`}
          >
            ผู้ใช้งานปัจจุบัน {rows.filter((row) => row.status === "Active").length}
          </button>
          <button
            type="button"
            title="แสดงบัญชีที่ถูกระงับแล้ว"
            onClick={() => changeView("suspended")}
            className={`rounded-xl px-4 py-2.5 text-sm font-medium ${
              statusView === "suspended" ? "bg-rose-600 text-white" : "text-slate-600"
            }`}
          >
            บัญชี Suspended {rows.filter((row) => row.status === "Suspended").length}
          </button>
        </div>
        <div className="text-xs text-slate-500">
          Scheduled Suspend จะอยู่ในผู้ใช้งานปัจจุบันจนถึงวันที่มีผล
        </div>
      </div>

      <div className="grid min-h-[760px] xl:grid-cols-[390px_minmax(0,1fr)]">
        <aside className="border-b border-slate-200 bg-[#fcfcff] xl:border-b-0 xl:border-r">
          <div className="border-b border-slate-200 p-4">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหาชื่อ Username อีเมล หรืออุปกรณ์"
              title="ค้นหาผู้ใช้จากชื่อ Username อีเมล เบอร์สำนักงาน หรือข้อมูลอุปกรณ์"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <select
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
                title="กรองรายชื่อตาม Role"
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs"
              >
                <option value="all">ทุก Role</option>
                {roles.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
              <select
                value={teamFilter}
                onChange={(event) => setTeamFilter(event.target.value)}
                title="กรองรายชื่อตามทีม"
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs"
              >
                <option value="all">ทุกทีม</option>
                {teams.map((team) => (
                  <option key={team} value={team}>{team}</option>
                ))}
              </select>
              <select
                value={deviceFilter}
                onChange={(event) => setDeviceFilter(event.target.value)}
                title="กรองผู้ใช้ตามสถานะอุปกรณ์"
                className="col-span-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs"
              >
                <option value="all">ทุกสถานะอุปกรณ์</option>
                <option value="assigned">มีอุปกรณ์ที่รับมอบหมาย</option>
                <option value="unassigned">ยังไม่มีอุปกรณ์ที่รับมอบหมาย</option>
              </select>
            </div>
          </div>

          <div className="max-h-[680px] space-y-2 overflow-y-auto p-3">
            {filteredRows.map((row) => {
              const rowMeta = hydrated[row.normalizedUsername] || emptyMeta();
              const primary = rowMeta.devices.find((device) => device.isPrimary) || rowMeta.devices[0];
              return (
                <button
                  key={row.username}
                  type="button"
                  title={`เปิดโปรไฟล์ของ ${row.displayName}`}
                  onClick={() => chooseUser(row.normalizedUsername)}
                  className={`w-full rounded-[20px] border p-3 text-left ${
                    selectedUsername === row.normalizedUsername
                      ? "border-violet-300 bg-white shadow-sm"
                      : "border-transparent hover:border-violet-200 hover:bg-white"
                  }`}
                >
                  <div className="flex gap-3">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br text-sm font-semibold text-white ${avatarClass(
                        row.effectiveRole
                      )}`}
                    >
                      {profilePhotos[
                        row.normalizedUsername
                      ] ? (
                        <img
                          src={
                            profilePhotos[
                              row.normalizedUsername
                            ]
                          }
                          alt={`รูปโปรไฟล์ของ ${row.displayName}`}
                          draggable={false}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        initials(row.displayName)
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="truncate text-sm font-semibold text-slate-950">{row.displayName}</div>
                          <div className="text-xs text-slate-500">{row.username}</div>
                        </div>
                        <span className={`rounded-full px-2 py-1 text-[10px] ${lifecycleClass(rowMeta.lifecycleMode, row.status)}`}>
                          {lifecycleLabel(rowMeta.lifecycleMode, row.status)}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] text-violet-700">{row.effectiveRole}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-600">{row.teamName || "ยังไม่ระบุทีม"}</span>
                      </div>
                      <div className="mt-2 text-[11px] text-slate-500">
                        ▣ {rowMeta.devices.length} เครื่อง
                        {primary ? ` · ${[primary.brand, primary.model].filter(Boolean).join(" ") || "ยังไม่ระบุรุ่น"}` : ""}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="min-w-0 bg-gradient-to-b from-white to-slate-50">
          {user && account ? (
            <>
              <div className="border-b border-slate-200 bg-white p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[22px] bg-gradient-to-br text-xl font-semibold text-white ${avatarClass(
                        account.role
                      )}`}
                    >
                      {profilePhotos[
                        user.normalizedUsername
                      ] ? (
                        <img
                          src={
                            profilePhotos[
                              user.normalizedUsername
                            ]
                          }
                          alt={`รูปโปรไฟล์ของ ${account.displayName}`}
                          draggable={false}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        initials(account.displayName)
                      )}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-2xl font-semibold text-slate-950">{account.displayName}</h2>
                        <span className={`rounded-full px-2.5 py-1 text-xs ${lifecycleClass(meta.lifecycleMode, account.status)}`}>
                          {lifecycleLabel(meta.lifecycleMode, account.status)}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-slate-500">
                        {account.username} · {account.role} · {account.teamName || "ยังไม่ระบุทีม"}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      title="คัดลอกเบอร์สำนักงาน เบอร์ต่อ และ Work SIM ของอุปกรณ์หลัก"
                      onClick={() => void copyContact()}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600"
                    >
                      ⧉ คัดลอกข้อมูลติดต่อ
                    </button>
                    <div ref={pdfRef} className="relative">
                      <button
                        type="button"
                        title="เลือกประเภทเอกสาร PDF ที่ต้องการส่งออก"
                        onClick={() => setPdfOpen((current) => !current)}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600"
                      >
                        ⇩ ส่งออกเอกสาร ▾
                      </button>
                      {pdfOpen ? (
                        <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-80 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                          <button
                            type="button"
                            title="สร้าง PDF โปรไฟล์ผู้ใช้"
                            onClick={() => exportUserPdf("profile")}
                            className="w-full rounded-xl px-3 py-3 text-left hover:bg-violet-50"
                          >
                            <b>User Profile PDF</b>
                            <span className="mt-1 block text-xs text-slate-500">บัญชี เบอร์สำนักงาน อุปกรณ์ และสถานะ</span>
                          </button>
                          <button
                            type="button"
                            title="สร้างรายงาน Suspended"
                            onClick={() => exportUserPdf("suspension")}
                            className="w-full rounded-xl px-3 py-3 text-left hover:bg-violet-50"
                          >
                            <b>Suspended Account Report</b>
                            <span className="mt-1 block text-xs text-slate-500">เหตุผล วันที่มีผล วันที่เปิดกลับ และผู้อนุมัติ</span>
                          </button>
                          <button
                            type="button"
                            title="สร้างแบบฟอร์ม Offboarding และส่งคืนอุปกรณ์"
                            onClick={() => exportUserPdf("offboarding")}
                            className="w-full rounded-xl px-3 py-3 text-left hover:bg-violet-50"
                          >
                            <b>Offboarding & Device Return</b>
                            <span className="mt-1 block text-xs text-slate-500">อุปกรณ์ทุกเครื่อง สถานะคืน สภาพ และผู้รับคืน</span>
                          </button>
                          <button
                            type="button"
                            title="ส่งออก Directory ตาม Tab และตัวกรองปัจจุบัน"
                            onClick={() => {
                              setPdfOpen(false);
                              onExportPdf();
                            }}
                            className="w-full rounded-xl px-3 py-3 text-left hover:bg-violet-50"
                          >
                            <b>Directory Current View</b>
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {canManageUsers && !editing ? (
                      <button
                        type="button"
                        title="แก้ไขข้อมูล Profile และบันทึกประวัติการเปลี่ยนแปลง"
                        onClick={beginEdit}
                        className="rounded-xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-4 py-2.5 text-sm font-medium text-white"
                      >
                        ✎ แก้ไขโปรไฟล์
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {[
                    ["profile-account", "ข้อมูลบัญชี"],
                    ...(editing || contactHasData
                      ? [["profile-contact", "เบอร์สำนักงาน"]]
                      : []),
                    ...(editing || meta.devices.length
                      ? [["profile-devices", "อุปกรณ์"]]
                      : []),
                    ["profile-lifecycle", "กำหนดระงับบัญชี"],
                    ...(editing || offboardingStarted
                      ? [["profile-offboarding", "Offboarding"]]
                      : []),
                    ...(meta.history.length
                      ? [["profile-history", "ประวัติ"]]
                      : []),
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      title={`เลื่อนไปยังส่วน${label}`}
                      onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" })}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600"
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {editing ? (
                  <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
                    กำลังแก้ไข Profile ระบบจะซ่อนข้อมูลว่างในโหมดดู และบันทึกทุกการเปลี่ยนแปลงลงประวัติ
                  </div>
                ) : null}
              </div>

              <div className="space-y-4 p-5 pb-28">
                <Section id="profile-account" icon="◎" title="Account Information" subtitle="ข้อมูลบัญชี Role ทีม และสิทธิ์">
                  <div className="grid gap-x-6 xl:grid-cols-2">
                    <Field label="ชื่อ–นามสกุล" value={account.displayName} editing={editing} onChange={(value) => updateAccount("displayName", value)} />
                    <Field
                      label="ชื่อเล่น"
                      value={meta.preferredName}
                      editing={editing}
                      onChange={(value) =>
                        updateMeta("preferredName", value)
                      }
                      placeholder="กรอกชื่อเล่นภาษาอังกฤษ"
                    />
                    <Field label="Username" value={account.username} editing={false} />
                    <Field label="อีเมลสำหรับงาน" value={account.email} editing={editing} onChange={(value) => updateAccount("email", value)} />
                    <Field label="รหัสพนักงาน" value={meta.employeeId} editing={editing} onChange={(value) => updateMeta("employeeId", value)} />
                    <Field label="Role" value={account.role} editing={editing} onChange={(value) => updateAccount("role", value)} options={accountOptions} />
                    <Field label="ทีม" value={account.teamName} editing={editing} onChange={(value) => updateAccount("teamName", value)} options={teamOptions} />
                    <Field label="หัวหน้าทีม" value={account.teamLead} editing={editing} onChange={(value) => updateAccount("teamLead", value)} />
                    <Field label="สถานะรหัสผ่าน" value="ตั้งค่าแล้ว" editing={false} />
                    <Field label="สิทธิ์ที่เปิดใช้งาน" value={`${permissionCount} สิทธิ์`} editing={false} />
                    <Field label="อัปเดตรหัสผ่านล่าสุด" value={formatDateTime(savedMeta.passwordIssuedAt)} editing={false} />
                  </div>
                </Section>

                {editing || contactHasData ? (
<Section id="profile-contact" icon="☎" title="Work Contact Information" subtitle="หมายเลขที่สำนักงานจัดให้ใช้โทรออกและประสานงาน">
                  <div className="grid gap-x-6 xl:grid-cols-2">
                    <Field label="เบอร์โทรศัพท์สำนักงานสำหรับโทรออก" value={meta.officeNumber} editing={editing} onChange={(value) => updateMeta("officeNumber", value)} />
                    <Field label="เบอร์ต่อภายใน" value={meta.extension} editing={editing} onChange={(value) => updateMeta("extension", value)} />
                    <Field label="หมายเลขสำนักงานสำรอง" value={meta.backupOfficeNumber} editing={editing} onChange={(value) => updateMeta("backupOfficeNumber", value)} />
                    <Field label="วัตถุประสงค์การใช้งาน" value={meta.officeUsage} editing={editing} onChange={(value) => updateMeta("officeUsage", value)} />
                    <Field label="หมายเหตุ" value={meta.contactNote} editing={editing} onChange={(value) => updateMeta("contactNote", value)} textarea />
                  </div>
                </Section>

                                ) : null}

                {editing || meta.devices.length > 0 ? (
<Section
                  id="profile-devices"
                  icon="▣"
                  title="อุปกรณ์ที่กำลังใช้งาน"
                  subtitle="User Active จะแสดงอุปกรณ์เป็นกำลังใช้งาน และติดตามการคืนเมื่อเริ่ม Offboarding"
                  action={
                    editing ? (
                      <button
                        type="button"
                        title="เพิ่มอุปกรณ์เครื่องใหม่ในโปรไฟล์"
                        onClick={addDevice}
                        className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-medium text-white"
                      >
                        + เพิ่มอุปกรณ์
                      </button>
                    ) : null
                  }
                >
                  {meta.devices.length ? (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                        {meta.devices.map((device, index) => (
                          <button
                            key={device.id}
                            type="button"
                            title={`เปิดข้อมูลอุปกรณ์เครื่องที่ ${index + 1}`}
                            onClick={() => setSelectedDeviceId(device.id)}
                            className={`rounded-[18px] border p-4 text-left ${
                              selectedDevice?.id === device.id
                                ? "border-violet-300 bg-violet-50"
                                : "border-slate-200 bg-white"
                            }`}
                          >
                            <div className="flex justify-between gap-2">
                              <div>
                                <div className="text-xs text-violet-700">อุปกรณ์เครื่องที่ {index + 1}</div>
                                <div className="mt-1 font-semibold">
                                  {[device.brand, device.model].filter(Boolean).join(" ") ||
                                    (device.workSim
                                      ? `Work SIM ${device.workSim}`
                                      : `อุปกรณ์เครื่องที่ ${index + 1}`)}
                                </div>
                              </div>
                              {device.isPrimary ? (
                                <span className="h-fit rounded-full bg-violet-100 px-2 py-1 text-[10px] text-violet-700">เครื่องหลัก</span>
                              ) : null}
                            </div>
                            <div className="mt-2 text-xs text-slate-500">
                              {[
                                statusLabel(
                                  effectiveDeviceStatus(device)
                                ),
                                device.assetId
                                  ? `Asset ${device.assetId}`
                                  : "",
                                device.workSim
                                  ? `Work SIM ${device.workSim}`
                                  : "",
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          </button>
                        ))}
                      </div>

                      {selectedDevice ? (
                        <div className="mt-4 rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                          {editing ? (
                            <div className="mb-3 flex justify-end gap-2">
                              {!selectedDevice.isPrimary ? (
                                <button
                                  type="button"
                                  title="ตั้งอุปกรณ์เครื่องนี้เป็นเครื่องหลัก"
                                  onClick={() => makePrimary(selectedDevice.id)}
                                  className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs text-violet-700"
                                >
                                  ตั้งเป็นเครื่องหลัก
                                </button>
                              ) : null}
                              <button
                                type="button"
                                title="ลบอุปกรณ์เครื่องนี้ออกจากโปรไฟล์"
                                onClick={() => removeDevice(selectedDevice.id)}
                                className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs text-rose-600"
                              >
                                ลบอุปกรณ์
                              </button>
                            </div>
                          ) : null}

                          <div className="grid gap-x-6 xl:grid-cols-2">
                            <Field
                              label="สถานะอุปกรณ์"
                              value={
                                editing
                                  ? selectedDevice.status
                                  : effectiveDeviceStatus(
                                      selectedDevice
                                    )
                              }
                              editing={editing}
                              onChange={(value) => updateDevice(selectedDevice.id, "status", value as DeviceStatus)}
                              options={[
                                { value: "Not Assigned", label: "ยังไม่มีอุปกรณ์" },
                                { value: "Assigned", label: "รับอุปกรณ์แล้ว" },
                                { value: "Repair", label: "อยู่ระหว่างซ่อม" },
                                { value: "Returned", label: "คืนอุปกรณ์แล้ว" },
                              ]}
                            />
                            {[
                              ["ยี่ห้อ", "brand"],
                              ["รุ่น / Model", "model"],
                              ["Series", "series"],
                              ["ระบบปฏิบัติการ", "os"],
                              ["Asset ID / เลขทรัพย์สิน", "assetId"],
                              ["Serial Number", "serialNumber"],
                              ["IMEI", "imei"],
                              ["IMEI 2", "imei2"],
                              ["หมายเลข Work SIM", "workSim"],
                              ["แพ็กเกจ / โปรโมชัน Work SIM", "simPackage"],
                              ["วันที่มอบหมายอุปกรณ์", "assignedDate"],
                            ].map(([label, key]) => (
                              <Field
                                key={key}
                                label={label}
                                value={String(selectedDevice[key as keyof WorkDevice] || "")}
                                editing={editing}
                                onChange={(value) => updateDevice(selectedDevice.id, key as keyof WorkDevice, value)}
                                type={key === "assignedDate" ? "date" : "text"}
                              />
                            ))}
                            <Field
                              label="หมายเหตุอุปกรณ์"
                              value={selectedDevice.note}
                              editing={editing}
                              onChange={(value) => updateDevice(selectedDevice.id, "note", value)}
                              textarea
                            />
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="rounded-[20px] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
                      ยังไม่มีอุปกรณ์ กด “แก้ไขโปรไฟล์” แล้วเลือก “+ เพิ่มอุปกรณ์”
                    </div>
                  )}
                </Section>

                                ) : null}

                                <Section
                  id="profile-lifecycle"
                  icon="◷"
                  title="กำหนดวันระงับบัญชี"
                  subtitle="ระบุวันที่มีผลและเหตุผล ระบบจะคำนวณสถานะบัญชีให้อัตโนมัติ"
                  action={
                    editing &&
                    suspensionConfigured ? (
                      <button
                        type="button"
                        onClick={clearSuspension}
                        className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-600"
                      >
                        ยกเลิกกำหนดการ
                      </button>
                    ) : undefined
                  }
                >
                  <div
                    data-profile-lifecycle-audit-v77="true"
                    className={`rounded-[18px] border px-4 py-3 ${
                      account.status ===
                      "Suspended"
                        ? "border-rose-200 bg-rose-50"
                        : meta.effectiveDate
                          ? "border-amber-200 bg-amber-50"
                          : "border-emerald-200 bg-emerald-50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                          account.status ===
                          "Suspended"
                            ? "bg-rose-500"
                            : meta.effectiveDate
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                        }`}
                      />
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {account.status ===
                          "Suspended"
                            ? "บัญชีถูกระงับ"
                            : meta.effectiveDate
                              ? "บัญชียัง Active จนถึงวันที่กำหนด"
                              : "บัญชียัง Active"}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {meta.effectiveDate
                            ? `วันที่มีผล ${thaiDate(
                                meta.effectiveDate
                              )}`
                            : "ยังไม่ได้กำหนดวันระงับบัญชี"}
                        </div>
                      </div>
                    </div>
                  </div>

                  {editing ? (
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="block">
                        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-violet-700">
                          วันที่มีผล
                        </span>
                        <input
                          type="date"
                          value={
                            meta.effectiveDate
                          }
                          onChange={(event) =>
                            updateMeta(
                              "effectiveDate",
                              event.target.value
                            )
                          }
                          className="mt-2 w-full rounded-xl border border-violet-200 bg-white px-3 py-3 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                        />
                      </label>

                      <label className="block">
                        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-violet-700">
                          เหตุผลการระงับ
                        </span>
                        <input
                          list="profile-suspension-reasons-v77"
                          value={
                            meta.suspendReason
                          }
                          onChange={(event) =>
                            updateMeta(
                              "suspendReason",
                              event.target.value
                            )
                          }
                          placeholder="เลือกหรือพิมพ์เหตุผล"
                          className="mt-2 w-full rounded-xl border border-violet-200 bg-white px-3 py-3 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                        />
                        <datalist id="profile-suspension-reasons-v77">
                          <option value="สิ้นสุดการปฏิบัติงาน" />
                          <option value="สิ้นสุดสัญญาจ้าง" />
                          <option value="พักงานชั่วคราว" />
                          <option value="ตรวจสอบสิทธิ์บัญชี" />
                          <option value="ย้ายหน้าที่" />
                        </datalist>
                      </label>
                    </div>
                  ) : suspensionConfigured ? (
                    <div className="mt-4 grid gap-x-6 md:grid-cols-2">
                      <Field
                        label="วันที่มีผล"
                        value={
                          meta.effectiveDate
                        }
                        editing={false}
                        type="date"
                      />
                      <Field
                        label="เหตุผลการระงับ"
                        value={
                          meta.suspendReason
                        }
                        editing={false}
                      />
                    </div>
                  ) : null}
                </Section>

                {(editing ||
                  offboardingStarted) ? (
                  <Section
                    id="profile-offboarding"
                    icon="↩"
                    title="Offboarding & Device Return"
                    subtitle="เริ่มกระบวนการเมื่อต้องสิ้นสุดการทำงานและติดตามการคืนอุปกรณ์"
                    action={
                      editing ? (
                        offboardingStarted ? (
                          <button
                            type="button"
                            onClick={
                              cancelOffboarding
                            }
                            className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-600"
                          >
                            ยกเลิก Offboarding
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={
                              startOffboarding
                            }
                            className="rounded-xl bg-violet-700 px-3 py-2 text-xs font-medium text-white"
                          >
                            เริ่ม Offboarding
                          </button>
                        )
                      ) : undefined
                    }
                  >
                    {!offboardingStarted ? (
                      <div className="rounded-[18px] border border-dashed border-slate-300 bg-slate-50 px-5 py-9 text-center">
                        <div className="text-sm font-medium text-slate-700">
                          ยังไม่ได้เริ่มกระบวนการ Offboarding
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          User ยังทำงานอยู่ จึงไม่มีสถานะรอดำเนินการคืนอุปกรณ์
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="grid gap-x-6 xl:grid-cols-2">
                          <Field
                            label="สถานะ Offboarding"
                            value={
                              meta.offboardingStatus
                            }
                            editing={editing}
                            onChange={(value) =>
                              updateMeta(
                                "offboardingStatus",
                                value as UserMeta["offboardingStatus"]
                              )
                            }
                            options={[
                              {
                                value:
                                  "In Progress",
                                label:
                                  "อยู่ระหว่าง Offboarding",
                              },
                              {
                                value:
                                  "Completed",
                                label:
                                  "สิ้นสุดงานแล้ว",
                              },
                            ]}
                          />
                          <Field
                            label="วันที่สิ้นสุดงาน"
                            value={
                              meta.employmentEndDate
                            }
                            editing={editing}
                            onChange={(value) =>
                              updateMeta(
                                "employmentEndDate",
                                value
                              )
                            }
                            type="date"
                          />
                          <Field
                            label="หมายเหตุ Offboarding"
                            value={
                              meta.offboardingNote
                            }
                            editing={editing}
                            onChange={(value) =>
                              updateMeta(
                                "offboardingNote",
                                value
                              )
                            }
                            textarea
                          />
                        </div>

                        <div className="mt-5 space-y-4">
                          {meta.devices.map(
                            (device, index) => (
                              <div
                                key={device.id}
                                className="rounded-[20px] border border-amber-200 bg-amber-50/60 p-4"
                              >
                                <div className="mb-3 flex flex-col gap-2 border-b border-amber-200 pb-3 sm:flex-row sm:items-start sm:justify-between">
                                  <div>
                                    <div className="text-sm font-semibold">
                                      อุปกรณ์เครื่องที่{" "}
                                      {index + 1}
                                      {[
                                        device.brand,
                                        device.model,
                                      ]
                                        .filter(
                                          Boolean
                                        )
                                        .join(" ")
                                        ? `: ${[
                                            device.brand,
                                            device.model,
                                          ]
                                            .filter(
                                              Boolean
                                            )
                                            .join(" ")}`
                                        : ""}
                                    </div>
                                    <div className="mt-1 text-xs text-slate-500">
                                      {[
                                        device.assetId
                                          ? `Asset ID ${device.assetId}`
                                          : "",
                                        device.workSim
                                          ? `Work SIM ${device.workSim}`
                                          : "",
                                      ]
                                        .filter(
                                          Boolean
                                        )
                                        .join(" · ")}
                                    </div>
                                  </div>
                                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-700">
                                    {returnLabel(
                                      device.returnStatus
                                    )}
                                  </span>
                                </div>

                                <div className="grid gap-x-6 xl:grid-cols-2">
                                  <Field
                                    label="สถานะการคืน"
                                    value={
                                      device.returnStatus
                                    }
                                    editing={
                                      editing
                                    }
                                    onChange={(value) =>
                                      updateDevice(
                                        device.id,
                                        "returnStatus",
                                        value as ReturnStatus
                                      )
                                    }
                                    options={[
                                      {
                                        value:
                                          "Pending",
                                        label:
                                          "รอดำเนินการคืน",
                                      },
                                      {
                                        value:
                                          "Scheduled",
                                        label:
                                          "นัดหมายคืนแล้ว",
                                      },
                                      {
                                        value:
                                          "Complete",
                                        label:
                                          "คืนครบแล้ว",
                                      },
                                      {
                                        value:
                                          "Incomplete",
                                        label:
                                          "คืนไม่ครบ",
                                      },
                                      {
                                        value:
                                          "Lost",
                                        label:
                                          "อุปกรณ์สูญหาย",
                                      },
                                    ]}
                                  />
                                  <Field
                                    label="วันที่คืน"
                                    value={
                                      device.returnDate
                                    }
                                    editing={
                                      editing
                                    }
                                    onChange={(value) =>
                                      updateDevice(
                                        device.id,
                                        "returnDate",
                                        value
                                      )
                                    }
                                    type="date"
                                  />
                                  <Field
                                    label="ผู้ส่งคืน"
                                    value={
                                      device.returnedBy
                                    }
                                    editing={
                                      editing
                                    }
                                    onChange={(value) =>
                                      updateDevice(
                                        device.id,
                                        "returnedBy",
                                        value
                                      )
                                    }
                                  />
                                  <Field
                                    label="ผู้รับคืน"
                                    value={
                                      device.receivedBy
                                    }
                                    editing={
                                      editing
                                    }
                                    onChange={(value) =>
                                      updateDevice(
                                        device.id,
                                        "receivedBy",
                                        value
                                      )
                                    }
                                  />
                                  <Field
                                    label="สภาพอุปกรณ์"
                                    value={
                                      device.condition
                                    }
                                    editing={
                                      editing
                                    }
                                    onChange={(value) =>
                                      updateDevice(
                                        device.id,
                                        "condition",
                                        value as DeviceCondition
                                      )
                                    }
                                    options={[
                                      {
                                        value:
                                          "Not Checked",
                                        label:
                                          "ยังไม่ได้ตรวจสอบ",
                                      },
                                      {
                                        value:
                                          "Normal",
                                        label:
                                          "ปกติ",
                                      },
                                      {
                                        value:
                                          "Used",
                                        label:
                                          "มีรอยใช้งาน",
                                      },
                                      {
                                        value:
                                          "Damaged",
                                        label:
                                          "ชำรุด",
                                      },
                                      {
                                        value:
                                          "Repair Required",
                                        label:
                                          "ต้องส่งซ่อม",
                                      },
                                    ]}
                                  />
                                  <Field
                                    label="หมายเหตุการส่งคืน"
                                    value={
                                      device.returnNote
                                    }
                                    editing={
                                      editing
                                    }
                                    onChange={(value) =>
                                      updateDevice(
                                        device.id,
                                        "returnNote",
                                        value
                                      )
                                    }
                                    textarea
                                  />
                                </div>

                                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                  {[
                                    [
                                      "device",
                                      "ตัวเครื่อง",
                                    ],
                                    [
                                      "workSim",
                                      "Work SIM",
                                    ],
                                    [
                                      "cable",
                                      "สายชาร์จ",
                                    ],
                                    [
                                      "adapter",
                                      "หัวชาร์จ",
                                    ],
                                    [
                                      "accessories",
                                      "เคส / อุปกรณ์เสริม",
                                    ],
                                    [
                                      "companyDataWiped",
                                      "ล้างข้อมูลบริษัทแล้ว",
                                    ],
                                  ].map(
                                    ([
                                      key,
                                      label,
                                    ]) => (
                                      <label
                                        key={
                                          key
                                        }
                                        className="flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-xs"
                                      >
                                        <input
                                          type="checkbox"
                                          disabled={
                                            !editing
                                          }
                                          checked={
                                            device
                                              .returnedItems[
                                              key
                                            ] ===
                                            true
                                          }
                                          onChange={(
                                            event
                                          ) =>
                                            updateDevice(
                                              device.id,
                                              "returnedItems",
                                              {
                                                ...device.returnedItems,
                                                [key]:
                                                  event
                                                    .target
                                                    .checked,
                                              }
                                            )
                                          }
                                          className="accent-violet-600"
                                        />
                                        {label}
                                      </label>
                                    )
                                  )}
                                </div>
                              </div>
                            )
                          )}

                          {!meta.devices.length ? (
                            <div className="rounded-[18px] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
                              ไม่มีอุปกรณ์ที่ต้องติดตามการคืน
                            </div>
                          ) : null}
                        </div>
                      </>
                    )}
                  </Section>
                ) : null}

                {meta.history.length ? (
                  <Section
                    id="profile-history"
                    icon="◔"
                    title="Account & Device History"
                    subtitle="Stamp วัน เวลา ผู้ดำเนินการ และค่าที่เปลี่ยนล่าสุด"
                  >
                    <div className="relative ml-1 border-l-2 border-violet-100 pl-5">
                      {meta.history.map(
                        (item) => (
                          <div
                            key={item.id}
                            className="relative pb-6 last:pb-0"
                          >
                            <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full bg-violet-600 ring-4 ring-violet-50" />

                            <div className="text-[10px] font-medium text-violet-600">
                              {formatDateTime(
                                item.createdAt
                              )}
                            </div>
                            <div className="mt-1 text-sm font-semibold text-slate-900">
                              {item.title}
                            </div>
                            <div className="mt-1 text-[11px] text-slate-500">
                              ดำเนินการโดย{" "}
                              {item.updatedBy ||
                                "System"}
                            </div>

                            {item.changes?.length ? (
                              <div className="mt-3 overflow-hidden rounded-[15px] border border-slate-200 bg-slate-50">
                                {item.changes.map(
                                  (
                                    change,
                                    index
                                  ) => (
                                    <div
                                      key={`${item.id}-${change.field}-${index}`}
                                      className="grid gap-2 border-b border-slate-200 px-3 py-2.5 last:border-0 md:grid-cols-[150px_minmax(0,1fr)]"
                                    >
                                      <span className="text-[10px] text-slate-500">
                                        {
                                          change.field
                                        }
                                      </span>
                                      <div className="flex flex-wrap items-center gap-2 text-[10px]">
                                        <span className="rounded-lg bg-white px-2 py-1 text-slate-500">
                                          {
                                            change.before
                                          }
                                        </span>
                                        <span className="text-violet-500">
                                          →
                                        </span>
                                        <b className="rounded-lg bg-violet-50 px-2 py-1 font-medium text-violet-700">
                                          {
                                            change.after
                                          }
                                        </b>
                                      </div>
                                    </div>
                                  )
                                )}
                              </div>
                            ) : item.detail ? (
                              <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                                {item.detail}
                              </div>
                            ) : null}
                          </div>
                        )
                      )}
                    </div>
                  </Section>
                ) : null}
              </div>

              {editing ? (
                <div className="fixed bottom-4 left-1/2 z-[220] flex w-[min(1050px,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-3 rounded-[20px] border border-violet-200 bg-white/95 px-4 py-3 shadow-[0_20px_55px_rgba(70,42,130,0.20)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm font-medium text-violet-800">มีข้อมูลในโปรไฟล์ที่ยังไม่ได้บันทึก</div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      title="ยกเลิกการแก้ไขทั้งหมด"
                      disabled={saving}
                      onClick={() => {
                        setEditing(false);
                        setAccountDraft(null);
                        setToast("ยกเลิกการแก้ไขแล้ว");
                      }}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      title="บันทึกข้อมูล Profile และเพิ่ม Audit History"
                      disabled={saving}
                      onClick={() => void save()}
                      className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {saving ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex min-h-[620px] items-center justify-center text-sm text-slate-500">
              ไม่พบผู้ใช้ในมุมมองนี้
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
