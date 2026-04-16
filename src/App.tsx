import React, { useEffect, useMemo, useRef, useState } from "react";
import DashboardMockup from "./DashboardMockup";
import AppealMockup from "./AppealMockup";
import QARubricMockup from "./QARubricMockup";
import SummaryMockup from "./SummaryMockup";
import CoachingMockup from "./CoachingMockup";
import EvaluationStudioPage from "./pages/EvaluationStudioPage";

type UserRole = "Agent" | "Supervisor";

type UserAccount = {
  username: string;
  password: string;
  displayName: string;
  role: UserRole;
  agentName: string;
};

type CurrentUser = {
  username: string;
  displayName: string;
  role: UserRole;
  agentName: string;
};

type BuildMeta = {
  appName?: string;
  version: string;
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
  { username: "Anucha", password: "Mk!A7p9#L2", displayName: "Anucha Makundin", role: "Supervisor", agentName: "Anucha Makundin" },
  { username: "Arisa", password: "Ri$4Kq2@Zm", displayName: "Arisa Aiemrit", role: "Agent", agentName: "Arisa Aiemrit" },
  { username: "Chatkonnaphat", password: "Ct#8Lm3!Qa", displayName: "Chatkonnaphat Bhusomya", role: "Agent", agentName: "Chatkonnaphat Bhusomya" },
  { username: "Jariyawadee", password: "Jy@5Nx9#Wp", displayName: "Jariyawadee Taboodda", role: "Agent", agentName: "Jariyawadee Taboodda" },
  { username: "Jureeporn", password: "Jp!6Vr2@Kd", displayName: "Jureeporn Piddum", role: "Agent", agentName: "Jureeporn Piddum" },
  { username: "Krivut", password: "Kv#9Ts4!Mb", displayName: "Krivut Vongkampan", role: "Supervisor", agentName: "Krivut Vongkampan" },
  { username: "Natcha", password: "Nc@7Pw3#Lf", displayName: "Natcha Chai-in", role: "Agent", agentName: "Natcha Chai-in" },
  { username: "Nattapol", password: "Np!4Xz8@Hr", displayName: "Nattapol Suprom", role: "Agent", agentName: "Nattapol Suprom" },
  { username: "Phrommarin", password: "RBH1234", displayName: "Phrommarin Thaithorn", role: "Supervisor", agentName: "Phrommarin Thaithorn" },
  { username: "Songpon", password: "Boom@4421L", displayName: "Songpon Phothong", role: "Supervisor", agentName: "Songpon Phothong" },
  { username: "Sunijtra", password: "Sj#6Qm1!Ty", displayName: "Sunijtra Siritip", role: "Agent", agentName: "Sunijtra Siritip" },
  { username: "Supakrit", password: "sP9#kM4!", displayName: "Supakrit Promkhamnoi", role: "Agent", agentName: "Supakrit Promkhamnoi" },
  { username: "Suphitcha", password: "Sp@8Ld2#Vk", displayName: "Suphitcha Keawliam", role: "Supervisor", agentName: "Suphitcha Keawliam" },
  { username: "Wachiraporn", password: "wL7$cl2@", displayName: "Wachiraporn Chailittichai", role: "Agent", agentName: "Wachiraporn Chailittichai" },
  { username: "Wassana", password: "Ws!3Kr7@Pn", displayName: "Wassana Phothong", role: "Agent", agentName: "Wassana Phothong" },
];

const STORAGE_KEY = "qa_current_user";
const PASSWORD_OVERRIDE_KEY = "qa_password_overrides";
const INACTIVITY_LIMIT_MS = 30 * 60 * 1000;
const WARNING_BEFORE_MS = 1 * 60 * 1000;
const WARNING_TIME_MS = INACTIVITY_LIMIT_MS - WARNING_BEFORE_MS;

const SONGKRAN_THEME_START = new Date(2026, 3, 1, 0, 0, 0);
const SONGKRAN_THEME_END = new Date(2026, 3, 25, 23, 59, 59);

