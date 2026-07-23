import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";
import { fetchStoredProfilePhoto } from "./profilePhotoStore";
import { jsPDF } from "jspdf";
import PageHero from "./PageHero";
import CorporateUserDirectoryProfile, { type CorporateUserAccountUpdate } from "./CorporateUserDirectoryProfile";
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
  | "resetPreTestRetake"
  | "exportPreTestResults"
  | "viewTrainingCheckIn"
  | "viewTrainingAttendance"
  | "checkInTrainingSelf"
  | "manageTrainingSessions"
  | "manageTrainingRoster"
  | "manualUpdateTrainingAttendance"
  | "exportTrainingAttendance"
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
  suspendEffectiveDate?: string;
  suspendEndDate?: string;
  suspendAutoReactivate?: boolean;
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
  viewStatus?: UserStatus;
  suspendReason: string;
  suspendEffectiveDate: string;
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
  initialTab?: AdminTab;
  showPrimaryTabs?: boolean;
  onMaintenanceChanged: () => void | Promise<void>;
  onRolesChanged: () => void | Promise<void>;
};

const ROLE_OPTIONS: UserRole[] = ["Admin Live Chat", "Virtual Rider", "Senior", "Supervisor", "Quality Assurance"];
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
  { key: "resetPreTestRetake", label: "Reset Pre-Test Retake", category: "Review", description: "Open the next Pre-Test attempt while preserving previous history." },
  { key: "exportPreTestResults", label: "Export Pre-Test Results", category: "Review", description: "Export Pre-Test result history to PDF or Excel." },
  { key: "viewTrainingCheckIn", label: "View Training Check-in", category: "Review", description: "Open Training Check-in and see available training sessions." },
  { key: "viewTrainingAttendance", label: "View Training Attendance", category: "Review", description: "See roster attendance status and training history." },
  { key: "checkInTrainingSelf", label: "Check in Training Self", category: "Review", description: "Check in and check out only the current user's own roster row." },
  { key: "manageTrainingSessions", label: "Manage Training Sessions", category: "Review", description: "Create, edit, activate, and close training sessions." },
  { key: "manageTrainingRoster", label: "Manage Training Roster", category: "Review", description: "Add or remove expected participants from training roster." },
  { key: "manualUpdateTrainingAttendance", label: "Manual Training Attendance", category: "Review", description: "Manually adjust participant attendance with a reason." },
  { key: "exportTrainingAttendance", label: "Export Training Attendance", category: "Review", description: "Export attendance report including all roster members." },
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

const PERMISSION_THAI_HELP: Record<RolePermissionKey, string> = {
  viewDashboard: "อนุญาตให้เปิดหน้า Dashboard และดูภาพรวมคะแนน เกรด KPI และผลการทำงานของเคส",
  viewAllAgents: "อนุญาตให้เลือก All Agents และดูข้อมูลของพนักงานทุกคนใน Dashboard และ Analytics",
  viewSummary: "อนุญาตให้เปิดหน้า Analytics เพื่อดูผลสรุปรายสัปดาห์ รายเดือน และรายปี",
  viewCoaching: "อนุญาตให้เปิดหน้า Coaching เพื่อดูและติดตามข้อมูลการโค้ชของพนักงาน",
  viewAppeal: "อนุญาตให้เปิดหน้า Appeal Cases และดูข้อมูลการอุทธรณ์ของเคส",
  submitAppeal: "อนุญาตให้ส่งคำขออุทธรณ์จากหน้า Case Detail",
  reviewAppeals: "อนุญาตให้เปิด Appeal Review และอนุมัติหรือปฏิเสธคำขออุทธรณ์",
  appealOverride: "อนุญาตให้เปิดสิทธิ์ยื่นอุทธรณ์ให้เคสที่หมดเวลายื่นตามปกติ",
  viewRubric: "อนุญาตให้เปิดดูเกณฑ์และมาตรฐานการประเมิน QA",
  manageRubric: "อนุญาตให้สร้าง แก้ไข จัดการเวอร์ชัน และสิ้นสุดการใช้งาน Rubric",
  createEvaluation: "อนุญาตให้เปิดหน้า Evaluate และสร้างผลประเมิน QA ใหม่",
  takePreTest: "อนุญาตให้เปิดและทำแบบทดสอบ Pre-Test ที่ได้รับมอบหมาย",
  managePreTest: "อนุญาตให้สร้าง แก้ไข ปิดใช้งาน ลบ และแชร์ชุดข้อสอบ Pre-Test",
  viewPreTestResults: "อนุญาตให้ดูประวัติและผลการทำแบบทดสอบ Pre-Test",
  resetPreTestRetake: "อนุญาตให้เปิดรอบทำ Pre-Test ครั้งถัดไปโดยยังเก็บประวัติเดิมไว้",
  exportPreTestResults: "อนุญาตให้ส่งออกผล Pre-Test เป็นไฟล์ PDF หรือ Excel",
  viewTrainingCheckIn: "อนุญาตให้เปิดหน้า Training และดู Session ที่เปิดให้ Check-in",
  viewTrainingAttendance: "อนุญาตให้ดูรายชื่อ สถานะเข้าอบรม และประวัติการเข้าอบรม",
  checkInTrainingSelf: "อนุญาตให้ผู้ใช้ Check-in และ Check-out เฉพาะรายการของตนเอง",
  manageTrainingSessions: "อนุญาตให้สร้าง แก้ไข เปิด และปิด Training Session",
  manageTrainingRoster: "อนุญาตให้เพิ่มหรือลบรายชื่อผู้เข้าร่วม Training Session",
  manualUpdateTrainingAttendance: "อนุญาตให้แก้ไขสถานะการเข้าอบรมด้วยตนเองพร้อมระบุเหตุผล",
  exportTrainingAttendance: "อนุญาตให้ส่งออกรายงานการเข้าอบรมของผู้เข้าร่วมทั้งหมด",
  viewUsageLog: "อนุญาตให้เปิด Login Log และดูประวัติการเข้าใช้งานระบบ",
  exportPdf: "อนุญาตให้สร้างหรือดาวน์โหลดรายงาน PDF ในหน้าที่รองรับ",
  exportAppealRawdata: "อนุญาตให้ส่งออกข้อมูล Appeal ที่ตรวจสอบแล้วสำหรับอัปเดต RawData",
  viewUserDirectory: "อนุญาตให้ดูรายชื่อผู้ใช้และข้อมูลบัญชีในโหมดอ่านอย่างเดียว",
  viewAllTeams: "อนุญาตให้ดูทุกทีม หัวหน้าทีม และสมาชิกทุกคน",
  viewOwnTeam: "อนุญาตให้ดูเฉพาะสมาชิกที่อยู่ในทีมเดียวกับผู้ใช้",
  qaEvaluationTarget: "อนุญาตให้ผู้ใช้ใน Role นี้ถูกเลือกเป็นผู้รับการประเมิน QA และรับแจ้งผลประเมิน",
  resetPassword: "อนุญาตให้อนุมัติคำขอและรีเซ็ตรหัสผ่านให้ผู้ใช้งานอื่น",
  manageUsers: "อนุญาตให้สร้างผู้ใช้ แก้ไขข้อมูลบัญชี ระงับ และเปิดใช้งานบัญชี",
  manageTeams: "อนุญาตให้สร้างทีม กำหนดหัวหน้าทีม และย้ายผู้ใช้ระหว่างทีม",
  manageRoles: "อนุญาตให้สร้าง แก้ไข เปิดหรือปิด Role และกำหนดสิทธิ์ของแต่ละ Role",
  manageMaintenance: "อนุญาตให้เปิดหรือปิด Maintenance Mode และแก้ไขข้อความแจ้งผู้ใช้",
  useTeamChat: "อนุญาตให้ใช้งาน Team Chat ข้อความส่วนตัว การส่งไฟล์ และ Call Invite",
};

