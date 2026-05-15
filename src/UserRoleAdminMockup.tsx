import React, { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import PageHero from "./PageHero";
import { registerTHSarabunNew } from "./THSarabunNew-jsPDF";
import { fetchUsageLogs, logUsageEvent, UsageLogEvent } from "./usageLog";

type UserRole = string;
type UserStatus = "Active" | "Suspended";
type RolePermissionKey =
  | "viewDashboard"
  | "viewAllAgents"
  | "viewSummary"
  | "viewCoaching"
  | "viewAppeal"
  | "submitAppeal"
  | "reviewAppeals"
  | "appealOverride"
  | "viewRubric"
  | "viewUsageLog"
  | "exportPdf"
  | "exportAppealRawdata"
  | "manageUsers"
  | "manageRoles"
  | "resetPassword"
  | "manageMaintenance"
  | "useTeamChat";

type RolePermissions = Record<RolePermissionKey, boolean>;
type RolePermissionMap = Record<string, RolePermissions>;

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
type AdminTab = "users" | "roles" | "maintenance";
type RoleAdminSubTab = "role-list" | "permission-builder";

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

type MaintenanceState = {
  enabled: boolean;
  message: string;
  updatedAt: string;
  updatedBy: string;
};

type UserRoleAdminMockupProps = {
  accounts: UserAccount[];
  currentUser: CurrentUser;
  roleOverrides: Record<string, UserRole>;
  rolePermissions: RolePermissionMap;
  maintenanceState: MaintenanceState;
  onMaintenanceChanged: () => void | Promise<void>;
  onRolesChanged: () => void | Promise<void>;
};

const ROLE_OPTIONS: UserRole[] = ["Admin Live Chat", "Senior", "Supervisor", "Quality Assurance"];
const STATUS_OPTIONS: UserStatus[] = ["Active", "Suspended"];
const PERMISSION_DEFINITIONS: Array<{
  key: RolePermissionKey;
  label: string;
  category: "Performance" | "Review" | "Account" | "System";
  description: string;
}> = [
  { key: "viewDashboard", label: "View Dashboard", category: "Performance", description: "Open Dashboard and case performance views." },
  { key: "viewAllAgents", label: "View All Agents", category: "Performance", description: "Allow this role to use All Agents and see every agent in Dashboard/Summary." },
  { key: "viewSummary", label: "View Summary", category: "Performance", description: "Open team/month summary pages." },
  { key: "viewCoaching", label: "View Coaching", category: "Performance", description: "Open coaching insight and agent guidance." },
  { key: "viewAppeal", label: "View Appeal", category: "Review", description: "Open appeal page and appeal information." },
  { key: "submitAppeal", label: "Submit Appeal", category: "Review", description: "Submit appeal reason from case detail." },
  { key: "reviewAppeals", label: "Review Appeals", category: "Review", description: "Open Appeal Requests and approve/reject requests." },
  { key: "appealOverride", label: "Appeal Override", category: "Review", description: "Allow specific late cases to submit appeal." },
  { key: "viewRubric", label: "View QA Rubric", category: "Review", description: "Open QA scoring standard page." },
  { key: "viewUsageLog", label: "View Usage Log", category: "Account", description: "Open system usage log and export logs." },
  { key: "exportPdf", label: "Export PDF", category: "Account", description: "Generate PDF reports where available." },
  { key: "exportAppealRawdata", label: "Export Appeal ROWDATA", category: "Account", description: "Export reviewed appeal data for RawData update." },
  { key: "resetPassword", label: "Reset Password", category: "Account", description: "Approve/reset user password requests." },
  { key: "manageUsers", label: "Manage Users", category: "System", description: "Create users, edit profiles, suspend accounts." },
  { key: "manageRoles", label: "Manage Roles", category: "System", description: "Create roles and edit role permissions." },
  { key: "manageMaintenance", label: "Maintenance Mode", category: "System", description: "Turn system maintenance on/off and bypass it." },
  { key: "useTeamChat", label: "Use Team Chat", category: "System", description: "Open Team Chat and send messages/files." },
];

const PERMISSION_KEYS = PERMISSION_DEFINITIONS.map((item) => item.key);

const ROLE_PERMISSION_DEFAULTS: Record<string, RolePermissions> = {
  "Admin Live Chat": {
    viewDashboard: true,
    viewAllAgents: false,
    viewSummary: true,
    viewCoaching: false,
    viewAppeal: true,
    submitAppeal: true,
    reviewAppeals: false,
    appealOverride: false,
    viewRubric: true,
    viewUsageLog: false,
    exportPdf: false,
    exportAppealRawdata: false,
    manageUsers: false,
    manageRoles: false,
    resetPassword: false,
    manageMaintenance: false,
    useTeamChat: true,
  },
  Agent: {
    viewDashboard: true,
    viewAllAgents: false,
    viewSummary: true,
    viewCoaching: false,
    viewAppeal: true,
    submitAppeal: true,
    reviewAppeals: false,
    appealOverride: false,
    viewRubric: true,
    viewUsageLog: false,
    exportPdf: false,
    exportAppealRawdata: false,
    manageUsers: false,
    manageRoles: false,
    resetPassword: false,
    manageMaintenance: false,
    useTeamChat: true,
  },
  Senior: {
    viewDashboard: true,
    viewAllAgents: true,
    viewSummary: true,
    viewCoaching: true,
    viewAppeal: true,
    submitAppeal: true,
    reviewAppeals: false,
    appealOverride: false,
    viewRubric: true,
    viewUsageLog: false,
    exportPdf: true,
    exportAppealRawdata: false,
    manageUsers: false,
    manageRoles: false,
    resetPassword: false,
    manageMaintenance: false,
    useTeamChat: true,
  },
  Supervisor: {
    viewDashboard: true,
    viewAllAgents: true,
    viewSummary: true,
    viewCoaching: true,
    viewAppeal: true,
    submitAppeal: true,
    reviewAppeals: true,
    appealOverride: true,
    viewRubric: true,
    viewUsageLog: false,
    exportPdf: true,
    exportAppealRawdata: true,
    manageUsers: false,
    manageRoles: false,
    resetPassword: true,
    manageMaintenance: false,
    useTeamChat: true,
  },
  "Quality Assurance": Object.fromEntries(PERMISSION_KEYS.map((key) => [key, true])) as RolePermissions,
};

function getDefaultRolePermissions(role: UserRole): RolePermissions {
  return {
    ...ROLE_PERMISSION_DEFAULTS["Admin Live Chat"],
    ...(ROLE_PERMISSION_DEFAULTS[role] || {}),
  };
}

function buildRoleDefinitions(logs: UsageLogEvent[]) {
  const roleMap = new Map<string, RoleDefinition>();
  ROLE_OPTIONS.forEach((role) => {
      roleMap.set(role.toLowerCase(), {
        name: role,
        description:
          role === "Quality Assurance"
            ? "System admin role with protected access."
            : role === "Admin Live Chat"
              ? "Default live chat team role with scoped dashboard access."
              : "Default system role.",
      active: true,
      createdAt: "",
      createdBy: "System",
      locked: role === "Quality Assurance",
    });
  });

  [...logs]
    .sort((a, b) => new Date(a.created_at || "").getTime() - new Date(b.created_at || "").getTime())
    .forEach((log) => {
      if (log.event_type !== "role_definition_saved" && log.event_type !== "role_definition_deleted") return;
      const name = String(log.details?.name || "").trim();
      if (!name) return;
      if (log.event_type === "role_definition_deleted") {
        roleMap.delete(name.toLowerCase());
        return;
      }
      roleMap.set(name.toLowerCase(), {
        name,
        description: String(log.details?.description || ""),
        active: log.details?.active === false ? false : true,
        createdAt: String(log.details?.updatedAt || log.created_at || ""),
        createdBy: String(log.details?.updatedBy || log.display_name || log.username || ""),
        locked: name === "Quality Assurance",
      });
    });

  const latestProfileRoles = new Set<string>();
  const seenProfiles = new Set<string>();
  logs.forEach((log) => {
    if (log.event_type !== "user_profile_saved" && log.event_type !== "user_role_updated") return;
    const username = String(log.target_agent || log.details?.username || "").trim().toLowerCase();
    if (!username || seenProfiles.has(username)) return;
    const role = String(log.details?.role || log.details?.newRole || "").trim();
    if (!role) return;
    seenProfiles.add(username);
    latestProfileRoles.add(role);
  });

  latestProfileRoles.forEach((role) => {
    const key = role.toLowerCase();
    if (roleMap.has(key)) return;
    roleMap.set(key, {
      name: role,
      description: "Role is still assigned to active user profiles.",
      active: true,
      createdAt: "",
      createdBy: "System",
      locked: role === "Quality Assurance",
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

function isSystemRole(roleName: string) {
  return ROLE_OPTIONS.some((role) => role.toLowerCase() === roleName.toLowerCase());
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
    role: "Admin Live Chat",
    status: "Active",
    suspendReason: "",
    temporaryPassword: generateTemporaryPassword(),
  };
}

export default function UserRoleAdminMockup({
  accounts,
  currentUser,
  roleOverrides,
  rolePermissions,
  maintenanceState,
  onMaintenanceChanged,
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
  const [permissionDrafts, setPermissionDrafts] = useState<RolePermissionMap>(rolePermissions);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");
  const [maintenanceMessage, setMaintenanceMessage] = useState(maintenanceState.message);

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
          effectiveRole: account.role,
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

  useEffect(() => {
    setMaintenanceMessage(maintenanceState.message);
  }, [maintenanceState.message]);

  useEffect(() => {
    setPermissionDrafts(rolePermissions);
  }, [rolePermissions]);

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
      const userCount = rows.filter((row) => row.effectiveRole.toLowerCase() === role.name.toLowerCase()).length;
      setMessage(`Cannot disable ${role.name}. ${userCount} user(s) are still assigned to this role. Move them to another role first.`);
      return;
    }
    await saveRoleDefinition({ ...role, active: !role.active });
  };

  const deleteRoleDefinition = async (role: RoleDefinition) => {
    if (role.locked) {
      setMessage("Quality Assurance role is locked for system safety.");
      return;
    }
    const roleInUse = rows.some((row) => row.effectiveRole.toLowerCase() === role.name.toLowerCase());
    if (roleInUse) {
      const userCount = rows.filter((row) => row.effectiveRole.toLowerCase() === role.name.toLowerCase()).length;
      setMessage(`Cannot delete ${role.name}. ${userCount} user(s) are still assigned to this role. Move them to another role first.`);
      return;
    }

    setSaving(true);
    setMessage("");
    await logUsageEvent(currentUser, "role_definition_deleted", {
      tab: "user-roles",
      details: {
        name: role.name,
        deletedBy: currentUser?.displayName || currentUser?.username || "",
        deletedAt: new Date().toISOString(),
      },
    });
    await loadRoleDefinitions();
    await onRolesChanged();
    setSaving(false);
    setMessage(`Deleted role ${role.name}.`);
  };

  const saveRoleDetails = async (role: RoleDefinition, nextName: string, nextDescription: string) => {
    const cleanedName = nextName.trim();
    const cleanedDescription = nextDescription.trim();
    if (!cleanedName) {
      setMessage("Role name is required.");
      return;
    }

    const roleInUse = rows.some((row) => row.effectiveRole.toLowerCase() === role.name.toLowerCase());
    const nameChanged = cleanedName.toLowerCase() !== role.name.toLowerCase();
    if (nameChanged && (role.locked || isSystemRole(role.name) || roleInUse)) {
      setMessage("Role name can be changed only for custom roles that have no assigned users.");
      return;
    }
    if (nameChanged && roleDefinitions.some((item) => item.name.toLowerCase() === cleanedName.toLowerCase())) {
      setMessage(`Role already exists: ${cleanedName}`);
      return;
    }

    setSaving(true);
    setMessage("");
    if (nameChanged) {
      await logUsageEvent(currentUser, "role_definition_deleted", {
        tab: "user-roles",
        details: {
          name: role.name,
          deletedBy: currentUser?.displayName || currentUser?.username || "",
          deletedAt: new Date().toISOString(),
        },
      });
    }
    await logUsageEvent(currentUser, "role_definition_saved", {
      tab: "user-roles",
      details: {
        name: cleanedName,
        description: cleanedDescription,
        active: role.active,
        updatedBy: currentUser?.displayName || currentUser?.username || "",
        updatedAt: new Date().toISOString(),
      },
    });
    await loadRoleDefinitions();
    await onRolesChanged();
    setSaving(false);
    setMessage(`Saved role ${cleanedName}.`);
  };

  const updateRolePermission = (roleName: string, key: RolePermissionKey, value: boolean) => {
    if (roleName === "Quality Assurance" && (key === "manageUsers" || key === "manageRoles" || key === "manageMaintenance")) {
      setMessage("Quality Assurance admin permissions are locked for system safety.");
      return;
    }
    setPermissionDrafts((currentDrafts) => ({
      ...currentDrafts,
      [roleName]: {
        ...(currentDrafts[roleName] || getDefaultRolePermissions(roleName)),
        [key]: value,
      },
    }));
  };

  const saveRolePermissions = async () => {
    setSaving(true);
    setMessage("");

    for (const role of roleDefinitions) {
      const nextPermissions = {
        ...getDefaultRolePermissions(role.name),
        ...(permissionDrafts[role.name] || {}),
      };
      if (role.name === "Quality Assurance") {
        nextPermissions.manageUsers = true;
        nextPermissions.manageRoles = true;
        nextPermissions.manageMaintenance = true;
      }
      await logUsageEvent(currentUser, "role_permissions_saved", {
        tab: "user-roles",
        details: {
          roleName: role.name,
          permissions: nextPermissions,
          updatedBy: currentUser?.displayName || currentUser?.username || "",
          updatedAt: new Date().toISOString(),
        },
      });
    }

    await onRolesChanged();
    setSaving(false);
    setMessage("Saved role permission matrix. Menu access will update automatically.");
  };

  const saveMaintenanceMode = async (enabled: boolean) => {
    setSaving(true);
    setMessage("");
    await logUsageEvent(currentUser, "system_maintenance_saved", {
      tab: "user-roles",
      details: {
        enabled,
        message: maintenanceMessage.trim() || "QA Dashboard is under maintenance. Please try again later.",
        updatedBy: currentUser?.displayName || currentUser?.username || "",
        updatedAt: new Date().toISOString(),
      },
    });
    await onMaintenanceChanged();
    setSaving(false);
    setMessage(enabled ? "Maintenance mode is now ON. Non-admin users cannot access the system." : "Maintenance mode is now OFF. Users can access the system again.");
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
        title="Account Administration"
        subtitle="Manage user accounts, access permissions, and system availability from one administration console."
        workspaceTitle="Administration Console"
        workspaceSubtitle="Controlled access management for QA Dashboard"
      />

      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-5 lg:px-6 2xl:px-8">
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Total Users" value={totalUsers} tone="text-violet-600" />
          <MetricCard label="Active" value={activeUsers} tone="text-emerald-600" />
          <MetricCard label="Suspended" value={suspendedUsers} tone="text-rose-600" />
          <MetricCard label="Senior" value={seniorUsers} tone="text-amber-600" />
          <MetricCard label="Supervisors" value={supervisorUsers} tone="text-sky-600" />
          <MetricCard label="Quality Assurance" value={qaUsers} tone="text-fuchsia-600" />
        </div>

        <div className="mt-6 rounded-[28px] border border-slate-200 bg-white p-3 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
          <div className="grid gap-3 lg:grid-cols-3">
            <AdminPrimaryTabButton
              active={adminTab === "users"}
              title="User Management"
              description="Manage user profiles and account status"
              count={totalUsers}
              onClick={() => setAdminTab("users")}
            />
            <AdminPrimaryTabButton
              active={adminTab === "roles"}
              title="Access Control"
              description="Configure roles and permissions"
              count={roleDefinitions.length}
              onClick={() => setAdminTab("roles")}
            />
            <AdminPrimaryTabButton
              active={adminTab === "maintenance"}
              title="System Maintenance"
              description={maintenanceState.enabled ? "Maintenance mode is active" : "System is open for users"}
              count={maintenanceState.enabled ? 1 : 0}
              tone={maintenanceState.enabled ? "amber" : "slate"}
              onClick={() => setAdminTab("maintenance")}
            />
          </div>
        </div>

        {message ? (
          <div className="mt-4 rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-bold text-violet-700 shadow-sm">
            {message}
          </div>
        ) : null}
        {accessMessage ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
            Temporary access password(s): {accessMessage}
          </div>
        ) : null}

        {adminTab === "users" ? (
          <div className="mt-5 overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_22px_70px_rgba(15,23,42,0.07)]">
            <div className="flex flex-col gap-4 border-b border-slate-200 bg-white px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-6">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-700">User Management</div>
                <div className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Corporate User Directory</div>
                <div className="mt-1 text-sm leading-6 text-slate-500">
                  {isEditing
                    ? "Edit account information and save all directory changes in one action."
                    : "Review user profiles, registered emails, assigned roles, and account availability."}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                {isEditing ? (
                  <>
                    <button type="button" onClick={handleCancelEdit} className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50">
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveDirectory}
                      disabled={saving}
                      className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={openCreateUserModal} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-violet-800">
                      Create User
                    </button>
                    <button type="button" onClick={handleExportPdf} className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:border-violet-200 hover:text-violet-700">
                      Export PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDraftUsers(rows.map((row) => toEditableUser({ ...row, role: row.effectiveRole })));
                        setIsEditing(true);
                        setMessage("");
                      }}
                      className="rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-3 text-sm font-bold text-white shadow-[0_14px_30px_rgba(109,40,217,0.20)] transition hover:opacity-95"
                    >
                      Edit Directory
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-4">
              <div className="inline-flex flex-wrap gap-2 rounded-[22px] border border-slate-200 bg-white p-1.5">
                <DirectoryTabButton
                  active={directoryTab === "active"}
                  label="Active Accounts"
                  count={activeUsers}
                  onClick={() => setDirectoryTab("active")}
                />
                <DirectoryTabButton
                  active={directoryTab === "suspended"}
                  label="Suspended Accounts"
                  count={suspendedUsers}
                  onClick={() => setDirectoryTab("suspended")}
                  tone="rose"
                />
              </div>
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
          </div>
        ) : adminTab === "roles" ? (
          <div className="mt-5 overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_22px_70px_rgba(15,23,42,0.07)]">
            <div className="border-b border-slate-200 bg-white px-5 py-5 lg:px-6">
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-700">Access Control</div>
              <div className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Role & Permission Management</div>
              <div className="mt-1 text-sm leading-6 text-slate-500">Create roles, update role descriptions, and control what each role can access.</div>
            </div>
            <RoleManagementPanel
              roles={roleDefinitions}
              roleUserCounts={rows.reduce((counts, row) => {
                counts[row.effectiveRole] = (counts[row.effectiveRole] || 0) + 1;
                return counts;
              }, {} as Record<string, number>)}
              newRoleName={newRoleName}
              newRoleDescription={newRoleDescription}
              saving={saving}
              onNameChange={setNewRoleName}
              onDescriptionChange={setNewRoleDescription}
              onSave={() => void saveRoleDefinition()}
              onSaveRoleDetails={(role, name, description) => void saveRoleDetails(role, name, description)}
              onToggle={(role) => void toggleRoleActive(role)}
              onDelete={(role) => void deleteRoleDefinition(role)}
              permissionDrafts={permissionDrafts}
              onPermissionChange={updateRolePermission}
              onSavePermissions={() => void saveRolePermissions()}
            />
          </div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_22px_70px_rgba(15,23,42,0.07)]">
            <div className="border-b border-slate-200 bg-white px-5 py-5 lg:px-6">
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-700">System Maintenance</div>
              <div className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Maintenance Control Center</div>
              <div className="mt-1 text-sm leading-6 text-slate-500">Temporarily restrict access while updating system configuration or QA data.</div>
            </div>
            <MaintenancePanel
              saving={saving}
              maintenanceState={maintenanceState}
              maintenanceMessage={maintenanceMessage}
              onMessageChange={setMaintenanceMessage}
              onSaveMaintenanceMode={saveMaintenanceMode}
            />
          </div>
        )}
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

function MaintenancePanel({
  saving,
  maintenanceState,
  maintenanceMessage,
  onMessageChange,
  onSaveMaintenanceMode,
}: {
  saving: boolean;
  maintenanceState: MaintenanceState;
  maintenanceMessage: string;
  onMessageChange: (value: string) => void;
  onSaveMaintenanceMode: (enabled: boolean) => void | Promise<void>;
}) {
  return (
    <div className="bg-slate-50/70 p-5 lg:p-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className={`rounded-[28px] border bg-white p-6 shadow-sm ${maintenanceState.enabled ? "border-amber-200" : "border-slate-200"}`}>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Operational Control</div>
              <div className="mt-2 text-2xl font-black text-slate-950">
                {maintenanceState.enabled ? "Maintenance Mode is ON" : "Maintenance Mode is OFF"}
              </div>
              <div className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
                When enabled, non-admin users cannot access QA Dashboard and usage logging is paused for them. Use this while editing data, roles, or system configuration.
              </div>
            </div>
            <div className={`inline-flex rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.14em] ${
              maintenanceState.enabled
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}>
              {maintenanceState.enabled ? "Protected" : "Open"}
            </div>
          </div>

          <label className="mt-6 block">
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Message shown to users</div>
            <textarea
              value={maintenanceMessage}
              onChange={(event) => onMessageChange(event.target.value)}
              className="mt-3 min-h-[120px] w-full rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-semibold leading-6 text-slate-800 outline-none transition focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
            />
          </label>

          {maintenanceState.updatedBy ? (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-500">
              Last updated by {maintenanceState.updatedBy}
            </div>
          ) : null}
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Action Panel</div>
          <div className="mt-2 text-xl font-black text-slate-950">Maintenance Switch</div>
          <div className="mt-2 text-sm font-semibold leading-6 text-slate-500">
            Turn maintenance on before making large edits. Turn it off when the system is ready for everyone.
          </div>
          <div className="mt-6 grid gap-3">
            <button
              type="button"
              disabled={saving || maintenanceState.enabled}
              onClick={() => void onSaveMaintenanceMode(true)}
              className="rounded-2xl bg-amber-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Turn On Maintenance
            </button>
            <button
              type="button"
              disabled={saving || !maintenanceState.enabled}
              onClick={() => void onSaveMaintenanceMode(false)}
              className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Turn Off Maintenance
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminPrimaryTabButton({
  active,
  title,
  description,
  count,
  onClick,
  tone = "violet",
}: {
  active: boolean;
  title: string;
  description: string;
  count: number;
  onClick: () => void;
  tone?: "violet" | "amber" | "slate";
}) {
  const toneClass =
    tone === "amber"
      ? "text-amber-700"
      : tone === "slate"
        ? "text-slate-700"
        : "text-violet-700";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[22px] border px-5 py-4 text-left transition ${
        active
          ? "border-violet-200 bg-gradient-to-br from-white to-violet-50 shadow-[0_14px_34px_rgba(109,40,217,0.12)]"
          : "border-transparent bg-white hover:border-slate-200 hover:bg-slate-50"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className={`text-sm font-bold ${active ? toneClass : "text-slate-700"}`}>{title}</div>
          <div className="mt-1 text-xs font-medium leading-5 text-slate-500">{description}</div>
        </div>
        <span className={`inline-flex min-w-8 justify-center rounded-full px-2.5 py-1 text-xs font-bold ${
          active ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"
        }`}>
          {count}
        </span>
      </div>
    </button>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="group rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
      <div className={`text-[11px] font-bold uppercase tracking-[0.18em] ${tone}`}>{label}</div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="text-3xl font-black text-slate-950">{value}</div>
        <div className="h-2 w-10 rounded-full bg-slate-100 transition group-hover:bg-violet-200" />
      </div>
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
  tone?: "violet" | "rose" | "amber" | "slate";
}) {
  const activeClass =
    tone === "rose"
      ? "border-rose-200 bg-white text-rose-700 shadow-[0_10px_24px_rgba(225,29,72,0.10)]"
      : tone === "amber"
        ? "border-amber-200 bg-white text-amber-700 shadow-[0_10px_24px_rgba(217,119,6,0.10)]"
        : tone === "slate"
          ? "border-slate-200 bg-white text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
      : "border-violet-200 bg-white text-violet-700 shadow-[0_10px_24px_rgba(109,40,217,0.12)]";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-3 rounded-[18px] border px-5 py-3 text-sm font-bold transition ${
        active ? activeClass : "border-transparent bg-transparent text-slate-500 hover:bg-white hover:text-violet-700"
      }`}
    >
      <span>{label}</span>
      <span className={`rounded-full px-2.5 py-1 text-xs ${active ? "bg-slate-950 text-white" : "bg-white text-slate-900"}`}>{count}</span>
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
  roleUserCounts,
  newRoleName,
  newRoleDescription,
  saving,
  permissionDrafts,
  onNameChange,
  onDescriptionChange,
  onSave,
  onSaveRoleDetails,
  onToggle,
  onDelete,
  onPermissionChange,
  onSavePermissions,
}: {
  roles: RoleDefinition[];
  roleUserCounts: Record<string, number>;
  newRoleName: string;
  newRoleDescription: string;
  saving: boolean;
  permissionDrafts: RolePermissionMap;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onSave: () => void;
  onSaveRoleDetails: (role: RoleDefinition, name: string, description: string) => void;
  onToggle: (role: RoleDefinition) => void;
  onDelete: (role: RoleDefinition) => void;
  onPermissionChange: (roleName: string, key: RolePermissionKey, value: boolean) => void;
  onSavePermissions: () => void;
}) {
  const activeRoles = roles.filter((role) => role.active);
  const [roleAdminSubTab, setRoleAdminSubTab] = useState<RoleAdminSubTab>("role-list");
  const [editingRoleName, setEditingRoleName] = useState("");
  const [editingRoleDraft, setEditingRoleDraft] = useState({ name: "", description: "" });
  const [selectedRoleName, setSelectedRoleName] = useState(activeRoles[0]?.name || "");
  const selectedRole = activeRoles.find((role) => role.name === selectedRoleName) || activeRoles[0];
  const selectedPermissions = selectedRole
    ? permissionDrafts[selectedRole.name] || getDefaultRolePermissions(selectedRole.name)
    : getDefaultRolePermissions("Agent");
  const enabledPermissionCount = PERMISSION_KEYS.filter((key) => selectedPermissions[key]).length;
  const permissionsByCategory = PERMISSION_DEFINITIONS.reduce((groups, permission) => {
    groups[permission.category] = [...(groups[permission.category] || []), permission];
    return groups;
  }, {} as Record<string, typeof PERMISSION_DEFINITIONS>);

  useEffect(() => {
    if (!activeRoles.length) return;
    if (!selectedRoleName || !activeRoles.some((role) => role.name === selectedRoleName)) {
      setSelectedRoleName(activeRoles[0].name);
    }
  }, [activeRoles, selectedRoleName]);

  return (
    <div className="p-5">
      <div className="mb-5 grid gap-4 lg:grid-cols-[1.1fr_1.4fr]">
        <div className="rounded-[26px] border border-violet-100 bg-gradient-to-br from-slate-950 to-violet-900 p-5 text-white shadow-sm">
          <div className="text-[11px] font-black uppercase tracking-[0.24em] text-violet-200">Role Access Studio</div>
          <div className="mt-3 text-2xl font-black">Roles & Permission Matrix</div>
          <div className="mt-2 text-sm font-semibold leading-6 text-violet-100">
            Control what each role can open, review, export, and administer. Changes affect every user assigned to that role after save.
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <MiniAccessCard label="Active Roles" value={activeRoles.length} />
          <MiniAccessCard label="Permissions" value={PERMISSION_DEFINITIONS.length} />
          <MiniAccessCard label="Locked Admin" value={roles.some((role) => role.name === "Quality Assurance") ? 1 : 0} />
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-3 rounded-[24px] border border-violet-100 bg-white p-3 shadow-sm">
        <button
          type="button"
          onClick={() => setRoleAdminSubTab("role-list")}
          className={`rounded-2xl px-5 py-3 text-sm font-black transition ${
            roleAdminSubTab === "role-list"
              ? "bg-slate-950 text-white shadow-sm"
              : "bg-slate-50 text-slate-600 hover:bg-violet-50 hover:text-violet-700"
          }`}
        >
          1. Role List
        </button>
        <button
          type="button"
          onClick={() => setRoleAdminSubTab("permission-builder")}
          className={`rounded-2xl px-5 py-3 text-sm font-black transition ${
            roleAdminSubTab === "permission-builder"
              ? "bg-slate-950 text-white shadow-sm"
              : "bg-slate-50 text-slate-600 hover:bg-violet-50 hover:text-violet-700"
          }`}
        >
          2. Permission Builder
        </button>
      </div>

      {roleAdminSubTab === "role-list" ? (
      <>
      <div className="mb-4 rounded-[22px] border border-sky-200 bg-sky-50 px-5 py-4 text-sm font-semibold leading-6 text-sky-900">
        <div className="font-black">How to use Role List</div>
        <div className="mt-1">
          Add a role above, or use Edit on each card to update the role text. Disable/Delete is available when no users are assigned.
        </div>
      </div>
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

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {roles.map((role) => {
          const userCount = roleUserCounts[role.name] || 0;
          const editing = editingRoleName === role.name;
          const canRename = !role.locked && !isSystemRole(role.name) && userCount === 0;
          const canToggle = !role.locked && userCount === 0;
          const canDelete = !role.locked && userCount === 0;
          return (
            <div key={role.name} className={`rounded-[26px] border p-5 shadow-sm transition ${
              role.active ? "border-violet-100 bg-white" : "border-rose-100 bg-rose-50/40"
            }`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <div className="space-y-3">
                      <label className="block">
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-700">Role Name</span>
                        <input
                          value={editingRoleDraft.name}
                          disabled={!canRename || saving}
                          onChange={(event) => setEditingRoleDraft((draft) => ({ ...draft, name: event.target.value }))}
                          className="mt-2 w-full rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-50 disabled:text-slate-400"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-700">Description</span>
                        <textarea
                          value={editingRoleDraft.description}
                          disabled={saving}
                          onChange={(event) => setEditingRoleDraft((draft) => ({ ...draft, description: event.target.value }))}
                          className="mt-2 min-h-[86px] w-full rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-50"
                        />
                      </label>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-xl font-black text-slate-950">{role.name}</div>
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${
                          role.active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"
                        }`}>
                          {role.active ? "Active" : "Disabled"}
                        </span>
                      </div>
                      <div className="mt-1 text-xs font-semibold text-slate-500">
                        {role.locked ? "Locked system role" : role.createdBy ? `Updated by ${role.createdBy}` : "Custom role"}
                      </div>
                      <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-600">
                        {role.description || "No description yet. Click Edit to add one."}
                      </div>
                    </>
                  )}
                </div>

                <div className="shrink-0 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-center">
                  <div className="text-2xl font-black text-slate-950">{userCount}</div>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Users</div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs font-semibold text-slate-500">
                  {userCount ? "Assigned users keep this role protected from disable/delete." : canRename ? "Custom role with no users. Full edit is available." : "No users assigned. Status can be changed."}
                </div>
                <div className="flex flex-wrap gap-2">
                  {editing ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingRoleName("");
                          setEditingRoleDraft({ name: "", description: "" });
                        }}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          onSaveRoleDetails(role, editingRoleDraft.name, editingRoleDraft.description);
                          setEditingRoleName("");
                        }}
                        className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-black text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        Save Role
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          setEditingRoleName(role.name);
                          setEditingRoleDraft({ name: role.name, description: role.description || "" });
                        }}
                        className="rounded-2xl border border-violet-200 bg-white px-4 py-2 text-sm font-bold text-violet-700 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:text-slate-400"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={saving || !canToggle}
                        onClick={() => onToggle(role)}
                        className="rounded-2xl border border-amber-200 bg-white px-4 py-2 text-sm font-bold text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                      >
                        {role.active ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        disabled={saving || !canDelete}
                        onClick={() => onDelete(role)}
                        className="rounded-2xl border border-rose-200 bg-white px-4 py-2 text-sm font-bold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-800">
        Tip: Delete is now available for unused roles, including old default roles. If users are assigned, change their role in the Users tab first.
      </div>
      </>
      ) : null}

      {roleAdminSubTab === "permission-builder" ? (
      <div className="overflow-hidden rounded-[28px] border border-violet-100 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-violet-100 bg-gradient-to-r from-white to-violet-50 px-5 py-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-lg font-black text-slate-950">Permission Builder</div>
            <div className="mt-1 text-sm font-semibold text-slate-500">
              Select one role, then turn access on or off by category. This is easier than editing a wide matrix.
            </div>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onSavePermissions}
            className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-black text-white shadow-sm transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {saving ? "Saving..." : "Save Permissions"}
          </button>
        </div>

        <div className="grid gap-5 p-5 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="rounded-[24px] border border-slate-100 bg-slate-50 p-3">
            <div className="px-2 pb-3 text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Choose Role</div>
            <div className="space-y-2">
              {activeRoles.map((role) => {
                const rolePermissions = permissionDrafts[role.name] || getDefaultRolePermissions(role.name);
                const roleEnabledCount = PERMISSION_KEYS.filter((key) => rolePermissions[key]).length;
                const selected = selectedRole?.name === role.name;
                return (
                  <button
                    key={role.name}
                    type="button"
                    onClick={() => setSelectedRoleName(role.name)}
                    className={`w-full rounded-[20px] border px-4 py-3 text-left transition ${
                      selected
                        ? "border-violet-300 bg-white shadow-[0_12px_28px_rgba(109,40,217,0.14)]"
                        : "border-transparent bg-white/70 hover:border-violet-100 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-black text-slate-950">{role.name}</div>
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${
                        role.active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"
                      }`}>
                        {role.active ? "Active" : "Disabled"}
                      </span>
                    </div>
                    <div className="mt-1 text-xs font-semibold text-slate-500">{roleEnabledCount}/{PERMISSION_KEYS.length} permissions enabled</div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500"
                        style={{ width: `${Math.round((roleEnabledCount / PERMISSION_KEYS.length) * 100)}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-w-0">
            {selectedRole ? (
              <>
                <div className="mb-4 rounded-[24px] border border-violet-100 bg-gradient-to-r from-violet-50 to-white p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-700">Editing Permission</div>
                      <div className="mt-1 text-2xl font-black text-slate-950">{selectedRole.name}</div>
                      <div className="mt-1 text-sm font-semibold text-slate-500">{selectedRole.description || "No role description yet."}</div>
                    </div>
                    <div className="rounded-2xl border border-violet-100 bg-white px-4 py-3 text-center shadow-sm">
                      <div className="text-2xl font-black text-violet-700">{enabledPermissionCount}</div>
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Enabled</div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  {Object.entries(permissionsByCategory).map(([category, permissions]) => (
                    <div key={category} className="rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-700">{category}</div>
                        <div className="text-xs font-bold text-slate-400">
                          {permissions.filter((permission) => selectedPermissions[permission.key]).length}/{permissions.length}
                        </div>
                      </div>
                      <div className="space-y-3">
                        {permissions.map((permission) => {
                          const checked = Boolean(selectedPermissions[permission.key]);
                          const locked = selectedRole.name === "Quality Assurance" && (
                            permission.key === "manageUsers" ||
                            permission.key === "manageRoles" ||
                            permission.key === "manageMaintenance"
                          );
                          return (
                            <div key={permission.key} className={`rounded-2xl border px-4 py-3 ${
                              checked ? "border-violet-100 bg-violet-50/50" : "border-slate-100 bg-slate-50/70"
                            }`}>
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <div className="font-black text-slate-950">{permission.label}</div>
                                  <div className="mt-1 text-xs font-semibold leading-5 text-slate-500">{permission.description}</div>
                                  {locked ? <div className="mt-2 text-[10px] font-black uppercase tracking-[0.16em] text-amber-600">Locked for admin safety</div> : null}
                                </div>
                                <label className="inline-flex shrink-0 cursor-pointer items-center justify-center pt-1">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={saving || locked}
                                    onChange={(event) => onPermissionChange(selectedRole.name, permission.key, event.target.checked)}
                                    className="peer sr-only"
                                  />
                                  <span className={`relative h-7 w-12 rounded-full border transition ${
                                    checked
                                      ? "border-violet-500 bg-violet-600"
                                      : "border-slate-200 bg-slate-200"
                                  } ${saving || locked ? "cursor-not-allowed opacity-60" : ""}`}>
                                    <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition ${
                                      checked ? "left-6" : "left-1"
                                    }`} />
                                  </span>
                                </label>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-500">
                No active role selected.
              </div>
            )}
          </div>
        </div>
      </div>
      ) : null}
    </div>
  );
}

function MiniAccessCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[22px] border border-violet-100 bg-white p-5 shadow-sm">
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-600">{label}</div>
      <div className="mt-3 text-3xl font-black text-slate-950">{value}</div>
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