const DEFAULT_BUILD_META: BuildMeta = {
  appName: "qa-dashboard",
  version: "1.0.0",
  updatedAt: "16/04/2026 00:00:00",
  releaseLabel: "v1.0.0 build 1",
  author: "Songpon Phothong",
  buildNumber: 1,
  releaseNotesTitle: "Latest Updates",
  releaseNotes: ["Initial tracked release"],
  changedFiles: [],
  commitHash: "",
  commitMessage: "",
  timezone: "Asia/Bangkok",
};

function isSongkranThemeActive() {
  const now = new Date();
  return now >= SONGKRAN_THEME_START && now <= SONGKRAN_THEME_END;
}

function readStoredUser(): CurrentUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CurrentUser;
    if (
      !parsed ||
      typeof parsed.username !== "string" ||
      typeof parsed.displayName !== "string" ||
      typeof parsed.role !== "string" ||
      typeof parsed.agentName !== "string"
    ) {
      return null;
    }
    return parsed;
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
      className={`relative overflow-hidden rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
        active
          ? songkranTheme
            ? "border border-cyan-200 bg-gradient-to-r from-cyan-400 via-sky-400 to-fuchsia-400 text-white shadow-[0_10px_24px_rgba(34,211,238,0.28)]"
            : "bg-gradient-to-r from-violet-700 to-fuchsia-600 text-white shadow-[0_8px_20px_rgba(124,58,237,0.22)]"
          : "border border-transparent bg-transparent text-slate-600 hover:bg-white hover:text-violet-700"
      }`}
    >
      <span className="relative z-10">{label}</span>
    </button>
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

