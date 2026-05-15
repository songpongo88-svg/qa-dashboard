import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DashboardMockup from "./DashboardMockup";
import AppealMockup from "./AppealMockup";
import AppealRequestsMockup, { buildAppealRequests } from "./AppealRequestsMockup";
import AppealOverrideMockup, { buildAppealCaseOverrides } from "./AppealOverrideMockup";
import QARubricMockup from "./QARubricMockup";
import SummaryMockup from "./SummaryMockup";
import CoachingMockup from "./CoachingMockup";
import UsageLogMockup from "./UsageLogMockup";
import UserRoleAdminMockup from "./UserRoleAdminMockup";
import PageHero from "./PageHero";
import TeamChatMockup, { ChatAttachment, ChatMessage, OnlineUser } from "./TeamChatMockup";
import { fetchUsageLogs, logUsageEvent, UsageLogEvent } from "./usageLog";

type UserRole = string;
type RolePermissionKey =
  | "viewDashboard"
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
  password: string;
  displayName: string;
  role: UserRole;
  agentName: string;
  email?: string;
  status?: "Active" | "Suspended";
  suspendReason?: string;
};

type UserProfileSnapshot = {
  username: string;
  displayName: string;
  role: UserRole;
  agentName: string;
  email?: string;
  status?: "Active" | "Suspended";
  suspendReason?: string;
};

type CurrentUser = {
  username: string;
  displayName: string;
  role: UserRole;
  agentName: string;
  email?: string;
  loginAt: string;
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

type MaintenanceState = {
  enabled: boolean;
  message: string;
  updatedAt: string;
  updatedBy: string;
};

const USER_ACCOUNTS: UserAccount[] = [
  { username: "Anucha", password: "Mk!A7p9#L2", displayName: "Anucha Makundin", role: "Supervisor", agentName: "Anucha Makundin", email: "Anucha@robinhood.co.th" },
  { username: "Arisa", password: "Ri$4Kq2@Zm", displayName: "Arisa Aiemrit", role: "Agent", agentName: "Arisa Aiemrit", status: "Suspended", suspendReason: "ลาออกแล้ว" },
  { username: "Chatkonnaphat", password: "Ct#8Lm3!Qa", displayName: "Chatkonnaphat Bhusomya", role: "Agent", agentName: "Chatkonnaphat Bhusomya", email: "Chatkonnaphat@robinhood.co.th" },
  { username: "Jariyawadee", password: "Jy@5Nx9#Wp", displayName: "Jariyawadee Taboodda", role: "Agent", agentName: "Jariyawadee Taboodda", email: "Jariyawadee@robinhood.co.th" },
  { username: "Jureeporn", password: "Jp!6Vr2@Kd", displayName: "Jureeporn Piddum", role: "Agent", agentName: "Jureeporn Piddum", email: "Jureeporn@robinhood.co.th" },
  { username: "Krivut", password: "Kv#9Ts4!Mb", displayName: "Krivut Vongkampan", role: "Supervisor", agentName: "Krivut Vongkampan", email: "Krivut@robinhood.co.th" },
  { username: "Natcha", password: "Nc@7Pw3#Lf", displayName: "Natcha Chai-in", role: "Agent", agentName: "Natcha Chai-in", email: "Natcha@robinhood.co.th" },
  { username: "Nattapol", password: "Np!4Xz8@Hr", displayName: "Nattapol Suprom", role: "Agent", agentName: "Nattapol Suprom", email: "Nattapol.s@robinhood.co.th" },
  { username: "Phrommarin", password: "RBH1234", displayName: "Phrommarin Thaithorn", role: "Supervisor", agentName: "Phrommarin Thaithorn", email: "phrommarin@robinhood.co.th" },
  { username: "Songpon", password: "Boom@4421L2", displayName: "Songpon Phothong", role: "Quality Assurance", agentName: "Songpon Phothong", email: "Songpon@robinhood.co.th" },
  { username: "Sunijtra", password: "Sj#6Qm1!Ty", displayName: "Sunijtra Siritip", role: "Agent", agentName: "Sunijtra Siritip", email: "Sunijtra@robinhood.co.th" },
  { username: "Supakrit", password: "sP9#kM4!", displayName: "Supakrit Promkhamnoi", role: "Agent", agentName: "Supakrit Promkhamnoi", email: "Supakrit@robinhood.co.th" },
  { username: "Suphitcha", password: "Sp@8Ld2#Vk", displayName: "Suphitcha Keawliam", role: "Supervisor", agentName: "Suphitcha Keawliam", email: "Suphitcha@robinhood.co.th" },
  { username: "Wachiraporn", password: "wL7$cl2@", displayName: "Wachiraporn Chailittichai", role: "Agent", agentName: "Wachiraporn Chailittichai", email: "wachiraporn@robinhood.co.th" },
  { username: "Wassana", password: "Ws!3Kr7@Pn", displayName: "Wassana Phothong", role: "Agent", agentName: "Wassana Phothong", email: "Wassana@robinhood.co.th" },
];

const STORAGE_KEY = "qa_current_user";
const PASSWORD_OVERRIDE_KEY = "qa_password_overrides";
const INACTIVITY_LIMIT_MS = 30 * 60 * 1000;
const WARNING_BEFORE_MS = 1 * 60 * 1000;
const WARNING_TIME_MS = INACTIVITY_LIMIT_MS - WARNING_BEFORE_MS;
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

const DEFAULT_MAINTENANCE_STATE: MaintenanceState = {
  enabled: false,
  message: "QA Dashboard is under maintenance. Please try again later.",
  updatedAt: "",
  updatedBy: "",
};

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

const ROLE_OPTIONS: UserRole[] = ["Admin Live Chat", "Senior", "Supervisor", "Quality Assurance"];

const PERMISSION_KEYS: RolePermissionKey[] = [
  "viewDashboard",
  "viewSummary",
  "viewCoaching",
  "viewAppeal",
  "submitAppeal",
  "reviewAppeals",
  "appealOverride",
  "viewRubric",
  "viewUsageLog",
  "exportPdf",
  "exportAppealRawdata",
  "manageUsers",
  "manageRoles",
  "resetPassword",
  "manageMaintenance",
  "useTeamChat",
];

const ROLE_PERMISSION_DEFAULTS: Record<string, RolePermissions> = {
  "Admin Live Chat": {
    viewDashboard: true,
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

function shouldScopeCasesToOwnRole(role?: UserRole) {
  return role === "Admin Live Chat";
}

function buildRolePermissionOverrides(logs: UsageLogEvent[]) {
  const permissionMap: RolePermissionMap = {};
  const savedRoles = new Set<string>();

  ROLE_OPTIONS.forEach((role) => {
    permissionMap[role] = getDefaultRolePermissions(role);
  });

  logs.forEach((item) => {
    if (item.event_type !== "role_permissions_saved") return;
    const roleName = String(item.details?.roleName || "").trim();
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
      ? { ...next, manageUsers: true, manageRoles: true, manageMaintenance: true }
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
    return "00 ชม. 00 นาที 00 วินาที";
  }

  const totalSeconds = Math.floor((current - start) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")} ชม. ${String(minutes).padStart(2, "0")} นาที ${String(seconds).padStart(2, "0")} วินาที`;
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

function savePasswordOverride(username: string, newPassword: string) {
  const current = readPasswordOverrides();
  current[username.trim().toLowerCase()] = newPassword;
  writePasswordOverrides(current);
}

function removePasswordOverride(username: string) {
  const current = readPasswordOverrides();
  delete current[username.trim().toLowerCase()];
  writePasswordOverrides(current);
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
    const newRole = item.details?.newRole;
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
    const role = item.details?.role;
    if (!username || profiles[normalizedUsername] || !isUserRole(role)) return;

    const status = item.details?.status === "Suspended" ? "Suspended" : "Active";
    profiles[normalizedUsername] = {
      username,
      displayName: String(item.details?.displayName || username),
      agentName: String(item.details?.agentName || item.details?.displayName || username),
      email: String(item.details?.email || ""),
      role,
      status,
      suspendReason: String(item.details?.suspendReason || ""),
    };
  });

  return profiles;
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
      status: profile.status,
      suspendReason: profile.suspendReason,
    });
  });

  return Array.from(merged.values());
}

