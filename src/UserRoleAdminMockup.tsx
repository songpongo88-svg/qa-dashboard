import React, { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import PageHero from "./PageHero";
import { registerTHSarabunNew } from "./THSarabunNew-jsPDF";
import { fetchUsageLogs, logUsageEvent, UsageLogEvent } from "./usageLog";

type UserRole = string;
type UserStatus = "Active" | "Suspended";

type UserAccount = {
  username: string;
  displayName: string;
  role: UserRole;
  agentName: string;
  email?: string;
  status?: UserStatus;
  suspendReason?: string;
};

type EditableUser = {
  username: string;
  displayName: string;
  agentName: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  suspendReason: string;
  temporaryPassword: string;
};

type DirectoryTab = "active" | "suspended";
type AdminTab = "users" | "roles";

type RoleDefinition = {
  name: string;
  description: string;
  active: boolean;
  createdAt: string;
  createdBy: string;
  locked?: boolean;
};

type CurrentUser = {
  username: string;
  displayName: string;
  role: UserRole;
  agentName: string;
  email?: string;
  loginAt: string;
} | null;

type UserRoleAdminMockupProps = {
  accounts: UserAccount[];
  currentUser: CurrentUser;
  roleOverrides: Record<string, UserRole>;
  onRolesChanged: () => void | Promise<void>;
};

const ROLE_OPTIONS: UserRole[] = ["Agent", "Senior", "Supervisor", "Quality Assurance"];
const STATUS_OPTIONS: UserStatus[] = ["Active", "Suspended"];

function buildRoleDefinitions(logs: UsageLogEvent[]) {
  const roleMap = new Map<string, RoleDefinition>();
  ROLE_OPTIONS.forEach((role) => {
    roleMap.set(role.toLowerCase(), {
      name: role,
      description: role === "Quality Assurance" ? "System admin role with protected access." : "Default system role.",
      active: true,
      createdAt: "",
      createdBy: "System",
      locked: role === "Quality Assurance",
    });
  });

  [...logs]
    .sort((a, b) => new Date(a.created_at || "").getTime() - new Date(b.created_at || "").getTime())
    .forEach((log) => {
      if (log.event_type !== "role_definition_saved") return;
      const name = String(log.details?.name || "").trim();
      if (!name) return;
      roleMap.set(name.toLowerCase(), {
        name,
        description: String(log.details?.description || ""),
        active: log.details?.active === false ? false : true,
        createdAt: String(log.details?.updatedAt || log.created_at || ""),
        createdBy: String(log.details?.updatedBy || log.display_name || log.username || ""),
        locked: name === "Quality Assurance",
      });
    });

  return Array.from(roleMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function roleBadgeClass(role: UserRole) {
  if (role === "Quality Assurance") return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700";
  if (role === "Supervisor") return "border-sky-200 bg-sky-50 text-sky-700";
  if (role === "Senior") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function toEditableUser(account: UserAccount): EditableUser {
  return {
    username: account.username,
    displayName: account.displayName,
    agentName: account.agentName || account.displayName,
    email: account.email || "",
    role: account.role,
    status: account.status || "Active",
    suspendReason: account.suspendReason || "",
    temporaryPassword: "",
  };
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function formatDateTime(value = new Date().toISOString()) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function generateTemporaryPassword() {
  const letters = Math.random().toString(36).slice(2, 8);
  const number = Math.floor(100 + Math.random() * 900);
  return `Qa#${number}${letters}A`;
}

function createBlankUser(): EditableUser {
  return {
    username: "",
    displayName: "",
    agentName: "",
    email: "",
    role: "Agent",
    status: "Active",
    suspendReason: "",
    temporaryPassword: generateTemporaryPassword(),
  };
}

export default function UserRoleAdminMockup({
  accounts,
  currentUser,
  roleOverrides,
  onRolesChanged,
}: UserRoleAdminMockupProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [accessMessage, setAccessMessage] = useState("");
  const [draftUsers, setDraftUsers] = useState<EditableUser[]>([]);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [newUserDraft, setNewUserDraft] = useState<EditableUser>(() => createBlankUser());
  const [directoryTab, setDirectoryTab] = useState<DirectoryTab>("active");
  const [adminTab, setAdminTab] = useState<AdminTab>("users");
  const [roleDefinitions, setRoleDefinitions] = useState<RoleDefinition[]>(() => buildRoleDefinitions([]));
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");

  const activeRoleOptions = useMemo(
    () => roleDefinitions.filter((role) => role.active).map((role) => role.name),
    [roleDefinitions]
  );

  const loadRoleDefinitions = async () => {
    try {
      const logs = await fetchUsageLogs(5000);
      setRoleDefinitions(buildRoleDefinitions(logs));
    } catch {
      setRoleDefinitions(buildRoleDefinitions([]));
    }
  };

  const rows = useMemo(() => {
    return accounts
      .map((account) => {
        const normalizedUsername = normalizeUsername(account.username);
        return {
          ...account,
          normalizedUsername,
          effectiveRole: roleOverrides[normalizedUsername] || account.role,
          status: account.status || "Active",
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [accounts, roleOverrides]);

  useEffect(() => {
    if (isEditing) return;
    setDraftUsers(rows.map((row) => toEditableUser({ ...row, role: row.effectiveRole })));
  }, [isEditing, rows]);

  useEffect(() => {
    void loadRoleDefinitions();
  }, []);

  const totalUsers = rows.length;
  const activeUsers = rows.filter((row) => row.status === "Active").length;
  const suspendedUsers = rows.filter((row) => row.status === "Suspended").length;
  const seniorUsers = rows.filter((row) => row.effectiveRole === "Senior").length;
  const supervisorUsers = rows.filter((row) => row.effectiveRole === "Supervisor").length;
  const qaUsers = rows.filter((row) => row.effectiveRole === "Quality Assurance").length;
  const visibleRows = rows.filter((row) => directoryTab === "active" ? row.status === "Active" : row.status === "Suspended");
  const visibleDraftUsers = draftUsers
    .map((user, index) => ({ user, index }))
    .filter(({ user }) => directoryTab === "active" ? user.status === "Active" : user.status === "Suspended");

  const updateDraftUser = (index: number, key: keyof EditableUser, value: string) => {
    setDraftUsers((currentDrafts) =>
      currentDrafts.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item
      )
    );
  };

  const generateDraftPassword = (index: number) => {
    updateDraftUser(index, "temporaryPassword", generateTemporaryPassword());
  };

  const updateNewUserDraft = (key: keyof EditableUser, value: string) => {
    setNewUserDraft((currentDraft) => ({ ...currentDraft, [key]: value }));
  };

  const openCreateUserModal = () => {
    setNewUserDraft(createBlankUser());
    setMessage("");
    setCreateUserOpen(true);
  };

  const saveRoleDefinition = async (role?: RoleDefinition) => {
    const name = (role?.name || newRoleName).trim();
    const description = (role?.description || newRoleDescription).trim();
    if (!name) {
      setMessage("Role name is required.");
      return;
    }
    if (roleDefinitions.some((item) => item.name.toLowerCase() === name.toLowerCase() && !role)) {
      setMessage(`Role already exists: ${name}`);
      return;
    }

    setSaving(true);
    setMessage("");
    await logUsageEvent(currentUser, "role_definition_saved", {
      tab: "user-roles",
      details: {
        name,
        description,
        active: role?.active ?? true,
        updatedBy: currentUser?.displayName || currentUser?.username || "",
        updatedAt: new Date().toISOString(),
      },
    });
    await loadRoleDefinitions();
    setSaving(false);
    setNewRoleName("");
    setNewRoleDescription("");
    setMessage(`Saved role ${name}.`);
  };

  const toggleRoleActive = async (role: RoleDefinition) => {
    if (role.locked) {
      setMessage("Quality Assurance role is locked for system safety.");
      return;
    }
    const roleInUse = rows.some((row) => row.effectiveRole.toLowerCase() === role.name.toLowerCase());
    if (role.active && roleInUse) {
      setMessage(`Cannot disable ${role.name} because at least one user is using this role.`);
      return;
    }
    await saveRoleDefinition({ ...role, active: !role.active });
  };

  const handleCancelEdit = () => {
    setDraftUsers(rows.map((row) => toEditableUser({ ...row, role: row.effectiveRole })));
    setIsEditing(false);
    setMessage("");
    setAccessMessage("");
  };

  const saveNewUser = async () => {
    const cleanedUser = {
      ...newUserDraft,
      username: newUserDraft.username.trim(),
      displayName: newUserDraft.displayName.trim(),
      agentName: newUserDraft.agentName.trim() || newUserDraft.displayName.trim(),
      email: newUserDraft.email.trim(),
      suspendReason: newUserDraft.suspendReason.trim(),
      temporaryPassword: newUserDraft.temporaryPassword || generateTemporaryPassword(),
    };

    if (!cleanedUser.username || !cleanedUser.displayName) {
      setMessage("Username and display name are required before creating a user.");
      return;
    }

    if (rows.some((row) => normalizeUsername(row.username) === normalizeUsername(cleanedUser.username))) {
      setMessage(`Username already exists: ${cleanedUser.username}`);
      return;
    }

    setSaving(true);
    setMessage("");
    setAccessMessage("");

    await logUsageEvent(currentUser, "user_profile_saved", {
      tab: "user-roles",
      target_agent: cleanedUser.username,
      details: {
        ...cleanedUser,
        updatedBy: currentUser?.displayName || currentUser?.username || "",
        updatedAt: new Date().toISOString(),
      },
    });

    const issuedAt = new Date();
    await logUsageEvent(currentUser, "password_reset_approved", {
      tab: "user-roles",
      target_agent: cleanedUser.username,
      details: {
        requestId: `directory-access-${normalizeUsername(cleanedUser.username)}-${Date.now()}`,
        username: cleanedUser.username,
        displayName: cleanedUser.displayName,
        email: cleanedUser.email,
        password: cleanedUser.temporaryPassword,
        passwordKind: "temporary",
        issuedAt: issuedAt.toISOString(),
        expiresAt: addDays(issuedAt, 15).toISOString(),
        resetMode: "directory-access",
        approvedBy: currentUser?.displayName || currentUser?.username || "",
        approvedAt: issuedAt.toISOString(),
      },
    });

    await onRolesChanged();
    setSaving(false);
    setCreateUserOpen(false);
    setDirectoryTab(cleanedUser.status === "Suspended" ? "suspended" : "active");
    setMessage(`Created user ${cleanedUser.displayName}.`);
    setAccessMessage(`${cleanedUser.displayName || cleanedUser.username}: ${cleanedUser.temporaryPassword}`);
  };

  const handleSaveDirectory = async () => {
    const cleanedUsers = draftUsers.map((item) => ({
      ...item,
      username: item.username.trim(),
      displayName: item.displayName.trim(),
      agentName: item.agentName.trim() || item.displayName.trim(),
      email: item.email.trim(),
      suspendReason: item.suspendReason.trim(),
    }));

    const invalidUser = cleanedUsers.find((item) => !item.username || !item.displayName);
    if (invalidUser) {
      setMessage("Username and display name are required before saving.");
      return;
    }

    const duplicatedUsername = cleanedUsers.find((item, index) =>
      cleanedUsers.findIndex((target) => normalizeUsername(target.username) === normalizeUsername(item.username)) !== index
    );
    if (duplicatedUsername) {
      setMessage(`Duplicate username found: ${duplicatedUsername.username}`);
      return;
    }

    const songpon = cleanedUsers.find((item) => normalizeUsername(item.username) === "songpon");
    if (!songpon || songpon.role !== "Quality Assurance" || songpon.status !== "Active") {
      setMessage("Songpon must remain Active with Quality Assurance role to keep admin access safe.");
      return;
    }

    setSaving(true);
    setMessage("");
    setAccessMessage("");

    const existingUsernames = new Set(rows.map((row) => normalizeUsername(row.username)));
    const accessUpdates = cleanedUsers.filter(
      (user) => user.temporaryPassword || !existingUsernames.has(normalizeUsername(user.username))
    );

    for (const user of cleanedUsers) {
      await logUsageEvent(currentUser, "user_profile_saved", {
        tab: "user-roles",
        target_agent: user.username,
        details: {
          ...user,
          updatedBy: currentUser?.displayName || currentUser?.username || "",
          updatedAt: new Date().toISOString(),
        },
      });

      if (user.temporaryPassword) {
        const issuedAt = new Date();
        await logUsageEvent(currentUser, "password_reset_approved", {
          tab: "user-roles",
          target_agent: user.username,
          details: {
            requestId: `directory-access-${normalizeUsername(user.username)}-${Date.now()}`,
            username: user.username,
            displayName: user.displayName,
            email: user.email,
            password: user.temporaryPassword,
            passwordKind: "temporary",
            issuedAt: issuedAt.toISOString(),
            expiresAt: addDays(issuedAt, 15).toISOString(),
            resetMode: "directory-access",
            approvedBy: currentUser?.displayName || currentUser?.username || "",
            approvedAt: issuedAt.toISOString(),
          },
        });
      }
    }

    await onRolesChanged();
    setSaving(false);
    setIsEditing(false);
    setMessage(`Saved ${cleanedUsers.length} user profile(s).`);
    if (accessUpdates.length) {
      setAccessMessage(
        accessUpdates
          .map((user) => `${user.displayName || user.username}: ${user.temporaryPassword || "RBH1234"}`)
          .join(" | ")
      );
    }
  };

  const handleExportPdf = () => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    registerTHSarabunNew(doc);
    doc.setFont("THSarabunNew", "bold");
    doc.setFontSize(20);
    doc.text("QA Dashboard - User Directory", 14, 18);

    doc.setFont("THSarabunNew", "normal");
    doc.setFontSize(12);
    doc.text(`Generated by: ${currentUser?.displayName || "-"}`, 14, 27);
    doc.text(`Generated at: ${formatDateTime()}`, 14, 34);

    doc.setFont("THSarabunNew", "bold");
    const startY = 46;
    doc.text("User", 14, startY);
    doc.text("Email", 62, startY);
    doc.text("Role", 122, startY);
    doc.text("Status", 168, startY);
    doc.line(14, startY + 2, 196, startY + 2);

    doc.setFont("THSarabunNew", "normal");
    let y = startY + 10;
    visibleRows.forEach((row) => {
      if (y > 280) {
        doc.addPage();
        y = 18;
      }
      doc.text(row.displayName || row.username, 14, y);
      doc.text(row.email || "-", 62, y);
      doc.text(row.effectiveRole, 122, y);
      doc.text(row.status, 168, y);
      y += 8;
    });

    logUsageEvent(currentUser, "pdf_generate", {
      tab: "user-roles",
      details: { pdfType: "user_directory" },
    });
    doc.save(`QA_User_Directory_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="min-h-screen bg-[#fbf8ff] text-slate-950">
      <PageHero
        eyebrow="CRM Admin"
        title="User Directory"
        subtitle="Manage user profiles, emails, account status, and system roles from one controlled directory."
        workspaceTitle="CRM Permission Center"
        workspaceSubtitle="Central user profile management for QA Dashboard"
      />

      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-5 lg:px-6 2xl:px-8">
        <div className="grid gap-4 md:grid-cols-6">
          <MetricCard label="Total Users" value={totalUsers} tone="text-violet-600" />
          <MetricCard label="Active" value={activeUsers} tone="text-emerald-600" />
          <MetricCard label="Suspended" value={suspendedUsers} tone="text-rose-600" />
          <MetricCard label="Senior" value={seniorUsers} tone="text-amber-600" />
          <MetricCard label="Supervisors" value={supervisorUsers} tone="text-sky-600" />
          <MetricCard label="Quality Assurance" value={qaUsers} tone="text-fuchsia-600" />
        </div>

        <div className="mt-5 overflow-hidden rounded-[28px] border border-violet-100 bg-white shadow-[0_18px_50px_rgba(88,28,135,0.08)]">
          <div className="flex flex-col gap-4 border-b border-violet-100 bg-gradient-to-r from-white to-violet-50 px-5 py-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-lg font-black text-slate-950">User Directory</div>
              <div className="mt-1 text-sm text-slate-500">
                {isEditing
                  ? "Edit user details in one place, then save all changes at once."
                  : "Read-only view. Click Edit Directory when you need to update users."}
              </div>
              {message ? <div className="mt-2 text-sm font-semibold text-violet-700">{message}</div> : null}
              {accessMessage ? (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                  Temporary access password(s): {accessMessage}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-3">
              {adminTab === "roles" ? null : isEditing ? (
                <>
                  <button type="button" onClick={handleCancelEdit} className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDirectory}
                    disabled={saving}
                    className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-black text-white shadow-sm transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={openCreateUserModal} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-violet-800">
                    Create User
                  </button>
                  <button type="button" onClick={handleExportPdf} className="rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-bold text-violet-700 hover:bg-violet-50">
                    Export PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftUsers(rows.map((row) => toEditableUser({ ...row, role: row.effectiveRole })));
                      setIsEditing(true);
                      setMessage("");
                    }}
                    className="rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-3 text-sm font-black text-white shadow-[0_14px_30px_rgba(109,40,217,0.22)] transition hover:opacity-95"
                  >
                    Edit Directory
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 border-b border-violet-100 bg-white px-5 py-4">
            <DirectoryTabButton active={adminTab === "users"} label="Users" count={totalUsers} onClick={() => setAdminTab("users")} />
            <DirectoryTabButton active={adminTab === "roles"} label="Roles & Permissions" count={roleDefinitions.length} onClick={() => setAdminTab("roles")} />
          </div>

          {adminTab === "roles" ? (
            <RoleManagementPanel
              roles={roleDefinitions}
              newRoleName={newRoleName}
              newRoleDescription={newRoleDescription}
              saving={saving}
              onNameChange={setNewRoleName}
              onDescriptionChange={setNewRoleDescription}
              onSave={() => void saveRoleDefinition()}
              onToggle={(role) => void toggleRoleActive(role)}
            />
          ) : (
            <>
              <div className="flex flex-wrap gap-3 border-b border-violet-100 bg-white px-5 py-4">
                <DirectoryTabButton
                  active={directoryTab === "active"}
                  label="Active Users"
                  count={activeUsers}
                  onClick={() => setDirectoryTab("active")}
                />
                <DirectoryTabButton
                  active={directoryTab === "suspended"}
                  label="Suspended Users"
                  count={suspendedUsers}
                  onClick={() => setDirectoryTab("suspended")}
                  tone="rose"
                />
              </div>

              {isEditing ? (
                <EditableDirectoryTable
                  users={visibleDraftUsers}
                  saving={saving}
                  roleOptions={activeRoleOptions}
                  onChange={updateDraftUser}
                  onGeneratePassword={generateDraftPassword}
                />
              ) : (
                <ReadOnlyDirectoryTable rows={visibleRows} />
              )}
            </>
          )}
        </div>
      </div>

      {createUserOpen ? (
        <CreateUserModal
          user={newUserDraft}
          saving={saving}
          roleOptions={activeRoleOptions}
          onChange={updateNewUserDraft}
          onGeneratePassword={() => updateNewUserDraft("temporaryPassword", generateTemporaryPassword())}
          onCancel={() => {
            if (saving) return;
            setCreateUserOpen(false);
          }}
          onSave={saveNewUser}
        />
      ) : null}
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-[22px] border border-violet-100 bg-white p-5 shadow-sm">
      <div className={`text-[11px] font-bold uppercase tracking-[0.22em] ${tone}`}>{label}</div>
      <div className="mt-3 text-3xl font-black text-slate-950">{value}</div>
    </div>
  );
}

function DirectoryTabButton({
  active,
  label,
  count,
  onClick,
  tone = "violet",
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
  tone?: "violet" | "rose";
}) {
  const activeClass =
    tone === "rose"
      ? "border-rose-200 bg-rose-50 text-rose-700 shadow-sm"
      : "border-violet-200 bg-violet-50 text-violet-700 shadow-sm";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-3 rounded-2xl border px-5 py-3 text-sm font-black transition ${
        active ? activeClass : "border-slate-200 bg-white text-slate-500 hover:border-violet-200 hover:text-violet-700"
      }`}
    >
      <span>{label}</span>
      <span className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-900">{count}</span>
    </button>
  );
}

function ReadOnlyDirectoryTable({ rows }: { rows: Array<UserAccount & { effectiveRole: UserRole; normalizedUsername: string; status: UserStatus }> }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-left text-sm">
        <thead>
          <tr className="bg-slate-950 text-white">
            <th className="px-5 py-4 font-bold">User</th>
            <th className="px-5 py-4 font-bold">Agent Name</th>
            <th className="px-5 py-4 font-bold">Email</th>
            <th className="px-5 py-4 font-bold">Role</th>
            <th className="px-5 py-4 font-bold">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.username} className="border-b border-slate-100 last:border-b-0">
              <td className="px-5 py-4">
                <div className="font-black text-slate-950">{row.displayName}</div>
                <div className="mt-0.5 text-xs font-semibold text-slate-500">{row.username}</div>
              </td>
              <td className="px-5 py-4 text-slate-600">{row.agentName || "-"}</td>
              <td className="px-5 py-4 text-slate-600">{row.email || "-"}</td>
              <td className="px-5 py-4">
                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${roleBadgeClass(row.effectiveRole)}`}>
                  {row.effectiveRole}
                </span>
              </td>
              <td className="px-5 py-4">
                <div className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${row.status === "Active" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
                  {row.status}
                </div>
                {row.suspendReason ? <div className="mt-1 text-xs text-slate-500">{row.suspendReason}</div> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RoleManagementPanel({
  roles,
  newRoleName,
  newRoleDescription,
  saving,
  onNameChange,
  onDescriptionChange,
  onSave,
  onToggle,
}: {
  roles: RoleDefinition[];
  newRoleName: string;
  newRoleDescription: string;
  saving: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onSave: () => void;
  onToggle: (role: RoleDefinition) => void;
}) {
  return (
    <div className="p-5">
      <div className="grid gap-4 rounded-[24px] border border-violet-100 bg-violet-50/50 p-5 lg:grid-cols-[1fr_1.4fr_auto] lg:items-end">
        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">New Role Name</span>
          <input
            value={newRoleName}
            disabled={saving}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="e.g. Trainer, QA Lead, Manager"
            className="mt-2 w-full rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50"
          />
        </label>
        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">Description</span>
          <input
            value={newRoleDescription}
            disabled={saving}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder="Short explanation for this role"
            className="mt-2 w-full rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50"
          />
        </label>
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-3 text-sm font-black text-white shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add Role
        </button>
      </div>

      <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-100">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-slate-950 text-white">
              <th className="px-5 py-4 font-bold">Role</th>
              <th className="px-5 py-4 font-bold">Description</th>
              <th className="px-5 py-4 font-bold">Status</th>
              <th className="px-5 py-4 font-bold">Control</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.name} className="border-b border-slate-100 last:border-b-0">
                <td className="px-5 py-4">
                  <div className="font-black text-slate-950">{role.name}</div>
                  <div className="mt-0.5 text-xs font-semibold text-slate-500">
                    {role.locked ? "Locked system role" : role.createdBy ? `Updated by ${role.createdBy}` : "Custom role"}
                  </div>
                </td>
                <td className="px-5 py-4 text-slate-600">{role.description || "-"}</td>
                <td className="px-5 py-4">
                  <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${role.active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
                    {role.active ? "Active" : "Disabled"}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <button
                    type="button"
                    disabled={saving || role.locked}
                    onClick={() => onToggle(role)}
                    className="rounded-2xl border border-violet-200 bg-white px-4 py-2 text-sm font-bold text-violet-700 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                  >
                    {role.active ? "Disable" : "Enable"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
        Step 1 stores custom role names only. Menu permissions still follow protected system roles until permission mapping is added later.
      </div>
    </div>
  );
}

function EditableDirectoryTable({
  users,
  saving,
  roleOptions,
  onChange,
  onGeneratePassword,
}: {
  users: Array<{ user: EditableUser; index: number }>;
  saving: boolean;
  roleOptions: string[];
  onChange: (index: number, key: keyof EditableUser, value: string) => void;
  onGeneratePassword: (index: number) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1220px] border-collapse text-left text-sm">
        <thead>
          <tr className="bg-slate-950 text-white">
            <th className="px-4 py-4 font-bold">Username</th>
            <th className="px-4 py-4 font-bold">Display Name</th>
            <th className="px-4 py-4 font-bold">Agent Name</th>
            <th className="px-4 py-4 font-bold">Email</th>
            <th className="px-4 py-4 font-bold">Role</th>
            <th className="px-4 py-4 font-bold">Status</th>
            <th className="px-4 py-4 font-bold">Suspend Reason</th>
            <th className="px-4 py-4 font-bold">Access Password</th>
          </tr>
        </thead>
        <tbody>
          {users.map(({ user, index }) => {
            const isSongpon = normalizeUsername(user.username) === "songpon";
            return (
              <tr key={`${user.username || "new"}-${index}`} className="border-b border-slate-100 last:border-b-0">
                <td className="px-4 py-4">
                  <TextInput value={user.username} disabled={saving || isSongpon} onChange={(value) => onChange(index, "username", value)} />
                </td>
                <td className="px-4 py-4">
                  <TextInput value={user.displayName} disabled={saving} onChange={(value) => onChange(index, "displayName", value)} />
                </td>
                <td className="px-4 py-4">
                  <TextInput value={user.agentName} disabled={saving} onChange={(value) => onChange(index, "agentName", value)} />
                </td>
                <td className="px-4 py-4">
                  <TextInput value={user.email} disabled={saving} onChange={(value) => onChange(index, "email", value)} />
                </td>
                <td className="px-4 py-4">
                  <select
                    value={user.role}
                    disabled={saving || isSongpon}
                    onChange={(event) => onChange(index, "role", event.target.value)}
                    className="min-w-[170px] rounded-2xl border border-violet-100 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-4">
                  <select
                    value={user.status}
                    disabled={saving || isSongpon}
                    onChange={(event) => onChange(index, "status", event.target.value)}
                    className="min-w-[140px] rounded-2xl border border-violet-100 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-4">
                  <TextInput value={user.suspendReason} disabled={saving || user.status === "Active"} onChange={(value) => onChange(index, "suspendReason", value)} />
                </td>
                <td className="px-4 py-4">
                  <div className="flex min-w-[250px] items-center gap-2">
                    <input
                      type="text"
                      value={user.temporaryPassword}
                      disabled={saving}
                      onChange={(event) => onChange(index, "temporaryPassword", event.target.value)}
                      placeholder="Generate temporary password"
                      className="w-full rounded-2xl border border-violet-100 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                    />
                    <button
                      type="button"
                      disabled={saving || !user.username}
                      onClick={() => onGeneratePassword(index)}
                      className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-black text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Generate
                    </button>
                  </div>
                  <div className="mt-1 text-[11px] font-semibold text-slate-500">
                    Temporary password expires in 15 days and forces password setup after login.
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CreateUserModal({
  user,
  saving,
  roleOptions,
  onChange,
  onGeneratePassword,
  onCancel,
  onSave,
}: {
  user: EditableUser;
  saving: boolean;
  roleOptions: string[];
  onChange: (key: keyof EditableUser, value: string) => void;
  onGeneratePassword: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-3xl overflow-hidden rounded-[30px] bg-white shadow-[0_30px_90px_rgba(15,23,42,0.35)]">
        <div className="border-b border-violet-100 bg-gradient-to-r from-violet-950 via-violet-800 to-fuchsia-700 px-6 py-5 text-white">
          <div className="text-[11px] font-black uppercase tracking-[0.24em] text-violet-200">New Access</div>
          <div className="mt-2 text-2xl font-black">Create User</div>
          <div className="mt-1 text-sm font-semibold text-violet-100">
            Create a new dashboard account with role, status, email, and temporary password.
          </div>
        </div>

        <div className="grid gap-4 p-6 md:grid-cols-2">
          <ModalField label="Username" value={user.username} onChange={(value) => onChange("username", value)} placeholder="e.g. anucha" />
          <ModalField label="Display Name" value={user.displayName} onChange={(value) => onChange("displayName", value)} placeholder="Full name" />
          <ModalField label="Agent Name" value={user.agentName} onChange={(value) => onChange("agentName", value)} placeholder="Name used in RawData" />
          <ModalField label="Email" value={user.email} onChange={(value) => onChange("email", value)} placeholder="name@robinhood.co.th" />

          <label className="block">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">Role</span>
            <select
              value={user.role}
              disabled={saving}
              onChange={(event) => onChange("role", event.target.value)}
              className="mt-2 w-full rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50"
            >
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">Status</span>
            <select
              value={user.status}
              disabled={saving}
              onChange={(event) => onChange("status", event.target.value)}
              className="mt-2 w-full rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <div className="md:col-span-2">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">Temporary Password</span>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={user.temporaryPassword}
                  disabled={saving}
                  onChange={(event) => onChange("temporaryPassword", event.target.value)}
                  className="w-full rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50"
                />
                <button
                  type="button"
                  disabled={saving}
                  onClick={onGeneratePassword}
                  className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Generate
                </button>
              </div>
              <div className="mt-2 text-xs font-semibold text-slate-500">
                This password expires in 15 days. User must create a new password after login.
              </div>
            </label>
          </div>

          <div className="md:col-span-2">
            <ModalField
              label="Suspend Reason"
              value={user.suspendReason}
              onChange={(value) => onChange("suspendReason", value)}
              placeholder="Required only when status is Suspended"
              disabled={saving || user.status === "Active"}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-5">
          <button type="button" onClick={onCancel} disabled={saving} className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={onSave} disabled={saving} className="rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-3 text-sm font-black text-white shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? "Creating..." : "Create User"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalField({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">{label}</span>
      <input
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
      />
    </label>
  );
}

function TextInput({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="w-full min-w-[170px] rounded-2xl border border-violet-100 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
    />
  );
}
