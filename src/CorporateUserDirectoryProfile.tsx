import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";

type DirectoryStatusView = "active" | "suspended";

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
  effectiveRole: string;
  normalizedUsername: string;
};

type DeviceStatus =
  | "Assigned"
  | "Not Assigned"
  | "Repair"
  | "Returned";

type UserProfileMeta = {
  docId: string;
  employeeId: string;
  officeContactNumber: string;
  officeExtension: string;
  officeContactUsage: string;
  secondaryOfficeContact: string;
  officeContactNote: string;
  deviceStatus: DeviceStatus;
  deviceBrand: string;
  deviceModel: string;
  deviceSeries: string;
  operatingSystem: string;
  assetId: string;
  serialNumber: string;
  imei: string;
  imei2: string;
  workSimNumber: string;
  assignedDate: string;
  deviceNote: string;
  passwordKind: string;
  passwordIssuedAt: string;
  updatedAt: string;
};

type CorporateUserDirectoryProfileProps = {
  rows: DirectoryUserRow[];
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
};

const EMPTY_META: UserProfileMeta = {
  docId: "",
  employeeId: "",
  officeContactNumber: "",
  officeExtension: "",
  officeContactUsage:
    "ใช้สำหรับโทรออกและติดต่อประสานงานผ่านสำนักงาน",
  secondaryOfficeContact: "",
  officeContactNote: "",
  deviceStatus: "Not Assigned",
  deviceBrand: "",
  deviceModel: "",
  deviceSeries: "",
  operatingSystem: "",
  assetId: "",
  serialNumber: "",
  imei: "",
  imei2: "",
  workSimNumber: "",
  assignedDate: "",
  deviceNote: "",
  passwordKind: "",
  passwordIssuedAt: "",
  updatedAt: "",
};

