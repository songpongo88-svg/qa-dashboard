import React, { useEffect, useMemo, useRef, useState } from "react";
import DashboardMockup from "./DashboardMockup";
import AppealMockup from "./AppealMockup";
import QARubricMockup from "./QARubricMockup";

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

const INACTIVITY_LIMIT_MS = 30 * 60 * 1000;
const WARNING_BEFORE_MS = 1 * 60 * 1000;
const WARNING_TIME_MS = INACTIVITY_LIMIT_MS - WARNING_BEFORE_MS;

function LogoBox() {
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-white/10 backdrop-blur-sm shadow-lg sm:h-20 sm:w-20">
      <img
        src="/robinhood-logo.png"
        alt="Robinhood Logo"
        className="h-10 w-10 object-contain sm:h-12 sm:w-12"
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
          ? "bg-violet-700 text-white shadow-md"
          : "border border-violet-200 bg-white text-violet-700 hover:bg-violet-50"
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
      className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-violet-100 bg-white p-6 shadow-2xl sm:p-7">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 shadow-sm">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 8v4l2.5 2.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>

          <div className="min-w-0">
            <div className="text-lg font-bold text-slate-900 sm:text-xl">
              Session Timeout Warning
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-600">
              Your session will be logged out automatically in 1 minute due to inactivity.
              Please confirm if you would like to stay signed in.
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onLogoutNow}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Log Out Now
          </button>
          <button
            type="button"
            onClick={onStayLoggedIn}
            className="rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:opacity-95"
          >
            Stay Logged In
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [showSessionWarning, setShowSessionWarning] = useState(false);

  const [activeTab, setActiveTab] = useState<"dashboard" | "appeal" | "rubric">("dashboard");
  const [dashboardSubTab, setDashboardSubTab] = useState<"overview" | "case-detail">("overview");
  const [selectedAgentFromDashboard, setSelectedAgentFromDashboard] = useState("");

  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const welcomeName = useMemo(() => {
    if (!currentUser) return "";
    return currentUser.displayName || currentUser.username;
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

    const matchedUser = USER_ACCOUNTS.find(
      (item) =>
        item.username.trim().toLowerCase() === normalizedUsername &&
        item.password === normalizedPassword
    );

    if (!matchedUser) {
      setLoginError("Invalid username or password");
      return;
    }

    setCurrentUser({
      username: matchedUser.username,
      displayName: matchedUser.displayName,
      role: matchedUser.role,
      agentName: matchedUser.agentName,
    });

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

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-violet-50 to-fuchsia-50">
        <div className="mx-auto flex min-h-screen w-full max-w-[1280px] items-center px-4 py-6 sm:px-6 lg:px-8">
          <div className="grid w-full gap-5 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-violet-950 via-violet-800 to-fuchsia-700 px-6 py-7 text-white shadow-2xl sm:px-8 sm:py-8 lg:px-9 lg:py-10">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.10),transparent_30%)]" />

              <div className="relative z-10">
                <div className="flex items-center justify-between gap-4">
                  <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-100 sm:text-xs">
                    Secure Access
                  </div>
                  <LogoBox />
                </div>

                <div className="mt-8 text-sm font-semibold tracking-[0.14em] text-violet-100 sm:text-base">
                  Robinhood Customer Service Quality Assurance
                </div>

                <div className="mt-4 max-w-[520px] text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                  Robinhood QA
                  <br />
                  Control Center
                </div>

                <div className="mt-5 max-w-[560px] text-sm leading-7 text-violet-100/95 sm:text-base">
                  Unified access for QA Dashboard, Appeal Review, and Case Detail with
                  role-based visibility for supervisors and agents.
                </div>

                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                    <div className="text-xs uppercase tracking-[0.18em] text-violet-100/80">
                      Access
                    </div>
                    <div className="mt-2 text-sm font-semibold">Role-Based Login</div>
                  </div>
                  <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                    <div className="text-xs uppercase tracking-[0.18em] text-violet-100/80">
                      Review
                    </div>
                    <div className="mt-2 text-sm font-semibold">Appeal Tracking</div>
                  </div>
                  <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                    <div className="text-xs uppercase tracking-[0.18em] text-violet-100/80">
                      Security
                    </div>
                    <div className="mt-2 text-sm font-semibold">Session Protection</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[32px] border border-white/70 bg-white/90 px-5 py-6 shadow-xl backdrop-blur sm:px-7 sm:py-8">
              <div className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-700 sm:text-xs">
                Sign In
              </div>

              <div className="mt-6 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                Welcome Back
              </div>

              <div className="mt-3 text-sm leading-6 text-slate-500 sm:text-base">
                Please sign in to access Dashboard, Case Detail, and Appeal Review.
              </div>

              <div className="mt-8 space-y-5">
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
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
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
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
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
                  className="w-full rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg transition hover:opacity-95"
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

      <div className="min-h-screen bg-slate-100">
        <div className="border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-700 sm:text-sm">
                Robinhood QA
              </div>
              <div className="mt-1 text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
                Welcome, {welcomeName}
              </div>
              <div className="mt-1 text-xs text-slate-500 sm:text-sm">
                Role: <span className="font-semibold text-slate-700">{currentUser.role}</span>
                {" · "}
                Agent Name:{" "}
                <span className="font-semibold text-slate-700">{currentUser.agentName}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
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
                active={activeTab === "rubric"}
                label="QA Rubric"
                onClick={() => setActiveTab("rubric")}
              />

              <button
                type="button"
                onClick={handleLogout}
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
              >
                Log Out
              </button>
            </div>
          </div>
        </div>

        {activeTab === "dashboard" ? (
          <div>
            <div className="mx-auto max-w-[1600px] px-4 pt-5 sm:px-6">
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
            />
          </div>
        ) : activeTab === "appeal" ? (
          <AppealMockup currentUser={currentUser} />
        ) : (
          <QARubricMockup />
        )}
      </div>
    </>
  );
}
