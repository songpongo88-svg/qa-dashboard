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

const USER_ACCOUNTS: UserAccount[] = [
  {
    username: "Anucha",
    password: "Mk!A7p9#L2",
    displayName: "Anucha Makundin",
    role: "Supervisor",
    agentName: "Anucha Makundin",
  },
  {
    username: "Arisa",
    password: "Ri$4Kq2@Zm",
    displayName: "Arisa aiemrit",
    role: "Agent",
    agentName: "Arisa aiemrit",
  },
  {
    username: "Chatkonnaphat",
    password: "Ct#8Lm3!Qa",
    displayName: "Chatkonnaphat Bhusomya",
    role: "Agent",
    agentName: "Chatkonnaphat Bhusomya",
  },
  {
    username: "Jariyawadee",
    password: "Jy@5Nx9#Wp",
    displayName: "Jariyawadee Taboodda",
    role: "Agent",
    agentName: "Jariyawadee Taboodda",
  },
  {
    username: "Jureeporn",
    password: "Jp!6Vr2@Kd",
    displayName: "Jureeporn Piddum",
    role: "Agent",
    agentName: "Jureeporn Piddum",
  },
  {
    username: "Krivut",
    password: "Kv#9Ts4!Mb",
    displayName: "Krivut Vongkampan",
    role: "Supervisor",
    agentName: "Krivut Vongkampan",
  },
  {
    username: "Natcha",
    password: "Nc@7Pw3#Lf",
    displayName: "Natcha Chai-in",
    role: "Agent",
    agentName: "Natcha Chai-in",
  },
  {
    username: "Nattapol",
    password: "Np!4Xz8@Hr",
    displayName: "Nattapol Suprom",
    role: "Agent",
    agentName: "Nattapol Suprom",
  },
  {
    username: "Phrommarin",
    password: "RBH1234",
    displayName: "Phrommarin Thaithorn",
    role: "Supervisor",
    agentName: "Phrommarin Thaithorn",
  },
  {
    username: "Songpon",
    password: "Boom@4421L",
    displayName: "Songpon Phothong",
    role: "Supervisor",
    agentName: "Songpon Phothong",
  },
  {
    username: "Sunijtra",
    password: "Sj#6Qm1!Ty",
    displayName: "Sunijtra Siritan",
    role: "Agent",
    agentName: "Sunijtra Siritan",
  },
  {
    username: "Supakrit",
    password: "sP9#kM4!",
    displayName: "Supakrit Promkhamnoi",
    role: "Agent",
    agentName: "Supakrit Promkhamnoi",
  },
  {
    username: "Suphitcha",
    password: "Sp@8Ld2#Vk",
    displayName: "Suphitcha Keawliam",
    role: "Supervisor",
    agentName: "Suphitcha Keawliam",
  },
  {
    username: "Wachiraporn",
    password: "wL7$cl2@",
    displayName: "Wachiraporn chailittichai",
    role: "Agent",
    agentName: "Wachiraporn chailittichai",
  },
  {
    username: "Wassana",
    password: "Ws!3Kr7@Pn",
    displayName: "Wassana Phothong",
    role: "Agent",
    agentName: "Wassana Phothong",
  },
];

const STORAGE_KEY = "qa_current_user";
const PASSWORD_OVERRIDE_KEY = "qa_password_overrides";
const INACTIVITY_LIMIT_MS = 30 * 60 * 1000;
const WARNING_BEFORE_MS = 1 * 60 * 1000;
const WARNING_TIME_MS = INACTIVITY_LIMIT_MS - WARNING_BEFORE_MS;

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

function LogoBox() {
  return (
    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white/12 shadow-[0_12px_34px_rgba(0,0,0,0.16)] backdrop-blur-sm sm:h-20 sm:w-20 sm:rounded-[26px]">
      <img
        src="/robinhood-logo.png"
        alt="Robinhood Logo"
        className="h-10 w-10 object-contain sm:h-14 sm:w-14"
      />
    </div>
  );
}

function NavButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
        active
          ? "bg-gradient-to-r from-violet-700 to-fuchsia-600 text-white shadow-[0_8px_20px_rgba(124,58,237,0.22)]"
          : "border border-transparent bg-transparent text-slate-600 hover:bg-white hover:text-violet-700"
      }`}
    >
      {label}
    </button>
  );
}

function DashboardSubButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
        active
          ? "border border-violet-300 bg-violet-100 text-violet-800"
          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {label}
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
          You have been inactive for a while. Your session will be logged out automatically in
          1 minute unless you choose to stay signed in.
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onLogoutNow}
            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
          >
            Log Out Now
          </button>
          <button
            type="button"
            onClick={onStayLoggedIn}
            className="rounded-2xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-800"
          >
            Stay Logged In
          </button>
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
        <div className="mt-2 text-sm text-slate-500">
          Update your password for this browser.
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-800">
              Current Password
            </label>
            <input
              type="password"
              value={currentPasswordInput}
              onChange={(e) => setCurrentPasswordInput(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-800">
              New Password
            </label>
            <input
              type="password"
              value={newPasswordInput}
              onChange={(e) => setNewPasswordInput(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-800">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmNewPasswordInput}
              onChange={(e) => setConfirmNewPasswordInput(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
            />
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {error}
            </div>
          ) : null}

          {success ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              {success}
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            className="rounded-2xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800"
          >
            Save Password
          </button>
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
        <div className="mt-2 text-sm text-slate-500">
          Supervisor can reset agent password back to default.
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-800">
              Select Agent
            </label>
            <select
              value={selectedUsername}
              onChange={(e) => setSelectedUsername(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
            >
              <option value="">Select Agent</option>
              {resettableUsers.map((item) => (
                <option key={item.username} value={item.username}>
                  {item.displayName}
                </option>
              ))}
            </select>
          </div>

          {resultMessage ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              {resultMessage}
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onReset}
            className="rounded-2xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700"
          >
            Reset to Default
          </button>
        </div>
      </div>
    </div>
  );
}

function LoginFeatureCard({
  title,
  desc,
}: {
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-[20px] border border-white/15 bg-white/10 p-3.5 backdrop-blur-sm">
      <div className="text-[11px] uppercase tracking-[0.18em] text-violet-100/80">{title}</div>
      <div className="mt-2 text-sm font-semibold leading-6 text-white/95">{desc}</div>
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

  const [activeTab, setActiveTab] = useState<
    "dashboard" | "appeal" | "summary" | "rubric" | "coaching" | "evaluation-studio"
  >("dashboard");
  const [dashboardSubTab, setDashboardSubTab] = useState<"overview" | "case-detail">("overview");
  const [selectedAgentGlobal, setSelectedAgentGlobal] = useState("");

  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const welcomeName = useMemo(() => {
    if (!currentUser) return "";
    return currentUser.displayName || currentUser.username;
  }, [currentUser]);

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

      return (
        normalizedItemUsername === normalizedUsername &&
        effectivePassword === normalizedPassword
      );
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
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-fuchsia-50">
        <div className="mx-auto flex min-h-screen w-full max-w-[1180px] items-center justify-center px-4 py-4 sm:px-5 lg:px-6">
          <div className="grid w-full max-w-[1020px] overflow-hidden rounded-[24px] border border-violet-200/70 bg-white shadow-[0_18px_56px_rgba(76,29,149,0.10)] lg:grid-cols-[1fr_0.94fr]">
            <div className="relative overflow-hidden bg-gradient-to-br from-violet-950 via-violet-900 to-fuchsia-700 p-5 text-white sm:p-6 lg:p-7">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.16),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.12),transparent_28%)]" />

              <div className="relative z-10">
                <div className="flex items-start justify-between gap-4">
                  <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-100">
                    Secure Access
                  </div>
                  <LogoBox />
                </div>

                <div className="mt-7 text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-200">
                  Robinhood Customer Service QA
                </div>

                <div className="mt-3 text-[28px] font-bold tracking-tight sm:text-[34px]">
                  QA Monitoring Workspace
                </div>

                <div className="mt-3 max-w-xl text-sm leading-6 text-violet-100/90">
                  Unified access for Dashboard, Case Detail, Appeal Review, Summary, Coaching,
                  and QA Rubric with role-based visibility for supervisors and agents.
                </div>

                <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
                  <LoginFeatureCard
                    title="Performance"
                    desc="Dashboard, KPI, grade, incentive, trend, and summary view"
                  />
                  <LoginFeatureCard
                    title="Review"
                    desc="Appeal result, coaching, case comparison, and QA rubric reference"
                  />
                  <LoginFeatureCard
                    title="Security"
                    desc="Password control, session timeout, and supervisor reset tools"
                  />
                  <LoginFeatureCard
                    title="Workspace"
                    desc="Responsive layout optimized for common laptop browser size"
                  />
                </div>

                <div className="mt-6 flex items-center gap-4 rounded-[22px] border border-white/15 bg-white/10 px-4 py-3.5 backdrop-blur-sm">
                  <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white/15">
                    <img
                      src="/robinhood-logo.png"
                      alt="Robinhood"
                      className="h-8 w-8 object-contain"
                    />
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-200">
                      Enterprise Access
                    </div>
                    <div className="mt-1 text-sm font-semibold text-white sm:text-base">
                      Customer Service Quality Monitoring Platform
                    </div>
                    <div className="mt-1 text-xs text-violet-100/80 sm:text-sm">
                      Optimized to fit browser view without manual zoom out
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-5 sm:p-6 lg:p-7">
              <div className="mx-auto w-full max-w-[400px]">
                <div className="flex justify-center lg:justify-start">
                  <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-violet-200 bg-violet-50 shadow-sm">
                    <img
                      src="/robinhood-logo.png"
                      alt="Robinhood"
                      className="h-9 w-9 object-contain"
                    />
                  </div>
                </div>

                <div className="mt-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-700">
                    Sign In
                  </div>
                  <div className="mt-2 text-[26px] font-bold tracking-tight text-slate-900 sm:text-[30px]">
                    Welcome back
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-500">
                    Enter your credentials to access the Robinhood QA workspace.
                  </div>
                </div>

                <div className="mt-7 space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-800">
                      Username
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleLogin();
                      }}
                      placeholder="Enter username"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-800">
                      Password
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleLogin();
                      }}
                      placeholder="Enter password"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                    />
                  </div>

                  {loginError ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                      {loginError}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={handleLogin}
                    className="w-full rounded-2xl bg-gradient-to-r from-violet-700 via-violet-700 to-fuchsia-600 px-4 py-3 text-sm font-bold text-white shadow-[0_14px_30px_rgba(109,40,217,0.24)] transition hover:opacity-95"
                  >
                    Sign In
                  </button>
                </div>

                <div className="mt-5 text-center text-xs leading-5 text-slate-400 lg:text-left">
                  This login layout is responsive and sized for standard laptop browser view.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <SessionWarningModal
        open={showSessionWarning}
        onStayLoggedIn={handleStayLoggedIn}
        onLogoutNow={handleLogout}
      />

      <ChangePasswordModal
        open={showChangePasswordModal}
        onClose={() => {
          setShowChangePasswordModal(false);
          resetChangePasswordState();
        }}
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
        onClose={() => {
          setShowResetPasswordModal(false);
          resetPasswordModalState();
        }}
        selectedUsername={resetTargetUsername}
        setSelectedUsername={setResetTargetUsername}
        onReset={handleResetPasswordToDefault}
        resultMessage={resetResultMessage}
      />

      <div className="min-h-screen bg-slate-100">
        <div className="border-b border-violet-100 bg-gradient-to-r from-white via-violet-50/40 to-fuchsia-50/30 backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-3 sm:px-5 lg:px-6 2xl:px-8 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-700">
                Robinhood QA
              </div>
              <div className="mt-1 truncate text-xl font-extrabold tracking-tight text-slate-800 sm:text-2xl">
                Welcome, {welcomeName}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                Role: <span className="font-semibold text-slate-700">{currentUser.role}</span>
                {" · "}
                Agent Name:{" "}
                <span className="font-semibold text-slate-700">{currentUser.agentName}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-violet-200/80 bg-white/80 px-2 py-2 shadow-sm">
                <span className="px-2 text-[11px] font-bold uppercase tracking-[0.16em] text-violet-500">
                  Performance
                </span>

                <NavButton
                  active={activeTab === "dashboard"}
                  label="Dashboard"
                  onClick={() => setActiveTab("dashboard")}
                />
                <NavButton
                  active={activeTab === "summary"}
                  label="Summary"
                  onClick={() => setActiveTab("summary")}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-fuchsia-200/80 bg-white/80 px-2 py-2 shadow-sm">
                <span className="px-2 text-[11px] font-bold uppercase tracking-[0.16em] text-fuchsia-500">
                  Review
                </span>

                <NavButton
                  active={activeTab === "appeal"}
                  label="Appeal"
                  onClick={() => setActiveTab("appeal")}
                />
                <NavButton
                  active={activeTab === "rubric"}
                  label="QA Rubric"
                  onClick={() => setActiveTab("rubric")}
                />
                <NavButton
                  active={activeTab === "coaching"}
                  label="Coaching"
                  onClick={() => setActiveTab("coaching")}
                />
                <NavButton
                  active={activeTab === "evaluation-studio"}
                  label="Evaluation Studio"
                  onClick={() => setActiveTab("evaluation-studio")}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-2 py-2 shadow-sm">
                <span className="px-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  Account
                </span>

                <button
                  type="button"
                  onClick={() => {
                    resetChangePasswordState();
                    setShowChangePasswordModal(true);
                  }}
                  className="rounded-xl border border-transparent bg-transparent px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-violet-700"
                >
                  Change Password
                </button>

                {currentUser.role === "Supervisor" ? (
                  <button
                    type="button"
                    onClick={() => {
                      resetPasswordModalState();
                      setShowResetPasswordModal(true);
                    }}
                    className="rounded-xl border border-transparent bg-transparent px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-amber-700"
                  >
                    Reset Password
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-xl border border-transparent bg-transparent px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-rose-700"
                >
                  Log Out
                </button>
              </div>
            </div>
          </div>
        </div>

        {activeTab === "dashboard" ? (
          <div>
            <div className="mx-auto w-full max-w-[1600px] px-4 pt-5 sm:px-5 lg:px-6 2xl:px-8">
              <div className="flex flex-wrap gap-2">
                <DashboardSubButton
                  active={dashboardSubTab === "overview"}
                  label="Overview"
                  onClick={() => setDashboardSubTab("overview")}
                />
                <DashboardSubButton
                  active={dashboardSubTab === "case-detail"}
                  label="Case Detail"
                  onClick={() => setDashboardSubTab("case-detail")}
                />
              </div>
            </div>

            <DashboardMockup
              currentUser={currentUser}
              dashboardSubTab={dashboardSubTab}
              externalSelectedAgent={selectedAgentGlobal}
              onSelectedAgentChange={setSelectedAgentGlobal}
              onOpenCaseDetail={() => {
                setActiveTab("dashboard");
                setDashboardSubTab("case-detail");
              }}
            />
          </div>
        ) : activeTab === "appeal" ? (
          <AppealMockup
            currentUser={currentUser}
            externalSelectedAgent={selectedAgentGlobal}
            onSelectedAgentChange={setSelectedAgentGlobal}
          />
        ) : activeTab === "summary" ? (
          <SummaryMockup currentUser={currentUser} />
        ) : activeTab === "coaching" ? (
          <CoachingMockup currentUser={currentUser} />
        ) : activeTab === "evaluation-studio" ? (
          <EvaluationStudioPage />
        ) : (
          <QARubricMockup />
        )}
      </div>
    </>
  );
}