function ResetPasswordModal({
  open,
  onClose,
  selectedUsername,
  setSelectedUsername,
  onReset,
  resultMessage,
}: {
  open: boolean;
  onClose: () => void;
  selectedUsername: string;
  setSelectedUsername: (value: string) => void;
  onReset: () => void;
  resultMessage: string;
}) {
  if (!open) return null;
  const resettableUsers = USER_ACCOUNTS.filter((item) => item.role === "Agent");
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 px-4">
      <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl">
        <div className="text-xl font-bold text-slate-900">Reset Password</div>
        <div className="mt-2 text-sm text-slate-500">Supervisor can reset agent password back to default.</div>
        <div className="mt-6 space-y-4">
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

function VersionPill({
  meta,
  light = false,
  className = "",
}: {
  meta: BuildMeta;
  light?: boolean;
  className?: string;
}) {
  const shell = light
    ? "border-white/20 bg-white/10 text-white/90"
    : "border-violet-200/70 bg-white text-slate-700";

  const sub = light ? "text-white/70" : "text-slate-500";
  const shortHash = meta.commitHash ? meta.commitHash.slice(0, 7) : "";

  return (
    <div className={`inline-flex flex-col gap-2 rounded-[20px] border px-3 py-2 shadow-sm backdrop-blur-sm ${shell} ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <MetaChip>v{meta.version}</MetaChip>
        <MetaChip>Build {meta.buildNumber}</MetaChip>
        <MetaChip>{meta.releaseLabel}</MetaChip>
        {shortHash ? <MetaChip>{shortHash}</MetaChip> : null}
      </div>
      <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] ${sub}`}>
        <span>Updated {meta.updatedAt}</span>
        <span>•</span>
        <span>by {meta.author}</span>
      </div>
    </div>
  );
}

function ReleaseNotesButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center rounded-full border border-violet-200 bg-white px-3.5 py-2 text-[11px] font-semibold text-violet-700 shadow-sm transition hover:bg-violet-50"
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

  const shortHash = meta.commitHash ? meta.commitHash.slice(0, 7) : "";

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 px-4">
      <div className="w-full max-w-3xl rounded-[30px] bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-600">
              {meta.releaseNotesTitle || "Release Notes"}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900">v{meta.version}</span>
              <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">Build {meta.buildNumber}</span>
              {shortHash ? (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {shortHash}
                </span>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <MetaChip>{meta.releaseLabel}</MetaChip>
              <MetaChip>Updated {meta.updatedAt}</MetaChip>
              <MetaChip>by {meta.author}</MetaChip>
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

  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [resetTargetUsername, setResetTargetUsername] = useState("");
  const [resetResultMessage, setResetResultMessage] = useState("");
  const [buildMeta, setBuildMeta] = useState<BuildMeta>(DEFAULT_BUILD_META);
  const [showReleaseNotesModal, setShowReleaseNotesModal] = useState(false);

  const [activeTab, setActiveTab] = useState<
    "dashboard" | "appeal" | "summary" | "coaching" | "rubric" | "evaluation-studio"
  >("dashboard");
  const [dashboardSubTab, setDashboardSubTab] = useState<"overview" | "case-detail">("overview");

  const [selectedAgentGlobal, setSelectedAgentGlobal] = useState("");
  const [selectedMonthGlobal, setSelectedMonthGlobal] = useState("all");
  const [selectedWeekGlobal, setSelectedWeekGlobal] = useState("all");

  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const welcomeName = useMemo(() => {
    if (!currentUser) return "";
    return currentUser.displayName || currentUser.username;
  }, [currentUser]);

  const songkranTheme = useMemo(() => isSongkranThemeActive(), []);

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

  const handleLogout = () => {
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
    const normalizedUsername = username.trim().toLowerCase();
    const normalizedPassword = password.trim();

    const matchedUser = USER_ACCOUNTS.find((item) => {
      const normalizedItemUsername = item.username.trim().toLowerCase();
      const effectivePassword = getEffectivePassword(item);

      return normalizedItemUsername === normalizedUsername && effectivePassword === normalizedPassword;
    });

    if (!matchedUser) {
      setLoginError("Invalid username or password");
      return;
    }

    const nextUser: CurrentUser = {
      username: matchedUser.username,
      displayName: matchedUser.displayName,
      role: matchedUser.role,
      agentName: matchedUser.agentName,
    };

    setCurrentUser(nextUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));

    setLoginError("");
    setUsername("");
    setPassword("");
    setActiveTab("dashboard");
    setDashboardSubTab("overview");
    setSelectedAgentGlobal(matchedUser.role === "Agent" ? matchedUser.agentName : "");
    setSelectedMonthGlobal("all");
    setSelectedWeekGlobal("all");
  };

  const handleStayLoggedIn = () => {
    startSessionTimers();
  };

  const handleChangePassword = () => {
    if (!currentUser) return;

    const account = USER_ACCOUNTS.find(
      (item) => item.username.trim().toLowerCase() === currentUser.username.trim().toLowerCase()
    );

    if (!account) {
      setChangePasswordError("User account not found");
      setChangePasswordSuccess("");
      return;
    }

    const effectivePassword = getEffectivePassword(account);

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

    if (newPasswordInput.length < 6) {
      setChangePasswordError("New password must be at least 6 characters");
      setChangePasswordSuccess("");
      return;
    }

    if (newPasswordInput !== confirmNewPasswordInput) {
      setChangePasswordError("New password and confirm password do not match");
      setChangePasswordSuccess("");
      return;
    }

    savePasswordOverride(currentUser.username, newPasswordInput);

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
    if (!resetTargetUsername) return;
    removePasswordOverride(resetTargetUsername);
    const targetAccount = USER_ACCOUNTS.find((item) => item.username === resetTargetUsername);
    const targetName = targetAccount?.displayName || resetTargetUsername;
    setResetResultMessage(`Password for ${targetName} has been reset to default.`);
  };

  if (!currentUser) {
    return (
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
      />

      <div className="min-h-screen bg-slate-100">
        <div className={`relative border-b backdrop-blur-sm ${songkranTheme ? "border-cyan-100 bg-gradient-to-r from-white via-cyan-50/70 to-fuchsia-50/60" : "border-violet-100 bg-gradient-to-r from-white via-violet-50/40 to-fuchsia-50/30"}`}>
          {songkranTheme ? <SongkranBackdrop compact /> : null}

          <div className="mx-auto w-full max-w-[1600px] px-4 py-4 sm:px-5 lg:px-6 2xl:px-8">
            <div className="grid gap-4 xl:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] xl:items-start">
              <div className={`relative min-w-0 rounded-[24px] border bg-white/90 px-5 py-4 shadow-sm ${songkranTheme ? "border-cyan-200/80" : "border-violet-200/70"}`}>
                {songkranTheme ? <SongkranFlowerCorner className="-right-2 -top-2 opacity-80" /> : null}
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-700">Robinhood QA</div>
                <div className="mt-1 break-words text-xl font-extrabold leading-tight tracking-tight text-slate-800 sm:text-2xl">Welcome, {welcomeName}</div>
                {songkranTheme ? <div className="mt-3"><SongkranBadge /></div> : null}
                <div className="mt-2 space-y-1 text-sm text-slate-500">
                  <div>Role: <span className="font-semibold text-slate-700">{currentUser.role}</span></div>
                  <div>Agent Name: <span className="font-semibold text-slate-700">{currentUser.agentName}</span></div>
                </div>
              </div>

              <div className="grid gap-3">
                <div className={`relative flex flex-wrap items-center gap-3 overflow-hidden rounded-[24px] border bg-white/90 px-3 py-3 shadow-sm ${songkranTheme ? "border-cyan-200/80" : "border-violet-200/80"}`}>
                  <span className="px-2 text-[11px] font-bold uppercase tracking-[0.16em] text-violet-500">Performance</span>
                  <NavButton active={activeTab === "dashboard"} label="Dashboard" onClick={() => setActiveTab("dashboard")} songkranTheme={songkranTheme} />
                  <NavButton active={activeTab === "summary"} label="Summary" onClick={() => setActiveTab("summary")} songkranTheme={songkranTheme} />
                  <NavButton active={activeTab === "coaching"} label="Coaching" onClick={() => setActiveTab("coaching")} songkranTheme={songkranTheme} />

                  <span className="ml-1 px-2 text-[11px] font-bold uppercase tracking-[0.16em] text-fuchsia-500">Review</span>
                  <NavButton active={activeTab === "appeal"} label="Appeal" onClick={() => setActiveTab("appeal")} songkranTheme={songkranTheme} />
                  <NavButton active={activeTab === "rubric"} label="QA Rubric" onClick={() => setActiveTab("rubric")} songkranTheme={songkranTheme} />
                  <NavButton active={activeTab === "evaluation-studio"} label="Evaluation Studio" onClick={() => setActiveTab("evaluation-studio")} songkranTheme={songkranTheme} />
                </div>

                <div className={`relative flex flex-wrap items-center gap-3 rounded-[24px] border bg-white/90 px-3 py-3 shadow-sm ${songkranTheme ? "border-fuchsia-200/70" : "border-slate-200"}`}>
                  <span className="px-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Account</span>

                  <button type="button" onClick={() => { resetChangePasswordState(); setShowChangePasswordModal(true); }} className="rounded-xl border border-transparent bg-transparent px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-violet-700">Change Password</button>

                  {currentUser.role === "Supervisor" ? (
                    <button type="button" onClick={() => { resetPasswordModalState(); setShowResetPasswordModal(true); }} className="rounded-xl border border-transparent bg-transparent px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-amber-700">Reset Password</button>
                  ) : null}

                  <button type="button" onClick={handleLogout} className="rounded-xl border border-transparent bg-transparent px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-rose-700">Log Out</button>

                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <ReleaseNotesButton onClick={() => setShowReleaseNotesModal(true)} />
                    <VersionPill meta={buildMeta} />
                  </div>
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
              onOpenCaseDetail={() => { setActiveTab("dashboard"); setDashboardSubTab("case-detail"); }}
            />
          </div>
        ) : activeTab === "appeal" ? (
          <AppealMockup currentUser={currentUser} externalSelectedAgent={selectedAgentGlobal} onSelectedAgentChange={setSelectedAgentGlobal} />
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
        ) : activeTab === "coaching" ? (
          <CoachingMockup
            currentUser={currentUser}
            externalSelectedAgent={selectedAgentGlobal}
            externalSelectedMonth={selectedMonthGlobal}
            externalSelectedWeek={selectedWeekGlobal}
            onSelectedAgentChange={setSelectedAgentGlobal}
            onSelectedMonthChange={setSelectedMonthGlobal}
            onSelectedWeekChange={setSelectedWeekGlobal}
          />
        ) : activeTab === "evaluation-studio" ? (
          <EvaluationStudioPage />
        ) : (
          <QARubricMockup />
        )}
      </div>
    </>
  );
}
