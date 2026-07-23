import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";

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

type DeviceStatus = "Assigned" | "Not Assigned" | "Repair" | "Returned";

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
  rolePermissions: Record<string, Record<string, boolean>>;
};

const EMPTY_META: UserProfileMeta = {
  docId: "",
  employeeId: "",
  officeContactNumber: "",
  officeExtension: "",
  officeContactUsage: "ใช้สำหรับโทรออกและติดต่อประสานงานผ่านสำนักงาน",
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
  return String(value || "")
    .trim()
    .replace(/\//g, "__")
    .replace(/\s+/g, " ") || "unknown";
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
  if (role === "Quality Assurance") return "from-fuchsia-500 to-violet-700";
  if (role === "Supervisor") return "from-sky-500 to-blue-700";
  if (role === "Senior") return "from-amber-400 to-orange-600";
  if (role === "Virtual Rider") return "from-emerald-400 to-teal-700";
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

function profileMetaFromData(docId: string, data: any): UserProfileMeta {
  return {
    docId,
    employeeId: String(data.employeeId || data.employee_id || ""),
    officeContactNumber: String(
      data.officeContactNumber || data.office_contact_number || ""
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
      data.officeContactNote || data.office_contact_note || ""
    ),
    deviceStatus:
      data.deviceStatus === "Assigned" ||
      data.deviceStatus === "Repair" ||
      data.deviceStatus === "Returned"
        ? data.deviceStatus
        : "Not Assigned",
    deviceBrand: String(data.deviceBrand || data.device_brand || ""),
    deviceModel: String(data.deviceModel || data.device_model || ""),
    deviceSeries: String(data.deviceSeries || data.device_series || ""),
    operatingSystem: String(
      data.operatingSystem || data.operating_system || ""
    ),
    assetId: String(data.assetId || data.asset_id || ""),
    serialNumber: String(data.serialNumber || data.serial_number || ""),
    imei: String(data.imei || ""),
    imei2: String(data.imei2 || data.imei_2 || ""),
    workSimNumber: String(
      data.workSimNumber || data.work_sim_number || ""
    ),
    assignedDate: String(data.assignedDate || data.assigned_date || ""),
    deviceNote: String(data.deviceNote || data.device_note || ""),
    passwordKind: String(data.passwordKind || data.password_kind || ""),
    passwordIssuedAt: String(
      data.passwordIssuedAt || data.password_issued_at || ""
    ),
    updatedAt: String(data.updatedAt || data.updated_at || ""),
  };
}

function DetailRow({
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
    <div className="grid grid-cols-[minmax(130px,0.7fr)_minmax(0,1.3fr)] gap-4 border-b border-slate-100 py-2.5 last:border-0">
      <div className="text-xs font-normal text-slate-500">{label}</div>
      <div className="min-w-0 break-words text-sm font-medium text-slate-900">
        {badge ? (
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs ${badgeClass}`}>
            {value}
          </span>
        ) : (
          value
        )}
      </div>
    </div>
  );
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
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-lg text-violet-700">
          {icon}
        </div>
        <div>
          <div className="text-base font-semibold text-slate-950">{title}</div>
          <div className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</div>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function EditField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        title={`กรอก${label}`}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
      />
    </label>
  );
}

export default function CorporateUserDirectoryProfile({
  rows,
  canManageUsers,
  rolePermissions,
}: CorporateUserDirectoryProfileProps) {
  const [metaByUsername, setMetaByUsername] = useState<
    Record<string, UserProfileMeta>
  >({});
  const [selectedUsername, setSelectedUsername] = useState(
    rows[0]?.normalizedUsername || ""
  );
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deviceFilter, setDeviceFilter] = useState("all");
  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<UserProfileMeta>(EMPTY_META);
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
          const username = normalizeUsername(data.username || item.id);
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
    const timer = window.setTimeout(() => setToast(""), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const roles = useMemo(
    () =>
      Array.from(new Set(rows.map((row) => row.effectiveRole)))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [rows]
  );

  const teams = useMemo(
    () =>
      Array.from(
        new Set(rows.map((row) => row.teamName || "Unassigned Team"))
      ).sort((a, b) => a.localeCompare(b)),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return rows
      .filter((row) => {
        const meta = metaByUsername[row.normalizedUsername] || EMPTY_META;
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

        const matchesSearch = !keyword || searchable.includes(keyword);
        const matchesRole =
          roleFilter === "all" || row.effectiveRole === roleFilter;
        const matchesTeam =
          teamFilter === "all" ||
          (row.teamName || "Unassigned Team") === teamFilter;
        const matchesStatus =
          statusFilter === "all" || row.status === statusFilter;
        const matchesDevice =
          deviceFilter === "all" ||
          (deviceFilter === "assigned"
            ? meta.deviceStatus === "Assigned"
            : meta.deviceStatus !== "Assigned");

        return (
          matchesSearch &&
          matchesRole &&
          matchesTeam &&
          matchesStatus &&
          matchesDevice
        );
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [
    deviceFilter,
    metaByUsername,
    roleFilter,
    rows,
    search,
    statusFilter,
    teamFilter,
  ]);

  useEffect(() => {
    if (
      filteredRows.some(
        (row) => row.normalizedUsername === selectedUsername
      )
    ) {
      return;
    }

    setSelectedUsername(filteredRows[0]?.normalizedUsername || "");
  }, [filteredRows, selectedUsername]);

  const selectedUser =
    filteredRows.find(
      (row) => row.normalizedUsername === selectedUsername
    ) ||
    rows.find((row) => row.normalizedUsername === selectedUsername) ||
    null;

  const selectedMeta = selectedUser
    ? metaByUsername[selectedUser.normalizedUsername] || EMPTY_META
    : EMPTY_META;

  const permissionCount = selectedUser
    ? Object.values(
        rolePermissions[selectedUser.effectiveRole] || {}
      ).filter(Boolean).length
    : 0;

  const clearFilters = () => {
    setSearch("");
    setRoleFilter("all");
    setTeamFilter("all");
    setStatusFilter("all");
    setDeviceFilter("all");
  };

  const openEditProfile = () => {
    if (!selectedUser) return;
    setEditDraft({
      ...EMPTY_META,
      ...selectedMeta,
      docId:
        selectedMeta.docId ||
        safeDocId(selectedUser.username),
    });
    setEditOpen(true);
  };

  const updateDraft = (
    key: keyof UserProfileMeta,
    value: string
  ) => {
    setEditDraft((current) => ({ ...current, [key]: value }));
  };

  const saveProfile = async () => {
    if (!selectedUser) return;

    setSaving(true);
    try {
      const docId =
        editDraft.docId || safeDocId(selectedUser.username);
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
          officeContactNumber: nextMeta.officeContactNumber,
          officeExtension: nextMeta.officeExtension,
          officeContactUsage: nextMeta.officeContactUsage,
          secondaryOfficeContact:
            nextMeta.secondaryOfficeContact,
          officeContactNote: nextMeta.officeContactNote,
          deviceStatus: nextMeta.deviceStatus,
          deviceBrand: nextMeta.deviceBrand,
          deviceModel: nextMeta.deviceModel,
          deviceSeries: nextMeta.deviceSeries,
          operatingSystem: nextMeta.operatingSystem,
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
      setEditOpen(false);
      setToast("บันทึกข้อมูลโปรไฟล์และอุปกรณ์แล้ว");
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
    const text = [
      selectedUser?.displayName,
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

    if (!text) return;

    await navigator.clipboard?.writeText(text);
    setToast("คัดลอกข้อมูลติดต่อแล้ว");
  };

  return (
    <div className="bg-gradient-to-br from-slate-50 via-white to-violet-50/40 p-4 lg:p-5">
      {toast ? (
        <div className="fixed right-5 top-5 z-[230] rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
          {toast}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[390px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                ⌕
              </span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ค้นหาชื่อ Username อีเมล เบอร์ หรืออุปกรณ์"
                title="ค้นหาข้อมูลผู้ใช้งานจากชื่อ Username อีเมล เบอร์สำนักงาน หรือข้อมูลอุปกรณ์"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-10 text-sm text-slate-800 outline-none transition focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
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
                onChange={(event) => setRoleFilter(event.target.value)}
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
                onChange={(event) => setTeamFilter(event.target.value)}
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
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                title="กรองรายชื่อตามสถานะบัญชี"
                aria-label="กรองรายชื่อตามสถานะบัญชี"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none"
              >
                <option value="all">ทุกสถานะ</option>
                <option value="Active">Active</option>
                <option value="Suspended">Suspended</option>
              </select>

              <select
                value={deviceFilter}
                onChange={(event) => setDeviceFilter(event.target.value)}
                title="กรองผู้ใช้ตามสถานะการรับอุปกรณ์"
                aria-label="กรองผู้ใช้ตามสถานะการรับอุปกรณ์"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none"
              >
                <option value="all">ทุกอุปกรณ์</option>
                <option value="assigned">รับอุปกรณ์แล้ว</option>
                <option value="unassigned">ยังไม่มีอุปกรณ์</option>
              </select>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                พบ {filteredRows.length} จาก {rows.length} ผู้ใช้
              </div>
              <button
                type="button"
                title="ล้างตัวกรองทั้งหมดและแสดงรายชื่อทุกคน"
                onClick={clearFilters}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:border-violet-200 hover:text-violet-700"
              >
                ล้างตัวกรอง
              </button>
            </div>
          </div>

          <div className="max-h-[720px] space-y-2 overflow-y-auto p-3">
            {filteredRows.map((row) => {
              const meta =
                metaByUsername[row.normalizedUsername] || EMPTY_META;
              const selected =
                row.normalizedUsername === selectedUsername;

              return (
                <button
                  key={row.username}
                  type="button"
                  title={`เปิดโปรไฟล์ของ ${row.displayName}`}
                  aria-label={`เปิดโปรไฟล์ของ ${row.displayName}`}
                  onClick={() =>
                    setSelectedUsername(row.normalizedUsername)
                  }
                  className={`w-full rounded-[20px] border p-3 text-left transition ${
                    selected
                      ? "border-violet-300 bg-violet-50 shadow-[0_12px_28px_rgba(109,40,217,0.12)]"
                      : "border-slate-100 bg-white hover:border-violet-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-sm font-semibold text-white ${avatarClass(
                        row.effectiveRole
                      )}`}
                    >
                      {initials(row.displayName || row.username)}
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
                          className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${
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
                          ☎ {meta.officeContactNumber || "ยังไม่ระบุเบอร์สำนักงาน"}
                        </div>
                        <div className="truncate">
                          ▣{" "}
                          {meta.deviceStatus === "Assigned"
                            ? [meta.deviceBrand, meta.deviceModel]
                                .filter(Boolean)
                                .join(" ") || "รับอุปกรณ์แล้ว"
                            : "ยังไม่ระบุอุปกรณ์"}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex justify-end">
                    <span className="text-xs font-medium text-violet-700">
                      ดูโปรไฟล์ →
                    </span>
                  </div>
                </button>
              );
            })}

            {!filteredRows.length ? (
              <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
                ไม่พบผู้ใช้ที่ตรงกับการค้นหาหรือตัวกรอง
              </div>
            ) : null}
          </div>
        </aside>

        <main className="min-w-0">
          {selectedUser ? (
            <div className="space-y-4">
              <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
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
                          {selectedUser.teamName || "ยังไม่ระบุทีม"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {selectedMeta.officeContactNumber ? (
                      <button
                        type="button"
                        title="คัดลอกเบอร์สำนักงาน เบอร์ต่อ และหมายเลข Work SIM ของผู้ใช้นี้"
                        onClick={() => void copyContact()}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:border-violet-200 hover:text-violet-700"
                      >
                        คัดลอกข้อมูลติดต่อ
                      </button>
                    ) : null}

                    {canManageUsers ? (
                      <button
                        type="button"
                        title="แก้ไขหมายเลขติดต่อสำนักงานและข้อมูลอุปกรณ์ที่บริษัทมอบหมาย"
                        onClick={openEditProfile}
                        className="rounded-xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-4 py-2.5 text-sm font-medium text-white shadow-[0_12px_28px_rgba(109,40,217,0.22)]"
                      >
                        แก้ไขข้อมูลโปรไฟล์
                      </button>
                    ) : null}
                  </div>
                </div>
              </section>

              <div className="grid gap-4 2xl:grid-cols-2">
                <SectionCard
                  icon="◯"
                  title="Account Information"
                  subtitle="ข้อมูลบัญชีและสถานะการเข้าถึงระบบ"
                >
                  <DetailRow
                    label="ชื่อ–นามสกุล"
                    value={fieldValue(selectedUser.displayName)}
                  />
                  <DetailRow
                    label="Username"
                    value={fieldValue(selectedUser.username)}
                  />
                  <DetailRow
                    label="อีเมลสำหรับงาน"
                    value={fieldValue(selectedUser.email)}
                  />
                  <DetailRow
                    label="รหัสพนักงาน"
                    value={fieldValue(selectedMeta.employeeId)}
                  />
                  <DetailRow
                    label="Role"
                    value={fieldValue(selectedUser.effectiveRole)}
                    badge="violet"
                  />
                  <DetailRow
                    label="ทีม"
                    value={fieldValue(selectedUser.teamName)}
                  />
                  <DetailRow
                    label="หัวหน้าทีม"
                    value={fieldValue(selectedUser.teamLead)}
                  />
                  <DetailRow
                    label="สถานะบัญชี"
                    value={selectedUser.status}
                    badge={
                      selectedUser.status === "Active"
                        ? "green"
                        : "amber"
                    }
                  />
                  <DetailRow
                    label="สถานะรหัสผ่าน"
                    value="ตั้งค่าแล้ว"
                    badge="green"
                  />
                  <DetailRow
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
                  <DetailRow
                    label="เบอร์โทรศัพท์สำนักงานสำหรับโทรออก"
                    value={fieldValue(
                      selectedMeta.officeContactNumber
                    )}
                  />
                  <DetailRow
                    label="เบอร์ต่อภายใน"
                    value={fieldValue(
                      selectedMeta.officeExtension
                    )}
                  />
                  <DetailRow
                    label="วัตถุประสงค์การใช้งาน"
                    value={fieldValue(
                      selectedMeta.officeContactUsage
                    )}
                  />
                  <DetailRow
                    label="หมายเลขสำนักงานสำรอง"
                    value={fieldValue(
                      selectedMeta.secondaryOfficeContact
                    )}
                  />
                  <DetailRow
                    label="หมายเหตุ"
                    value={fieldValue(
                      selectedMeta.officeContactNote
                    )}
                  />
                </SectionCard>

                <SectionCard
                  icon="▣"
                  title="Assigned Work Device"
                  subtitle="ข้อมูลอุปกรณ์และหมายเลขประจำเครื่องที่บริษัทมอบหมาย"
                >
                  <DetailRow
                    label="สถานะอุปกรณ์"
                    value={
                      selectedMeta.deviceStatus === "Assigned"
                        ? "รับอุปกรณ์แล้ว"
                        : selectedMeta.deviceStatus === "Repair"
                          ? "อยู่ระหว่างซ่อม"
                          : selectedMeta.deviceStatus === "Returned"
                            ? "คืนอุปกรณ์แล้ว"
                            : "ยังไม่มีอุปกรณ์"
                    }
                    badge={
                      selectedMeta.deviceStatus === "Assigned"
                        ? "green"
                        : selectedMeta.deviceStatus === "Repair"
                          ? "amber"
                          : "slate"
                    }
                  />
                  <DetailRow
                    label="ยี่ห้อ"
                    value={fieldValue(selectedMeta.deviceBrand)}
                  />
                  <DetailRow
                    label="รุ่น / Model"
                    value={fieldValue(selectedMeta.deviceModel)}
                  />
                  <DetailRow
                    label="Series"
                    value={fieldValue(selectedMeta.deviceSeries)}
                  />
                  <DetailRow
                    label="ระบบปฏิบัติการ"
                    value={fieldValue(
                      selectedMeta.operatingSystem
                    )}
                  />
                  <DetailRow
                    label="Asset ID / เลขทรัพย์สิน"
                    value={fieldValue(selectedMeta.assetId)}
                  />
                  <DetailRow
                    label="Serial Number"
                    value={fieldValue(selectedMeta.serialNumber)}
                  />
                  <DetailRow
                    label="IMEI"
                    value={fieldValue(selectedMeta.imei)}
                  />
                  <DetailRow
                    label="IMEI 2"
                    value={fieldValue(selectedMeta.imei2)}
                  />
                  <DetailRow
                    label="หมายเลข Work SIM"
                    value={fieldValue(selectedMeta.workSimNumber)}
                  />
                  <DetailRow
                    label="วันที่มอบหมายอุปกรณ์"
                    value={fieldValue(selectedMeta.assignedDate)}
                  />
                  <DetailRow
                    label="หมายเหตุอุปกรณ์"
                    value={fieldValue(selectedMeta.deviceNote)}
                  />
                </SectionCard>

                <SectionCard
                  icon="◇"
                  title="Access Summary"
                  subtitle="สรุป Role สิทธิ์ และขอบเขตการใช้งานของบัญชี"
                >
                  <DetailRow
                    label="Role"
                    value={fieldValue(selectedUser.effectiveRole)}
                    badge="violet"
                  />
                  <DetailRow
                    label="สิทธิ์ที่เปิดใช้งาน"
                    value={`${permissionCount} สิทธิ์`}
                  />
                  <DetailRow
                    label="ขอบเขตทีม"
                    value={fieldValue(
                      selectedUser.teamName || "ตาม Role"
                    )}
                  />
                  <DetailRow
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
                  <DetailRow
                    label="ระดับความปลอดภัย"
                    value="Corporate Standard"
                    badge="slate"
                  />
                  <DetailRow
                    label="อัปเดตโปรไฟล์ล่าสุด"
                    value={formatDateTime(selectedMeta.updatedAt)}
                  />
                </SectionCard>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[520px] items-center justify-center rounded-[26px] border border-dashed border-slate-200 bg-white text-sm text-slate-500">
              เลือกผู้ใช้จากรายการด้านซ้ายเพื่อดูข้อมูลโปรไฟล์
            </div>
          )}
        </main>
      </div>

      {editOpen && selectedUser ? (
        <div className="fixed inset-0 z-[240] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[30px] bg-white shadow-[0_32px_100px_rgba(15,23,42,0.35)]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-gradient-to-r from-violet-950 via-violet-800 to-fuchsia-700 px-6 py-5 text-white">
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-violet-200">
                  Corporate User Profile
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  แก้ไขข้อมูล {selectedUser.displayName}
                </div>
                <div className="mt-1 text-sm text-violet-100">
                  กรอกเฉพาะข้อมูลสำหรับการทำงาน ไม่ควรกรอกเบอร์โทรศัพท์ส่วนตัว
                </div>
              </div>

              <button
                type="button"
                title="ปิดหน้าต่างแก้ไขโดยยังไม่บันทึกข้อมูล"
                aria-label="ปิดหน้าต่างแก้ไข"
                disabled={saving}
                onClick={() => setEditOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white hover:bg-white/20 disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto p-6">
              <div className="grid gap-6 xl:grid-cols-2">
                <section className="rounded-[22px] border border-slate-200 bg-slate-50/60 p-5">
                  <div className="text-base font-semibold text-slate-950">
                    ข้อมูลติดต่อสำหรับงาน
                  </div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    ใช้สำหรับเบอร์ที่สำนักงานหรือบริษัทจัดให้เท่านั้น
                  </div>

                  <div className="mt-4 grid gap-4">
                    <EditField
                      label="รหัสพนักงาน"
                      value={editDraft.employeeId}
                      onChange={(value) =>
                        updateDraft("employeeId", value)
                      }
                    />
                    <EditField
                      label="เบอร์โทรศัพท์สำนักงานสำหรับโทรออก"
                      value={editDraft.officeContactNumber}
                      onChange={(value) =>
                        updateDraft(
                          "officeContactNumber",
                          value
                        )
                      }
                      placeholder="เช่น 02-xxx-xxxx"
                    />
                    <EditField
                      label="เบอร์ต่อภายใน"
                      value={editDraft.officeExtension}
                      onChange={(value) =>
                        updateDraft("officeExtension", value)
                      }
                      placeholder="เช่น 1234"
                    />
                    <EditField
                      label="หมายเลขสำนักงานสำรอง"
                      value={editDraft.secondaryOfficeContact}
                      onChange={(value) =>
                        updateDraft(
                          "secondaryOfficeContact",
                          value
                        )
                      }
                    />
                    <EditField
                      label="วัตถุประสงค์การใช้งาน"
                      value={editDraft.officeContactUsage}
                      onChange={(value) =>
                        updateDraft(
                          "officeContactUsage",
                          value
                        )
                      }
                    />
                    <EditField
                      label="หมายเหตุข้อมูลติดต่อ"
                      value={editDraft.officeContactNote}
                      onChange={(value) =>
                        updateDraft(
                          "officeContactNote",
                          value
                        )
                      }
                    />
                  </div>
                </section>

                <section className="rounded-[22px] border border-slate-200 bg-slate-50/60 p-5">
                  <div className="text-base font-semibold text-slate-950">
                    ข้อมูลอุปกรณ์ที่บริษัทมอบหมาย
                  </div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    ระบุรุ่น Series และหมายเลขประจำเครื่องเพื่อใช้ตรวจสอบทรัพย์สิน
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="block sm:col-span-2">
                      <span className="text-xs font-medium text-slate-600">
                        สถานะอุปกรณ์
                      </span>
                      <select
                        value={editDraft.deviceStatus}
                        onChange={(event) =>
                          updateDraft(
                            "deviceStatus",
                            event.target.value
                          )
                        }
                        title="เลือกสถานะปัจจุบันของอุปกรณ์ที่มอบหมาย"
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
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
                    </label>

                    <EditField
                      label="ยี่ห้อ"
                      value={editDraft.deviceBrand}
                      onChange={(value) =>
                        updateDraft("deviceBrand", value)
                      }
                      placeholder="เช่น Samsung"
                    />
                    <EditField
                      label="รุ่น / Model"
                      value={editDraft.deviceModel}
                      onChange={(value) =>
                        updateDraft("deviceModel", value)
                      }
                      placeholder="เช่น Galaxy S23"
                    />
                    <EditField
                      label="Series"
                      value={editDraft.deviceSeries}
                      onChange={(value) =>
                        updateDraft("deviceSeries", value)
                      }
                      placeholder="เช่น S Series"
                    />
                    <EditField
                      label="ระบบปฏิบัติการ"
                      value={editDraft.operatingSystem}
                      onChange={(value) =>
                        updateDraft(
                          "operatingSystem",
                          value
                        )
                      }
                      placeholder="เช่น Android 14"
                    />
                    <EditField
                      label="Asset ID / เลขทรัพย์สิน"
                      value={editDraft.assetId}
                      onChange={(value) =>
                        updateDraft("assetId", value)
                      }
                    />
                    <EditField
                      label="Serial Number"
                      value={editDraft.serialNumber}
                      onChange={(value) =>
                        updateDraft("serialNumber", value)
                      }
                    />
                    <EditField
                      label="IMEI"
                      value={editDraft.imei}
                      onChange={(value) =>
                        updateDraft("imei", value)
                      }
                    />
                    <EditField
                      label="IMEI 2"
                      value={editDraft.imei2}
                      onChange={(value) =>
                        updateDraft("imei2", value)
                      }
                    />
                    <EditField
                      label="หมายเลข Work SIM"
                      value={editDraft.workSimNumber}
                      onChange={(value) =>
                        updateDraft(
                          "workSimNumber",
                          value
                        )
                      }
                    />
                    <EditField
                      label="วันที่มอบหมายอุปกรณ์"
                      type="date"
                      value={editDraft.assignedDate}
                      onChange={(value) =>
                        updateDraft("assignedDate", value)
                      }
                    />
                    <div className="sm:col-span-2">
                      <EditField
                        label="หมายเหตุอุปกรณ์"
                        value={editDraft.deviceNote}
                        onChange={(value) =>
                          updateDraft("deviceNote", value)
                        }
                      />
                    </div>
                  </div>
                </section>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-5">
              <button
                type="button"
                title="ยกเลิกการแก้ไขและปิดหน้าต่างโดยไม่บันทึก"
                disabled={saving}
                onClick={() => setEditOpen(false)}
                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                title="บันทึกข้อมูลติดต่อสำนักงานและข้อมูลอุปกรณ์ของผู้ใช้นี้"
                disabled={saving}
                onClick={() => void saveProfile()}
                className="rounded-xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:opacity-95 disabled:opacity-50"
              >
                {saving ? "กำลังบันทึก..." : "บันทึกข้อมูลโปรไฟล์"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}