async function getCentralUserRoleOverride(username: string) {
  try {
    const normalized = username.trim().toLowerCase();
    const logs = await fetchUsageLogs(3000);
    const overrides = buildUserRoleOverrides(logs);
    return overrides[normalized] || "";
  } catch {
    return "";
  }
}

async function getCentralEffectiveUserAccounts() {
  try {
    const logs = await fetchUsageLogs(5000);
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

async function getCentralPasswordRecord(username: string): Promise<PasswordRecord | null> {
  try {
    const normalized = username.trim().toLowerCase();
    const logs = await fetchUsageLogs(2000);
    const passwordEvent = logs.find((item) => {
      const target = getResetRequestUsername(item).toLowerCase();
      return (
        target === normalized &&
        (item.event_type === "password_reset_approved" || item.event_type === "password_changed") &&
        typeof item.details?.password === "string"
      );
    });

    return passwordEvent ? getPasswordRecordFromEvent(passwordEvent) : null;
  } catch {
    return null;
  }
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
  const sortedLogs = [...logs].sort(
    (a, b) => new Date(a.created_at || "").getTime() - new Date(b.created_at || "").getTime()
  );
  const messages = new Map<string, ChatMessage>();

  sortedLogs.forEach((item) => {
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
        response === "accepted" || response === "declined" || response === "ended" ? response : existing.callStatus;
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

  return Array.from(messages.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
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
            Water splash theme · resets after 25 Apr 2026
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
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  const selectedLabel = options.find((option) => option.value === value)?.label || label;

  return (
    <label className="group flex w-full min-w-0 flex-col gap-2 md:w-[205px] md:shrink-0 xl:w-[210px]">
      <span className="pl-1 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500 group-focus-within:text-violet-700">{label}</span>
      <div className="relative">
        <select
          value={value}
          aria-label={`${label}: ${selectedLabel}`}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[54px] w-full appearance-none rounded-[18px] border border-violet-100 bg-white px-4 py-3 pr-10 text-[14px] font-black text-slate-900 shadow-[0_10px_24px_rgba(15,23,42,0.04)] outline-none transition hover:border-violet-200 hover:shadow-[0_14px_30px_rgba(88,28,135,0.08)] focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
        >
          <option value="">{label}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-violet-700">
          ▾
        </span>
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
          You have been inactive for a while. Your session will be logged out automatically in 1 minute unless you choose to stay signed in.
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onLogoutNow} className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100">Log Out Now</button>
          <button type="button" onClick={onStayLoggedIn} className="rounded-2xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-800">Stay Logged In</button>
        </div>
      </div>
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
          Password must be at least 8 characters and include uppercase, lowercase, number, and special character.
        </div>
        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-800">Current Password</label>
            <input type="password" value={currentPasswordInput} onChange={(e) => setCurrentPasswordInput(e.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-800">New Password</label>
            <input type="password" value={newPasswordInput} onChange={(e) => setNewPasswordInput(e.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-800">Confirm New Password</label>
            <input type="password" value={confirmNewPasswordInput} onChange={(e) => setConfirmNewPasswordInput(e.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100" />
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
          Enter your username and registered email. Songpon will review the request and provide a temporary password after approval.
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
          <button type="button" onClick={onSubmit} className="rounded-2xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">Submit Request</button>
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

function VersionPill({
  meta,
  className = "",
}: {
  meta: BuildMeta;
  className?: string;
}) {
  const shortHash = meta.commitHash ? meta.commitHash.slice(0, 7) : "";
  const shownVersion = meta.displayVersion || meta.version;

  return (
    <div className={`inline-flex flex-col gap-0.5 rounded-[16px] border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-slate-700 ${className}`}>
      <div className="text-sm font-bold text-slate-900">
        Version {shownVersion}
      </div>
      <div className="text-[11px] leading-4 text-slate-500">
        {meta.updatedAt}
        {shortHash ? ` · ${shortHash}` : ""}
      </div>
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
          eyebrow="Task Inbox"
          title="Inbox Center"
          subtitle="Unread work items, QA updates, password alerts, and review requests are collected here like an internal mail inbox."
          workspaceTitle="Work Mailbox"
          workspaceSubtitle="Read a task to clear the badge, then open the related workflow"
        />

        <div className="grid gap-4 border-b border-violet-100 bg-violet-50/60 px-5 py-5 md:grid-cols-3">
          <div className="rounded-3xl border border-violet-100 bg-white p-5">
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-700">Unread Mail</div>
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
                      <div className="mt-1 text-base font-black text-slate-950">{task.mailTemplate.subject}</div>
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
          <div className="mt-6 rounded-3xl border border-white/10 bg-white/10 px-5 py-4 text-sm font-semibold text-violet-100">
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
  onSendTeamMessage,
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
  onSendTeamMessage: (message: string) => Promise<void>;
  onRefresh: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const myUsername = currentUser.username.toLowerCase();
  const unreadBadge = totalUnread > 9 ? "9+" : String(totalUnread);
  const recentMessages = [...messages]
    .filter((message) => !message.deleted)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const unreadPreview = recentMessages.filter((message) => {
    if (message.username.toLowerCase() === myUsername) return false;
    const roomKey = getChatRoomKeyForUser(message, currentUser);
    return (unreadCounts[roomKey] || 0) > 0;
  });

  const handleSend = async () => {
    const message = draft.trim();
    if (!message || sending) return;
    setSending(true);
    await onSendTeamMessage(message);
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
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-100">Team Chat</div>
                <div className="mt-1 text-lg font-black">Online Chat</div>
                <div className="mt-1 text-xs font-semibold text-violet-100">
                  {onlineUsers.length} online user(s) · {totalUnread} unread message(s)
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

          <div className="max-h-[320px] space-y-2 overflow-y-auto bg-slate-50 px-3 py-3">
            {(unreadPreview.length ? unreadPreview : recentMessages).map((message) => {
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
                      ? `Call ${message.callStatus || ""}`
                      : message.attachment
                        ? `${message.message || "Attachment"} · ${message.attachment.name}`
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

            {!recentMessages.length ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm font-semibold text-slate-500">
                No chat messages yet.
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
                placeholder="Send message to Team Chat"
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
              <button
                type="button"
                onClick={onRefresh}
                className="text-xs font-bold text-slate-500 transition hover:text-violet-700"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={onOpenFullChat}
                className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-700 transition hover:bg-violet-100"
              >
                Open full Team Chat
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
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(() => readStoredUser());
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
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
  const [roleOverrides, setRoleOverrides] = useState<Record<string, UserRole>>({});
  const [profileOverrides, setProfileOverrides] = useState<Record<string, UserProfileSnapshot>>({});
  const [rolePermissions, setRolePermissions] = useState<RolePermissionMap>(() => buildRolePermissionOverrides([]));
  const [buildMeta, setBuildMeta] = useState<BuildMeta>(DEFAULT_BUILD_META);
  const [maintenanceState, setMaintenanceState] = useState<MaintenanceState>(DEFAULT_MAINTENANCE_STATE);
  const [showReleaseNotesModal, setShowReleaseNotesModal] = useState(false);
  const [floatingChatOpen, setFloatingChatOpen] = useState(false);
  const [liveNow, setLiveNow] = useState(() => new Date());

  const [activeTab, setActiveTab] = useState<
    "dashboard" | "appeal" | "appeal-requests" | "appeal-override" | "task-inbox" | "team-chat" | "summary" | "coaching" | "rubric" | "usage-log" | "user-roles"
  >("dashboard");
  const [dashboardSubTab, setDashboardSubTab] = useState<"overview" | "case-detail">("overview");
  const [accountMenuValue, setAccountMenuValue] = useState("");

  const [selectedAgentGlobal, setSelectedAgentGlobal] = useState("");
  const [selectedMonthGlobal, setSelectedMonthGlobal] = useState("all");
  const [selectedWeekGlobal, setSelectedWeekGlobal] = useState("all");
  const [selectedAppealCaseId, setSelectedAppealCaseId] = useState("");
  const [selectedDashboardCaseId, setSelectedDashboardCaseId] = useState("");

  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestIncomingChatRef = useRef("");

  const welcomeName = useMemo(() => {
    if (!currentUser) return "";
    return currentUser.displayName || currentUser.username;
  }, [currentUser]);

  const songkranTheme = useMemo(() => isSongkranThemeActive(), []);
  const effectiveUserAccounts = useMemo(
    () => buildEffectiveUserAccounts(USER_ACCOUNTS, profileOverrides, roleOverrides),
    [profileOverrides, roleOverrides]
  );
  const roleScopedAgentNames = useMemo(() => {
    if (!currentUser || !shouldScopeCasesToOwnRole(currentUser.role)) return [];
    return [currentUser.agentName || currentUser.displayName || currentUser.username].filter(Boolean);
  }, [currentUser]);
  const coachingAllowed = hasRolePermission(currentUser, rolePermissions, "viewCoaching");
  const usageLogAllowed = hasRolePermission(currentUser, rolePermissions, "viewUsageLog");
  const appealRequestsAllowed = hasRolePermission(currentUser, rolePermissions, "reviewAppeals");
  const appealOverrideAllowed = hasRolePermission(currentUser, rolePermissions, "appealOverride");
  const passwordResetAdminAllowed = hasRolePermission(currentUser, rolePermissions, "resetPassword");
  const roleAdminAllowed =
    hasRolePermission(currentUser, rolePermissions, "manageUsers") ||
    hasRolePermission(currentUser, rolePermissions, "manageRoles") ||
    hasRolePermission(currentUser, rolePermissions, "manageMaintenance");
  const maintenanceBlocked = maintenanceState.enabled && !hasRolePermission(currentUser, rolePermissions, "manageMaintenance");
  const canUseAdminAccountMenu = Boolean(currentUser) && (
    usageLogAllowed || roleAdminAllowed || passwordResetAdminAllowed
  );
  const performanceMenuValue =
    activeTab === "dashboard" || activeTab === "summary" || (activeTab === "coaching" && coachingAllowed)
      ? activeTab
      : "";
  const reviewMenuValue =
    activeTab === "appeal" || activeTab === "appeal-requests" || activeTab === "appeal-override" || activeTab === "rubric"
      ? activeTab
      : "";
  const accountMenuDisplayValue = activeTab === "usage-log" || activeTab === "user-roles" ? activeTab : accountMenuValue;
  const unreadInboxTaskCount = inboxTasks.filter((item) => item.unread).length;
  const shortBuildHash = buildMeta.commitHash ? buildMeta.commitHash.slice(0, 7) : "";
  const chatUnreadCounts = useMemo(() => {
    const readMap = readChatReadMap(currentUser);
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
  const accountOptions = canUseAdminAccountMenu
    ? [
        ...(usageLogAllowed ? [{ value: "usage-log", label: "Usage Log" }] : []),
        ...(roleAdminAllowed ? [{ value: "user-roles", label: "User Roles" }] : []),
        { value: "change-password", label: "Change Password" },
        ...(passwordResetAdminAllowed ? [{ value: "reset-password", label: "Reset Password" }] : []),
        { value: "logout", label: "Log Out" },
      ]
    : [
        { value: "change-password", label: "Change Password" },
        { value: "logout", label: "Log Out" },
      ];

  const handlePerformanceMenuChange = (value: string) => {
    if (value === "coaching" && !coachingAllowed) return;
    if (value === "dashboard" || value === "summary" || value === "coaching") {
      setActiveTab(value);
    }
  };

  const handleReviewMenuChange = (value: string) => {
    if (value === "appeal-requests" && !appealRequestsAllowed) return;
    if (value === "appeal-override" && !appealOverrideAllowed) return;
    if (value === "appeal" || value === "appeal-requests" || value === "appeal-override" || value === "rubric") {
      setActiveTab(value);
    }
  };

  const handleAccountMenuChange = (value: string) => {
    setAccountMenuValue(value);

    if (value === "change-password") {
      resetChangePasswordState();
      setShowChangePasswordModal(true);
    } else if (value === "usage-log" && usageLogAllowed) {
      setActiveTab("usage-log");
    } else if (value === "user-roles" && roleAdminAllowed) {
      setActiveTab("user-roles");
    } else if (value === "reset-password" && passwordResetAdminAllowed) {
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

  const loadInboxTasks = async () => {
    if (!currentUser) {
      setInboxTasks([]);
      return;
    }

    try {
      const [logs, passwordRecord] = await Promise.all([
        fetchUsageLogs(5000),
        getCentralPasswordRecord(currentUser.username),
      ]);
      const readIds = readInboxReadIds(currentUser);
      const nextTasks: InboxTaskItem[] = [];

      if (appealRequestsAllowed) {
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
              subject: "มีรายการอุทธรณ์รอพิจารณา",
              to: currentUser.displayName || currentUser.username,
              from: "QA Dashboard System",
              status: "Pending Review",
              body: [
                `มีคำขออุทธรณ์จำนวน ${pendingCount} รายการรอการพิจารณา`,
                "กรุณาเปิด Appeal Requests เพื่อตรวจสอบรายละเอียด แก้ไขคะแนนหรือคอมเมนต์ และบันทึกผลเป็น Approve หรือ Reject",
              ],
              footer: "หลัง Save Review ระบบจะแจ้งผลกลับไปยัง Inbox ของเจ้าของเคสโดยอัตโนมัติ",
            },
          });
        }
      }

      buildAppealRequests(logs)
        .filter((item) => item.status !== "Pending")
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
                ? "Your appeal was approved. Open the case detail to review the decision. Dashboard score will update after Appeal ROWDATA is uploaded."
                : "Your appeal was rejected. Open the case detail to review the decision summary.",
            badge: item.status,
            count: 1,
            unread: !readIds.includes(id),
            actionLabel: "Open case detail",
            caseId: item.caseId,
            agentName: item.agent,
            mailTemplate: {
              subject: `ผลการพิจารณาอุทธรณ์เคส ${item.caseId}`,
              to: item.submittedBy || item.agent || currentUser.displayName || currentUser.username,
              from: "Quality Assurance / Songpon Phothong",
              status: item.status,
              body: [
                `ผลการพิจารณา: ${item.status === "Approved" ? "อนุมัติการปรับคะแนน" : "ไม่อนุมัติการปรับคะแนน"}`,
                `Case ID: ${item.caseId}`,
                `Agent: ${item.agent || "-"}`,
                item.reviewSummary ? `สรุปผลการพิจารณา: ${item.reviewSummary}` : "สรุปผลการพิจารณา: กรุณาเปิดรายละเอียดเคสเพื่อตรวจสอบข้อมูลเพิ่มเติม",
              ],
              footer:
                item.status === "Approved"
                  ? "หมายเหตุ: คะแนนใน Dashboard จะอัปเดตหลังจาก QA Export Appeal ROWDATA และอัปโหลดไฟล์กลับเข้าระบบ"
                  : "หมายเหตุ: เคสนี้จะไม่ถูกปรับคะแนนใน Dashboard เว้นแต่ QA มีการพิจารณาและอัปเดต Appeal ROWDATA ใหม่",
            },
          });
        });

      const submittedAppealCaseIds = new Set(
        buildAppealRequests(logs).map((item) => String(item.caseId || "").trim().toLowerCase())
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
            subject: `เปิดสิทธิ์ยื่นอุทธรณ์เคส ${item.caseId}`,
            to: item.targetAgent || currentUser.displayName || currentUser.username,
            from: "Quality Assurance / Songpon Phothong",
            status: "Appeal Override",
            body: [
              `เคส ${item.caseId} ได้รับสิทธิ์ให้ยื่นอุทธรณ์ได้ แม้เลยกำหนดรอบปกติแล้ว`,
              item.note ? `Reason / Note: ${item.note}` : "Reason / Note: เปิดสิทธิ์พิเศษโดย QA",
            ],
            footer: "สิทธิ์นี้ยังคงยึดเงื่อนไขยื่นได้ 1 ครั้งต่อเคส และต้องเป็นเจ้าของเคสเท่านั้น",
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
            currentUser.role === "Agent"
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
      const logs = await fetchUsageLogs(5000);
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
      return;
    }

    try {
      const logs = await fetchUsageLogs(1000);
      const nextMessages = buildChatMessages(logs);
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
      setOnlineUsers(buildOnlineUsers(logs));
    } catch {
      setChatMessages([]);
      setOnlineUsers([]);
    }
  };

  const sendPresence = async () => {
    if (!currentUser) return;
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
    if (!currentUser) return;
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

  const markChatRoomRead = useCallback((roomKey: string) => {
    const readMap = readChatReadMap(currentUser);
    saveChatReadMap(currentUser, {
      ...readMap,
      [roomKey]: new Date().toISOString(),
    });
  }, [currentUser]);

  const loadRoleOverrides = async () => {
    try {
      const logs = await fetchUsageLogs(5000);
      const nextOverrides = buildUserRoleOverrides(logs);
      const nextProfiles = buildUserProfileOverrides(logs);
      const nextPermissions = buildRolePermissionOverrides(logs);
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
    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get("tab");
    const requestedCaseId = params.get("caseId")?.trim() || "";
    const requestedAgent = params.get("agent")?.trim() || "";

    if (requestedTab === "appeal") {
      setActiveTab("appeal");
      setSelectedMonthGlobal("all");
      setSelectedAppealCaseId(requestedCaseId);
      if (requestedAgent) {
        setSelectedAgentGlobal(requestedAgent);
      }
    }
  }, []);

  useEffect(() => {
    void loadMaintenanceState();
    const timer = window.setInterval(() => {
      void loadMaintenanceState();
    }, 30000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLiveNow(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (activeTab === "coaching" && !coachingAllowed) {
      setActiveTab("dashboard");
    }
    if (activeTab === "usage-log" && !usageLogAllowed) {
      setActiveTab("dashboard");
    }
    if (activeTab === "appeal-requests" && !appealRequestsAllowed) {
      setActiveTab("dashboard");
    }
    if (activeTab === "appeal-override" && !appealOverrideAllowed) {
      setActiveTab("dashboard");
    }
    if (activeTab === "user-roles" && !roleAdminAllowed) {
      setActiveTab("dashboard");
    }
  }, [activeTab, coachingAllowed, usageLogAllowed, appealRequestsAllowed, appealOverrideAllowed, roleAdminAllowed]);

  useEffect(() => {
    if (!currentUser) {
      setRoleOverrides({});
      setProfileOverrides({});
      return;
    }

    void loadRoleOverrides();
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
    }, 60000);

    return () => window.clearInterval(timer);
  }, [currentUser, appealRequestsAllowed, activeTab, buildMeta.buildNumber, maintenanceBlocked]);

  useEffect(() => {
    if (!currentUser || maintenanceBlocked) {
      setChatMessages([]);
      setOnlineUsers([]);
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
    if (currentUser) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentUser));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser?.role === "Agent" && currentUser.agentName) {
      setSelectedAgentGlobal(currentUser.agentName);
    }
  }, [currentUser]);

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

  const handleOpenInboxTask = (task: InboxTaskItem) => {
    markInboxTaskRead(task.id);
    setInboxReturnTitle(task.title);

    if (task.type === "appeal") {
      if (appealRequestsAllowed) {
        setActiveTab("appeal-requests");
      }
      return;
    }

    if (task.type === "appeal-result") {
      setActiveTab("dashboard");
      setDashboardSubTab("case-detail");
      setSelectedAppealCaseId("");
      setSelectedDashboardCaseId(task.caseId || "");
      setSelectedAgentGlobal(task.agentName || currentUser?.agentName || "");
      return;
    }

    if (task.type === "appeal-override") {
      setActiveTab("dashboard");
      setDashboardSubTab("case-detail");
      setSelectedAppealCaseId("");
      setSelectedDashboardCaseId(task.caseId || "");
      setSelectedAgentGlobal(task.agentName || currentUser?.agentName || "");
      return;
    }

    if (task.type === "password") {
      resetChangePasswordState();
      setChangePasswordPromptReason(task.description);
      setShowChangePasswordModal(true);
      return;
    }

    setActiveTab("dashboard");
    setDashboardSubTab("overview");
    if (currentUser?.role === "Agent") {
      setSelectedAgentGlobal(currentUser.agentName);
    }
  };

  const openTaskInbox = () => {
    setInboxReturnTitle("");
    setActiveTab("task-inbox");
    void loadInboxTasks();
  };

  const handleLogout = () => {
    if (currentUser && !maintenanceBlocked) {
      logUsageEvent(currentUser, "logout", { tab: activeTab });
    }
    clearSessionTimers();
    setShowSessionWarning(false);
    setCurrentUser(null);
    setUsername("");
    setPassword("");
    setLoginError("");
    setActiveTab("dashboard");
    setDashboardSubTab("overview");
    setSelectedAgentGlobal("");
    setSelectedMonthGlobal("all");
    setSelectedWeekGlobal("all");
    setChatMessages([]);
    setOnlineUsers([]);
    setShowChangePasswordModal(false);
    setShowResetPasswordModal(false);
    resetChangePasswordState();
    resetPasswordModalState();
    localStorage.removeItem(STORAGE_KEY);
  };

  const startSessionTimers = () => {
    clearSessionTimers();
    setShowSessionWarning(false);

    warningTimerRef.current = setTimeout(() => {
      setShowSessionWarning(true);
    }, WARNING_TIME_MS);

    inactivityTimerRef.current = setTimeout(() => {
      handleLogout();
      window.alert("You have been logged out due to 30 minutes of inactivity.");
    }, INACTIVITY_LIMIT_MS);
  };

  const resetInactivityTimer = () => {
    if (!currentUser) return;
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

  const handleLogin = () => {
    void handleLoginAsync();
  };

  const handleLoginAsync = async () => {
    const normalizedUsername = username.trim().toLowerCase();
    const normalizedPassword = password.trim();
    const centralUserAccounts = await getCentralEffectiveUserAccounts();

    const matchedAccount = centralUserAccounts.find(
      (item) => item.username.trim().toLowerCase() === normalizedUsername
    );

    if (matchedAccount?.status === "Suspended") {
      const reason = matchedAccount.suspendReason ? ` (${matchedAccount.suspendReason})` : "";
      setLoginError(`This account has been suspended${reason}. Please contact Supervisor.`);
      return;
    }

    const centralPasswordRecord = matchedAccount ? await getCentralPasswordRecord(matchedAccount.username) : null;
    const effectivePassword = centralPasswordRecord?.password || (matchedAccount ? getEffectivePassword(matchedAccount) : "");
    const matchedUser =
      matchedAccount && effectivePassword === normalizedPassword
        ? matchedAccount
        : null;

    if (!matchedUser) {
      if (centralPasswordRecord?.kind === "temporary" && isPastDate(centralPasswordRecord.expiresAt)) {
        setLoginError("Temporary password has expired. Please use Forgot Password to request a new temporary password.");
        return;
      }
      setLoginError("Invalid username or password");
      return;
    }

    if (centralPasswordRecord?.kind === "temporary" && isPastDate(centralPasswordRecord.expiresAt)) {
      setLoginError("Temporary password has expired. Please use Forgot Password to request a new temporary password.");
      return;
    }

    const centralRole = await getCentralUserRoleOverride(matchedUser.username);
    const effectiveRole = centralRole || matchedUser.role;

    const nextUser: CurrentUser = {
      username: matchedUser.username,
      displayName: matchedUser.displayName,
      role: effectiveRole,
      agentName: matchedUser.agentName,
      email: matchedUser.email || "",
      loginAt: new Date().toISOString(),
    };

    if (maintenanceState.enabled && !canBypassMaintenance(nextUser)) {
      setLoginError(maintenanceState.message || DEFAULT_MAINTENANCE_STATE.message);
      return;
    }

    setCurrentUser(nextUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
    if (!maintenanceState.enabled || canBypassMaintenance(nextUser)) {
      logUsageEvent(nextUser, "login", { tab: "dashboard" });
    }

    setLoginError("");
    setUsername("");
    setPassword("");
    setActiveTab("dashboard");
    setDashboardSubTab("overview");
    setSelectedAgentGlobal(effectiveRole === "Agent" ? matchedUser.agentName : "");
    setSelectedMonthGlobal("all");
    setSelectedWeekGlobal("all");
    void loadRoleOverrides();

    if (centralPasswordRecord?.kind === "temporary") {
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

  const handleForgotPasswordReset = () => {
    void handleForgotPasswordRequest();
  };

  const handleForgotPasswordRequest = async () => {
    if (maintenanceState.enabled) {
      setForgotPasswordError("Password reset is paused while the system is under maintenance.");
      setForgotPasswordSuccess("");
      return;
    }

    const normalizedUsername = forgotUsernameInput.trim().toLowerCase();
    const normalizedEmail = normalizeEmail(forgotEmailInput);
    const centralUserAccounts = await getCentralEffectiveUserAccounts();
    const account = centralUserAccounts.find((item) => item.username.trim().toLowerCase() === normalizedUsername);

    if (!account) {
      setForgotPasswordError("Username not found");
      setForgotPasswordSuccess("");
      return;
    }

    if (account.status === "Suspended") {
      const reason = account.suspendReason ? ` (${account.suspendReason})` : "";
      setForgotPasswordError(`This account has been suspended${reason}. Password reset is not available.`);
      setForgotPasswordSuccess("");
      return;
    }

    if (!account.email) {
      setForgotPasswordError("This user does not have a registered email yet. Please contact Supervisor.");
      setForgotPasswordSuccess("");
      return;
    }

    if (normalizeEmail(account.email) !== normalizedEmail) {
      setForgotPasswordError("Email does not match the registered user information");
      setForgotPasswordSuccess("");
      return;
    }

    const requestId = `${account.username.toLowerCase()}-${Date.now()}`;
    try {
      await logUsageEvent(
        {
          username: account.username,
          displayName: account.displayName,
          role: account.role,
          agentName: account.agentName,
          loginAt: new Date().toISOString(),
        },
        "password_reset_request",
        {
          tab: "login",
          target_agent: account.username,
          details: {
            requestId,
            username: account.username,
            displayName: account.displayName,
            email: account.email,
          },
        }
      );
    } catch {
      setForgotPasswordError("Submit request failed. Please try again.");
      setForgotPasswordSuccess("");
      return;
    }

    setForgotPasswordError("");
    setForgotPasswordSuccess("Request submitted. Please contact Songpon to receive a temporary password after approval.");
    setTimeout(() => {
      setShowForgotPasswordModal(false);
      resetForgotPasswordState();
    }, 1800);
  };

  const handleStayLoggedIn = () => {
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
    const effectivePassword = centralPasswordRecord?.password || getEffectivePassword(account);

    if (currentPasswordInput !== effectivePassword) {
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

    savePasswordOverride(currentUser.username, newPasswordInput);
    await logUsageEvent(currentUser, "password_changed", {
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

    setChangePasswordError("");
    setChangePasswordSuccess("Password changed successfully");
    setCurrentPasswordInput("");
    setNewPasswordInput("");
    setConfirmNewPasswordInput("");

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
    if (currentUser && targetAccount) {
      const issuedAt = new Date();
      const expiresAt = addDays(issuedAt, TEMP_PASSWORD_VALID_DAYS);
      await logUsageEvent(currentUser, "password_reset_approved", {
        tab: "account",
        target_agent: targetAccount.username,
        details: {
          requestId: `manual-default-${targetAccount.username.toLowerCase()}-${Date.now()}`,
          password: targetAccount.password,
          passwordKind: "temporary",
          issuedAt: issuedAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
          email: targetAccount.email || "",
          displayName: targetAccount.displayName,
          resetMode: "default",
        },
      });
    }
    setResetResultMessage(`Password for ${targetName} has been reset to default.`);
  };

  const loadPasswordResetRequests = async () => {
    const logs = await fetchUsageLogs(2000);
    setPasswordResetRequests(buildResetRequests(logs));
  };

  const handleApproveResetRequest = async (request: PasswordResetRequest) => {
    if (!currentUser) return;
    if (request.username.trim().toLowerCase() === currentUser.username.trim().toLowerCase()) {
      setResetResultMessage("You cannot approve your own password reset request.");
      return;
    }
    const latestLogs = await fetchUsageLogs(2000);
    const latestStatus = getResetRequestDecisionStatus(latestLogs, request.requestId);
    if (latestStatus !== "Pending") {
      setPasswordResetRequests(buildResetRequests(latestLogs));
      setResetResultMessage(`This request is already ${latestStatus.toLowerCase()} by another reset admin.`);
      return;
    }
    const tempPassword = generateTemporaryPassword();
    const issuedAt = new Date();
    const expiresAt = addDays(issuedAt, TEMP_PASSWORD_VALID_DAYS);
    await logUsageEvent(currentUser, "password_reset_approved", {
      tab: "account",
      target_agent: request.username,
      details: {
        requestId: request.requestId,
        password: tempPassword,
        passwordKind: "temporary",
        issuedAt: issuedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        email: request.email,
        displayName: request.displayName,
      },
    });
    setResetResultMessage(`Approved ${request.displayName || request.username}. Temporary password: ${tempPassword}`);
    await loadPasswordResetRequests();
  };

  const handleRejectResetRequest = async (request: PasswordResetRequest) => {
    if (!currentUser) return;
    if (request.username.trim().toLowerCase() === currentUser.username.trim().toLowerCase()) {
      setResetResultMessage("You cannot reject your own password reset request. Please ask another reset admin.");
      return;
    }
    const latestLogs = await fetchUsageLogs(2000);
    const latestStatus = getResetRequestDecisionStatus(latestLogs, request.requestId);
    if (latestStatus !== "Pending") {
      setPasswordResetRequests(buildResetRequests(latestLogs));
      setResetResultMessage(`This request is already ${latestStatus.toLowerCase()} by another reset admin.`);
      return;
    }
    await logUsageEvent(currentUser, "password_reset_rejected", {
      tab: "account",
      target_agent: request.username,
      details: {
        requestId: request.requestId,
        email: request.email,
        displayName: request.displayName,
      },
    });
    setResetResultMessage(`Rejected reset request for ${request.displayName || request.username}.`);
    await loadPasswordResetRequests();
  };

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

        <div className={`relative min-h-screen ${songkranTheme ? "bg-gradient-to-br from-cyan-50 via-sky-50 to-fuchsia-50" : "bg-gradient-to-br from-violet-50 via-white to-fuchsia-50"}`}>
          {songkranTheme ? <SongkranBackdrop /> : null}

          <div className="mx-auto flex min-h-screen w-full max-w-[1180px] items-center justify-center px-4 py-4 sm:px-5 lg:px-6">
          <div className="grid w-full max-w-[1020px] overflow-hidden rounded-[24px] border border-violet-200/70 bg-white shadow-[0_18px_56px_rgba(76,29,149,0.10)] lg:grid-cols-[1fr_0.94fr]">
            <div className={`relative overflow-hidden p-5 text-white sm:p-6 lg:p-7 ${songkranTheme ? "bg-gradient-to-br from-sky-700 via-cyan-600 to-fuchsia-600" : "bg-gradient-to-br from-violet-950 via-violet-900 to-fuchsia-700"}`}>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.16),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.12),transparent_28%)]" />
              {songkranTheme ? <SongkranBackdrop compact /> : null}

              <div className="relative z-10">
                <div className="flex items-start justify-between gap-4">
                  <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-100">Secure Access</div>
                  <LogoBox />
                </div>

                <div className="mt-7 text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-200">Robinhood Customer Service QA</div>
                <div className="mt-3 text-[28px] font-bold tracking-tight sm:text-[34px]">QA Monitoring Workspace</div>
                <div className="mt-3 max-w-xl text-sm leading-6 text-violet-100/90">
                  Unified access for Dashboard, Case Detail, Appeal Review, Summary, Coaching, and QA Rubric with role-based visibility for supervisors and agents.
                </div>

                {songkranTheme ? <div className="mt-4"><SongkranBadge /></div> : null}

                <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
                  <LoginFeatureCard title="Performance" desc="Dashboard, KPI, grade, incentive, trend, and summary view" />
                  <LoginFeatureCard title="Review" desc="Appeal result, case comparison, coaching, and QA rubric reference" />
                  <LoginFeatureCard title="Security" desc="Password control, session timeout, and supervisor reset tools" />
                  <LoginFeatureCard title="Workspace" desc="Responsive layout optimized for common laptop browser size" />
                </div>

                {songkranTheme ? <FestiveIllustration /> : null}

                <div className="mt-6 flex items-center gap-4 rounded-[22px] border border-white/15 bg-white/10 px-4 py-3.5 backdrop-blur-sm">
                  <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white/15">
                    <img src="/robinhood-logo.png" alt="Robinhood" className="h-8 w-8 object-contain" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-200">Enterprise Access</div>
                    <div className="mt-1 text-sm font-semibold text-white sm:text-base">Customer Service Quality Monitoring Platform</div>
                    <div className="mt-1 text-xs text-violet-100/80 sm:text-sm">Optimized to fit browser view without manual zoom out</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative bg-white p-5 sm:p-6 lg:p-7">
              {songkranTheme ? <SongkranFlowerCorner className="right-2 top-2 opacity-80" /> : null}

              <div className="mx-auto w-full max-w-[400px]">
                <div className="flex justify-center lg:justify-start">
                  <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-violet-200 bg-violet-50 shadow-sm">
                    <img src="/robinhood-logo.png" alt="Robinhood" className="h-9 w-9 object-contain" />
                  </div>
                </div>

                <div className="mt-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-700">Sign In</div>
                  <div className="mt-2 text-[26px] font-bold tracking-tight text-slate-900 sm:text-[30px]">Welcome back</div>
                  <div className="mt-2 text-sm leading-6 text-slate-500">
                    {maintenanceState.enabled
                      ? "Maintenance mode is active. Only Songpon admin access can continue."
                      : "Enter your credentials to access the Robinhood QA workspace."}
                  </div>
                </div>

                {maintenanceState.enabled ? (
                  <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                    {maintenanceState.message || DEFAULT_MAINTENANCE_STATE.message}
                  </div>
                ) : null}

                <div className="mt-7 space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-800">Username</label>
                    <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }} placeholder="Enter username" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100" />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-800">Password</label>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }} placeholder="Enter password" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100" />
                  </div>

                  {loginError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{loginError}</div> : null}

                  <button type="button" onClick={handleLogin} className={`w-full rounded-2xl px-4 py-3 text-sm font-bold text-white shadow-[0_14px_30px_rgba(109,40,217,0.24)] transition hover:opacity-95 ${songkranTheme ? "bg-gradient-to-r from-sky-500 via-cyan-500 to-fuchsia-500" : "bg-gradient-to-r from-violet-700 via-violet-700 to-fuchsia-600"}`}>Sign In</button>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotUsernameInput(username);
                      setShowForgotPasswordModal(true);
                    }}
                    className="w-full rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-700 transition hover:bg-violet-100"
                  >
                    Forgot Password
                  </button>
                </div>

                <div className="mt-5 flex flex-col items-start gap-2">
                  <VersionPill meta={buildMeta} className="w-full" />
                  <ReleaseNotesButton onClick={() => setShowReleaseNotesModal(true)} />
                </div>

                <div className="mt-4 text-center text-xs leading-5 text-slate-400 lg:text-left">This login layout is responsive and sized for standard laptop browser view.</div>
              </div>
            </div>
          </div>
          </div>
        </div>
      </>
    );
  }

  if (maintenanceBlocked) {
    return <MaintenanceScreen state={maintenanceState} onLogout={handleLogout} showLogout />;
  }

  return (
    <>
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
        currentUsername={currentUser.username}
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
        <div className={`relative border-b backdrop-blur-sm ${songkranTheme ? "border-cyan-100 bg-gradient-to-r from-white via-cyan-50/70 to-fuchsia-50/60" : "border-violet-100 bg-gradient-to-r from-white via-violet-50/40 to-fuchsia-50/30"}`}>
          {songkranTheme ? <SongkranBackdrop compact /> : null}

          <div className="mx-auto grid w-full max-w-[1480px] gap-4 px-4 py-3 sm:px-5 lg:px-6 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
            <div className={`relative overflow-hidden rounded-[20px] border bg-white/95 px-5 py-4 shadow-sm ${songkranTheme ? "border-cyan-200/80" : "border-slate-200"}`}>
              {songkranTheme ? <SongkranFlowerCorner className="-right-1 -top-1 scale-75 opacity-60" /> : null}

              <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex min-w-[250px] shrink-0 items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                    <img src="/robinhood-logo.png" alt="Robinhood" className="h-8 w-8 object-contain" />
                  </div>

                  <div className="min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[11px] font-bold leading-5 text-slate-950 shadow-sm">
                    <div className="text-xs font-black">Robinhood QA Welcome</div>
                    <div>User Login: {welcomeName}</div>
                    <div>Position: {currentUser.role}</div>
                    <div className="whitespace-nowrap">
                      Version {buildMeta.displayVersion || buildMeta.version}
                      {shortBuildHash ? `:${shortBuildHash}` : ""}
                    </div>
                    <div className="whitespace-nowrap">Login running time: {formatHeaderDateTime(liveNow)}</div>
                    <div className="hidden mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      <span>{currentUser.role}</span>
                      <span className="text-slate-300">•</span>
                      <span className="truncate">{currentUser.agentName}</span>
                    </div>
                    <div className="hidden mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      <span>{currentUser.role}</span>
                      <span className="text-slate-300">•</span>
                      <span>{currentUser.agentName}</span>
                    </div>
                    <div className="hidden mt-1 text-sm text-slate-500">
                      <span>{currentUser.role}</span>
                      <span className="mx-2 text-slate-300">/</span>
                      <span>{currentUser.agentName}</span>
                      <span className="mx-2 text-slate-300">/</span>
                      <span className="font-bold text-slate-700">
                        Version {buildMeta.displayVersion || buildMeta.version}
                        <span className="mx-1 text-slate-300">·</span>
                        {buildMeta.updatedAt}
                        {buildMeta.commitHash ? (
                          <>
                            <span className="mx-1 text-slate-300">·</span>
                            {buildMeta.commitHash.slice(0, 7)}
                          </>
                        ) : null}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex w-full flex-col gap-5 md:flex-row md:flex-nowrap md:justify-end md:gap-x-5 md:gap-y-5 xl:max-w-[700px]">
                  <HeaderSelect
                    label="Performance"
                    value={performanceMenuValue}
                    onChange={handlePerformanceMenuChange}
                    options={[
                      { value: "dashboard", label: "Dashboard" },
                      { value: "summary", label: "Summary" },
                      ...(coachingAllowed ? [{ value: "coaching", label: "Coaching" }] : []),
                    ]}
                  />
                  <HeaderSelect
                    label="Review"
                    value={reviewMenuValue}
                    onChange={handleReviewMenuChange}
                    options={[
                      { value: "appeal", label: "Appeal" },
                      ...(appealRequestsAllowed ? [{ value: "appeal-requests", label: "Appeal Requests" }] : []),
                      ...(appealOverrideAllowed ? [{ value: "appeal-override", label: "Appeal Override" }] : []),
                      { value: "rubric", label: "QA Rubric" },
                    ]}
                  />
                  <HeaderSelect
                    label="Account"
                    value={accountMenuDisplayValue}
                    onChange={handleAccountMenuChange}
                    options={accountOptions}
                  />
                </div>

                <div className="hidden flex-col gap-2 xl:min-w-[230px] xl:max-w-[240px]">
                  <button
                    type="button"
                    onClick={openTaskInbox}
                    className="group relative overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-700 to-fuchsia-600 px-4 py-3 text-left text-white shadow-sm transition hover:shadow-md"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-100">Task Inbox</div>
                        <div className="mt-1 text-sm font-extrabold">Inbox</div>
                      </div>
                      <span className="inline-flex min-w-8 items-center justify-center rounded-full border border-white/30 bg-white px-2.5 py-1 text-sm font-extrabold text-violet-700">
                        {unreadInboxTaskCount}
                      </span>
                    </div>
                    <div className="mt-1 text-xs font-semibold text-violet-100">
                      {unreadInboxTaskCount ? `${unreadInboxTaskCount} unread task(s)` : "No unread task"}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("team-chat");
                      void sendPresence();
                      void loadChatData();
                    }}
                    className="group relative overflow-hidden rounded-2xl border border-sky-200 bg-white px-4 py-3 text-left text-slate-950 shadow-sm transition hover:border-sky-300 hover:shadow-md"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-600">Team Chat</div>
                        <div className="mt-1 text-sm font-extrabold">Online Chat</div>
                      </div>
                      <span className="inline-flex min-w-8 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-sm font-extrabold text-emerald-700">
                        {totalChatUnreadCount || onlineUsers.length}
                      </span>
                    </div>
                    <div className="mt-1 text-xs font-semibold text-slate-500">
                      {totalChatUnreadCount ? `${totalChatUnreadCount} unread message(s)` : onlineUsers.length ? `${onlineUsers.length} online user(s)` : "No online user yet"}
                    </div>
                  </button>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={openTaskInbox}
                className="group relative overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-700 to-fuchsia-600 px-4 py-3 text-left text-white shadow-sm transition hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-100">Task Inbox</div>
                    <div className="mt-1 text-sm font-extrabold">Inbox</div>
                  </div>
                  <span className="inline-flex min-w-8 items-center justify-center rounded-full border border-white/30 bg-white px-2.5 py-1 text-sm font-extrabold text-violet-700">
                    {unreadInboxTaskCount}
                  </span>
                </div>
                <div className="mt-1 text-xs font-semibold text-violet-100">
                  {unreadInboxTaskCount ? `${unreadInboxTaskCount} unread task(s)` : "No unread task"}
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("team-chat");
                  void sendPresence();
                  void loadChatData();
                }}
                className="group relative overflow-hidden rounded-2xl border border-sky-200 bg-white px-4 py-3 text-left text-slate-950 shadow-sm transition hover:border-sky-300 hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-600">Team Chat</div>
                    <div className="mt-1 text-sm font-extrabold">Online Chat</div>
                  </div>
                  <span className="inline-flex min-w-8 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-sm font-extrabold text-emerald-700">
                    {totalChatUnreadCount || onlineUsers.length}
                  </span>
                </div>
                <div className="mt-1 text-xs font-semibold text-slate-500">
                  {totalChatUnreadCount ? `${totalChatUnreadCount} unread message(s)` : onlineUsers.length ? `${onlineUsers.length} online user(s)` : "No online user yet"}
                </div>
              </button>
            </div>
          </div>
        </div>

        {inboxReturnTitle && activeTab !== "task-inbox" ? (
          <div className="mx-auto w-full max-w-[1600px] px-4 pt-4 sm:px-5 lg:px-6 2xl:px-8">
            <div className="flex flex-col gap-3 rounded-[24px] border border-violet-200 bg-white px-4 py-3 shadow-[0_14px_36px_rgba(88,28,135,0.10)] sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-700">Opened from Task Inbox</div>
                <div className="mt-1 text-sm font-bold text-slate-700">{inboxReturnTitle}</div>
              </div>
              <button
                type="button"
                onClick={openTaskInbox}
                className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-violet-800"
              >
                Back to Inbox
              </button>
            </div>
          </div>
        ) : null}

        {activeTab === "dashboard" ? (
          <div>
            <div className="mx-auto w-full max-w-[1600px] px-4 pt-5 sm:px-5 lg:px-6 2xl:px-8">
              <div className="flex flex-wrap gap-2">
                <DashboardSubButton active={dashboardSubTab === "overview"} label="Overview" onClick={() => setDashboardSubTab("overview")} songkranTheme={songkranTheme} />
                <DashboardSubButton active={dashboardSubTab === "case-detail"} label="Case Detail" onClick={() => setDashboardSubTab("case-detail")} songkranTheme={songkranTheme} />
              </div>
            </div>

            <DashboardMockup
              currentUser={currentUser}
              dashboardSubTab={dashboardSubTab}
              externalSelectedAgent={selectedAgentGlobal}
              externalSelectedMonthKey={selectedMonthGlobal}
              externalSelectedWeek={selectedWeekGlobal}
              externalCaseIdSearch={selectedDashboardCaseId}
              roleScopedAgentNames={roleScopedAgentNames}
              onSelectedAgentChange={setSelectedAgentGlobal}
              onSelectedMonthKeyChange={setSelectedMonthGlobal}
              onSelectedWeekChange={setSelectedWeekGlobal}
              onOpenCaseDetail={(caseId, agentName) => {
                setActiveTab("dashboard");
                setDashboardSubTab("case-detail");
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
                const params = new URLSearchParams();
                params.set("tab", "appeal");
                params.set("caseId", caseId);
                if (agentName) {
                  params.set("agent", agentName);
                }

                const appealUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
                window.open(appealUrl, "_blank", "noopener,noreferrer");
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
            onMarkRoomRead={markChatRoomRead}
            onRefresh={() => {
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
            onSelectedAgentChange={setSelectedAgentGlobal}
            onSelectedMonthChange={setSelectedMonthGlobal}
            onSelectedWeekChange={setSelectedWeekGlobal}
          />
        ) : activeTab === "coaching" && coachingAllowed ? (
          <CoachingMockup
            currentUser={currentUser}
            externalSelectedAgent={selectedAgentGlobal}
            externalSelectedMonth={selectedMonthGlobal}
            externalSelectedWeek={selectedWeekGlobal}
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
        ) : (
          <QARubricMockup />
        )}
      </div>

      <FloatingChatWidget
        open={floatingChatOpen}
        currentUser={currentUser}
        messages={chatMessages}
        onlineUsers={onlineUsers}
        unreadCounts={chatUnreadCounts}
        totalUnread={totalChatUnreadCount}
        onToggle={() => {
          const nextOpen = !floatingChatOpen;
          setFloatingChatOpen(nextOpen);
          if (nextOpen) {
            void sendPresence();
            void loadChatData();
          }
        }}
        onOpenFullChat={() => {
          setActiveTab("team-chat");
          setFloatingChatOpen(false);
          void sendPresence();
          void loadChatData();
        }}
        onSendTeamMessage={async (message) => {
          await sendChatMessage(message);
          await loadChatData();
        }}
        onRefresh={() => {
          void sendPresence();
          void loadChatData();
        }}
      />
    </>
  );
}