function normalizeUsername(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function safeDocId(value: unknown) {
  return (
    String(value || "")
      .trim()
      .replace(/\//g, "__")
      .replace(/\s+/g, " ") || "unknown"
  );
}

function initials(value: string) {
  const parts = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "U";

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function avatarClass(role: string) {
  if (role === "Quality Assurance") {
    return "from-fuchsia-500 to-violet-700";
  }
  if (role === "Supervisor") {
    return "from-sky-500 to-blue-700";
  }
  if (role === "Senior") {
    return "from-amber-400 to-orange-600";
  }
  if (role === "Virtual Rider") {
    return "from-emerald-400 to-teal-700";
  }
  return "from-violet-500 to-indigo-700";
}

function formatDateTime(value: string) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function fieldValue(value: string | undefined) {
  return String(value || "").trim() || "-";
}

function profileMetaFromData(
  docId: string,
  data: any
): UserProfileMeta {
  return {
    docId,
    employeeId: String(
      data.employeeId || data.employee_id || ""
    ),
    officeContactNumber: String(
      data.officeContactNumber ||
        data.office_contact_number ||
        ""
    ),
    officeExtension: String(
      data.officeExtension || data.office_extension || ""
    ),
    officeContactUsage: String(
      data.officeContactUsage ||
        data.office_contact_usage ||
        "ใช้สำหรับโทรออกและติดต่อประสานงานผ่านสำนักงาน"
    ),
    secondaryOfficeContact: String(
      data.secondaryOfficeContact ||
        data.secondary_office_contact ||
        ""
    ),
    officeContactNote: String(
      data.officeContactNote ||
        data.office_contact_note ||
        ""
    ),
    deviceStatus:
      data.deviceStatus === "Assigned" ||
      data.deviceStatus === "Repair" ||
      data.deviceStatus === "Returned"
        ? data.deviceStatus
        : "Not Assigned",
    deviceBrand: String(
      data.deviceBrand || data.device_brand || ""
    ),
    deviceModel: String(
      data.deviceModel || data.device_model || ""
    ),
    deviceSeries: String(
      data.deviceSeries || data.device_series || ""
    ),
    operatingSystem: String(
      data.operatingSystem ||
        data.operating_system ||
        ""
    ),
    assetId: String(data.assetId || data.asset_id || ""),
    serialNumber: String(
      data.serialNumber || data.serial_number || ""
    ),
    imei: String(data.imei || ""),
    imei2: String(data.imei2 || data.imei_2 || ""),
    workSimNumber: String(
      data.workSimNumber ||
        data.work_sim_number ||
        ""
    ),
    assignedDate: String(
      data.assignedDate || data.assigned_date || ""
    ),
    deviceNote: String(
      data.deviceNote || data.device_note || ""
    ),
    passwordKind: String(
      data.passwordKind || data.password_kind || ""
    ),
    passwordIssuedAt: String(
      data.passwordIssuedAt ||
        data.password_issued_at ||
        ""
    ),
    updatedAt: String(
      data.updatedAt || data.updated_at || ""
    ),
  };
}

function SectionCard({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-lg text-violet-700">
          {icon}
        </div>
        <div>
          <div className="text-base font-semibold text-slate-950">
            {title}
          </div>
          <div className="mt-1 text-xs leading-5 text-slate-500">
            {subtitle}
          </div>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DisplayRow({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: "green" | "violet" | "amber" | "slate";
}) {
  const badgeClass =
    badge === "green"
      ? "bg-emerald-50 text-emerald-700"
      : badge === "violet"
        ? "bg-violet-50 text-violet-700"
        : badge === "amber"
          ? "bg-amber-50 text-amber-700"
          : "bg-slate-100 text-slate-700";

  return (
    <div className="grid grid-cols-[minmax(150px,0.75fr)_minmax(0,1.25fr)] gap-4 border-b border-slate-100 py-2.5 last:border-0">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="min-w-0 break-words text-sm font-medium text-slate-900">
        {badge ? (
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs ${badgeClass}`}
          >
            {value}
          </span>
        ) : (
          value
        )}
      </div>
    </div>
  );
}

function InlineTextRow({
  label,
  value,
  editing,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(150px,0.75fr)_minmax(0,1.25fr)] gap-4 border-b border-slate-100 py-2.5 last:border-0">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="min-w-0">
        {editing ? (
          <input
            type={type}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            title={`แก้ไข${label}`}
            className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
          />
        ) : (
          <div className="break-words text-sm font-medium text-slate-900">
            {fieldValue(value)}
          </div>
        )}
      </div>
    </div>
  );
}

function DeviceStatusRow({
  value,
  editing,
  onChange,
}: {
  value: DeviceStatus;
  editing: boolean;
  onChange: (value: DeviceStatus) => void;
}) {
  const label =
    value === "Assigned"
      ? "รับอุปกรณ์แล้ว"
      : value === "Repair"
        ? "อยู่ระหว่างซ่อม"
        : value === "Returned"
          ? "คืนอุปกรณ์แล้ว"
          : "ยังไม่มีอุปกรณ์";

  const badge =
    value === "Assigned"
      ? "green"
      : value === "Repair"
        ? "amber"
        : "slate";

  if (!editing) {
    return (
      <DisplayRow
        label="สถานะอุปกรณ์"
        value={label}
        badge={badge}
      />
    );
  }

  return (
    <div className="grid grid-cols-[minmax(150px,0.75fr)_minmax(0,1.25fr)] gap-4 border-b border-slate-100 py-2.5">
      <div className="text-xs text-slate-500">
        สถานะอุปกรณ์
      </div>
      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value as DeviceStatus)
        }
        title="เลือกสถานะปัจจุบันของอุปกรณ์ที่บริษัทมอบหมาย"
        aria-label="สถานะอุปกรณ์"
        className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
      >
        <option value="Not Assigned">
          ยังไม่มีอุปกรณ์
        </option>
        <option value="Assigned">
          รับอุปกรณ์แล้ว
        </option>
        <option value="Repair">
          อยู่ระหว่างซ่อม
        </option>
        <option value="Returned">
          คืนอุปกรณ์แล้ว
        </option>
      </select>
    </div>
  );
}

export default function CorporateUserDirectoryProfile({
  rows,
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
}: CorporateUserDirectoryProfileProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [metaByUsername, setMetaByUsername] = useState<
    Record<string, UserProfileMeta>
  >({});
  const [selectedUsername, setSelectedUsername] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [deviceFilter, setDeviceFilter] = useState("all");
  const [managementOpen, setManagementOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editDraft, setEditDraft] =
    useState<UserProfileMeta>(EMPTY_META);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProfileMetadata() {
      try {
        const snapshot = await getDocs(
          collection(firebaseDb, "qa_user_profiles")
        );
        const next: Record<string, UserProfileMeta> = {};

        snapshot.docs.forEach((item) => {
          const data = item.data() as any;
          const username = normalizeUsername(
            data.username || item.id
          );

          if (!username) return;
          next[username] = profileMetaFromData(item.id, data);
        });

        if (!cancelled) setMetaByUsername(next);
      } catch {
        if (!cancelled) setMetaByUsername({});
      }
    }

    void loadProfileMetadata();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;

    const timer = window.setTimeout(
      () => setToast(""),
      2600
    );

    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setManagementOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );
    };
  }, []);

  const activeCount = rows.filter(
    (row) => row.status === "Active"
  ).length;
  const suspendedCount = rows.filter(
    (row) => row.status === "Suspended"
  ).length;

  const roles = useMemo(
    () =>
      Array.from(
        new Set(rows.map((row) => row.effectiveRole))
      )
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [rows]
  );

  const teams = useMemo(
    () =>
      Array.from(
        new Set(
          rows.map(
            (row) => row.teamName || "Unassigned Team"
          )
        )
      ).sort((a, b) => a.localeCompare(b)),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const expectedStatus =
      statusView === "active" ? "Active" : "Suspended";

    return rows
      .filter((row) => {
        if (row.status !== expectedStatus) return false;

        const meta =
          metaByUsername[row.normalizedUsername] || EMPTY_META;

        const searchable = [
          row.displayName,
          row.username,
          row.agentName,
          row.email,
          row.teamName,
          row.teamLead,
          row.effectiveRole,
          meta.employeeId,
          meta.officeContactNumber,
          meta.officeExtension,
          meta.deviceBrand,
          meta.deviceModel,
          meta.assetId,
          meta.serialNumber,
        ]
          .join(" ")
          .toLowerCase();

        const matchesSearch =
          !keyword || searchable.includes(keyword);
        const matchesRole =
          roleFilter === "all" ||
          row.effectiveRole === roleFilter;
        const matchesTeam =
          teamFilter === "all" ||
          (row.teamName || "Unassigned Team") ===
            teamFilter;
        const matchesDevice =
          deviceFilter === "all" ||
          (deviceFilter === "assigned"
            ? meta.deviceStatus === "Assigned"
            : meta.deviceStatus !== "Assigned");

        return (
          matchesSearch &&
          matchesRole &&
          matchesTeam &&
          matchesDevice
        );
      })
      .sort((a, b) =>
        a.displayName.localeCompare(b.displayName)
      );
  }, [
    deviceFilter,
    metaByUsername,
    roleFilter,
    rows,
    search,
    statusView,
    teamFilter,
  ]);

  useEffect(() => {
    if (
      filteredRows.some(
        (row) =>
          row.normalizedUsername === selectedUsername
      )
    ) {
      return;
    }

    setSelectedUsername(
      filteredRows[0]?.normalizedUsername || ""
    );
  }, [filteredRows, selectedUsername]);

  const selectedUser =
    filteredRows.find(
      (row) =>
        row.normalizedUsername === selectedUsername
    ) || null;

  const selectedMeta = selectedUser
    ? metaByUsername[selectedUser.normalizedUsername] ||
      EMPTY_META
    : EMPTY_META;

  const currentMeta = editingProfile
    ? editDraft
    : selectedMeta;

  const permissionCount = selectedUser
    ? Object.values(
        rolePermissions[selectedUser.effectiveRole] || {}
      ).filter(Boolean).length
    : 0;

  const updateDraft = (
    key: keyof UserProfileMeta,
    value: string
  ) => {
    setEditDraft((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const clearFilters = () => {
    setSearch("");
    setRoleFilter("all");
    setTeamFilter("all");
    setDeviceFilter("all");
  };

  const confirmDiscardChanges = () => {
    if (!editingProfile) return true;

    return window.confirm(
      "มีข้อมูลโปรไฟล์ที่ยังไม่ได้บันทึก ต้องการยกเลิกการแก้ไขหรือไม่?"
    );
  };

  const selectStatusView = (
    nextStatus: DirectoryStatusView
  ) => {
    if (
      nextStatus === statusView ||
      !confirmDiscardChanges()
    ) {
      return;
    }

    setEditingProfile(false);
    onStatusViewChange(nextStatus);
  };

  const selectUser = (username: string) => {
    if (
      username === selectedUsername ||
      !confirmDiscardChanges()
    ) {
      return;
    }

    setEditingProfile(false);
    setSelectedUsername(username);
  };

  const beginInlineEdit = () => {
    if (!selectedUser) return;

    setEditDraft({
      ...EMPTY_META,
      ...selectedMeta,
      docId:
        selectedMeta.docId ||
        safeDocId(selectedUser.username),
    });
    setEditingProfile(true);
    setToast(
      "เปิดโหมดแก้ไขบนหน้าเดิมแล้ว"
    );
  };

  const cancelInlineEdit = () => {
    setEditingProfile(false);
    setEditDraft(EMPTY_META);
    setToast("ยกเลิกการแก้ไขแล้ว");
  };

  const saveProfile = async () => {
    if (!selectedUser) return;

    setSaving(true);

    try {
      const docId =
        editDraft.docId ||
        safeDocId(selectedUser.username);

      const nextMeta: UserProfileMeta = {
        ...editDraft,
        docId,
        updatedAt: new Date().toISOString(),
      };

      await setDoc(
        doc(firebaseDb, "qa_user_profiles", docId),
        {
          username: selectedUser.username,
          employeeId: nextMeta.employeeId,
          officeContactNumber:
            nextMeta.officeContactNumber,
          officeExtension: nextMeta.officeExtension,
          officeContactUsage:
            nextMeta.officeContactUsage,
          secondaryOfficeContact:
            nextMeta.secondaryOfficeContact,
          officeContactNote:
            nextMeta.officeContactNote,
          deviceStatus: nextMeta.deviceStatus,
          deviceBrand: nextMeta.deviceBrand,
          deviceModel: nextMeta.deviceModel,
          deviceSeries: nextMeta.deviceSeries,
          operatingSystem:
            nextMeta.operatingSystem,
          assetId: nextMeta.assetId,
          serialNumber: nextMeta.serialNumber,
          imei: nextMeta.imei,
          imei2: nextMeta.imei2,
          workSimNumber: nextMeta.workSimNumber,
          assignedDate: nextMeta.assignedDate,
          deviceNote: nextMeta.deviceNote,
          updatedAt: nextMeta.updatedAt,
          updatedAtServer: serverTimestamp(),
        },
        { merge: true }
      );

      setMetaByUsername((current) => ({
        ...current,
        [selectedUser.normalizedUsername]: nextMeta,
      }));
      setEditingProfile(false);
      setEditDraft(EMPTY_META);
      setToast(
        "บันทึกข้อมูลโปรไฟล์และอุปกรณ์แล้ว"
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
    if (!selectedUser) return;

    const text = [
      selectedUser.displayName,
      selectedMeta.officeContactNumber
        ? `เบอร์สำนักงาน: ${selectedMeta.officeContactNumber}`
        : "",
      selectedMeta.officeExtension
        ? `เบอร์ต่อ: ${selectedMeta.officeExtension}`
        : "",
      selectedMeta.workSimNumber
        ? `Work SIM: ${selectedMeta.workSimNumber}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    if (!text) {
      setToast("ยังไม่มีข้อมูลติดต่อให้คัดลอก");
      return;
    }

    try {
      await navigator.clipboard?.writeText(text);
      setToast("คัดลอกข้อมูลติดต่อแล้ว");
    } catch {
      setToast("ไม่สามารถคัดลอกข้อมูลได้");
    }
  };

  return (
    <div
      data-corporate-user-directory-v63="true"
      data-unsaved-changes={
        editingProfile ? "true" : "false"
      }
      className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(58,34,111,0.09)]"
    >
      {toast ? (
        <div className="fixed right-5 top-5 z-[230] rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
          {toast}
        </div>
      ) : null}

      <header className="flex flex-col gap-4 border-b border-slate-200 bg-white px-5 py-5 lg:flex-row lg:items-start lg:justify-between lg:px-6">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-violet-700">
            Users
          </div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
            Corporate User Directory
          </div>
          <div className="mt-1 text-sm leading-6 text-slate-500">
            โปรไฟล์ผู้ใช้งาน บัญชี สิทธิ์ เบอร์สำนักงาน และอุปกรณ์สำหรับการทำงาน
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManageUsers ? (
            <button
              type="button"
              title="สร้างบัญชีผู้ใช้งานใหม่ พร้อมกำหนด Role ทีม และสถานะบัญชี"
              aria-label="เพิ่มผู้ใช้ใหม่"
              onClick={onCreateUser}
              className="rounded-xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-4 py-2.5 text-sm font-medium text-white shadow-[0_12px_28px_rgba(109,40,217,0.22)] transition hover:opacity-95"
            >
              + เพิ่มผู้ใช้
            </button>
          ) : null}

          <div ref={menuRef} className="relative">
            <button
              type="button"
              title="เปิดเมนูส่งออก PDF แก้ไขข้อมูลหลายบัญชี และจัดการทีม"
              aria-label="เปิดเมนูการจัดการ"
              onClick={() =>
                setManagementOpen((current) => !current)
              }
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
            >
              ⚙ การจัดการ ▾
            </button>

            {managementOpen ? (
              <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
                <button
                  type="button"
                  title="ส่งออกข้อมูล Directory เป็นไฟล์ PDF โดยไม่แสดงรหัสผ่าน"
                  onClick={() => {
                    setManagementOpen(false);
                    onExportPdf();
                  }}
                  className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-violet-50"
                >
                  <span className="text-violet-700">⇩</span>
                  <span>
                    <span className="block text-sm font-medium text-slate-900">
                      ส่งออก PDF
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                      ส่งออกข้อมูลผู้ใช้โดยไม่รวมรหัสผ่าน
                    </span>
                  </span>
                </button>

                {canManageUsers ? (
                  <button
                    type="button"
                    title="เปิดหน้าจอแก้ไขข้อมูลบัญชี Role ทีม และสถานะของผู้ใช้หลายคน"
                    onClick={() => {
                      setManagementOpen(false);
                      onEditDirectory();
                    }}
                    className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-violet-50"
                  >
                    <span className="text-violet-700">✎</span>
                    <span>
                      <span className="block text-sm font-medium text-slate-900">
                        แก้ไขข้อมูลหลายบัญชี
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                        แก้ Role ทีม สถานะ และข้อมูลบัญชีแบบรวม
                      </span>
                    </span>
                  </button>
                ) : null}

                <button
                  type="button"
                  title="เปิดมุมมองสรุปสมาชิกแยกตามทีม"
                  onClick={() => {
                    setManagementOpen(false);
                    onOpenTeams();
                  }}
                  className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-violet-50"
                >
                  <span className="text-violet-700">▦</span>
                  <span>
                    <span className="block text-sm font-medium text-slate-900">
                      มุมมองทีม
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                      ดูสมาชิก หัวหน้าทีม และ Role ของแต่ละทีม
                    </span>
                  </span>
                </button>

                {canManageTeams ? (
                  <button
                    type="button"
                    title="เปิดหน้าจัดการชื่อทีม หัวหน้าทีม และการมอบหมายสมาชิก"
                    onClick={() => {
                      setManagementOpen(false);
                      onManageTeams();
                    }}
                    className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-violet-50"
                  >
                    <span className="text-violet-700">⚙</span>
                    <span>
                      <span className="block text-sm font-medium text-slate-900">
                        จัดการทีม
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                        สร้างทีม แก้หัวหน้าทีม และย้ายสมาชิก
                      </span>
                    </span>
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between lg:px-5">
        <div className="inline-flex w-fit gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            title="แสดงเฉพาะบัญชีผู้ใช้งานที่มีสถานะ Active"
            onClick={() => selectStatusView("active")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
              statusView === "active"
                ? "bg-gradient-to-r from-violet-700 to-fuchsia-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            ผู้ใช้งานปัจจุบัน
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                statusView === "active"
                  ? "bg-white text-slate-950"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {activeCount}
            </span>
          </button>

          <button
            type="button"
            title="แสดงเฉพาะบัญชีที่ถูกระงับการใช้งาน"
            onClick={() => selectStatusView("suspended")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
              statusView === "suspended"
                ? "bg-gradient-to-r from-rose-600 to-pink-500 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            บัญชี Suspended
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                statusView === "suspended"
                  ? "bg-white text-slate-950"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {suspendedCount}
            </span>
          </button>
        </div>

        <div className="text-xs text-slate-500">
          {statusView === "active"
            ? "แสดงเฉพาะผู้ใช้งานที่เข้าใช้ระบบได้"
            : "แยกบัญชีที่ระงับออกจากรายชื่อผู้ใช้งานปัจจุบัน"}
        </div>
      </div>

      <div className="grid min-h-[690px] xl:grid-cols-[390px_minmax(0,1fr)]">
        <aside className="border-b border-slate-200 bg-[#fcfcff] xl:border-b-0 xl:border-r">
          <div className="border-b border-slate-200 p-4">
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                ⌕
              </span>
              <input
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="ค้นหาชื่อ Username อีเมล หรืออุปกรณ์"
                title="ค้นหาผู้ใช้จากชื่อ Username อีเมล เบอร์สำนักงาน หรือข้อมูลอุปกรณ์"
                className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-10 text-sm text-slate-800 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
              />

              {search ? (
                <button
                  type="button"
                  title="ล้างข้อความค้นหา"
                  aria-label="ล้างข้อความค้นหา"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  ✕
                </button>
              ) : null}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <select
                value={roleFilter}
                onChange={(event) =>
                  setRoleFilter(event.target.value)
                }
                title="กรองรายชื่อตาม Role"
                aria-label="กรองรายชื่อตาม Role"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none"
              >
                <option value="all">ทุก Role</option>
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>

              <select
                value={teamFilter}
                onChange={(event) =>
                  setTeamFilter(event.target.value)
                }
                title="กรองรายชื่อตามทีม"
                aria-label="กรองรายชื่อตามทีม"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none"
              >
                <option value="all">ทุกทีม</option>
                {teams.map((team) => (
                  <option key={team} value={team}>
                    {team}
                  </option>
                ))}
              </select>

              <select
                value={deviceFilter}
                onChange={(event) =>
                  setDeviceFilter(event.target.value)
                }
                title="กรองผู้ใช้ตามสถานะการรับอุปกรณ์"
                aria-label="กรองผู้ใช้ตามสถานะการรับอุปกรณ์"
                className="col-span-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none"
              >
                <option value="all">ทุกสถานะอุปกรณ์</option>
                <option value="assigned">
                  รับอุปกรณ์แล้ว
                </option>
                <option value="unassigned">
                  ยังไม่มีอุปกรณ์หรือไม่ได้อยู่ในสถานะ Assigned
                </option>
              </select>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                พบ {filteredRows.length} รายการ
              </div>
              <button
                type="button"
                title="ล้างคำค้นหาและตัวกรองทั้งหมด"
                onClick={clearFilters}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:border-violet-200 hover:text-violet-700"
              >
                ล้างตัวกรอง
              </button>
            </div>
          </div>

          <div className="max-h-[610px] space-y-2 overflow-y-auto p-3">
            {filteredRows.map((row) => {
              const meta =
                metaByUsername[row.normalizedUsername] ||
                EMPTY_META;
              const selected =
                row.normalizedUsername ===
                selectedUsername;

              return (
                <button
                  key={row.username}
                  type="button"
                  title={`เปิดโปรไฟล์ของ ${row.displayName}`}
                  aria-label={`เปิดโปรไฟล์ของ ${row.displayName}`}
                  onClick={() =>
                    selectUser(row.normalizedUsername)
                  }
                  className={`w-full rounded-[20px] border p-3 text-left transition ${
                    selected
                      ? "border-violet-300 bg-white shadow-[0_12px_28px_rgba(109,40,217,0.12)]"
                      : "border-transparent bg-transparent hover:border-violet-200 hover:bg-white"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-sm font-semibold text-white ${avatarClass(
                        row.effectiveRole
                      )}`}
                    >
                      {initials(
                        row.displayName || row.username
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-950">
                            {row.displayName}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-slate-500">
                            {row.username}
                          </div>
                        </div>

                        <span
                          title={
                            row.status === "Active"
                              ? "บัญชีเปิดใช้งาน"
                              : "บัญชีถูกระงับ"
                          }
                          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                            row.status === "Active"
                              ? "bg-emerald-500"
                              : "bg-rose-500"
                          }`}
                        />
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-medium text-violet-700">
                          {row.effectiveRole}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-600">
                          {row.teamName || "ยังไม่ระบุทีม"}
                        </span>
                      </div>

                      <div className="mt-2 grid gap-1 text-[11px] text-slate-500">
                        <div className="truncate">
                          ☎{" "}
                          {meta.officeContactNumber ||
                            "ยังไม่ระบุเบอร์สำนักงาน"}
                        </div>
                        <div className="truncate">
                          ▣{" "}
                          {meta.deviceStatus === "Assigned"
                            ? [
                                meta.deviceBrand,
                                meta.deviceModel,
                              ]
                                .filter(Boolean)
                                .join(" ") ||
                              "รับอุปกรณ์แล้ว"
                            : "ยังไม่ระบุอุปกรณ์"}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 text-right text-xs font-medium text-violet-700">
                    ดูโปรไฟล์ →
                  </div>
                </button>
              );
            })}

            {!filteredRows.length ? (
              <div className="rounded-[20px] border border-dashed border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-500">
                ไม่พบผู้ใช้ที่ตรงกับการค้นหาหรือตัวกรอง
              </div>
            ) : null}
          </div>
        </aside>

        <main className="min-w-0 bg-gradient-to-b from-white to-slate-50/50 p-4 lg:p-5">
          {selectedUser ? (
            <div className="space-y-4">
              {selectedUser.status === "Suspended" ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  บัญชีนี้ถูกระงับการใช้งาน
                  {selectedUser.suspendEffectiveDate
                    ? ` มีผลวันที่ ${selectedUser.suspendEffectiveDate}`
                    : ""}
                  {selectedUser.suspendReason
                    ? ` — ${selectedUser.suspendReason}`
                    : ""}
                </div>
              ) : null}

              <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-center gap-4">
                    <div
                      className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-br text-xl font-semibold text-white shadow-lg ${avatarClass(
                        selectedUser.effectiveRole
                      )}`}
                    >
                      {initials(
                        selectedUser.displayName ||
                          selectedUser.username
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                          {selectedUser.displayName}
                        </h2>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            selectedUser.status === "Active"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-rose-50 text-rose-700"
                          }`}
                        >
                          {selectedUser.status}
                        </span>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                        <span>{selectedUser.username}</span>
                        <span>•</span>
                        <span className="text-violet-700">
                          {selectedUser.effectiveRole}
                        </span>
                        <span>•</span>
                        <span>
                          {selectedUser.teamName ||
                            "ยังไม่ระบุทีม"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      title="คัดลอกเบอร์สำนักงาน เบอร์ต่อ และหมายเลข Work SIM ของผู้ใช้นี้"
                      onClick={() => void copyContact()}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:border-violet-200 hover:text-violet-700"
                    >
                      ⧉ คัดลอกข้อมูลติดต่อ
                    </button>

                    {canManageUsers && !editingProfile ? (
                      <button
                        type="button"
                        title="แก้ไขเบอร์สำนักงานและข้อมูลอุปกรณ์บนหน้าเดิมโดยไม่เปิดหน้าต่างใหม่"
                        onClick={beginInlineEdit}
                        className="rounded-xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-4 py-2.5 text-sm font-medium text-white shadow-[0_12px_28px_rgba(109,40,217,0.22)]"
                      >
                        ✎ แก้ไขโปรไฟล์
                      </button>
                    ) : null}
                  </div>
                </div>

                {editingProfile ? (
                  <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm leading-6 text-violet-800">
                    กำลังแก้ไขข้อมูลบนหน้าเดิม ระบบจะยังไม่เปลี่ยนข้อมูลจนกว่าจะกดบันทึก ส่วน Role ทีม และสถานะบัญชีให้ใช้เมนู “แก้ไขข้อมูลหลายบัญชี”
                  </div>
                ) : null}
              </section>

              <div className="grid gap-4 2xl:grid-cols-2">
                <SectionCard
                  icon="◎"
                  title="Account Information"
                  subtitle="ข้อมูลบัญชีและสถานะการเข้าถึงระบบ"
                >
                  <DisplayRow
                    label="ชื่อ–นามสกุล"
                    value={fieldValue(
                      selectedUser.displayName
                    )}
                  />
                  <DisplayRow
                    label="Username"
                    value={fieldValue(
                      selectedUser.username
                    )}
                  />
                  <DisplayRow
                    label="อีเมลสำหรับงาน"
                    value={fieldValue(selectedUser.email)}
                  />
                  <InlineTextRow
                    label="รหัสพนักงาน"
                    value={currentMeta.employeeId}
                    editing={editingProfile}
                    onChange={(value) =>
                      updateDraft("employeeId", value)
                    }
                  />
                  <DisplayRow
                    label="Role"
                    value={fieldValue(
                      selectedUser.effectiveRole
                    )}
                    badge="violet"
                  />
                  <DisplayRow
                    label="ทีม"
                    value={fieldValue(
                      selectedUser.teamName
                    )}
                  />
                  <DisplayRow
                    label="หัวหน้าทีม"
                    value={fieldValue(
                      selectedUser.teamLead
                    )}
                  />
                  <DisplayRow
                    label="สถานะบัญชี"
                    value={selectedUser.status}
                    badge={
                      selectedUser.status === "Active"
                        ? "green"
                        : "amber"
                    }
                  />
                  <DisplayRow
                    label="สถานะรหัสผ่าน"
                    value="ตั้งค่าแล้ว"
                    badge="green"
                  />
                  <DisplayRow
                    label="อัปเดตรหัสผ่านล่าสุด"
                    value={formatDateTime(
                      selectedMeta.passwordIssuedAt
                    )}
                  />
                </SectionCard>

                <SectionCard
                  icon="☎"
                  title="Work Contact Information"
                  subtitle="หมายเลขที่สำนักงานจัดให้ใช้โทรออกและติดต่อประสานงาน"
                >
                  <InlineTextRow
                    label="เบอร์โทรศัพท์สำนักงานสำหรับโทรออก"
                    value={
                      currentMeta.officeContactNumber
                    }
                    editing={editingProfile}
                    onChange={(value) =>
                      updateDraft(
                        "officeContactNumber",
                        value
                      )
                    }
                    placeholder="เช่น 02-xxx-xxxx"
                  />
                  <InlineTextRow
                    label="เบอร์ต่อภายใน"
                    value={currentMeta.officeExtension}
                    editing={editingProfile}
                    onChange={(value) =>
                      updateDraft(
                        "officeExtension",
                        value
                      )
                    }
                    placeholder="เช่น 1234"
                  />
                  <InlineTextRow
                    label="วัตถุประสงค์การใช้งาน"
                    value={
                      currentMeta.officeContactUsage
                    }
                    editing={editingProfile}
                    onChange={(value) =>
                      updateDraft(
                        "officeContactUsage",
                        value
                      )
                    }
                  />
                  <InlineTextRow
                    label="หมายเลขสำนักงานสำรอง"
                    value={
                      currentMeta.secondaryOfficeContact
                    }
                    editing={editingProfile}
                    onChange={(value) =>
                      updateDraft(
                        "secondaryOfficeContact",
                        value
                      )
                    }
                  />
                  <InlineTextRow
                    label="หมายเหตุ"
                    value={
                      currentMeta.officeContactNote
                    }
                    editing={editingProfile}
                    onChange={(value) =>
                      updateDraft(
                        "officeContactNote",
                        value
                      )
                    }
                  />
                </SectionCard>

                <SectionCard
                  icon="▣"
                  title="Assigned Work Device"
                  subtitle="ข้อมูลอุปกรณ์และเลขประจำเครื่องที่บริษัทมอบหมาย"
                >
                  <DeviceStatusRow
                    value={currentMeta.deviceStatus}
                    editing={editingProfile}
                    onChange={(value) =>
                      updateDraft(
                        "deviceStatus",
                        value
                      )
                    }
                  />
                  <InlineTextRow
                    label="ยี่ห้อ"
                    value={currentMeta.deviceBrand}
                    editing={editingProfile}
                    onChange={(value) =>
                      updateDraft("deviceBrand", value)
                    }
                    placeholder="เช่น Samsung"
                  />
                  <InlineTextRow
                    label="รุ่น / Model"
                    value={currentMeta.deviceModel}
                    editing={editingProfile}
                    onChange={(value) =>
                      updateDraft("deviceModel", value)
                    }
                    placeholder="เช่น Galaxy S23"
                  />
                  <InlineTextRow
                    label="Series"
                    value={currentMeta.deviceSeries}
                    editing={editingProfile}
                    onChange={(value) =>
                      updateDraft("deviceSeries", value)
                    }
                  />
                  <InlineTextRow
                    label="ระบบปฏิบัติการ"
                    value={currentMeta.operatingSystem}
                    editing={editingProfile}
                    onChange={(value) =>
                      updateDraft(
                        "operatingSystem",
                        value
                      )
                    }
                    placeholder="เช่น Android 14"
                  />
                  <InlineTextRow
                    label="Asset ID / เลขทรัพย์สิน"
                    value={currentMeta.assetId}
                    editing={editingProfile}
                    onChange={(value) =>
                      updateDraft("assetId", value)
                    }
                  />
                  <InlineTextRow
                    label="Serial Number"
                    value={currentMeta.serialNumber}
                    editing={editingProfile}
                    onChange={(value) =>
                      updateDraft(
                        "serialNumber",
                        value
                      )
                    }
                  />
                  <InlineTextRow
                    label="IMEI"
                    value={currentMeta.imei}
                    editing={editingProfile}
                    onChange={(value) =>
                      updateDraft("imei", value)
                    }
                  />
                  <InlineTextRow
                    label="IMEI 2"
                    value={currentMeta.imei2}
                    editing={editingProfile}
                    onChange={(value) =>
                      updateDraft("imei2", value)
                    }
                  />
                  <InlineTextRow
                    label="หมายเลข Work SIM"
                    value={currentMeta.workSimNumber}
                    editing={editingProfile}
                    onChange={(value) =>
                      updateDraft(
                        "workSimNumber",
                        value
                      )
                    }
                  />
                  <InlineTextRow
                    label="วันที่มอบหมายอุปกรณ์"
                    value={currentMeta.assignedDate}
                    editing={editingProfile}
                    onChange={(value) =>
                      updateDraft(
                        "assignedDate",
                        value
                      )
                    }
                    type="date"
                  />
                  <InlineTextRow
                    label="หมายเหตุอุปกรณ์"
                    value={currentMeta.deviceNote}
                    editing={editingProfile}
                    onChange={(value) =>
                      updateDraft("deviceNote", value)
                    }
                  />
                </SectionCard>

                <SectionCard
                  icon="◇"
                  title="Access Summary"
                  subtitle="สรุป Role สิทธิ์ และสถานะการ Login"
                >
                  <DisplayRow
                    label="Role"
                    value={fieldValue(
                      selectedUser.effectiveRole
                    )}
                    badge="violet"
                  />
                  <DisplayRow
                    label="สิทธิ์ที่เปิดใช้งาน"
                    value={`${permissionCount} สิทธิ์`}
                  />
                  <DisplayRow
                    label="ขอบเขตทีม"
                    value={fieldValue(
                      selectedUser.teamName || "ตาม Role"
                    )}
                  />
                  <DisplayRow
                    label="สถานะ Login"
                    value={
                      selectedUser.status === "Active"
                        ? "สามารถเข้าสู่ระบบได้"
                        : "ระงับการเข้าสู่ระบบ"
                    }
                    badge={
                      selectedUser.status === "Active"
                        ? "green"
                        : "amber"
                    }
                  />
                  <DisplayRow
                    label="ระดับความปลอดภัย"
                    value="Corporate Standard"
                    badge="slate"
                  />
                  <DisplayRow
                    label="อัปเดตโปรไฟล์ล่าสุด"
                    value={formatDateTime(
                      selectedMeta.updatedAt
                    )}
                  />
                </SectionCard>
              </div>

              {editingProfile ? (
                <div className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-[20px] border border-violet-200 bg-white/95 px-4 py-3 shadow-[0_20px_55px_rgba(70,42,130,0.20)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm font-medium text-violet-800">
                    มีข้อมูลโปรไฟล์ที่ยังไม่ได้บันทึก
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      title="ยกเลิกการแก้ไขและคืนค่าก่อนหน้า"
                      disabled={saving}
                      onClick={cancelInlineEdit}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      title="บันทึกข้อมูลติดต่อสำนักงานและข้อมูลอุปกรณ์ที่แก้ไข"
                      disabled={saving}
                      onClick={() => void saveProfile()}
                      className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {saving
                        ? "กำลังบันทึก..."
                        : "บันทึกการเปลี่ยนแปลง"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex min-h-[560px] items-center justify-center rounded-[22px] border border-dashed border-slate-200 bg-white text-sm text-slate-500">
              ไม่พบผู้ใช้ในมุมมองนี้
            </div>
          )}
        </main>
      </div>
    </div>
  );
}