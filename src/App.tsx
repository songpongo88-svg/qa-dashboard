import React, { useMemo, useState } from "react";
import DashboardMockup from "./DashboardMockup";
import AppealMockup from "./AppealMockup";
import QARubricMockup from "./QARubricMockup";

type Role = "Lead" | "Agent";

type UserLike = {
  username: string;
  password: string;
  displayName: string;
  role: Role;
  agentName: string;
  canViewAllAgents: boolean;
};

const USER_ACCOUNTS: UserLike[] = [
  {
    username: "Anucha",
    password: "Mk!A7p9#L2",
    displayName: "Anucha Makundin",
    role: "Senior Customer Service",
    agentName: "Anucha Makundin",
    canViewAllAgents: true,
  },
  {
    username: "Arisa",
    password: "Ri$4Kq2@Zm",
    displayName: "Arisa aiemrit",
    role: "Agent Customer Service",
    agentName: "Arisa aiemrit",
    canViewAllAgents: false,
  },
  {
    username: "Ahatkonnaphat",
    password: "Ct#8Lm3!Qa",
    displayName: "Chatkonnaphat Bhusomya",
    role: "Agent Customer Service",
    agentName: "Chatkonnaphat Bhusomya",
    canViewAllAgents: false,
  },
  {
    username: "Jariyawadee",
    password: "Jy@5Nx9#Wp",
    displayName: "Jariyawadee Taboodda",
    role: "Agent Customer Service",
    agentName: "Jariyawadee Taboodda",
    canViewAllAgents: false,
  },
  {
    username: "Jureeporn",
    password: "Jp!6Vr2@Kd",
    displayName: "Jureeporn Piddum",
    role: "Agent Customer Service",
    agentName: "Jureeporn Piddum",
    canViewAllAgents: false,
  },
  {
    username: "Krivut",
    password: "Kv#9Ts4!Mb",
    displayName: "Krivut Vongkampan",
    role: "Senior Customer Service",
    agentName: "Krivut Vongkampan",
    canViewAllAgents: true,
  },
  {
    username: "Natcha",
    password: "Nc@7Pw3#Lf",
    displayName: "Natcha Chai-in",
    role: "Agent Customer Service",
    agentName: "Natcha Chai-in",
    canViewAllAgents: false,
  },
  {
    username: "Nattapol",
    password: "Np!4Xz8@Hr",
    displayName: "Nattapol Suprom",
    role: "Agent Customer Service",
    agentName: "Nattapol Suprom",
    canViewAllAgents: false,
  },
  {
    username: "Phrommarin",
    password: "sD6#zL8&",
    displayName: "Phrommarin Thaithorn",
    role: "Supervisor Customer Service",
    agentName: "Phrommarin Thaithorn",
    canViewAllAgents: true,
  },
  {
    username: "Songpon",
    password: "Boom@4421L",
    displayName: "Songpon Phothong",
    role: "Senior Customer Service",
    agentName: "Songpon Phothong",
    canViewAllAgents: true,
  },
  {
    username: "Sunijtra",
    password: "Sj#6Qm1!Ty",
    displayName: "Sunijtra Siritip",
    role: "Agent Customer Service",
    agentName: "Sunijtra Siritip",
    canViewAllAgents: false,
  },
  {
    username: "Supakrit",
    password: "sP9#kM4!",
    displayName: "Supakrit Promkhamnoi",
    role: "Agent Customer Service",
    agentName: "Supakrit Promkhamnoi",
    canViewAllAgents: false,
  },
  {
    username: "Suphitcha",
    password: "Sp@8Ld2#Vk",
    displayName: "Suphitcha Keawliam",
    role: "Senior Customer Service",
    agentName: "Suphitcha Keawliam",
    canViewAllAgents: true,
  },
  {
    username: "Wachiraporn",
    password: "wL7$cl2@",
    displayName: "Wachiraporn chailittichai",
    role: "Agent Customer Service",
    agentName: "Wachiraporn chailittichai",
    canViewAllAgents: false,
  },
  {
    username: "Wassana",
    password: "Ws!3Kr7@Pn",
    displayName: "Wassana Phothong",
    role: "Agent Customer Service",
    agentName: "Wassana Phothong",
    canViewAllAgents: false,
  },
];

