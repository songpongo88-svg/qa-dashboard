import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";
import { jsPDF } from "jspdf";
import PageHero from "./PageHero";
import { registerTHSarabunNew } from "./THSarabunNew-jsPDF";
import { fetchUsageLogsByEventTypes, logUsageEvent, UsageLogEvent } from "./usageLog";
import {
  deleteStoredRoleDefinition,
  fetchStoredRoleDefinitions,
  upsertStoredMaintenanceState,
  upsertStoredRoleDefinition,
  upsertStoredRolePermissions,
  upsertStoredUserProfiles,
} from "./userRoleStore";

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
  | "manageRubric"
  | "createEvaluation"
  | "takePreTest"
  | "managePreTest"
  | "viewPreTestResults"
  | "viewUsageLog"
  | "exportPdf"
  | "exportAppealRawdata"
  | "viewUserDirectory"
  | "viewAllTeams"
  | "viewOwnTeam"
  | "qaEvaluationTarget"
  | "manageUsers"
  | "manageTeams"
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
  teamLead?: string;
  teamName?: string;
  status?: UserStatus;
  suspendReason?: string;
};

type EditableUser = {
  username: string;
  displayName: string;
  agentName: string;
  email: string;
  teamLead: string;
  teamName: string;
  role: UserRole;
  status: UserStatus;
  suspendReason: string;
  temporaryPassword: string;
};

type TeamDraft = {
  teamName: string;
  teamLead: string;
  roleMode: "keep" | "sync";
  assignedRole: UserRole;
  memberUsernames: string[];
};

type DirectoryTab = "active" | "suspended";
type UserManagementView = "users" | "teams" | "team-management";
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
  { key: "manageRubric", label: "Manage QA Rubric", category: "Review", description: "Show rubric version control and allow End Rubric preview actions." },
  { key: "createEvaluation", label: "Create QA Evaluation", category: "Review", description: "Open Create QA Evaluation and submit new QA assessment records." },
  { key: "takePreTest", label: "Take Pre-Test", category: "Review", description: "Open assigned Pre-Test sets and submit test attempts." },
  { key: "managePreTest", label: "Manage Pre-Test", category: "Review", description: "Create, edit, disable, delete, and share Pre-Test question sets." },
  { key: "viewPreTestResults", label: "View Pre-Test Results", category: "Review", description: "Open Pre-Test history and export attempt results." },
  { key: "viewUsageLog", label: "View Usage Log", category: "Account", description: "Open system usage log and export logs." },
  { key: "exportPdf", label: "Export PDF", category: "Account", description: "Generate PDF reports where available." },
  { key: "exportAppealRawdata", label: "Export Appeal ROWDATA", category: "Account", description: "Export reviewed appeal data for RawData update." },
  { key: "viewUserDirectory", label: "View User Directory", category: "Account", description: "Open Corporate User Directory in read-only mode." },
  { key: "viewAllTeams", label: "View All Teams", category: "Account", description: "See every team and every team member in directory views." },
  { key: "viewOwnTeam", label: "View Own Team", category: "Account", description: "See only members in the same team when all-team access is off." },
  { key: "qaEvaluationTarget", label: "QA Evaluation Target", category: "Review", description: "Users in this role can be selected in Create QA Evaluation and receive QA result tasks." },
  { key: "resetPassword", label: "Reset Password", category: "Account", description: "Approve/reset user password requests." },
  { key: "manageUsers", label: "Manage Users", category: "System", description: "Create users, edit profiles, suspend accounts." },
  { key: "manageTeams", label: "Manage Teams", category: "System", description: "Create team names, assign team leads, and move users between teams." },
  { key: "manageRoles", label: "Manage Roles", category: "System", description: "Create roles and edit role permissions." },
  { key: "manageMaintenance", label: "Maintenance Mode", category: "System", description: "Turn system maintenance on/off and bypass it." },
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
    manageRubric: false,
    createEvaluation: true,
    takePreTest: true,
    managePreTest: false,
    viewPreTestResults: false,
    viewUsageLog: false,
    exportPdf: false,
    exportAppealRawdata: false,
    viewUserDirectory: false,
    viewAllTeams: false,
    viewOwnTeam: true,
    qaEvaluationTarget: true,
    manageUsers: false,
    manageTeams: false,
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
    manageRubric: false,
    createEvaluation: true,
    takePreTest: true,
    managePreTest: false,
    viewPreTestResults: false,
    viewUsageLog: false,
    exportPdf: true,
    exportAppealRawdata: false,
    viewUserDirectory: false,
    viewAllTeams: true,
    viewOwnTeam: true,
    qaEvaluationTarget: true,
    manageUsers: false,
    manageTeams: false,
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
    manageRubric: false,
    createEvaluation: true,
    takePreTest: true,
    managePreTest: false,
    viewPreTestResults: false,
    viewUsageLog: false,
    exportPdf: true,
    exportAppealRawdata: true,
    viewUserDirectory: false,
    viewAllTeams: true,
    viewOwnTeam: true,
    qaEvaluationTarget: true,
    manageUsers: false,
    manageTeams: false,
    manageRoles: false,
    resetPassword: true,
    manageMaintenance: false,
    useTeamChat: true,
  },
  "Quality Assurance": {
    ...(Object.fromEntries(PERMISSION_KEYS.map((key) => [key, true])) as RolePermissions),
    qaEvaluationTarget: false,
  },
};

function getDefaultRolePermissions(role: UserRole): RolePermissions {
  const normalizedRole = normalizeRoleName(role);
  return {
    ...ROLE_PERMISSION_DEFAULTS["Admin Live Chat"],
    ...(ROLE_PERMISSION_DEFAULTS[normalizedRole] || {}),
  };
}

