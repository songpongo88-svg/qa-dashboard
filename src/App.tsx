import React, { useEffect, useMemo, useRef, useState } from "react";
import DashboardMockup from "./DashboardMockup";
import AppealMockup from "./AppealMockup";
import AppealRequestsMockup, { buildAppealRequests } from "./AppealRequestsMockup";
import QARubricMockup from "./QARubricMockup";
import SummaryMockup from "./SummaryMockup";
import CoachingMockup from "./CoachingMockup";
import UsageLogMockup from "./UsageLogMockup";
import UserRoleAdminMockup from "./UserRoleAdminMockup";
import { fetchUsageLogs, logUsageEvent, UsageLogEvent } from "./usageLog";

type UserRole = "Agent" | "Supervisor" | "Quality Assurance";

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

type PasswordResetRequest = {
  requestId: string;
  username: string;
  displayName: string;
  email: string;
  requestedAt: string;
  status: "Pending" | "Approved" | "Rejected";
  tempPassword?: string;
};

const ROLE_OPTIONS: UserRole[] = ["Agent", "Supervisor", "Quality Assurance"];

function isUserRole(value: unknown): value is UserRole {
  return ROLE_OPTIONS.includes(value as UserRole);
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

function getRoleUpdateUsername(log: UsageLogEvent) {
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

async function getCentralPasswordOverride(username: string) {
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

    return typeof passwordEvent?.details?.password === "string" ? passwordEvent.details.password : "";
  } catch {
    return "";
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
  return (
    <label className="flex min-w-[170px] flex-col gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 rounded-[14px] border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-800 outline-none transition hover:border-slate-300 focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
      >
        <option value="">{label}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
  error: string;
  success: string;
  onSubmit: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 px-4">
      <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl">
        <div className="text-xl font-bold text-slate-900">Change Password</div>
        <div className="mt-2 text-sm text-slate-500">Update your password for this browser.</div>
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
  onRefreshRequests: () => void;
  onApproveRequest: (request: PasswordResetRequest) => void;
  onRejectRequest: (request: PasswordResetRequest) => void;
}) {
  if (!open) return null;
  const normalizedCurrentUsername = currentUsername.trim().toLowerCase();
  const resettableUsers = USER_ACCOUNTS.filter((item) => item.username.trim().toLowerCase() !== normalizedCurrentUsername);
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

  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [forgotUsernameInput, setForgotUsernameInput] = useState("");
  const [forgotEmailInput, setForgotEmailInput] = useState("");
  const [forgotPasswordError, setForgotPasswordError] = useState("");
  const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState("");

  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [resetTargetUsername, setResetTargetUsername] = useState("");
  const [resetResultMessage, setResetResultMessage] = useState("");
  const [passwordResetRequests, setPasswordResetRequests] = useState<PasswordResetRequest[]>([]);
  const [appealTaskCount, setAppealTaskCount] = useState(0);
  const [roleOverrides, setRoleOverrides] = useState<Record<string, UserRole>>({});
  const [buildMeta, setBuildMeta] = useState<BuildMeta>(DEFAULT_BUILD_META);
  const [showReleaseNotesModal, setShowReleaseNotesModal] = useState(false);

  const [activeTab, setActiveTab] = useState<
    "dashboard" | "appeal" | "appeal-requests" | "summary" | "coaching" | "rubric" | "usage-log" | "user-roles"
  >("dashboard");
  const [dashboardSubTab, setDashboardSubTab] = useState<"overview" | "case-detail">("overview");
  const [accountMenuValue, setAccountMenuValue] = useState("");

  const [selectedAgentGlobal, setSelectedAgentGlobal] = useState("");
  const [selectedMonthGlobal, setSelectedMonthGlobal] = useState("all");
  const [selectedWeekGlobal, setSelectedWeekGlobal] = useState("all");
  const [selectedAppealCaseId, setSelectedAppealCaseId] = useState("");

  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const welcomeName = useMemo(() => {
    if (!currentUser) return "";
    return currentUser.displayName || currentUser.username;
  }, [currentUser]);

  const songkranTheme = useMemo(() => isSongkranThemeActive(), []);
  const coachingAllowed = canAccessCoaching(currentUser);
  const usageLogAllowed = canAccessUsageLog(currentUser);
  const appealRequestsAllowed = canAccessAppealRequests(currentUser);
  const passwordResetAdminAllowed = canAccessPasswordResetAdmin(currentUser);
  const roleAdminAllowed = canAccessUserRoleAdmin(currentUser);
  const canUseAdminAccountMenu = currentUser?.role === "Supervisor" || currentUser?.role === "Quality Assurance";
  const performanceMenuValue =
    activeTab === "dashboard" || activeTab === "summary" || (activeTab === "coaching" && coachingAllowed)
      ? activeTab
      : "";
  const reviewMenuValue = activeTab === "appeal" || activeTab === "appeal-requests" || activeTab === "rubric" ? activeTab : "";
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
    if (value === "appeal" || value === "appeal-requests" || value === "rubric") {
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

  const loadAppealTaskCount = async () => {
    if (!appealRequestsAllowed) {
      setAppealTaskCount(0);
      return;
    }
    try {
      const logs = await fetchUsageLogs(5000);
      const pendingCount = buildAppealRequests(logs).filter((item) => item.status === "Pending").length;
      setAppealTaskCount(pendingCount);
    } catch {
      setAppealTaskCount(0);
    }
  };

  const loadRoleOverrides = async () => {
    try {
      const logs = await fetchUsageLogs(5000);
      const nextOverrides = buildUserRoleOverrides(logs);
      setRoleOverrides(nextOverrides);

      setCurrentUser((previousUser) => {
        if (!previousUser) return previousUser;
        const normalizedUsername = previousUser.username.trim().toLowerCase();
        const baseAccount = USER_ACCOUNTS.find((account) => account.username.trim().toLowerCase() === normalizedUsername);
        const nextRole = nextOverrides[normalizedUsername] || baseAccount?.role;
        if (!nextRole || nextRole === previousUser.role) return previousUser;
        return { ...previousUser, role: nextRole };
      });
    } catch {
      setRoleOverrides({});
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
    if (activeTab === "coaching" && !coachingAllowed) {
      setActiveTab("dashboard");
    }
    if (activeTab === "usage-log" && !usageLogAllowed) {
      setActiveTab("dashboard");
    }
    if (activeTab === "appeal-requests" && !appealRequestsAllowed) {
      setActiveTab("dashboard");
    }
    if (activeTab === "user-roles" && !roleAdminAllowed) {
      setActiveTab("dashboard");
    }
  }, [activeTab, coachingAllowed, usageLogAllowed, appealRequestsAllowed, roleAdminAllowed]);

  useEffect(() => {
    if (!currentUser) {
      setRoleOverrides({});
      return;
    }

    void loadRoleOverrides();
  }, [currentUser?.username]);

  useEffect(() => {
    if (!currentUser) return;
    logUsageEvent(currentUser, "tab_view", {
      tab: activeTab,
      details: { dashboardSubTab },
    });
  }, [activeTab, dashboardSubTab, currentUser]);

  useEffect(() => {
    if (!currentUser || !appealRequestsAllowed) {
      setAppealTaskCount(0);
      return;
    }

    void loadAppealTaskCount();
    const timer = window.setInterval(() => {
      void loadAppealTaskCount();
    }, 60000);

    return () => window.clearInterval(timer);
  }, [currentUser, appealRequestsAllowed, activeTab]);

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
  };

  const resetForgotPasswordState = () => {
    setForgotUsernameInput("");
    setForgotEmailInput("");
    setForgotPasswordError("");
    setForgotPasswordSuccess("");
  };

  const handleLogout = () => {
    if (currentUser) {
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

    const matchedAccount = USER_ACCOUNTS.find(
      (item) => item.username.trim().toLowerCase() === normalizedUsername
    );

    if (matchedAccount?.status === "Suspended") {
      const reason = matchedAccount.suspendReason ? ` (${matchedAccount.suspendReason})` : "";
      setLoginError(`This account has been suspended${reason}. Please contact Supervisor.`);
      return;
    }

    const centralPassword = matchedAccount ? await getCentralPasswordOverride(matchedAccount.username) : "";
    const effectivePassword = centralPassword || (matchedAccount ? getEffectivePassword(matchedAccount) : "");
    const matchedUser =
      matchedAccount && effectivePassword === normalizedPassword
        ? matchedAccount
        : null;

    if (!matchedUser) {
      setLoginError("Invalid username or password");
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

    setCurrentUser(nextUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
    logUsageEvent(nextUser, "login", { tab: "dashboard" });

    setLoginError("");
    setUsername("");
    setPassword("");
    setActiveTab("dashboard");
    setDashboardSubTab("overview");
    setSelectedAgentGlobal(effectiveRole === "Agent" ? matchedUser.agentName : "");
    setSelectedMonthGlobal("all");
    setSelectedWeekGlobal("all");
    void loadRoleOverrides();
  };

  const handleForgotPasswordReset = () => {
    void handleForgotPasswordRequest();
  };

  const handleForgotPasswordRequest = async () => {
    const normalizedUsername = forgotUsernameInput.trim().toLowerCase();
    const normalizedEmail = normalizeEmail(forgotEmailInput);
    const account = USER_ACCOUNTS.find((item) => item.username.trim().toLowerCase() === normalizedUsername);

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

    const account = USER_ACCOUNTS.find(
      (item) => item.username.trim().toLowerCase() === currentUser.username.trim().toLowerCase()
    );

    if (!account) {
      setChangePasswordError("User account not found");
      setChangePasswordSuccess("");
      return;
    }

    const centralPassword = await getCentralPasswordOverride(account.username);
    const effectivePassword = centralPassword || getEffectivePassword(account);

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

    savePasswordOverride(currentUser.username, newPasswordInput);
    await logUsageEvent(currentUser, "password_changed", {
      tab: "account",
      target_agent: currentUser.username,
      details: { password: newPasswordInput },
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
    const targetAccount = USER_ACCOUNTS.find((item) => item.username === resetTargetUsername);
    const targetName = targetAccount?.displayName || resetTargetUsername;
    if (currentUser && targetAccount) {
      await logUsageEvent(currentUser, "password_reset_approved", {
        tab: "account",
        target_agent: targetAccount.username,
        details: {
          requestId: `manual-default-${targetAccount.username.toLowerCase()}-${Date.now()}`,
          password: targetAccount.password,
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
    await logUsageEvent(currentUser, "password_reset_approved", {
      tab: "account",
      target_agent: request.username,
      details: {
        requestId: request.requestId,
        password: tempPassword,
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
                  <div className="mt-2 text-sm leading-6 text-slate-500">Enter your credentials to access the Robinhood QA workspace.</div>
                </div>

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

          <div className="mx-auto w-full max-w-[1320px] px-4 py-3 sm:px-5 lg:px-6">
            <div className={`relative overflow-hidden rounded-[20px] border bg-white/95 px-5 py-4 shadow-sm ${songkranTheme ? "border-cyan-200/80" : "border-slate-200"}`}>
              {songkranTheme ? <SongkranFlowerCorner className="-right-1 -top-1 scale-75 opacity-60" /> : null}

              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex min-w-0 flex-1 items-center gap-3 xl:max-w-[360px]">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                    <img src="/robinhood-logo.png" alt="Robinhood" className="h-8 w-8 object-contain" />
                  </div>

                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700">Robinhood QA</div>
                    <div className="mt-1 text-[16px] font-extrabold leading-tight tracking-tight text-slate-900 sm:text-[18px]">Welcome, {welcomeName}</div>
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
                    <div className="mt-1 text-sm text-slate-500">
                      <span>{currentUser.role}</span>
                      <span className="mx-2 text-slate-300">/</span>
                      <span>{currentUser.agentName}</span>
                    </div>
                  </div>
                </div>

                <div className="grid flex-1 gap-3 md:grid-cols-3 xl:max-w-[620px]">
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
                      { value: "rubric", label: "QA Rubric" },
                    ]}
                  />
                  <HeaderSelect
                    label="Account"
                    value={accountMenuValue}
                    onChange={handleAccountMenuChange}
                    options={accountOptions}
                  />
                </div>

                <div className="flex flex-col gap-2 xl:min-w-[230px] xl:max-w-[240px]">
                  {appealRequestsAllowed ? (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab("appeal-requests");
                        void loadAppealTaskCount();
                      }}
                      className="group relative overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-700 to-fuchsia-600 px-4 py-3 text-left text-white shadow-sm transition hover:shadow-md"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-100">Task Inbox</div>
                          <div className="mt-1 text-sm font-extrabold">Appeal Requests</div>
                        </div>
                        <span className="inline-flex min-w-8 items-center justify-center rounded-full border border-white/30 bg-white px-2.5 py-1 text-sm font-extrabold text-violet-700">
                          {appealTaskCount}
                        </span>
                      </div>
                      <div className="mt-1 text-xs font-semibold text-violet-100">
                        {appealTaskCount ? "Pending case(s) waiting for review" : "No pending appeal task"}
                      </div>
                    </button>
                  ) : null}
                  <ReleaseNotesButton onClick={() => setShowReleaseNotesModal(true)} />
                  <VersionPill meta={buildMeta} />
                </div>
              </div>
            </div>
          </div>
        </div>

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
          <AppealRequestsMockup currentUser={currentUser} onTasksChanged={loadAppealTaskCount} />
        ) : activeTab === "summary" ? (
          <SummaryMockup
            currentUser={currentUser}
            externalSelectedAgent={selectedAgentGlobal}
            externalSelectedMonth={selectedMonthGlobal}
            externalSelectedWeek={selectedWeekGlobal}
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
            accounts={USER_ACCOUNTS}
            currentUser={currentUser}
            roleOverrides={roleOverrides}
            onRolesChanged={loadRoleOverrides}
          />
        ) : (
          <QARubricMockup />
        )}
      </div>
    </>
  );
}