const PERMISSION_CATEGORY_META: Record<string, { title: string; thai: string; description: string }> = {
  Performance: {
    title: "Performance & Dashboard",
    thai: "ผลการทำงานและแดชบอร์ด",
    description: "สิทธิ์สำหรับดูคะแนน ภาพรวม และข้อมูลของพนักงาน",
  },
  Review: {
    title: "QA, Appeals & Training",
    thai: "งานประเมิน อุทธรณ์ และการเรียนรู้",
    description: "สิทธิ์สำหรับงาน QA อุทธรณ์ Pre-Test และ Training",
  },
  Account: {
    title: "User Access & Export",
    thai: "การเข้าถึงข้อมูลและการส่งออก",
    description: "สิทธิ์สำหรับดูข้อมูลผู้ใช้ ประวัติระบบ และส่งออกรายงาน",
  },
  System: {
    title: "Administration & System",
    thai: "การดูแลผู้ใช้และระบบ",
    description: "สิทธิ์ระดับผู้ดูแลสำหรับ Users, Teams, Roles และ Maintenance",
  },
};

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
    resetPreTestRetake: false,
    exportPreTestResults: false,
    viewTrainingCheckIn: true,
    viewTrainingAttendance: true,
    checkInTrainingSelf: true,
    manageTrainingSessions: false,
    manageTrainingRoster: false,
    manualUpdateTrainingAttendance: false,
    exportTrainingAttendance: false,
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
  "Virtual Rider": {
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
    resetPreTestRetake: false,
    exportPreTestResults: false,
    viewTrainingCheckIn: true,
    viewTrainingAttendance: true,
    checkInTrainingSelf: true,
    manageTrainingSessions: false,
    manageTrainingRoster: false,
    manualUpdateTrainingAttendance: false,
    exportTrainingAttendance: false,
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
    resetPreTestRetake: false,
    exportPreTestResults: false,
    viewTrainingCheckIn: true,
    viewTrainingAttendance: true,
    checkInTrainingSelf: true,
    manageTrainingSessions: false,
    manageTrainingRoster: false,
    manualUpdateTrainingAttendance: false,
    exportTrainingAttendance: false,
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
    resetPreTestRetake: true,
    exportPreTestResults: true,
    viewTrainingCheckIn: true,
    viewTrainingAttendance: true,
    checkInTrainingSelf: true,
    manageTrainingSessions: true,
    manageTrainingRoster: true,
    manualUpdateTrainingAttendance: true,
    exportTrainingAttendance: true,
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
  const suspended =
    user.status === "Suspended";

  return {
    username: user.username,
    displayName: user.displayName,
    agentName: user.agentName || user.displayName,
    email: user.email,
    role: normalizeRoleName(user.role),
    teamLead: suspended ? "" : user.teamLead,
    teamName: suspended ? "" : user.teamName,
    status: user.status,
    suspendReason: user.suspendReason,
    suspendEffectiveDate: user.suspendEffectiveDate,
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
    if (row.status === "Suspended") return;

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
    viewStatus: account.status || "Active",
    suspendReason: account.suspendReason || "",
    suspendEffectiveDate: account.suspendEffectiveDate || "",
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
    viewStatus: "Active",
    suspendReason: "",
    suspendEffectiveDate: "",
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


async function logUsageEventBestEffort(
  currentUser: CurrentUser,
  eventType: Parameters<typeof logUsageEvent>[1],
  payload: Parameters<typeof logUsageEvent>[2]
) {
  try {
    return await logUsageEvent(currentUser, eventType, payload);
  } catch (error) {
    console.warn("Usage log skipped because Supabase is unavailable or over quota", error);
    return false;
  }
}

export default function UserRoleAdminMockup({
  accounts,
  currentUser,
  roleOverrides,
  rolePermissions,
  maintenanceState,
  initialTab,
  showPrimaryTabs = true,
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
  const [directoryRoleFilter, setDirectoryRoleFilter] = useState<UserRole | "all">("all");
  const [userManagementView, setUserManagementView] = useState<UserManagementView>("users");
  const [adminTab, setAdminTab] = useState<AdminTab>(() => initialTab || "users");
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
  const currentUsername = String(currentUser?.username || "").trim().toLowerCase();
  const currentDisplayName = String(currentUser?.displayName || "").trim().toLowerCase();
  const isSongponSuperAdmin =
    currentUsername === "songpon" ||
    currentDisplayName === "songpon phothong" ||
    currentDisplayName === "songpon";
  const isQualityAssuranceAdmin = currentUser?.role === "Quality Assurance" || isSongponSuperAdmin;
  const currentPermissions = isQualityAssuranceAdmin
    ? {
        ...getDefaultRolePermissions("Quality Assurance"),
        viewDashboard: true,
        viewAllAgents: true,
        viewSummary: true,
        viewCoaching: true,
        viewAppeal: true,
        submitAppeal: true,
        reviewAppeals: true,
        appealOverride: true,
        viewRubric: true,
        manageRubric: true,
        createEvaluation: true,
        takePreTest: true,
        managePreTest: true,
        viewPreTestResults: true,
        viewUsageLog: true,
        exportPdf: true,
        exportAppealRawdata: true,
        viewUserDirectory: true,
        viewAllTeams: true,
        viewOwnTeam: true,
        qaEvaluationTarget: false,
        manageUsers: true,
        manageTeams: true,
        manageRoles: true,
        resetPassword: true,
        manageMaintenance: true,
        useTeamChat: true,
      }
    : rolePermissions[currentUser?.role || "Admin Live Chat"] || getDefaultRolePermissions(currentUser?.role || "Admin Live Chat");
  const canViewUserDirectory = Boolean(currentUser);
  const canViewAllTeams = isSongponSuperAdmin;
  const canViewOwnTeam = false;
  const canManageUsers = isSongponSuperAdmin;
  const canManageTeams = isSongponSuperAdmin;  const canManageRoles = Boolean(currentPermissions.manageRoles);
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
    if (initialTab && initialTab !== adminTab) {
      setAdminTab(initialTab);
    }
  }, [adminTab, initialTab]);

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
  const scopedRows = isSongponSuperAdmin
    ? rows
    : rows.filter(
        (row) =>
          normalizeUsername(row.username) ===
          normalizeUsername(currentUser.username)
      );  const activeScopedRows = scopedRows.filter((row) => row.status === "Active");
  const teamGroups = buildTeamGroups(activeScopedRows);
  const roleFilteredScopedRows =
    directoryRoleFilter === "all"
      ? scopedRows
      : scopedRows.filter((row) => row.effectiveRole === directoryRoleFilter);
  const visibleRows = roleFilteredScopedRows.filter((row) => directoryTab === "active" ? row.status === "Active" : row.status === "Suspended");
  const visibleDraftUsers = draftUsers
    .map((user, index) => ({ user, index }))
    .filter(({ user }) => {
      if (userManagementView === "teams") {
        return user.status === "Active";
      }
      if (userManagementView === "team-management") {
        return true;
      }

      const statusForView = isEditingUsers ? user.viewStatus || user.status : user.status;
      const statusMatches = directoryTab === "active" ? statusForView === "Active" : statusForView === "Suspended";
      const roleMatches = directoryRoleFilter === "all" || normalizeRoleName(user.role) === directoryRoleFilter;

      return statusMatches && roleMatches;
    })
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

  const passwordRoleOptions = activeRoleOptions.filter((role) =>
    ["Admin Live Chat", "Virtual Rider", "Senior", "Supervisor"].includes(role)
  );

  const generateDraftPasswordsForSelectedRole = () => {
    if (!isEditingUsers) {
      setMessage("Press Edit Directory before generating passwords by role.");
      return;
    }

    if (directoryRoleFilter === "all") {
      setMessage("Please select a role before generating passwords.");
      return;
    }

    if (!passwordRoleOptions.includes(directoryRoleFilter)) {
      setMessage(`Password generation is not enabled for ${directoryRoleFilter}.`);
      return;
    }

    const currentViewStatus = directoryTab === "active" ? "Active" : "Suspended";
    let generatedCount = 0;

    setDraftUsers((currentDrafts) =>
      currentDrafts.map((user) => {
        const statusForView = user.viewStatus || user.status;
        if (statusForView !== currentViewStatus) return user;
        if (normalizeRoleName(user.role) !== directoryRoleFilter) return user;

        generatedCount += 1;
        return { ...user, temporaryPassword: generateTemporaryPassword() };
      })
    );

    setAccessMessage(`Generated temporary passwords for ${generatedCount} ${directoryRoleFilter} user(s). Press Save Changes to keep them.`);
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
    await logUsageEventBestEffort(currentUser, "role_definition_saved", {
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
    await logUsageEventBestEffort(currentUser, "role_definition_deleted", {
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
      await logUsageEventBestEffort(currentUser, "role_definition_deleted", {
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
    await logUsageEventBestEffort(currentUser, "role_definition_saved", {
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
      await logUsageEventBestEffort(currentUser, "role_permissions_saved", {
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
    await logUsageEventBestEffort(currentUser, "system_maintenance_saved", {
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
      teamLead:
        newUserDraft.status === "Suspended"
          ? ""
          : newUserDraft.teamLead.trim(),
      teamName:
        newUserDraft.status === "Suspended"
          ? ""
          : newUserDraft.teamName.trim(),
      suspendReason: newUserDraft.suspendReason.trim(),
      suspendEffectiveDate: newUserDraft.suspendEffectiveDate.trim(),
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

    await logUsageEventBestEffort(currentUser, "user_profile_saved", {
      tab: "user-roles",
      target_agent: cleanedUser.username,
      details: {
        ...cleanedUser,
        updatedBy: currentUser?.displayName || currentUser?.username || "",
        updatedAt: new Date().toISOString(),
      },
    });

    const issuedAt = new Date();
    await logUsageEventBestEffort(currentUser, "password_reset_approved", {
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

  const saveSingleUserAccount = async (
    update: CorporateUserAccountUpdate
  ) => {
    const original = rows.find(
      (row) =>
        normalizeUsername(row.username) ===
        normalizeUsername(update.username)
    );

    if (!original) {
      throw new Error(
        `ไม่พบผู้ใช้ ${update.username}`
      );
    }

    if (
      normalizeUsername(update.username) ===
        "songpon" &&
      (normalizeRoleName(update.role) !==
        "Quality Assurance" ||
        update.status !== "Active")
    ) {
      throw new Error(
        "Songpon ต้องคงสถานะ Active และ Role Quality Assurance เพื่อรักษาสิทธิ์เจ้าของระบบ"
      );
    }

    setSaving(true);
    setMessage("");

    try {
      await upsertStoredUserProfiles([
        {
          username: original.username,
          displayName:
            update.displayName.trim(),
          agentName:
            update.agentName.trim() ||
            update.displayName.trim(),
          email: update.email.trim(),
          role: normalizeRoleName(update.role),
          teamLead:
            update.status === "Suspended"
              ? ""
              : update.teamLead.trim(),
          teamName:
            update.status === "Suspended"
              ? ""
              : update.teamName.trim(),
          status: update.status,
          suspendReason:
            update.suspendReason.trim(),
          suspendEffectiveDate:
            update.suspendEffectiveDate,
          suspendEndDate:
            update.suspendEndDate,
          suspendAutoReactivate:
            update.suspendAutoReactivate,
        },
      ]);

      await logUsageEventBestEffort(
        currentUser,
        "user_profile_saved",
        {
          tab: "user-roles",
          target_agent: original.username,
          details: {
            ...update,
            teamLead:
              update.status === "Suspended"
                ? ""
                : update.teamLead.trim(),
            teamName:
              update.status === "Suspended"
                ? ""
                : update.teamName.trim(),
            updatedBy:
              currentUser?.displayName ||
              currentUser?.username ||
              "",
            updatedAt:
              new Date().toISOString(),
          },
        }
      );

      await onRolesChanged();
      setMessage(
        `บันทึกโปรไฟล์ ${update.displayName} แล้ว`
      );
    } finally {
      setSaving(false);
    }
  };
  const handleSaveDirectory = async () => {
    const cleanedUsers = draftUsers.map((item) => ({
      ...item,
      username: item.username.trim(),
      displayName: item.displayName.trim(),
      agentName: item.agentName.trim() || item.displayName.trim(),
      email: item.email.trim(),
      role: normalizeRoleName(item.role),
      teamLead:
        item.status === "Suspended"
          ? ""
          : item.teamLead.trim(),
      teamName:
        item.status === "Suspended"
          ? ""
          : item.teamName.trim(),
      suspendReason: item.suspendReason.trim(),
      suspendEffectiveDate: item.suspendEffectiveDate.trim(),
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
        user.suspendReason !== (original.suspendReason || "") ||
        user.suspendEffectiveDate !== (original.suspendEffectiveDate || "")
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
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
    registerTHSarabunNew(doc);
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
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const ensurePage = (neededHeight = 8) => {
      if (y + neededHeight <= pageHeight - 12) return;
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
        doc.line(startX, y + 2, pageWidth - 14, y + 2);
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
        ["User", "Email", "Team", "Role", "Status"],
        [58, 82, 58, 48, 30],
        visibleRows.map((row) => [
          row.displayName || row.username,
          row.email || "-",
          row.teamName || "-",
          row.effectiveRole,
          row.status,
        ])
      );
    }    const fileName = `QA_${exportContext}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(fileName);

    try {
      await logUsageEventBestEffort(currentUser, "pdf_generate", {
        tab: "user-roles",
        details: { pdfType: exportContext, fileName },
      });
    } catch {
      // Do not block PDF download if audit logging fails.
    }
  };

  const pageCopy = adminTab === "users"
    ? {
        eyebrow: "User Management",
        title: "Users",
        subtitle: "จัดการข้อมูลผู้ใช้ บัญชี สถานะ และทีมที่รับผิดชอบ",
        workspaceTitle: "User Directory",
        workspaceSubtitle: "สร้าง แก้ไข และควบคุมบัญชีผู้ใช้งาน",
      }
    : adminTab === "roles"
      ? {
          eyebrow: "Access Control",
          title: "Roles & Permissions",
          subtitle: "จัดการ Role และกำหนดสิทธิ์การเข้าถึงแต่ละส่วนของระบบ",
          workspaceTitle: "Access Management",
          workspaceSubtitle: "กำหนดบทบาทและสิทธิ์ของผู้ใช้งาน",
        }
      : {
          eyebrow: "System",
          title: "System Setup",
          subtitle: "จัดการ Maintenance Mode และสถานะการเปิดใช้งานระบบ",
          workspaceTitle: "System Maintenance",
          workspaceSubtitle: "ควบคุมการเปิดหรือปิดระบบสำหรับผู้ใช้งาน",
        };

  return (
    <div data-admin-section-v56="true" className="min-h-screen bg-[#fbf8ff] text-slate-950">
      <PageHero
        eyebrow={pageCopy.eyebrow}
        title={pageCopy.title}
        subtitle={pageCopy.subtitle}
        workspaceTitle={pageCopy.workspaceTitle}
        workspaceSubtitle={pageCopy.workspaceSubtitle}
      />

      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-5 lg:px-6 2xl:px-8">
        {adminTab === "users" ? (
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <MetricCard label="Total Users" value={totalUsers} tone="text-violet-600" />
            <MetricCard label="Active" value={activeUsers} tone="text-emerald-600" />
            <MetricCard label="Suspended" value={suspendedUsers} tone="text-rose-600" />
            <MetricCard label="Senior" value={seniorUsers} tone="text-amber-600" />
            <MetricCard label="Supervisors" value={supervisorUsers} tone="text-sky-600" />
            <MetricCard label="Quality Assurance" value={qaUsers} tone="text-fuchsia-600" />
          </div>
        ) : null}

        {showPrimaryTabs ? (
          <div className="mt-6 rounded-[30px] border border-violet-100 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 p-3 shadow-[0_18px_48px_rgba(109,40,217,0.10)]">
            <div className="grid gap-3 lg:grid-cols-3">
              {canViewUserDirectory ? (
                <AdminPrimaryTabButton
                  active={adminTab === "users"}
                  title="Users"
                  description={canManageUsers ? "Manage user profiles and account status" : "View user profiles and account status"}
                  count={totalUsers}
                  onClick={() => setAdminTab("users")}
                />
              ) : null}
              {canManageRoles ? (
                <AdminPrimaryTabButton
                  active={adminTab === "roles"}
                  title="Access"
                  description="Configure roles and permissions"
                  count={roleDefinitions.length}
                  onClick={() => setAdminTab("roles")}
                />
              ) : null}
              {canManageMaintenance ? (
                <AdminPrimaryTabButton
                  active={adminTab === "maintenance"}
                  title="Maintenance"
                  description={maintenanceState.enabled ? "Maintenance mode is active" : "System is open for users"}
                  count={maintenanceState.enabled ? 1 : 0}
                  tone={maintenanceState.enabled ? "amber" : "slate"}
                  onClick={() => setAdminTab("maintenance")}
                />
              ) : null}
            </div>
          </div>
        ) : null}

        {message ? (
          <div className="mt-4 rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-bold text-violet-700 shadow-sm">
            {message}
          </div>
        ) : null}
        {accessMessage ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            มีการสร้างหรืออัปเดตรหัสผ่านชั่วคราวแล้ว ระบบจะไม่แสดงรหัสผ่านในหน้า Directory
          </div>
        ) : null}

        {adminTab === "users" && canViewUserDirectory ? (
          <div className="mt-5">
            {userManagementView === "teams" ? (
              <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(58,34,111,0.08)]">
                <div className="flex flex-col gap-4 border-b border-slate-200 bg-white px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-violet-700">
                      Team View
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-slate-950">
                      ภาพรวมทีมและสมาชิก
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      ดูสมาชิก หัวหน้าทีม และ Role ที่ใช้งานในแต่ละทีม
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      title="กลับไปยังหน้าโปรไฟล์ผู้ใช้งาน"
                      onClick={() => switchUserManagementView("users")}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:border-violet-200 hover:text-violet-700"
                    >
                      ← กลับโปรไฟล์ผู้ใช้
                    </button>
                    {canManageTeams ? (
                      <button
                        type="button"
                        title="เปิดหน้าจัดการทีม หัวหน้าทีม และสมาชิก"
                        onClick={() => {
                          startEditingUserManagementView("team-management");
                          setUserManagementView("team-management");
                        }}
                        className="rounded-xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-4 py-2.5 text-sm font-medium text-white"
                      >
                        จัดการทีม
                      </button>
                    ) : null}
                  </div>
                </div>
                <TeamOverviewPanel teamGroups={teamGroups} />
              </div>
            ) : userManagementView === "team-management" ? (
              <div
                data-unsaved-changes={isEditingTeamManagement ? "true" : "false"}
                className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(58,34,111,0.08)]"
              >
                <div className="flex flex-col gap-4 border-b border-slate-200 bg-white px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-amber-700">
                      Team Management
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-slate-950">
                      จัดการทีมและสมาชิก
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      แก้ชื่อทีม หัวหน้าทีม Role และการมอบหมายสมาชิก
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      title="สร้างทีมใหม่และเลือกสมาชิก"
                      onClick={openCreateTeamModal}
                      className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-700"
                    >
                      + เพิ่มทีม
                    </button>
                    <button
                      type="button"
                      title="ยกเลิกการแก้ไขทีมและกลับไปหน้าโปรไฟล์ผู้ใช้"
                      onClick={() => {
                        handleCancelEdit();
                        switchUserManagementView("users");
                      }}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      title="บันทึกการเปลี่ยนแปลงทีมและสมาชิกทั้งหมด"
                      onClick={handleSaveDirectory}
                      disabled={saving}
                      className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {saving ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}
                    </button>
                  </div>
                </div>
                <TeamManagementPanel
                  users={visibleDraftUsers}
                  saving={saving}
                  onChange={updateDraftUser}
                  onTeamChange={updateDraftTeam}
                  roleOptions={activeRoleOptions}
                  canManageTeams={canManageTeams}
                  isEditing={isEditingTeamManagement}
                />
              </div>
            ) : isEditingUsers ? (
              <div
                data-unsaved-changes="true"
                className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(58,34,111,0.08)]"
              >
                <div className="border-b border-slate-200 bg-white px-5 py-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-violet-700">
                        Bulk Account Editor
                      </div>
                      <div className="mt-1 text-2xl font-semibold text-slate-950">
                        แก้ไขข้อมูลผู้ใช้หลายบัญชี
                      </div>
                      <div className="mt-1 text-sm text-slate-500">
                        เลือกและอัปเดต Role สถานะบัญชี วันระงับ เหตุผล และรหัสผ่านชั่วคราวให้หลายบัญชีพร้อมกัน
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        title="ยกเลิกการแก้ไขทั้งหมดและกลับหน้าโปรไฟล์ผู้ใช้"
                        onClick={handleCancelEdit}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600"
                      >
                        ยกเลิก
                      </button>
                      <button
                        type="button"
                        title="บันทึกข้อมูลบัญชีที่แก้ไขทั้งหมด"
                        onClick={handleSaveDirectory}
                        disabled={saving}
                        className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {saving ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="inline-flex w-fit gap-1 rounded-xl border border-slate-200 bg-white p-1">
                      <button
                        type="button"
                        title="แสดงและแก้ไขเฉพาะบัญชี Active"
                        onClick={() => setDirectoryTab("active")}
                        className={`rounded-lg px-3 py-2 text-xs font-medium ${
                          directoryTab === "active"
                            ? "bg-violet-700 text-white"
                            : "text-slate-600"
                        }`}
                      >
                        Active {activeUsers}
                      </button>
                      <button
                        type="button"
                        title="แสดงและแก้ไขเฉพาะบัญชี Suspended"
                        onClick={() => setDirectoryTab("suspended")}
                        className={`rounded-lg px-3 py-2 text-xs font-medium ${
                          directoryTab === "suspended"
                            ? "bg-rose-600 text-white"
                            : "text-slate-600"
                        }`}
                      >
                        Suspended {suspendedUsers}
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <select
                        value={directoryRoleFilter}
                        onChange={(event) =>
                          setDirectoryRoleFilter(
                            event.target.value as UserRole | "all"
                          )
                        }
                        title="กรองรายการแก้ไขตาม Role"
                        aria-label="กรองรายการแก้ไขตาม Role"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none"
                      >
                        <option value="all">ทุก Role</option>
                        {activeRoleOptions.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        title="สร้างรหัสผ่านชั่วคราวให้ผู้ใช้ใน Role และสถานะที่เลือก"
                        onClick={generateDraftPasswordsForSelectedRole}
                        className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-700"
                      >
                        สร้างรหัสผ่านชั่วคราวตาม Role
                      </button>
                    </div>
                  </div>
                </div>

                <EditableDirectoryTable
                  users={visibleDraftUsers}
                  saving={saving}
                  roleOptions={activeRoleOptions}
                  onChange={updateDraftUser}
                  onGeneratePassword={generateDraftPassword}
                />
              </div>
            ) : (
              <ReadOnlyDirectoryTable
                rows={scopedRows}
                canManageUsers={canManageUsers}
                canManageTeams={canManageTeams}
                rolePermissions={rolePermissions}
                statusView={directoryTab}
                onStatusViewChange={setDirectoryTab}
                onCreateUser={openCreateUserModal}
                onExportPdf={() => void handleExportPdf()}
                onEditDirectory={() =>
                  startEditingUserManagementView("users")
                }
                onOpenTeams={() =>
                  switchUserManagementView("teams")
                }
                onManageTeams={() => {
                  startEditingUserManagementView("team-management");
                  setUserManagementView("team-management");
                }}
                onSaveAccount={saveSingleUserAccount}
              />
            )}
          </div>
        ) : adminTab === "roles" && canManageRoles ? (
          <div className="mt-5 overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_22px_70px_rgba(15,23,42,0.07)]">
            <div className="flex flex-col gap-4 border-b border-slate-200 bg-white px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-6">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-700">Access</div>
                <div className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Role & Permission Management</div>
                <div className="mt-1 text-sm leading-6 text-slate-500">Create roles, update role descriptions, and control what each role can access.</div>
              </div>
              <button type="button" title="ส่งออกข้อมูลของหน้าปัจจุบันเป็นไฟล์ PDF โดยไม่แสดงรหัสผ่าน" aria-label="ส่งออกข้อมูลเป็น PDF" onClick={() => void handleExportPdf()} className="rounded-xl bg-sky-500 px-4 py-2.5 text-xs font-black text-white shadow-[0_12px_28px_rgba(14,165,233,0.26)] transition hover:bg-sky-600">
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
              savedPermissions={rolePermissions}
              onPermissionChange={updateRolePermission}
              onSavePermissions={() => void saveRolePermissions()}
            />
          </div>
        ) : adminTab === "maintenance" && canManageMaintenance ? (
          <div className="mt-5 overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_22px_70px_rgba(15,23,42,0.07)]">
            <div className="flex flex-col gap-4 border-b border-slate-200 bg-white px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-6">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-700">Maintenance</div>
                <div className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Maintenance Control Center</div>
                <div className="mt-1 text-sm leading-6 text-slate-500">Temporarily restrict access while updating system configuration or QA data.</div>
              </div>
              <button type="button" title="ส่งออกข้อมูลของหน้าปัจจุบันเป็นไฟล์ PDF โดยไม่แสดงรหัสผ่าน" aria-label="ส่งออกข้อมูลเป็น PDF" onClick={() => void handleExportPdf()} className="rounded-xl bg-sky-500 px-4 py-2.5 text-xs font-black text-white shadow-[0_12px_28px_rgba(14,165,233,0.26)] transition hover:bg-sky-600">
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
  const currentUserRaw =
    typeof window !== "undefined"
      ? window.localStorage.getItem("qa_current_user")
      : "";

  let currentUserName = "System Administrator";
  try {
    const currentUser = currentUserRaw
      ? JSON.parse(currentUserRaw)
      : null;
    currentUserName =
      String(currentUser?.displayName || currentUser?.username || "").trim() ||
      "System Administrator";
  } catch {
    currentUserName = "System Administrator";
  }

  const toLocalDateTimeValue = (date: Date) => {
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60_000)
      .toISOString()
      .slice(0, 16);
  };

  const formatThaiDateTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";

    return new Intl.DateTimeFormat("th-TH", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "Asia/Bangkok",
    }).format(date);
  };

  const [controlState, setControlState] =
    useState<AdvancedMaintenanceState>({
      enabled: maintenanceState.enabled,
      status: maintenanceState.enabled ? "active" : "open",
      message: maintenanceMessage,
      title: "ระบบอยู่ระหว่างการปรับปรุง",
      reasonId: "",
      reasonName: "",
      severity: "planned",
      scheduledStartAt: "",
      scheduledEndAt: "",
      autoOpenEnabled: false,
      updatedAt: maintenanceState.updatedAt,
      updatedBy: maintenanceState.updatedBy,
    });

  const [templates, setTemplates] =
    useState<MaintenanceReasonTemplate[]>(
      DEFAULT_MAINTENANCE_REASONS
    );
  const [selectedReasonId, setSelectedReasonId] = useState("");
  const [title, setTitle] = useState(
    "ระบบอยู่ระหว่างการปรับปรุง"
  );
  const [message, setMessage] = useState(maintenanceMessage);
  const [severity, setSeverity] =
    useState<MaintenanceSeverity>("planned");
  const [startMode, setStartMode] =
    useState<"now" | "scheduled">("now");
  const [scheduledStartAt, setScheduledStartAt] = useState(
    toLocalDateTimeValue(new Date(Date.now() + 5 * 60_000))
  );
  const [autoOpenEnabled, setAutoOpenEnabled] = useState(true);
  const [scheduledEndAt, setScheduledEndAt] = useState(
    toLocalDateTimeValue(new Date(Date.now() + 60 * 60_000))
  );
  const [templateDrawerOpen, setTemplateDrawerOpen] =
    useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateTitle, setNewTemplateTitle] = useState(
    "ระบบอยู่ระหว่างการปรับปรุง"
  );
  const [newTemplateMessage, setNewTemplateMessage] =
    useState("");
  const [newTemplateSeverity, setNewTemplateSeverity] =
    useState<MaintenanceSeverity>("planned");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [savingLocal, setSavingLocal] = useState(false);
  const [toast, setToast] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetchMaintenanceControlState(),
      fetchMaintenanceReasonTemplates(),
    ]).then(([storedState, storedTemplates]) => {
      if (cancelled) return;

      setControlState(storedState);
      setTemplates(storedTemplates);
      setSelectedReasonId(storedState.reasonId || "");
      setTitle(
        storedState.title || "ระบบอยู่ระหว่างการปรับปรุง"
      );
      setMessage(storedState.message || maintenanceMessage || "");
      setSeverity(storedState.severity || "planned");
      setAutoOpenEnabled(storedState.autoOpenEnabled);

      if (storedState.scheduledStartAt) {
        setScheduledStartAt(
          toLocalDateTimeValue(
            new Date(storedState.scheduledStartAt)
          )
        );
      }

      if (storedState.scheduledEndAt) {
        setScheduledEndAt(
          toLocalDateTimeValue(
            new Date(storedState.scheduledEndAt)
          )
        );
      }

      setStartMode(
        storedState.status === "scheduled" ? "scheduled" : "now"
      );
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

  const active = Boolean(
    maintenanceState.enabled || controlState.enabled
  );

  const selectedTemplate =
    templates.find((item) => item.id === selectedReasonId) ||
    null;

  const applyTemplate = (templateId: string) => {
    setSelectedReasonId(templateId);

    const template = templates.find(
      (item) => item.id === templateId
    );
    if (!template) return;

    setTitle(template.title);
    setMessage(template.message);
    setSeverity(template.severity);
    onMessageChange(template.message);
  };

  const setQuickDuration = (minutes: number) => {
    const startDate =
      startMode === "scheduled"
        ? new Date(scheduledStartAt)
        : new Date();

    const safeStart = Number.isNaN(startDate.getTime())
      ? new Date()
      : startDate;

    setScheduledEndAt(
      toLocalDateTimeValue(
        new Date(safeStart.getTime() + minutes * 60_000)
      )
    );
    setAutoOpenEnabled(true);
  };

  const saveTemplates = async (
    nextTemplates: MaintenanceReasonTemplate[]
  ) => {
    setSavingLocal(true);
    try {
      const saved = await saveMaintenanceReasonTemplates(
        nextTemplates
      );
      setTemplates(saved);
      setToast("บันทึกสาเหตุ Maintenance แล้ว");
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : "บันทึกสาเหตุไม่สำเร็จ"
      );
    } finally {
      setSavingLocal(false);
    }
  };

  const createTemplate = async () => {
    const name = newTemplateName.trim();
    const templateMessage = newTemplateMessage.trim();

    if (!name || !templateMessage) {
      setToast("กรุณากรอกชื่อสาเหตุและข้อความให้ครบ");
      return;
    }

    const nextTemplate: MaintenanceReasonTemplate = {
      id: `custom-${Date.now()}`,
      name,
      title:
        newTemplateTitle.trim() ||
        "ระบบอยู่ระหว่างการปรับปรุง",
      message: templateMessage,
      severity: newTemplateSeverity,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveTemplates([...templates, nextTemplate]);
    setSelectedReasonId(nextTemplate.id);
    setTitle(nextTemplate.title);
    setMessage(nextTemplate.message);
    setSeverity(nextTemplate.severity);
    onMessageChange(nextTemplate.message);
    setNewTemplateName("");
    setNewTemplateMessage("");
    setTemplateDrawerOpen(false);
  };

  const removeTemplate = async (templateId: string) => {
    const nextTemplates = templates.filter(
      (item) => item.id !== templateId
    );
    await saveTemplates(nextTemplates);

    if (selectedReasonId === templateId) {
      setSelectedReasonId("");
    }
  };

  const validateBeforeSave = () => {
    if (!selectedReasonId) {
      setToast("กรุณาเลือกสาเหตุการปิดระบบ");
      return false;
    }

    if (!title.trim() || !message.trim()) {
      setToast("กรุณากรอกหัวข้อและข้อความแจ้งผู้ใช้งาน");
      return false;
    }

    const startDate =
      startMode === "scheduled"
        ? new Date(scheduledStartAt)
        : new Date();
    const endDate = new Date(scheduledEndAt);

    if (
      startMode === "scheduled" &&
      Number.isNaN(startDate.getTime())
    ) {
      setToast("กรุณาระบุวันและเวลาเริ่ม Maintenance");
      return false;
    }

    if (
      autoOpenEnabled &&
      (Number.isNaN(endDate.getTime()) ||
        endDate.getTime() <= startDate.getTime())
    ) {
      setToast("เวลาเปิดระบบต้องอยู่หลังเวลาเริ่ม Maintenance");
      return false;
    }

    return true;
  };

  const commitMaintenance = async () => {
    if (!validateBeforeSave()) return;

    const template =
      templates.find((item) => item.id === selectedReasonId) ||
      selectedTemplate;

    const startDate =
      startMode === "scheduled"
        ? new Date(scheduledStartAt)
        : new Date();

    const scheduled =
      startMode === "scheduled" &&
      startDate.getTime() > Date.now();

    const nextState: AdvancedMaintenanceState = {
      enabled: !scheduled,
      status: scheduled ? "scheduled" : "active",
      message: message.trim(),
      title: title.trim(),
      reasonId: selectedReasonId,
      reasonName:
        template?.name || "Maintenance",
      severity,
      scheduledStartAt: startDate.toISOString(),
      scheduledEndAt: autoOpenEnabled
        ? new Date(scheduledEndAt).toISOString()
        : "",
      autoOpenEnabled,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUserName,
    };

    setSavingLocal(true);
    try {
      await saveMaintenanceControlState(nextState);
      onMessageChange(nextState.message);

      await onSaveMaintenanceMode(!scheduled);

      setControlState(nextState);
      setConfirmOpen(false);
      setToast(
        scheduled
          ? "ตั้งเวลา Maintenance เรียบร้อยแล้ว"
          : "เปิด Maintenance เรียบร้อยแล้ว"
      );

      window.dispatchEvent(
        new CustomEvent("qa-maintenance-state-updated", {
          detail: nextState,
        })
      );
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : "บันทึก Maintenance ไม่สำเร็จ"
      );
    } finally {
      setSavingLocal(false);
    }
  };

  const turnOffMaintenance = async () => {
    const nextState: AdvancedMaintenanceState = {
      ...controlState,
      enabled: false,
      status: "completed",
      updatedAt: new Date().toISOString(),
      updatedBy: currentUserName,
    };

    setSavingLocal(true);
    try {
      await saveMaintenanceControlState(nextState);
      await onSaveMaintenanceMode(false);
      setControlState(nextState);
      setToast("เปิดระบบกลับมาใช้งานตามปกติแล้ว");
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : "เปิดระบบไม่สำเร็จ"
      );
    } finally {
      setSavingLocal(false);
    }
  };

  const severityStyles =
    severity === "emergency"
      ? {
          border: "border-rose-300",
          panel: "from-rose-50 via-white to-orange-50",
          badge: "bg-rose-100 text-rose-700",
          icon: "bg-rose-600",
        }
      : severity === "important"
        ? {
            border: "border-amber-300",
            panel: "from-amber-50 via-white to-orange-50",
            badge: "bg-amber-100 text-amber-700",
            icon: "bg-amber-500",
          }
        : {
            border: "border-violet-300",
            panel: "from-violet-50 via-white to-fuchsia-50",
            badge: "bg-violet-100 text-violet-700",
            icon: "bg-violet-600",
          };

  const previewTarget =
    autoOpenEnabled && scheduledEndAt
      ? new Date(scheduledEndAt).getTime()
      : 0;

  const previewSeconds = previewTarget
    ? Math.max(0, Math.floor((previewTarget - now) / 1000))
    : 0;

  const previewDays = Math.floor(previewSeconds / 86400);
  const previewHours = Math.floor(
    (previewSeconds % 86400) / 3600
  );
  const previewMinutes = Math.floor(
    (previewSeconds % 3600) / 60
  );
  const previewSecondsOnly = previewSeconds % 60;

  const busy = saving || savingLocal;

  return (
    <div
      data-unsaved-changes={
        savingLocal ? "true" : "false"
      }
      className="min-h-full bg-gradient-to-br from-slate-50 via-white to-violet-50/40 p-5 lg:p-6"
    >
      {toast ? (
        <div className="fixed right-5 top-5 z-[240] rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
          {toast}
        </div>
      ) : null}

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-violet-600">
            System Operations
          </div>
          <div className="mt-1 text-[32px] font-semibold tracking-tight text-slate-950">
            Maintenance Control Center
          </div>
          <div className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            จัดการการปิดระบบ เลือกหรือสร้างสาเหตุ กำหนดเวลาเริ่ม และเปิดระบบกลับอัตโนมัติ
          </div>
        </div>

        <div
          className={`inline-flex items-center gap-3 rounded-2xl border px-4 py-3 ${
            active
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : controlState.status === "scheduled"
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              active
                ? "bg-rose-500"
                : controlState.status === "scheduled"
                  ? "bg-amber-500"
                  : "bg-emerald-500"
            }`}
          />
          <div>
            <div className="text-xs font-medium">
              สถานะปัจจุบัน
            </div>
            <div className="mt-0.5 text-sm font-semibold">
              {active
                ? "Maintenance เปิดอยู่"
                : controlState.status === "scheduled"
                  ? "ตั้งเวลา Maintenance แล้ว"
                  : "ระบบเปิดใช้งานปกติ"}
            </div>
          </div>
        </div>
      </div>

      {active || controlState.status === "scheduled" ? (
        <div className="mt-5 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <div className="text-xs text-slate-400">สาเหตุ</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {controlState.reasonName || "-"}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">เริ่ม</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {formatThaiDateTime(
                  controlState.scheduledStartAt
                )}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">เปิดกลับ</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {controlState.autoOpenEnabled
                  ? formatThaiDateTime(
                      controlState.scheduledEndAt
                    )
                  : "เปิดด้วยตนเอง"}
              </div>
            </div>
            <div className="flex items-end justify-start md:justify-end">
              {active ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void turnOffMaintenance()}
                  className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  เปิดระบบตอนนี้
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <div className="space-y-5">
          <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-lg font-semibold text-slate-950">
                  รายละเอียด Maintenance
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  เลือกสาเหตุเดิมหรือสร้าง Template ใหม่ไว้ใช้ครั้งต่อไป
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setTemplateDrawerOpen((current) => !current)
                }
                className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-medium text-violet-700"
              >
                จัดการสาเหตุ
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">
                  สาเหตุการปิดระบบ *
                </span>
                <select
                  value={selectedReasonId}
                  onChange={(event) =>
                    applyTemplate(event.target.value)
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                >
                  <option value="">เลือกสาเหตุการปิดระบบ</option>
                  {templates
                    .filter((item) => item.active)
                    .map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-medium text-slate-600">
                  หัวข้อที่แสดงบนหน้า Login
                </span>
                <input
                  value={title}
                  onChange={(event) =>
                    setTitle(event.target.value)
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-slate-600">
                  ข้อความแจ้งผู้ใช้งาน
                </span>
                <textarea
                  value={message}
                  onChange={(event) => {
                    setMessage(event.target.value);
                    onMessageChange(event.target.value);
                  }}
                  className="mt-2 min-h-[125px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-800 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                />
              </label>

              <div>
                <div className="text-xs font-medium text-slate-600">
                  ระดับการแจ้งเตือน
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {[
                    ["planned", "Planned"],
                    ["important", "Important"],
                    ["emergency", "Emergency"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        setSeverity(
                          value as MaintenanceSeverity
                        )
                      }
                      className={`rounded-xl border px-3 py-2.5 text-xs font-medium ${
                        severity === value
                          ? value === "emergency"
                            ? "border-rose-300 bg-rose-50 text-rose-700"
                            : value === "important"
                              ? "border-amber-300 bg-amber-50 text-amber-700"
                              : "border-violet-300 bg-violet-50 text-violet-700"
                          : "border-slate-200 bg-white text-slate-500"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-lg font-semibold text-slate-950">
              กำหนดวันและเวลา
            </div>
            <div className="mt-1 text-sm text-slate-500">
              ตั้งให้เริ่มทันทีหรือเริ่มในอนาคต และกำหนดเวลาเปิดระบบกลับ
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setStartMode("now")}
                className={`rounded-2xl border px-4 py-3 text-left ${
                  startMode === "now"
                    ? "border-violet-300 bg-violet-50"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="text-sm font-semibold text-slate-900">
                  เปิด Maintenance ทันที
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  มีผลหลังยืนยัน
                </div>
              </button>

              <button
                type="button"
                onClick={() => setStartMode("scheduled")}
                className={`rounded-2xl border px-4 py-3 text-left ${
                  startMode === "scheduled"
                    ? "border-violet-300 bg-violet-50"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="text-sm font-semibold text-slate-900">
                  กำหนดเวลาเริ่ม
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  ระบบเริ่มตามเวลาที่ตั้งไว้
                </div>
              </button>
            </div>

            {startMode === "scheduled" ? (
              <label className="mt-4 block">
                <span className="text-xs font-medium text-slate-600">
                  วันและเวลาเริ่ม Maintenance
                </span>
                <input
                  type="datetime-local"
                  value={scheduledStartAt}
                  onChange={(event) =>
                    setScheduledStartAt(event.target.value)
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                />
              </label>
            ) : null}

            <label className="mt-5 flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  เปิดระบบกลับอัตโนมัติ
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  เมื่อถึงเวลาที่กำหนด ระบบจะเปลี่ยนสถานะเป็นเปิดใช้งาน
                </div>
              </div>
              <input
                type="checkbox"
                checked={autoOpenEnabled}
                onChange={(event) =>
                  setAutoOpenEnabled(event.target.checked)
                }
                className="h-5 w-5 accent-violet-600"
              />
            </label>

            {autoOpenEnabled ? (
              <>
                <label className="mt-4 block">
                  <span className="text-xs font-medium text-slate-600">
                    วันและเวลาเปิดระบบกลับ
                  </span>
                  <input
                    type="datetime-local"
                    value={scheduledEndAt}
                    onChange={(event) =>
                      setScheduledEndAt(event.target.value)
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                  />
                </label>

                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    [15, "15 นาที"],
                    [30, "30 นาที"],
                    [60, "1 ชั่วโมง"],
                    [120, "2 ชั่วโมง"],
                    [240, "4 ชั่วโมง"],
                  ].map(([minutes, label]) => (
                    <button
                      key={String(minutes)}
                      type="button"
                      onClick={() =>
                        setQuickDuration(Number(minutes))
                      }
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:border-violet-300 hover:text-violet-700"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm leading-6 text-violet-800">
              {startMode === "scheduled"
                ? `ระบบจะเริ่ม Maintenance วันที่ ${formatThaiDateTime(
                    scheduledStartAt
                  )}`
                : "ระบบจะเริ่ม Maintenance ทันทีหลังยืนยัน"}
              {autoOpenEnabled
                ? ` และเปิดกลับอัตโนมัติวันที่ ${formatThaiDateTime(
                    scheduledEndAt
                  )}`
                : " และต้องเปิดระบบกลับด้วยตนเอง"}
            </div>
          </section>
        </div>

        <div className="space-y-5">
          <section
            className={`overflow-hidden rounded-[28px] border bg-gradient-to-br ${severityStyles.border} ${severityStyles.panel} shadow-sm`}
          >
            <div className={`h-1.5 ${severityStyles.icon}`} />
            <div className="p-5">
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                Login Preview
              </div>

              <div className="mt-4 flex items-start gap-4">
                <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl text-white shadow-lg ${severityStyles.icon}`}>
                  !
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${severityStyles.badge}`}>
                    {selectedTemplate?.name || "Maintenance"}
                  </div>
                  <div className="mt-2 text-xl font-semibold text-slate-950">
                    {title || "ระบบอยู่ระหว่างการปรับปรุง"}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-600">
                    {message || "ข้อความแจ้งผู้ใช้งานจะแสดงตรงนี้"}
                  </div>
                </div>
              </div>

              {autoOpenEnabled ? (
                <div className="mt-5 rounded-2xl border border-white/80 bg-white/80 p-4">
                  <div className="text-xs text-slate-500">
                    ระบบจะเปิดให้ใช้งานอีกครั้ง
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-950">
                    {formatThaiDateTime(scheduledEndAt)}
                  </div>

                  <div className="mt-4 grid grid-cols-4 gap-2">
                    {[
                      ["วัน", previewDays],
                      ["ชั่วโมง", previewHours],
                      ["นาที", previewMinutes],
                      ["วินาที", previewSecondsOnly],
                    ].map(([label, value]) => (
                      <div
                        key={String(label)}
                        className="rounded-xl border border-slate-200 bg-white px-2 py-3 text-center"
                      >
                        <div className="text-lg font-semibold text-slate-950">
                          {String(value).padStart(2, "0")}
                        </div>
                        <div className="mt-1 text-[10px] text-slate-500">
                          {label}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-4 rounded-xl bg-white/70 px-3 py-2 text-xs text-slate-500">
                เจ้าของระบบและ Role ที่มีสิทธิ์ Manage Maintenance ยัง Login และใช้งานได้
              </div>
            </div>
          </section>

          <section className="sticky top-5 rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-lg font-semibold text-slate-950">
              ตรวจสอบก่อนดำเนินการ
            </div>
            <div className="mt-3 space-y-3 text-sm text-slate-600">
              <div className="flex justify-between gap-4">
                <span>สาเหตุ</span>
                <span className="text-right font-medium text-slate-900">
                  {selectedTemplate?.name || "-"}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span>เริ่ม</span>
                <span className="text-right font-medium text-slate-900">
                  {startMode === "now"
                    ? "ทันที"
                    : formatThaiDateTime(scheduledStartAt)}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span>เปิดกลับ</span>
                <span className="text-right font-medium text-slate-900">
                  {autoOpenEnabled
                    ? formatThaiDateTime(scheduledEndAt)
                    : "เปิดด้วยตนเอง"}
                </span>
              </div>
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (validateBeforeSave()) setConfirmOpen(true);
              }}
              className="mt-5 w-full rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-3.5 text-sm font-medium text-white shadow-[0_14px_30px_rgba(109,40,217,0.22)] disabled:opacity-50"
            >
              {startMode === "scheduled"
                ? "ตั้งเวลา Maintenance"
                : "เปิด Maintenance"}
            </button>
          </section>
        </div>
      </div>

      {templateDrawerOpen ? (
        <div className="fixed inset-0 z-[230] flex justify-end bg-slate-950/35 backdrop-blur-sm">
          <button
            type="button"
            aria-label="ปิด"
            onClick={() => setTemplateDrawerOpen(false)}
            className="absolute inset-0"
          />
          <div className="relative h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-2xl font-semibold text-slate-950">
                  Maintenance Reasons
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  สร้างและจัดการสาเหตุไว้ใช้ในครั้งต่อไป
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTemplateDrawerOpen(false)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-500"
              >
                ปิด
              </button>
            </div>

            <div className="mt-6 rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
              <div className="text-sm font-semibold text-slate-900">
                เพิ่มสาเหตุใหม่
              </div>
              <div className="mt-4 grid gap-3">
                <input
                  value={newTemplateName}
                  onChange={(event) =>
                    setNewTemplateName(event.target.value)
                  }
                  placeholder="ชื่อสาเหตุ"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none"
                />
                <input
                  value={newTemplateTitle}
                  onChange={(event) =>
                    setNewTemplateTitle(event.target.value)
                  }
                  placeholder="หัวข้อบนหน้า Login"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none"
                />
                <textarea
                  value={newTemplateMessage}
                  onChange={(event) =>
                    setNewTemplateMessage(event.target.value)
                  }
                  placeholder="ข้อความเริ่มต้น"
                  className="min-h-[100px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none"
                />
                <select
                  value={newTemplateSeverity}
                  onChange={(event) =>
                    setNewTemplateSeverity(
                      event.target.value as MaintenanceSeverity
                    )
                  }
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none"
                >
                  <option value="planned">Planned</option>
                  <option value="important">Important</option>
                  <option value="emergency">Emergency</option>
                </select>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void createTemplate()}
                  className="rounded-xl bg-violet-700 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
                >
                  บันทึกสาเหตุใหม่
                </button>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900">
                        {template.name}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {template.title}
                      </div>
                      <div className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
                        {template.message}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void removeTemplate(template.id)
                      }
                      className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 disabled:opacity-50"
                    >
                      ลบ
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {confirmOpen ? (
        <div className="fixed inset-0 z-[240] flex items-center justify-center bg-slate-950/45 p-5 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="text-xl font-semibold text-slate-950">
              ยืนยันการตั้งค่า Maintenance
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-500">
              กรุณาตรวจสอบสาเหตุ วันและเวลาให้ถูกต้องก่อนดำเนินการ
            </div>

            <div className="mt-5 space-y-3 rounded-2xl bg-slate-50 p-4 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">สาเหตุ</span>
                <span className="text-right font-medium text-slate-900">
                  {selectedTemplate?.name}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">เริ่ม</span>
                <span className="text-right font-medium text-slate-900">
                  {startMode === "now"
                    ? "ทันที"
                    : formatThaiDateTime(scheduledStartAt)}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">เปิดกลับ</span>
                <span className="text-right font-medium text-slate-900">
                  {autoOpenEnabled
                    ? formatThaiDateTime(scheduledEndAt)
                    : "เปิดด้วยตนเอง"}
                </span>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmOpen(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void commitMaintenance()}
                className="rounded-xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                ยืนยัน
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
  // Passwords are intentionally excluded from directory screens and exports.
  return {} as Record<string, string>;
}
function ReadOnlyDirectoryTable({
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
  onSaveAccount,
}: {
  rows: Array<
    UserAccount & {
      effectiveRole: UserRole;
      normalizedUsername: string;
      status: UserStatus;
    }
  >;
  canManageUsers: boolean;
  canManageTeams: boolean;
  rolePermissions: RolePermissionMap;
  statusView: DirectoryTab;
  onStatusViewChange: (value: DirectoryTab) => void;
  onCreateUser: () => void;
  onExportPdf: () => void;
  onEditDirectory: () => void;
  onOpenTeams: () => void;
  onManageTeams: () => void;
  onSaveAccount: (
    update: CorporateUserAccountUpdate
  ) => Promise<void>;
}) {
  return (
    <CorporateUserDirectoryProfile
      rows={rows}
      canManageUsers={canManageUsers}
      canManageTeams={canManageTeams}
      rolePermissions={rolePermissions}
      statusView={statusView}
      onStatusViewChange={onStatusViewChange}
      onCreateUser={onCreateUser}
      onExportPdf={onExportPdf}
      onEditDirectory={onEditDirectory}
      onOpenTeams={onOpenTeams}
      onManageTeams={onManageTeams}
      onSaveAccount={onSaveAccount}
    />
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
  users: Array<{
    user: EditableUser;
    index: number;
  }>;
  saving: boolean;
  onChange: (
    index: number,
    key: keyof EditableUser,
    value: string
  ) => void;
  canManageTeams: boolean;
  onTeamChange: (
    teamName: string,
    key:
      | "teamLead"
      | "teamName"
      | "role"
      | "roleMode",
    value: string
  ) => void;
  roleOptions: UserRole[];
  isEditing: boolean;
}) {
  const [selectedTeamName, setSelectedTeamName] =
    useState("");
  const [teamSearch, setTeamSearch] = useState("");
  const [memberSearch, setMemberSearch] =
    useState("");
  const [teamRoleModes, setTeamRoleModes] =
    useState<
      Record<string, "keep" | "sync">
    >({});
  const [profilePhotos, setProfilePhotos] =
    useState<Record<string, string>>({});

  const teamGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        teamName: string;
        teamLead: string;
        assignedRole: string;
        roleCounts: Record<string, number>;
        members: Array<{
          user: EditableUser;
          index: number;
        }>;
        activeCount: number;
        suspendedCount: number;
      }
    >();

    users
      .filter(
        ({ user }) =>
          user.status === "Active"
      )
      .forEach((entry) => {
      const teamName =
        entry.user.teamName.trim() ||
        "Unassigned Team";
      const existing =
        map.get(teamName) || {
          teamName,
          teamLead:
            entry.user.teamLead.trim() || "",
          assignedRole: "-",
          roleCounts: {},
          members: [],
          activeCount: 0,
          suspendedCount: 0,
        };

      if (
        !existing.teamLead &&
        entry.user.teamLead
      ) {
        existing.teamLead =
          entry.user.teamLead;
      }

      if (entry.user.role) {
        existing.roleCounts[
          entry.user.role
        ] =
          (existing.roleCounts[
            entry.user.role
          ] || 0) + 1;
      }

      if (
        entry.user.status === "Suspended"
      ) {
        existing.suspendedCount += 1;
      } else {
        existing.activeCount += 1;
      }

      existing.members.push(entry);
      map.set(teamName, existing);
    });

    return Array.from(map.values())
      .map((team) => {
        const roles = Object.keys(
          team.roleCounts
        );

        return {
          ...team,
          assignedRole:
            roles.length === 1
              ? roles[0]
              : roles.length > 1
                ? "Mixed Roles"
                : "-",
        };
      })
      .sort((a, b) =>
        a.teamName.localeCompare(b.teamName)
      );
  }, [users]);

  useEffect(() => {
    if (
      teamGroups.some(
        (team) =>
          team.teamName === selectedTeamName
      )
    ) {
      return;
    }

    setSelectedTeamName(
      teamGroups[0]?.teamName || ""
    );
  }, [selectedTeamName, teamGroups]);

  useEffect(() => {
    let cancelled = false;
    let requestNumber = 0;

    const loadPhotos = async () => {
      const request = ++requestNumber;
      const usernames = Array.from(
        new Set(
          users
            .filter(
              ({ user }) =>
                user.status === "Active"
            )
            .map(({ user }) => user.username)
            .filter(Boolean)
        )
      );

      const entries = await Promise.all(
        usernames.map(async (username) => {
          const stored =
            await fetchStoredProfilePhoto(
              username
            );

          return [
            normalizeUsername(username),
            stored?.photoDataUrl || "",
          ] as const;
        })
      );

      if (
        !cancelled &&
        request === requestNumber
      ) {
        setProfilePhotos(
          Object.fromEntries(entries)
        );
      }
    };

    const refresh: EventListener = () => {
      void loadPhotos();
    };

    void loadPhotos();
    window.addEventListener(
      "qa-profile-photo-updated",
      refresh
    );
    window.addEventListener(
      "focus",
      refresh
    );

    return () => {
      cancelled = true;
      window.removeEventListener(
        "qa-profile-photo-updated",
        refresh
      );
      window.removeEventListener(
        "focus",
        refresh
      );
    };
  }, [users]);

  const visibleTeams = useMemo(() => {
    const keyword =
      teamSearch.trim().toLowerCase();

    if (!keyword) return teamGroups;

    return teamGroups.filter((team) =>
      [
        team.teamName,
        team.teamLead,
        ...team.members.flatMap(
          ({ user }) => [
            user.displayName,
            user.username,
            user.agentName,
          ]
        ),
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [teamGroups, teamSearch]);

  const selectedTeam =
    teamGroups.find(
      (team) =>
        team.teamName === selectedTeamName
    ) ||
    visibleTeams[0] ||
    teamGroups[0] ||
    null;

  const editable =
    canManageTeams &&
    isEditing &&
    !saving;

  const getTeamRoleMode = (
    teamName: string,
    assignedRole: string
  ) =>
    teamRoleModes[teamName] ||
    (assignedRole === "Mixed Roles"
      ? "keep"
      : "sync");

  const setTeamRoleMode = (
    teamName: string,
    mode: "keep" | "sync"
  ) => {
    setTeamRoleModes((current) => ({
      ...current,
      [teamName]: mode,
    }));
  };

  const teamOptions = teamGroups.map(
    (team) => team.teamName
  );

  const selectedLeadKey =
    normalizeUsername(
      selectedTeam?.teamLead || ""
    );

  const isLead = (
    user: EditableUser
  ) =>
    Boolean(selectedLeadKey) &&
    [
      user.username,
      user.displayName,
      user.agentName,
    ].some(
      (value) =>
        normalizeUsername(value || "") ===
        selectedLeadKey
    );

  const orderedMembers = useMemo(() => {
    if (!selectedTeam) return [];

    const keyword =
      memberSearch.trim().toLowerCase();
    const roleRank: Record<string, number> = {
      Supervisor: 10,
      Senior: 20,
      "Quality Assurance": 30,
      "Virtual Rider": 40,
      "Admin Live Chat": 50,
    };

    return [...selectedTeam.members]
      .filter(({ user }) => {
        if (!keyword) return true;

        return [
          user.displayName,
          user.username,
          user.agentName,
          user.email,
          user.role,
          user.status,
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      })
      .sort((a, b) => {
        const aLead = isLead(a.user);
        const bLead = isLead(b.user);

        if (aLead !== bLead) {
          return aLead ? -1 : 1;
        }

        const roleDifference =
          (roleRank[a.user.role] || 99) -
          (roleRank[b.user.role] || 99);

        if (roleDifference) {
          return roleDifference;
        }

        return a.user.displayName.localeCompare(
          b.user.displayName
        );
      });
  }, [
    memberSearch,
    selectedLeadKey,
    selectedTeam,
  ]);

  const leadEntry =
    selectedTeam?.members.find(
      ({ user }) => isLead(user)
    ) || null;

  return (
    <div
      data-team-management-clean-v71="true"
      className="grid min-h-[660px] bg-gradient-to-b from-white to-slate-50 lg:grid-cols-[300px_minmax(0,1fr)]"
    >
      <aside className="border-b border-slate-200 bg-[#fcfcff] p-4 lg:border-b-0 lg:border-r">
        <input
          value={teamSearch}
          onChange={(event) =>
            setTeamSearch(event.target.value)
          }
          placeholder="ค้นหาทีมหรือหัวหน้าทีม"
          title="ค้นหาทีม หัวหน้าทีม หรือสมาชิก"
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
        />

        <div className="mt-4 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          <span>ทีมทั้งหมด</span>
          <span>{visibleTeams.length} ทีม</span>
        </div>

        <div className="mt-2 max-h-[570px] space-y-2 overflow-y-auto pr-1">
          {visibleTeams.map((team) => (
            <button
              key={team.teamName}
              type="button"
              title={`เปิดทีม ${team.teamName}`}
              onClick={() => {
                setSelectedTeamName(
                  team.teamName
                );
                setMemberSearch("");
              }}
              className={`w-full rounded-[18px] border p-3 text-left transition ${
                selectedTeam?.teamName ===
                team.teamName
                  ? "border-violet-300 bg-white shadow-sm"
                  : "border-transparent hover:border-violet-200 hover:bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">
                    {team.teamName}
                  </div>
                  <div className="mt-1 truncate text-[11px] text-slate-500">
                    หัวหน้าทีม{" "}
                    {team.teamLead || "-"}
                  </div>
                </div>

                <span className="shrink-0 rounded-full bg-violet-50 px-2 py-1 text-[10px] font-medium text-violet-700">
                  {team.members.length}
                </span>
              </div>

              <div className="mt-3 flex items-center">
                {team.members
                  .slice(0, 4)
                  .map(({ user }) => {
                    const photo =
                      profilePhotos[
                        normalizeUsername(
                          user.username
                        )
                      ];

                    return (
                      <span
                        key={user.username}
                        title={user.displayName}
                        className={`-mr-1.5 flex h-7 w-7 items-center justify-center overflow-hidden rounded-[10px] border-2 border-white bg-gradient-to-br text-[9px] font-semibold text-white ${roleAvatarClass(
                          user.role
                        )}`}
                      >
                        {photo ? (
                          <img
                            src={photo}
                            alt=""
                            draggable={false}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          userInitials(
                            user.displayName ||
                              user.username
                          )
                        )}
                      </span>
                    );
                  })}

                {team.members.length > 4 ? (
                  <span className="ml-3 text-[10px] text-slate-400">
                    +{team.members.length - 4}
                  </span>
                ) : null}
              </div>
            </button>
          ))}

          {!visibleTeams.length ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-xs text-slate-400">
              ไม่พบทีมที่ค้นหา
            </div>
          ) : null}
        </div>
      </aside>

      <main className="min-w-0 p-4 lg:p-5">
        {selectedTeam ? (
          <>
            <section className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-600">
                    Selected Team
                  </div>

                  {isEditing ? (
                    <input
                      value={selectedTeam.teamName}
                      disabled={!editable}
                      onChange={(event) =>
                        onTeamChange(
                          selectedTeam.teamName,
                          "teamName",
                          event.target.value
                        )
                      }
                      title="แก้ไขชื่อทีม"
                      className="mt-2 w-full max-w-xl rounded-2xl border border-violet-200 bg-white px-4 py-3 text-xl font-semibold text-slate-950 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-50"
                    />
                  ) : (
                    <div className="mt-1 truncate text-2xl font-semibold text-slate-950">
                      {selectedTeam.teamName}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] text-slate-600">
                      <b className="text-slate-900">
                        {selectedTeam.members.length}
                      </b>{" "}
                      สมาชิก
                    </span>
                    <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] text-emerald-700">
                      <b>
                        {selectedTeam.activeCount}
                      </b>{" "}
                      Active
                    </span>
                    <span
                      data-suspended-profile-only-v72="true"
                      className="rounded-full border border-violet-100 bg-violet-50 px-2.5 py-1 text-[10px] text-violet-700"
                    >
                      เฉพาะสมาชิก Active
                    </span>
                  </div>
                </div>

                <div className="w-full max-w-md rounded-[18px] border border-violet-100 bg-violet-50/70 p-3">
                  <div className="text-[10px] font-medium text-violet-600">
                    หัวหน้าทีม
                  </div>

                  {isEditing ? (
                    <input
                      value={selectedTeam.teamLead}
                      disabled={!editable}
                      onChange={(event) =>
                        onTeamChange(
                          selectedTeam.teamName,
                          "teamLead",
                          event.target.value
                        )
                      }
                      placeholder="ระบุชื่อหัวหน้าทีม"
                      title="แก้ไขหัวหน้าทีม"
                      className="mt-2 w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm font-medium outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-50"
                    />
                  ) : (
                    <div className="mt-2 flex items-center gap-3">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[15px] bg-gradient-to-br text-xs font-semibold text-white ${roleAvatarClass(
                          leadEntry?.user.role ||
                            "Supervisor"
                        )}`}
                      >
                        {leadEntry &&
                        profilePhotos[
                          normalizeUsername(
                            leadEntry.user.username
                          )
                        ] ? (
                          <img
                            src={
                              profilePhotos[
                                normalizeUsername(
                                  leadEntry.user
                                    .username
                                )
                              ]
                            }
                            alt=""
                            draggable={false}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          userInitials(
                            leadEntry?.user
                              .displayName ||
                              selectedTeam.teamLead ||
                              "Team Lead"
                          )
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">
                          {leadEntry?.user
                            .displayName ||
                            selectedTeam.teamLead ||
                            "-"}
                        </div>
                        <div className="mt-1 text-[10px] text-slate-500">
                          {leadEntry?.user.role ||
                            "ยังไม่พบโปรไฟล์หัวหน้าทีม"}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {isEditing ? (
                <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-2">
                  <label>
                    <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">
                      การจัดการ Role
                    </span>
                    <select
                      value={getTeamRoleMode(
                        selectedTeam.teamName,
                        selectedTeam.assignedRole
                      )}
                      disabled={!editable}
                      onChange={(event) => {
                        const mode =
                          event.target.value ===
                          "sync"
                            ? "sync"
                            : "keep";

                        setTeamRoleMode(
                          selectedTeam.teamName,
                          mode
                        );

                        if (mode === "keep") {
                          return;
                        }

                        const fallbackRole =
                          roleOptions.includes(
                            selectedTeam.assignedRole
                          )
                            ? selectedTeam.assignedRole
                            : roleOptions[0];

                        if (fallbackRole) {
                          onTeamChange(
                            selectedTeam.teamName,
                            "role",
                            fallbackRole
                          );
                        }
                      }}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-50"
                    >
                      <option value="keep">
                        คง Role ของแต่ละคน
                      </option>
                      <option value="sync">
                        ใช้ Role เดียวกันทั้งทีม
                      </option>
                    </select>
                  </label>

                  <label>
                    <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">
                      Role ของทีม
                    </span>
                    <select
                      value={
                        roleOptions.includes(
                          selectedTeam.assignedRole
                        )
                          ? selectedTeam.assignedRole
                          : ""
                      }
                      disabled={
                        !editable ||
                        getTeamRoleMode(
                          selectedTeam.teamName,
                          selectedTeam.assignedRole
                        ) === "keep"
                      }
                      onChange={(event) => {
                        if (event.target.value) {
                          onTeamChange(
                            selectedTeam.teamName,
                            "role",
                            event.target.value
                          );
                        }
                      }}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-50 disabled:text-slate-400"
                    >
                      <option value="" disabled>
                        เลือก Role
                      </option>
                      {roleOptions.map((role) => (
                        <option
                          key={role}
                          value={role}
                        >
                          {role}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
            </section>

            <section className="mt-4 overflow-hidden rounded-[22px] border border-slate-200 bg-white">
              <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    สมาชิกในทีม
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    หัวหน้าทีมอยู่ลำดับแรก
                    จากนั้นเรียงตาม Role
                  </div>
                </div>

                <input
                  value={memberSearch}
                  onChange={(event) =>
                    setMemberSearch(
                      event.target.value
                    )
                  }
                  placeholder="ค้นหาชื่อ Username หรือ Role"
                  title="ค้นหาสมาชิกในทีม"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100 sm:max-w-[280px]"
                />
              </div>

              <div className="hidden grid-cols-[minmax(0,1.35fr)_150px_120px_170px] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-[10px] font-medium uppercase tracking-[0.1em] text-slate-400 xl:grid">
                <div>ผู้ใช้งาน</div>
                <div>Role</div>
                <div>สถานะ</div>
                <div>ทีมที่มอบหมาย</div>
              </div>

              <div>
                {orderedMembers.map(
                  ({ user, index }) => {
                    const lead = isLead(user);
                    const photo =
                      profilePhotos[
                        normalizeUsername(
                          user.username
                        )
                      ];
                    const keepIndividualRoles =
                      getTeamRoleMode(
                        selectedTeam.teamName,
                        selectedTeam.assignedRole
                      ) === "keep";

                    return (
                      <div
                        key={`${user.username}-${index}`}
                        className="grid gap-3 border-b border-slate-100 px-4 py-3 last:border-0 xl:grid-cols-[minmax(0,1.35fr)_150px_120px_170px] xl:items-center"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-gradient-to-br text-[11px] font-semibold text-white ${roleAvatarClass(
                              user.role
                            )}`}
                          >
                            {photo ? (
                              <img
                                src={photo}
                                alt={`รูปโปรไฟล์ของ ${user.displayName}`}
                                draggable={false}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              userInitials(
                                user.displayName ||
                                  user.username
                              )
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-medium text-slate-900">
                                {user.displayName ||
                                  user.username}
                              </span>
                              {lead ? (
                                <span className="rounded-full bg-amber-50 px-2 py-1 text-[9px] font-medium text-amber-700">
                                  หัวหน้าทีม
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1 truncate text-[11px] text-slate-400">
                              {user.username}
                              {user.email
                                ? ` · ${user.email}`
                                : ""}
                            </div>
                          </div>
                        </div>

                        <div>
                          {isEditing &&
                          keepIndividualRoles ? (
                            <select
                              value={user.role}
                              disabled={!editable}
                              onChange={(event) =>
                                onChange(
                                  index,
                                  "role",
                                  event.target.value
                                )
                              }
                              title={`แก้ไข Role ของ ${user.displayName}`}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-50"
                            >
                              {roleOptions.map(
                                (role) => (
                                  <option
                                    key={role}
                                    value={role}
                                  >
                                    {role}
                                  </option>
                                )
                              )}
                            </select>
                          ) : (
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium ${roleBadgeClass(
                                user.role
                              )}`}
                            >
                              {user.role}
                            </span>
                          )}
                        </div>

                        <div>
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium ${
                              user.status ===
                              "Suspended"
                                ? "bg-rose-50 text-rose-700"
                                : "bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            {user.status}
                          </span>
                        </div>

                        <div>
                          {isEditing ? (
                            <select
                              value={
                                user.teamName.trim() ||
                                "Unassigned Team"
                              }
                              disabled={!editable}
                              onChange={(event) =>
                                onChange(
                                  index,
                                  "teamName",
                                  event.target.value ===
                                    "Unassigned Team"
                                    ? ""
                                    : event.target.value
                                )
                              }
                              title={`ย้ายทีมของ ${user.displayName}`}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-50"
                            >
                              {teamOptions.map(
                                (option) => (
                                  <option
                                    key={option}
                                    value={option}
                                  >
                                    {option}
                                  </option>
                                )
                              )}
                            </select>
                          ) : (
                            <span className="text-xs font-medium text-slate-600">
                              {user.teamName ||
                                "Unassigned Team"}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  }
                )}

                {!orderedMembers.length ? (
                  <div className="px-5 py-12 text-center text-xs text-slate-400">
                    ไม่พบสมาชิกที่ค้นหา
                  </div>
                ) : null}
              </div>
            </section>

            {isEditing ? (
              <div className="sticky bottom-0 z-20 mt-4 flex flex-col gap-2 rounded-[18px] border border-violet-200 bg-white/95 px-4 py-3 shadow-[0_-12px_30px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs font-medium text-slate-800">
                    กำลังแก้ไขทีมและสมาชิก
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">
                    ตรวจสอบข้อมูลแล้วกด
                    “บันทึกการเปลี่ยนแปลง”
                    ด้านบน
                  </div>
                </div>
                <span className="rounded-full bg-violet-50 px-3 py-1.5 text-[10px] font-medium text-violet-700">
                  ยังไม่บันทึก
                </span>
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-[22px] border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
            <div className="text-sm font-medium text-slate-700">
              ยังไม่มีข้อมูลทีม
            </div>
            <div className="mt-1 text-xs text-slate-400">
              เพิ่มทีมและมอบหมายสมาชิกเพื่อเริ่มใช้งาน
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// data-role-permission-readable-font-v58
import {
  DEFAULT_MAINTENANCE_REASONS,
  fetchMaintenanceControlState,
  fetchMaintenanceReasonTemplates,
  MaintenanceControlState as AdvancedMaintenanceState,
  MaintenanceReasonTemplate,
  MaintenanceSeverity,
  saveMaintenanceControlState,
  saveMaintenanceReasonTemplates,
} from "./maintenanceControlStore";
// data-role-permission-column-layout-v59
function PermissionThaiTooltip({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  return (
    <span className="group relative inline-flex shrink-0">
      <span
        tabIndex={0}
        aria-label={`คำอธิบายสิทธิ์ ${label}`}
        className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-slate-200 bg-white text-[11px] font-medium text-slate-500 outline-none transition hover:border-violet-300 hover:text-violet-700 focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
      >
        i
      </span>
      <span className="pointer-events-none absolute left-1/2 top-full z-[70] mt-2 hidden w-72 -translate-x-1/2 rounded-2xl bg-slate-950 px-4 py-3 text-left text-xs font-normal leading-5 text-white shadow-[0_18px_45px_rgba(15,23,42,0.32)] group-hover:block group-focus-within:block">
        <span className="block font-semibold text-violet-200">{label}</span>
        <span className="mt-1 block text-slate-200">{description}</span>
        <span className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-slate-950" />
      </span>
    </span>
  );
}

function RoleManagementPanel({
  roles,
  roleUserCounts,
  newRoleName,
  newRoleDescription,
  saving,
  permissionDrafts,
  savedPermissions,
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
  savedPermissions: RolePermissionMap;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onSave: () => void;
  onSaveRoleDetails: (role: RoleDefinition, name: string, description: string) => void;
  onToggle: (role: RoleDefinition) => void;
  onDelete: (role: RoleDefinition) => void;
  onPermissionChange: (roleName: string, key: RolePermissionKey, value: boolean) => void;
  onSavePermissions: () => void | Promise<void>;
}) {
  const [selectedRoleName, setSelectedRoleName] = useState(roles[0]?.name || "");
  const [roleSearch, setRoleSearch] = useState("");
  const [permissionSearch, setPermissionSearch] = useState("");
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [editingRoleName, setEditingRoleName] = useState("");
  const [editingRoleDraft, setEditingRoleDraft] = useState({ name: "", description: "" });
  const [permissionToast, setPermissionToast] = useState("");
  const categoryOrder = [
    "Appeals",
    "Learning & Training",
    "Performance",
    "QA & Evaluation",
    "System",
    "User & Team",
  ] as const;

  const categoryMeta: Record<
    (typeof categoryOrder)[number],
    { thai: string; icon: string }
  > = {
    Appeals: { thai: "การจัดการอุทธรณ์", icon: "↺" },
    "Learning & Training": { thai: "การเรียนรู้และการฝึกอบรม", icon: "✦" },
    Performance: { thai: "การจัดการผลงาน", icon: "▥" },
    "QA & Evaluation": { thai: "การประเมินคุณภาพ", icon: "★" },
    System: { thai: "การตั้งค่าระบบ", icon: "⚙" },
    "User & Team": { thai: "ผู้ใช้และทีมงาน", icon: "◉" },
  };

  const groupedPermissions = useMemo(() => {
    const groups = categoryOrder.reduce((acc, category) => {
      acc[category] = [];
      return acc;
    }, {} as Record<(typeof categoryOrder)[number], typeof PERMISSION_DEFINITIONS>);

    PERMISSION_DEFINITIONS.forEach((permission) => {
      let category: (typeof categoryOrder)[number] = "System";

      if (["viewAppeal", "submitAppeal", "reviewAppeals", "appealOverride"].includes(permission.key)) {
        category = "Appeals";
      } else if (
        [
          "takePreTest",
          "managePreTest",
          "viewPreTestResults",
          "resetPreTestRetake",
          "exportPreTestResults",
          "viewTrainingCheckIn",
          "viewTrainingAttendance",
          "checkInTrainingSelf",
          "manageTrainingSessions",
          "manageTrainingRoster",
          "manualUpdateTrainingAttendance",
          "exportTrainingAttendance",
        ].includes(permission.key)
      ) {
        category = "Learning & Training";
      } else if (["viewDashboard", "viewAllAgents", "viewSummary", "viewCoaching"].includes(permission.key)) {
        category = "Performance";
      } else if (
        [
          "viewRubric",
          "manageRubric",
          "createEvaluation",
          "qaEvaluationTarget",
          "exportPdf",
          "exportAppealRawdata",
        ].includes(permission.key)
      ) {
        category = "QA & Evaluation";
      } else if (
        ["viewUserDirectory", "viewAllTeams", "viewOwnTeam", "manageUsers", "manageTeams", "resetPassword"].includes(permission.key)
      ) {
        category = "User & Team";
      } else {
        category = "System";
      }

      groups[category].push(permission);
    });

    categoryOrder.forEach((category) => {
      groups[category] = [...groups[category]].sort((a, b) => a.label.localeCompare(b.label));
    });

    return groups;
  }, []);

  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>(() =>
    categoryOrder.reduce((acc, category, index) => {
      acc[category] = index < 2;
      return acc;
    }, {} as Record<string, boolean>)
  );

  const sortedRoles = useMemo(
    () => [...roles].sort((a, b) => a.name.localeCompare(b.name)),
    [roles]
  );

  const normalizedRoleSearch = roleSearch.trim().toLowerCase();
  const normalizedPermissionSearch = permissionSearch.trim().toLowerCase();

  const visibleRoles = sortedRoles.filter((role) => {
    if (!normalizedRoleSearch) return true;
    return (
      role.name.toLowerCase().includes(normalizedRoleSearch) ||
      String(role.description || "").toLowerCase().includes(normalizedRoleSearch)
    );
  });

  useEffect(() => {
    if (!visibleRoles.length && !sortedRoles.length) return;
    const availableRoleNames = visibleRoles.length ? visibleRoles.map((role) => role.name) : sortedRoles.map((role) => role.name);
    if (!selectedRoleName || !availableRoleNames.includes(selectedRoleName)) {
      setSelectedRoleName(availableRoleNames[0] || "");
    }
  }, [selectedRoleName, sortedRoles, visibleRoles]);

  const selectedRole =
    visibleRoles.find((role) => role.name === selectedRoleName) ||
    sortedRoles.find((role) => role.name === selectedRoleName) ||
    visibleRoles[0] ||
    sortedRoles[0];

  const selectedPermissions = selectedRole
    ? permissionDrafts[selectedRole.name] || getDefaultRolePermissions(selectedRole.name)
    : getDefaultRolePermissions("Admin Live Chat");

  const activeRoleCount = sortedRoles.filter((role) => role.active).length;
  const selectedUserCount = selectedRole ? roleUserCounts[selectedRole.name] || 0 : 0;
  const enabledPermissionCount = PERMISSION_KEYS.filter((key) => Boolean(selectedPermissions[key])).length;

  const totalDirtyCount = sortedRoles.reduce((total, role) => {
    const draft = permissionDrafts[role.name] || getDefaultRolePermissions(role.name);
    const saved = savedPermissions[role.name] || getDefaultRolePermissions(role.name);
    return total + PERMISSION_KEYS.filter((key) => Boolean(draft[key]) !== Boolean(saved[key])).length;
  }, 0);

  const isPermissionLocked = (roleName: string, key: RolePermissionKey) =>
    roleName === "Quality Assurance" &&
    (
      key === "viewUserDirectory" ||
      key === "manageUsers" ||
      key === "manageRoles" ||
      key === "manageRubric" ||
      key === "manageMaintenance"
    );

  useEffect(() => {
    if (!permissionToast) return;
    const timer = window.setTimeout(() => setPermissionToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [permissionToast]);

  const changePermission = (
    roleName: string,
    permission: (typeof PERMISSION_DEFINITIONS)[number],
    value: boolean
  ) => {
    onPermissionChange(roleName, permission.key, value);
    setPermissionToast(`${value ? "เปิด" : "ปิด"}สิทธิ์ ${permission.label} แล้ว`);
  };

  const resetPermissionChanges = () => {
    sortedRoles.forEach((role) => {
      const draft = permissionDrafts[role.name] || getDefaultRolePermissions(role.name);
      const saved = savedPermissions[role.name] || getDefaultRolePermissions(role.name);
      PERMISSION_KEYS.forEach((key) => {
        if (Boolean(draft[key]) !== Boolean(saved[key])) {
          onPermissionChange(role.name, key, Boolean(saved[key]));
        }
      });
    });
    setPermissionToast("รีเซ็ตการเปลี่ยนแปลงสิทธิ์แล้ว");
  };

  const filteredCategoryEntries = categoryOrder
    .map((category) => {
      const permissions = groupedPermissions[category].filter((permission) => {
        if (!normalizedPermissionSearch) return true;
        const thaiDescription = String(PERMISSION_THAI_HELP[permission.key] || "").toLowerCase();
        return (
          permission.label.toLowerCase().includes(normalizedPermissionSearch) ||
          permission.description.toLowerCase().includes(normalizedPermissionSearch) ||
          thaiDescription.includes(normalizedPermissionSearch)
        );
      });

      return {
        category,
        permissions,
        totalCount: groupedPermissions[category].length,
        enabledCount: groupedPermissions[category].filter((permission) => Boolean(selectedPermissions[permission.key])).length,
      };
    })
    .filter((entry) => !normalizedPermissionSearch || entry.permissions.length > 0);

  const canRename = selectedRole ? !selectedRole.locked && !isSystemRole(selectedRole.name) && selectedUserCount === 0 : false;
  const canToggle = selectedRole ? !selectedRole.locked && selectedUserCount === 0 : false;
  const canDelete = selectedRole ? !selectedRole.locked && selectedUserCount === 0 : false;

  return (
    <div data-unsaved-changes={totalDirtyCount > 0 ? "true" : "false"} className="bg-gradient-to-br from-[#fbf7ff] via-white to-[#f3fbff] p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-violet-600">Access</div>
          <div className="mt-1 text-[34px] font-semibold tracking-tight text-slate-950">
            Role & Permission Management
          </div>
          <div className="mt-2 text-sm font-normal leading-6 text-slate-500">
            จัดการบทบาทและสิทธิ์การเข้าถึงระบบ
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-[260px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <span className="text-base text-slate-400">⌕</span>
            <input
              value={roleSearch}
              onChange={(event) => setRoleSearch(event.target.value)}
              placeholder="ค้นหาบทบาท..."
              className="w-full border-0 bg-transparent text-sm font-normal text-slate-800 outline-none placeholder:text-slate-400"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowCreateRole((current) => !current)}
            className="rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-3 text-sm font-medium text-white shadow-[0_14px_30px_rgba(109,40,217,0.20)] transition hover:opacity-95"
          >
            ＋ สร้างบทบาท
          </button>
        </div>
      </div>

      {showCreateRole ? (
        <div className="mt-4 rounded-[24px] border border-violet-100 bg-white p-5 shadow-sm">
          <div className="mb-4 text-sm font-medium text-slate-700">เพิ่มบทบาทใหม่</div>
          <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr_auto] lg:items-end">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-violet-700">Role Name</span>
              <input
                value={newRoleName}
                disabled={saving}
                onChange={(event) => onNameChange(event.target.value)}
                placeholder="e.g. Trainer, Manager"
                className="mt-2 w-full rounded-xl border border-violet-100 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-violet-700">Description</span>
              <input
                value={newRoleDescription}
                disabled={saving}
                onChange={(event) => onDescriptionChange(event.target.value)}
                placeholder="Short explanation for this role"
                className="mt-2 w-full rounded-xl border border-violet-100 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
              />
            </label>
            <button
              type="button"
              disabled={saving}
              onClick={onSave}
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-violet-800 disabled:opacity-50"
            >
              เพิ่ม Role
            </button>
          </div>
        </div>
      ) : null}

      <div data-role-card-text-fit-v59-fix4="true" className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {visibleRoles.map((role) => {
          const selected = selectedRole?.name === role.name;
          const userCount = roleUserCounts[role.name] || 0;
          const rolePermissionMap = permissionDrafts[role.name] || getDefaultRolePermissions(role.name);
          const enabledCount = PERMISSION_KEYS.filter((key) => Boolean(rolePermissionMap[key])).length;

          return (
            <button
              key={role.name}
              type="button"
              onClick={() => setSelectedRoleName(role.name)}
              className={`min-h-[178px] rounded-[22px] border px-4 py-4 text-left transition ${
                selected
                  ? "border-violet-300 bg-white shadow-[0_16px_34px_rgba(109,40,217,0.14)]"
                  : "border-slate-200 bg-white hover:border-violet-200 hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-sm font-medium text-white ${roleAvatarClass(role.name)}`}>
                    {userInitials(role.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div title={role.name} className="min-h-10 whitespace-normal break-words text-base font-semibold leading-5 text-slate-950">{role.name}</div>
                    <div
                      className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        role.active ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"
                      }`}
                    >
                      {role.active ? "เปิดใช้งาน" : "ยังไม่เปิดใช้งาน"}
                    </div>
                  </div>
                </div>
                {selected ? (
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600 text-sm font-medium text-white">
                    ✓
                  </span>
                ) : null}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] font-medium text-slate-400">ผู้ใช้</div>
                  <div className="mt-1 text-2xl font-semibold text-slate-950">{userCount}</div>
                </div>
                <div>
                  <div className="text-[11px] font-medium text-slate-400">สิทธิ์ที่เปิดใช้งาน</div>
                  <div className="mt-1 text-2xl font-semibold text-slate-950">{enabledCount}</div>
                </div>
              </div>
            </button>
          );
        })}

        {!visibleRoles.length ? (
          <div className="sm:col-span-2 lg:col-span-3 xl:col-span-5 rounded-[22px] border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm font-medium text-slate-500">
            ไม่พบบทบาทที่ค้นหา
          </div>
        ) : null}
      </div>

      {selectedRole ? (
        <div className="mt-5 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          {editingRoleName === selectedRole.name ? (
            <div className="grid gap-4 lg:grid-cols-[1fr_1.5fr_auto] lg:items-end">
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-violet-700">Role Name</span>
                <input
                  value={editingRoleDraft.name}
                  disabled={!canRename || saving}
                  onChange={(event) => setEditingRoleDraft((draft) => ({ ...draft, name: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-violet-100 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-50 disabled:text-slate-400"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-violet-700">Description</span>
                <input
                  value={editingRoleDraft.description}
                  disabled={saving}
                  onChange={(event) => setEditingRoleDraft((draft) => ({ ...draft, description: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-violet-100 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingRoleName("");
                    setEditingRoleDraft({ name: "", description: "" });
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    onSaveRoleDetails(selectedRole, editingRoleDraft.name, editingRoleDraft.description);
                    setEditingRoleName("");
                  }}
                  className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-50"
                >
                  Save Role
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-lg font-semibold text-slate-950">{selectedRole.name}</div>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${
                      selectedRole.active ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"
                    }`}
                  >
                    {selectedRole.active ? "เปิดใช้งาน" : "ยังไม่เปิดใช้งาน"}
                  </span>
                  <span className="inline-flex rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700">
                    {selectedUserCount} ผู้ใช้
                  </span>
                  <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                    {enabledPermissionCount} สิทธิ์
                  </span>
                </div>
                <div className="mt-2 text-sm font-normal leading-6 text-slate-500">
                  {selectedRole.description || "ยังไม่มีคำอธิบายสำหรับบทบาทนี้"}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setEditingRoleName(selectedRole.name);
                    setEditingRoleDraft({
                      name: selectedRole.name,
                      description: selectedRole.description || "",
                    });
                  }}
                  className="rounded-xl border border-violet-200 bg-white px-4 py-2.5 text-sm font-medium text-violet-700 transition hover:bg-violet-50 disabled:opacity-50"
                >
                  Edit Role
                </button>
                <button
                  type="button"
                  disabled={saving || !canToggle}
                  onClick={() => onToggle(selectedRole)}
                  className="rounded-xl border border-amber-200 bg-white px-4 py-2.5 text-sm font-medium text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                >
                  {selectedRole.active ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  disabled={saving || !canDelete}
                  onClick={() => onDelete(selectedRole)}
                  className="rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      <div className="mt-5 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-violet-700">Permissions</div>
            <div className="mt-1 text-base font-semibold text-slate-950">
              สิทธิ์ของ {selectedRole?.name || "-"}
            </div>
          </div>
          <div className="flex min-w-[280px] items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <span className="text-base text-slate-400">⌕</span>
            <input
              value={permissionSearch}
              onChange={(event) => setPermissionSearch(event.target.value)}
              placeholder="ค้นหาสิทธิ์..."
              className="w-full border-0 bg-transparent text-sm font-normal text-slate-800 outline-none placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {filteredCategoryEntries.map(({ category, permissions, totalCount, enabledCount }) => {
            const expanded = Boolean(expandedCategories[category]);
            return (
              <section key={category} className="overflow-hidden rounded-[22px] border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedCategories((current) => ({
                      ...current,
                      [category]: !expanded,
                    }))
                  }
                  className="flex w-full items-center justify-between gap-4 bg-slate-50/70 px-5 py-4 text-left transition hover:bg-slate-50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium text-slate-600">
                      {expanded ? "⌄" : "›"}
                    </span>
                    <span className="text-xl font-semibold text-violet-700">{category}</span>
                    <span className="text-sm font-normal text-slate-500">
                      ({categoryMeta[category].thai})
                    </span>
                  </div>
                  <div className="rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">
                    {totalCount} สิทธิ์
                  </div>
                </button>

                {expanded ? (
                  <div className="space-y-3 px-4 py-4">
                    {permissions.map((permission) => {
                      const checked = Boolean(selectedPermissions[permission.key]);
                      const locked = selectedRole ? isPermissionLocked(selectedRole.name, permission.key) : false;
                      const thaiDescription =
                        PERMISSION_THAI_HELP[permission.key] || permission.description;
                      const toggleTooltip = locked
                        ? "สิทธิ์นี้ถูกล็อกเพื่อความปลอดภัยของผู้ดูแลระบบ"
                        : checked
                          ? `สิทธิ์นี้เปิดใช้งานอยู่ คลิกเพื่อปิดสิทธิ์ ${permission.label}`
                          : `สิทธิ์นี้ยังไม่เปิด คลิกเพื่อเปิดสิทธิ์ ${permission.label}`;

                      return (
                        <div
                          key={permission.key}
                          className="grid gap-3 rounded-[18px] border border-slate-100 bg-white px-4 py-3 lg:grid-cols-[minmax(220px,1fr)_minmax(340px,1.6fr)_150px_84px] lg:items-center"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="truncate text-base font-medium text-slate-900">
                              {permission.label}
                            </div>
                            <PermissionThaiTooltip
                              label={permission.label}
                              description={thaiDescription}
                            />
                          </div>

                          <div className="text-sm font-normal leading-6 text-slate-500">
                            {thaiDescription}
                          </div>

                          <div className="flex justify-start lg:justify-center">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                checked
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-rose-50 text-rose-600"
                              }`}
                            >
                              {checked ? "เปิดใช้งาน" : "ยังไม่เปิดใช้งาน"}
                            </span>
                          </div>

                          <label
                            title={toggleTooltip}
                            className={`group relative inline-flex items-center justify-end ${
                              locked || saving ? "cursor-not-allowed" : "cursor-pointer"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={saving || locked}
                              onChange={(event) => selectedRole && changePermission(selectedRole.name, permission, event.target.checked)}
                              className="peer sr-only"
                            />
                            <span
                              className={`relative h-7 w-12 rounded-full border transition ${
                                checked
                                  ? "border-violet-500 bg-violet-600"
                                  : "border-slate-200 bg-slate-200"
                              } ${saving || locked ? "opacity-60" : ""}`}
                            >
                              <span
                                className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition ${
                                  checked ? "left-6" : "left-1"
                                }`}
                              />
                            </span>
                            <span className="pointer-events-none absolute right-0 top-full z-[60] mt-2 hidden w-64 rounded-xl bg-slate-950 px-3 py-2.5 text-left text-xs font-normal leading-5 text-white shadow-[0_16px_38px_rgba(15,23,42,0.30)] group-hover:block">
                              {toggleTooltip}
                              <span className="absolute -top-1.5 right-5 h-3 w-3 rotate-45 bg-slate-950" />
                            </span>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            );
          })}

          {!filteredCategoryEntries.length ? (
            <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm font-medium text-slate-500">
              ไม่พบสิทธิ์ที่ค้นหา
            </div>
          ) : null}
        </div>
      </div>

      <div className="sticky bottom-3 z-30 mt-4 flex flex-col gap-3 rounded-[20px] border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_18px_50px_rgba(15,23,42,0.16)] backdrop-blur md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-violet-50 text-lg text-violet-700">
            ◌
          </span>
          <div>
            <div className={`text-base font-medium ${totalDirtyCount ? "text-violet-700" : "text-emerald-700"}`}>
              {totalDirtyCount
                ? `มีการเปลี่ยนแปลงสิทธิ์ ${totalDirtyCount} รายการ`
                : "บันทึกสิทธิ์เป็นข้อมูลล่าสุดแล้ว"}
            </div>
            <div className="mt-0.5 text-sm font-normal text-slate-500">
              การเปิดหรือปิดสิทธิ์จะมีผลเมื่อกดบันทึกการเปลี่ยนแปลง
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            disabled={saving || totalDirtyCount === 0}
            onClick={resetPermissionChanges}
            className="rounded-xl border border-violet-200 bg-white px-5 py-2.5 text-sm font-medium text-violet-700 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            รีเซ็ตการเปลี่ยนแปลง
          </button>
          <button
            type="button"
            disabled={saving || totalDirtyCount === 0}
            onClick={() => {
              setPermissionToast("กำลังบันทึกการเปลี่ยนแปลงสิทธิ์...");
              void onSavePermissions();
            }}
            className="rounded-xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300"
          >
            {saving ? "Saving..." : "บันทึกการเปลี่ยนแปลง"}
          </button>
        </div>
      </div>

      {permissionToast ? (
        <div className="fixed bottom-6 right-6 z-[80] rounded-2xl bg-slate-950 px-4 py-3 text-sm font-normal text-white shadow-[0_18px_44px_rgba(15,23,42,0.28)]">
          {permissionToast}
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
  users: Array<{
    user: EditableUser;
    index: number;
  }>;
  saving: boolean;
  roleOptions: string[];
  onChange: (
    index: number,
    key: keyof EditableUser,
    value: string
  ) => void;
  onGeneratePassword: (
    index: number
  ) => void;
}) {
  const [search, setSearch] = useState("");
  const [
    selectedUsernames,
    setSelectedUsernames,
  ] = useState<string[]>([]);
  const [bulkRole, setBulkRole] =
    useState("");
  const [bulkStatus, setBulkStatus] =
    useState("");
  const [bulkDate, setBulkDate] =
    useState("");
  const [bulkReason, setBulkReason] =
    useState("");

  const visibleUsers = useMemo(() => {
    const keyword =
      search.trim().toLowerCase();

    if (!keyword) return users;

    return users.filter(({ user }) =>
      [
        user.username,
        user.displayName,
        user.agentName,
        user.email,
        user.role,
        user.status,
        user.suspendReason,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [search, users]);

  const selectedKeys = useMemo(
    () =>
      new Set(
        selectedUsernames.map(
          normalizeUsername
        )
      ),
    [selectedUsernames]
  );

  useEffect(() => {
    const available = new Set(
      users.map(({ user }) =>
        normalizeUsername(user.username)
      )
    );

    setSelectedUsernames((current) =>
      current.filter((username) =>
        available.has(
          normalizeUsername(username)
        )
      )
    );
  }, [users]);

  const selectedCount =
    selectedUsernames.length;

  const allVisibleSelected =
    visibleUsers.length > 0 &&
    visibleUsers.every(({ user }) =>
      selectedKeys.has(
        normalizeUsername(user.username)
      )
    );

  const toggleUser = (
    username: string
  ) => {
    const key = normalizeUsername(username);

    setSelectedUsernames((current) => {
      const exists = current.some(
        (item) =>
          normalizeUsername(item) === key
      );

      return exists
        ? current.filter(
            (item) =>
              normalizeUsername(item) !== key
          )
        : [...current, username];
    });
  };

  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      const visibleKeys = new Set(
        visibleUsers.map(({ user }) =>
          normalizeUsername(user.username)
        )
      );

      setSelectedUsernames((current) =>
        current.filter(
          (username) =>
            !visibleKeys.has(
              normalizeUsername(username)
            )
        )
      );
      return;
    }

    setSelectedUsernames((current) => {
      const map = new Map(
        current.map((username) => [
          normalizeUsername(username),
          username,
        ])
      );

      visibleUsers.forEach(({ user }) => {
        map.set(
          normalizeUsername(user.username),
          user.username
        );
      });

      return Array.from(map.values());
    });
  };

  const selectedEntries = () => {
    const selected = new Set(
      selectedUsernames.map(
        normalizeUsername
      )
    );

    return users.filter(({ user }) =>
      selected.has(
        normalizeUsername(user.username)
      )
    );
  };

  const applyBulkRole = (
    role: string
  ) => {
    if (!role || !selectedCount) return;

    selectedEntries().forEach(
      ({ user, index }) => {
        if (
          normalizeUsername(
            user.username
          ) !== "songpon"
        ) {
          onChange(index, "role", role);
        }
      }
    );
    setBulkRole("");
  };

  const applyBulkStatus = (
    status: string
  ) => {
    if (!status || !selectedCount) {
      return;
    }

    selectedEntries().forEach(
      ({ user, index }) => {
        if (
          normalizeUsername(
            user.username
          ) === "songpon"
        ) {
          return;
        }

        onChange(index, "status", status);

        if (status === "Suspended") {
          onChange(index, "teamName", "");
          onChange(index, "teamLead", "");
        }
      }
    );
    setBulkStatus("");
  };

  const applyBulkDate = () => {
    if (!selectedCount) return;

    selectedEntries().forEach(
      ({ index }) =>
        onChange(
          index,
          "suspendEffectiveDate",
          bulkDate
        )
    );
  };

  const applyBulkReason = () => {
    if (!selectedCount) return;

    selectedEntries().forEach(
      ({ index }) =>
        onChange(
          index,
          "suspendReason",
          bulkReason
        )
    );
  };

  const generateSelectedPasswords =
    () => {
      if (!selectedCount) return;

      selectedEntries().forEach(
        ({ user, index }) => {
          if (user.username) {
            onGeneratePassword(index);
          }
        }
      );
    };

  const fieldClass =
    "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-700 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

  return (
    <div
      data-bulk-account-editor-no-team-v75="true"
      className="bg-gradient-to-b from-white to-violet-50/20"
    >
      <div className="border-b border-violet-100 bg-gradient-to-r from-white via-violet-50/40 to-fuchsia-50/40 px-4 py-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(320px,1fr)_minmax(320px,0.8fr)]">
          <label className="relative block">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-violet-400">
              ⌕
            </span>
            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="ค้นหาชื่อ Username อีเมล Role หรือสถานะ"
              title="ค้นหาผู้ใช้ในรายการแก้ไข"
              className="w-full rounded-xl border border-violet-100 bg-white py-3 pl-9 pr-3 text-xs outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
            />
          </label>

          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-2.5 text-[10px] leading-5 text-blue-700">
            หน้า Bulk ใช้จัดการ Role สถานะ
            วันระงับ เหตุผล และรหัสผ่านเท่านั้น
            ส่วนทีมให้แก้จาก User Directory
            หรือจัดการทีมและสมาชิก
          </div>
        </div>
      </div>

      <div className="border-b border-violet-100 bg-white px-4 py-3">
        <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-600">
              เลือกแล้ว{" "}
              <b className="text-violet-700">
                {selectedCount}
              </b>{" "}
              รายการ
            </span>

            <button
              type="button"
              onClick={toggleAllVisible}
              disabled={
                saving ||
                !visibleUsers.length
              }
              className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-[10px] font-medium text-violet-700 disabled:opacity-40"
            >
              {allVisibleSelected
                ? "ยกเลิกเลือกทั้งหมด"
                : `เลือกทั้งหมด (${visibleUsers.length})`}
            </button>

            {selectedCount ? (
              <button
                type="button"
                onClick={() =>
                  setSelectedUsernames([])
                }
                className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-[10px] font-medium text-rose-600"
              >
                ล้างรายการที่เลือก
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={bulkRole}
              disabled={
                saving || !selectedCount
              }
              onChange={(event) => {
                const value =
                  event.target.value;
                setBulkRole(value);
                applyBulkRole(value);
              }}
              title="เปลี่ยน Role ให้ผู้ใช้ที่เลือก"
              className={fieldClass}
            >
              <option value="">
                เปลี่ยน Role
              </option>
              {roleOptions.map((role) => (
                <option
                  key={role}
                  value={role}
                >
                  {role}
                </option>
              ))}
            </select>

            <select
              value={bulkStatus}
              disabled={
                saving || !selectedCount
              }
              onChange={(event) => {
                const value =
                  event.target.value;
                setBulkStatus(value);
                applyBulkStatus(value);
              }}
              title="เปลี่ยนสถานะผู้ใช้ที่เลือก"
              className={fieldClass}
            >
              <option value="">
                เปลี่ยนสถานะ
              </option>
              {STATUS_OPTIONS.map(
                (status) => (
                  <option
                    key={status}
                    value={status}
                  >
                    {status}
                  </option>
                )
              )}
            </select>

            <div className="flex items-center gap-1">
              <input
                type="date"
                value={bulkDate}
                disabled={
                  saving || !selectedCount
                }
                onChange={(event) =>
                  setBulkDate(
                    event.target.value
                  )
                }
                title="กำหนดวันระงับให้ผู้ใช้ที่เลือก"
                className={fieldClass}
              />
              <button
                type="button"
                disabled={
                  saving || !selectedCount
                }
                onClick={applyBulkDate}
                className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-[10px] font-medium text-violet-700 disabled:opacity-40"
              >
                กำหนดวัน
              </button>
            </div>

            <div className="flex items-center gap-1">
              <input
                value={bulkReason}
                disabled={
                  saving || !selectedCount
                }
                onChange={(event) =>
                  setBulkReason(
                    event.target.value
                  )
                }
                placeholder="เหตุผลการระงับ"
                title="ระบุเหตุผลให้บัญชีที่เลือก"
                className={fieldClass}
              />
              <button
                type="button"
                disabled={
                  saving || !selectedCount
                }
                onClick={applyBulkReason}
                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[10px] font-medium text-rose-700 disabled:opacity-40"
              >
                ใช้เหตุผล
              </button>
            </div>

            <button
              type="button"
              disabled={
                saving || !selectedCount
              }
              onClick={
                generateSelectedPasswords
              }
              className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[10px] font-medium text-amber-700 disabled:opacity-40"
            >
              สร้างรหัสผ่านชั่วคราว
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto p-3">
        <div className="min-w-[1180px] overflow-hidden rounded-[20px] border border-violet-100 bg-white shadow-sm">
          <div className="grid grid-cols-[44px_150px_minmax(230px,1.25fr)_170px_140px_170px_220px_260px] items-center gap-3 border-b border-violet-100 bg-gradient-to-r from-violet-950 via-violet-900 to-fuchsia-900 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
            <div>
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleAllVisible}
                aria-label="เลือกผู้ใช้ทั้งหมดที่แสดง"
                className="h-4 w-4 rounded border-white/40 accent-violet-500"
              />
            </div>
            <div>Username</div>
            <div>ชื่อผู้ใช้งาน</div>
            <div>Role</div>
            <div>สถานะ</div>
            <div>วันที่ระงับ</div>
            <div>เหตุผลการระงับ</div>
            <div>รหัสผ่านชั่วคราว</div>
          </div>

          <div>
            {visibleUsers.map(
              ({ user, index }) => {
                const isSongpon =
                  normalizeUsername(
                    user.username
                  ) === "songpon";
                const selected =
                  selectedKeys.has(
                    normalizeUsername(
                      user.username
                    )
                  );

                return (
                  <div
                    key={`${user.username || "new"}-${index}`}
                    className={`grid grid-cols-[44px_150px_minmax(230px,1.25fr)_170px_140px_170px_220px_260px] items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0 ${
                      selected
                        ? "bg-violet-50/70"
                        : "bg-white hover:bg-slate-50/70"
                    }`}
                  >
                    <div>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() =>
                          toggleUser(
                            user.username
                          )
                        }
                        aria-label={`เลือก ${user.displayName || user.username}`}
                        className="h-4 w-4 rounded border-slate-300 accent-violet-600"
                      />
                    </div>

                    <div className="truncate text-xs font-semibold text-slate-900">
                      {user.username}
                    </div>

                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-slate-900">
                        {user.displayName ||
                          user.agentName}
                      </div>
                      <div className="mt-1 truncate text-[10px] text-slate-400">
                        {user.email || "-"}
                      </div>
                    </div>

                    <select
                      value={user.role}
                      disabled={
                        saving || isSongpon
                      }
                      onChange={(event) =>
                        onChange(
                          index,
                          "role",
                          event.target.value
                        )
                      }
                      title={`เลือก Role ของ ${user.displayName}`}
                      className={fieldClass}
                    >
                      {roleOptions.map(
                        (role) => (
                          <option
                            key={role}
                            value={role}
                          >
                            {role}
                          </option>
                        )
                      )}
                    </select>

                    <select
                      value={user.status}
                      disabled={
                        saving || isSongpon
                      }
                      onChange={(event) => {
                        const status =
                          event.target.value;
                        onChange(
                          index,
                          "status",
                          status
                        );

                        if (
                          status ===
                          "Suspended"
                        ) {
                          onChange(
                            index,
                            "teamName",
                            ""
                          );
                          onChange(
                            index,
                            "teamLead",
                            ""
                          );
                        }
                      }}
                      title={`เปลี่ยนสถานะของ ${user.displayName}`}
                      className={fieldClass}
                    >
                      {STATUS_OPTIONS.map(
                        (status) => (
                          <option
                            key={status}
                            value={status}
                          >
                            {status}
                          </option>
                        )
                      )}
                    </select>

                    <div>
                      <input
                        type="date"
                        value={
                          user.suspendEffectiveDate
                        }
                        disabled={saving}
                        onChange={(event) =>
                          onChange(
                            index,
                            "suspendEffectiveDate",
                            event.target.value
                          )
                        }
                        title="เว้นว่างเมื่อไม่กำหนดวันระงับ"
                        className={fieldClass}
                      />
                      <div className="mt-1 text-[9px] text-slate-400">
                        เว้นว่าง = ไม่กำหนด
                      </div>
                    </div>

                    <input
                      value={user.suspendReason}
                      disabled={
                        saving ||
                        user.status === "Active"
                      }
                      onChange={(event) =>
                        onChange(
                          index,
                          "suspendReason",
                          event.target.value
                        )
                      }
                      placeholder={
                        user.status === "Active"
                          ? "ใช้เมื่อ Suspended"
                          : "ระบุเหตุผล"
                      }
                      title="เหตุผลการระงับบัญชี"
                      className={fieldClass}
                    />

                    <div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={
                            user.temporaryPassword
                          }
                          disabled={saving}
                          onChange={(event) =>
                            onChange(
                              index,
                              "temporaryPassword",
                              event.target.value
                            )
                          }
                          placeholder="คลิกสร้างรหัสผ่าน"
                          title="รหัสผ่านชั่วคราวมีอายุ 15 วัน"
                          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-50"
                        />
                        <button
                          type="button"
                          disabled={
                            saving ||
                            !user.username
                          }
                          onClick={() =>
                            onGeneratePassword(
                              index
                            )
                          }
                          title="สร้างรหัสผ่านชั่วคราว"
                          className="shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[10px] font-medium text-amber-700 disabled:opacity-40"
                        >
                          สร้าง
                        </button>
                      </div>
                      <div className="mt-1 text-[9px] text-slate-400">
                        รหัสผ่านมีอายุ 15 วัน
                      </div>
                    </div>
                  </div>
                );
              }
            )}

            {!visibleUsers.length ? (
              <div className="px-6 py-14 text-center text-sm text-slate-400">
                ไม่พบผู้ใช้ตามคำค้นหา
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-violet-100 bg-white px-4 py-3 text-[10px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>
          แสดง {visibleUsers.length} จาก{" "}
          {users.length} รายการ
        </span>
        <span>
          Team และ Team Lead ไม่ได้แก้จากหน้านี้
        </span>
      </div>
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

          <ModalField
            label="Suspend Date / End Date"
            type="date"
            value={user.suspendEffectiveDate}
            onChange={(value) => onChange("suspendEffectiveDate", value)}
            placeholder="YYYY-MM-DD"
            disabled={saving}
          />

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
  type = "text",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">{label}</span>
      <input
        type={type}
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
  type = "text",
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="w-full min-w-[170px] rounded-2xl border border-violet-100 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
    />
  );
}





























