import { useEffect, useRef, useState } from "react";
import DashboardMockup from "./DashboardMockup";
import AppealMockup from "./AppealMockup";

type UserAccount = {
  username: string;
  password: string;
  displayName: string;
  role: "QA" | "Supervisor" | "Senior" | "Admin" | "Agent";
  agentName?: string;
};

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

const USER_ACCOUNTS: UserAccount[] = [
  {
    username: "qa",
    password: "qa1234",
    displayName: "QA Admin",
    role: "QA",
  },
  {
    username: "supervisor",
    password: "super1234",
    displayName: "Supervisor",
    role: "Supervisor",
  },
  {
    username: "senior",
    password: "senior1234",
    displayName: "Senior",
    role: "Senior",
  },
  {
    username: "admin",
    password: "admin1234",
    displayName: "Admin",
    role: "Admin",
  },
  {
    username: "anucha",
    password: "Mk!A7p9#L2",
    displayName: "Anucha Makundin",
    role: "Agent",
    agentName: "Anucha Makundin",
  },
  {
    username: "arisa",
    password: "Ri$4Kq2@Zm",
    displayName: "Arisa aiemrit",
    role: "Agent",
    agentName: "Arisa aiemrit",
  },
  {
    username: "chatkonnaphat",
    password: "Ct#8Lm3!Qa",
    displayName: "Chatkonnaphat Bhusomya",
    role: "Agent",
    agentName: "Chatkonnaphat Bhusomya",
  },
  {
    username: "jariyawadee",
    password: "Jy@5Nx9#Wp",
    displayName: "Jariyawadee Taboodda",
    role: "Agent",
    agentName: "Jariyawadee Taboodda",
  },
  {
    username: "jureeporn",
    password: "Jp!6Vr2@Kd",
    displayName: "Jureeporn Piddum",
    role: "Agent",
    agentName: "Jureeporn Piddum",
  },
  {
    username: "krivut",
    password: "Kv#9Ts4!Mb",
    displayName: "Krivut Vongkampan",
    role: "Agent",
    agentName: "Krivut Vongkampan",
  },
  {
    username: "natcha",
    password: "Nc@7Pw3#Lf",
    displayName: "Natcha Chai-in",
    role: "Agent",
    agentName: "Natcha Chai-in",
  },
  {
    username: "nattapol",
    password: "Np!4Xz8@Hr",
    displayName: "Nattapol Suprom",
    role: "Agent",
    agentName: "Nattapol Suprom",
  },
  {
    username: "sunijtra",
    password: "Sj#6Qm1!Ty",
    displayName: "Sunijtra Siritan",
    role: "Agent",
    agentName: "Sunijtra Siritan",
  },
  {
    username: "suphitcha",
    password: "Sp@8Ld2#Vk",
    displayName: "Suphitcha Keawliam",
    role: "Agent",
    agentName: "Suphitcha Keawliam",
  },
  {
    username: "wassana",
    password: "Ws!3Kr7@Pn",
    displayName: "Wassana Phothong",
    role: "Agent",
    agentName: "Wassana Phothong",
  },
];

type MainTab = "dashboard" | "appeal" | "qa-rubric";
type DashboardSubTab = "overview" | "case-detail";

function LoginScreen({
  username,
  password,
  error,
  onUsernameChange,
  onPasswordChange,
  onLogin,
}: {
  username: string;
  password: string;
  error: string;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onLogin: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-violet-50 via-slate-50 to-fuchsia-50 p-6">
      <div className="w-full max-w-md rounded-3xl border border-violet-200 bg-white p-6 shadow-lg">
        <div className="mb-6 text-center">
          <div className="text-sm font-medium text-violet-600">QA Dashboard Access</div>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Sign in</h1>
          <p className="mt-2 text-sm text-slate-500">
            ระบบจะออกจากระบบอัตโนมัติเมื่อไม่มีการใช้งาน 30 นาที
          </p>
        </div>

        <div className="space-y-4">
          <input
            value={username}
            onChange={(e) => onUsernameChange(e.target.value)}
            placeholder="Username"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-400"
          />

          <input
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            type="password"
            placeholder="Password"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-400"
          />

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <button
            type="button"
            onClick={onLogin}
            className="w-full rounded-2xl bg-violet-700 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-800"
          >
            Log in
          </button>
        </div>
      </div>
    </div>
  );
}

