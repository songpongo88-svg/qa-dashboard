import React, { useEffect, useMemo, useRef, useState } from "react";
import DashboardMockup from "./DashboardMockup";
import AppealMockup from "./AppealMockup";
import QARubricMockup from "./QARubricMockup";
import SummaryMockup from "./SummaryMockup";

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
    password: "sD6#zL8&",
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
    <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-[28px] border border-white/15 bg-white/10 shadow-sm">
      <img
        src="/robinhood-logo.png"
        alt="Robinhood Logo"
        className="h-16 w-16 object-contain"
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
      className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
        active
          ? "bg-violet-700 text-white shadow-sm"
          : "bg-white text-violet-700 border border-violet-200 hover:bg-violet-50"
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
          ? "bg-violet-100 text-violet-800 border border-violet-300"
          : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
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

  const [activeTab, setActiveTab] = useState<"dashboard" | "appeal" | "summary" | "rubric">(
    "dashboard"
  );
  const [dashboardSubTab, setDashboardSubTab] = useState<"overview" | "case-detail">("overview");
  const [selectedAgentFromDashboard, setSelectedAgentFromDashboard] = useState("");

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
    setSelectedAgentFromDashboard("");
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
    setSelectedAgentFromDashboard(matchedUser.role === "Agent" ? matchedUser.agentName : "");
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
      <div className="min-h-screen bg-slate-100">
        <div className="mx-auto flex min-h-screen max-w-[1440px] items-center px-6 py-10">
          <div className="grid w-full gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="relative overflow-hidden rounded-[36px] bg-gradient-to-br from-violet-950 via-violet-800 to-fuchsia-700 px-10 py-12 text-white">
              <div className="absolute right-10 top-10">
                <LogoBox />
              </div>

              <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-5 py-2 text-sm font-semibold uppercase tracking-[0.25em] text-violet-100">
                Secure Access
              </div>

              <div className="mt-10 text-lg font-semibold text-violet-100">
                Robinhood Customer Service Quality Assurance
              </div>

              <div className="mt-4 max-w-[620px] text-6xl font-extrabold leading-[1.05] tracking-tight">
                Robinhood QA
                <br />
                Control Center
              </div>

              <div className="mt-8 max-w-[640px] text-xl leading-10 text-violet-100">
                Access your QA Dashboard, Case Detail, Appeal Review, and Summary in one place
                with role-based visibility for team leads and agents.
              </div>
            </div>

            <div className="rounded-[36px] border border-slate-200 bg-white px-8 py-10 shadow-sm">
              <div className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold uppercase tracking-[0.22em] text-violet-700">
                Sign In
              </div>

              <div className="mt-8 text-5xl font-extrabold tracking-tight text-slate-900">
                Welcome
              </div>

              <div className="mt-4 text-xl leading-8 text-slate-500">
                Enter your account to access Dashboard, Case Detail, Appeal Review, and Summary.
              </div>

              <div className="mt-10 space-y-6">
                <div>
                  <label className="mb-3 block text-sm font-bold text-slate-900">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleLogin();
                    }}
                    placeholder="Enter username"
                    className="w-full rounded-3xl border border-slate-200 px-5 py-4 text-base text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                  />
                </div>

                <div>
                  <label className="mb-3 block text-sm font-bold text-slate-900">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleLogin();
                    }}
                    placeholder="Enter password"
                    className="w-full rounded-3xl border border-slate-200 px-5 py-4 text-base text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
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
                  className="w-full rounded-3xl bg-violet-700 px-5 py-4 text-base font-bold text-white shadow-sm transition hover:bg-violet-800"
                >
                  Sign In
                </button>
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
        <div className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-[1700px] flex-col gap-4 px-6 py-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-700">
                Robinhood QA
              </div>
              <div className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">
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
              <NavButton
                active={activeTab === "dashboard"}
                label="Dashboard"
                onClick={() => setActiveTab("dashboard")}
              />
              <NavButton
                active={activeTab === "appeal"}
                label="Appeal"
                onClick={() => setActiveTab("appeal")}
              />
              <NavButton
                active={activeTab === "summary"}
                label="Summary"
                onClick={() => setActiveTab("summary")}
              />
              <NavButton
                active={activeTab === "rubric"}
                label="QA Rubric"
                onClick={() => setActiveTab("rubric")}
              />

              <button
                type="button"
                onClick={() => {
                  resetChangePasswordState();
                  setShowChangePasswordModal(true);
                }}
                className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-100"
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
                  className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-100"
                >
                  Reset Password
                </button>
              ) : null}

              <button
                type="button"
                onClick={handleLogout}
                className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
              >
                Log Out
              </button>
            </div>
          </div>
        </div>

        {activeTab === "dashboard" ? (
          <div>
            <div className="mx-auto max-w-[1700px] px-6 pt-6">
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
              externalSelectedAgent={selectedAgentFromDashboard}
              onSelectedAgentChange={setSelectedAgentFromDashboard}
              onOpenCaseDetail={() => {
                setActiveTab("dashboard");
                setDashboardSubTab("case-detail");
              }}
            />
          </div>
        ) : activeTab === "appeal" ? (
          <AppealMockup currentUser={currentUser} />
        ) : activeTab === "summary" ? (
          <SummaryMockup currentUser={currentUser} />
        ) : (
          <QARubricMockup />
        )}
      </div>
    </>
  );
}