import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import * as XLSX from "xlsx";
import DashboardMockup from "./DashboardMockup";
import AppealMockup from "./AppealMockup";
import AppealRequestsMockup, { buildAppealRequests } from "./AppealRequestsMockup";
import AppealOverrideMockup, { buildAppealCaseOverrides } from "./AppealOverrideMockup";
import QARubricMockup from "./QARubricMockup";
import SummaryMockup from "./SummaryMockup";
import SignatureCenterMockup from "./SignatureCenterMockup";
import PresentationMockup from "./PresentationMockup";
import CoachingMockup from "./CoachingMockup";
import AnnouncementHub from "./AnnouncementHub";
import UsageLogMockup from "./UsageLogMockup";
import UserRoleAdminMockup from "./UserRoleAdminMockup";
import CreateEvaluationMockup, { EvaluationSubmitPayload } from "./CreateEvaluationMockup";
import PreTestMockup from "./PreTestMockup";
import TrainingAttendanceMockup from "./TrainingAttendanceMockup";
import { upsertStoredEvaluation } from "./evaluationStore";
import PageHero from "./PageHero";
import TeamChatMockup, { ChatAttachment, ChatMessage, OnlineUser, WebRtcSignal } from "./TeamChatMockup";
import CallHistoryMockup from "./CallHistoryMockup";
import {
  fetchUsageLogsByEventTypes,
  isUsageLogEventTypeDisabled,
  logUsageEvent,
  UsageLogEvent,
} from "./usageLog";
import {
  fetchStoredMaintenanceState,
  fetchStoredRolePermissions,
  fetchStoredUserProfiles,
  upsertStoredUserProfiles,
  StoredMaintenanceState,
  StoredRolePermission,
  StoredUserProfile,
} from "./userRoleStore";
import {
  createStoredPasswordResetRequest,
  fetchStoredPasswordResetRequests,
  updateStoredPasswordResetRequest,
} from "./passwordResetStore";
import { scoreToGrade } from "./lib/scoreIncentivePolicy";
import { firebaseDb } from "./firebaseClient";
import { clearStoredProfilePhoto, fetchStoredProfilePhoto, upsertStoredProfilePhoto } from "./profilePhotoStore";
import {
  createStoredUserSession,
  revokeAllStoredUserSessions,
  SESSION_INACTIVITY_MS,
  SESSION_POLICY_VERSION,
  touchStoredUserSession,
  validateStoredUserSession,
} from "./sessionStore";

// data-session-policy-v1

type UserRole = string;
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
  password: string;
  displayName: string;
  role: UserRole;
  agentName: string;
  email?: string;
  teamLead?: string;
  teamName?: string;
  status?: "Active" | "Suspended";
  suspendReason?: string;
  suspendEffectiveDate?: string;
};

type UserProfileSnapshot = {
  username: string;
  displayName: string;
  role: UserRole;
  agentName: string;
  email?: string;
  teamLead?: string;
  teamName?: string;
  status?: "Active" | "Suspended";
  suspendReason?: string;
  suspendEffectiveDate?: string;
};

type CurrentUser = {
  username: string;
  displayName: string;
  role: UserRole;
  agentName: string;
  email?: string;
  loginAt: string;
  sessionId?: string;
  sessionPolicyVersion?: string;
  sessionExpiresAt?: string;
};

type BuildMeta = {
  appName?: string;
  version: string;
  displayVersion?: string;
  updatedAt: string;
  releaseLabel: string;
  author: string;
  buildNumber: number;
  releaseNotesTitle?: string;
  releaseNotes: string[];
  changedFiles: string[];
  commitHash?: string;
  commitMessage?: string;
  timezone?: string;
};

class SignatureCenterErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { errorMessage: string }
> {
  state = { errorMessage: "" };

  static getDerivedStateFromError(error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error || "Unknown error");
    return { errorMessage };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error("Signature Center crashed", error, info);
  }

  render() {
    if (this.state.errorMessage) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 p-6">
          <div className="mx-auto mt-10 max-w-3xl rounded-[28px] border border-rose-200 bg-white p-6 shadow-xl shadow-rose-100">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-600">Signature Center Error</p>
            <h1 className="mt-2 text-2xl font-black text-slate-950">Signature Center เปิดไม่สำเร็จ</h1>
            <p className="mt-2 text-sm font-semibold text-slate-600">
              ระบบจับข้อผิดพลาดไว้แล้วเพื่อไม่ให้หน้าขาว กรุณา Refresh อีกครั้ง หรือส่งข้อความด้านล่างให้ผู้ดูแลระบบตรวจสอบ
            </p>
            <pre className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap rounded-2xl bg-rose-50 p-4 text-xs font-semibold text-rose-700">
              {this.state.errorMessage}
            </pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

type AppTab =
  | "dashboard"
  | "appeal"
  | "create-evaluation"
  | "pre-test"
  | "training-attendance"
  | "appeal-requests"
  | "appeal-override"
  | "task-inbox"
  | "team-chat"
  | "call-history"
  | "summary"
  | "signature-center"
  | "presentation-builder"
  | "coaching"
  | "rubric"
  | "usage-log"
  | "user-roles";

type WorkspaceTabKey = AppTab | "case-detail";

type SidebarNavItem = {
  key: string;
  label: string;
  description: string;
  icon: string;
  visible: boolean;
  active: boolean;
  onClick: () => void;
  badge?: number | string;
  danger?: boolean;
};

type SidebarNavGroup = {
  id: string;
  title: string;
  description: string;
  items: SidebarNavItem[];
};

type MaintenanceState = {
  enabled: boolean;
  message: string;
  updatedAt: string;
  updatedBy: string;
};

const USER_ACCOUNTS: UserAccount[] = [
  {
    username: "Songpon",
    password: "Boom@4421L2",
    displayName: "Songpon Phothong",
    role: "Quality Assurance",
    agentName: "Songpon Phothong",
    email: "Songpon@robinhood.co.th",
    status: "Active",
  },
];
const STORAGE_KEY = "qa_current_user";
const REMEMBERED_USERNAME_KEY = "qa_remembered_username";
const PASSWORD_OVERRIDE_KEY = "qa_password_overrides";
const PASSWORD_RECORD_KEY = "qa_password_records";
const INACTIVITY_LIMIT_MS = SESSION_INACTIVITY_MS;
const WARNING_BEFORE_MS = 1 * 60 * 1000;
const WARNING_TIME_MS = INACTIVITY_LIMIT_MS - WARNING_BEFORE_MS;
const SESSION_CHECK_INTERVAL_MS = 30 * 1000;
const SESSION_TOUCH_INTERVAL_MS = 60 * 1000;
const TEMP_PASSWORD_VALID_DAYS = 15;
const PERMANENT_PASSWORD_VALID_MONTHS = 6;

const PASSWORD_RESET_ADMIN_USERNAMES = new Set([
  "anucha",
  "krivut",
  "phrommarin",
  "songpon",
  "suphitcha",
]);

const PASSWORD_RESET_ADMIN_DISPLAY_NAMES = new Set([
  "anucha makundin",
  "krivut vongkampan",
  "phrommarin thaithorn",
  "songpon phothong",
  "suphitcha keawliam",
]);

const SONGKRAN_THEME_START = new Date(2026, 3, 1, 0, 0, 0);
const SONGKRAN_THEME_END = new Date(2026, 4, 25, 23, 59, 59);

const DEFAULT_BUILD_META: BuildMeta = {
  appName: "qa-dashboard",
  version: "1.0.0",
  displayVersion: "1.0.0",
  updatedAt: "16/04/2026 00:00:00",
  releaseLabel: "v1.0.0",
  author: "Songpon Phothong",
  buildNumber: 0,
  releaseNotesTitle: "Latest Updates",
  releaseNotes: ["Initial tracked release"],
  changedFiles: [],
  commitHash: "",
  commitMessage: "",
  timezone: "Asia/Bangkok",
};

const QA_DATA_REFRESH_STORAGE_KEY = "qa-dashboard-data-refresh-key";
const ACTIVE_TAB_SESSION_STORAGE_KEY = "qa-dashboard:active-tab-session";
const OPEN_WORKSPACE_TABS_SESSION_STORAGE_KEY = "qa-dashboard:open-workspace-tabs-v36";
const ACTIVE_WORKSPACE_TAB_SESSION_STORAGE_KEY = "qa-dashboard:active-workspace-tab-v36";
const SIDEBAR_GROUPS_SESSION_STORAGE_KEY = "qa-dashboard:sidebar-groups-v36";
const CENTRAL_EVALUATION_TEXT_LIMIT = 2800;
const VALID_APP_TABS = new Set<AppTab>([
  "dashboard",
  "appeal",
  "create-evaluation",
  "pre-test",
  "training-attendance",
  "appeal-requests",
  "appeal-override",
  "task-inbox",
  "team-chat",
  "call-history",
  "summary",
  "signature-center",
  "presentation-builder",
  "coaching",
  "rubric",
  "usage-log",
  "user-roles",
]);

function normalizeAppTab(value: string | null | undefined): AppTab | "" {
  const normalized = String(value || "").trim();
  return VALID_APP_TABS.has(normalized as AppTab) ? (normalized as AppTab) : "";
}

const VALID_WORKSPACE_TAB_KEYS = new Set<WorkspaceTabKey>([
  ...Array.from(VALID_APP_TABS),
  "case-detail",
]);

const WORKSPACE_TAB_LABELS: Record<WorkspaceTabKey, string> = {
  dashboard: "Dashboard",
  "case-detail": "Case Detail Workspace",
  appeal: "Appeals",
  "create-evaluation": "Create Evaluation",
  "pre-test": "Pre-Test",
  "training-attendance": "Training Attendance",
  "appeal-requests": "Review Queue",
  "appeal-override": "Appeal Override",
  "task-inbox": "Work Queue",
  "team-chat": "Team Chat",
  "call-history": "Call History",
  summary: "Summary",
  "signature-center": "Signature Center",
  "presentation-builder": "Presentation Builder",
  coaching: "Coaching",
  rubric: "Rubric",
  "usage-log": "Activity Log",
  "user-roles": "Users & Roles",
};

function normalizeWorkspaceTabKey(value: unknown): WorkspaceTabKey | "" {
  const normalized = String(value || "").trim();
  return VALID_WORKSPACE_TAB_KEYS.has(normalized as WorkspaceTabKey)
    ? (normalized as WorkspaceTabKey)
    : "";
}

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function SidebarGlyph({ name }: { name: string }) {
  const paths: Record<string, string> = {
    dashboard: "M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z",
    chart: "M4 19V9 M10 19V5 M16 19v-7 M2 19h20",
    document: "M6 3h9l3 3v15H6z M14 3v4h4 M9 12h6 M9 16h6",
    add: "M12 5v14 M5 12h14",
    queue: "M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h5",
    appeal: "M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5",
    target: "M12 3v3 M12 18v3 M3 12h3 M18 12h3 M8 8a6 6 0 1 0 8 8",
    chat: "M4 5h16v11H8l-4 4z M8 9h8 M8 12h5",
    check: "M5 3h14v18H5z M8 12l3 3 5-6",
    list: "M4 6h16 M4 12h16 M4 18h16",
    presentation: "M3 3h18v14H3z M8 21l4-4 4 4 M8 8h8 M8 12h5",
    signature: "M3 17c3-6 5-10 7-10 3 0-1 9 2 9 2 0 3-5 5-5 1 0 0 4 4 4 M3 21h18",
    phone: "M5 4h4l2 5-3 2c2 4 4 6 8 8l2-3 3 2v3c0 1-1 2-2 2C10 21 3 14 3 6c0-1 1-2 2-2z",
    users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M3 21c0-5 2-8 6-8s6 3 6 8 M17 7h4 M19 5v4",
    clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2",
    key: "M8 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M10 13l8-8 2 2-2 2 2 2-3 3-2-2-3 3",
    logout: "M10 4H4v16h6 M14 8l4 4-4 4 M18 12H9",
  };
  return <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.document} /></svg>;
}

function compactCentralStoreText(value: unknown, fallback = "") {
  const text = String(value ?? fallback ?? "");
  if (text.length <= CENTRAL_EVALUATION_TEXT_LIMIT) return text;
  return `${text.slice(0, CENTRAL_EVALUATION_TEXT_LIMIT)}... [truncated for central storage]`;
}

function compactCentralEvidenceUrl(value: unknown, index: number) {
  const text = String(value || "").trim();
  if (!text) return "";
  const label = `Attached evidence ${index + 1}`;

  if (/^data:/i.test(text)) {
    const mime = text.slice(5, text.indexOf(";") > 5 ? text.indexOf(";") : 40);
    return `${label} (${mime || "local file"})`;
  }

  if (/^blob:/i.test(text)) return `${label} (browser local preview)`;
  if (text.length > CENTRAL_EVALUATION_TEXT_LIMIT) return `${label} (${text.slice(0, 160)}...)`;
  return text;
}

function compactCentralEvidenceUrls(values: unknown) {
  if (!Array.isArray(values)) return [];
  return values.map(compactCentralEvidenceUrl).filter(Boolean);
}

function compactCentralRawPreview(
  value: Record<string, string | number> | undefined,
  compactEvidenceUrls: string[]
) {
  const preview = value || {};
  return Object.fromEntries(
    Object.entries(preview).map(([key, rawValue]) => {
      if (typeof rawValue === "number") return [key, rawValue];
      const normalizedKey = key.toLowerCase();
      if (
        compactEvidenceUrls.length &&
        (normalizedKey.includes("image") ||
          normalizedKey.includes("evidence") ||
          normalizedKey.includes("pdf") ||
          normalizedKey.includes("url"))
      ) {
        return [key, compactEvidenceUrls.join("\n")];
      }
      return [key, compactCentralStoreText(rawValue)];
    })
  ) as Record<string, string | number>;
}

const DEFAULT_MAINTENANCE_STATE: MaintenanceState = {
  enabled: false,
  message: "QA Dashboard is under maintenance. Please try again later.",
  updatedAt: "",
  updatedBy: "",
};
const MAINTENANCE_POLL_INTERVAL_MS = 5 * 60 * 1000;
const INBOX_POLL_INTERVAL_MS = 2 * 60 * 1000;
const USER_ACCESS_EVENT_TYPES = [
  "user_role_updated",
  "user_profile_saved",
  "role_permissions_saved",
];
const PASSWORD_EVENT_TYPES = [
  "password_reset_request",
  "password_reset_approved",
  "password_reset_rejected",
  "password_changed",
];
const INBOX_EVENT_TYPES = [
  "appeal_request_submitted",
  "appeal_request_reviewed",
  "appeal_request_reset",
  "appeal_case_override_added",
  "appeal_case_override_removed",
  "qa_evaluation_submitted",
  ...PASSWORD_EVENT_TYPES,
];
const CHAT_EVENT_TYPES = [
  "user_presence",
  "chat_message",
  "chat_message_edited",
  "chat_message_deleted",
  "chat_call_invite",
  "chat_call_response",
  "chat_call_ended",
  "chat_webrtc_signal",
];
const CHAT_SUPABASE_POLLING_ENABLED = CHAT_EVENT_TYPES.some((eventType) => !isUsageLogEventTypeDisabled(eventType));

type PasswordResetRequest = {
  requestId: string;
  username: string;
  displayName: string;
  email: string;
  requestedAt: string;
  status: "Pending" | "Approved" | "Rejected";
  tempPassword?: string;
};

type PasswordRecord = {
  password: string;
  kind: "temporary" | "permanent" | "legacy";
  issuedAt: string;
  expiresAt: string;
  eventType: string;
};

type InboxTaskItem = {
  id: string;
  type: "appeal" | "appeal-result" | "appeal-override" | "password" | "evaluation";
  title: string;
  description: string;
  badge: string;
  count: number;
  unread: boolean;
  actionLabel: string;
  caseId?: string;
  agentName?: string;
  mailTemplate?: {
    subject: string;
    to: string;
    from: string;
    status: string;
    body: string[];
    footer?: string;
  };
};

const INBOX_READ_KEY = "qa_inbox_read_tasks";
const CHAT_READ_KEY = "qa_chat_read_at";
const PASSWORD_EXPIRY_WARNING_DAYS = 30;
const ONLINE_USER_WINDOW_MS = 90 * 1000;
const CHAT_CALL_TIMEOUT_MS = 45 * 1000;
const CHAT_HISTORY_RESET_AT = "2026-05-15T10:40:51+07:00";
const V8_EFFECTIVE_FILE_NAME = "QA_Score_Dashboard_byDao_V8.xlsx";
let v8EffectiveRowsCache: Promise<unknown[][] | null> | null = null;

const ROLE_OPTIONS: UserRole[] = ["Admin Live Chat", "Virtual Rider", "Senior", "Supervisor", "Quality Assurance"];

const PERMISSION_KEYS: RolePermissionKey[] = [
  "viewDashboard",
  "viewAllAgents",
  "viewSummary",
  "viewCoaching",
  "viewAppeal",
  "submitAppeal",
  "reviewAppeals",
  "appealOverride",
  "viewRubric",
  "manageRubric",
  "createEvaluation",
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
  "viewUsageLog",
  "exportPdf",
  "exportAppealRawdata",
  "viewUserDirectory",
  "viewAllTeams",
  "viewOwnTeam",
  "qaEvaluationTarget",
  "manageUsers",
  "manageTeams",
  "manageRoles",
  "resetPassword",
  "manageMaintenance",
];

const DEFAULT_TEAM_ASSIGNMENTS: Record<string, { teamLead: string; teamName: string }> = {
  songpon: { teamLead: "Preeyapat Rujum", teamName: "Preeyapat Team" },
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
    managePreTest: true,
    viewPreTestResults: true,
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
  const normalized = roleName.toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
  if (normalized === "agent" || normalized === "admin live chat") return "Admin Live Chat";
  if (normalized === "virtual rider") return "Virtual Rider";
  if (normalized === "senior") return "Senior";
  if (normalized === "supervisor") return "Supervisor";
  if (normalized === "quality assurance" || normalized === "qa") return "Quality Assurance";
  return roleName;
}

function buildRolePermissionOverrides(logs: UsageLogEvent[]) {
  const permissionMap: RolePermissionMap = {};
  const savedRoles = new Set<string>();

  ROLE_OPTIONS.forEach((role) => {
    permissionMap[role] = getDefaultRolePermissions(role);
  });

  logs.forEach((item) => {
    if (item.event_type !== "role_permissions_saved") return;
    const roleName = normalizeRoleName(item.details?.roleName);
    const permissions = item.details?.permissions;
    const normalizedRole = roleName.toLowerCase();
    if (savedRoles.has(normalizedRole)) return;
    if (!roleName || !permissions || typeof permissions !== "object") return;
    savedRoles.add(normalizedRole);

    const current = permissionMap[roleName] || getDefaultRolePermissions(roleName);
    const next = { ...current };
    PERMISSION_KEYS.forEach((key) => {
      const value = (permissions as Record<string, unknown>)[key];
      if (typeof value === "boolean") next[key] = value;
    });
    permissionMap[roleName] = roleName === "Quality Assurance"
      ? { ...next, viewUserDirectory: true, viewAllTeams: true, viewOwnTeam: true, qaEvaluationTarget: false, manageUsers: true, manageTeams: true, manageRoles: true, manageRubric: true, manageMaintenance: true }
      : next;
  });

  return permissionMap;
}

function hasRolePermission(user: CurrentUser | null, permissions: RolePermissionMap, key: RolePermissionKey) {
  if (!user) return false;
  const displayName = String(user.displayName || "").trim().toLowerCase();
  const username = String(user.username || "").trim().toLowerCase();
  if (user.role === "Quality Assurance" && (displayName === "songpon phothong" || username === "songpon")) return true;
  return Boolean((permissions[user.role] || getDefaultRolePermissions(user.role))[key]);
}

function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && value.trim().length > 0;
}

function canAccessCoaching(user: CurrentUser | null) {
  if (!user) return false;
  const displayName = String(user.displayName || "").trim().toLowerCase();
  const username = String(user.username || "").trim().toLowerCase();
  return (user.role === "Supervisor" || user.role === "Quality Assurance") && (displayName === "songpon phothong" || username === "songpon");
}

function canAccessUsageLog(user: CurrentUser | null) {
  if (!user) return false;
  const displayName = String(user.displayName || "").trim().toLowerCase();
  const username = String(user.username || "").trim().toLowerCase();
  return (user.role === "Supervisor" || user.role === "Quality Assurance") && (displayName === "songpon phothong" || username === "songpon");
}

function canAccessPasswordResetAdmin(user: CurrentUser | null) {
  if (!user) return false;
  const displayName = String(user.displayName || "").trim().toLowerCase();
  const username = String(user.username || "").trim().toLowerCase();
  return (user.role === "Supervisor" || user.role === "Quality Assurance") && (PASSWORD_RESET_ADMIN_USERNAMES.has(username) || PASSWORD_RESET_ADMIN_DISPLAY_NAMES.has(displayName));
}

function canAccessAppealRequests(user: CurrentUser | null) {
  if (!user) return false;
  const displayName = String(user.displayName || "").trim().toLowerCase();
  const username = String(user.username || "").trim().toLowerCase();
  return (user.role === "Supervisor" || user.role === "Quality Assurance") && (displayName === "songpon phothong" || username === "songpon");
}

function canAccessUserRoleAdmin(user: CurrentUser | null) {
  if (!user) return false;
  const displayName = String(user.displayName || "").trim().toLowerCase();
  const username = String(user.username || "").trim().toLowerCase();
  return user.role === "Quality Assurance" && (displayName === "songpon phothong" || username === "songpon");
}

function canBypassMaintenance(user: CurrentUser | null) {
  return canAccessUserRoleAdmin(user);
}

function isSongkranThemeActive() {
  return false;
}

function normalizeInboxText(value: unknown) {
  return String(value ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function compactInboxText(value: unknown) {
  return normalizeInboxText(value).replace(/[^a-z0-9]/g, "");
}

function buildInboxHeaderHelper(headerRow: unknown[]) {
  const map = new Map<string, number[]>();
  headerRow.forEach((header, index) => {
    const key = normalizeInboxText(header);
    if (!key) return;
    const current = map.get(key) || [];
    current.push(index);
    map.set(key, current);
  });

  const getValue = (row: unknown[], headerName: string, fallback: unknown = null) => {
    const indexes = map.get(normalizeInboxText(headerName));
    if (!indexes?.length) return fallback;
    for (const index of indexes) {
      const value = row[index];
      if (value !== null && value !== undefined && value !== "") return value;
    }
    return fallback;
  };

  const getLastValue = (row: unknown[], headerName: string, fallback: unknown = null) => {
    const indexes = map.get(normalizeInboxText(headerName));
    if (!indexes?.length) return fallback;
    for (let i = indexes.length - 1; i >= 0; i -= 1) {
      const value = row[indexes[i]];
      if (value !== null && value !== undefined && value !== "") return value;
    }
    return fallback;
  };

  return { getValue, getLastValue };
}

function excelInboxDateToJSDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, parsed.S || 0);
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatInboxDate(value: unknown) {
  const date = excelInboxDateToJSDate(value);
  if (!date) return String(value || "").trim();
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function formatInboxDateTime(value: unknown) {
  const date = excelInboxDateToJSDate(value);
  if (!date) return String(value || "").trim();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return `${getPart("day")}/${getPart("month")}/${getPart("year")} ${getPart("hour")}:${getPart("minute")}:${getPart("second")}`;
}

function getInboxWeekLabel(row: unknown[], helper: ReturnType<typeof buildInboxHeaderHelper>) {
  const weekLabel = String(helper.getValue(row, "Week Label", "") || "").trim();
  if (weekLabel) return weekLabel;
  const weekStart = helper.getValue(row, "Week Start", "");
  const weekEnd = helper.getValue(row, "Week End", "");
  const startLabel = formatInboxDate(weekStart);
  const endLabel = formatInboxDate(weekEnd);
  return startLabel && endLabel ? `${startLabel} - ${endLabel}` : "-";
}

function scoreToInboxGrade(score: number, auditDate: unknown): string {
  const date = excelInboxDateToJSDate(auditDate);
  const monthKey = date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` : "unknown";
  return scoreToGrade(score, monthKey);
}

function isInboxSamePerson(a: unknown, b: unknown) {
  const left = compactInboxText(a);
  const right = compactInboxText(b);
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
}

function isInboxCaseOwner(currentUser: CurrentUser, agentName: string, account?: UserAccount) {
  return [currentUser.username, currentUser.displayName, currentUser.agentName, account?.username, account?.displayName, account?.agentName]
    .filter(Boolean)
    .some((identity) => isInboxSamePerson(identity, agentName));
}

async function buildV8CaseUploadInboxTasks(
  currentUser: CurrentUser,
  effectiveUserAccounts: UserAccount[],
  readIds: string[]
): Promise<InboxTaskItem[]> {
  try {
    if (!v8EffectiveRowsCache) {
      v8EffectiveRowsCache = fetch(`/${V8_EFFECTIVE_FILE_NAME}`, { cache: "force-cache" })
        .then(async (response) => {
          if (!response.ok) return null;
          const buffer = await response.arrayBuffer();
          const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
          const sheet = workbook.Sheets["Effective_Data"];
          if (!sheet) return null;
          return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
        })
        .catch(() => null);
    }

    const rows = await v8EffectiveRowsCache;
    if (!rows?.length) return [];
    const headerIndex = rows.findIndex((row) => {
      const normalized = row.map((value) => normalizeInboxText(value));
      return normalized.includes("agent name") && normalized.includes("case id") && normalized.includes("final score");
    });
    if (headerIndex < 0) return [];

    const helper = buildInboxHeaderHelper(rows[headerIndex]);
    const dataRows = rows.slice(headerIndex + 1).filter((row) => helper.getValue(row, "Case ID") && helper.getValue(row, "Agent Name"));
    const weekEntries = dataRows
      .map((row) => ({
        label: getInboxWeekLabel(row, helper),
        startTime: excelInboxDateToJSDate(helper.getValue(row, "Week Start", ""))?.getTime() || 0,
      }))
      .filter((item) => item.label && item.label !== "-")
      .sort((a, b) => a.startTime - b.startTime || a.label.localeCompare(b.label));
    const latestWeekLabel = weekEntries.length ? weekEntries[weekEntries.length - 1].label : "";
    if (!latestWeekLabel) return [];

    const currentAccount = effectiveUserAccounts.find((account) =>
      [account.username, account.displayName, account.agentName].some((identity) => isInboxSamePerson(identity, currentUser.username))
    );
    const seenCaseIds = new Set<string>();

    return dataRows
      .filter((row) => getInboxWeekLabel(row, helper) === latestWeekLabel)
      .map((row) => {
        const caseId = String(helper.getValue(row, "Case ID", "") || "").trim();
        const agentName = String(helper.getValue(row, "Agent Name", "") || "").trim();
        const auditDate = helper.getValue(row, "Audit Date", "");
        const finalScore = Number(helper.getLastValue(row, "Final Score", 0) || 0);
        const grade = scoreToInboxGrade(finalScore, auditDate);
        return { row, caseId, agentName, auditDate, finalScore, grade };
      })
      .filter((item) => {
        if (!item.caseId || !isInboxCaseOwner(currentUser, item.agentName, currentAccount)) return false;
        const key = item.caseId.toLowerCase();
        if (seenCaseIds.has(key)) return false;
        seenCaseIds.add(key);
        return true;
      })
      .map((item) => {
        const scoreText = Number.isFinite(item.finalScore) ? item.finalScore.toFixed(2) : "-";
        const id = `v8-new-case-${latestWeekLabel}-${item.caseId}-${scoreText}`;
        return {
          id,
          type: "evaluation",
          title: `New QA case uploaded: ${item.caseId}`,
          description: `A new QA result for week ${latestWeekLabel} is ready. Score ${scoreText}/100, Grade ${item.grade}.`,
          badge: "New Case",
          count: 1,
          unread: !readIds.includes(id),
          actionLabel: "Open case detail",
          caseId: item.caseId,
          agentName: item.agentName,
          mailTemplate: {
            subject: `New QA case uploaded: ${item.caseId}`,
            to: currentUser.displayName || currentUser.username,
            from: "QA Dashboard System",
            status: `Score ${scoreText}/100 — Grade ${item.grade}`,
            body: [
              `Case ID: ${item.caseId}`,
              `Week: ${latestWeekLabel}`,
              `Case Date: ${formatInboxDate(item.auditDate) || "-"}`,
              `Score: ${scoreText}/100`,
              `Grade: ${item.grade}`,
            ],
            footer: "Open this task to review the Case Detail for this uploaded QA result.",
          },
        } as InboxTaskItem;
      });
  } catch {
    return [];
  }
}

function formatThaiDayDate(input: string | Date) {
  return new Intl.DateTimeFormat("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(new Date(input));
}

function formatSessionDurationClock(startedAt: string, now: Date) {
  const start = new Date(startedAt).getTime();
  const current = now.getTime();

  if (Number.isNaN(start) || current <= start) {
    return "00:00:00";
  }

  const totalSeconds = Math.floor((current - start) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatSessionDuration(startedAt: string, now: Date) {
  const start = new Date(startedAt).getTime();
  const current = now.getTime();

  if (Number.isNaN(start) || current <= start) {
    return "00 hrs. 00 mins. 00 เน€เธเธเน€เธเธ”mins.";
  }

  const totalSeconds = Math.floor((current - start) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")} hrs. ${String(minutes).padStart(2, "0")} mins. ${String(seconds).padStart(2, "0")} เน€เธเธเน€เธเธ”mins.`;
}

function readStoredUser(): CurrentUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CurrentUser>;
    if (
      !parsed ||
      typeof parsed.username !== "string" ||
      typeof parsed.displayName !== "string" ||
      typeof parsed.role !== "string" ||
      typeof parsed.agentName !== "string"
    ) {
      return null;
    }
    return {
      username: parsed.username,
      displayName: parsed.displayName,
      role: parsed.role,
      agentName: parsed.agentName,
      email: typeof parsed.email === "string" ? parsed.email : "",
      loginAt: typeof parsed.loginAt === "string" ? parsed.loginAt : new Date().toISOString(),
      sessionId: typeof parsed.sessionId === "string" ? parsed.sessionId : "",
      sessionPolicyVersion:
        typeof parsed.sessionPolicyVersion === "string" ? parsed.sessionPolicyVersion : "",
      sessionExpiresAt:
        typeof parsed.sessionExpiresAt === "string" ? parsed.sessionExpiresAt : "",
    };
  } catch {
    return null;
  }
}