function QARubricPage() {
  const sections = [
    {
      title: "1. Compliance, Process & Policy",
      items: [
        "1.1 Greeting & Closing Standard (10)",
        "1.2 PDPA & Policy (5)",
        "1.3 Process & SLA (5)",
      ],
    },
    {
      title: "2. Answer Quality & Knowledge",
      items: [
        "2.1 Case Accuracy (5)",
        "2.2 Completeness (5)",
        "2.3 Clarity of Steps (5)",
        "2.4 Official Sources (5)",
      ],
    },
    {
      title: "3. Resolution & Ownership",
      items: [
        "3.1 Root Cause & Fix (10)",
        "3.2 Ownership (5)",
        "3.3 Next Step (5)",
      ],
    },
    {
      title: "4. Communication Skill",
      items: [
        "4.1 Message Structure (5)",
        "4.2 Language (5)",
        "4.3 Tone (5)",
        "4.4 Adaptation (5)",
      ],
    },
    {
      title: "5. Process & SLA",
      items: [
        "5.1 Process (10)",
        "5.2 SLA (5)",
        "5.3 Case Logging (5)",
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-slate-50 to-fuchsia-50">
      <div className="mx-auto max-w-7xl p-6">
        <div className="mb-6 rounded-3xl bg-gradient-to-r from-violet-700 via-fuchsia-600 to-violet-500 p-6 text-white shadow-lg">
          <div className="text-sm font-medium text-violet-100">Private Tab</div>
          <h1 className="mt-2 text-3xl font-bold">QA Rubric</h1>
          <div className="mt-2 text-sm text-violet-100">
            หน้านี้ใช้สำหรับดูโครงเกณฑ์ประเมิน QA และเงื่อนไขคะแนน
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {sections.map((section) => (
            <div
              key={section.title}
              className="rounded-3xl border border-violet-200 bg-white p-6 shadow-sm"
            >
              <div className="text-lg font-semibold text-slate-900">{section.title}</div>
              <div className="mt-4 space-y-3">
                {section.items.map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    const saved = localStorage.getItem("qa_current_user");
    return saved ? JSON.parse(saved) : null;
  });
  const [activeTab, setActiveTab] = useState<MainTab>("dashboard");
  const [dashboardSubTab, setDashboardSubTab] = useState<DashboardSubTab>("overview");

  const idleTimerRef = useRef<number | null>(null);

  const canSeeRubric = currentUser?.username === "qa";

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem("qa_current_user", JSON.stringify(currentUser));
    } else {
      localStorage.removeItem("qa_current_user");
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      return;
    }

    const logoutForIdle = () => {
      setCurrentUser(null);
      setUsername("");
      setPassword("");
      setLoginError("ออกจากระบบอัตโนมัติเนื่องจากไม่มีการใช้งานเกิน 30 นาที");
      setActiveTab("dashboard");
      setDashboardSubTab("overview");
      localStorage.removeItem("qa_current_user");
    };

    const resetIdleTimer = () => {
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
      }
      idleTimerRef.current = window.setTimeout(logoutForIdle, IDLE_TIMEOUT_MS);
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "click",
      "scroll",
      "keydown",
      "touchstart",
    ];

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, resetIdleTimer);
    });

    resetIdleTimer();

    return () => {
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, resetIdleTimer);
      });

      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
  }, [currentUser]);

  const handleLogin = () => {
    const matched = USER_ACCOUNTS.find(
      (user) =>
        user.username.toLowerCase() === username.trim().toLowerCase() &&
        user.password === password
    );

    if (!matched) {
      setLoginError("Username หรือ Password ไม่ถูกต้อง");
      return;
    }

    setCurrentUser(matched);
    setLoginError("");
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setUsername("");
    setPassword("");
    setLoginError("");
    setActiveTab("dashboard");
    setDashboardSubTab("overview");
    localStorage.removeItem("qa_current_user");

    if (idleTimerRef.current) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  };

  const handleMainTabChange = (tab: MainTab) => {
    setActiveTab(tab);
    if (tab === "dashboard") {
      setDashboardSubTab("overview");
    }
  };

  if (!currentUser) {
    return (
      <LoginScreen
        username={username}
        password={password}
        error={loginError}
        onUsernameChange={setUsername}
        onPasswordChange={setPassword}
        onLogin={handleLogin}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleMainTabChange("dashboard")}
                className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                  activeTab === "dashboard"
                    ? "bg-violet-700 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Dashboard
              </button>

              <button
                type="button"
                onClick={() => handleMainTabChange("appeal")}
                className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                  activeTab === "appeal"
                    ? "bg-violet-700 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Appeal
              </button>

              {canSeeRubric ? (
                <button
                  type="button"
                  onClick={() => handleMainTabChange("qa-rubric")}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                    activeTab === "qa-rubric"
                      ? "bg-violet-700 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  QA Rubric
                </button>
              ) : null}
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right text-sm">
                <div className="font-semibold text-slate-900">{currentUser.displayName}</div>
                <div className="text-slate-500">{currentUser.role}</div>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Log out
              </button>
            </div>
          </div>

          {activeTab === "dashboard" ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={() => setDashboardSubTab("overview")}
                className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                  dashboardSubTab === "overview"
                    ? "bg-fuchsia-100 text-fuchsia-700"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Overview
              </button>

              <button
                type="button"
                onClick={() => setDashboardSubTab("case-detail")}
                className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                  dashboardSubTab === "case-detail"
                    ? "bg-fuchsia-100 text-fuchsia-700"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Case Detail
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {activeTab === "dashboard" ? (
        <DashboardMockup currentUser={currentUser} />
      ) : activeTab === "appeal" ? (
        <AppealMockup currentUser={currentUser} />
      ) : (
        <QARubricPage />
      )}
    </div>
  );
}

export default App;