function LoginScreen({
  onLogin,
}: {
  onLogin: (user: UserLike) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorText, setErrorText] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedUsername = username.trim();

    const matchedUser = USER_ACCOUNTS.find(
      (user) =>
        user.username === normalizedUsername && user.password === password
    );

    if (!matchedUser) {
      setErrorText("Username หรือ Password ไม่ถูกต้อง");
      return;
    }

    setErrorText("");
    onLogin(matchedUser);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-fuchsia-50">
      <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-6 py-10">
        <div className="grid w-full max-w-6xl overflow-hidden rounded-[32px] border border-violet-100 bg-white shadow-[0_30px_80px_rgba(91,33,182,0.18)] lg:grid-cols-[1.08fr_0.92fr]">
          <div className="relative overflow-hidden bg-gradient-to-br from-violet-950 via-violet-800 to-fuchsia-700 p-8 text-white lg:p-12">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.10),transparent_30%)]" />

            <div className="relative z-10 flex h-full flex-col">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-100">
                    Secure Access
                  </div>

                  <div className="mt-6 text-sm font-medium text-violet-200">
                    Robinhood Customer Service Quality Assurance
                  </div>

                  <h1 className="mt-3 text-4xl font-bold leading-tight lg:text-5xl">
                    Robinhood QA
                    <br />
                    Control Center
                  </h1>

                  <p className="mt-5 max-w-xl text-sm leading-7 text-violet-100/95 lg:text-[15px]">
                    Access your QA Dashboard, Case Detail, and Appeal Review in
                    one place with role-based visibility for team leads and
                    agents.
                  </p>
                </div>

                <div className="shrink-0">
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/15 bg-white/10 backdrop-blur-sm shadow-lg lg:h-24 lg:w-24">
                    <img
                      src="/robinhood-logo.png"
                      alt="Robinhood Logo"
                      className="h-12 w-auto object-contain lg:h-14"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-10 grid gap-4">
                <div className="rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur-sm">
                  <div className="text-sm font-semibold text-white">
                    Platform Access
                  </div>
                  <div className="mt-2 text-sm leading-6 text-violet-100">
                    Team leads can review broader performance visibility, while
                    agents can securely access only their own QA and appeal
                    results.
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur-sm">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-200">
                      Workspace
                    </div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      Dashboard & Case Detail
                    </div>
                    <div className="mt-1 text-sm text-violet-100">
                      Review QA scores, case records, and monthly performance.
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur-sm">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-200">
                      Review Flow
                    </div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      Appeal Monitoring
                    </div>
                    <div className="mt-1 text-sm text-violet-100">
                      Track appeal outcomes and revised QA evaluation details.
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-auto pt-10">
                <div className="text-xs text-violet-200">
                  Internal use only · Robinhood QA Operations
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 lg:p-12">
            <div className="mx-auto max-w-md">
              <div className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-700">
                Sign In
              </div>

              <h2 className="mt-5 text-3xl font-bold tracking-tight text-slate-900">
                Welcome back
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Enter your account credentials to access the QA system.
              </p>

              <form onSubmit={handleLogin} className="mt-8 space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Username
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter username"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
                  />
                </div>

                {errorText ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {errorText}
                  </div>
                ) : null}

                <button
                  type="submit"
                  className="w-full rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-200 transition hover:-translate-y-0.5 hover:from-violet-800 hover:to-fuchsia-700"
                >
                  Sign In to QA Control Center
                </button>
              </form>

              <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Access Policy
                </div>
                <div className="mt-3 space-y-3 text-sm text-slate-600">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 h-2.5 w-2.5 rounded-full bg-violet-500" />
                    <div>
                      Leads with wider permission can review multiple agents’
                      dashboards.
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-1 h-2.5 w-2.5 rounded-full bg-fuchsia-500" />
                    <div>
                      Standard users can access only their assigned QA and
                      appeal records.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MainScreen({
  currentUser,
  onLogout,
}: {
  currentUser: UserLike;
  onLogout: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"dashboard" | "appeal" | "rubric">(
    "dashboard"
  );
  const [dashboardSubTab, setDashboardSubTab] = useState<
    "overview" | "case-detail"
  >("overview");
  const [selectedAgentGlobal, setSelectedAgentGlobal] = useState<string>("");

  const effectiveSelectedAgent = useMemo(() => {
    if (!currentUser.canViewAllAgents) {
      return currentUser.agentName;
    }
    return selectedAgentGlobal;
  }, [currentUser, selectedAgentGlobal]);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="border-b border-violet-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-6 py-4">
          <button
            type="button"
            onClick={() => setActiveTab("dashboard")}
            className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold ${
              activeTab === "dashboard"
                ? "border-violet-400 bg-violet-100 text-violet-800"
                : "border-violet-200 bg-white text-violet-700 hover:bg-violet-50"
            }`}
          >
            Dashboard
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("appeal")}
            className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold ${
              activeTab === "appeal"
                ? "border-violet-400 bg-violet-100 text-violet-800"
                : "border-violet-200 bg-white text-violet-700 hover:bg-violet-50"
            }`}
          >
            Appeal
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("rubric")}
            className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold ${
              activeTab === "rubric"
                ? "border-violet-400 bg-violet-100 text-violet-800"
                : "border-violet-200 bg-white text-violet-700 hover:bg-violet-50"
            }`}
          >
            QA Rubric
          </button>

          {activeTab === "dashboard" ? (
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => setDashboardSubTab("overview")}
                className={`rounded-2xl border px-4 py-2 text-sm font-semibold ${
                  dashboardSubTab === "overview"
                    ? "border-slate-400 bg-slate-100 text-slate-800"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Overview
              </button>

              <button
                type="button"
                onClick={() => setDashboardSubTab("case-detail")}
                className={`rounded-2xl border px-4 py-2 text-sm font-semibold ${
                  dashboardSubTab === "case-detail"
                    ? "border-slate-400 bg-slate-100 text-slate-800"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Case Detail
              </button>
            </div>
          ) : null}

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right md:block">
              <div className="text-sm font-semibold text-slate-900">
                {currentUser.displayName}
              </div>
              <div className="text-xs text-slate-500">
                {currentUser.canViewAllAgents
                  ? "View all agents"
                  : "Own data only"}
              </div>
            </div>

            <button
              type="button"
              onClick={onLogout}
              className="rounded-2xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {activeTab === "dashboard" ? (
        <DashboardMockup
          currentUser={currentUser}
          dashboardSubTab={dashboardSubTab}
          externalSelectedAgent={effectiveSelectedAgent}
          onSelectedAgentChange={
            currentUser.canViewAllAgents ? setSelectedAgentGlobal : undefined
          }
        />
      ) : activeTab === "appeal" ? (
        <AppealMockup
          currentUser={currentUser}
          selectedAgentFilter={effectiveSelectedAgent}
        />
      ) : (
        <QARubricMockup currentUser={currentUser} />
      )}
    </div>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserLike | null>(null);

  if (!currentUser) {
    return <LoginScreen onLogin={setCurrentUser} />;
  }

  return (
    <MainScreen
      currentUser={currentUser}
      onLogout={() => setCurrentUser(null)}
    />
  );
}