function readPasswordOverrides(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PASSWORD_OVERRIDE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writePasswordOverrides(value: Record<string, string>) {
  localStorage.setItem(PASSWORD_OVERRIDE_KEY, JSON.stringify(value));
}

function readLocalPasswordRecords(): Record<string, PasswordRecord> {
  try {
    const raw = localStorage.getItem(PASSWORD_RECORD_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, PasswordRecord>;
  } catch {
    return {};
  }
}

function writeLocalPasswordRecords(value: Record<string, PasswordRecord>) {
  localStorage.setItem(PASSWORD_RECORD_KEY, JSON.stringify(value));
}

function saveLocalPasswordRecord(username: string, record: PasswordRecord) {
  const current = readLocalPasswordRecords();
  current[username.trim().toLowerCase()] = record;
  writeLocalPasswordRecords(current);
}

function removeLocalPasswordRecord(username: string) {
  const current = readLocalPasswordRecords();
  delete current[username.trim().toLowerCase()];
  writeLocalPasswordRecords(current);
}

function getLocalPasswordRecord(username: string): PasswordRecord | null {
  const record = readLocalPasswordRecords()[username.trim().toLowerCase()];
  if (!record || typeof record.password !== "string" || !record.password) return null;
  return record;
}

function getLatestPasswordRecord(primary: PasswordRecord | null, fallback: PasswordRecord | null) {
  if (!primary) return fallback;
  if (!fallback) return primary;

  const primaryTime = new Date(primary.issuedAt || "").getTime();
  const fallbackTime = new Date(fallback.issuedAt || "").getTime();
  if (Number.isFinite(fallbackTime) && (!Number.isFinite(primaryTime) || fallbackTime > primaryTime)) {
    return fallback;
  }
  return primary;
}

function savePasswordOverride(username: string, newPassword: string) {
  const current = readPasswordOverrides();
  current[username.trim().toLowerCase()] = newPassword;
  writePasswordOverrides(current);
}

function removePasswordOverride(username: string) {
  const current = readPasswordOverrides();
  delete current[username.trim().toLowerCase()];
  writePasswordOverrides(current);
  removeLocalPasswordRecord(username);
}

function getEffectivePassword(account: UserAccount) {
  const overrides = readPasswordOverrides();
  return overrides[account.username.trim().toLowerCase()] || account.password;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function passwordPolicyError(value: string) {
  if (value.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(value)) return "Password must include at least one uppercase letter";
  if (!/[a-z]/.test(value)) return "Password must include at least one lowercase letter";
  if (!/[0-9]/.test(value)) return "Password must include at least one number";
  if (!/[^A-Za-z0-9]/.test(value)) return "Password must include at least one special character";
  return "";
}

function generateTemporaryPassword() {
  const suffix = Math.random().toString(36).slice(2, 8);
  const number = Math.floor(100 + Math.random() * 900);
  return `Qa#${number}${suffix}A`;
}

function getResetRequestId(log: UsageLogEvent) {
  return typeof log.details?.requestId === "string" ? log.details.requestId : log.id || "";
}

function getResetRequestUsername(log: UsageLogEvent) {
  return String(log.target_agent || log.username || log.details?.username || "").trim();
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(value: Date, months: number) {
  const next = new Date(value);
  next.setMonth(next.getMonth() + months);
  return next;
}

function isPastDate(value?: string) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

function parseDateOnly(value?: string) {
  const text = String(value || "").trim();
  if (!text) return null;
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) return new Date(Number(slashMatch[3]), Number(slashMatch[2]) - 1, Number(slashMatch[1]));
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function isSuspendDateEffective(value?: string) {
  const suspendDate = parseDateOnly(value);
  if (!suspendDate) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return suspendDate.getTime() <= today.getTime();
}

function isAccountSuspended(account?: { status?: string; accountStatus?: string; suspendEffectiveDate?: string; suspendDate?: string; suspend_date?: string } | null) {
  if (!account) return false;
  const statusText = String(account.status || account.accountStatus || "").trim().toLowerCase();
  return statusText.includes("suspend") || isSuspendDateEffective(account.suspendEffectiveDate || account.suspendDate || account.suspend_date);
}

function buildSuspendedMessage(account?: { suspendReason?: string; suspendEffectiveDate?: string; suspendDate?: string; suspend_date?: string } | null) {
  const reason = String(account?.suspendReason || "").trim();
  const date = String(account?.suspendEffectiveDate || account?.suspendDate || account?.suspend_date || "").trim();
  const details = [date ? `effective ${date}` : "", reason].filter(Boolean).join(" - ");
  return details ? ` (${details})` : "";
}

function daysUntilDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function getInboxReadStorageKey(user: CurrentUser | null) {
  const owner = user?.username?.trim().toLowerCase() || "guest";
  return `${INBOX_READ_KEY}:${owner}`;
}

function readInboxReadIds(user: CurrentUser | null) {
  try {
    const raw = localStorage.getItem(getInboxReadStorageKey(user));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function saveInboxReadIds(user: CurrentUser | null, ids: string[]) {
  localStorage.setItem(getInboxReadStorageKey(user), JSON.stringify(Array.from(new Set(ids))));
}

function getChatReadStorageKey(user: CurrentUser | null) {
  const owner = user?.username?.trim().toLowerCase() || "guest";
  return `${CHAT_READ_KEY}:${owner}`;
}

function readChatReadMap(user: CurrentUser | null) {
  try {
    const raw = localStorage.getItem(getChatReadStorageKey(user));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveChatReadMap(user: CurrentUser | null, value: Record<string, string>) {
  localStorage.setItem(getChatReadStorageKey(user), JSON.stringify(value));
}

function getPasswordRecordFromEvent(item: UsageLogEvent): PasswordRecord | null {
  const password = item.details?.password;
  if (typeof password !== "string" || !password) return null;

  const rawKind = item.details?.passwordKind;
  const kind: PasswordRecord["kind"] =
    rawKind === "temporary" || item.event_type === "password_reset_approved"
      ? "temporary"
      : rawKind === "permanent" || item.event_type === "password_changed"
        ? "permanent"
        : "legacy";
  const rawIssuedAt = String(item.details?.issuedAt || item.details?.changedAt || item.created_at || new Date().toISOString());
  const issuedDate = new Date(rawIssuedAt);
  const issuedAt = Number.isNaN(issuedDate.getTime()) ? new Date().toISOString() : issuedDate.toISOString();
  const fallbackExpiry =
    kind === "temporary"
      ? addDays(new Date(issuedAt), TEMP_PASSWORD_VALID_DAYS).toISOString()
      : addMonths(new Date(issuedAt), PERMANENT_PASSWORD_VALID_MONTHS).toISOString();

  return {
    password,
    kind,
    issuedAt,
    expiresAt: String(item.details?.expiresAt || fallbackExpiry),
    eventType: item.event_type,
  };
}

function getPasswordRecordFromStoredProfile(profile: StoredUserProfile | null | undefined): PasswordRecord | null {
  const rawProfile = (profile || {}) as any;
  const password = String(rawProfile.password || "");
  if (!password) return null;

  const rawKind = String(rawProfile.passwordKind || rawProfile.password_kind || "").trim().toLowerCase();
  const kind: PasswordRecord["kind"] =
    rawKind === "temporary"
      ? "temporary"
      : rawKind === "permanent"
        ? "permanent"
        : "legacy";

  const rawIssuedAt = String(
    rawProfile.passwordIssuedAt ||
      rawProfile.password_issued_at ||
      rawProfile.updatedAt ||
      rawProfile.updated_at ||
      new Date().toISOString()
  );

  const issuedDate = new Date(rawIssuedAt);
  const issuedAt = Number.isNaN(issuedDate.getTime()) ? new Date().toISOString() : issuedDate.toISOString();
  const fallbackExpiry =
    kind === "temporary"
      ? addDays(new Date(issuedAt), TEMP_PASSWORD_VALID_DAYS).toISOString()
      : addMonths(new Date(issuedAt), PERMANENT_PASSWORD_VALID_MONTHS).toISOString();

  return {
    password,
    kind,
    issuedAt,
    expiresAt: String(rawProfile.passwordExpiresAt || rawProfile.password_expires_at || fallbackExpiry),
    eventType: "qa_user_profiles",
  };
}


function getRoleUpdateUsername(log: UsageLogEvent) {
  return String(log.target_agent || log.details?.username || "").trim();
}

function getProfileUpdateUsername(log: UsageLogEvent) {
  return String(log.target_agent || log.details?.username || "").trim();
}

function buildUserRoleOverrides(logs: UsageLogEvent[]) {
  const overrides: Record<string, UserRole> = {};

  logs.forEach((item) => {
    if (item.event_type !== "user_role_updated") return;
    const normalizedUsername = getRoleUpdateUsername(item).toLowerCase();
    const newRole = normalizeRoleName(item.details?.newRole);
    if (!normalizedUsername || overrides[normalizedUsername] || !isUserRole(newRole)) return;
    overrides[normalizedUsername] = newRole;
  });

  return overrides;
}

function buildUserProfileOverrides(logs: UsageLogEvent[]) {
  const profiles: Record<string, UserProfileSnapshot> = {};

  logs.forEach((item) => {
    if (item.event_type !== "user_profile_saved") return;
    const username = getProfileUpdateUsername(item);
    const normalizedUsername = username.toLowerCase();
    const role = normalizeRoleName(item.details?.role);
    if (!username || profiles[normalizedUsername] || !isUserRole(role)) return;

    const status = item.details?.status === "Suspended" ? "Suspended" : "Active";
    profiles[normalizedUsername] = {
      username,
      displayName: String(item.details?.displayName || username),
      agentName: String(item.details?.agentName || item.details?.displayName || username),
      email: String(item.details?.email || ""),
      teamLead: String(item.details?.teamLead || DEFAULT_TEAM_ASSIGNMENTS[normalizedUsername]?.teamLead || ""),
      teamName: String(item.details?.teamName || DEFAULT_TEAM_ASSIGNMENTS[normalizedUsername]?.teamName || ""),
      role,
      status,
      suspendReason: String(item.details?.suspendReason || ""),
      suspendEffectiveDate: String(item.details?.suspendEffectiveDate || item.details?.suspendDate || ""),
    };
  });

  return profiles;
}

function buildUserProfileOverridesFromStore(rows: StoredUserProfile[]) {
  const profiles: Record<string, UserProfileSnapshot> = {};
  rows.forEach((row) => {
    const username = String(row.username || "").trim();
    if (!username) return;
    profiles[username.toLowerCase()] = {
      username,
      displayName: row.displayName || username,
      agentName: row.agentName || row.displayName || username,
      email: row.email || "",
      teamLead: row.teamLead || "",
      teamName: row.teamName || "",
      role: normalizeRoleName(row.role || "Admin Live Chat"),
      status: row.status === "Suspended" ? "Suspended" : "Active",
      suspendReason: row.suspendReason || "",
      suspendEffectiveDate: row.suspendEffectiveDate || "",
    };
  });
  return profiles;
}

function buildRolePermissionOverridesFromStore(rows: StoredRolePermission[]) {
  const permissionMap = buildRolePermissionOverrides([]);

  rows.forEach((row) => {
    const roleName = String(row.roleName || "").trim();
    if (!roleName) return;
    const current = permissionMap[roleName] || getDefaultRolePermissions(roleName);
    const next = { ...current };
    PERMISSION_KEYS.forEach((key) => {
      const value = row.permissions?.[key];
      if (typeof value === "boolean") next[key] = value;
    });
    permissionMap[roleName] = roleName === "Quality Assurance"
      ? { ...next, viewUserDirectory: true, viewAllTeams: true, viewOwnTeam: true, qaEvaluationTarget: false, manageUsers: true, manageTeams: true, manageRoles: true, manageMaintenance: true }
      : next;
  });

  return permissionMap;
}

function buildMaintenanceStateFromStore(row: StoredMaintenanceState | null) {
  if (!row) return null;
  return {
    enabled: row.enabled === true,
    message: row.message || DEFAULT_MAINTENANCE_STATE.message,
    updatedAt: row.updatedAt || "",
    updatedBy: row.updatedBy || "",
  };
}

function buildEffectiveUserAccounts(
  baseAccounts: UserAccount[],
  profileOverrides: Record<string, UserProfileSnapshot>,
  roleOverrides: Record<string, UserRole>
) {
  const merged = new Map<string, UserAccount>();

  baseAccounts.forEach((account) => {
    const normalizedUsername = account.username.trim().toLowerCase();
    const profile = profileOverrides[normalizedUsername];
    merged.set(normalizedUsername, {
      ...account,
      ...(DEFAULT_TEAM_ASSIGNMENTS[normalizedUsername] || {}),
      ...profile,
      username: profile?.username || account.username,
      password: account.password,
      role: profile?.role || roleOverrides[normalizedUsername] || account.role,
    });
  });

  Object.entries(profileOverrides).forEach(([normalizedUsername, profile]) => {
    if (merged.has(normalizedUsername)) return;
    merged.set(normalizedUsername, {
      username: profile.username,
      password: "RBH1234",
      displayName: profile.displayName,
      role: profile.role,
      agentName: profile.agentName,
      email: profile.email,
      teamLead: profile.teamLead,
      teamName: profile.teamName,
      status: profile.status,
      suspendReason: profile.suspendReason,
      suspendEffectiveDate: profile.suspendEffectiveDate,
    });
  });

  return Array.from(merged.values());
}

async function getCentralEffectiveUserAccounts() {
  try {
    const storedProfiles = await fetchStoredUserProfiles();
    if (storedProfiles.length) {
      return buildEffectiveUserAccounts(
        USER_ACCOUNTS,
        buildUserProfileOverridesFromStore(storedProfiles),
        {}
      );
    }
  } catch {
    // Fall through to the legacy event-log path for older deployments.
  }

  try {
    const logs = await fetchUsageLogsByEventTypes(USER_ACCESS_EVENT_TYPES, 500);
    return buildEffectiveUserAccounts(
      USER_ACCOUNTS,
      buildUserProfileOverrides(logs),
      buildUserRoleOverrides(logs)
    );
  } catch {
    return USER_ACCOUNTS;
  }
}

async function getCentralPasswordOverride(username: string) {
  const record = await getCentralPasswordRecord(username);
  return record?.password || "";
}

async function getCentralPasswordRecordOnly(username: string): Promise<PasswordRecord | null> {
  const normalized = username.trim().toLowerCase();

  try {
    const storedProfiles = await fetchStoredUserProfiles();
    const profile = storedProfiles.find((row) => row.username.trim().toLowerCase() === normalized);
    const profileRecord = getPasswordRecordFromStoredProfile(profile);
    if (profileRecord) return profileRecord;
  } catch {
    // Fallback to legacy password events/local records.
  }

  const logs = await fetchUsageLogsByEventTypes(PASSWORD_EVENT_TYPES, 500);
  const passwordEvent = logs.find((item) => {
    const target = getResetRequestUsername(item).toLowerCase();
    return (
      target === normalized &&
      (item.event_type === "password_reset_approved" || item.event_type === "password_changed") &&
      typeof item.details?.password === "string"
    );
  });

  return passwordEvent ? getPasswordRecordFromEvent(passwordEvent) : null;
}

async function getCentralPasswordRecord(username: string): Promise<PasswordRecord | null> {
  const localRecord = getLocalPasswordRecord(username);
  try {
    const centralRecord = await getCentralPasswordRecordOnly(username);
    return getLatestPasswordRecord(centralRecord, localRecord);
  } catch {
    return localRecord;
  }
}

function isPasswordRecordNewer(candidate: PasswordRecord | null, baseline: PasswordRecord | null) {
  if (!candidate) return false;
  if (!baseline) return true;
  const candidateTime = new Date(candidate.issuedAt || "").getTime();
  const baselineTime = new Date(baseline.issuedAt || "").getTime();
  return Number.isFinite(candidateTime) && (!Number.isFinite(baselineTime) || candidateTime > baselineTime);
}

function buildResetRequests(logs: UsageLogEvent[]) {
  const decisions = new Map<string, UsageLogEvent>();
  logs.forEach((item) => {
    if (item.event_type !== "password_reset_approved" && item.event_type !== "password_reset_rejected") return;
    const requestId = getResetRequestId(item);
    if (requestId && !decisions.has(requestId)) decisions.set(requestId, item);
  });

  return logs
    .filter((item) => item.event_type === "password_reset_request")
    .map((item): PasswordResetRequest => {
      const requestId = getResetRequestId(item);
      const decision = requestId ? decisions.get(requestId) : undefined;
      const status =
        decision?.event_type === "password_reset_approved"
          ? "Approved"
          : decision?.event_type === "password_reset_rejected"
            ? "Rejected"
            : "Pending";
      return {
        requestId,
        username: getResetRequestUsername(item),
        displayName: item.display_name || String(item.details?.displayName || ""),
        email: String(item.details?.email || ""),
        requestedAt: item.created_at || "",
        status,
        tempPassword: typeof decision?.details?.password === "string" ? decision.details.password : "",
      };
    });
}

function buildMaintenanceState(logs: UsageLogEvent[]) {
  const latest = logs.find((item) => item.event_type === "system_maintenance_saved");
  if (!latest) return DEFAULT_MAINTENANCE_STATE;
  return {
    enabled: latest.details?.enabled === true,
    message: String(latest.details?.message || DEFAULT_MAINTENANCE_STATE.message),
    updatedAt: String(latest.details?.updatedAt || latest.created_at || ""),
    updatedBy: String(latest.details?.updatedBy || latest.display_name || latest.username || ""),
  };
}

function buildChatMessages(logs: UsageLogEvent[]) {
  const resetAt = new Date(CHAT_HISTORY_RESET_AT).getTime();
  const sortedLogs = [...logs].sort(
    (a, b) => new Date(a.created_at || "").getTime() - new Date(b.created_at || "").getTime()
  );
  const messages = new Map<string, ChatMessage>();

  sortedLogs.forEach((item) => {
    const createdAtMs = new Date(item.created_at || "").getTime();
    if (
      Number.isFinite(resetAt) &&
      Number.isFinite(createdAtMs) &&
      createdAtMs <= resetAt &&
      (
        item.event_type === "chat_message" ||
        item.event_type === "chat_call_invite" ||
        item.event_type === "chat_call_response" ||
        item.event_type === "chat_call_ended" ||
        item.event_type === "chat_message_edited" ||
        item.event_type === "chat_message_deleted"
      )
    ) {
      return;
    }

    if (item.event_type === "chat_message" || item.event_type === "chat_call_invite") {
      const id = item.event_type === "chat_call_invite"
        ? String(item.details?.callId || item.id || `${item.username}-${item.created_at}`)
        : item.id || `${item.username}-${item.created_at}`;
      const attachment =
        item.details?.attachment && typeof item.details.attachment === "object"
          ? (item.details.attachment as ChatAttachment)
          : undefined;
      const message = String(item.details?.message || "");
      if (item.event_type === "chat_message" && !message && !attachment) return;

      messages.set(id, {
        id,
        createdAt: item.created_at || new Date().toISOString(),
        username: item.username || "",
        displayName: item.display_name || item.username || "",
        role: item.role || "",
        message,
        room: item.details?.room === "private" ? "private" : "team",
        toUsername: typeof item.details?.toUsername === "string" ? item.details.toUsername : "",
        toDisplayName: typeof item.details?.toDisplayName === "string" ? item.details.toDisplayName : "",
        attachment,
        kind: item.event_type === "chat_call_invite" ? "call" : "message",
        callId: item.event_type === "chat_call_invite" ? id : undefined,
        callStatus: item.event_type === "chat_call_invite" ? "pending" : undefined,
      });
    }

    if (item.event_type === "chat_call_response" || item.event_type === "chat_call_ended") {
      const callId = String(item.details?.callId || "");
      const existing = messages.get(callId);
      if (!existing) return;
      const response = item.event_type === "chat_call_ended" ? "ended" : String(item.details?.response || "");
      const callStatus =
        response === "accepted" || response === "declined" || response === "ended" || response === "missed"
          ? response
          : existing.callStatus;
      messages.set(callId, {
        ...existing,
        callStatus,
        callRespondedBy: item.display_name || item.username || existing.callRespondedBy,
        message:
          callStatus === "accepted"
            ? `${item.display_name || item.username} accepted the call.`
            : callStatus === "declined"
              ? `${item.display_name || item.username} declined the call.`
              : callStatus === "ended"
                ? `${item.display_name || item.username} ended the call.`
                : callStatus === "missed"
                  ? "Call was not answered."
                  : existing.message,
      });
    }

    if (item.event_type === "chat_message_edited") {
      const messageId = String(item.details?.messageId || "");
      const existing = messages.get(messageId);
      if (!existing) return;
      messages.set(messageId, {
        ...existing,
        message: String(item.details?.message || existing.message),
        edited: true,
      });
    }

    if (item.event_type === "chat_message_deleted") {
      const messageId = String(item.details?.messageId || "");
      if (!messageId) return;
      messages.delete(messageId);
    }
  });

  const now = Date.now();
  return Array.from(messages.values())
    .map((message) => {
      if (message.kind !== "call" || message.callStatus !== "pending") return message;
      const createdAt = new Date(message.createdAt).getTime();
      if (Number.isNaN(createdAt) || now - createdAt < CHAT_CALL_TIMEOUT_MS) return message;
      return {
        ...message,
        callStatus: "missed" as const,
        message: "Call was not answered.",
      };
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function buildOnlineUsers(logs: UsageLogEvent[]) {
  const now = Date.now();
  const users = new Map<string, OnlineUser>();

  logs.forEach((item) => {
    if (item.event_type !== "user_presence" || !item.username || !item.created_at) return;
    const createdAt = new Date(item.created_at).getTime();
    if (Number.isNaN(createdAt) || now - createdAt > ONLINE_USER_WINDOW_MS) return;
    const normalizedUsername = item.username.trim().toLowerCase();
    if (!normalizedUsername || users.has(normalizedUsername)) return;

    users.set(normalizedUsername, {
      username: item.username,
      displayName: item.display_name || item.username,
      role: item.role || "",
      agentName: item.agent_name || "",
      lastSeenAt: item.created_at,
    });
  });

  return Array.from(users.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function buildWebRtcSignals(logs: UsageLogEvent[]) {
  return logs
    .filter((item) => item.event_type === "chat_webrtc_signal")
    .map((item): WebRtcSignal | null => {
      const details = item.details || {};
      const callId = String(details.callId || "");
      const toUsername = String(details.toUsername || "");
      const type = String(details.type || "");
      if (!callId || !toUsername || !["offer", "answer", "candidate", "hangup"].includes(type)) return null;
      const payload =
        details.payload && typeof details.payload === "object"
          ? (details.payload as Record<string, unknown>)
          : {};
      return {
        id: item.id || `${item.username || "signal"}-${item.created_at || ""}-${type}`,
        callId,
        fromUsername: item.username || "",
        toUsername,
        type: type as WebRtcSignal["type"],
        payload,
        createdAt: item.created_at || "",
      };
    })
    .filter((item): item is WebRtcSignal => Boolean(item))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function canCurrentUserSeeWebRtcSignal(signal: WebRtcSignal, user: CurrentUser | null) {
  if (!user) return false;
  const myUsername = user.username.trim().toLowerCase();
  return signal.fromUsername.trim().toLowerCase() === myUsername || signal.toUsername.trim().toLowerCase() === myUsername;
}

function formatHeaderDateTime(value: Date) {
  return value.toLocaleString("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getChatRoomKeyForUser(message: ChatMessage, user: CurrentUser | null) {
  if (!user) return "team";
  if (message.room === "team") return "team";
  const myUsername = user.username.toLowerCase();
  const sender = message.username.toLowerCase();
  const target = String(message.toUsername || "").toLowerCase();
  const otherUsername = sender === myUsername ? target : sender;
  return `private:${otherUsername}`;
}

function canCurrentUserSeeChatMessage(message: ChatMessage, user: CurrentUser | null) {
  if (!user) return false;
  if (message.room === "team") return true;
  const myUsername = user.username.trim().toLowerCase();
  const sender = message.username.trim().toLowerCase();
  const target = String(message.toUsername || "").trim().toLowerCase();
  return sender === myUsername || target === myUsername;
}

function playChatNotificationSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.22);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.22);
  } catch {
    // Browser may block sound until the user interacts with the page.
  }
}

function getResetRequestDecisionStatus(logs: UsageLogEvent[], requestId: string): PasswordResetRequest["status"] {
  const decision = logs.find((item) => {
    if (item.event_type !== "password_reset_approved" && item.event_type !== "password_reset_rejected") return false;
    return getResetRequestId(item) === requestId;
  });

  if (decision?.event_type === "password_reset_approved") return "Approved";
  if (decision?.event_type === "password_reset_rejected") return "Rejected";
  return "Pending";
}

function SongkranBackdrop({ compact = false }: { compact?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-cyan-200/20 via-fuchsia-200/15 to-sky-200/20" />
      <div className="absolute left-[-60px] top-[-30px] h-44 w-44 rounded-full bg-cyan-300/25 blur-3xl" />
      <div className="absolute right-[-20px] top-8 h-36 w-36 rounded-full bg-fuchsia-300/20 blur-3xl" />
      <div className="absolute bottom-[-30px] left-1/4 h-44 w-44 rounded-full bg-sky-300/18 blur-3xl" />
      <div className="absolute bottom-2 right-1/4 h-28 w-28 rounded-full bg-violet-300/18 blur-2xl" />
      {!compact ? (
        <>
          <div className="absolute left-4 top-4 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-white/90 backdrop-blur-sm">
            Songkran Festival
          </div>
          <div className="absolute bottom-4 right-4 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-[11px] font-semibold text-white/90 backdrop-blur-sm">
            Water splash theme — resets after 25 Apr 2026
          </div>
        </>
      ) : null}
    </div>
  );
}

function SongkranFlowerCorner({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute ${className}`}>
      <div className="relative h-12 w-12">
        <span className="absolute left-4 top-0 h-4 w-4 rounded-full bg-pink-300/70" />
        <span className="absolute left-0 top-4 h-4 w-4 rounded-full bg-fuchsia-300/70" />
        <span className="absolute left-4 top-8 h-4 w-4 rounded-full bg-cyan-300/70" />
        <span className="absolute left-8 top-4 h-4 w-4 rounded-full bg-sky-300/70" />
        <span className="absolute left-4 top-4 h-4 w-4 rounded-full bg-white/85 shadow-sm" />
      </div>
    </div>
  );
}

function SongkranBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-semibold text-cyan-700 shadow-sm">
      Songkran Theme
    </span>
  );
}

function FestiveIllustration() {
  return (
    <div className="relative mt-8 h-[280px] w-full overflow-hidden rounded-[30px] border border-white/15 bg-white/10 backdrop-blur-sm">
      <svg viewBox="0 0 700 360" className="h-full w-full">
        <defs>
          <linearGradient id="waterRibbon1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="50%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#e879f9" />
          </linearGradient>
          <linearGradient id="waterRibbon2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f9a8d4" />
            <stop offset="50%" stopColor="#93c5fd" />
            <stop offset="100%" stopColor="#67e8f9" />
          </linearGradient>
        </defs>
        <path d="M-20 230 C 90 170, 150 280, 260 220 S 430 160, 540 210 S 650 250, 740 205" fill="none" stroke="url(#waterRibbon1)" strokeWidth="18" strokeLinecap="round" opacity="0.9" />
        <path d="M-10 270 C 90 220, 180 320, 300 260 S 460 200, 560 255 S 650 300, 730 250" fill="none" stroke="url(#waterRibbon2)" strokeWidth="12" strokeLinecap="round" opacity="0.8" />
      </svg>
    </div>
  );
}

function LogoBox() {
  return (
    <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white/12 shadow-[0_12px_34px_rgba(0,0,0,0.16)] backdrop-blur-sm sm:h-20 sm:w-20 sm:rounded-[26px]">
      <SongkranFlowerCorner className="-right-2 -top-2 scale-75 opacity-80" />
      <img src="/robinhood-logo.png" alt="Robinhood Logo" className="relative z-10 h-10 w-10 object-contain sm:h-14 sm:w-14" />
    </div>
  );
}

function NavButton({
  active,
  label,
  onClick,
  songkranTheme = false,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  songkranTheme?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex min-w-[92px] items-center justify-center overflow-hidden rounded-[14px] border px-3.5 py-2 text-sm font-semibold transition ${
        active
          ? songkranTheme
            ? "border-sky-500 bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-[0_10px_24px_rgba(37,99,235,0.22)]"
            : "border-slate-900 bg-slate-900 text-white shadow-[0_10px_24px_rgba(15,23,42,0.18)]"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
      }`}
    >
      <span className="relative z-10">{label}</span>
    </button>
  );
}

function NavSectionLabel({
  label,
  tone = "violet",
}: {
  label: string;
  tone?: "violet" | "fuchsia" | "slate";
}) {
  const toneClass =
    tone === "fuchsia"
      ? "border-slate-200 bg-slate-50 text-slate-500"
      : tone === "slate"
        ? "border-slate-200 bg-slate-50 text-slate-600"
        : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${toneClass}`}>
      {label}
    </span>
  );
}

function AccountActionButton({
  label,
  onClick,
  tone = "neutral",
}: {
  label: string;
  onClick: () => void;
  tone?: "neutral" | "amber" | "rose";
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
      : tone === "rose"
        ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-[38px] items-center justify-center rounded-[14px] border px-3.5 py-2 text-sm font-semibold transition ${toneClass}`}
    >
      {label}
    </button>
  );
}

function HeaderSelect({
  label,
  helper,
  value,
  onChange,
  options,
}: {
  label: string;
  helper?: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  const selectedLabel = options.find((option) => option.value === value)?.label || label;
  const sortedOptions = [...options].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

  return (
    <label className="group flex w-full min-w-0 flex-col gap-2 md:w-[220px] md:shrink-0 xl:w-[230px]">
      <span className="pl-1 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500 group-focus-within:text-violet-700">{label}</span>
      <div className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_16px_34px_rgba(15,23,42,0.06)] transition group-focus-within:border-violet-300 group-focus-within:ring-4 group-focus-within:ring-violet-100/70 group-hover:border-violet-200">
        <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-violet-700 via-fuchsia-500 to-sky-400 opacity-80" />
        <select
          value={value}
          aria-label={`${label}: ${selectedLabel}`}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[62px] w-full appearance-none bg-transparent px-5 py-3 pr-11 text-[14px] font-black text-slate-950 outline-none"
        >
          <option value="">{label}</option>
          {sortedOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {helper ? (
          <span className="pointer-events-none absolute bottom-2 left-5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
            {helper}
          </span>
        ) : null}
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-violet-700">&#9662;</span>
      </div>
    </label>
  );
}

function DashboardSubButton({
  active,
  label,
  onClick,
  songkranTheme = false,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  songkranTheme?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl px-4 py-2 text-sm font-semibold transition ${
        active
          ? songkranTheme
            ? "border border-cyan-200 bg-gradient-to-r from-cyan-100 via-sky-100 to-fuchsia-100 text-cyan-800 shadow-sm"
            : "border border-violet-300 bg-violet-100 text-violet-800"
          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      <span className="relative z-10">{label}</span>
    </button>
  );
}

function SessionWarningModal({
  open,
  onStayLoggedIn,
  onLogoutNow,
}: {
  open: boolean;
  onStayLoggedIn: () => void;
  onLogoutNow: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 px-4">
      <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl">
        <div className="text-lg font-bold text-slate-900">Session Timeout Warning</div>
        <div className="mt-3 text-sm leading-6 text-slate-600">
          You have been inactive for almost 2 hours. Your session will be logged out automatically in 1 minute unless you choose to stay signed in.
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onLogoutNow} className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100">Log Out Now</button>
          <button type="button" onClick={onStayLoggedIn} className="rounded-2xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-800">Stay Logged In</button>
        </div>
      </div>
    </div>
  );
}


function PasswordVisibilityInput({
  value,
  onChange,
  onKeyDown,
  placeholder = "",
  className = "",
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
  ariaLabel: string;
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative">
      <input
        type={showPassword ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={`${className} pr-12`}
      />
      <button
        type="button"
        onClick={() => setShowPassword((current) => !current)}
        aria-label={showPassword ? "Hide password" : "Show password"}
        tabIndex={-1}
        className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-200"
      >
        {showPassword ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 3l18 18" />
            <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
            <path d="M9.9 4.3A9.8 9.8 0 0 1 12 4c6 0 9.75 8 9.75 8a17.6 17.6 0 0 1-2.6 3.6" />
            <path d="M6.5 6.5C3.8 8.4 2.25 12 2.25 12S6 20 12 20a9.7 9.7 0 0 0 4.1-.9" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2.25 12S6 4 12 4s9.75 8 9.75 8S18 20 12 20 2.25 12 2.25 12Z" />
            <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        )}
      </button>
    </div>
  );
}

function ChangePasswordModal({
  open,
  onClose,
  currentPasswordInput,
  setCurrentPasswordInput,
  newPasswordInput,
  setNewPasswordInput,
  confirmNewPasswordInput,
  setConfirmNewPasswordInput,
  promptReason,
  error,
  success,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  currentPasswordInput: string;
  setCurrentPasswordInput: (value: string) => void;
  newPasswordInput: string;
  setNewPasswordInput: (value: string) => void;
  confirmNewPasswordInput: string;
  setConfirmNewPasswordInput: (value: string) => void;
  promptReason?: string;
  error: string;
  success: string;
  onSubmit: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 px-4">
      <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl">
        <div className="text-xl font-bold text-slate-900">Create New Password</div>
        <div className="mt-2 text-sm text-slate-500">
          {promptReason || "Update your password for this browser."}
        </div>
        <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-xs font-semibold leading-5 text-violet-800">
          <ul className="list-disc space-y-1 pl-4">
            <li>&#3605;&#3657;&#3629;&#3591;&#3617;&#3637;&#3629;&#3618;&#3656;&#3634;&#3591;&#3609;&#3657;&#3629;&#3618; 8 &#3605;&#3633;&#3623;&#3629;&#3633;&#3585;&#3625;&#3619;</li>
            <li>&#3605;&#3657;&#3629;&#3591;&#3617;&#3637; &#3605;&#3633;&#3623;&#3614;&#3636;&#3617;&#3614;&#3660;&#3651;&#3627;&#3597;&#3656; A-Z</li>
            <li>&#3605;&#3657;&#3629;&#3591;&#3617;&#3637; &#3605;&#3633;&#3623;&#3614;&#3636;&#3617;&#3614;&#3660;&#3648;&#3621;&#3655;&#3585; a-z</li>
            <li>&#3605;&#3657;&#3629;&#3591;&#3617;&#3637; &#3605;&#3633;&#3623;&#3648;&#3621;&#3586; 0-9</li>
            <li>&#3605;&#3657;&#3629;&#3591;&#3617;&#3637; &#3629;&#3633;&#3585;&#3586;&#3619;&#3632;&#3614;&#3636;&#3648;&#3624;&#3625; &#3648;&#3594;&#3656;&#3609; @ # !</li>
          </ul>
        </div>
        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-800">Current Password</label>
            <PasswordVisibilityInput value={currentPasswordInput} onChange={setCurrentPasswordInput} ariaLabel="Current Password" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-800">New Password</label>
            <PasswordVisibilityInput value={newPasswordInput} onChange={setNewPasswordInput} ariaLabel="New Password" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-800">Confirm New Password</label>
            <PasswordVisibilityInput value={confirmNewPasswordInput} onChange={setConfirmNewPasswordInput} ariaLabel="Confirm New Password" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100" />
          </div>
          {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div> : null}
          {success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{success}</div> : null}
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={onSubmit} className="rounded-2xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">Save Password</button>
        </div>
      </div>
    </div>
  );
}

function ForgotPasswordModal({
  open,
  onClose,
  usernameInput,
  setUsernameInput,
  emailInput,
  setEmailInput,
  error,
  success,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  usernameInput: string;
  setUsernameInput: (value: string) => void;
  emailInput: string;
  setEmailInput: (value: string) => void;
  error: string;
  success: string;
  onSubmit: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 px-4">
      <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl">
        <div className="text-xl font-bold text-slate-900">Forgot Password</div>
        <div className="mt-2 text-sm leading-6 text-slate-500">
          Enter your username and registered email. The system will create a temporary password, sign you in automatically, and require a new password.
        </div>
        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-800">Username</label>
            <input type="text" value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-800">Registered Email</label>
            <input type="email" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100" />
          </div>
          {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div> : null}
          {success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{success}</div> : null}
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={onSubmit} className="rounded-2xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">Verify and Continue</button>
        </div>
      </div>
    </div>
  );
}

function ResetPasswordModal({
  open,
  onClose,
  selectedUsername,
  setSelectedUsername,
  onReset,
  resultMessage,
  resetRequests,
  currentUsername,
  accounts,
  onRefreshRequests,
  onApproveRequest,
  onRejectRequest,
}: {
  open: boolean;
  onClose: () => void;
  selectedUsername: string;
  setSelectedUsername: (value: string) => void;
  onReset: () => void;
  resultMessage: string;
  resetRequests: PasswordResetRequest[];
  currentUsername: string;
  accounts: UserAccount[];
  onRefreshRequests: () => void;
  onApproveRequest: (request: PasswordResetRequest) => void;
  onRejectRequest: (request: PasswordResetRequest) => void;
}) {
  if (!open) return null;
  const normalizedCurrentUsername = currentUsername.trim().toLowerCase();
  const resettableUsers = accounts.filter((item) => item.username.trim().toLowerCase() !== normalizedCurrentUsername);
  const pendingRequests = resetRequests.filter((item) => item.status === "Pending");
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 px-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl">
        <div className="text-xl font-bold text-slate-900">Reset Password</div>
        <div className="mt-2 text-sm text-slate-500">Review password reset requests and provide a temporary password after approval.</div>
        <div className="mt-6 space-y-4">
          <div className="rounded-3xl border border-violet-100 bg-violet-50/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-700">Pending Requests</div>
                <div className="mt-1 text-sm text-slate-600">{pendingRequests.length} request(s) waiting for review</div>
              </div>
              <button type="button" onClick={onRefreshRequests} className="rounded-2xl border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50">Refresh</button>
            </div>

            <div className="mt-4 space-y-3">
              {pendingRequests.length ? (
                pendingRequests.map((request) => (
                  <div key={request.requestId} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="text-base font-bold text-slate-950">{request.displayName || request.username}</div>
                        <div className="mt-1 text-sm text-slate-500">{request.username} / {request.email}</div>
                        <div className="mt-1 text-xs text-slate-400">Requested: {request.requestedAt ? new Date(request.requestedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "-"}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {request.username.trim().toLowerCase() === normalizedCurrentUsername ? (
                          <div className="w-full text-xs font-semibold text-amber-600 lg:text-right">Another reset admin must review your own request.</div>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onApproveRequest(request)}
                          disabled={request.username.trim().toLowerCase() === normalizedCurrentUsername}
                          className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => onRejectRequest(request)}
                          disabled={request.username.trim().toLowerCase() === normalizedCurrentUsername}
                          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-violet-200 bg-white px-4 py-6 text-center text-sm text-slate-500">No pending password reset requests.</div>
              )}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-800">Select Agent</label>
            <select value={selectedUsername} onChange={(e) => setSelectedUsername(e.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100">
              <option value="">Select Agent</option>
              {resettableUsers.map((item) => (
                <option key={item.username} value={item.username}>{item.displayName}</option>
              ))}
            </select>
          </div>
          {resultMessage ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{resultMessage}</div> : null}
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={onReset} className="rounded-2xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700">Reset to Default</button>
        </div>
      </div>
    </div>
  );
}

function LoginFeatureCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="relative overflow-hidden rounded-[20px] border border-white/15 bg-white/10 p-3.5 backdrop-blur-sm">
      <SongkranFlowerCorner className="-right-2 -top-2 scale-75 opacity-70" />
      <div className="text-[11px] uppercase tracking-[0.18em] text-violet-100/80">{title}</div>
      <div className="mt-2 text-sm font-semibold leading-6 text-white/95">{desc}</div>
    </div>
  );
}

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm backdrop-blur-sm">
      {children}
    </span>
  );
}

function HeaderInfoChip({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div
      className={`inline-flex min-h-[38px] items-center gap-2 rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2 ${
        wide ? "min-w-[260px] justify-between" : "justify-between"
      }`}
    >
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</span>
      <span className={`font-semibold text-slate-800 ${wide ? "text-xs" : "text-sm"}`}>{value}</span>
    </div>
  );
}

function VersionPill({ meta, className = "" }: { meta: BuildMeta; className?: string }) {
  const baseVersion = meta.displayVersion || meta.releaseLabel?.replace(/^v/, "") || meta.version || "1.0.0";
  const commitShort = String(meta.commitHash || "").trim().slice(0, 7);
  const versionText = commitShort && !baseVersion.includes(commitShort)
    ? `${baseVersion}:${commitShort}`
    : baseVersion;
  const updatedText = meta.updatedAt || "Asia/Bangkok";

  return (
    <div className={`rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left ${className}`}>
      <div className="text-sm font-black text-slate-950">Version: {versionText}</div>
      <div className="mt-1 text-xs font-semibold text-slate-500">{updatedText}</div>
    </div>
  );
}

function ReleaseNotesButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-[38px] items-center justify-center rounded-[14px] border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
    >
      Release Notes
    </button>
  );
}

function ReleaseNotesModal({
  open,
  onClose,
  meta,
}: {
  open: boolean;
  onClose: () => void;
  meta: BuildMeta;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 px-4">
      <div className="w-full max-w-3xl rounded-[30px] bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-600">
              {meta.releaseNotesTitle || "Release Notes"}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900">
                v{meta.displayVersion || meta.version}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <MetaChip>Updated {meta.updatedAt}</MetaChip>
              <MetaChip>by {meta.author}</MetaChip>
              {meta.commitHash ? <MetaChip>{meta.commitHash.slice(0, 7)}</MetaChip> : null}
            </div>
            {meta.commitMessage ? (
              <div className="mt-3 max-w-2xl rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                {meta.commitMessage}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <div className="text-sm font-bold text-slate-900">{meta.releaseNotesTitle || "Latest Updates"}</div>
            <div className="mt-3 space-y-3">
              {meta.releaseNotes.length ? (
                meta.releaseNotes.map((item, index) => (
                  <div
                    key={`${item}-${index}`}
                    className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-slate-800"
                  >
                    {item}
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  No release notes found for this build.
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="text-sm font-bold text-slate-900">Changed Files</div>
            <div className="mt-3 space-y-3">
              {meta.changedFiles.length ? (
                meta.changedFiles.map((item, index) => (
                  <div
                    key={`${item}-${index}`}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 break-all"
                  >
                    {item}
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  No changed file list found for this build.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskInboxMockup({
  tasks,
  onOpenTask,
}: {
  tasks: InboxTaskItem[];
  onOpenTask: (task: InboxTaskItem) => void;
}) {
  const unreadTasks = tasks.filter((item) => item.unread).length;
  const totalActions = tasks.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f6f2ff] via-white to-[#f3e8ff] px-5 py-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] overflow-hidden rounded-[30px] border border-violet-200 bg-white shadow-[0_18px_50px_rgba(88,28,135,0.10)]">
        <PageHero
          eyebrow="Work Queue"
          title="Work Queue"
          subtitle="Unread work items, QA updates, password alerts, and review requests are collected here like an internal operations mailbox."
          workspaceTitle="Operations Mailbox"
          workspaceSubtitle="Read an item to clear the badge, then open the related workflow"
        />

        <div className="grid gap-4 border-b border-violet-100 bg-violet-50/60 px-5 py-5 md:grid-cols-3">
          <div className="rounded-3xl border border-violet-100 bg-white p-5">
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-700">Unread Items</div>
            <div className="mt-3 text-4xl font-black text-slate-950">{unreadTasks}</div>
          </div>
          <div className="rounded-3xl border border-slate-100 bg-white p-5 md:col-span-2">
            <div className="text-sm font-black text-slate-950">Inbox Summary</div>
            <div className="mt-2 text-sm leading-6 text-slate-600">
              You have {tasks.length} inbox item(s) and {totalActions} related action(s). Opening an unread item marks it as read and lowers the inbox badge.
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-2">
          {tasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => onOpenTask(task)}
              className={`group rounded-[28px] border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-[0_18px_40px_rgba(88,28,135,0.12)] ${
                task.unread ? "border-violet-200 bg-white" : "border-slate-200 bg-slate-50/70"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-violet-700">
                      {task.badge}
                    </div>
                    <div
                      className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${
                        task.unread ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {task.unread ? "Unread" : "Read"}
                    </div>
                  </div>
                  <div className={`mt-3 text-xl font-black ${task.unread ? "text-slate-950" : "text-slate-600"}`}>
                    {task.title}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-600">{task.description}</div>
                </div>
                <span className="inline-flex min-w-12 items-center justify-center rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-3 py-2 text-lg font-black text-white">
                  {task.count}
                </span>
              </div>
              <div className="mt-4 text-sm font-black text-violet-700 transition group-hover:translate-x-1">
                {task.actionLabel}
              </div>
              {task.mailTemplate ? (
                <div className="mt-5 rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-inner">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Internal Inbox Notice</div>
                      <div className="mt-1 text-[17px] font-black text-slate-950">{task.mailTemplate.subject}</div>
                    </div>
                    <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-black text-violet-700">
                      {task.mailTemplate.status}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs font-semibold text-slate-500 sm:grid-cols-2">
                    <div>To: <span className="text-slate-800">{task.mailTemplate.to || "-"}</span></div>
                    <div>From: <span className="text-slate-800">{task.mailTemplate.from || "-"}</span></div>
                  </div>
                  <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                    {task.mailTemplate.body.map((line, index) => (
                      <p key={`${task.id}-mail-line-${index}`}>{line}</p>
                    ))}
                  </div>
                  {task.mailTemplate.footer ? (
                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800">
                      {task.mailTemplate.footer}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </button>
          ))}

          {!tasks.length ? (
            <div className="rounded-[28px] border border-dashed border-violet-200 bg-violet-50/60 p-8 text-center text-sm font-semibold text-slate-500 lg:col-span-2">
              Your inbox is clear. New QA results, password alerts, or review work will appear here.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MaintenanceScreen({
  state,
  onLogout,
  showLogout,
}: {
  state: MaintenanceState;
  onLogout?: () => void;
  showLogout?: boolean;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-violet-950 to-fuchsia-900 px-5 py-8 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl items-center justify-center">
        <div className="w-full overflow-hidden rounded-[36px] border border-white/15 bg-white/10 p-8 text-center shadow-[0_32px_90px_rgba(15,23,42,0.35)] backdrop-blur-xl">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] border border-white/20 bg-white/15">
            <img src="/robinhood-logo.png" alt="Robinhood QA" className="h-12 w-12 rounded-2xl bg-white/90 object-contain p-2" />
          </div>
          <div className="mt-6 text-xs font-black uppercase tracking-[0.3em] text-violet-200">Maintenance Mode</div>
          <div className="mt-3 text-4xl font-black tracking-tight">QA Dashboard is under maintenance</div>
          <div className="mx-auto mt-4 max-w-2xl text-base leading-7 text-violet-100">
            {state.message || DEFAULT_MAINTENANCE_STATE.message}
          </div>
          <div className="mt-6 rounded-3xl border border-white/10 bg-white/10 px-4 py-3.5 text-sm font-semibold text-violet-100">
            Usage log is paused for non-admin users while maintenance mode is active.
            {state.updatedBy ? ` Last updated by ${state.updatedBy}.` : ""}
          </div>
          {showLogout ? (
            <button
              type="button"
              onClick={onLogout}
              className="mt-6 rounded-2xl border border-white/20 bg-white px-6 py-3 text-sm font-black text-violet-800 shadow-sm transition hover:bg-violet-50"
            >
              Sign out
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FloatingChatWidget({
  open,
  currentUser,
  messages,
  onlineUsers,
  unreadCounts,
  totalUnread,
  onToggle,
  onOpenFullChat,
  onSendMessage,
  onRefresh,
}: {
  open: boolean;
  currentUser: CurrentUser;
  messages: ChatMessage[];
  onlineUsers: OnlineUser[];
  unreadCounts: Record<string, number>;
  totalUnread: number;
  onToggle: () => void;
  onOpenFullChat: () => void;
  onSendMessage: (message: string, toUser?: OnlineUser) => Promise<void>;
  onRefresh: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [selectedUsername, setSelectedUsername] = useState("team");
  const [sending, setSending] = useState(false);
  const myUsername = currentUser.username.toLowerCase();
  const unreadBadge = totalUnread > 9 ? "9+" : String(totalUnread);
  const privateUsers = onlineUsers.filter((user) => user.username.toLowerCase() !== myUsername);
  const selectedUser = privateUsers.find((user) => user.username === selectedUsername);
  const selectedRoomKey = selectedUser ? `private:${selectedUser.username.toLowerCase()}` : "team";
  const selectedRoomTitle = selectedUser ? selectedUser.displayName || selectedUser.username : "Team Room";
  const roomMessages = [...messages]
    .filter((message) => {
      if (message.deleted) return false;
      if (!selectedUser) return message.room === "team";
      if (message.room !== "private") return false;
      const otherUsername = selectedUser.username.toLowerCase();
      const sender = message.username.toLowerCase();
      const target = String(message.toUsername || "").toLowerCase();
      return (sender === myUsername && target === otherUsername) || (sender === otherUsername && target === myUsername);
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(-5);

  useEffect(() => {
    if (selectedUsername === "team") return;
    if (!privateUsers.some((user) => user.username === selectedUsername)) {
      setSelectedUsername("team");
    }
  }, [privateUsers, selectedUsername]);

  const handleSend = async () => {
    const message = draft.trim();
    if (!message || sending) return;
    setSending(true);
    await onSendMessage(message, selectedUser);
    setDraft("");
    setSending(false);
  };

  return (
    <div className="fixed bottom-5 right-5 z-[80] flex flex-col items-end gap-3">
      {open ? (
        <div className="w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.24)]">
          <div className="bg-gradient-to-r from-slate-950 via-violet-900 to-fuchsia-700 px-4 py-4 text-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-100">Collaboration</div>
                <div className="mt-1 text-lg font-black">Team Chat</div>
                <div className="mt-1 text-xs font-semibold text-violet-100">
                  {onlineUsers.length} online user(s) — {totalUnread} unread message(s)
                </div>
              </div>
              <button
                type="button"
                onClick={onToggle}
                className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-black text-white transition hover:bg-white/20"
              >
                Hide
              </button>
            </div>
          </div>

          <div className="border-b border-slate-200 bg-white px-3 py-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Selected Room</div>
                <div className="text-sm font-black text-slate-950">{selectedRoomTitle}</div>
              </div>
              <button
                type="button"
                onClick={onRefresh}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-bold text-slate-500 transition hover:border-violet-200 hover:text-violet-700"
              >
                Refresh
              </button>
            </div>
            <div className="max-h-[190px] space-y-2 overflow-y-auto pr-1">
              <button
                type="button"
                onClick={() => setSelectedUsername("team")}
                className={`relative w-full rounded-2xl border px-3 py-2 text-left transition ${
                  selectedUsername === "team"
                    ? "border-violet-400 bg-violet-50 text-violet-800"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:border-violet-200"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-black">Team Room</div>
                    <div className="text-[10px] font-semibold text-slate-400">Everyone</div>
                  </div>
                  {unreadCounts.team ? (
                    <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-black text-white">
                      {unreadCounts.team}
                    </span>
                  ) : null}
                </div>
              </button>
              {privateUsers.map((user) => {
                const roomKey = `private:${user.username.toLowerCase()}`;
                return (
                  <button
                    key={user.username}
                    type="button"
                    onClick={() => setSelectedUsername(user.username)}
                    className={`relative w-full rounded-2xl border px-3 py-2 text-left transition ${
                      selectedUsername === user.username
                        ? "border-sky-400 bg-sky-50 text-sky-800"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:border-sky-200"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-black">{user.displayName || user.username}</div>
                        <div className="text-[10px] font-semibold text-emerald-600">Online</div>
                      </div>
                      {unreadCounts[roomKey] ? (
                        <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-black text-white">
                          {unreadCounts[roomKey]}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="max-h-[260px] space-y-2 overflow-y-auto bg-slate-50 px-3 py-3">
            {roomMessages.map((message) => {
              const isMine = message.username.toLowerCase() === myUsername;
              const isUnread = !isMine && (unreadCounts[getChatRoomKeyForUser(message, currentUser)] || 0) > 0;
              return (
                <div
                  key={message.id}
                  className={`rounded-2xl border px-3 py-2 text-sm shadow-sm ${
                    isUnread ? "border-rose-200 bg-white" : "border-slate-200 bg-white/80"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-xs font-black text-slate-950">
                      {isMine ? "You" : message.displayName}
                    </div>
                    <div className="shrink-0 text-[11px] font-semibold text-slate-400">
                      {new Date(message.createdAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <div className={`mt-1 line-clamp-2 text-xs leading-5 ${message.deleted ? "italic text-slate-400" : "text-slate-600"}`}>
                    {message.kind === "call"
                      ? message.callStatus === "missed"
                        ? "Missed call"
                        : message.callStatus === "accepted"
                          ? "Answered call"
                          : message.callStatus === "declined"
                            ? "Declined call"
                            : message.callStatus === "ended"
                              ? "Call ended"
                              : "Ringing call"
                      : message.attachment
                        ? `${message.message || "Attachment"} — ${message.attachment.name}`
                        : message.message || "-"}
                  </div>
                  {isUnread ? (
                    <div className="mt-2 inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-rose-600">
                      New
                    </div>
                  ) : null}
                </div>
              );
            })}

            {!roomMessages.length ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm font-semibold text-slate-500">
                {selectedUser ? "No private messages with this user yet." : "No team messages yet."}
              </div>
            ) : null}
          </div>

          <div className="border-t border-slate-200 bg-white p-3">
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder={selectedUser ? `Send private message to ${selectedUser.displayName || selectedUser.username}` : "Send message to Team Room"}
                className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
              />
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={!draft.trim() || sending}
                className="rounded-2xl bg-violet-700 px-4 py-2 text-sm font-black text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Send
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="text-[11px] font-bold text-slate-400">
                {selectedUser ? "Private: only sender and receiver can see this." : "Team: visible to everyone."}
              </div>
              <button
                type="button"
                onClick={onOpenFullChat}
                className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-700 transition hover:bg-violet-100"
              >
                Open Team Chat Center
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onToggle}
        className="group relative flex h-16 min-w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-700 via-fuchsia-600 to-rose-500 px-5 text-white shadow-[0_18px_45px_rgba(109,40,217,0.35)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_55px_rgba(109,40,217,0.42)]"
        aria-label="Open floating team chat"
      >
        <span className="text-sm font-black">{open ? "Chat" : "Chat"}</span>
        {totalUnread > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-7 items-center justify-center rounded-full border-2 border-white bg-rose-600 px-2 py-1 text-xs font-black text-white shadow-lg">
            {unreadBadge}
          </span>
        ) : null}
      </button>
    </div>
  );
}

export default function App() {
  const [globalSidebarCollapsed, setGlobalSidebarCollapsed] = useState(false);
  const [storedUserCandidate] = useState<CurrentUser | null>(() => readStoredUser());
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [sessionValidationPending, setSessionValidationPending] = useState(
    () => Boolean(storedUserCandidate)
  );
  const [username, setUsername] = useState(
    () => window.localStorage.getItem(REMEMBERED_USERNAME_KEY) || ""
  );
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginStep, setLoginStep] = useState<"username" | "password">("username");
  const [loginUsernameStatus, setLoginUsernameStatus] = useState<
    "idle" | "checking" | "valid" | "invalid"
  >("idle");
  const [verifiedLoginDisplayName, setVerifiedLoginDisplayName] = useState("");
  const [rememberLogin, setRememberLogin] = useState(
    () => Boolean(window.localStorage.getItem(REMEMBERED_USERNAME_KEY))
  );
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [temporaryLoginNotice, setTemporaryLoginNotice] = useState("");
  const [showSessionWarning, setShowSessionWarning] = useState(false);

  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [confirmNewPasswordInput, setConfirmNewPasswordInput] = useState("");
  const [changePasswordError, setChangePasswordError] = useState("");
  const [changePasswordSuccess, setChangePasswordSuccess] = useState("");
  const [changePasswordPromptReason, setChangePasswordPromptReason] = useState("");

  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [forgotUsernameInput, setForgotUsernameInput] = useState("");
  const [forgotEmailInput, setForgotEmailInput] = useState("");
  const [forgotPasswordError, setForgotPasswordError] = useState("");
  const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState("");

  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [resetTargetUsername, setResetTargetUsername] = useState("");
  const [resetResultMessage, setResetResultMessage] = useState("");
  const [passwordResetRequests, setPasswordResetRequests] = useState<PasswordResetRequest[]>([]);
  const [inboxTasks, setInboxTasks] = useState<InboxTaskItem[]>([]);
  const [inboxReturnTitle, setInboxReturnTitle] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [webRtcSignals, setWebRtcSignals] = useState<WebRtcSignal[]>([]);
  const [roleOverrides, setRoleOverrides] = useState<Record<string, UserRole>>({});
  const [profileOverrides, setProfileOverrides] = useState<Record<string, UserProfileSnapshot>>({});
  const [rolePermissions, setRolePermissions] = useState<RolePermissionMap>(() => buildRolePermissionOverrides([]));
  const [accessRulesReady, setAccessRulesReady] = useState(false);
  const [buildMeta, setBuildMeta] = useState<BuildMeta>(DEFAULT_BUILD_META);

  // data-create-evaluation-multitab-v5
  const [maintenanceState, setMaintenanceState] = useState<MaintenanceState>(DEFAULT_MAINTENANCE_STATE);
  const [showReleaseNotesModal, setShowReleaseNotesModal] = useState(false);
  const [floatingChatOpen, setFloatingChatOpen] = useState(false);
  const [liveNow, setLiveNow] = useState(() => new Date());
  const [workspaceProfilePhoto, setWorkspaceProfilePhoto] = useState("");
  const [workspaceProfilePhotoUploading, setWorkspaceProfilePhotoUploading] = useState(false);
  const [workspaceProfilePhotoError, setWorkspaceProfilePhotoError] = useState("");
  const [qaDataRefreshKey, setQaDataRefreshKey] = useState(() => {
    const stored = Number(window.localStorage.getItem(QA_DATA_REFRESH_STORAGE_KEY) || 0);
    return Number.isFinite(stored) ? stored : 0;
  });

  const [activeTab, setActiveTab] = useState<AppTab>(() => {
    try {
      const initialTab = normalizeAppTab(new URL(window.location.href).searchParams.get("tab"));
      const storedTab = normalizeAppTab(window.sessionStorage.getItem(ACTIVE_TAB_SESSION_STORAGE_KEY));
      return initialTab || storedTab || "dashboard";
    } catch {
      return "dashboard";
    }
  });
  const [dashboardSubTab, setDashboardSubTab] = useState<"overview" | "case-detail">("overview");
  const [openWorkspaceTabs, setOpenWorkspaceTabs] = useState<WorkspaceTabKey[]>(() => {
    try {
      const stored = JSON.parse(window.sessionStorage.getItem(OPEN_WORKSPACE_TABS_SESSION_STORAGE_KEY) || "[]");
      const valid = Array.isArray(stored)
        ? stored.map(normalizeWorkspaceTabKey).filter(Boolean) as WorkspaceTabKey[]
        : [];
      return ["dashboard", ...valid.filter((item) => item !== "dashboard")];
    } catch {
      return ["dashboard"];
    }
  });
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTabKey>(() => {
    const stored = normalizeWorkspaceTabKey(window.sessionStorage.getItem(ACTIVE_WORKSPACE_TAB_SESSION_STORAGE_KEY));
    return stored || (activeTab as WorkspaceTabKey) || "dashboard";
  });
  const [sidebarGroupsOpen, setSidebarGroupsOpen] = useState<Record<string, boolean>>(() => {
    const defaults = { performance: true, qa: false, appeals: false, quality: false, tools: false, workspace: false, admin: false, account: false };
    try {
      const stored = JSON.parse(window.sessionStorage.getItem(SIDEBAR_GROUPS_SESSION_STORAGE_KEY) || "{}");
      return { ...defaults, ...(stored && typeof stored === "object" ? stored : {}) };
    } catch {
      return defaults;
    }
  });
  const [accountMenuValue, setAccountMenuValue] = useState("");

  const [selectedAgentGlobal, setSelectedAgentGlobal] = useState("");
  const [selectedMonthGlobal, setSelectedMonthGlobal] = useState(() => getCurrentMonthKey());
  const [selectedWeekGlobal, setSelectedWeekGlobal] = useState("all");
  const [selectedAppealCaseId, setSelectedAppealCaseId] = useState("");
  const [selectedDashboardCaseId, setSelectedDashboardCaseId] = useState("");
  const [selectedRubricCode, setSelectedRubricCode] = useState("");
  const [shareLinkMessage, setShareLinkMessage] = useState("");

  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestIncomingChatRef = useRef("");
  const profilePhotoInputRef = useRef<HTMLInputElement | null>(null);
  const loginAgentScopeSeededRef = useRef(false);
  const currentUserWasRestoredRef = useRef(Boolean(storedUserCandidate));
  const restoredLoginLoggedRef = useRef(false);
  const lastSessionTouchRef = useRef(0);
  const usernameValidationRequestRef = useRef(0);
  const automaticLoginRequestRef = useRef(0);

  const activateUserSession = async (user: CurrentUser) => {
    try {
      const session = await createStoredUserSession(user);
      const authenticatedUser: CurrentUser = {
        ...user,
        sessionId: session.sessionId,
        sessionPolicyVersion: SESSION_POLICY_VERSION,
        sessionExpiresAt: session.expiresAt,
      };

      currentUserWasRestoredRef.current = false;
      restoredLoginLoggedRef.current = true;
      lastSessionTouchRef.current = Date.now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(authenticatedUser));
      if (rememberLogin) {
        localStorage.setItem(REMEMBERED_USERNAME_KEY, authenticatedUser.username);
      } else {
        localStorage.removeItem(REMEMBERED_USERNAME_KEY);
      }
      setCurrentUser(authenticatedUser);
      return authenticatedUser;
    } catch (error) {
      console.error("Secure session creation failed", error);
      setLoginError("Unable to create a secure session. Please try signing in again.");
      return null;
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function restoreSecureSession() {
      const storedUser = storedUserCandidate;
      if (!storedUser) {
        setSessionValidationPending(false);
        return;
      }

      const isQualityAssurance =
        normalizeRoleName(storedUser.role) === "Quality Assurance";

      try {
        let restoredUser = storedUser;

        if (
          !storedUser.sessionId ||
          storedUser.sessionPolicyVersion !== SESSION_POLICY_VERSION
        ) {
          if (!isQualityAssurance) {
            localStorage.removeItem(STORAGE_KEY);
            if (!cancelled) {
              setCurrentUser(null);
              setLoginError(
                "The security session was updated. Please sign in again."
              );
            }
            return;
          }

          const migratedSession = await createStoredUserSession(storedUser);
          restoredUser = {
            ...storedUser,
            sessionId: migratedSession.sessionId,
            sessionPolicyVersion: SESSION_POLICY_VERSION,
            sessionExpiresAt: migratedSession.expiresAt,
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(restoredUser));
        } else {
          const validation = await validateStoredUserSession(
            storedUser.sessionId,
            storedUser.username
          );

          if (!validation.valid) {
            localStorage.removeItem(STORAGE_KEY);
            if (!cancelled) {
              setCurrentUser(null);
              setLoginError(
                validation.reason === "expired"
                  ? "Your session expired after 2 hours of inactivity. Please sign in again."
                  : "Your session is no longer active. Please sign in again."
              );
            }
            return;
          }

          restoredUser = {
            ...storedUser,
            sessionExpiresAt: validation.session.expiresAt,
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(restoredUser));
        }

        if (!cancelled) {
          lastSessionTouchRef.current = Date.now();
          setCurrentUser(restoredUser);
        }
      } catch (error) {
        console.error("Secure session restore failed", error);
        localStorage.removeItem(STORAGE_KEY);
        if (!cancelled) {
          setCurrentUser(null);
          setLoginError(
            "The secure session could not be verified. Please sign in again."
          );
        }
      } finally {
        if (!cancelled) setSessionValidationPending(false);
      }
    }

    void restoreSecureSession();

    return () => {
      cancelled = true;
    };
  }, [storedUserCandidate]);

  const welcomeName = useMemo(() => {
    if (!currentUser) return "";
    return currentUser.displayName || currentUser.username;
  }, [currentUser]);

  const songkranTheme = useMemo(() => isSongkranThemeActive(), []);
  const effectiveUserAccounts = useMemo(
    () => buildEffectiveUserAccounts(USER_ACCOUNTS, profileOverrides, roleOverrides),
    [profileOverrides, roleOverrides]
  );

  useEffect(() => {
    if (currentUser || loginStep !== "username") return;

    const typedUsername = username.trim();
    const requestId = ++usernameValidationRequestRef.current;

    setPassword("");
    setVerifiedLoginDisplayName("");
    setTemporaryLoginNotice("");

    if (!typedUsername) {
      setLoginUsernameStatus("idle");
      if (loginError === "ไม่พบ User นี้") setLoginError("");
      return;
    }

    if (typedUsername.length < 2) {
      setLoginUsernameStatus("idle");
      setLoginError("");
      return;
    }

    setLoginUsernameStatus("checking");
    setLoginError("");

    const timer = window.setTimeout(async () => {
      try {
        const normalizedUsername = typedUsername.toLowerCase();
        let account: UserAccount | null =
          normalizedUsername === "songpon" ? USER_ACCOUNTS[0] : null;

        if (!account) {
          const centralAccounts = await getCentralEffectiveUserAccounts();
          account =
            centralAccounts.find(
              (item) => item.username.trim().toLowerCase() === normalizedUsername
            ) || null;
        }

        if (!account) {
          const profileIds = Array.from(
            new Set([
              typedUsername,
              typedUsername.charAt(0).toUpperCase() + typedUsername.slice(1),
              typedUsername.toLowerCase(),
            ].filter(Boolean))
          );

          for (const profileId of profileIds) {
            const snapshot = await getDoc(doc(firebaseDb, "qa_user_profiles", profileId));
            if (!snapshot.exists()) continue;
            const profile = snapshot.data() as any;
            account = {
              username: String(profile.username || profileId),
              password: String(profile.password || ""),
              displayName: String(profile.displayName || profile.agentName || profileId),
              role: normalizeRoleName(profile.role || "Admin Live Chat"),
              agentName: String(profile.agentName || profile.displayName || profileId),
              email: String(profile.email || ""),
              teamLead: String(profile.teamLead || ""),
              teamName: String(profile.teamName || ""),
              status: profile.status === "Suspended" ? "Suspended" : "Active",
              suspendReason: String(profile.suspendReason || ""),
              suspendEffectiveDate: String(profile.suspendEffectiveDate || ""),
            };
            break;
          }
        }

        if (requestId !== usernameValidationRequestRef.current) return;
        if (!account) {
          setLoginUsernameStatus("invalid");
          setLoginError("ไม่พบ User นี้");
          return;
        }
        if (isAccountSuspended(account)) {
          setLoginUsernameStatus("invalid");
          setLoginError(`บัญชีนี้ถูกระงับการใช้งาน${buildSuspendedMessage(account)}`);
          return;
        }

        const candidateUser: CurrentUser = {
          username: account.username,
          displayName: account.displayName,
          role: normalizeRoleName(account.role),
          agentName: account.agentName,
          email: account.email || "",
          loginAt: new Date().toISOString(),
        };

        if (maintenanceState.enabled && !canBypassMaintenance(candidateUser)) {
          setLoginUsernameStatus("invalid");
          setLoginError(maintenanceState.message || DEFAULT_MAINTENANCE_STATE.message);
          return;
        }

        setUsername(account.username);
        setVerifiedLoginDisplayName(account.displayName || account.agentName || account.username);
        setLoginUsernameStatus("valid");
        setLoginStep("password");
        setPassword("");
        setLoginError("");
        window.setTimeout(() => {
          document.querySelector<HTMLInputElement>('input[aria-label="Login Password"]')?.focus();
        }, 80);
      } catch (error) {
        if (requestId !== usernameValidationRequestRef.current) return;
        console.error("Username validation failed", error);
        setLoginUsernameStatus("invalid");
        setLoginError("ไม่สามารถตรวจสอบ User ได้ กรุณาลองใหม่อีกครั้ง");
      }
    }, 550);

    return () => window.clearTimeout(timer);
  }, [currentUser, loginStep, username, maintenanceState.enabled, maintenanceState.message]);

  const workspaceTeamName = useMemo(() => {
    if (!currentUser) return "-";

    const normalize = (value: unknown) => String(value || "").trim().toLowerCase();
    const currentUsername = normalize(currentUser.username);
    const currentDisplayName = normalize(currentUser.displayName);
    const currentAgentName = normalize(currentUser.agentName);

    const matchedAccount = effectiveUserAccounts.find((account) => {
      const accountValues = [
        normalize(account.username),
        normalize(account.displayName),
        normalize(account.agentName),
        normalize(account.email),
      ].filter(Boolean);

      return (
        accountValues.includes(currentUsername) ||
        accountValues.includes(currentDisplayName) ||
        accountValues.includes(currentAgentName)
      );
    });

    return String(matchedAccount?.teamName || "-").trim() || "-";
  }, [currentUser, effectiveUserAccounts]);

  const workspaceTeamLeadName = useMemo(() => {
    if (!currentUser) return "-";

    const normalize = (value: unknown) => String(value || "").trim().toLowerCase();
    const currentUsername = normalize(currentUser.username);
    const currentDisplayName = normalize(currentUser.displayName);
    const currentAgentName = normalize(currentUser.agentName);

    const matchedAccount = effectiveUserAccounts.find((account) => {
      const accountValues = [
        normalize(account.username),
        normalize(account.displayName),
        normalize(account.agentName),
        normalize(account.email),
      ].filter(Boolean);

      return (
        accountValues.includes(currentUsername) ||
        accountValues.includes(currentDisplayName) ||
        accountValues.includes(currentAgentName)
      );
    });

    return String(matchedAccount?.teamLead || "-").trim() || "-";
  }, [currentUser, effectiveUserAccounts]);

  const workspaceInitials = useMemo(() => {
    const source = welcomeName || currentUser?.username || "";
    const parts = source.trim().split(/\s+/).filter(Boolean);
    const initials = parts.length >= 2
      ? `${parts[0][0] || ""}${parts[1][0] || ""}`
      : source.slice(0, 2);
    return initials.toUpperCase() || "QA";
  }, [currentUser, welcomeName]);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspaceProfilePhoto() {
      if (!currentUser?.username) {
        setWorkspaceProfilePhoto("");
        setWorkspaceProfilePhotoError("");
        return;
      }

      setWorkspaceProfilePhotoError("");
      const storedPhoto = await fetchStoredProfilePhoto(currentUser.username);
      if (!cancelled) {
        setWorkspaceProfilePhoto(storedPhoto?.photoDataUrl || "");
      }
    }

    void loadWorkspaceProfilePhoto();

    return () => {
      cancelled = true;
    };
  }, [currentUser?.username]);


  useEffect(() => {
    const syncRefreshKey = (value: unknown) => {
      const nextKey = Number(value || 0);
      if (Number.isFinite(nextKey) && nextKey > 0) {
        setQaDataRefreshKey(nextKey);
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === QA_DATA_REFRESH_STORAGE_KEY) syncRefreshKey(event.newValue);
    };

    const handleLocalRefresh = (event: Event) => {
      syncRefreshKey((event as CustomEvent<number>).detail);
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("qa-dashboard-data-refresh", handleLocalRefresh);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("qa-dashboard-data-refresh", handleLocalRefresh);
    };
  }, []);
  const roleScopedAgentNames = useMemo(() => {
    if (!currentUser || hasRolePermission(currentUser, rolePermissions, "viewAllAgents")) return [];
    return [currentUser.agentName || currentUser.displayName || currentUser.username].filter(Boolean);
  }, [currentUser, rolePermissions]);
  const qaEvaluationAgentOptions = useMemo(() => {
    return effectiveUserAccounts
      .filter((account) => account.status !== "Suspended")
      .filter((account) => Boolean((rolePermissions[account.role] || getDefaultRolePermissions(account.role)).qaEvaluationTarget))
      .map((account) => ({
        username: account.username,
        displayName: account.displayName,
        agentName: account.agentName || account.displayName,
        role: account.role,
        email: account.email,
      }));
  }, [effectiveUserAccounts, rolePermissions]);
  const currentUsernameKey = currentUser?.username?.trim().toLowerCase() || "";
  const currentDisplayNameKey = currentUser?.displayName?.trim().toLowerCase() || "";

  const coachingAllowed = currentUser ? hasRolePermission(currentUser, rolePermissions, "viewCoaching") : false;
  const usageLogAllowed = currentUser ? hasRolePermission(currentUser, rolePermissions, "viewUsageLog") : false;
  const createEvaluationAllowed = currentUser ? hasRolePermission(currentUser, rolePermissions, "createEvaluation") : false;
  const takePreTestAllowed = currentUser ? hasRolePermission(currentUser, rolePermissions, "takePreTest") : false;
  const managePreTestAllowed = currentUser ? hasRolePermission(currentUser, rolePermissions, "managePreTest") : false;
  const viewPreTestResultsAllowed = currentUser ? hasRolePermission(currentUser, rolePermissions, "viewPreTestResults") : false;
  const resetPreTestRetakeAllowed = currentUser ? hasRolePermission(currentUser, rolePermissions, "resetPreTestRetake") : false;
  const exportPreTestResultsAllowed = currentUser ? hasRolePermission(currentUser, rolePermissions, "exportPreTestResults") : false;
  const preTestAllowed = Boolean(currentUser) && (takePreTestAllowed || managePreTestAllowed || viewPreTestResultsAllowed);
  const viewTrainingCheckInAllowed = currentUser ? hasRolePermission(currentUser, rolePermissions, "viewTrainingCheckIn") : false;
  const viewTrainingAttendanceAllowed = currentUser ? hasRolePermission(currentUser, rolePermissions, "viewTrainingAttendance") : false;
  const checkInTrainingSelfAllowed = currentUser ? hasRolePermission(currentUser, rolePermissions, "checkInTrainingSelf") : false;
  const manageTrainingSessionsAllowed = currentUser ? hasRolePermission(currentUser, rolePermissions, "manageTrainingSessions") : false;
  const manageTrainingRosterAllowed = currentUser ? hasRolePermission(currentUser, rolePermissions, "manageTrainingRoster") : false;
  const manualUpdateTrainingAttendanceAllowed = currentUser ? hasRolePermission(currentUser, rolePermissions, "manualUpdateTrainingAttendance") : false;
  const exportTrainingAttendanceAllowed = currentUser ? hasRolePermission(currentUser, rolePermissions, "exportTrainingAttendance") : false;
  const trainingAttendanceAllowed = Boolean(currentUser) && (viewTrainingCheckInAllowed || viewTrainingAttendanceAllowed);
  const appealRequestsAllowed = currentUser ? hasRolePermission(currentUser, rolePermissions, "reviewAppeals") : false;
  const appealOverrideAllowed = currentUser ? hasRolePermission(currentUser, rolePermissions, "appealOverride") : false;
  const rubricAllowed = currentUser ? hasRolePermission(currentUser, rolePermissions, "viewRubric") : false;
  const rubricManageAllowed = currentUser ? hasRolePermission(currentUser, rolePermissions, "manageRubric") : false;
  const passwordResetAdminAllowed = currentUser ? hasRolePermission(currentUser, rolePermissions, "resetPassword") : false;
  const passwordResetShortcutAllowed = Boolean(currentUser) && (
    passwordResetAdminAllowed ||
    PASSWORD_RESET_ADMIN_USERNAMES.has(currentUsernameKey) ||
    PASSWORD_RESET_ADMIN_DISPLAY_NAMES.has(currentDisplayNameKey)
  );
  const pendingPasswordResetRequestCount = passwordResetRequests.filter(
    (request) =>
      request.status === "Pending" &&
      request.username.trim().toLowerCase() !== currentUsernameKey
  ).length;
  const userDirectoryAllowed = Boolean(currentUser) && (
    hasRolePermission(currentUser, rolePermissions, "viewUserDirectory") ||
    hasRolePermission(currentUser, rolePermissions, "manageUsers")
  );
  const roleAdminAllowed = Boolean(currentUser) && (
    userDirectoryAllowed ||
    hasRolePermission(currentUser, rolePermissions, "manageRoles") ||
    hasRolePermission(currentUser, rolePermissions, "manageMaintenance")
  );
  const teamChatAllowed = currentUser ? hasRolePermission(currentUser, rolePermissions, "useTeamChat") : false;
  const maintenanceBlocked = Boolean(currentUser) && maintenanceState.enabled && !hasRolePermission(currentUser, rolePermissions, "manageMaintenance");
  const canUseAdminAccountMenu = Boolean(currentUser) && (
    usageLogAllowed || roleAdminAllowed || passwordResetShortcutAllowed
  );
  const performanceMenuValue =
    activeTab === "dashboard" || activeTab === "summary" || activeTab === "signature-center" || activeTab === "presentation-builder" || (activeTab === "coaching" && coachingAllowed)
      ? activeTab
      : "";
  const reviewMenuValue =
    activeTab === "appeal" ||
    (activeTab === "pre-test" && preTestAllowed) ||
    (activeTab === "training-attendance" && trainingAttendanceAllowed) ||
    (activeTab === "create-evaluation" && createEvaluationAllowed) ||
    activeTab === "appeal-requests" ||
    activeTab === "appeal-override" ||
    (activeTab === "rubric" && rubricAllowed)
      ? activeTab
      : "";
  const accountMenuDisplayValue = activeTab === "usage-log" || activeTab === "user-roles" ? activeTab : accountMenuValue;
  const unreadInboxTaskCount = inboxTasks.filter((item) => item.unread).length;
  const shortBuildHash = buildMeta.commitHash ? buildMeta.commitHash.slice(0, 7) : "";
  const chatUnreadCounts = useMemo(() => {
    const readMap = currentUser ? readChatReadMap(currentUser) : {};
    const counts: Record<string, number> = {};
    chatMessages.forEach((message) => {
      if (!currentUser || message.username.toLowerCase() === currentUser.username.toLowerCase()) return;
      const roomKey = getChatRoomKeyForUser(message, currentUser);
      const readAt = readMap[roomKey] ? new Date(readMap[roomKey]).getTime() : 0;
      const sentAt = new Date(message.createdAt).getTime();
      if (!Number.isNaN(sentAt) && sentAt > readAt) {
        counts[roomKey] = (counts[roomKey] || 0) + 1;
      }
    });
    return counts;
  }, [chatMessages, currentUser]);
  const totalChatUnreadCount = Object.values(chatUnreadCounts).reduce((sum, count) => sum + count, 0);
  const totalCallHistoryCount = chatMessages.filter((message) => message.kind === "call").length;
  const missedCallHistoryCount = chatMessages.filter((message) => message.kind === "call" && message.callStatus === "missed").length;
  const accountOptions = canUseAdminAccountMenu
    ? [
        ...(roleAdminAllowed ? [{ value: "user-roles", label: "User & Roles" }] : []),
        ...(passwordResetShortcutAllowed ? [{ value: "reset-password", label: "Password Reset" }] : []),
        ...(usageLogAllowed ? [{ value: "usage-log", label: "Activity Log" }] : []),
        { value: "change-password", label: "Change Password" },
        { value: "logout", label: "Sign Out" },
      ]
    : [
        { value: "change-password", label: "Change Password" },
        { value: "logout", label: "Sign Out" },
      ];

  function buildWorkspaceUrl(params: Record<string, string | undefined>) {
    const nextParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) nextParams.set(key, value);
    });
    return `${window.location.origin}${window.location.pathname}?${nextParams.toString()}`;
  }

  const getTabBlockedReason = useCallback((tab: AppTab) => {
    if (!currentUser || sessionValidationPending || !accessRulesReady) return "";
    if (tab === "coaching" && !coachingAllowed) return "missing viewCoaching permission";
    if (tab === "usage-log" && !usageLogAllowed) return "missing viewUsageLog permission";
    if (tab === "appeal-requests" && !appealRequestsAllowed) return "missing reviewAppeals permission";
    if (tab === "appeal-override" && !appealOverrideAllowed) return "missing appealOverride permission";
    if (tab === "create-evaluation" && !createEvaluationAllowed) return "missing createEvaluation permission";
    if (tab === "pre-test" && !preTestAllowed) return "missing pre-test permission";
    if (tab === "training-attendance" && !trainingAttendanceAllowed) return "missing training attendance permission";
    if (tab === "user-roles" && !roleAdminAllowed) return "missing user role admin permission";
    if ((tab === "team-chat" || tab === "call-history") && !teamChatAllowed) return "missing useTeamChat permission";
    return "";
  }, [
    accessRulesReady,
    appealOverrideAllowed,
    appealRequestsAllowed,
    coachingAllowed,
    createEvaluationAllowed,
    currentUser,
    sessionValidationPending,
    preTestAllowed,
    roleAdminAllowed,
    teamChatAllowed,
    trainingAttendanceAllowed,
    usageLogAllowed,
  ]);

  const applyRouteParams = useCallback((tab: AppTab, params: URLSearchParams) => {
    const requestedCaseId = params.get("caseId")?.trim() || "";
    const requestedAgent = params.get("agent")?.trim() || "";
    const requestedRubricCode = params.get("rubricCode")?.trim() || "";

    if (tab === "dashboard") {
      setDashboardSubTab(params.get("subTab") === "case-detail" || requestedCaseId ? "case-detail" : "overview");
      setSelectedDashboardCaseId(requestedCaseId);
      if (requestedAgent) setSelectedAgentGlobal(requestedAgent);
      return;
    }

    if (tab === "appeal") {
      setSelectedMonthGlobal("all");
      setSelectedAppealCaseId(requestedCaseId);
      if (requestedAgent) setSelectedAgentGlobal(requestedAgent);
      return;
    }

    if (tab === "rubric") {
      setSelectedRubricCode(requestedRubricCode);
    }
  }, []);

  const writeWorkspaceRoute = useCallback((
    tab: AppTab,
    options: {
      replace?: boolean;
      params?: Record<string, string | undefined>;
    } = {}
  ) => {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("tab", tab);
    Object.entries(options.params || {}).forEach(([key, value]) => {
      if (value) {
        nextUrl.searchParams.set(key, value);
      } else {
        nextUrl.searchParams.delete(key);
      }
    });

    const method = options.replace ? "replaceState" : "pushState";
    window.history[method]({}, "", nextUrl.toString());
  }, []);

  const navigateToTab = useCallback((
    tab: AppTab,
    options: {
      replace?: boolean;
      params?: Record<string, string | undefined>;
      workspaceKey?: WorkspaceTabKey;
    } = {}
  ) => {
    const blockedReason = getTabBlockedReason(tab);
    const nextTab = blockedReason ? "dashboard" : tab;

    if (blockedReason) {
      console.warn(`Navigation blocked for ${tab}: ${blockedReason}`);
    }

    window.sessionStorage.setItem(ACTIVE_TAB_SESSION_STORAGE_KEY, nextTab);
    setActiveTab(nextTab);

    const requestedSubTab = options.params?.subTab;
    const nextWorkspaceTab: WorkspaceTabKey = blockedReason
      ? "dashboard"
      : options.workspaceKey || (nextTab === "dashboard" && requestedSubTab === "case-detail"
        ? "case-detail"
        : nextTab);
    setOpenWorkspaceTabs((current) => current.includes(nextWorkspaceTab) ? current : [...current, nextWorkspaceTab]);
    setActiveWorkspaceTab(nextWorkspaceTab);

    const nextParams = new URLSearchParams(window.location.search);
    nextParams.set("tab", nextTab);
    Object.entries(options.params || {}).forEach(([key, value]) => {
      if (value) {
        nextParams.set(key, value);
      } else {
        nextParams.delete(key);
      }
    });
    applyRouteParams(nextTab, nextParams);

    writeWorkspaceRoute(nextTab, {
      replace: options.replace || Boolean(blockedReason),
      params: blockedReason ? {} : { ...options.params, workspace: nextWorkspaceTab },
    });
  }, [applyRouteParams, getTabBlockedReason, writeWorkspaceRoute]);

  const syncRouteFromLocation = useCallback((options: { replace?: boolean } = {}) => {
    const params = new URLSearchParams(window.location.search);
    const requestedTab =
      normalizeAppTab(params.get("tab")) ||
      normalizeAppTab(window.sessionStorage.getItem(ACTIVE_TAB_SESSION_STORAGE_KEY)) ||
      "dashboard";
    const blockedReason = getTabBlockedReason(requestedTab);
    const nextTab = blockedReason ? "dashboard" : requestedTab;

    if (blockedReason) {
      console.warn(`Navigation redirected from ${requestedTab}: ${blockedReason}`);
    }

    window.sessionStorage.setItem(ACTIVE_TAB_SESSION_STORAGE_KEY, nextTab);
    setActiveTab(nextTab);
    const routeWorkspaceTab = normalizeWorkspaceTabKey(params.get("workspace"));
    const nextWorkspaceTab: WorkspaceTabKey = blockedReason
      ? "dashboard"
      : routeWorkspaceTab || (nextTab === "dashboard" && params.get("subTab") === "case-detail"
        ? "case-detail"
        : nextTab);
    setOpenWorkspaceTabs((current) => current.includes(nextWorkspaceTab) ? current : [...current, nextWorkspaceTab]);
    setActiveWorkspaceTab(nextWorkspaceTab);
    applyRouteParams(nextTab, params);

    const urlTab = normalizeAppTab(params.get("tab"));
    if (options.replace || !urlTab || blockedReason) {
      writeWorkspaceRoute(nextTab, {
        replace: true,
        params: blockedReason ? {} : Object.fromEntries(params.entries()),
      });
    }
  }, [applyRouteParams, getTabBlockedReason, writeWorkspaceRoute]);

  useEffect(() => {
    window.sessionStorage.setItem(ACTIVE_TAB_SESSION_STORAGE_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    window.sessionStorage.setItem(OPEN_WORKSPACE_TABS_SESSION_STORAGE_KEY, JSON.stringify(openWorkspaceTabs));
    window.sessionStorage.setItem(ACTIVE_WORKSPACE_TAB_SESSION_STORAGE_KEY, activeWorkspaceTab);
  }, [openWorkspaceTabs, activeWorkspaceTab]);

  useEffect(() => {
    window.sessionStorage.setItem(SIDEBAR_GROUPS_SESSION_STORAGE_KEY, JSON.stringify(sidebarGroupsOpen));
  }, [sidebarGroupsOpen]);

  const activateWorkspaceTab = useCallback((workspaceKey: WorkspaceTabKey) => {
    if (workspaceKey === "case-detail") {
      setDashboardSubTab("case-detail");
      navigateToTab("dashboard", {
        workspaceKey,
        params: { subTab: "case-detail", caseId: selectedDashboardCaseId || "", agent: selectedAgentGlobal || "" },
      });
      return;
    }

    if (workspaceKey === "dashboard") {
      setDashboardSubTab("overview");
      navigateToTab("dashboard", {
        workspaceKey,
        params: { subTab: "overview", caseId: "", agent: "" },
      });
      return;
    }

    navigateToTab(workspaceKey as AppTab, { workspaceKey });
  }, [navigateToTab, selectedAgentGlobal, selectedDashboardCaseId]);

  const closeWorkspaceTab = useCallback((workspaceKey: WorkspaceTabKey) => {
    if (workspaceKey === "dashboard") return;
    const currentIndex = openWorkspaceTabs.indexOf(workspaceKey);
    const nextTabs = openWorkspaceTabs.filter((item) => item !== workspaceKey);
    setOpenWorkspaceTabs(nextTabs);
    if (activeWorkspaceTab === workspaceKey) {
      const fallback = nextTabs[Math.max(0, currentIndex - 1)] || "dashboard";
      activateWorkspaceTab(fallback);
    }
  }, [activeWorkspaceTab, activateWorkspaceTab, openWorkspaceTabs]);

  useEffect(() => {
    const handlePopState = () => {
      syncRouteFromLocation();
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [syncRouteFromLocation]);

  async function copyShareLink(label: string, url: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = url;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setShareLinkMessage(`${label} link copied.`);
    } catch {
      setShareLinkMessage(`Copy failed. Please copy this link manually: ${url}`);
    }

    window.setTimeout(() => setShareLinkMessage(""), 3500);
  }

  function shareCaseDetailLink(caseId?: string, agentName?: string) {
    const shareUrl = buildWorkspaceUrl({
      tab: "dashboard",
      subTab: "case-detail",
      caseId: caseId || "",
      agent: agentName || "",
    });
    void copyShareLink("Case Detail", shareUrl);
  }

  function shareRubricLink(rubricCode?: string) {
    void copyShareLink("QA Rubric", buildWorkspaceUrl({ tab: "rubric", rubricCode: rubricCode || "" }));
  }

  const handlePerformanceMenuChange = (value: string) => {
    if (value === "coaching" && !coachingAllowed) return;
    if (value === "dashboard" || value === "summary" || value === "signature-center" || value === "presentation-builder" || value === "coaching") {
      navigateToTab(value);
    }
  };

  const handleReviewMenuChange = (value: string) => {
    if (value === "create-evaluation" && !createEvaluationAllowed) return;
    if (value === "pre-test" && !preTestAllowed) return;
    if (value === "training-attendance" && !trainingAttendanceAllowed) return;
    if (value === "appeal-requests" && !appealRequestsAllowed) return;
    if (value === "appeal-override" && !appealOverrideAllowed) return;
    if (value === "appeal" || value === "create-evaluation" || value === "pre-test" || value === "training-attendance" || value === "appeal-requests" || value === "appeal-override" || value === "rubric") {
      navigateToTab(value);
    }
  };

  const handleAccountMenuChange = (value: string) => {
    setAccountMenuValue(value);

    if (value === "change-password") {
      resetChangePasswordState();
      setShowChangePasswordModal(true);
    } else if (value === "usage-log" && usageLogAllowed) {
      navigateToTab("usage-log");
    } else if (value === "user-roles" && roleAdminAllowed) {
      navigateToTab("user-roles");
    } else if (value === "reset-password" && passwordResetShortcutAllowed) {
      resetPasswordModalState();
      setShowResetPasswordModal(true);
      void loadPasswordResetRequests();
    } else if (value === "logout") {
      handleLogout();
    }

    window.setTimeout(() => {
      setAccountMenuValue("");
    }, 0);
  };

  const notifyQaDataChanged = () => {
    const nextKey = Date.now();
    setQaDataRefreshKey(nextKey);
    window.localStorage.setItem(QA_DATA_REFRESH_STORAGE_KEY, String(nextKey));
    window.dispatchEvent(new CustomEvent("qa-dashboard-data-refresh", { detail: nextKey }));
  };

  const handleEvaluationSubmitted = async (payload: EvaluationSubmitPayload) => {
    if (!currentUser) return;
    const submittedAtMs = Date.now();
    const normalizedCaseId = String(payload.caseId || "UNTITLED").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "-");
    const normalizedAgent = String(payload.agentName || payload.targetDisplayName || "UNKNOWN").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const generatedEvaluationKey = [
      "web-eval",
      normalizedCaseId,
      normalizedAgent,
      payload.auditDate || "no-date",
      submittedAtMs,
    ].join("|");
    const evaluationKey = payload.evaluationKey || generatedEvaluationKey;
    const evaluationId = payload.recordId || evaluationKey.replace(/[^a-zA-Z0-9_-]/g, "_");
    const compactEvidenceUrls = compactCentralEvidenceUrls(payload.evidenceUrls || []);
    const compactRawDataPreview = compactCentralRawPreview(payload.rawDataPreview || {}, compactEvidenceUrls);

    try {
      await upsertStoredEvaluation({
        id: evaluationId,
        evaluationKey,
        caseId: compactCentralStoreText(payload.caseId),
        agentName: compactCentralStoreText(payload.agentName),
        targetUsername: compactCentralStoreText(payload.targetUsername),
        targetDisplayName: compactCentralStoreText(payload.targetDisplayName),
        targetEmail: compactCentralStoreText(payload.targetEmail || ""),
        targetRole: compactCentralStoreText(payload.targetRole),
        auditDate: compactCentralStoreText(payload.auditDate),
        auditTimestamp: compactCentralStoreText(payload.auditTimestamp),
        waitingTime: compactCentralStoreText(payload.waitingTime),
        serviceTime: compactCentralStoreText(payload.serviceTime),
        caseUrl: compactCentralStoreText(payload.caseUrl),
        inquiry: compactCentralStoreText(payload.inquiry),
        caseDescription: compactCentralStoreText(payload.caseDescription),
        evidenceUrls: compactEvidenceUrls,
        criticalError: payload.criticalError,
        finalScore: payload.finalScore,
        grade: compactCentralStoreText(payload.grade),
        qaScheme: compactCentralStoreText(payload.qaScheme),
        rubricName: compactCentralStoreText(payload.rubricName),
        rubricPeriod: compactCentralStoreText(payload.rubricPeriod),
        completedTopics: payload.completedTopics,
        totalTopics: payload.totalTopics,
        strengths: (payload.strengths || []).map((item) => compactCentralStoreText(item)),
        improvements: (payload.improvements || []).map((item) => compactCentralStoreText(item)),
        topics: (payload.topics || []).map((topic) => ({
          ...topic,
          title: compactCentralStoreText(topic.title),
          comment: compactCentralStoreText(topic.comment),
        })),
        rawDataPreview: compactRawDataPreview,
        evaluatorUsername: currentUser.username || "",
        evaluatorName: currentUser.displayName || currentUser.username || "",
        submittedAt: new Date().toISOString(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error || "Unknown error");
      console.warn("Evaluation store save failed.", error);
      await logUsageEvent(currentUser, "qa_evaluation_save_failed", {
        tab: "create-evaluation",
        case_id: payload.caseId,
        target_agent: payload.targetUsername || payload.agentName,
        details: {
          caseId: payload.caseId,
          agentName: payload.agentName,
          error: compactCentralStoreText(errorMessage),
          evidenceCount: payload.evidenceUrls?.length || 0,
          attemptedAt: new Date().toISOString(),
        },
      });
      throw new Error(`เน€เธยเน€เธเธ‘เน€เธยเน€เธโ€”เน€เธเธ–เน€เธยเน€เธโฌเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธเน€เธโฌเน€เธเธเน€เธเธ”เน€เธยเน€เธเธ…เน€เธยเน€เธยเน€เธเธ’เน€เธยเน€เธยเน€เธเธ…เน€เธเธ’เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย: ${errorMessage}`);
    }

    await logUsageEvent(currentUser, "qa_evaluation_submitted", {
      tab: "create-evaluation",
      case_id: payload.caseId,
      target_agent: payload.targetUsername || payload.agentName,
      details: {
        caseId: payload.caseId,
        agentName: payload.agentName,
        targetUsername: payload.targetUsername,
        targetDisplayName: payload.targetDisplayName,
        targetRole: payload.targetRole,
        auditDate: payload.auditDate,
        auditTimestamp: payload.auditTimestamp,
        finalScore: payload.finalScore,
        grade: payload.grade,
        qaScheme: payload.qaScheme,
        rubricName: payload.rubricName,
        completedTopics: payload.completedTopics,
        totalTopics: payload.totalTopics,
        criticalError: payload.criticalError,
        evidenceCount: payload.evidenceUrls?.length || 0,
        topicCount: payload.topics?.length || 0,
        evaluatorName: currentUser.displayName || currentUser.username,
        evaluatorUsername: currentUser.username,
        savedAt: new Date().toISOString(),
      },
    });
    await loadInboxTasks();
    notifyQaDataChanged();
  };

  const loadInboxTasks = async () => {
    if (!currentUser) {
      setInboxTasks([]);
      return;
    }

    try {
      const [logs, passwordRecord] = await Promise.all([
        fetchUsageLogsByEventTypes(INBOX_EVENT_TYPES, 1500),
        getCentralPasswordRecord(currentUser.username),
      ]);
      const readIds = readInboxReadIds(currentUser);
      const nextTasks: InboxTaskItem[] = [];
      const appealRequests = buildAppealRequests(logs);
      const v8CaseUploadTasks = await buildV8CaseUploadInboxTasks(currentUser, effectiveUserAccounts, readIds);
      nextTasks.push(...v8CaseUploadTasks);

      if (appealRequestsAllowed) {
        appealRequests
          .filter((item) => item.status === "Pending")
          .forEach((item) => {
            const id = `appeal-review-${item.requestId}-${item.caseId}`;
            nextTasks.push({
              id,
              type: "appeal",
              title: `Appeal request: ${item.caseId}`,
              description: `${item.agent || "Case owner"} submitted an appeal request. Open Case Detail to review the case before making a decision.`,
              badge: "Review",
              count: 1,
              unread: !readIds.includes(id),
              actionLabel: "Open case detail",
              caseId: item.caseId,
              agentName: item.agent,
              mailTemplate: {
                subject: `Appeal request waiting: ${item.caseId}`,
                to: currentUser.displayName || currentUser.username,
                from: "QA Dashboard System",
                status: "Pending Review",
                body: [
                  `Case ID: ${item.caseId}`,
                  `Agent: ${item.agent || "-"}`,
                  `Submitted by: ${item.submittedBy || "-"}`,
                  `Submitted at: ${formatInboxDateTime(item.submittedAt) || "-"}`,
                  `Current score: ${item.finalScore || "-"} / Grade ${item.grade || "-"}`,
                ],
                footer: "Open Case Detail from this task. Use Review > Appeal Requests when you are ready to approve or reject the appeal.",
              },
            });
          });
      }

      if (false && appealRequestsAllowed) {
        const pendingCount = buildAppealRequests(logs).filter((item) => item.status === "Pending").length;
        if (pendingCount > 0) {
          const id = `appeal-review-${pendingCount}`;
          nextTasks.push({
            id,
            type: "appeal",
            title: "Appeal review waiting",
            description: `${pendingCount} appeal request(s) are waiting for review and decision.`,
            badge: "Review",
            count: pendingCount,
            unread: !readIds.includes(id),
            actionLabel: "Open review inbox",
            mailTemplate: {
              subject: "เน€เธเธเน€เธเธ•เน€เธเธเน€เธเธ’เน€เธเธเน€เธยเน€เธเธ’เน€เธเธเน€เธเธเน€เธเธเน€เธโ€”เน€เธยเน€เธเธเน€เธโ€เน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธเธ”เน€เธยเน€เธเธ’เน€เธเธเน€เธโ€เน€เธเธ’",
              to: currentUser.displayName || currentUser.username,
              from: "QA Dashboard System",
              status: "Pending Review",
              body: [
                `เน€เธเธเน€เธเธ•เน€เธยเน€เธเธ“เน€เธยเน€เธเธเน€เธเธเน€เธเธเน€เธโ€”เน€เธยเน€เธเธเน€เธโ€เน€เธยเน€เธยเน€เธเธ“เน€เธยเน€เธเธเน€เธย ${pendingCount} เน€เธเธเน€เธเธ’เน€เธเธเน€เธยเน€เธเธ’เน€เธเธเน€เธเธเน€เธเธเน€เธยเน€เธเธ’เน€เธเธเน€เธยเน€เธเธ”เน€เธยเน€เธเธ’เน€เธเธเน€เธโ€เน€เธเธ’`,
                "เน€เธยเน€เธเธเน€เธเธเน€เธโ€เน€เธเธ’เน€เธโฌเน€เธยเน€เธเธ”เน€เธโ€ Appeal Requests เน€เธโฌเน€เธยเน€เธเธ—เน€เธยเน€เธเธเน€เธโ€ขเน€เธเธเน€เธเธเน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธเธเน€เธเธ’เน€เธเธเน€เธเธ…เน€เธเธเน€เธโฌเน€เธเธเน€เธเธ•เน€เธเธเน€เธโ€ เน€เธยเน€เธยเน€เธยเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธเธ—เน€เธเธเน€เธยเน€เธเธเน€เธเธเน€เธโฌเน€เธเธเน€เธยเน€เธโ€ขเน€เธย เน€เธยเน€เธเธ…เน€เธเธเน€เธยเน€เธเธ‘เน€เธยเน€เธโ€”เน€เธเธ–เน€เธยเน€เธยเน€เธเธ…เน€เธโฌเน€เธยเน€เธยเน€เธย Approve เน€เธเธเน€เธเธเน€เธเธ—เน€เธเธ Reject",
              ],
              footer: "เน€เธเธเน€เธเธ…เน€เธเธ‘เน€เธย Save Review เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธยเน€เธยเน€เธเธ…เน€เธยเน€เธเธ…เน€เธเธ‘เน€เธยเน€เธยเน€เธยเน€เธเธเน€เธเธ‘เน€เธย Inbox เน€เธยเน€เธเธเน€เธยเน€เธโฌเน€เธยเน€เธยเน€เธเธ’เน€เธยเน€เธเธเน€เธยเน€เธโฌเน€เธยเน€เธเธเน€เธยเน€เธโ€เน€เธเธเน€เธเธเน€เธเธ‘เน€เธโ€ขเน€เธยเน€เธยเน€เธเธเน€เธเธ‘เน€เธโ€ขเน€เธเธ”",
            },
          });
        }
      }

      appealRequests
        .filter((item) => item.status === "Approved" || item.status === "Rejected")
        .filter((item) => {
          const currentIdentities = [
            currentUser.username,
            currentUser.displayName,
            currentUser.agentName,
          ].map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
          const requestIdentities = [
            item.agent,
            item.submittedBy,
            item.submittedByUsername,
          ].map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
          return requestIdentities.some((value) => currentIdentities.includes(value));
        })
        .forEach((item) => {
          const id = `appeal-result-${item.requestId}-${item.status}-${item.reviewedAt || "reviewed"}`;
          nextTasks.push({
            id,
            type: "appeal-result",
            title: `Appeal result: ${item.caseId}`,
            description:
              item.status === "Approved"
                ? "Your appeal was approved. Dashboard and Summary scores were updated automatically."
                : "Your appeal was rejected. Open the case detail to review the decision summary.",
            badge: item.status,
            count: 1,
            unread: !readIds.includes(id),
            actionLabel: "Open case detail",
            caseId: item.caseId,
            agentName: item.agent,
            mailTemplate: {
              subject: `เน€เธยเน€เธเธ…เน€เธยเน€เธเธ’เน€เธเธเน€เธยเน€เธเธ”เน€เธยเน€เธเธ’เน€เธเธเน€เธโ€เน€เธเธ’เน€เธเธเน€เธเธเน€เธโ€”เน€เธยเน€เธเธเน€เธโ€เน€เธยเน€เธโฌเน€เธยเน€เธเธ ${item.caseId}`,
              to: item.submittedBy || item.agent || currentUser.displayName || currentUser.username,
              from: "Quality Assurance / Songpon Phothong",
              status: item.status,
              body: [
                `เน€เธยเน€เธเธ…เน€เธยเน€เธเธ’เน€เธเธเน€เธยเน€เธเธ”เน€เธยเน€เธเธ’เน€เธเธเน€เธโ€เน€เธเธ’: ${item.status === "Approved" ? "เน€เธเธเน€เธยเน€เธเธเน€เธเธเน€เธเธ‘เน€เธโ€ขเน€เธเธ”เน€เธยเน€เธเธ’เน€เธเธเน€เธยเน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธยเน€เธย" : "เน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธเน€เธเธ‘เน€เธโ€ขเน€เธเธ”เน€เธยเน€เธเธ’เน€เธเธเน€เธยเน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธยเน€เธย"}`,
                `Case ID: ${item.caseId}`,
                `Agent: ${item.agent || "-"}`,
                item.reviewSummary ? `เน€เธเธเน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธเธ…เน€เธยเน€เธเธ’เน€เธเธเน€เธยเน€เธเธ”เน€เธยเน€เธเธ’เน€เธเธเน€เธโ€เน€เธเธ’: ${item.reviewSummary}` : "เน€เธเธเน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธเธ…เน€เธยเน€เธเธ’เน€เธเธเน€เธยเน€เธเธ”เน€เธยเน€เธเธ’เน€เธเธเน€เธโ€เน€เธเธ’: เน€เธยเน€เธเธเน€เธเธเน€เธโ€เน€เธเธ’เน€เธโฌเน€เธยเน€เธเธ”เน€เธโ€เน€เธเธเน€เธเธ’เน€เธเธเน€เธเธ…เน€เธเธเน€เธโฌเน€เธเธเน€เธเธ•เน€เธเธเน€เธโ€เน€เธโฌเน€เธยเน€เธเธเน€เธโฌเน€เธยเน€เธเธ—เน€เธยเน€เธเธเน€เธโ€ขเน€เธเธเน€เธเธเน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธเธเน€เธเธ…เน€เธโฌเน€เธยเน€เธเธ”เน€เธยเน€เธเธเน€เธโฌเน€เธโ€ขเน€เธเธ”เน€เธเธ",
              ],
              footer:
                item.status === "Approved"
                  ? "เน€เธเธเน€เธเธเน€เธเธ’เน€เธเธเน€เธโฌเน€เธเธเน€เธโ€ขเน€เธเธ: เน€เธโฌเน€เธยเน€เธเธเน€เธโ€”เน€เธเธ•เน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธเน€เธเธ‘เน€เธโ€ขเน€เธเธ”เน€เธยเน€เธเธ…เน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธโ€“เน€เธเธเน€เธยเน€เธยเน€เธเธ“เน€เธยเน€เธยเน€เธยเน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธยเน€เธย Dashboard เน€เธยเน€เธเธ…เน€เธเธ Summary เน€เธเธเน€เธเธ‘เน€เธโ€ขเน€เธยเน€เธยเน€เธเธเน€เธเธ‘เน€เธโ€ขเน€เธเธ”"
                  : "เน€เธเธเน€เธเธเน€เธเธ’เน€เธเธเน€เธโฌเน€เธเธเน€เธโ€ขเน€เธเธ: เน€เธโฌเน€เธยเน€เธเธเน€เธโ€”เน€เธเธ•เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธเน€เธเธ‘เน€เธโ€ขเน€เธเธ”เน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธยเน€เธย Dashboard เน€เธยเน€เธเธ…เน€เธเธ Summary",
            },
          });
        });

      const submittedAppealCaseIds = new Set(
        appealRequests
          .filter((item) => item.status !== "Reset")
          .map((item) => String(item.caseId || "").trim().toLowerCase())
      );
      const activeAppealOverrides = buildAppealCaseOverrides(logs).filter((item) => {
        if (submittedAppealCaseIds.has(item.caseId.trim().toLowerCase())) return false;
        const target = item.targetAgent.trim().toLowerCase();
        return Boolean(
          target &&
            (target === currentUser.username.trim().toLowerCase() ||
              target === currentUser.displayName.trim().toLowerCase() ||
              target === currentUser.agentName.trim().toLowerCase())
        );
      });

      activeAppealOverrides.forEach((item) => {
        const id = `appeal-override-${item.caseId}-${item.addedAt || "active"}`;
        nextTasks.push({
          id,
          type: "appeal-override",
          title: `Appeal reopened: ${item.caseId}`,
          description: item.note
            ? `This case is allowed for appeal after deadline. Note: ${item.note}`
            : "This case is allowed for appeal after deadline. Open Case Detail to submit appeal.",
          badge: "Appeal",
          count: 1,
          unread: !readIds.includes(id),
          actionLabel: "Open case detail",
          caseId: item.caseId,
          agentName: item.targetAgent,
          mailTemplate: {
            subject: `เน€เธโฌเน€เธยเน€เธเธ”เน€เธโ€เน€เธเธเน€เธเธ”เน€เธโ€”เน€เธยเน€เธเธ”เน€เธยเน€เธเธเน€เธเธ—เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธโ€”เน€เธยเน€เธเธเน€เธโ€เน€เธยเน€เธโฌเน€เธยเน€เธเธ ${item.caseId}`,
            to: item.targetAgent || currentUser.displayName || currentUser.username,
            from: "Quality Assurance / Songpon Phothong",
            status: "Appeal Override",
            body: [
              `เน€เธโฌเน€เธยเน€เธเธ ${item.caseId} เน€เธยเน€เธโ€เน€เธยเน€เธเธเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ”เน€เธโ€”เน€เธยเน€เธเธ”เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ—เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธโ€”เน€เธยเน€เธเธเน€เธโ€เน€เธยเน€เธยเน€เธโ€เน€เธย เน€เธยเน€เธเธเน€เธยเน€เธโฌเน€เธเธ…เน€เธเธเน€เธยเน€เธเธ“เน€เธเธเน€เธยเน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธโ€ขเน€เธเธ”เน€เธยเน€เธเธ…เน€เธยเน€เธเธ`,
              item.note ? `Reason / Note: ${item.note}` : "Reason / Note: เน€เธโฌเน€เธยเน€เธเธ”เน€เธโ€เน€เธเธเน€เธเธ”เน€เธโ€”เน€เธยเน€เธเธ”เน€เธยเน€เธยเน€เธเธ”เน€เธโฌเน€เธเธเน€เธเธเน€เธยเน€เธโ€เน€เธเธ QA",
            ],
            footer: "เน€เธเธเน€เธเธ”เน€เธโ€”เน€เธยเน€เธเธ”เน€เธยเน€เธยเน€เธเธ•เน€เธยเน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธยเน€เธเธเน€เธเธ–เน€เธโ€เน€เธโฌเน€เธยเน€เธเธ—เน€เธยเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธเธ—เน€เธยเน€เธยเน€เธยเน€เธโ€เน€เธย 1 เน€เธยเน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธโ€ขเน€เธยเน€เธเธเน€เธโฌเน€เธยเน€เธเธ เน€เธยเน€เธเธ…เน€เธเธเน€เธโ€ขเน€เธยเน€เธเธเน€เธยเน€เธโฌเน€เธยเน€เธยเน€เธยเน€เธโฌเน€เธยเน€เธยเน€เธเธ’เน€เธยเน€เธเธเน€เธยเน€เธโฌเน€เธยเน€เธเธเน€เธโฌเน€เธโ€”เน€เธยเน€เธเธ’เน€เธยเน€เธเธ‘เน€เธยเน€เธย",
          },
        });
      });

      logs
        .filter((item) => item.event_type === "qa_evaluation_submitted")
        .filter((item) => {
          const details = item.details || {};
          const currentIdentities = [
            currentUser.username,
            currentUser.displayName,
            currentUser.agentName,
            currentUser.email,
          ].map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
          const targetIdentities = [
            item.target_agent,
            details.targetUsername,
            details.targetDisplayName,
            details.agentName,
            details.targetEmail,
          ].map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
          return targetIdentities.some((value) => currentIdentities.includes(value));
        })
        .slice(0, 25)
        .forEach((item) => {
          const details = item.details || {};
          const caseId = String(item.case_id || details.caseId || "-");
          const agentName = String(details.agentName || details.targetDisplayName || currentUser.agentName || "");
          const finalScore = Number(details.finalScore || 0);
          const grade = String(details.grade || "-");
          const strengths = Array.isArray(details.strengths) ? details.strengths.map((value) => String(value)) : [];
          const improvements = Array.isArray(details.improvements) ? details.improvements.map((value) => String(value)) : [];
          const submittedAt = String(details.submittedAt || item.created_at || "");
          const id = `qa-evaluation-result-${caseId}-${submittedAt || item.id || "submitted"}`;
          nextTasks.push({
            id,
            type: "evaluation",
            title: `QA Evaluation Result — ${caseId}`,
            description: `You have a new QA evaluation result for case ${caseId}. Score ${finalScore}/100, Grade ${grade}.`,
            badge: "QA Result",
            count: 1,
            unread: !readIds.includes(id),
            actionLabel: "Open case detail",
            caseId,
            agentName,
            mailTemplate: {
              subject: `QA Evaluation Result — ${caseId}`,
              to: String(details.targetDisplayName || agentName || currentUser.displayName || currentUser.username),
              from: String(details.evaluatorName || "Quality Assurance"),
              status: `Score ${finalScore}/100 — Grade ${grade}`,
              body: [
                `You have been evaluated for case ${caseId}.`,
                `Final Score: ${finalScore}/100`,
                `Grade: ${grade}`,
                `Case Date: ${String(details.auditDate || "-")}`,
                strengths.length ? `Strong points: ${strengths.join(" | ")}` : "Strong points: Please open Case Detail to review the topic summary.",
                improvements.length ? `Improvement focus: ${improvements.join(" | ")}` : "Improvement focus: No major low-score topic captured in this evaluation.",
              ],
              footer: "Open this task to view the Case Detail. The generated PDF button will be available after the Case Detail PDF step is connected.",
            },
          });
        });

      const passwordDaysLeft = daysUntilDate(passwordRecord?.expiresAt);
      if (!passwordRecord) {
        const id = `password-setup-${currentUser.username.toLowerCase()}`;
        nextTasks.push({
          id,
          type: "password",
          title: "Create your new password",
          description: "Your current login still uses the default password cycle. Please create a new password to start the 6-month security period.",
          badge: "Password",
          count: 1,
          unread: !readIds.includes(id),
          actionLabel: "Create password",
        });
      } else if (passwordRecord.kind === "temporary") {
        const id = `password-temporary-${currentUser.username.toLowerCase()}-${passwordRecord.expiresAt.slice(0, 10)}`;
        nextTasks.push({
          id,
          type: "password",
          title: "Temporary password active",
          description:
            passwordDaysLeft !== null
              ? `Your temporary password expires in ${Math.max(passwordDaysLeft, 0)} day(s). Please create a permanent password.`
              : "Your temporary password is active. Please create a permanent password.",
          badge: "Password",
          count: 1,
          unread: !readIds.includes(id),
          actionLabel: "Create password",
        });
      } else if (passwordRecord.kind === "permanent" && passwordDaysLeft !== null && passwordDaysLeft <= PASSWORD_EXPIRY_WARNING_DAYS) {
        const id = `password-expiry-${currentUser.username.toLowerCase()}-${passwordRecord.expiresAt.slice(0, 10)}`;
        nextTasks.push({
          id,
          type: "password",
          title: passwordDaysLeft < 0 ? "Password expired" : "Password expiry reminder",
          description:
            passwordDaysLeft < 0
              ? "Your password has passed the 6-month security period. Please create a new password."
              : `Your password will expire in ${passwordDaysLeft} day(s). You can update it before it expires.`,
          badge: "Password",
          count: 1,
          unread: !readIds.includes(id),
          actionLabel: "Update password",
        });
      }

      if (buildMeta.buildNumber > 0) {
        const id = `evaluation-update-${currentUser.username.toLowerCase()}-${buildMeta.buildNumber}`;
        nextTasks.push({
          id,
          type: "evaluation",
          title: "QA evaluation update",
          description:
            !hasRolePermission(currentUser, rolePermissions, "viewAllAgents")
              ? "New QA dashboard data has been published. Open your dashboard to review the latest evaluation result."
              : "New QA dashboard data has been published. Open Dashboard to review the latest team results.",
          badge: "QA Result",
          count: 1,
          unread: !readIds.includes(id),
          actionLabel: "Open dashboard",
        });
      }

      setInboxTasks(nextTasks);
    } catch {
      setInboxTasks([]);
    }
  };

  const loadMaintenanceState = async () => {
    try {
      const storedMaintenance = buildMaintenanceStateFromStore(await fetchStoredMaintenanceState());
      if (storedMaintenance) {
        setMaintenanceState(storedMaintenance);
        return;
      }
    } catch {
      // Fall back to the legacy event log while the new tables are not installed.
    }

    try {
      const logs = await fetchUsageLogsByEventTypes(["system_maintenance_saved"], 50);
      setMaintenanceState(buildMaintenanceState(logs));
    } catch {
      setMaintenanceState(DEFAULT_MAINTENANCE_STATE);
    }
  };

  const handleMaintenanceChanged = async () => {
    await loadMaintenanceState();
  };

  const loadChatData = async () => {
    if (!currentUser) {
      setChatMessages([]);
      setOnlineUsers([]);
      setWebRtcSignals([]);
      return;
    }
    if (!CHAT_SUPABASE_POLLING_ENABLED) {
      setChatMessages([]);
      setOnlineUsers([]);
      setWebRtcSignals([]);
      return;
    }

    try {
      const logs = await fetchUsageLogsByEventTypes(CHAT_EVENT_TYPES, 300);
      const nextMessages = buildChatMessages(logs).filter((message) => canCurrentUserSeeChatMessage(message, currentUser));
      const nextSignals = buildWebRtcSignals(logs).filter((signal) => canCurrentUserSeeWebRtcSignal(signal, currentUser));
      const latestIncomingMessage = nextMessages
        .filter((message) => message.username.toLowerCase() !== currentUser.username.toLowerCase())
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      if (latestIncomingMessage) {
        const latestKey = `${latestIncomingMessage.id}:${latestIncomingMessage.createdAt}`;
        if (!latestIncomingChatRef.current) {
          latestIncomingChatRef.current = latestKey;
        } else if (latestIncomingChatRef.current !== latestKey) {
          latestIncomingChatRef.current = latestKey;
          playChatNotificationSound();
        }
      }
      setChatMessages(nextMessages);
      setWebRtcSignals(nextSignals);
      setOnlineUsers(buildOnlineUsers(logs));
    } catch {
      setChatMessages([]);
      setOnlineUsers([]);
      setWebRtcSignals([]);
    }
  };

  const sendPresence = async () => {
    if (!currentUser) return;
    if (!CHAT_SUPABASE_POLLING_ENABLED) return;
    await logUsageEvent(currentUser, "user_presence", {
      tab: activeTab,
      details: { activeTab },
    });
  };

  const sendChatMessage = async (message: string, toUser?: OnlineUser, attachment?: ChatAttachment) => {
    if (!currentUser) return;
    await logUsageEvent(currentUser, "chat_message", {
      tab: "team-chat",
      target_agent: toUser?.username || "",
      details: {
        message,
        room: toUser ? "private" : "team",
        toUsername: toUser?.username || "",
        toDisplayName: toUser?.displayName || "",
        attachment,
      },
    });
    await sendPresence();
    await loadChatData();
  };

  const editChatMessage = async (message: ChatMessage, nextMessage: string) => {
    if (!currentUser) return;
    await logUsageEvent(currentUser, "chat_message_edited", {
      tab: "team-chat",
      target_agent: message.toUsername || "",
      details: {
        messageId: message.id,
        message: nextMessage,
      },
    });
    await loadChatData();
  };

  const deleteChatMessage = async (message: ChatMessage) => {
    if (!currentUser) return;
    await logUsageEvent(currentUser, "chat_message_deleted", {
      tab: "team-chat",
      target_agent: message.toUsername || "",
      details: {
        messageId: message.id,
      },
    });
    await loadChatData();
  };

  const startChatCall = async (toUser?: OnlineUser) => {
    if (!currentUser) return undefined;
    const isPrivate = Boolean(toUser);
    const callId = `call-${currentUser.username}-${Date.now()}`;
    await logUsageEvent(currentUser, "chat_call_invite", {
      tab: "team-chat",
      target_agent: toUser?.username || "",
      details: {
        callId,
        message: isPrivate
          ? `${currentUser.displayName} started a private call invite for ${toUser?.displayName || toUser?.username}.`
          : `${currentUser.displayName} started a group call invite.`,
        room: isPrivate ? "private" : "team",
        toUsername: toUser?.username || "",
        toDisplayName: toUser?.displayName || "",
      },
    });
    await loadChatData();
    return callId;
  };

  const respondChatCall = async (message: ChatMessage, response: "accepted" | "declined") => {
    if (!currentUser) return;
    await logUsageEvent(currentUser, "chat_call_response", {
      tab: "team-chat",
      target_agent: message.username || "",
      details: {
        callId: message.callId || message.id,
        response,
        room: message.room,
        toUsername: message.username,
        toDisplayName: message.displayName,
      },
    });
    await loadChatData();
  };

  const endChatCall = async (message: ChatMessage) => {
    if (!currentUser) return;
    await logUsageEvent(currentUser, "chat_call_ended", {
      tab: "team-chat",
      target_agent: message.username || "",
      details: {
        callId: message.callId || message.id,
        room: message.room,
      },
    });
    await loadChatData();
  };

  const sendWebRtcSignal = async (signal: Omit<WebRtcSignal, "id" | "createdAt" | "fromUsername">) => {
    if (!currentUser) return;
    await logUsageEvent(currentUser, "chat_webrtc_signal", {
      tab: "team-chat",
      target_agent: signal.toUsername,
      details: {
        callId: signal.callId,
        toUsername: signal.toUsername,
        type: signal.type,
        payload: signal.payload,
      },
    });
    await loadChatData();
  };

  const markChatRoomRead = useCallback((roomKey: string) => {
    const readMap = readChatReadMap(currentUser);
    saveChatReadMap(currentUser, {
      ...readMap,
      [roomKey]: new Date().toISOString(),
    });
  }, [currentUser]);

  const loadRoleOverrides = async () => {
    try {
      let nextOverrides: Record<string, UserRole> = {};
      let nextProfiles: Record<string, UserProfileSnapshot> = {};
      let nextPermissions = buildRolePermissionOverrides([]);
      let loadedPersistentStore = false;

      try {
        const [storedProfiles, storedPermissions] = await Promise.all([
          fetchStoredUserProfiles(),
          fetchStoredRolePermissions(),
        ]);
        if (storedProfiles.length) {
          nextProfiles = {
            ...nextProfiles,
            ...buildUserProfileOverridesFromStore(storedProfiles),
          };
          loadedPersistentStore = true;
        }
        if (storedPermissions.length) {
          nextPermissions = {
            ...nextPermissions,
            ...buildRolePermissionOverridesFromStore(storedPermissions),
          };
          loadedPersistentStore = true;
        }
      } catch {
        // The new persistent tables may not exist yet; legacy logs still keep the app usable.
      }

      if (!loadedPersistentStore) {
        const logs = await fetchUsageLogsByEventTypes(USER_ACCESS_EVENT_TYPES, 500).catch(() => [] as UsageLogEvent[]);
        nextOverrides = buildUserRoleOverrides(logs);
        nextProfiles = buildUserProfileOverrides(logs);
        nextPermissions = buildRolePermissionOverrides(logs);
      }

      setRoleOverrides(nextOverrides);
      setProfileOverrides(nextProfiles);
      setRolePermissions(nextPermissions);

      setCurrentUser((previousUser) => {
        if (!previousUser) return previousUser;
        const normalizedUsername = previousUser.username.trim().toLowerCase();
        const baseAccount = USER_ACCOUNTS.find((account) => account.username.trim().toLowerCase() === normalizedUsername);
        const profile = nextProfiles[normalizedUsername];
        const nextRole = profile?.role || nextOverrides[normalizedUsername] || baseAccount?.role;
        const nextDisplayName = profile?.displayName || previousUser.displayName;
        const nextAgentName = profile?.agentName || previousUser.agentName;
        const nextEmail = profile?.email || previousUser.email;
        if (
          (!nextRole || nextRole === previousUser.role) &&
          nextDisplayName === previousUser.displayName &&
          nextAgentName === previousUser.agentName &&
          nextEmail === previousUser.email
        ) {
          return previousUser;
        }
        return {
          ...previousUser,
          role: nextRole || previousUser.role,
          displayName: nextDisplayName,
          agentName: nextAgentName,
          email: nextEmail,
        };
      });
    } catch {
      setRoleOverrides({});
      setProfileOverrides({});
      setRolePermissions(buildRolePermissionOverrides([]));
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    syncRouteFromLocation({ replace: true });
  }, [currentUser, syncRouteFromLocation]);

  useEffect(() => {
    void loadMaintenanceState();
    const timer = window.setInterval(() => {
      void loadMaintenanceState();
    }, MAINTENANCE_POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLiveNow(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!currentUser || sessionValidationPending || !accessRulesReady) return;

    if (activeTab === "coaching" && !coachingAllowed) {
      navigateToTab("dashboard", { replace: true });
    }
    if (activeTab === "usage-log" && !usageLogAllowed) {
      navigateToTab("dashboard", { replace: true });
    }
    if (activeTab === "appeal-requests" && !appealRequestsAllowed) {
      navigateToTab("dashboard", { replace: true });
    }
    if (activeTab === "appeal-override" && !appealOverrideAllowed) {
      navigateToTab("dashboard", { replace: true });
    }
    if (activeTab === "create-evaluation" && !createEvaluationAllowed) {
      navigateToTab("dashboard", { replace: true });
    }
    if (activeTab === "pre-test" && !preTestAllowed) {
      navigateToTab("dashboard", { replace: true });
    }
    if (activeTab === "training-attendance" && !trainingAttendanceAllowed) {
      navigateToTab("dashboard", { replace: true });
    }
    if (activeTab === "user-roles" && !roleAdminAllowed) {
      navigateToTab("dashboard", { replace: true });
    }
    if ((activeTab === "team-chat" || activeTab === "call-history") && !teamChatAllowed) {
      navigateToTab("dashboard", { replace: true });
    }
  }, [accessRulesReady, activeTab, appealOverrideAllowed, appealRequestsAllowed, coachingAllowed, createEvaluationAllowed, currentUser, navigateToTab, preTestAllowed, roleAdminAllowed, sessionValidationPending, teamChatAllowed, trainingAttendanceAllowed, usageLogAllowed]);

  useEffect(() => {
    let cancelled = false;

    if (!currentUser) {
      setRoleOverrides({});
      setProfileOverrides({});
      setAccessRulesReady(false);
      return () => {
        cancelled = true;
      };
    }

    setAccessRulesReady(false);

    void (async () => {
      try {
        await loadRoleOverrides();
      } finally {
        if (!cancelled) setAccessRulesReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUser?.username]);

  useEffect(() => {
    if (!currentUser) return;
    if (maintenanceBlocked) return;
    logUsageEvent(currentUser, "tab_view", {
      tab: activeTab,
      details: { dashboardSubTab },
    });
  }, [activeTab, dashboardSubTab, currentUser, maintenanceBlocked]);

  useEffect(() => {
    if (!currentUser || maintenanceBlocked) {
      setInboxTasks([]);
      return;
    }

    void loadInboxTasks();
    const timer = window.setInterval(() => {
      void loadInboxTasks();
    }, INBOX_POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [currentUser, appealRequestsAllowed, activeTab, buildMeta.buildNumber, maintenanceBlocked, effectiveUserAccounts]);

  // password reset shortcut badge polling
  useEffect(() => {
    if (!currentUser || maintenanceBlocked || !passwordResetShortcutAllowed) {
      setPasswordResetRequests([]);
      return;
    }

    void loadPasswordResetRequests();
    const timer = window.setInterval(() => {
      void loadPasswordResetRequests();
    }, INBOX_POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [currentUser, maintenanceBlocked, passwordResetShortcutAllowed]);

  // data-password-reset-badge-cleanup-v1
  useEffect(() => {
    if (!currentUser || maintenanceBlocked || !passwordResetShortcutAllowed) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const requests = await fetchStoredPasswordResetRequests();
        const pendingRequests = requests.filter(
          (request) => request.status === "Pending"
        );

        let resolvedCount = 0;

        for (const request of pendingRequests) {
          const latestPasswordRecord = await getCentralPasswordRecord(
            request.username
          ).catch(() => null);

          if (!latestPasswordRecord) continue;

          const requestedAt = new Date(request.requestedAt || "").getTime();
          const issuedAt = new Date(latestPasswordRecord.issuedAt || "").getTime();

          if (
            !Number.isFinite(requestedAt) ||
            !Number.isFinite(issuedAt) ||
            issuedAt < requestedAt
          ) {
            continue;
          }

          await updateStoredPasswordResetRequest(request.requestId, {
            status: "Approved",
            reviewedAt:
              latestPasswordRecord.issuedAt || new Date().toISOString(),
            reviewedBy: "System Auto Recovery",
          });
          resolvedCount += 1;
        }

        const refreshedRequests = resolvedCount
          ? await fetchStoredPasswordResetRequests()
          : requests;

        if (!cancelled) {
          setPasswordResetRequests(refreshedRequests);
        }
      } catch (error) {
        console.warn("Password reset history reconciliation failed", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    currentUser?.username,
    maintenanceBlocked,
    passwordResetShortcutAllowed,
  ]);

  useEffect(() => {
    if (!currentUser || maintenanceBlocked || !CHAT_SUPABASE_POLLING_ENABLED) {
      setChatMessages([]);
      setOnlineUsers([]);
      setWebRtcSignals([]);
      return;
    }

    void sendPresence();
    void loadChatData();

    const presenceTimer = window.setInterval(() => {
      void sendPresence();
    }, 30000);
    const chatTimer = window.setInterval(() => {
      void loadChatData();
    }, 5000);

    return () => {
      window.clearInterval(presenceTimer);
      window.clearInterval(chatTimer);
    };
  }, [currentUser, activeTab, maintenanceBlocked]);

  useEffect(() => {
    let isMounted = true;

    fetch(`/build-meta.json?ts=${Date.now()}`)
      .then((response) => {
        if (!response.ok) throw new Error("build-meta not found");
        return response.json();
      })
      .then((data) => {
        if (!isMounted) return;
        setBuildMeta({
          appName: String(data?.appName ?? DEFAULT_BUILD_META.appName),
          version: String(data?.version ?? DEFAULT_BUILD_META.version),
          displayVersion: String(data?.displayVersion ?? DEFAULT_BUILD_META.displayVersion),
          updatedAt: String(data?.updatedAt ?? DEFAULT_BUILD_META.updatedAt),
          releaseLabel: String(data?.releaseLabel ?? DEFAULT_BUILD_META.releaseLabel),
          author: String(data?.author ?? DEFAULT_BUILD_META.author),
          buildNumber: Number(data?.buildNumber ?? DEFAULT_BUILD_META.buildNumber),
          releaseNotesTitle: String(data?.releaseNotesTitle ?? DEFAULT_BUILD_META.releaseNotesTitle),
          releaseNotes: Array.isArray(data?.releaseNotes)
            ? data.releaseNotes.map((item: unknown) => String(item))
            : DEFAULT_BUILD_META.releaseNotes,
          changedFiles: Array.isArray(data?.changedFiles)
            ? data.changedFiles.map((item: unknown) => String(item))
            : DEFAULT_BUILD_META.changedFiles,
          commitHash: String(data?.commitHash ?? DEFAULT_BUILD_META.commitHash),
          commitMessage: String(data?.commitMessage ?? DEFAULT_BUILD_META.commitMessage),
          timezone: String(data?.timezone ?? DEFAULT_BUILD_META.timezone),
        });
      })
      .catch(() => {
        if (!isMounted) return;
        setBuildMeta(DEFAULT_BUILD_META);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (sessionValidationPending) return;
    if (currentUser) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentUser));
    }
  }, [currentUser, sessionValidationPending]);

  useEffect(() => {
    if (!currentUser) return;

    const scopedAgent = currentUser.agentName || currentUser.displayName || currentUser.username;
    if (hasRolePermission(currentUser, rolePermissions, "viewAllAgents")) {
      if (loginAgentScopeSeededRef.current) {
        setSelectedAgentGlobal("");
        loginAgentScopeSeededRef.current = false;
      }
      return;
    }

    loginAgentScopeSeededRef.current = false;
    if (scopedAgent && selectedAgentGlobal !== scopedAgent) {
      setSelectedAgentGlobal(scopedAgent);
    }
  }, [currentUser, rolePermissions, selectedAgentGlobal]);

  const clearSessionTimers = () => {
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }

    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  };

  const resetPasswordModalState = () => {
    setResetTargetUsername("");
    setResetResultMessage("");
  };

  const resetChangePasswordState = () => {
    setCurrentPasswordInput("");
    setNewPasswordInput("");
    setConfirmNewPasswordInput("");
    setChangePasswordError("");
    setChangePasswordSuccess("");
    setChangePasswordPromptReason("");
  };

  const resetForgotPasswordState = () => {
    setForgotUsernameInput("");
    setForgotEmailInput("");
    setForgotPasswordError("");
    setForgotPasswordSuccess("");
  };

  const markInboxTaskRead = (taskId: string) => {
    const readIds = readInboxReadIds(currentUser);
    saveInboxReadIds(currentUser, [...readIds, taskId]);
    setInboxTasks((previousTasks) =>
      previousTasks.map((task) => (task.id === taskId ? { ...task, unread: false } : task))
    );
  };

  const handleOpenInboxTask = async (task: InboxTaskItem) => {
    markInboxTaskRead(task.id);
    setInboxReturnTitle(task.title);

    if (task.type === "appeal") {
      if (appealRequestsAllowed) {
        navigateToTab("appeal-requests");
      }
      return;
    }

    if (task.type === "appeal-result") {
      setDashboardSubTab("case-detail");
      setSelectedAppealCaseId("");
      setSelectedDashboardCaseId(task.caseId || "");
      setSelectedAgentGlobal(task.agentName || currentUser?.agentName || "");
      navigateToTab("dashboard", {
        params: {
          subTab: "case-detail",
          caseId: task.caseId || "",
          agent: task.agentName || currentUser?.agentName || "",
        },
      });
      return;
    }

    if (task.type === "appeal-override") {
      setDashboardSubTab("case-detail");
      setSelectedAppealCaseId("");
      setSelectedDashboardCaseId(task.caseId || "");
      setSelectedAgentGlobal(task.agentName || currentUser?.agentName || "");
      navigateToTab("dashboard", {
        params: {
          subTab: "case-detail",
          caseId: task.caseId || "",
          agent: task.agentName || currentUser?.agentName || "",
        },
      });
      return;
    }

    if (task.type === "password") {
      const latestPasswordRecord = currentUser
        ? await getCentralPasswordRecord(currentUser.username).catch(() => null)
        : null;
      const latestDaysLeft = daysUntilDate(latestPasswordRecord?.expiresAt);

      if (
        latestPasswordRecord?.kind === "permanent" &&
        (latestDaysLeft === null || latestDaysLeft > PASSWORD_EXPIRY_WARNING_DAYS)
      ) {
        setInboxTasks((previousTasks) => previousTasks.filter((item) => item.id !== task.id && item.type !== "password"));
        void loadInboxTasks();
        return;
      }

      resetChangePasswordState();
      setChangePasswordPromptReason(task.description);
      setShowChangePasswordModal(true);
      return;
    }

    if (task.type === "evaluation") {
      setDashboardSubTab(task.caseId ? "case-detail" : "overview");
      setSelectedAppealCaseId("");
      setSelectedDashboardCaseId(task.caseId || "");
      setSelectedAgentGlobal(task.agentName || currentUser?.agentName || "");
      navigateToTab("dashboard", {
        params: {
          subTab: task.caseId ? "case-detail" : "overview",
          caseId: task.caseId || "",
          agent: task.agentName || currentUser?.agentName || "",
        },
      });
      return;
    }

    setDashboardSubTab("overview");
    if (currentUser && !hasRolePermission(currentUser, rolePermissions, "viewAllAgents")) {
      setSelectedAgentGlobal(currentUser.agentName || currentUser.displayName || currentUser.username);
    }
    navigateToTab("dashboard", { params: { subTab: "overview", caseId: "", agent: "" } });
  };

  const openTaskInbox = () => {
    setInboxReturnTitle("");
    navigateToTab("task-inbox");
    void loadInboxTasks();
  };

  function resizeProfilePhotoFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/")) {
        reject(new Error("Please select an image file."));
        return;
      }

      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Cannot read selected image."));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Cannot load selected image."));
        img.onload = () => {
          const size = 480;
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");

          if (!ctx) {
            reject(new Error("Cannot prepare image canvas."));
            return;
          }

          const scale = Math.max(size / img.width, size / img.height);
          const drawWidth = img.width * scale;
          const drawHeight = img.height * scale;
          const drawX = (size - drawWidth) / 2;
          const drawY = (size - drawHeight) / 2;

          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, size, size);
          ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

          resolve(canvas.toDataURL("image/jpeg", 0.86));
        };
        img.src = String(reader.result || "");
      };
      reader.readAsDataURL(file);
    });
  }

  const handleWorkspaceProfilePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !currentUser) return;

    setWorkspaceProfilePhotoUploading(true);
    setWorkspaceProfilePhotoError("");

    try {
      const photoDataUrl = await resizeProfilePhotoFile(file);

      await upsertStoredProfilePhoto({
        username: currentUser.username,
        photoDataUrl,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser.displayName || currentUser.username,
      });

      setWorkspaceProfilePhoto(photoDataUrl);
    } catch (error) {
      setWorkspaceProfilePhotoError(error instanceof Error ? error.message : "Cannot update profile photo.");
    } finally {
      setWorkspaceProfilePhotoUploading(false);
    }
  };

  const handleWorkspaceProfilePhotoDefault = async () => {
    if (!currentUser) return;

    setWorkspaceProfilePhotoUploading(true);
    setWorkspaceProfilePhotoError("");

    try {
      await clearStoredProfilePhoto(currentUser.username, currentUser.displayName || currentUser.username);
      setWorkspaceProfilePhoto("");
    } catch (error) {
      setWorkspaceProfilePhotoError(error instanceof Error ? error.message : "Cannot reset profile photo.");
    } finally {
      setWorkspaceProfilePhotoUploading(false);
    }
  };

  const clearLocalSession = (message = "") => {
    clearSessionTimers();
    setShowSessionWarning(false);
    setCurrentUser(null);
    const rememberedUsername = window.localStorage.getItem(REMEMBERED_USERNAME_KEY) || "";
    setUsername(rememberedUsername);
    setPassword("");
    setLoginStep("username");
    setLoginUsernameStatus("idle");
    setVerifiedLoginDisplayName("");
    setLoginSubmitting(false);
    setTemporaryLoginNotice("");
    setLoginError(message);
    navigateToTab("dashboard", {
      replace: true,
      params: { subTab: "", caseId: "", agent: "", rubricCode: "" },
    });
    setDashboardSubTab("overview");
    loginAgentScopeSeededRef.current = false;
    setSelectedAgentGlobal("");
    setSelectedMonthGlobal(getCurrentMonthKey());
    setSelectedWeekGlobal("all");
    setChatMessages([]);
    setOnlineUsers([]);
    setShowChangePasswordModal(false);
    setShowResetPasswordModal(false);
    resetChangePasswordState();
    resetPasswordModalState();
    localStorage.removeItem(STORAGE_KEY);
  };

  const endSessionEverywhere = (reason: "manual" | "inactivity") => {
    const logoutUser = currentUser;

    if (logoutUser && !maintenanceBlocked) {
      void logUsageEvent(logoutUser, "logout", {
        tab: activeTab,
        details: { reason },
      });
    }

    if (logoutUser?.username) {
      void revokeAllStoredUserSessions(
        logoutUser.username,
        logoutUser.sessionId || "",
        reason
      ).catch((error) => {
        console.error("Central session revoke failed", error);
      });
    }

    clearLocalSession(
      reason === "inactivity"
        ? "You were logged out after 2 hours of inactivity."
        : ""
    );
  };

  const handleLogout = () => {
    endSessionEverywhere("manual");
  };

  const handleInactivityLogout = () => {
    endSessionEverywhere("inactivity");
  };

  useEffect(() => {
    if (!currentUser?.sessionId || !currentUser.username) return;

    let cancelled = false;

    const checkCentralSession = async () => {
      try {
        const validation = await validateStoredUserSession(
          currentUser.sessionId || "",
          currentUser.username
        );

        if (!validation.valid && !cancelled) {
          clearLocalSession(
            validation.reason === "expired"
              ? "Your session expired after 2 hours of inactivity. Please sign in again."
              : "This session was logged out from another browser. Please sign in again."
          );
        }
      } catch (error) {
        console.warn("Central session check failed; will retry.", error);
      }
    };

    const handleVisibilityCheck = () => {
      if (document.visibilityState === "visible") {
        void checkCentralSession();
      }
    };

    const handleStoredSessionChange = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && !event.newValue) {
        clearLocalSession(
          "This session was logged out in another tab. Please sign in again."
        );
      }
    };

    void checkCentralSession();
    const interval = window.setInterval(
      () => void checkCentralSession(),
      SESSION_CHECK_INTERVAL_MS
    );

    window.addEventListener("focus", checkCentralSession);
    window.addEventListener("storage", handleStoredSessionChange);
    document.addEventListener("visibilitychange", handleVisibilityCheck);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", checkCentralSession);
      window.removeEventListener("storage", handleStoredSessionChange);
      document.removeEventListener("visibilitychange", handleVisibilityCheck);
    };
  }, [currentUser?.sessionId, currentUser?.username]);

  const startSessionTimers = () => {
    clearSessionTimers();
    setShowSessionWarning(false);

    warningTimerRef.current = setTimeout(() => {
      setShowSessionWarning(true);
    }, WARNING_TIME_MS);

    inactivityTimerRef.current = setTimeout(() => {
      handleInactivityLogout();
      window.alert("You have been logged out due to 2 hours of inactivity.");
    }, INACTIVITY_LIMIT_MS);
  };

  const resetInactivityTimer = () => {
    if (!currentUser) return;

    const now = Date.now();
    if (
      currentUser.sessionId &&
      now - lastSessionTouchRef.current >= SESSION_TOUCH_INTERVAL_MS
    ) {
      lastSessionTouchRef.current = now;
      void touchStoredUserSession(
        currentUser.sessionId,
        currentUser.username
      ).catch((error) => {
        console.warn("Central session activity update failed", error);
      });
    }

    startSessionTimers();
  };

  useEffect(() => {
    if (!currentUser) {
      clearSessionTimers();
      setShowSessionWarning(false);
      return;
    }

    const activityEvents: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
    ];

    const handleUserActivity = () => {
      if (showSessionWarning) return;
      resetInactivityTimer();
    };

    startSessionTimers();

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, handleUserActivity);
    });

    return () => {
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, handleUserActivity);
      });
      clearSessionTimers();
    };
  }, [currentUser, showSessionWarning]);

  useEffect(() => {
    if (!currentUser || !currentUserWasRestoredRef.current || restoredLoginLoggedRef.current) return;

    const marker = `qa-restored-login:${currentUser.username}:${currentUser.loginAt}`;
    if (sessionStorage.getItem(marker)) {
      restoredLoginLoggedRef.current = true;
      return;
    }

    sessionStorage.setItem(marker, "1");
    restoredLoginLoggedRef.current = true;
    void logUsageEvent(currentUser, "login", {
      tab: activeTab,
      details: {
        reason: "session_restored",
      },
    });
  }, [activeTab, currentUser]);

  const handleLogin = () => {
    void handleLoginAsync();
  };

  const handleLoginAsync = async () => {
    const normalizedUsername = username.trim().toLowerCase();
    const normalizedPassword = password.trim();
    if (normalizedUsername === "songpon" && normalizedPassword === "Boom@4421L2") {
      const nextUser: CurrentUser = {
        username: "Songpon",
        displayName: "Songpon Phothong",
        role: "Quality Assurance",
        agentName: "Songpon Phothong",
        email: "Songpon@robinhood.co.th",
        loginAt: new Date().toISOString(),
      };

      const activatedUser = await activateUserSession(nextUser);
      if (!activatedUser) return;
      void logUsageEvent(nextUser, "login", { tab: "dashboard" });
      setLoginError("");
      setUsername("");
      setPassword("");
      syncRouteFromLocation({ replace: true });
      loginAgentScopeSeededRef.current = false;
      setSelectedAgentGlobal("");
      setSelectedMonthGlobal(getCurrentMonthKey());
      setSelectedWeekGlobal("all");
      void loadRoleOverrides();
      return;
    }

    // Direct Firebase profile login first.
    // This makes generated password from qa_user_profiles the source of truth.
    try {
      const typedUsername = username.trim();
      const typedPassword = password.trim();
      const profileIds = Array.from(new Set([
        typedUsername,
        typedUsername.charAt(0).toUpperCase() + typedUsername.slice(1),
        typedUsername.toLowerCase(),
      ].filter(Boolean)));

      let firebaseProfileData: any = null;
      let firebaseProfileId = "";

      for (const profileId of profileIds) {
        const snap = await getDoc(doc(firebaseDb, "qa_user_profiles", profileId));
        if (snap.exists()) {
          firebaseProfileData = snap.data();
          firebaseProfileId = profileId;
          break;
        }
      }

      if (firebaseProfileData) {
        const profilePassword = String(firebaseProfileData.password || "");
        const profilePasswordKind = String(firebaseProfileData.passwordKind || firebaseProfileData.password_kind || "").toLowerCase();
        const profileExpiresAt = String(firebaseProfileData.passwordExpiresAt || firebaseProfileData.accessExpiresAt || "");

        if (isAccountSuspended(firebaseProfileData)) {
          setLoginError(`This account has been suspended${buildSuspendedMessage(firebaseProfileData)}. Please contact Songpon.`);
          return;
        }

        if (!profilePassword) {
          setLoginError("This account has no generated password yet. Please contact Songpon.");
          return;
        }

        if (profileExpiresAt && isPastDate(profileExpiresAt)) {
          setLoginError("This account password/access has expired. Please contact Songpon.");
          return;
        }

        if (profilePassword !== typedPassword) {
          setLoginError("รหัสผ่านไม่ถูกต้อง");
          return;
        }

        const nextUser: CurrentUser = {
          username: String(firebaseProfileData.username || firebaseProfileId),
          displayName: String(firebaseProfileData.displayName || firebaseProfileData.agentName || firebaseProfileId),
          role: normalizeRoleName(firebaseProfileData.role || "Admin Live Chat"),
          agentName: String(firebaseProfileData.agentName || firebaseProfileData.displayName || firebaseProfileId),
          email: String(firebaseProfileData.email || ""),
          loginAt: new Date().toISOString(),
        };

        if (maintenanceState.enabled && !canBypassMaintenance(nextUser)) {
          setLoginError(maintenanceState.message || DEFAULT_MAINTENANCE_STATE.message);
          return;
        }

        const activatedUser = await activateUserSession(nextUser);
        if (!activatedUser) return;
        void logUsageEvent(nextUser, "login", { tab: "dashboard" });
        setLoginError("");
        setUsername("");
        setPassword("");
        syncRouteFromLocation({ replace: true });

        const matchedPermissions = rolePermissions[nextUser.role] || getDefaultRolePermissions(nextUser.role);
        const initialAgentScope = matchedPermissions.viewAllAgents ? "" : nextUser.agentName;
        loginAgentScopeSeededRef.current = Boolean(initialAgentScope);
        setSelectedAgentGlobal(initialAgentScope);
        setSelectedMonthGlobal(getCurrentMonthKey());
        setSelectedWeekGlobal("all");
        void loadRoleOverrides();

        if (profilePasswordKind === "temporary") {
          resetChangePasswordState();
          setCurrentPasswordInput(typedPassword);
          setChangePasswordPromptReason("You signed in with a temporary password. Please create a new password.");
          setShowChangePasswordModal(true);
        }
        return;
      }
    } catch (error) {
      setLoginError(`Login check failed: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    const centralUserAccounts = await getCentralEffectiveUserAccounts();

    const matchedAccount = centralUserAccounts.find(
      (item) => item.username.trim().toLowerCase() === normalizedUsername
    );

    if (isAccountSuspended(matchedAccount)) {
      setLoginError(`This account has been suspended${buildSuspendedMessage(matchedAccount)}. Please contact Supervisor.`);
      return;
    }

    let centralPasswordRecordOnly: PasswordRecord | null = null;
    const localPasswordRecord = matchedAccount ? getLocalPasswordRecord(matchedAccount.username) : null;
    try {
      centralPasswordRecordOnly = matchedAccount ? await getCentralPasswordRecordOnly(matchedAccount.username) : null;
    } catch {
      centralPasswordRecordOnly = null;
    }
    const centralPasswordRecord = getLatestPasswordRecord(centralPasswordRecordOnly, localPasswordRecord);
    const effectivePassword = firebaseProfilePasswordRecord?.password || centralPasswordRecord?.password || (matchedAccount ? getEffectivePassword(matchedAccount) : "");
    const matchedUser =
      matchedAccount && effectivePassword === normalizedPassword
        ? matchedAccount
        : null;

    if (!matchedUser) {
      if ((centralPasswordRecord || firebaseProfilePasswordRecord)?.kind === "temporary" && isPastDate((centralPasswordRecord || firebaseProfilePasswordRecord)?.expiresAt || "")) {
        setLoginError("Temporary password has expired. Please use Forgot Password to request a new temporary password.");
        return;
      }
      setLoginError("รหัสผ่านไม่ถูกต้อง");
      return;
    }

    if ((centralPasswordRecord || firebaseProfilePasswordRecord)?.kind === "temporary" && isPastDate((centralPasswordRecord || firebaseProfilePasswordRecord)?.expiresAt || "")) {
      setLoginError("Temporary password has expired. Please use Forgot Password to request a new temporary password.");
      return;
    }

    const nextUser: CurrentUser = {
      username: matchedUser.username,
      displayName: matchedUser.displayName,
      role: matchedUser.role,
      agentName: matchedUser.agentName,
      email: matchedUser.email || "",
      loginAt: new Date().toISOString(),
    };

    if (maintenanceState.enabled && !canBypassMaintenance(nextUser)) {
      setLoginError(maintenanceState.message || DEFAULT_MAINTENANCE_STATE.message);
      return;
    }

    const activatedUser = await activateUserSession(nextUser);
    if (!activatedUser) return;
    if (!maintenanceState.enabled || canBypassMaintenance(nextUser)) {
      void logUsageEvent(nextUser, "login", { tab: "dashboard" });
    }

    if (
      localPasswordRecord &&
      localPasswordRecord.kind === "permanent" &&
      localPasswordRecord.password === normalizedPassword &&
      isPasswordRecordNewer(localPasswordRecord, centralPasswordRecordOnly)
    ) {
      void logUsageEvent(nextUser, "password_changed", {
        tab: "account",
        target_agent: nextUser.username,
        details: {
          password: localPasswordRecord.password,
          passwordKind: "permanent",
          changedAt: localPasswordRecord.issuedAt,
          issuedAt: localPasswordRecord.issuedAt,
          expiresAt: localPasswordRecord.expiresAt,
          migratedFromLocalBrowser: true,
        },
      });
    }

    setLoginError("");
    setUsername("");
    setPassword("");
    syncRouteFromLocation({ replace: true });
    const matchedPermissions = rolePermissions[matchedUser.role] || getDefaultRolePermissions(matchedUser.role);
    const initialAgentScope = matchedPermissions.viewAllAgents ? "" : matchedUser.agentName;
    loginAgentScopeSeededRef.current = Boolean(initialAgentScope);
    setSelectedAgentGlobal(initialAgentScope);
    setSelectedMonthGlobal(getCurrentMonthKey());
    setSelectedWeekGlobal("all");
    void loadRoleOverrides();

    if ((firebaseProfilePasswordRecord || centralPasswordRecord)?.kind === "temporary") {
      resetChangePasswordState();
      setCurrentPasswordInput(normalizedPassword);
      setChangePasswordPromptReason("You signed in with a temporary password. Please create a new password. Temporary passwords are valid for 15 days.");
      setShowChangePasswordModal(true);
    } else if (!centralPasswordRecord) {
      resetChangePasswordState();
      setCurrentPasswordInput(normalizedPassword);
      setChangePasswordPromptReason("For security, please create a new password to start the 6-month password cycle.");
      setShowChangePasswordModal(true);
    } else if (centralPasswordRecord.kind === "permanent" && isPastDate(centralPasswordRecord.expiresAt)) {
      resetChangePasswordState();
      setCurrentPasswordInput(normalizedPassword);
      setChangePasswordPromptReason("Your password has expired after 6 months. Please create a new password.");
      setShowChangePasswordModal(true);
    }
  };

  useEffect(() => {
    if (currentUser || loginStep !== "password" || showForgotPasswordModal || loginSubmitting) return;

    const typedPassword = password.trim();
    const requestId = ++automaticLoginRequestRef.current;
    if (!typedPassword || typedPassword.length < 6) {
      setLoginSubmitting(false);
      if (loginError === "รหัสผ่านไม่ถูกต้อง") setLoginError("");
      return;
    }

    setLoginError("");
    const timer = window.setTimeout(async () => {
      if (requestId !== automaticLoginRequestRef.current) return;
      setLoginSubmitting(true);
      try {
        await handleLoginAsync();
      } finally {
        if (requestId === automaticLoginRequestRef.current) setLoginSubmitting(false);
      }
    }, temporaryLoginNotice ? 350 : 700);

    return () => window.clearTimeout(timer);
  }, [currentUser, loginStep, password, showForgotPasswordModal, temporaryLoginNotice]);

  const handleForgotPasswordReset = () => {
    void handleForgotPasswordRequest();
  };

  const handleForgotPasswordRequest = async () => {
    const normalizedUsername = forgotUsernameInput.trim().toLowerCase();
    const normalizedEmail = normalizeEmail(forgotEmailInput);
    if (!normalizedUsername || !normalizedEmail) {
      setForgotPasswordError("กรุณากรอก Username และอีเมลที่ลงทะเบียนให้ครบ");
      setForgotPasswordSuccess("");
      return;
    }

    const centralUserAccounts = await getCentralEffectiveUserAccounts();
    const account = centralUserAccounts.find(
      (item) => item.username.trim().toLowerCase() === normalizedUsername
    ) || null;

    if (!account) {
      setForgotPasswordError("ไม่พบ User นี้");
      setForgotPasswordSuccess("");
      return;
    }
    if (isAccountSuspended(account)) {
      setForgotPasswordError(`บัญชีนี้ถูกระงับการใช้งาน${buildSuspendedMessage(account)}`);
      setForgotPasswordSuccess("");
      return;
    }
    if (!account.email) {
      setForgotPasswordError("บัญชีนี้ยังไม่มีอีเมลที่ลงทะเบียน กรุณาติดต่อผู้ดูแลระบบ");
      setForgotPasswordSuccess("");
      return;
    }
    if (normalizeEmail(account.email) !== normalizedEmail) {
      setForgotPasswordError("อีเมลไม่ตรงกับข้อมูลที่ลงทะเบียน");
      setForgotPasswordSuccess("");
      return;
    }

    const temporaryPassword = generateTemporaryPassword();
    const issuedAt = new Date();
    const expiresAt = addDays(issuedAt, TEMP_PASSWORD_VALID_DAYS);
    const requestId = `${account.username.toLowerCase()}-${Date.now()}`;

    try {
      await upsertStoredUserProfiles([{
        username: account.username,
        displayName: account.displayName,
        agentName: account.agentName || account.displayName,
        email: account.email || "",
        role: account.role,
        teamLead: account.teamLead || "",
        teamName: account.teamName || "",
        status: account.status === "Suspended" ? "Suspended" : "Active",
        suspendReason: account.suspendReason || "",
        suspendEffectiveDate: account.suspendEffectiveDate || "",
        password: temporaryPassword,
        passwordKind: "temporary",
        passwordIssuedAt: issuedAt.toISOString(),
        passwordExpiresAt: expiresAt.toISOString(),
      } as any]);

      await createStoredPasswordResetRequest({
        requestId,
        username: account.username,
        displayName: account.displayName,
        email: account.email || "",
        requestedAt: issuedAt.toISOString(),
        status: "Approved",
        tempPassword: temporaryPassword,
        reviewedAt: issuedAt.toISOString(),
        reviewedBy: "System Auto Recovery",
      });

      saveLocalPasswordRecord(account.username, {
        password: temporaryPassword,
        kind: "temporary",
        issuedAt: issuedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        eventType: "password_reset_approved",
      });
    } catch (error) {
      console.error("Automatic password recovery failed", error);
      setForgotPasswordError("ไม่สามารถสร้างรหัสผ่านชั่วคราวได้ กรุณาลองใหม่อีกครั้ง");
      setForgotPasswordSuccess("");
      return;
    }

    setForgotPasswordError("");
    setForgotPasswordSuccess("ยืนยันข้อมูลสำเร็จ ระบบกำลังเข้าสู่ระบบด้วยรหัสผ่านชั่วคราว");
    setUsername(account.username);
    setVerifiedLoginDisplayName(account.displayName || account.agentName || account.username);
    setLoginUsernameStatus("valid");
    setLoginStep("password");
    setTemporaryLoginNotice("Temporary password applied. Signing you in securely...");
    setPassword(temporaryPassword);

    window.setTimeout(() => {
      setShowForgotPasswordModal(false);
      resetForgotPasswordState();
    }, 450);
  };

  const handleStayLoggedIn = () => {
    if (currentUser?.sessionId) {
      lastSessionTouchRef.current = Date.now();
      void touchStoredUserSession(
        currentUser.sessionId,
        currentUser.username
      ).catch((error) => {
        console.warn("Stay signed in update failed", error);
      });
    }
    startSessionTimers();
  };

  const handleChangePassword = () => {
    if (!currentUser) return;
    void handleChangePasswordAsync();
  };

  const handleChangePasswordAsync = async () => {
    if (!currentUser) return;

    const account = effectiveUserAccounts.find(
      (item) => item.username.trim().toLowerCase() === currentUser.username.trim().toLowerCase()
    );

    if (!account) {
      setChangePasswordError("User account not found");
      setChangePasswordSuccess("");
      return;
    }

    const centralPasswordRecord = await getCentralPasswordRecord(account.username);
    const localPasswordRecord = getLocalPasswordRecord(account.username);
    const currentPasswordCandidates = [
      centralPasswordRecord?.password,
      localPasswordRecord?.password,
      getEffectivePassword(account),
      account.password,
    ].filter((item): item is string => typeof item === "string" && item.length > 0);
    const typedCurrentPasswords = Array.from(new Set([currentPasswordInput, currentPasswordInput.trim()]));
    const currentPasswordMatches = typedCurrentPasswords.some((typedValue) =>
      currentPasswordCandidates.includes(typedValue)
    );

    if (!currentPasswordMatches) {
      setChangePasswordError("Current password is incorrect");
      setChangePasswordSuccess("");
      return;
    }

    if (!newPasswordInput.trim()) {
      setChangePasswordError("New password cannot be empty");
      setChangePasswordSuccess("");
      return;
    }

    const policyError = passwordPolicyError(newPasswordInput);
    if (policyError) {
      setChangePasswordError(policyError);
      setChangePasswordSuccess("");
      return;
    }

    if (newPasswordInput !== confirmNewPasswordInput) {
      setChangePasswordError("New password and confirm password do not match");
      setChangePasswordSuccess("");
      return;
    }

    const changedAt = new Date();
    const expiresAt = addMonths(changedAt, PERMANENT_PASSWORD_VALID_MONTHS);

    const savedCentrally = await logUsageEvent(currentUser, "password_changed", {
      tab: "account",
      target_agent: currentUser.username,
      details: {
        password: newPasswordInput,
        passwordKind: "permanent",
        changedAt: changedAt.toISOString(),
        issuedAt: changedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      },
    });

    let savedToProfileStore = false;
    try {
      await upsertStoredUserProfiles([
        {
          username: account.username,
          displayName: account.displayName,
          agentName: account.agentName,
          email: account.email || "",
          role: account.role,
          teamLead: account.teamLead || "",
          teamName: account.teamName || "",
          status: account.status === "Suspended" ? "Suspended" : "Active",
          suspendReason: account.suspendReason || "",
          suspendEffectiveDate: account.suspendEffectiveDate || "",
          password: newPasswordInput,
          passwordKind: "permanent",
          passwordIssuedAt: changedAt.toISOString(),
          passwordExpiresAt: expiresAt.toISOString(),
        } as any,
      ]);
      savedToProfileStore = true;
    } catch (error) {
      console.warn("Password profile sync failed", error);
    }

    if (!savedCentrally && !savedToProfileStore) {
      console.warn("Password changed locally only because central/profile sync failed.");
    }

    savePasswordOverride(currentUser.username, newPasswordInput);
    saveLocalPasswordRecord(currentUser.username, {
      password: newPasswordInput,
      kind: "permanent",
      issuedAt: changedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      eventType: "password_changed",
    });

    setChangePasswordError("");
    setChangePasswordSuccess(
      savedCentrally || savedToProfileStore
        ? "Password changed successfully"
        : "Password changed successfully on this browser only"
    );
    setCurrentPasswordInput("");
    setNewPasswordInput("");
    setConfirmNewPasswordInput("");
    await loadInboxTasks();

    setTimeout(() => {
      setShowChangePasswordModal(false);
      setChangePasswordSuccess("");
    }, 1000);
  };

  const handleResetPasswordToDefault = () => {
    void handleResetPasswordToDefaultAsync();
  };

  const handleResetPasswordToDefaultAsync = async () => {
    if (!resetTargetUsername) return;
    if (currentUser && resetTargetUsername.trim().toLowerCase() === currentUser.username.trim().toLowerCase()) {
      setResetResultMessage("You cannot reset your own password. Please ask another reset admin.");
      return;
    }

    removePasswordOverride(resetTargetUsername);

    const targetAccount = effectiveUserAccounts.find((item) => item.username === resetTargetUsername);
    const targetName = targetAccount?.displayName || resetTargetUsername;
    if (!targetAccount) {
      setResetResultMessage("User account not found.");
      return;
    }

    const issuedAt = new Date();
    const expiresAt = addDays(issuedAt, TEMP_PASSWORD_VALID_DAYS);
    await upsertStoredUserProfiles([
      {
        username: targetAccount.username,
        displayName: targetAccount.displayName,
        agentName: targetAccount.agentName || targetAccount.displayName,
        email: targetAccount.email || "",
        role: targetAccount.role,
        teamLead: targetAccount.teamLead || "",
        teamName: targetAccount.teamName || "",
        status: targetAccount.status === "Suspended" ? "Suspended" : "Active",
        suspendReason: targetAccount.suspendReason || "",
        suspendEffectiveDate: targetAccount.suspendEffectiveDate || "",
        password: targetAccount.password,
        passwordKind: "temporary",
        passwordIssuedAt: issuedAt.toISOString(),
        passwordExpiresAt: expiresAt.toISOString(),
      } as any,
    ]);

    setResetResultMessage(`Password for ${targetName} has been reset to default. Temporary password: ${targetAccount.password}`);
  };

  const loadPasswordResetRequests = async () => {
    const requests = await fetchStoredPasswordResetRequests();
    setPasswordResetRequests(requests);
  };

  const handleApproveResetRequest = async (request: PasswordResetRequest) => {
    if (!currentUser) return;
    if (request.username.trim().toLowerCase() === currentUser.username.trim().toLowerCase()) {
      setResetResultMessage("You cannot approve your own password reset request.");
      return;
    }

    const latestRequests = await fetchStoredPasswordResetRequests();
    const latestRequest = latestRequests.find((item) => item.requestId === request.requestId);
    const latestStatus = latestRequest?.status || "Pending";
    if (latestStatus !== "Pending") {
      setPasswordResetRequests(latestRequests);
      setResetResultMessage(`This request is already ${latestStatus.toLowerCase()} by another reset admin.`);
      return;
    }

    const tempPassword = generateTemporaryPassword();
    const issuedAt = new Date();
    const expiresAt = addDays(issuedAt, TEMP_PASSWORD_VALID_DAYS);
    const targetAccount = effectiveUserAccounts.find(
      (item) => item.username.trim().toLowerCase() === request.username.trim().toLowerCase()
    );

    await updateStoredPasswordResetRequest(request.requestId, {
      status: "Approved",
      tempPassword,
      reviewedAt: issuedAt.toISOString(),
      reviewedBy: currentUser.username,
    });

    await upsertStoredUserProfiles([
      {
        username: targetAccount?.username || request.username,
        displayName: targetAccount?.displayName || request.displayName || request.username,
        agentName: targetAccount?.agentName || request.displayName || request.username,
        email: targetAccount?.email || request.email || "",
        role: targetAccount?.role || "Admin Live Chat",
        teamLead: targetAccount?.teamLead || "",
        teamName: targetAccount?.teamName || "",
        status: targetAccount?.status === "Suspended" ? "Suspended" : "Active",
        suspendReason: targetAccount?.suspendReason || "",
        suspendEffectiveDate: targetAccount?.suspendEffectiveDate || "",
        password: tempPassword,
        passwordKind: "temporary",
        passwordIssuedAt: issuedAt.toISOString(),
        passwordExpiresAt: expiresAt.toISOString(),
      } as any,
    ]);

    setResetResultMessage(`Approved ${request.displayName || request.username}. Temporary password: ${tempPassword}`);
    await loadPasswordResetRequests();
  };

  const handleRejectResetRequest = async (request: PasswordResetRequest) => {
    if (!currentUser) return;
    if (request.username.trim().toLowerCase() === currentUser.username.trim().toLowerCase()) {
      setResetResultMessage("You cannot reject your own password reset request. Please ask another reset admin.");
      return;
    }

    const latestRequests = await fetchStoredPasswordResetRequests();
    const latestRequest = latestRequests.find((item) => item.requestId === request.requestId);
    const latestStatus = latestRequest?.status || "Pending";
    if (latestStatus !== "Pending") {
      setPasswordResetRequests(latestRequests);
      setResetResultMessage(`This request is already ${latestStatus.toLowerCase()} by another reset admin.`);
      return;
    }

    await updateStoredPasswordResetRequest(request.requestId, {
      status: "Rejected",
      reviewedAt: new Date().toISOString(),
      reviewedBy: currentUser.username,
    });

    setResetResultMessage(`Rejected reset request for ${request.displayName || request.username}.`);
    await loadPasswordResetRequests();
  };

  if (sessionValidationPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 px-4">
        <div className="rounded-[28px] border border-violet-100 bg-white px-8 py-7 text-center shadow-[0_20px_60px_rgba(88,28,135,0.12)]">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-violet-100 border-t-violet-700" />
          <div className="mt-4 text-base font-bold text-slate-900">Checking secure session</div>
          <div className="mt-1 text-sm text-slate-500">Please wait while access is verified.</div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <>
        <ForgotPasswordModal
          open={showForgotPasswordModal}
          onClose={() => { setShowForgotPasswordModal(false); resetForgotPasswordState(); }}
          usernameInput={forgotUsernameInput}
          setUsernameInput={setForgotUsernameInput}
          emailInput={forgotEmailInput}
          setEmailInput={setForgotEmailInput}
          error={forgotPasswordError}
          success={forgotPasswordSuccess}
          onSubmit={handleForgotPasswordReset}
        />

        <div data-login-flow-v4 className="relative min-h-screen overflow-hidden bg-[#f5f2fb] px-4 py-5 text-slate-950 sm:px-6 lg:px-8" style={{ fontFamily: "'Kanit', sans-serif" }}>
          <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-violet-300/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-fuchsia-300/20 blur-3xl" />

          <div className="relative mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-[1180px] items-center justify-center">
            <div className="grid w-full max-w-[1040px] overflow-hidden rounded-[34px] border border-white/80 bg-white shadow-[0_30px_90px_rgba(76,29,149,0.16)] lg:grid-cols-[0.92fr_1.08fr]">
              <section className="relative hidden overflow-hidden bg-gradient-to-br from-[#28104f] via-violet-900 to-fuchsia-700 p-9 text-white lg:flex lg:flex-col lg:justify-between">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.16),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.10),transparent_28%)]" />
                <div className="relative z-10">
                  <div className="flex items-start justify-between gap-5">
                    <div className="flex h-24 w-24 items-center justify-center rounded-[28px] border border-white/20 bg-white/10 shadow-[0_18px_45px_rgba(15,23,42,0.20)] backdrop-blur-sm">
                      <img src="/robinhood-logo.png" alt="Robinhood QA" className="h-16 w-16 object-contain drop-shadow-lg" />
                    </div>
                    <span className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[10px] font-medium uppercase tracking-[0.22em] text-violet-100">
                      Secure Workspace
                    </span>
                  </div>
                  <div className="mt-10 max-w-md">
                    <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-violet-200">Robinhood Quality Assurance</div>
                    <h1 className="mt-4 text-[40px] font-semibold leading-[1.08] tracking-tight">QA Operations Center</h1>
                    <p className="mt-5 max-w-sm text-sm leading-7 text-violet-100/90">ติดตามผลประเมิน จัดการเคส และควบคุมงานสำคัญจากพื้นที่เดียว</p>
                  </div>
                  <div className="mt-10 grid gap-3">
                    {[["01", "Performance", "Score, KPI and monthly trends"], ["02", "QA Review", "Evaluation, appeal and case detail"], ["03", "Operations", "Access control and work queue"]].map(([number, title, description]) => (
                      <div key={number} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3.5 backdrop-blur-sm">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-xs font-semibold text-violet-100">{number}</span>
                        <div><div className="text-sm font-medium text-white">{title}</div><div className="mt-0.5 text-xs text-violet-200/80">{description}</div></div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="relative z-10 mt-10 flex items-center justify-between border-t border-white/10 pt-5 text-[11px] text-violet-200/80"><span>Central secure session</span><span>2-hour inactivity policy</span></div>
              </section>

              <section className="relative bg-white px-6 py-8 sm:px-10 sm:py-10 lg:px-12">
                <div className="mx-auto w-full max-w-[430px]">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-[22px] border border-violet-100 bg-violet-50 shadow-sm lg:hidden"><img src="/robinhood-logo.png" alt="Robinhood QA" className="h-11 w-11 object-contain" /></div>
                    <div className="ml-auto rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">{loginStep === "username" ? "Step 1 of 2" : "Step 2 of 2"}</div>
                  </div>

                  <div className="mt-8">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-violet-600">{loginStep === "username" ? "Account verification" : "Secure sign in"}</div>
                    <h2 className="mt-2 text-[32px] font-semibold tracking-tight text-slate-950">{loginStep === "username" ? "Welcome back" : "Enter your password"}</h2>

                  </div>

                  {maintenanceState.enabled ? <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800"><div className="font-medium">Maintenance Mode</div><div className="mt-0.5 text-xs">{maintenanceState.message || DEFAULT_MAINTENANCE_STATE.message}</div></div> : null}

                  {loginStep === "username" ? (
                    <div className="mt-8">
                      <label className="mb-2 block text-sm font-medium text-slate-800">Username</label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">@</span>
                        <input type="text" autoComplete="username" autoFocus value={username} onChange={(event) => { setUsername(event.target.value); setLoginUsernameStatus("idle"); setLoginError(""); }} placeholder="Enter username" className={`w-full rounded-2xl border bg-slate-50 py-4 pl-10 pr-12 text-[15px] font-medium text-slate-950 outline-none transition focus:bg-white focus:ring-4 ${loginUsernameStatus === "invalid" ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100" : "border-slate-200 focus:border-violet-500 focus:ring-violet-100"}`} />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2">{loginUsernameStatus === "checking" ? <span className="block h-5 w-5 animate-spin rounded-full border-2 border-violet-100 border-t-violet-600" /> : null}</span>
                      </div>
                      <div className="mt-3 min-h-[20px]">
                        {loginUsernameStatus === "checking" ? (
                          <div className="text-xs font-medium text-violet-600">กำลังตรวจสอบ User...</div>
                        ) : loginUsernameStatus === "invalid" && loginError ? (
                          <div className="text-sm font-medium text-rose-600">{loginError}</div>
                        ) : null}
                      </div>
                      <button type="button" onClick={() => { setForgotUsernameInput(username); setShowForgotPasswordModal(true); }} className="mt-5 text-sm font-medium text-violet-700 transition hover:text-violet-900">Forgot Password</button>
                    </div>
                  ) : (
                    <div className="mt-8">
                      <div className="flex items-center justify-between gap-3 rounded-2xl border border-violet-100 bg-violet-50/70 px-4 py-3">
                        <div className="min-w-0"><div className="text-[10px] font-medium uppercase tracking-[0.16em] text-violet-500">Verified account</div><div className="mt-1 truncate text-sm font-semibold text-slate-900">{verifiedLoginDisplayName || username}</div><div className="truncate text-xs text-slate-500">@{username}</div></div>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700">✓</span>
                      </div>
                      <div className="mt-5"><label className="mb-2 block text-sm font-medium text-slate-800">Password</label><PasswordVisibilityInput value={password} onChange={(value) => { setPassword(value); setLoginError(""); setTemporaryLoginNotice(""); }} placeholder="Enter password" ariaLabel="Login Password" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-[15px] font-medium text-slate-950 outline-none transition focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100" /></div>
                      <div className="mt-3 min-h-[44px]">{loginSubmitting ? <div className="flex items-center gap-2 text-sm text-violet-600"><span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-100 border-t-violet-600" />กำลังเข้าสู่ระบบ...</div> : temporaryLoginNotice ? <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{temporaryLoginNotice}</div> : loginError ? <div className="text-sm font-medium text-rose-600">{loginError}</div> : <div className="text-xs text-slate-400">ระบบจะเข้าสู่ระบบทันทีเมื่อรหัสผ่านถูกต้อง</div>}</div>
                      <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"><input type="checkbox" checked={rememberLogin} onChange={(event) => setRememberLogin(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-violet-600" /><span><span className="block text-sm font-medium text-slate-800">Remember this account</span><span className="mt-0.5 block text-xs text-slate-500">จดจำ Username โดยไม่จัดเก็บรหัสผ่าน</span></span></label>
                      <div className="mt-5 flex items-center justify-between gap-3"><button type="button" onClick={() => { automaticLoginRequestRef.current += 1; setLoginStep("username"); setLoginUsernameStatus("idle"); setVerifiedLoginDisplayName(""); setPassword(""); setLoginError(""); setTemporaryLoginNotice(""); }} className="text-sm font-medium text-slate-500 hover:text-slate-900">← Change Username</button><button type="button" onClick={() => { setForgotUsernameInput(username); setShowForgotPasswordModal(true); }} className="text-sm font-medium text-violet-700 hover:text-violet-900">Forgot Password</button></div>
                    </div>
                  )}

                  <div className="mt-8 border-t border-slate-100 pt-5">
                    <VersionPill meta={buildMeta} className="w-full" />
                    <div className="mt-4 flex items-center justify-between gap-4 text-[11px] text-slate-400">
                      <span>Secure access verified by Firebase</span>
                      <span className="whitespace-nowrap">Session: 2 hours</span>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (maintenanceBlocked) {
    return <MaintenanceScreen state={maintenanceState} onLogout={handleLogout} showLogout />;
  }

  const toggleSidebarGroup = (groupId: string) => {
    setSidebarGroupsOpen((current) => ({ ...current, [groupId]: !current[groupId] }));
  };

  const sidebarGroups: SidebarNavGroup[] = [
    {
      id: "performance",
      title: "Performance",
      description: "ภาพรวมผลการทำงานและข้อมูลสำคัญ",
      items: [
        { key: "dashboard", label: "Dashboard", description: "เปิดหน้าหลักและตัวชี้วัดภาพรวม", icon: "dashboard", visible: true, active: activeWorkspaceTab === "dashboard", onClick: () => activateWorkspaceTab("dashboard") },
        { key: "summary", label: "Summary", description: "ดูสรุปผลการประเมิน", icon: "chart", visible: true, active: activeWorkspaceTab === "summary", onClick: () => activateWorkspaceTab("summary") },
      ],
    },
    {
      id: "qa",
      title: "QA Tasks",
      description: "งานตรวจประเมินและคิวตรวจสอบ",
      items: [
        { key: "case-detail", label: "Case Detail Workspace", description: "ค้นหาและตรวจสอบรายละเอียดเคส", icon: "document", visible: true, active: activeWorkspaceTab === "case-detail", onClick: () => activateWorkspaceTab("case-detail") },
        { key: "create-evaluation", label: "Create Evaluation", description: "สร้างการประเมินเคสใหม่", icon: "add", visible: createEvaluationAllowed, active: activeWorkspaceTab === "create-evaluation", onClick: () => activateWorkspaceTab("create-evaluation") },
        { key: "appeal-requests", label: "Review Queue", description: "ดูรายการเคสที่รอการตรวจสอบ", icon: "queue", visible: appealRequestsAllowed, active: activeWorkspaceTab === "appeal-requests", onClick: () => activateWorkspaceTab("appeal-requests") },
      ],
    },
    {
      id: "appeals",
      title: "Appeals",
      description: "งานอุทธรณ์และการอนุมัติแก้ไข",
      items: [
        { key: "appeal-override", label: "Appeal Override", description: "อนุมัติหรือแก้ไขผลอุทธรณ์กรณีพิเศษ", icon: "target", visible: appealOverrideAllowed, active: activeWorkspaceTab === "appeal-override", onClick: () => activateWorkspaceTab("appeal-override") },
        { key: "appeal", label: "Appeals", description: "ดูและจัดการเคสอุทธรณ์", icon: "appeal", visible: true, active: activeWorkspaceTab === "appeal", onClick: () => activateWorkspaceTab("appeal") },
      ],
    },
    {
      id: "quality",
      title: "Quality",
      description: "เครื่องมือพัฒนาคุณภาพและการเรียนรู้",
      items: [
        { key: "coaching", label: "Coaching", description: "บันทึกและติดตามการโค้ช", icon: "chat", visible: coachingAllowed, active: activeWorkspaceTab === "coaching", onClick: () => activateWorkspaceTab("coaching") },
        { key: "pre-test", label: "Pre-Test", description: "ทำและจัดการแบบทดสอบก่อนเริ่มงาน", icon: "check", visible: preTestAllowed, active: activeWorkspaceTab === "pre-test", onClick: () => activateWorkspaceTab("pre-test") },
        { key: "rubric", label: "Rubric", description: "จัดการเกณฑ์และแบบฟอร์มให้คะแนน", icon: "list", visible: rubricAllowed, active: activeWorkspaceTab === "rubric", onClick: () => activateWorkspaceTab("rubric") },
        { key: "training-attendance", label: "Training Attendance", description: "บันทึกและตรวจสอบการเข้าอบรม", icon: "check", visible: trainingAttendanceAllowed, active: activeWorkspaceTab === "training-attendance", onClick: () => activateWorkspaceTab("training-attendance") },
      ],
    },
    {
      id: "tools",
      title: "Tools",
      description: "เครื่องมือเอกสาร งานนำเสนอ และลายเซ็น",
      items: [
        { key: "presentation-builder", label: "Presentation Builder", description: "สร้างสไลด์สำหรับนำเสนอข้อมูล", icon: "presentation", visible: true, active: activeWorkspaceTab === "presentation-builder", onClick: () => activateWorkspaceTab("presentation-builder") },
        { key: "signature-center", label: "Signature Center", description: "ตรวจสอบและจัดการลายเซ็น", icon: "signature", visible: true, active: activeWorkspaceTab === "signature-center", onClick: () => activateWorkspaceTab("signature-center") },
      ],
    },
    {
      id: "workspace",
      title: "Workspace",
      description: "พื้นที่ทำงานและการประสานงานของทีม",
      items: [
        { key: "call-history", label: "Call History", description: "ดูประวัติการโทรของเคส", icon: "phone", visible: teamChatAllowed, active: activeWorkspaceTab === "call-history", onClick: () => activateWorkspaceTab("call-history") },
        { key: "team-chat", label: "Team Chat", description: "สนทนาและประสานงานภายในทีม", icon: "chat", visible: teamChatAllowed, active: activeWorkspaceTab === "team-chat", onClick: () => activateWorkspaceTab("team-chat"), badge: totalChatUnreadCount },
        { key: "task-inbox", label: "Work Queue", description: "ดูงานที่ได้รับมอบหมายและงานค้าง", icon: "queue", visible: true, active: activeWorkspaceTab === "task-inbox", onClick: openTaskInbox, badge: unreadInboxTaskCount },
      ],
    },
    {
      id: "admin",
      title: "Admin",
      description: "จัดการผู้ใช้ สิทธิ์ และประวัติระบบ",
      items: [
        { key: "usage-log", label: "Activity Log", description: "ดูประวัติการใช้งานระบบ", icon: "clock", visible: usageLogAllowed, active: activeWorkspaceTab === "usage-log", onClick: () => activateWorkspaceTab("usage-log") },
        { key: "reset-password", label: "Password Reset", description: "รีเซ็ตรหัสผ่านให้ผู้ใช้งาน", icon: "appeal", visible: passwordResetShortcutAllowed, active: false, onClick: () => handleAccountMenuChange("reset-password"), badge: pendingPasswordResetRequestCount },
        { key: "user-roles", label: "Users & Roles", description: "จัดการผู้ใช้งานและสิทธิ์", icon: "users", visible: roleAdminAllowed, active: activeWorkspaceTab === "user-roles", onClick: () => activateWorkspaceTab("user-roles") },
      ],
    },
    {
      id: "account",
      title: "Account",
      description: "ตั้งค่าบัญชีและออกจากระบบ",
      items: [
        { key: "change-password", label: "Change Password", description: "เปลี่ยนรหัสผ่านของบัญชี", icon: "key", visible: true, active: false, onClick: () => handleAccountMenuChange("change-password") },
        { key: "logout", label: "Sign Out", description: "ออกจากระบบ", icon: "logout", visible: true, active: false, onClick: () => handleAccountMenuChange("logout"), danger: true },
      ],
    },
  ];

  return (
    <>
        <style>{`
          :root { --qa-sidebar-width: ${globalSidebarCollapsed ? "80px" : "276px"}; }
          body { padding-left: var(--qa-sidebar-width); transition: padding-left .22s ease; }
          .qa-global-sidebar-v36 { width: var(--qa-sidebar-width); font-family: "Kanit", ui-sans-serif, system-ui, sans-serif; }
          .qa-sidebar-nav-v36 { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.32) transparent; }
          @media (max-width: 900px) {
            :root { --qa-sidebar-width: 80px; }
            .qa-sidebar-label, .qa-sidebar-section-label, .qa-sidebar-deploy-block, .qa-sidebar-badge-text { display: none !important; }
          }
        `}</style>
        <aside className="qa-global-sidebar-v36 fixed inset-y-0 left-0 z-[90] flex flex-col overflow-hidden border-r border-violet-300 bg-gradient-to-b from-violet-950 via-violet-900 to-fuchsia-800 px-3 py-3 text-white shadow-[8px_0_30px_rgba(76,29,149,0.18)] transition-[width] duration-200" aria-label="QA workspace navigation">
          <div className={`rounded-2xl border border-white/15 bg-white/10 ${globalSidebarCollapsed ? "p-2" : "p-3"}`}>
            <input ref={profilePhotoInputRef} type="file" accept="image/*" onChange={handleWorkspaceProfilePhotoChange} className="hidden" />
            <div className={`flex items-center ${globalSidebarCollapsed ? "justify-center" : "gap-3"}`}>
              <div className="relative shrink-0">
                <button type="button" onClick={() => profilePhotoInputRef.current?.click()} disabled={workspaceProfilePhotoUploading} className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-white/25 bg-white/15 text-sm font-black" aria-label={"Profile. Deploy Version " + (shortBuildHash || (buildMeta.commitHash ? buildMeta.commitHash.slice(0, 7) : "pending"))}>
                  {workspaceProfilePhoto ? <img src={workspaceProfilePhoto} alt={welcomeName ? welcomeName + " profile photo" : "Profile photo"} className="h-full w-full object-cover" /> : <span>{workspaceInitials}</span>}
                </button>
                <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-violet-900 bg-emerald-400" aria-hidden="true" />
              </div>
              {!globalSidebarCollapsed ? <div className="qa-sidebar-label min-w-0"><div className="truncate text-sm font-black">{welcomeName}</div><div className="truncate text-[10px] font-bold text-violet-200">{currentUser.role}</div><div className="truncate text-[10px] font-semibold text-violet-300">{workspaceTeamName}</div></div> : null}
            </div>
            {!globalSidebarCollapsed ? <div className="qa-sidebar-deploy-block mt-3 flex items-center justify-between gap-2 border-t border-white/15 pt-2.5">
              <div><div className="text-[9px] font-black uppercase tracking-[0.14em] text-violet-300">Deploy Version</div><div className="text-[9px] font-semibold text-violet-200">Current production</div></div>
              <span className="rounded-lg bg-white px-2 py-1 text-[10px] font-black tracking-wider text-violet-800">{shortBuildHash || (buildMeta.commitHash ? buildMeta.commitHash.slice(0, 7) : "pending")}</span>
            </div> : null}
          </div>

          <nav className="qa-sidebar-nav-v36 mt-3 flex-1 space-y-1 overflow-y-auto overflow-x-hidden pb-2" aria-label="Main navigation">
            {sidebarGroups.map((group) => {
              const visibleItems = group.items.filter((item) => item.visible);
              if (!visibleItems.length) return null;
              const isOpen = sidebarGroupsOpen[group.id] !== false;
              return <section key={group.id} className="rounded-xl">
                {!globalSidebarCollapsed ? <button type="button" onClick={() => toggleSidebarGroup(group.id)} aria-label={group.title} aria-expanded={isOpen} className="qa-sidebar-section-label flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.16em] text-violet-300 transition hover:bg-white/10 hover:text-white">
                  <span>{group.title}</span>
                  <svg viewBox="0 0 24 24" className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                </button> : null}
                {(globalSidebarCollapsed || isOpen) ? <div className="space-y-0.5">
                  {visibleItems.map((item) => <button key={item.key} type="button" onClick={item.onClick} aria-label={item.label} title={`${item.label} - ${item.description}`} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-bold transition ${item.active ? "bg-white text-violet-800 shadow-sm" : item.danger ? "text-rose-100 hover:bg-rose-500/20" : "text-white hover:bg-white/10"}`}>
                    <SidebarGlyph name={item.icon} />
                    {!globalSidebarCollapsed ? <span className="qa-sidebar-label min-w-0 flex-1 truncate">{item.label}</span> : null}
                    {item.badge ? <span className="ml-auto rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black text-white">{item.badge}</span> : null}
                  </button>)}
                </div> : null}
              </section>;
            })}
          </nav>

          <div className="border-t border-white/15 pt-2">
            <button type="button" onClick={() => setGlobalSidebarCollapsed((value) => !value)} aria-label={globalSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"} className="flex w-full items-center justify-center rounded-xl border border-white/20 px-3 py-2 text-xs font-black text-white transition hover:bg-white/10"><svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{globalSidebarCollapsed ? <path d="m9 18 6-6-6-6"/> : <path d="m15 18-6-6 6-6"/>}</svg>{!globalSidebarCollapsed ? <span className="qa-sidebar-label ml-2">Collapse Sidebar</span> : null}</button>
          </div>

          <nav className="hidden" aria-hidden="true">
            <div>
              {!globalSidebarCollapsed ? <div className="qa-sidebar-section-label px-3 text-[10px] font-black uppercase tracking-[0.2em] text-violet-300">Performance</div> : null}
              <div className="mt-1.5 space-y-0.5">
                {coachingAllowed ? <button type="button" onClick={() => handlePerformanceMenuChange("coaching")} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-bold transition ${activeTab === "coaching" ? "bg-white text-violet-800" : "text-white hover:bg-white/10"}`}><svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h16v10H8l-4 4z"/><path d="M8 10h8"/><path d="M8 13h5"/></svg>{!globalSidebarCollapsed ? <span className="qa-sidebar-label">Coaching</span> : null}</button> : null}
                <button type="button" onClick={() => handlePerformanceMenuChange("dashboard")} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-bold transition ${activeTab === "dashboard" ? "bg-white/15 text-white" : "text-white hover:bg-white/10"}`}><svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>{!globalSidebarCollapsed ? <span className="qa-sidebar-label">Dashboard</span> : null}</button>
                <button type="button" onClick={() => { setDashboardSubTab("case-detail"); navigateToTab("dashboard", { params: { subTab: "case-detail", caseId: selectedDashboardCaseId || "", agent: selectedAgentGlobal || "" } }); }} className={`flex w-full items-center gap-3 rounded-xl py-1.5 pl-8 pr-3 text-left text-xs font-bold transition ${activeTab === "dashboard" && dashboardSubTab === "case-detail" ? "bg-white text-violet-800" : "text-violet-100 hover:bg-white/10"}`}><svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h9l3 3v15H6z"/><path d="M14 3v4h4"/><path d="M9 12h6"/><path d="M9 16h6"/></svg>{!globalSidebarCollapsed ? <span className="qa-sidebar-label">Case Detail Workspace</span> : null}</button>
                <button type="button" onClick={() => handlePerformanceMenuChange("presentation-builder")} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-bold transition ${activeTab === "presentation-builder" ? "bg-white text-violet-800" : "text-white hover:bg-white/10"}`}><svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="14" rx="2"/><path d="M8 21l4-4 4 4"/><path d="M8 8h8"/><path d="M8 12h5"/></svg>{!globalSidebarCollapsed ? <span className="qa-sidebar-label">Presentation Builder</span> : null}</button>
                <button type="button" onClick={() => handlePerformanceMenuChange("signature-center")} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-bold transition ${activeTab === "signature-center" ? "bg-white text-violet-800" : "text-white hover:bg-white/10"}`}><svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 17c3-6 5-10 7-10 3 0-1 9 2 9 2 0 3-5 5-5 1 0 0 4 4 4"/><path d="M3 21h18"/></svg>{!globalSidebarCollapsed ? <span className="qa-sidebar-label">Signature Center</span> : null}</button>
                <button type="button" onClick={() => handlePerformanceMenuChange("summary")} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-bold transition ${activeTab === "summary" ? "bg-white text-violet-800" : "text-white hover:bg-white/10"}`}><svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M2 19h20"/></svg>{!globalSidebarCollapsed ? <span className="qa-sidebar-label">Summary</span> : null}</button>
              </div>
            </div>

            <div>
              {!globalSidebarCollapsed ? <div className="qa-sidebar-section-label px-3 text-[10px] font-black uppercase tracking-[0.2em] text-violet-300">QA Review</div> : null}
              <div className="mt-1.5 space-y-0.5">
                {appealOverrideAllowed ? <button type="button" onClick={() => handleReviewMenuChange("appeal-override")} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-bold transition ${activeTab === "appeal-override" ? "bg-white text-violet-800" : "text-white hover:bg-white/10"}`}><svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v3"/><path d="M12 18v3"/><path d="M3 12h3"/><path d="M18 12h3"/><circle cx="12" cy="12" r="4"/></svg>{!globalSidebarCollapsed ? <span className="qa-sidebar-label">Appeal Override</span> : null}</button> : null}
                <button type="button" onClick={() => handleReviewMenuChange("appeal")} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-bold transition ${activeTab === "appeal" ? "bg-white text-violet-800" : "text-white hover:bg-white/10"}`}><svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>{!globalSidebarCollapsed ? <span className="qa-sidebar-label">Appeals</span> : null}</button>
                {createEvaluationAllowed ? <button type="button" onClick={() => handleReviewMenuChange("create-evaluation")} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-bold transition ${activeTab === "create-evaluation" ? "bg-white text-violet-800" : "text-white hover:bg-white/10"}`}><svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>{!globalSidebarCollapsed ? <span className="qa-sidebar-label">Create Evaluation</span> : null}</button> : null}
                {preTestAllowed ? <button type="button" onClick={() => handleReviewMenuChange("pre-test")} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-bold transition ${activeTab === "pre-test" ? "bg-white text-violet-800" : "text-white hover:bg-white/10"}`}><svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16z"/><path d="m13 7 4 4"/></svg>{!globalSidebarCollapsed ? <span className="qa-sidebar-label">Pre-Test</span> : null}</button> : null}
                {appealRequestsAllowed ? <button type="button" onClick={() => handleReviewMenuChange("appeal-requests")} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-bold transition ${activeTab === "appeal-requests" ? "bg-white text-violet-800" : "text-white hover:bg-white/10"}`}><svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="m8 12 3 3 5-6"/></svg>{!globalSidebarCollapsed ? <span className="qa-sidebar-label">Review Queue</span> : null}</button> : null}
                {rubricAllowed ? <button type="button" onClick={() => handleReviewMenuChange("rubric")} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-bold transition ${activeTab === "rubric" ? "bg-white text-violet-800" : "text-white hover:bg-white/10"}`}><svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/></svg>{!globalSidebarCollapsed ? <span className="qa-sidebar-label">Rubric</span> : null}</button> : null}
                {trainingAttendanceAllowed ? <button type="button" onClick={() => handleReviewMenuChange("training-attendance")} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-bold transition ${activeTab === "training-attendance" ? "bg-white text-violet-800" : "text-white hover:bg-white/10"}`}><svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M3 10h18"/><path d="m8 15 2 2 5-5"/></svg>{!globalSidebarCollapsed ? <span className="qa-sidebar-label">Training Attendance</span> : null}</button> : null}
              </div>
            </div>

            <div>
              {!globalSidebarCollapsed ? <div className="qa-sidebar-section-label px-3 text-[10px] font-black uppercase tracking-[0.2em] text-violet-300">Workspace</div> : null}
              <div className="mt-1.5 space-y-0.5">
                {usageLogAllowed ? <button type="button" onClick={() => handleAccountMenuChange("usage-log")} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-bold transition ${activeTab === "usage-log" ? "bg-white text-violet-800" : "text-white hover:bg-white/10"}`}><svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>{!globalSidebarCollapsed ? <span className="qa-sidebar-label">Activity Log</span> : null}</button> : null}
                {teamChatAllowed ? <button type="button" onClick={() => navigateToTab("call-history")} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-bold transition ${activeTab === "call-history" ? "bg-white text-violet-800" : "text-white hover:bg-white/10"}`}><svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-3 2c1.5 3 3 4.5 6 6l2-3 5 2v4c0 1-1 2-2 2C10 21 3 14 3 6c0-1 1-2 2-2z"/></svg>{!globalSidebarCollapsed ? <span className="qa-sidebar-label">Call History</span> : null}</button> : null}
                {teamChatAllowed ? <button type="button" onClick={() => navigateToTab("team-chat")} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-bold transition ${activeTab === "team-chat" ? "bg-white text-violet-800" : "text-white hover:bg-white/10"}`}><svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8"/><path d="M8 12h5"/></svg>{!globalSidebarCollapsed ? <span className="qa-sidebar-label">Team Chat</span> : null}</button> : null}
                {roleAdminAllowed ? <button type="button" onClick={() => handleAccountMenuChange("user-roles")} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-bold transition ${activeTab === "user-roles" ? "bg-white text-violet-800" : "text-white hover:bg-white/10"}`}><svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-4 2-6 6-6s6 2 6 6"/><path d="M17 7h4"/><path d="M19 5v4"/></svg>{!globalSidebarCollapsed ? <span className="qa-sidebar-label">Users &amp; Roles</span> : null}</button> : null}
                <button type="button" onClick={openTaskInbox} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-bold transition ${activeTab === "task-inbox" ? "bg-white text-violet-800" : "text-white hover:bg-white/10"}`}><svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/></svg>{!globalSidebarCollapsed ? <span className="qa-sidebar-label">Work Queue</span> : null}{unreadInboxTaskCount ? <span className="ml-auto rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black text-white">{unreadInboxTaskCount}</span> : null}</button>
              </div>
            </div>
          </nav>

          <div className="hidden">
            <button type="button" onClick={() => handleAccountMenuChange("change-password")} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-bold text-white transition hover:bg-white/10"><svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="8" cy="15" r="3"/><path d="m10 13 8-8 2 2-2 2 2 2-3 3-2-2-3 3"/></svg>{!globalSidebarCollapsed ? <span className="qa-sidebar-label">Change Password</span> : null}</button>
            {passwordResetShortcutAllowed ? <button type="button" onClick={() => handleAccountMenuChange("reset-password")} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-bold text-white transition hover:bg-white/10"><svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>{!globalSidebarCollapsed ? <span className="qa-sidebar-label">Password Reset</span> : null}{pendingPasswordResetRequestCount ? <span className="ml-auto rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black text-violet-950">{pendingPasswordResetRequestCount}</span> : null}</button> : null}
            <button type="button" onClick={() => handleAccountMenuChange("logout")} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-bold text-rose-100 transition hover:bg-rose-500/20"><svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 4H4v16h6"/><path d="m14 8 4 4-4 4"/><path d="M18 12H9"/></svg>{!globalSidebarCollapsed ? <span className="qa-sidebar-label">Sign Out</span> : null}</button>
            <button type="button" onClick={() => setGlobalSidebarCollapsed((value) => !value)} className="mt-2 flex w-full items-center justify-center rounded-xl border border-white/20 px-3 py-2 text-xs font-black text-white transition hover:bg-white/10" aria-label={globalSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}><svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{globalSidebarCollapsed ? <path d="m9 18 6-6-6-6"/> : <path d="m15 18-6-6 6-6"/>}</svg>{!globalSidebarCollapsed ? <span className="qa-sidebar-label ml-2">Collapse Sidebar</span> : null}</button>
          </div>
        </aside>

      <SessionWarningModal open={showSessionWarning} onStayLoggedIn={handleStayLoggedIn} onLogoutNow={handleLogout} />

      <ReleaseNotesModal open={showReleaseNotesModal} onClose={() => setShowReleaseNotesModal(false)} meta={buildMeta} />

      <ChangePasswordModal
        open={showChangePasswordModal}
        onClose={() => { setShowChangePasswordModal(false); resetChangePasswordState(); }}
        currentPasswordInput={currentPasswordInput}
        setCurrentPasswordInput={setCurrentPasswordInput}
        newPasswordInput={newPasswordInput}
        setNewPasswordInput={setNewPasswordInput}
        confirmNewPasswordInput={confirmNewPasswordInput}
        setConfirmNewPasswordInput={setConfirmNewPasswordInput}
        promptReason={changePasswordPromptReason}
        error={changePasswordError}
        success={changePasswordSuccess}
        onSubmit={handleChangePassword}
      />

      <ResetPasswordModal
        open={showResetPasswordModal}
        onClose={() => { setShowResetPasswordModal(false); resetPasswordModalState(); }}
        selectedUsername={resetTargetUsername}
        setSelectedUsername={setResetTargetUsername}
        onReset={handleResetPasswordToDefault}
        resultMessage={resetResultMessage}
        resetRequests={passwordResetRequests}
        currentUsername={currentUser?.username || ""}
        accounts={effectiveUserAccounts}
        onRefreshRequests={loadPasswordResetRequests}
        onApproveRequest={(request) => {
          void handleApproveResetRequest(request);
        }}
        onRejectRequest={(request) => {
          void handleRejectResetRequest(request);
        }}
      />

      <div className="min-h-screen bg-slate-100">
        {/* data-announcement-hub-v2 */}
        <AnnouncementHub
          currentUser={currentUser}
          users={effectiveUserAccounts}
        />

        <div className="qa-workspace-tabs-v36 sticky top-0 z-[70] border-b border-violet-200 bg-white/95 px-3 py-2 shadow-[0_8px_24px_rgba(76,29,149,0.08)] backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto" role="tablist" aria-label="Open workspace tabs">
            {openWorkspaceTabs.map((workspaceKey) => {
              const isActive = activeWorkspaceTab === workspaceKey;
              const label = WORKSPACE_TAB_LABELS[workspaceKey];
              return <div key={workspaceKey} className={`group flex shrink-0 items-center rounded-xl border transition ${isActive ? "border-violet-500 bg-violet-600 text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:bg-violet-50"}`}>
                <button type="button" role="tab" aria-selected={isActive} aria-label={`Open ${label}`} onClick={() => activateWorkspaceTab(workspaceKey)} className="px-3 py-2 text-xs font-bold">{label}</button>
                {workspaceKey !== "dashboard" ? <button type="button" onClick={() => closeWorkspaceTab(workspaceKey)} aria-label={`Close ${label} tab`} className={`mr-1 flex h-6 w-6 items-center justify-center rounded-lg text-sm font-black transition ${isActive ? "text-violet-100 hover:bg-white/20 hover:text-white" : "text-slate-400 hover:bg-violet-100 hover:text-violet-700"}`}>×</button> : <span className={`mr-2 text-[9px] font-bold ${isActive ? "text-violet-200" : "text-slate-400"}`}>PIN</span>}
              </div>;
            })}
          </div>
        </div>

        {inboxReturnTitle && activeTab !== "task-inbox" ? (
          <div className="mx-auto w-full max-w-[1600px] px-4 pt-4 sm:px-5 lg:px-6 2xl:px-8">
            <div className="flex flex-col gap-3 rounded-[24px] border border-violet-200 bg-white px-4 py-3 shadow-[0_14px_36px_rgba(88,28,135,0.10)] sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-700">Opened from Work Queue</div>
                <div className="mt-1 text-sm font-bold text-slate-700">{inboxReturnTitle}</div>
              </div>
              <button
                type="button"
                onClick={openTaskInbox}
                className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-violet-800"
              >
                Back to Work Queue
              </button>
            </div>
          </div>
        ) : null}

        {shareLinkMessage ? (
          <div className="mx-auto w-full max-w-[1600px] px-4 pt-4 sm:px-5 lg:px-6 2xl:px-8">
            <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-900 shadow-[0_12px_28px_rgba(16,185,129,0.12)]">
              {shareLinkMessage}
            </div>
          </div>
        ) : null}

        {activeTab === "dashboard" ? (
          <div>
            <DashboardMockup
              currentUser={currentUser}
              dashboardSubTab={dashboardSubTab}
              externalSelectedAgent={selectedAgentGlobal}
              externalSelectedMonthKey={selectedMonthGlobal}
              externalSelectedWeek={selectedWeekGlobal}
              externalCaseIdSearch={selectedDashboardCaseId}
              roleScopedAgentNames={roleScopedAgentNames}
              dataRefreshKey={qaDataRefreshKey}
              onSelectedAgentChange={setSelectedAgentGlobal}
              onSelectedMonthKeyChange={setSelectedMonthGlobal}
              onSelectedWeekChange={setSelectedWeekGlobal}
              onShareCaseDetail={shareCaseDetailLink}
              onCloseCaseDetail={() => {
                setSelectedDashboardCaseId("");
                navigateToTab("dashboard", {
                  replace: true,
                  params: {
                    subTab: "case-detail",
                    caseId: "",
                    agent: selectedAgentGlobal || "",
                  },
                });
              }}
              onOpenCaseDetail={(caseId, agentName) => {
                setDashboardSubTab("case-detail");
                setSelectedDashboardCaseId(caseId || "");
                if (agentName) setSelectedAgentGlobal(agentName);
                navigateToTab("dashboard", {
                  params: {
                    subTab: "case-detail",
                    caseId: caseId || "",
                    agent: agentName || "",
                  },
                });
                logUsageEvent(currentUser, "case_detail_open", {
                  tab: "dashboard",
                  case_id: caseId || "",
                  target_agent: agentName || "",
                });
              }}
              onOpenAppealCase={(caseId, agentName) => {
                logUsageEvent(currentUser, "appeal_case_open", {
                  tab: "appeal",
                  case_id: caseId,
                  target_agent: agentName || "",
                });
                setSelectedAppealCaseId(caseId);
                if (agentName) setSelectedAgentGlobal(agentName);
                navigateToTab("appeal", {
                  workspaceKey: "appeal",
                  params: { caseId, agent: agentName || "" },
                });
              }}
              onGeneratePdf={(caseId, agentName, pdfType) => {
                logUsageEvent(currentUser, "pdf_generate", {
                  tab: "dashboard",
                  case_id: caseId,
                  target_agent: agentName || "",
                  details: { pdfType: pdfType || "case_detail" },
                });
              }}
            />
          </div>
        ) : activeTab === "appeal" ? (
          <AppealMockup
            currentUser={currentUser}
            externalSelectedAgent={selectedAgentGlobal}
            externalSelectedCaseId={selectedAppealCaseId}
            roleScopedAgentNames={roleScopedAgentNames}
            onSelectedAgentChange={setSelectedAgentGlobal}
            onGeneratePdf={(caseId, agentName, pdfType) => {
              logUsageEvent(currentUser, "pdf_generate", {
                tab: "appeal",
                case_id: caseId,
                target_agent: agentName || "",
                details: { pdfType: pdfType || "appeal" },
              });
            }}
          />
        ) : activeTab === "create-evaluation" && createEvaluationAllowed ? (
          <CreateEvaluationMockup
            agentOptions={qaEvaluationAgentOptions}
            currentUser={currentUser}
            onSubmitEvaluation={handleEvaluationSubmitted}
          />
        ) : activeTab === "pre-test" && preTestAllowed ? (
          <PreTestMockup
            currentUser={currentUser}
            canTakePreTest={takePreTestAllowed}
            canManagePreTest={managePreTestAllowed}
            canViewPreTestResults={viewPreTestResultsAllowed}
            canResetPreTestRetake={resetPreTestRetakeAllowed}
            canExportPreTestResults={exportPreTestResultsAllowed}
          />
        ) : activeTab === "training-attendance" && trainingAttendanceAllowed ? (
          <TrainingAttendanceMockup
            currentUser={currentUser}
            accounts={effectiveUserAccounts}
            canViewTrainingCheckIn={viewTrainingCheckInAllowed}
            canViewTrainingAttendance={viewTrainingAttendanceAllowed}
            canCheckInTrainingSelf={checkInTrainingSelfAllowed}
            canManageTrainingSessions={manageTrainingSessionsAllowed}
            canManageTrainingRoster={manageTrainingRosterAllowed}
            canManualUpdateTrainingAttendance={manualUpdateTrainingAttendanceAllowed}
            canExportTrainingAttendance={exportTrainingAttendanceAllowed}
          />
        ) : activeTab === "appeal-requests" && appealRequestsAllowed ? (
          <AppealRequestsMockup currentUser={currentUser} onTasksChanged={loadInboxTasks} />
        ) : activeTab === "appeal-override" && appealOverrideAllowed ? (
          <AppealOverrideMockup currentUser={currentUser} />
        ) : activeTab === "task-inbox" ? (
          <TaskInboxMockup
            tasks={inboxTasks}
            onOpenTask={handleOpenInboxTask}
          />
        ) : activeTab === "team-chat" ? (
          <TeamChatMockup
            currentUser={currentUser}
            messages={chatMessages}
            onlineUsers={onlineUsers}
            unreadCounts={chatUnreadCounts}
            onSendMessage={sendChatMessage}
            onEditMessage={editChatMessage}
            onDeleteMessage={deleteChatMessage}
            onStartCall={startChatCall}
            onCallResponse={respondChatCall}
            onEndCall={endChatCall}
            webRtcSignals={webRtcSignals}
            onSendWebRtcSignal={sendWebRtcSignal}
            onMarkRoomRead={markChatRoomRead}
            onRefresh={() => {
              void sendPresence();
              void loadChatData();
            }}
          />
        ) : activeTab === "call-history" ? (
          <CallHistoryMockup
            currentUser={currentUser}
            messages={chatMessages}
            onOpenChat={() => {
              navigateToTab("team-chat");
              void sendPresence();
              void loadChatData();
            }}
          />
        ) : activeTab === "summary" ? (
          <SummaryMockup
            currentUser={currentUser}
            externalSelectedAgent={selectedAgentGlobal}
            externalSelectedMonth={selectedMonthGlobal}
            externalSelectedWeek={selectedWeekGlobal}
            roleScopedAgentNames={roleScopedAgentNames}
            dataRefreshKey={qaDataRefreshKey}
            onSelectedAgentChange={setSelectedAgentGlobal}
            onSelectedMonthChange={setSelectedMonthGlobal}
            onSelectedWeekChange={setSelectedWeekGlobal}
          />
        ) : activeTab === "signature-center" ? (
          <SignatureCenterErrorBoundary key="signature-center">
            <SignatureCenterMockup currentUser={currentUser} accounts={effectiveUserAccounts} />
          </SignatureCenterErrorBoundary>
        ) : activeTab === "presentation-builder" ? (
          <PresentationMockup
            currentUser={currentUser}
            roleScopedAgentNames={roleScopedAgentNames}
            dataRefreshKey={qaDataRefreshKey}
          />
        ) : activeTab === "coaching" && coachingAllowed ? (
          <CoachingMockup
            currentUser={currentUser}
            externalSelectedAgent={selectedAgentGlobal}
            externalSelectedMonth={selectedMonthGlobal}
            externalSelectedWeek={selectedWeekGlobal}
            roleScopedAgentNames={roleScopedAgentNames}
            onSelectedAgentChange={setSelectedAgentGlobal}
            onSelectedMonthChange={setSelectedMonthGlobal}
            onSelectedWeekChange={setSelectedWeekGlobal}
          />
        ) : activeTab === "usage-log" && usageLogAllowed ? (
          <UsageLogMockup />
        ) : activeTab === "user-roles" && roleAdminAllowed ? (
          <UserRoleAdminMockup
            accounts={effectiveUserAccounts}
            currentUser={currentUser}
            roleOverrides={roleOverrides}
            rolePermissions={rolePermissions}
            maintenanceState={maintenanceState}
            onMaintenanceChanged={handleMaintenanceChanged}
            onRolesChanged={loadRoleOverrides}
          />
        ) : activeTab === "rubric" && rubricAllowed ? (
          <QARubricMockup currentUser={currentUser} canManageRubric={rubricManageAllowed} initialRubricCode={selectedRubricCode} onShareLink={shareRubricLink} />
        ) : (
          <QARubricMockup currentUser={currentUser} canManageRubric={rubricManageAllowed} initialRubricCode={selectedRubricCode} onShareLink={shareRubricLink} />
        )}
      </div>

    </>
  );
}