function normalizeRoleName(value: unknown): UserRole {
  const roleName = String(value || "").trim();
  return roleName.toLowerCase() === "agent" ? "Admin Live Chat" : roleName;
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
      const name = normalizeRoleName(log.details?.name);
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
    const role = normalizeRoleName(log.details?.role || log.details?.newRole);
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

function buildRoleDefinitionsFromStore(rows: Array<{
  name: string;
  description: string;
  active: boolean;
  locked: boolean;
  updatedBy: string;
  updatedAt: string;
}>) {
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

  rows.forEach((row) => {
    const name = normalizeRoleName(row.name);
    if (!name) return;
    roleMap.set(name.toLowerCase(), {
      name,
      description: row.description || "",
      active: row.active,
      createdAt: row.updatedAt || "",
      createdBy: row.updatedBy || "System",
      locked: name === "Quality Assurance" || row.locked,
    });
  });

  return Array.from(roleMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function editableToStoredProfile(user: EditableUser) {
  return {
    username: user.username,
    displayName: user.displayName,
    agentName: user.agentName || user.displayName,
    email: user.email,
    role: normalizeRoleName(user.role),
    teamLead: user.teamLead,
    teamName: user.teamName,
    status: user.status,
    suspendReason: user.suspendReason,
  };
}

function roleBadgeClass(role: UserRole) {
  if (role === "Quality Assurance") return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700";
  if (role === "Supervisor") return "border-sky-200 bg-sky-50 text-sky-700";
  if (role === "Senior") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function roleAvatarClass(role: UserRole) {
  if (role === "Quality Assurance") return "from-fuchsia-500 to-violet-700 shadow-fuchsia-100";
  if (role === "Supervisor") return "from-sky-500 to-blue-700 shadow-sky-100";
  if (role === "Senior") return "from-amber-400 to-orange-600 shadow-amber-100";
  return "from-emerald-400 to-teal-700 shadow-emerald-100";
}

function userInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");
}

function getRowRole(row: { role?: UserRole; effectiveRole?: UserRole }) {
  return normalizeRoleName(row.effectiveRole || row.role);
}

function buildTeamGroups<T extends { teamName?: string; teamLead?: string; status?: UserStatus; role?: UserRole; effectiveRole?: UserRole }>(rows: T[]) {
  const teamMap = new Map<string, { teamName: string; teamLead: string; users: T[]; activeCount: number; suspendedCount: number; assignedRole: string; roleCounts: Record<string, number> }>();
  rows.forEach((row) => {
    const teamName = row.teamName?.trim() || "Unassigned Team";
    const existing = teamMap.get(teamName) || {
      teamName,
      teamLead: row.teamLead?.trim() || "-",
      users: [],
      activeCount: 0,
      suspendedCount: 0,
      assignedRole: "-",
      roleCounts: {},
    };
    if ((!existing.teamLead || existing.teamLead === "-") && row.teamLead) existing.teamLead = row.teamLead;
    existing.users.push(row);
    const rowRole = getRowRole(row);
    if (rowRole) existing.roleCounts[rowRole] = (existing.roleCounts[rowRole] || 0) + 1;
    if (row.status === "Suspended") existing.suspendedCount += 1;
    else existing.activeCount += 1;
    teamMap.set(teamName, existing);
  });
  return Array.from(teamMap.values())
    .map((team) => {
      const roleNames = Object.keys(team.roleCounts);
      return {
        ...team,
        assignedRole: roleNames.length === 1 ? roleNames[0] : roleNames.length > 1 ? "Mixed Roles" : "-",
      };
    })
    .sort((a, b) => a.teamName.localeCompare(b.teamName));
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
    teamLead: account.teamLead || "",
    teamName: account.teamName || "",
    role: normalizeRoleName(account.role),
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
    teamLead: "",
    teamName: "",
    role: "Admin Live Chat",
    status: "Active",
    suspendReason: "",
    temporaryPassword: generateTemporaryPassword(),
  };
}

function createBlankTeamDraft(roleOptions: UserRole[]): TeamDraft {
  return {
    teamName: "",
    teamLead: "",
    roleMode: "keep",
    assignedRole: roleOptions[0] || "Admin Live Chat",
    memberUsernames: [],
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
  const [editingUserManagementView, setEditingUserManagementView] = useState<UserManagementView | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [accessMessage, setAccessMessage] = useState("");
  const [draftUsers, setDraftUsers] = useState<EditableUser[]>([]);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [newUserDraft, setNewUserDraft] = useState<EditableUser>(() => createBlankUser());
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [newTeamDraft, setNewTeamDraft] = useState<TeamDraft>(() => createBlankTeamDraft(ROLE_OPTIONS));
  const [directoryTab, setDirectoryTab] = useState<DirectoryTab>("active");
  const [userManagementView, setUserManagementView] = useState<UserManagementView>("users");
  const [adminTab, setAdminTab] = useState<AdminTab>("users");
  const [roleDefinitions, setRoleDefinitions] = useState<RoleDefinition[]>(() => buildRoleDefinitions([]));
  const [permissionDrafts, setPermissionDrafts] = useState<RolePermissionMap>(rolePermissions);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");
  const [maintenanceMessage, setMaintenanceMessage] = useState(maintenanceState.message);
  const isEditing = editingUserManagementView !== null;
  const isEditingUsers = editingUserManagementView === "users";
  const isEditingTeamManagement = editingUserManagementView === "team-management";

  const activeRoleOptions = useMemo(
    () => roleDefinitions.filter((role) => role.active).map((role) => role.name),
    [roleDefinitions]
  );
  const currentPermissions = rolePermissions[currentUser.role] || getDefaultRolePermissions(currentUser.role);
  const canViewUserDirectory = Boolean(currentPermissions.viewUserDirectory || currentPermissions.manageUsers);
  const canViewAllTeams = Boolean(currentPermissions.viewAllTeams || currentPermissions.manageTeams || currentPermissions.manageUsers);
  const canViewOwnTeam = Boolean(currentPermissions.viewOwnTeam || canViewAllTeams);
  const canManageUsers = Boolean(currentPermissions.manageUsers);
  const canManageTeams = Boolean(currentPermissions.manageTeams || currentPermissions.manageUsers);
  const canManageRoles = Boolean(currentPermissions.manageRoles);
  const canManageMaintenance = Boolean(currentPermissions.manageMaintenance);

  const loadRoleDefinitions = async () => {
    try {
      const storedRoles = await fetchStoredRoleDefinitions();
      setRoleDefinitions(buildRoleDefinitionsFromStore(storedRoles));
      return;
    } catch {
      // Fall back to usage logs until the persistent role tables are created.
    }

    try {
      const logs = await fetchUsageLogsByEventTypes([
        "role_definition_saved",
        "role_definition_deleted",
      ], 500);
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
          role: normalizeRoleName(account.role),
          normalizedUsername,
          effectiveRole: normalizeRoleName(account.role),
          teamLead: account.teamLead || "",
          teamName: account.teamName || "",
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

  useEffect(() => {
    if (adminTab === "users" && canViewUserDirectory) return;
    if (adminTab === "roles" && canManageRoles) return;
    if (adminTab === "maintenance" && canManageMaintenance) return;
    if (canViewUserDirectory) {
      setAdminTab("users");
    } else if (canManageRoles) {
      setAdminTab("roles");
    } else if (canManageMaintenance) {
      setAdminTab("maintenance");
    }
  }, [adminTab, canManageMaintenance, canManageRoles, canViewUserDirectory]);

  useEffect(() => {
    if (canManageUsers) return;
    if (editingUserManagementView === "users") setEditingUserManagementView(null);
    if (createUserOpen) setCreateUserOpen(false);
  }, [canManageUsers, createUserOpen, editingUserManagementView]);

  useEffect(() => {
    if (canManageTeams) return;
    if (editingUserManagementView === "team-management") setEditingUserManagementView(null);
  }, [canManageTeams, editingUserManagementView]);

  const totalUsers = rows.length;
  const activeUsers = rows.filter((row) => row.status === "Active").length;
  const suspendedUsers = rows.filter((row) => row.status === "Suspended").length;
  const seniorUsers = rows.filter((row) => row.effectiveRole === "Senior").length;
  const supervisorUsers = rows.filter((row) => row.effectiveRole === "Supervisor").length;
  const qaUsers = rows.filter((row) => row.effectiveRole === "Quality Assurance").length;
  const currentTeamName = rows.find((row) => normalizeUsername(row.username) === normalizeUsername(currentUser.username))?.teamName || "";
  const scopedRows = canViewAllTeams
    ? rows
    : canViewOwnTeam && currentTeamName
      ? rows.filter((row) => row.teamName === currentTeamName)
      : rows.filter((row) => normalizeUsername(row.username) === normalizeUsername(currentUser.username));
  const activeScopedRows = scopedRows.filter((row) => row.status === "Active");
  const teamGroups = buildTeamGroups(activeScopedRows);
  const visibleRows = scopedRows.filter((row) => directoryTab === "active" ? row.status === "Active" : row.status === "Suspended");
  const visibleDraftUsers = draftUsers
    .map((user, index) => ({ user, index }))
    .filter(({ user }) => userManagementView === "users" ? (directoryTab === "active" ? (isEditingUsers ? user.viewStatus || user.status : user.status) === "Active" : (isEditingUsers ? user.viewStatus || user.status : user.status) === "Suspended") : user.status === "Active")
    .filter(({ user }) => canViewAllTeams ? true : !currentTeamName || user.teamName === currentTeamName || normalizeUsername(user.username) === normalizeUsername(currentUser.username));

  const resetDraftUsers = () => {
    setDraftUsers(rows.map((row) => toEditableUser({ ...row, role: row.effectiveRole })));
  };

  const switchUserManagementView = (view: UserManagementView) => {
    if (editingUserManagementView && editingUserManagementView !== view) {
      resetDraftUsers();
      setEditingUserManagementView(null);
      setAccessMessage("");
      setMessage("");
    }
    setUserManagementView(view);
  };

  const startEditingUserManagementView = (view: UserManagementView) => {
    resetDraftUsers();
    setEditingUserManagementView(view);
    setMessage("");
    setAccessMessage("");
  };

  const updateDraftUser = (index: number, key: keyof EditableUser, value: string) => {
    setDraftUsers((currentDrafts) =>
      currentDrafts.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item
      )
    );
  };

  const updateDraftTeam = (teamName: string, key: "teamLead" | "teamName" | "role" | "roleMode", value: string) => {
    setDraftUsers((currentDrafts) =>
      currentDrafts.map((item) => {
        const currentTeamName = item.teamName.trim() || "Unassigned Team";
        if (currentTeamName !== teamName) return item;
        if (key === "roleMode") return item;
        return { ...item, [key]: value };
      })
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

  const openCreateTeamModal = () => {
    if (!isEditingTeamManagement) {
      startEditingUserManagementView("team-management");
      setUserManagementView("team-management");
    }
    setNewTeamDraft(createBlankTeamDraft(activeRoleOptions));
    setMessage("");
    setCreateTeamOpen(true);
  };

  const updateNewTeamDraft = (key: keyof TeamDraft, value: string | string[]) => {
    setNewTeamDraft((currentDraft) => ({ ...currentDraft, [key]: value }));
  };

  const toggleNewTeamMember = (username: string) => {
    setNewTeamDraft((currentDraft) => {
      const normalized = normalizeUsername(username);
      const exists = currentDraft.memberUsernames.some((item) => normalizeUsername(item) === normalized);
      return {
        ...currentDraft,
        memberUsernames: exists
          ? currentDraft.memberUsernames.filter((item) => normalizeUsername(item) !== normalized)
          : [...currentDraft.memberUsernames, username],
      };
    });
  };

  const applyNewTeamDraft = () => {
    const teamName = newTeamDraft.teamName.trim();
    const assignedRole = newTeamDraft.assignedRole.trim();
    if (!teamName) {
      setMessage("Team name is required before creating a team.");
      return;
    }
    if (newTeamDraft.roleMode === "sync" && !assignedRole) {
      setMessage("Assigned Role is required before creating a team.");
      return;
    }
    const duplicateTeam = draftUsers.some((user) => (user.teamName.trim() || "Unassigned Team").toLowerCase() === teamName.toLowerCase());
    if (duplicateTeam) {
      setMessage(`Team already exists: ${teamName}`);
      return;
    }
    if (!newTeamDraft.memberUsernames.length) {
      setMessage("Select at least one member before creating a team.");
      return;
    }

    const selected = new Set(newTeamDraft.memberUsernames.map(normalizeUsername));
    setDraftUsers((currentDrafts) =>
      currentDrafts.map((user) =>
        selected.has(normalizeUsername(user.username))
          ? {
              ...user,
              teamName,
              teamLead: newTeamDraft.teamLead.trim(),
              role: newTeamDraft.roleMode === "sync" ? assignedRole : user.role,
            }
          : user
      )
    );
    setCreateTeamOpen(false);
    setMessage(`Created draft team ${teamName}. Press Save Team Changes to keep it.`);
  };

  const saveRoleDefinition = async (role?: RoleDefinition) => {
    const name = normalizeRoleName(role?.name || newRoleName);
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
    const updatedAt = new Date().toISOString();
    const updatedBy = currentUser?.displayName || currentUser?.username || "";
    try {
      await upsertStoredRoleDefinition({
        name,
        description,
        active: role?.active ?? true,
        locked: name === "Quality Assurance",
        updatedBy,
        updatedAt,
      });
    } catch {
      // Legacy log fallback keeps old deployments usable if the new tables are not installed yet.
    }
    await logUsageEvent(currentUser, "role_definition_saved", {
      tab: "user-roles",
      details: {
        name,
        description,
        active: role?.active ?? true,
        updatedBy,
        updatedAt,
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
    try {
      await deleteStoredRoleDefinition(role.name);
    } catch {
      // Legacy log fallback keeps delete tracked when the store table is not installed yet.
    }
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
    const cleanedName = normalizeRoleName(nextName);
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
      try {
        await deleteStoredRoleDefinition(role.name);
      } catch {
        // Keep going; the legacy log below still records the delete.
      }
      await logUsageEvent(currentUser, "role_definition_deleted", {
        tab: "user-roles",
        details: {
          name: role.name,
          deletedBy: currentUser?.displayName || currentUser?.username || "",
          deletedAt: new Date().toISOString(),
        },
      });
    }
    const updatedAt = new Date().toISOString();
    const updatedBy = currentUser?.displayName || currentUser?.username || "";
    try {
      await upsertStoredRoleDefinition({
        name: cleanedName,
        description: cleanedDescription,
        active: role.active,
        locked: cleanedName === "Quality Assurance" || role.locked === true,
        updatedBy,
        updatedAt,
      });
    } catch {
      // Legacy log fallback keeps role details available if the new table is not installed yet.
    }
    await logUsageEvent(currentUser, "role_definition_saved", {
      tab: "user-roles",
      details: {
        name: cleanedName,
        description: cleanedDescription,
        active: role.active,
        updatedBy,
        updatedAt,
      },
    });
    await loadRoleDefinitions();
    await onRolesChanged();
    setSaving(false);
    setMessage(`Saved role ${cleanedName}.`);
  };

  const updateRolePermission = (roleName: string, key: RolePermissionKey, value: boolean) => {
    const normalizedRoleName = normalizeRoleName(roleName);
    if (normalizedRoleName === "Quality Assurance" && (key === "viewUserDirectory" || key === "manageUsers" || key === "manageRoles" || key === "manageRubric" || key === "manageMaintenance")) {
      setMessage("Quality Assurance admin permissions are locked for system safety.");
      return;
    }
    setPermissionDrafts((currentDrafts) => ({
      ...currentDrafts,
      [normalizedRoleName]: (() => {
        const nextPermissions = {
          ...(currentDrafts[normalizedRoleName] || getDefaultRolePermissions(normalizedRoleName)),
          [key]: value,
        };
        if (key === "manageUsers" && value) {
          nextPermissions.viewUserDirectory = true;
        }
        if (key === "manageTeams" && value) {
          nextPermissions.viewAllTeams = true;
          nextPermissions.viewOwnTeam = true;
          nextPermissions.viewUserDirectory = true;
        }
        if (key === "viewAllTeams" && value) {
          nextPermissions.viewOwnTeam = true;
        }
        if (key === "viewAllTeams" && !value) {
          nextPermissions.manageTeams = false;
        }
        if (key === "viewUserDirectory" && !value) {
          nextPermissions.manageUsers = false;
          nextPermissions.manageTeams = false;
        }
        return nextPermissions;
      })(),
    }));
  };

  const saveRolePermissions = async () => {
    setSaving(true);
    setMessage("");
    const permissionRows: Array<{ roleName: string; permissions: RolePermissions; updatedBy: string; updatedAt: string }> = [];
    const updatedAt = new Date().toISOString();
    const updatedBy = currentUser?.displayName || currentUser?.username || "";

    for (const role of roleDefinitions) {
      const roleName = normalizeRoleName(role.name);
      const nextPermissions = {
        ...getDefaultRolePermissions(roleName),
        ...(permissionDrafts[role.name] || {}),
        ...(permissionDrafts[roleName] || {}),
      };
      if (roleName === "Quality Assurance") {
        nextPermissions.viewUserDirectory = true;
        nextPermissions.viewAllTeams = true;
        nextPermissions.viewOwnTeam = true;
        nextPermissions.qaEvaluationTarget = false;
        nextPermissions.manageUsers = true;
        nextPermissions.manageTeams = true;
        nextPermissions.manageRoles = true;
        nextPermissions.manageMaintenance = true;
      }
      if (nextPermissions.manageUsers) {
        nextPermissions.viewUserDirectory = true;
      }
      if (nextPermissions.manageTeams) {
        nextPermissions.viewUserDirectory = true;
        nextPermissions.viewAllTeams = true;
        nextPermissions.viewOwnTeam = true;
      }
      permissionRows.push({
        roleName,
        permissions: nextPermissions,
        updatedBy,
        updatedAt,
      });
      await logUsageEvent(currentUser, "role_permissions_saved", {
        tab: "user-roles",
        details: {
          roleName,
          permissions: nextPermissions,
          updatedBy,
          updatedAt,
        },
      });
    }

    try {
      await upsertStoredRolePermissions(permissionRows);
    } catch {
      // Legacy logs remain the fallback until the new permission table is installed.
    }

    await onRolesChanged();
    setSaving(false);
    setMessage("Saved role permission matrix. Menu access will update automatically.");
  };

  const saveMaintenanceMode = async (enabled: boolean) => {
    setSaving(true);
    setMessage("");
    const updatedAt = new Date().toISOString();
    const updatedBy = currentUser?.displayName || currentUser?.username || "";
    const message = maintenanceMessage.trim() || "QA Dashboard is under maintenance. Please try again later.";
    try {
      await upsertStoredMaintenanceState({
        enabled,
        message,
        updatedBy,
        updatedAt,
      });
    } catch {
      // Legacy log fallback keeps maintenance mode usable before the new table exists.
    }
    await logUsageEvent(currentUser, "system_maintenance_saved", {
      tab: "user-roles",
      details: {
        enabled,
        message,
        updatedBy,
        updatedAt,
      },
    });
    await onMaintenanceChanged();
    setSaving(false);
    setMessage(enabled ? "Maintenance mode is now ON. Non-admin users cannot access the system." : "Maintenance mode is now OFF. Users can access the system again.");
  };

  const handleCancelEdit = () => {
    resetDraftUsers();
    setEditingUserManagementView(null);
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
      role: normalizeRoleName(newUserDraft.role),
      teamLead: newUserDraft.teamLead.trim(),
      teamName: newUserDraft.teamName.trim(),
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

    try {
      await upsertStoredUserProfiles([editableToStoredProfile(cleanedUser)]);
    } catch {
      // Legacy log fallback keeps created users available before the new table exists.
    }

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
      role: normalizeRoleName(item.role),
      teamLead: item.teamLead.trim(),
      teamName: item.teamName.trim(),
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

    const originalByUsername = new Map(rows.map((row) => [normalizeUsername(row.username), row]));
    const existingUsernames = new Set(rows.map((row) => normalizeUsername(row.username)));

    const changedUsers = cleanedUsers.filter((user) => {
      const original = originalByUsername.get(normalizeUsername(user.username));

      if (!original) return true;
      if (user.temporaryPassword) return true;

      return (
        user.displayName !== (original.displayName || "") ||
        user.agentName !== (original.agentName || original.displayName || "") ||
        user.email !== (original.email || "") ||
        user.role !== original.effectiveRole ||
        user.teamLead !== (original.teamLead || "") ||
        user.teamName !== (original.teamName || "") ||
        user.status !== (original.status || "Active") ||
        user.suspendReason !== (original.suspendReason || "")
      );
    });

    if (!changedUsers.length) {
      setMessage("No changes to save.");
      setEditingUserManagementView(null);
      return;
    }

    setSaving(true);
    setMessage("");
    setAccessMessage("");

    try {
      await upsertStoredUserProfiles(changedUsers.map(editableToStoredProfile));

      await Promise.all(
        changedUsers.map((user) =>
          logUsageEvent(currentUser, "user_profile_saved", {
            tab: "user-roles",
            target_agent: user.username,
            details: {
              ...user,
              updatedBy: currentUser?.displayName || currentUser?.username || "",
              updatedAt: new Date().toISOString(),
            },
          })
        )
      );

      const passwordUsers = changedUsers.filter((user) => user.temporaryPassword);

      await Promise.all(
        passwordUsers.map((user) => {
          const issuedAt = new Date();

          return logUsageEvent(currentUser, "password_reset_approved", {
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
        })
      );

      await onRolesChanged();

      setEditingUserManagementView(null);
      setMessage(
        editingUserManagementView === "team-management"
          ? `Saved ${changedUsers.length} changed team/user profile(s).`
          : `Saved ${changedUsers.length} changed user profile(s).`
      );

      const accessUpdates = changedUsers.filter(
        (user) => user.temporaryPassword || !existingUsernames.has(normalizeUsername(user.username))
      );

      if (accessUpdates.length) {
        setAccessMessage(
          accessUpdates
            .map((user) => `${user.displayName || user.username}: ${user.temporaryPassword || "-"}`)
            .join(" | ")
        );
      }
    } catch (error) {
      setMessage(`Save failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  };
  const canEditCurrentUserManagementView =
    userManagementView === "users"
      ? canManageUsers
      : userManagementView === "team-management"
        ? canManageTeams
        : false;
  const currentUserManagementEditLabel = userManagementView === "team-management" ? "Edit Teams" : "Edit Directory";
  const currentUserManagementSaveLabel = userManagementView === "team-management" ? "Save Team Changes" : "Save Changes";

  const handleExportPdf = async () => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    registerTHSarabunNew(doc);
    const passwordMap = await loadFirebasePasswordMapForExport();
    const exportContext =
      adminTab === "roles"
        ? "access_control"
        : adminTab === "maintenance"
          ? "system_maintenance"
          : userManagementView === "teams"
            ? "team_overview"
            : userManagementView === "team-management"
              ? "team_management"
              : "user_directory";
    const exportTitle =
      exportContext === "access_control"
        ? "QA Dashboard - Access Control"
        : exportContext === "system_maintenance"
          ? "QA Dashboard - System Maintenance"
          : exportContext === "team_overview"
            ? "QA Dashboard - Team Overview"
            : exportContext === "team_management"
              ? "QA Dashboard - Team Management"
              : "QA Dashboard - User Directory";

    doc.setFont("THSarabunNew", "bold");
    doc.setFontSize(20);
    doc.text(exportTitle, 14, 18);

    doc.setFont("THSarabunNew", "normal");
    doc.setFontSize(12);
    doc.text(`Generated by: ${currentUser?.displayName || "-"}`, 14, 27);
    doc.text(`Generated at: ${formatDateTime()}`, 14, 34);

    let y = 46;
    const ensurePage = (neededHeight = 8) => {
      if (y + neededHeight <= 284) return;
      doc.addPage();
      y = 18;
    };
    const drawTable = (headers: string[], widths: number[], rowsToDraw: string[][]) => {
      const startX = 14;
      const drawHeader = () => {
        doc.setFont("THSarabunNew", "bold");
        doc.setFontSize(12);
        let x = startX;
        headers.forEach((header, index) => {
          doc.text(header, x, y);
          x += widths[index];
        });
        doc.line(startX, y + 2, 196, y + 2);
        y += 9;
        doc.setFont("THSarabunNew", "normal");
      };

      drawHeader();
      rowsToDraw.forEach((row) => {
        const wrappedCells = row.map((cell, index) => doc.splitTextToSize(cell || "-", Math.max(widths[index] - 2, 14)) as string[]);
        const lineCount = Math.max(1, ...wrappedCells.map((cell) => cell.length));
        ensurePage(Math.max(8, lineCount * 5 + 4));
        if (y === 18) drawHeader();
        let x = startX;
        wrappedCells.forEach((cellLines, index) => {
          doc.text(cellLines, x, y);
          x += widths[index];
        });
        y += Math.max(8, lineCount * 5 + 4);
      });
    };

    if (exportContext === "access_control") {
      const permissionRows = roleDefinitions.flatMap((role) => {
        const permissions = {
          ...getDefaultRolePermissions(role.name),
          ...(permissionDrafts[role.name] || {}),
        };
        return PERMISSION_DEFINITIONS.map((permission) => [
          role.name,
          role.active ? "Active" : "Disabled",
          permission.category,
          permission.label,
          permissions[permission.key] ? "Enabled" : "Disabled",
        ]);
      });
      drawTable(["Role", "Status", "Category", "Permission", "Access"], [36, 24, 28, 62, 30], permissionRows);
    } else if (exportContext === "system_maintenance") {
      doc.setFont("THSarabunNew", "bold");
      doc.text("Current Status", 14, y);
      y += 8;
      doc.setFont("THSarabunNew", "normal");
      doc.text(`Maintenance: ${maintenanceState.enabled ? "ON" : "OFF"}`, 14, y);
      y += 7;
      doc.text(`Updated by: ${maintenanceState.updatedBy || "-"}`, 14, y);
      y += 7;
      doc.text(`Updated at: ${maintenanceState.updatedAt ? formatDateTime(maintenanceState.updatedAt) : "-"}`, 14, y);
      y += 7;
      doc.text(doc.splitTextToSize(`Message: ${maintenanceState.message || "-"}`, 180), 14, y);
      y += 16;
      let maintenanceLogs: UsageLogEvent[] = [];
      try {
        maintenanceLogs = (await fetchUsageLogsByEventTypes(["system_maintenance_saved"], 50)).slice(0, 20);
      } catch {
        maintenanceLogs = [];
      }
      drawTable(
        ["Time", "Updated By", "Status", "Message"],
        [34, 42, 24, 80],
        maintenanceLogs.map((log) => [
          log.created_at ? formatDateTime(log.created_at) : "-",
          log.display_name || log.username || "-",
          (log.details?.enabled as boolean | undefined) ? "ON" : "OFF",
          String(log.details?.message || "-"),
        ])
      );
    } else if (exportContext === "team_overview") {
      drawTable(
        ["Team", "Team Lead", "Assigned Role", "Members", "Active", "Suspended"],
        [44, 44, 38, 20, 18, 20],
        teamGroups.map((team) => [
          team.teamName,
          team.teamLead || "-",
          team.assignedRole || "-",
          String(team.users.length),
          String(team.activeCount),
          String(team.suspendedCount),
        ])
      );
    } else if (exportContext === "team_management") {
      const exportTeamGroups = buildTeamGroups(visibleDraftUsers.map(({ user }) => user));
      exportTeamGroups.forEach((team, teamIndex) => {
        ensurePage(34);
        if (teamIndex > 0) y += 5;
        doc.setFillColor(88, 28, 135);
        doc.roundedRect(14, y - 5, 182, 14, 3, 3, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("THSarabunNew", "bold");
        doc.setFontSize(15);
        doc.text(team.teamName, 18, y + 4);
        doc.setFontSize(11);
        doc.text(`Lead: ${team.teamLead || "-"}`, 92, y + 4);
        doc.text(`Role: ${team.assignedRole || "-"}`, 140, y + 4);
        doc.text(`Members: ${team.users.length}`, 174, y + 4);
        y += 16;
        doc.setTextColor(15, 23, 42);
        drawTable(
          ["Member", "Role", "Email", "Status"],
          [48, 38, 72, 24],
          team.users.map((user) => [
            user.displayName || user.username,
            user.role,
            user.email || "-",
            user.status,
          ])
        );
      });
        } else {
      drawTable(
        ["User", "Email", "Team", "Role", "Status", "Password"],
        [30, 40, 31, 27, 16, 36],
        visibleRows.map((row) => {
          const exportPassword =
            passwordMap[row.username.trim().toLowerCase()] ||
            passwordMap[String(row.displayName || "").trim().toLowerCase()] ||
            "-";

          return [
            row.displayName || row.username,
            row.email || "-",
            row.teamName || "-",
            row.effectiveRole,
            row.status,
            exportPassword,
          ];
        })
      );
    }

    await logUsageEvent(currentUser, "pdf_generate", {
      tab: "user-roles",
      details: { pdfType: exportContext },
    });
    doc.save(`QA_${exportContext}_${new Date().toISOString().slice(0, 10)}.pdf`);
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

        <div className="mt-6 rounded-[30px] border border-violet-100 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 p-3 shadow-[0_18px_48px_rgba(109,40,217,0.10)]">
          <div className="grid gap-3 lg:grid-cols-3">
            {canViewUserDirectory ? (
              <AdminPrimaryTabButton
                active={adminTab === "users"}
                title="User Management"
                description={canManageUsers ? "Manage user profiles and account status" : "View user profiles and account status"}
                count={totalUsers}
                onClick={() => setAdminTab("users")}
              />
            ) : null}
            {canManageRoles ? (
              <AdminPrimaryTabButton
                active={adminTab === "roles"}
                title="Access Control"
                description="Configure roles and permissions"
                count={roleDefinitions.length}
                onClick={() => setAdminTab("roles")}
              />
            ) : null}
            {canManageMaintenance ? (
              <AdminPrimaryTabButton
                active={adminTab === "maintenance"}
                title="System Maintenance"
                description={maintenanceState.enabled ? "Maintenance mode is active" : "System is open for users"}
                count={maintenanceState.enabled ? 1 : 0}
                tone={maintenanceState.enabled ? "amber" : "slate"}
                onClick={() => setAdminTab("maintenance")}
              />
            ) : null}
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

        {adminTab === "users" && canViewUserDirectory ? (
          <div className="mt-5 overflow-hidden rounded-[28px] border border-violet-200 bg-white shadow-[0_18px_52px_rgba(88,28,135,0.10)]">
            <div className="flex flex-col gap-3 border-b border-violet-100 bg-gradient-to-r from-white via-violet-50 to-fuchsia-50 px-4 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-5">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-violet-600">User Management</div>
                <div className="mt-1 text-3xl font-black tracking-tight text-slate-950">Corporate User Directory</div>
                <div className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                  {!canEditCurrentUserManagementView
                    ? "Read-only access for this view. You can review the information without changing records."
                    : isEditingUsers
                    ? "Edit account information and save all directory changes in one action."
                    : isEditingTeamManagement
                    ? "Edit team names, team leads, assigned roles, and user team assignments in one controlled view."
                    : "Review user profiles, registered emails, assigned roles, and account availability."}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                {isEditing ? (
                  <>
                    {isEditingTeamManagement && canManageTeams ? (
                      <button type="button" onClick={openCreateTeamModal} className="rounded-2xl bg-amber-500 px-5 py-3 text-sm font-black text-white shadow-[0_12px_28px_rgba(245,158,11,0.24)] transition hover:bg-amber-600">
                        Create Team
                      </button>
                    ) : null}
                    <button type="button" onClick={handleCancelEdit} className="rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-black text-white shadow-[0_12px_28px_rgba(225,29,72,0.28)] transition hover:bg-rose-700">
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveDirectory}
                      disabled={saving}
                      className="rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-black text-white shadow-[0_12px_28px_rgba(16,185,129,0.28)] transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      {saving ? "Saving..." : currentUserManagementSaveLabel}
                    </button>
                  </>
                ) : (
                  <>
                    {userManagementView === "users" && canManageUsers ? (
                      <button type="button" onClick={openCreateUserModal} className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-white shadow-[0_12px_28px_rgba(16,185,129,0.28)] transition hover:bg-emerald-600">
                        Create User
                      </button>
                    ) : null}
                    {userManagementView === "team-management" && canManageTeams ? (
                      <button type="button" onClick={openCreateTeamModal} className="rounded-2xl bg-amber-500 px-5 py-3 text-sm font-black text-white shadow-[0_12px_28px_rgba(245,158,11,0.24)] transition hover:bg-amber-600">
                        Create Team
                      </button>
                    ) : null}
                    <button type="button" onClick={() => void handleExportPdf()} className="rounded-xl bg-sky-500 px-4 py-2.5 text-xs font-black text-white shadow-[0_12px_28px_rgba(14,165,233,0.26)] transition hover:bg-sky-600">
                      Export PDF
                    </button>
                    {canEditCurrentUserManagementView ? (
                      <button
                        type="button"
                        onClick={() => startEditingUserManagementView(userManagementView)}
                        className="rounded-xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500 px-4 py-2.5 text-xs font-black text-white shadow-[0_16px_34px_rgba(217,70,239,0.32)] transition hover:scale-[1.02]"
                      >
                        {currentUserManagementEditLabel}
                      </button>
                    ) : (
                      <div className="rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-black text-violet-700 shadow-sm">
                        Read Only
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="border-b border-violet-200 bg-gradient-to-r from-violet-100 via-fuchsia-50 to-sky-50 px-4 py-3">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="inline-flex flex-wrap gap-2 rounded-[24px] border border-violet-200 bg-white/75 p-1.5 shadow-[0_14px_35px_rgba(109,40,217,0.12)]">
                  <DirectoryTabButton active={userManagementView === "users"} label="All Users" count={scopedRows.length} onClick={() => switchUserManagementView("users")} />
                  <DirectoryTabButton active={userManagementView === "teams"} label="All Teams" count={teamGroups.length} onClick={() => switchUserManagementView("teams")} tone="slate" />
                  {canManageTeams ? (
                    <DirectoryTabButton
                      active={userManagementView === "team-management"}
                      label="Team Management"
                      count={teamGroups.length}
                      onClick={() => switchUserManagementView("team-management")}
                      tone="amber"
                    />
                  ) : null}
                </div>
                <div className="inline-flex flex-wrap gap-2 rounded-[24px] border border-violet-200 bg-white/75 p-1.5 shadow-[0_14px_35px_rgba(109,40,217,0.12)]">
                  <DirectoryTabButton active={directoryTab === "active"} label="Active Accounts" count={activeUsers} onClick={() => setDirectoryTab("active")} />
                  <DirectoryTabButton active={directoryTab === "suspended"} label="Suspended Accounts" count={suspendedUsers} onClick={() => setDirectoryTab("suspended")} tone="rose" />
                </div>
              </div>
            </div>

            {userManagementView === "teams" ? (
              <TeamOverviewPanel teamGroups={teamGroups} />
            ) : userManagementView === "team-management" ? (
              <TeamManagementPanel
                users={visibleDraftUsers}
                saving={saving}
                onChange={updateDraftUser}
                onTeamChange={updateDraftTeam}
                roleOptions={activeRoleOptions}
                canManageTeams={canManageTeams}
                isEditing={isEditingTeamManagement}
              />
            ) : isEditingUsers ? (
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
        ) : adminTab === "roles" && canManageRoles ? (
          <div className="mt-5 overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_22px_70px_rgba(15,23,42,0.07)]">
            <div className="flex flex-col gap-4 border-b border-slate-200 bg-white px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-6">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-700">Access Control</div>
                <div className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Role & Permission Management</div>
                <div className="mt-1 text-sm leading-6 text-slate-500">Create roles, update role descriptions, and control what each role can access.</div>
              </div>
              <button type="button" onClick={() => void handleExportPdf()} className="rounded-xl bg-sky-500 px-4 py-2.5 text-xs font-black text-white shadow-[0_12px_28px_rgba(14,165,233,0.26)] transition hover:bg-sky-600">
                Export PDF
              </button>
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
        ) : adminTab === "maintenance" && canManageMaintenance ? (
          <div className="mt-5 overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_22px_70px_rgba(15,23,42,0.07)]">
            <div className="flex flex-col gap-4 border-b border-slate-200 bg-white px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-6">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-700">System Maintenance</div>
                <div className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Maintenance Control Center</div>
                <div className="mt-1 text-sm leading-6 text-slate-500">Temporarily restrict access while updating system configuration or QA data.</div>
              </div>
              <button type="button" onClick={() => void handleExportPdf()} className="rounded-xl bg-sky-500 px-4 py-2.5 text-xs font-black text-white shadow-[0_12px_28px_rgba(14,165,233,0.26)] transition hover:bg-sky-600">
                Export PDF
              </button>
            </div>
            <MaintenancePanel
              saving={saving}
              maintenanceState={maintenanceState}
              maintenanceMessage={maintenanceMessage}
              onMessageChange={setMaintenanceMessage}
              onSaveMaintenanceMode={saveMaintenanceMode}
            />
          </div>
        ) : null}
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
      {createTeamOpen ? (
        <CreateTeamModal
          team={newTeamDraft}
          users={draftUsers.filter((user) => user.status === "Active")}
          roleOptions={activeRoleOptions}
          saving={saving}
          onChange={updateNewTeamDraft}
          onToggleMember={toggleNewTeamMember}
          onCancel={() => {
            if (saving) return;
            setCreateTeamOpen(false);
          }}
          onSave={applyNewTeamDraft}
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
  const activeClass =
    tone === "amber"
      ? "border-amber-200 bg-gradient-to-br from-amber-100 to-orange-100 text-slate-950 shadow-[0_14px_32px_rgba(245,158,11,0.14)]"
      : tone === "slate"
        ? "border-slate-200 bg-gradient-to-br from-white to-slate-100 text-slate-950 shadow-[0_14px_32px_rgba(15,23,42,0.10)]"
        : "border-violet-200 bg-gradient-to-br from-white via-violet-50 to-fuchsia-50 text-slate-950 shadow-[0_14px_32px_rgba(109,40,217,0.14)]";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[24px] border px-5 py-4 text-left transition hover:-translate-y-0.5 ${
        active
          ? activeClass
          : "border-transparent bg-white/80 text-slate-700 shadow-sm hover:border-violet-100 hover:bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-black text-slate-950">{title}</div>
          <div className="mt-1 text-xs font-semibold leading-5 text-slate-500">{description}</div>
        </div>
        <span className={`inline-flex min-w-8 justify-center rounded-full px-2.5 py-1 text-xs font-bold ${
          active ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-700"
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
      ? "border-rose-300 bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-[0_12px_28px_rgba(225,29,72,0.22)]"
      : tone === "amber"
        ? "border-amber-300 bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 shadow-[0_12px_28px_rgba(217,119,6,0.18)]"
        : tone === "slate"
          ? "border-slate-700 bg-gradient-to-r from-slate-800 to-slate-950 text-white shadow-[0_12px_28px_rgba(15,23,42,0.16)]"
      : "border-violet-300 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-[0_12px_28px_rgba(109,40,217,0.22)]";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-[16px] border px-4 py-2.5 text-xs font-bold transition ${
        active ? activeClass : "border-violet-200 bg-violet-100 text-violet-700 hover:bg-violet-200 hover:text-violet-900"
      }`}
    >
      <span>{label}</span>
      <span className={`rounded-full px-2.5 py-1 text-xs ${active ? "bg-white text-slate-950" : "bg-violet-700 text-white"}`}>{count}</span>
    </button>
  );
}


async function loadFirebasePasswordMapForExport() {
  try {
    const snapshot = await getDocs(collection(firebaseDb, "qa_user_profiles"));
    const passwordMap: Record<string, string> = {};

    snapshot.forEach((item) => {
      const data = item.data() as any;
      const username = String(data.username || item.id || "").trim().toLowerCase();
      const password = String(data.password || "").trim();
      if (username && password) passwordMap[username] = password;
    });

    return passwordMap;
  } catch {
    return {};
  }
}
function ReadOnlyDirectoryTable({ rows }: { rows: Array<UserAccount & { effectiveRole: UserRole; normalizedUsername: string; status: UserStatus }> }) {
  const [firebasePasswords, setFirebasePasswords] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadPasswords() {
      try {
        const snapshot = await getDocs(collection(firebaseDb, "qa_user_profiles"));
        const next: Record<string, string> = {};

        snapshot.forEach((item) => {
          const data = item.data() as any;
          const username = String(data.username || item.id || "").trim().toLowerCase();
          const password = String(data.password || "").trim();
          if (username && password) next[username] = password;
        });

        if (!cancelled) setFirebasePasswords(next);
      } catch {
        if (!cancelled) setFirebasePasswords({});
      }
    }

    void loadPasswords();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeCount = rows.filter((row) => row.status === "Active").length;
  const suspendedCount = rows.length - activeCount;
  const roleCount = new Set(rows.map((row) => row.effectiveRole)).size;

  return (
    <div className="bg-gradient-to-br from-[#fbf7ff] via-white to-[#f3fbff] px-5 py-5">
      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-[24px] border border-violet-100 bg-gradient-to-br from-white to-violet-50 px-5 py-4 shadow-[0_16px_34px_rgba(109,40,217,0.10)]">
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-500">Directory View</div>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div className="text-3xl font-black text-slate-950">{rows.length}</div>
            <div className="rounded-full bg-violet-600 px-3 py-1 text-xs font-black text-white">user(s)</div>
          </div>
        </div>

        <div className="rounded-[24px] border border-emerald-100 bg-gradient-to-br from-white to-emerald-50 px-5 py-4 shadow-[0_16px_34px_rgba(16,185,129,0.10)]">
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-600">Active Accounts</div>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div className="text-3xl font-black text-slate-950">{activeCount}</div>
            <div className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-black text-white">available</div>
          </div>
        </div>

        <div className="rounded-[24px] border border-fuchsia-100 bg-gradient-to-br from-white to-fuchsia-50 px-5 py-4 shadow-[0_16px_34px_rgba(217,70,239,0.10)]">
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-fuchsia-600">Access Groups</div>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div className="text-3xl font-black text-slate-950">{roleCount}</div>
            <div className="rounded-full bg-fuchsia-500 px-3 py-1 text-xs font-black text-white">{suspendedCount} suspended</div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[1180px] space-y-3">
          <div className="grid grid-cols-[minmax(210px,1.1fr)_minmax(170px,0.8fr)_minmax(210px,1fr)_minmax(170px,0.8fr)_140px_110px_180px] items-center gap-4 rounded-[20px] bg-gradient-to-r from-violet-100 via-fuchsia-50 to-sky-50 px-5 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
            <div>User Profile</div>
            <div>Agent Name</div>
            <div>Registered Email</div>
            <div>Team</div>
            <div>Role</div>
            <div>Status</div>
            <div>Password</div>
          </div>

          {rows.map((row) => {
            const password = firebasePasswords[row.username.trim().toLowerCase()] || "";

            return (
              <div
                key={row.username}
                className={`grid grid-cols-[minmax(210px,1.1fr)_minmax(170px,0.8fr)_minmax(210px,1fr)_minmax(170px,0.8fr)_140px_110px_180px] items-center gap-4 rounded-[24px] border px-5 py-4 text-sm shadow-[0_14px_30px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)] ${
                  row.status === "Active" ? "border-white bg-white" : "border-rose-100 bg-rose-50/70"
                }`}
              >
                <div className="flex min-w-0 items-center gap-4">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-sm font-black text-white shadow-lg ${roleAvatarClass(row.effectiveRole)}`}>
                    {userInitials(row.displayName || row.username)}
                  </div>
                  <div className="min-w-0">
                    <div className="min-w-0 truncate text-base font-black text-slate-950">{row.displayName}</div>
                    <div className="mt-1 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">{row.username}</div>
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="min-w-0 truncate font-bold text-slate-700">{row.agentName || "-"}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-400">QA profile owner</div>
                </div>

                <div className="min-w-0">
                  <div className="min-w-0 truncate rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                    {row.email || "No email assigned"}
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="min-w-0 truncate font-black text-slate-800">{row.teamName || "Unassigned Team"}</div>
                  <div className="mt-1 truncate text-xs font-semibold text-slate-400">Lead: {row.teamLead || "-"}</div>
                </div>

                <div>
                  <div className="text-sm font-black text-slate-800">{row.effectiveRole}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-400">Access role</div>
                </div>

                <div>
                  <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black ${row.status === "Active" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
                    <span className={`h-2 w-2 rounded-full ${row.status === "Active" ? "bg-emerald-500" : "bg-rose-500"}`} />
                    {row.status}
                  </div>
                  {row.suspendReason ? <div className="mt-1 text-xs text-slate-500">{row.suspendReason}</div> : null}
                </div>

                <div className="min-w-0">
                  {password ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 font-mono text-xs font-black text-amber-800">
                      {password}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-400">
                      -
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {!rows.length ? (
            <div className="rounded-[24px] border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm font-bold text-slate-500">
              No users found in this view.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TeamOverviewPanel({
  teamGroups,
}: {
  teamGroups: Array<{ teamName: string; teamLead: string; assignedRole: string; users: Array<UserAccount & { effectiveRole: UserRole; normalizedUsername: string; status: UserStatus }>; activeCount: number; suspendedCount: number }>;
}) {
  return (
    <div className="bg-gradient-to-br from-[#fbf7ff] via-white to-[#f3fbff] px-5 py-5">
      <div className="grid gap-4 xl:grid-cols-2">
        {teamGroups.map((team) => (
          <div key={team.teamName} className="overflow-hidden rounded-[28px] border border-violet-100 bg-white shadow-[0_18px_45px_rgba(88,28,135,0.09)]">
            <div className="bg-gradient-to-r from-violet-700 via-fuchsia-600 to-sky-500 px-5 py-4 text-white">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/75">Team Workspace</div>
              <div className="mt-1 text-2xl font-black">{team.teamName}</div>
              <div className="mt-1 text-sm font-semibold text-white/80">Team Lead: {team.teamLead || "-"}</div>
              <div className="mt-2 inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black text-white">
                Role: {team.assignedRole || "-"}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 border-b border-violet-100 bg-violet-50/60 p-4">
              <MiniTeamStat label="Members" value={team.users.length} />
              <MiniTeamStat label="Active" value={team.activeCount} tone="emerald" />
              <MiniTeamStat label="Suspended" value={team.suspendedCount} tone="rose" />
            </div>
            <div className="divide-y divide-slate-100 p-2">
              {team.users.map((user) => (
                <div key={user.username} className="flex items-center justify-between gap-3 rounded-2xl px-3 py-3 hover:bg-slate-50">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-xs font-black text-white ${roleAvatarClass(user.effectiveRole)}`}>
                      {userInitials(user.displayName || user.username)}
                    </div>
                    <div className="min-w-0">
                      <div className="min-w-0 truncate text-sm font-black text-slate-950">{user.displayName}</div>
                      <div className="min-w-0 truncate text-xs font-semibold text-slate-500">{user.email || "-"}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-black text-slate-800">{user.effectiveRole}</div>
                    <div className={`mt-1 text-[11px] font-bold ${user.status === "Active" ? "text-emerald-600" : "text-rose-600"}`}>{user.status}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {!teamGroups.length ? (
        <div className="rounded-[24px] border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm font-bold text-slate-500">
          No teams found in this view.
        </div>
      ) : null}
    </div>
  );
}

function MiniTeamStat({ label, value, tone = "violet" }: { label: string; value: number; tone?: "violet" | "emerald" | "rose" }) {
  const toneClass = tone === "emerald" ? "text-emerald-600" : tone === "rose" ? "text-rose-600" : "text-violet-700";
  return (
    <div className="rounded-2xl border border-white bg-white px-4 py-3 shadow-sm">
      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-black ${toneClass}`}>{value}</div>
    </div>
  );
}

function TeamManagementPanel({
  users,
  saving,
  onChange,
  canManageTeams,
  onTeamChange,
  roleOptions,
  isEditing,
}: {
  users: Array<{ user: EditableUser; index: number }>;
  saving: boolean;
  onChange: (index: number, key: keyof EditableUser, value: string) => void;
  canManageTeams: boolean;
  onTeamChange: (teamName: string, key: "teamLead" | "teamName" | "role" | "roleMode", value: string) => void;
  roleOptions: UserRole[];
  isEditing: boolean;
}) {
  const [teamRoleModes, setTeamRoleModes] = useState<Record<string, "keep" | "sync">>({});
  const teamGroups = useMemo(() => {
    const map = new Map<string, { teamName: string; teamLead: string; assignedRole: string; roleCounts: Record<string, number>; members: Array<{ user: EditableUser; index: number }> }>();
    users.forEach((entry) => {
      const teamName = entry.user.teamName.trim() || "Unassigned Team";
      const existing = map.get(teamName) || {
        teamName,
        teamLead: entry.user.teamLead.trim() || "",
        assignedRole: "-",
        roleCounts: {},
        members: [],
      };
      if (!existing.teamLead && entry.user.teamLead) existing.teamLead = entry.user.teamLead;
      if (entry.user.role) existing.roleCounts[entry.user.role] = (existing.roleCounts[entry.user.role] || 0) + 1;
      existing.members.push(entry);
      map.set(teamName, existing);
    });
    return Array.from(map.values())
      .map((team) => {
        const roles = Object.keys(team.roleCounts);
        return {
          ...team,
          assignedRole: roles.length === 1 ? roles[0] : roles.length > 1 ? "Mixed Roles" : "-",
        };
      })
      .sort((a, b) => a.teamName.localeCompare(b.teamName));
  }, [users]);
  const teamOptions = teamGroups.map((team) => team.teamName);
  const editable = canManageTeams && isEditing && !saving;
  const getTeamRoleMode = (teamName: string, assignedRole: string) =>
    teamRoleModes[teamName] || (assignedRole === "Mixed Roles" ? "keep" : "sync");
  const setTeamRoleMode = (teamName: string, mode: "keep" | "sync") => {
    setTeamRoleModes((current) => ({ ...current, [teamName]: mode }));
  };

  return (
    <div className="bg-gradient-to-br from-[#fbf7ff] via-white to-[#f3fbff] px-5 py-5">
      <div className={`mb-5 rounded-[26px] border px-5 py-4 text-sm font-bold leading-6 ${
        isEditing
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-sky-200 bg-sky-50 text-sky-800"
      }`}>
        {isEditing
          ? "You are editing Team Management only. Keep individual roles for mixed-position teams, or sync one role to every active user in that team."
          : "Review team structure here. Press Edit Teams to update team names, team leads, role mode, or move users between teams."}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {teamGroups.map((team) => (
          <div key={team.teamName} className="overflow-hidden rounded-[30px] border border-violet-100 bg-white shadow-[0_20px_50px_rgba(88,28,135,0.10)]">
            <div className="bg-gradient-to-r from-slate-950 via-violet-950 to-fuchsia-900 px-5 py-5 text-white">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-black uppercase tracking-[0.24em] text-violet-200">Team Structure</div>
                  {isEditing ? (
                    <input
                      value={team.teamName}
                      disabled={!editable}
                      onChange={(event) => onTeamChange(team.teamName, "teamName", event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-white/20 bg-white/95 px-4 py-3 text-xl font-black text-slate-950 outline-none transition focus:border-fuchsia-300 focus:ring-4 focus:ring-fuchsia-300/20 disabled:cursor-not-allowed disabled:bg-white/40 disabled:text-white"
                    />
                  ) : (
                    <div className="mt-1 truncate text-2xl font-black">{team.teamName}</div>
                  )}
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-right">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">Members</div>
                  <div className="mt-1 text-3xl font-black">{team.members.length}</div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-200">Team Lead</div>
                  {isEditing ? (
                    <input
                      value={team.teamLead}
                      disabled={!editable}
                      onChange={(event) => onTeamChange(team.teamName, "teamLead", event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-white/20 bg-white/95 px-4 py-3 text-sm font-black text-slate-950 outline-none transition focus:border-fuchsia-300 focus:ring-4 focus:ring-fuchsia-300/20 disabled:cursor-not-allowed disabled:bg-white/40 disabled:text-white"
                      placeholder="Assign team lead"
                    />
                  ) : (
                    <div className="mt-1 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-bold text-white/90">{team.teamLead || "-"}</div>
                  )}
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-200">Role Mode</div>
                  {isEditing ? (
                    <select
                      value={getTeamRoleMode(team.teamName, team.assignedRole)}
                      disabled={!editable}
                      onChange={(event) => {
                        const mode = event.target.value === "sync" ? "sync" : "keep";
                        setTeamRoleMode(team.teamName, mode);
                        if (mode === "keep") return;
                        const fallbackRole = roleOptions.includes(team.assignedRole) ? team.assignedRole : roleOptions[0];
                        if (fallbackRole) onTeamChange(team.teamName, "role", fallbackRole);
                      }}
                      className="mt-2 w-full rounded-2xl border border-white/20 bg-white/95 px-4 py-3 text-sm font-black text-slate-950 outline-none transition focus:border-fuchsia-300 focus:ring-4 focus:ring-fuchsia-300/20 disabled:cursor-not-allowed disabled:bg-white/40 disabled:text-white"
                    >
                      <option value="keep">Keep individual roles</option>
                      <option value="sync">Sync one role to all members</option>
                    </select>
                  ) : (
                    <div className="mt-1 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-bold text-white/90">
                      {team.assignedRole === "Mixed Roles" ? "Keep individual roles" : "Synced role"}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-200">Assigned Role</div>
                  {isEditing ? (
                    <select
                      value={roleOptions.includes(team.assignedRole) ? team.assignedRole : ""}
                      disabled={!editable || getTeamRoleMode(team.teamName, team.assignedRole) === "keep"}
                      onChange={(event) => {
                        if (event.target.value) onTeamChange(team.teamName, "role", event.target.value);
                      }}
                      className="mt-2 w-full rounded-2xl border border-white/20 bg-white/95 px-4 py-3 text-sm font-black text-slate-950 outline-none transition focus:border-fuchsia-300 focus:ring-4 focus:ring-fuchsia-300/20 disabled:cursor-not-allowed disabled:bg-white/40 disabled:text-white"
                    >
                      <option value="" disabled>{team.assignedRole === "Mixed Roles" ? "Mixed Roles - keep as-is" : "Select role"}</option>
                      {roleOptions.map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="mt-1 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-bold text-white/90">{team.assignedRole}</div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3 bg-gradient-to-br from-white via-violet-50/40 to-sky-50/40 p-4">
              <div className="grid grid-cols-[minmax(220px,1fr)_170px_minmax(180px,0.8fr)] gap-3 rounded-2xl bg-white/80 px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                <div>User</div>
                <div>Role</div>
                <div>Assigned Team</div>
              </div>
              {team.members.map(({ user, index }) => (
                <div key={`${team.teamName}-${user.username}-${index}`} className="grid grid-cols-[minmax(220px,1fr)_170px_minmax(180px,0.8fr)] items-center gap-3 rounded-[22px] border border-white bg-white px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-xs font-black text-white ${roleAvatarClass(user.role)}`}>
                      {userInitials(user.displayName || user.username)}
                    </div>
                    <div className="min-w-0">
                      <div className="min-w-0 truncate text-sm font-black text-slate-950">{user.displayName || user.username}</div>
                      <div className="min-w-0 truncate text-xs font-semibold text-slate-500">{user.email || "-"}</div>
                      <div className="mt-1 text-[11px] font-bold text-slate-400">Lead: {user.teamLead || team.teamLead || "-"}</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-black text-slate-800">{user.role}</div>
                    <div className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${user.status === "Active" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
                      {user.status}
                    </div>
                  </div>
                  <div>
                    {isEditing ? (
                      <select
                        value={user.teamName.trim() || "Unassigned Team"}
                        disabled={!editable}
                        onChange={(event) => onChange(index, "teamName", event.target.value === "Unassigned Team" ? "" : event.target.value)}
                        className="w-full rounded-xl border border-violet-100 bg-white px-3 py-2 text-xs font-black text-slate-800 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                      >
                        {teamOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-black text-violet-800">
                        {user.teamName || "Unassigned Team"}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {!teamGroups.length ? (
          <div className="rounded-[24px] border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm font-bold text-slate-500">
            No active users found for team management.
          </div>
        ) : null}
      </div>
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
    : getDefaultRolePermissions("Admin Live Chat");
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
            className="mt-2 w-full rounded-xl border border-violet-100 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50"
          />
        </label>
        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">Description</span>
          <input
            value={newRoleDescription}
            disabled={saving}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder="Short explanation for this role"
            className="mt-2 w-full rounded-xl border border-violet-100 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50"
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
                          className="mt-2 w-full rounded-xl border border-violet-100 bg-white px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-50 disabled:text-slate-400"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-700">Description</span>
                        <textarea
                          value={editingRoleDraft.description}
                          disabled={saving}
                          onChange={(event) => setEditingRoleDraft((draft) => ({ ...draft, description: event.target.value }))}
                          className="mt-2 min-h-[86px] w-full rounded-xl border border-violet-100 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-50"
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
                            permission.key === "viewUserDirectory" ||
                            permission.key === "manageUsers" ||
                            permission.key === "manageRoles" ||
                            permission.key === "manageRubric" ||
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
      <table className="w-full min-w-[1260px] table-fixed border-collapse text-left text-xs">
        <thead>
          <tr className="bg-slate-950 text-white">
            <th className="px-3 py-3 font-bold">Username</th>
            <th className="px-3 py-3 font-bold">Agent Name</th>
            <th className="px-3 py-3 font-bold">Email</th>
            <th className="px-3 py-3 font-bold">Team Lead</th>
            <th className="px-3 py-3 font-bold">Team Name</th>
            <th className="px-3 py-3 font-bold">Role</th>
            <th className="px-3 py-3 font-bold">Status</th>
            <th className="px-3 py-3 font-bold">Suspend Reason</th>
            <th className="px-3 py-3 font-bold">Access Password</th>
          </tr>
        </thead>
        <tbody>
          {users.map(({ user, index }) => {
            const isSongpon = normalizeUsername(user.username) === "songpon";
            return (
              <tr key={`${user.username || "new"}-${index}`} className="border-b border-slate-100 last:border-b-0">
                <td className="px-3 py-3 align-top">
                  <TextInput value={user.username} disabled={saving || isSongpon} onChange={(value) => onChange(index, "username", value)} />
                </td>
                <td className="px-3 py-3 align-top">
                  <TextInput value={user.agentName} disabled={saving} onChange={(value) => onChange(index, "agentName", value)} />
                </td>
                <td className="px-3 py-3 align-top">
                  <TextInput value={user.email} disabled={saving} onChange={(value) => onChange(index, "email", value)} />
                </td>
                <td className="px-3 py-3 align-top">
                  <TextInput value={user.teamLead} disabled={saving} onChange={(value) => onChange(index, "teamLead", value)} />
                </td>
                <td className="px-3 py-3 align-top">
                  <TextInput value={user.teamName} disabled={saving} onChange={(value) => onChange(index, "teamName", value)} />
                </td>
                <td className="px-3 py-3 align-top">
                  <select
                    value={user.role}
                    disabled={saving || isSongpon}
                    onChange={(event) => onChange(index, "role", event.target.value)}
                    className="w-full rounded-xl border border-violet-100 bg-white px-2 py-2 text-xs font-semibold text-slate-800 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-3 align-top">
                  <select
                    value={user.status}
                    disabled={saving || isSongpon}
                    onChange={(event) => onChange(index, "status", event.target.value)}
                    className="w-full rounded-xl border border-violet-100 bg-white px-2 py-2 text-xs font-semibold text-slate-800 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-3 align-top">
                  <TextInput value={user.suspendReason} disabled={saving || user.status === "Active"} onChange={(value) => onChange(index, "suspendReason", value)} />
                </td>
                <td className="px-3 py-3 align-top">
                  <div className="flex min-w-[260px] items-center gap-2">
                    <input
                      type="text"
                      value={user.temporaryPassword}
                      disabled={saving}
                      onChange={(event) => onChange(index, "temporaryPassword", event.target.value)}
                      placeholder="Generate temporary password"
                      className="min-w-[150px] flex-1 rounded-xl border border-violet-100 bg-white px-2 py-2 text-xs font-semibold text-slate-800 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                    />
                    <button
                      type="button"
                      disabled={saving || !user.username}
                      onClick={() => onGeneratePassword(index)}
                      className="shrink-0 rounded-xl border border-amber-300 bg-amber-100 px-4 py-2 text-[11px] font-black text-amber-800 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Generate
                    </button>
                  </div>
                  <div className="mt-1 max-w-[220px] text-[10px] font-semibold leading-4 text-slate-500">
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
          <ModalField label="Team Lead" value={user.teamLead} onChange={(value) => onChange("teamLead", value)} placeholder="e.g. Anucha Makundin" />
          <ModalField label="Team Name" value={user.teamName} onChange={(value) => onChange("teamName", value)} placeholder="e.g. Sweet Warriors" />

          <label className="block">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">Role</span>
            <select
              value={user.role}
              disabled={saving}
              onChange={(event) => onChange("role", event.target.value)}
              className="mt-2 w-full rounded-xl border border-violet-100 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50"
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
              className="mt-2 w-full rounded-xl border border-violet-100 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50"
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
                  className="w-full rounded-xl border border-violet-100 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50"
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

function CreateTeamModal({
  team,
  users,
  roleOptions,
  saving,
  onChange,
  onToggleMember,
  onCancel,
  onSave,
}: {
  team: TeamDraft;
  users: EditableUser[];
  roleOptions: UserRole[];
  saving: boolean;
  onChange: (key: keyof TeamDraft, value: string | string[]) => void;
  onToggleMember: (username: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const selected = new Set(team.memberUsernames.map(normalizeUsername));
  const selectedCount = team.memberUsernames.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[32px] bg-white shadow-[0_30px_90px_rgba(15,23,42,0.35)]">
        <div className="border-b border-amber-100 bg-gradient-to-r from-slate-950 via-violet-900 to-amber-600 px-6 py-5 text-white">
          <div className="text-[11px] font-black uppercase tracking-[0.24em] text-amber-100">Team Builder</div>
          <div className="mt-2 text-2xl font-black">Create Team</div>
          <div className="mt-1 text-sm font-semibold text-white/80">
            Create a team, assign its role, then select members. The member role will sync to the assigned team role.
          </div>
        </div>

        <div className="grid gap-5 overflow-y-auto p-6 lg:grid-cols-[360px_1fr]">
          <div className="space-y-4">
            <ModalField label="Team Name" value={team.teamName} onChange={(value) => onChange("teamName", value)} placeholder="e.g. Escalation Support" disabled={saving} />
            <ModalField label="Team Lead" value={team.teamLead} onChange={(value) => onChange("teamLead", value)} placeholder="e.g. Anucha Makundin" disabled={saving} />
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">Role Mode</span>
              <select
                value={team.roleMode}
                disabled={saving}
                onChange={(event) => onChange("roleMode", event.target.value === "sync" ? "sync" : "keep")}
                className="mt-2 w-full rounded-xl border border-violet-100 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50"
              >
                <option value="keep">Keep individual roles</option>
                <option value="sync">Sync one role to all members</option>
              </select>
              <div className="mt-2 text-xs font-bold leading-5 text-slate-500">
                Keep keeps each user's current role. Sync changes every selected member to the assigned role.
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">Assigned Role</span>
              <select
                value={team.assignedRole}
                disabled={saving || team.roleMode === "keep"}
                onChange={(event) => onChange("assignedRole", event.target.value)}
                className="mt-2 w-full rounded-xl border border-violet-100 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50"
              >
                {roleOptions.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </label>
            <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">Selected Members</div>
              <div className="mt-2 text-4xl font-black text-amber-700">{selectedCount}</div>
              <div className="mt-1 text-sm font-bold leading-6 text-amber-800">
                After you press Create Team, remember to press Save Team Changes to persist it.
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-[26px] border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-sky-50">
            <div className="border-b border-violet-100 bg-white/80 px-5 py-4">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-700">Select Members</div>
              <div className="mt-1 text-sm font-semibold text-slate-500">Choose active users to move into this new team.</div>
            </div>
            <div className="max-h-[430px] space-y-2 overflow-y-auto p-4">
              {users.map((user) => {
                const isSelected = selected.has(normalizeUsername(user.username));
                return (
                  <button
                    key={user.username}
                    type="button"
                    disabled={saving}
                    onClick={() => onToggleMember(user.username)}
                    className={`flex w-full items-center justify-between gap-4 rounded-[22px] border px-4 py-3 text-left transition ${
                      isSelected
                        ? "border-violet-300 bg-violet-100 shadow-[0_12px_24px_rgba(109,40,217,0.12)]"
                        : "border-white bg-white hover:border-violet-200 hover:bg-violet-50"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-xs font-black text-white ${roleAvatarClass(user.role)}`}>
                        {userInitials(user.displayName || user.username)}
                      </div>
                      <div className="min-w-0">
                        <div className="min-w-0 truncate text-sm font-black text-slate-950">{user.displayName || user.username}</div>
                        <div className="min-w-0 truncate text-xs font-semibold text-slate-500">{user.teamName || "Unassigned Team"} โ€ข {user.role}</div>
                      </div>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${isSelected ? "bg-violet-700 text-white" : "bg-slate-100 text-slate-500"}`}>
                      {isSelected ? "Selected" : "Add"}
                    </span>
                  </button>
                );
              })}
              {!users.length ? (
                <div className="rounded-[22px] border border-dashed border-slate-200 bg-white px-5 py-8 text-center text-sm font-bold text-slate-500">
                  No active users available.
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-5">
          <button type="button" onClick={onCancel} disabled={saving} className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={onSave} disabled={saving} className="rounded-2xl bg-gradient-to-r from-amber-500 to-fuchsia-600 px-6 py-3 text-sm font-black text-white shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50">
            Create Team
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
        className="mt-2 w-full rounded-xl border border-violet-100 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
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



















