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
    username: "anucha",
    password: "Mk!A7p9#L2",
    displayName: "Anucha Makundin",
    role: "Lead",
    agentName: "Anucha Makundin",
    canViewAllAgents: true,
  },
  {
    username: "arisa",
    password: "Ri$4Kq2@Zm",
    displayName: "Arisa aiemrit",
    role: "Agent",
    agentName: "Arisa aiemrit",
    canViewAllAgents: false,
  },
  {
    username: "chatkonnaphat",
    password: "Ct#8Lm3!Qa",
    displayName: "Chatkonnaphat Bhusomya",
    role: "Agent",
    agentName: "Chatkonnaphat Bhusomya",
    canViewAllAgents: false,
  },
  {
    username: "jariyawadee",
    password: "Jy@5Nx9#Wp",
    displayName: "Jariyawadee Taboodda",
    role: "Agent",
    agentName: "Jariyawadee Taboodda",
    canViewAllAgents: false,
  },
  {
    username: "jureeporn",
    password: "Jp!6Vr2@Kd",
    displayName: "Jureeporn Piddum",
    role: "Agent",
    agentName: "Jureeporn Piddum",
    canViewAllAgents: false,
  },
  {
    username: "krivut",
    password: "Kv#9Ts4!Mb",
    displayName: "Krivut Vongkampan",
    role: "Lead",
    agentName: "Krivut Vongkampan",
    canViewAllAgents: true,
  },
  {
    username: "natcha",
    password: "Nc@7Pw3#Lf",
    displayName: "Natcha Chai-in",
    role: "Agent",
    agentName: "Natcha Chai-in",
    canViewAllAgents: false,
  },
  {
    username: "nattapol",
    password: "Np!4Xz8@Hr",
    displayName: "Nattapol Suprom",
    role: "Agent",
    agentName: "Nattapol Suprom",
    canViewAllAgents: false,
  },
  {
    username: "Phrommarin",
    password: "sD6#zL8&",
    displayName: "Phrommarin Thaithorn",
    role: "Lead",
    agentName: "Phrommarin Thaithorn",
    canViewAllAgents: true,
  },
  {
    username: "songpon",
    password: "Boom@4421L",
    displayName: "Songpon Phothong",
    role: "Lead",
    agentName: "Songpon Phothong",
    canViewAllAgents: true,
  },
  {
    username: "sunijtra",
    password: "Sj#6Qm1!Ty",
    displayName: "Sunijtra Siritan",
    role: "Agent",
    agentName: "Sunijtra Siritan",
    canViewAllAgents: false,
  },
  {
    username: "supakrit",
    password: "sP9#kM4!",
    displayName: "Supakrit Promkhamnoi",
    role: "Agent",
    agentName: "Supakrit Promkhamnoi",
    canViewAllAgents: false,
  },
  {
    username: "suphitcha",
    password: "Sp@8Ld2#Vk",
    displayName: "Suphitcha Keawliam",
    role: "Lead",
    agentName: "Suphitcha Keawliam",
    canViewAllAgents: true,
  },
  {
    username: "wachiraporn",
    password: "wL7$cl2@",
    displayName: "Wachiraporn chailittichai",
    role: "Agent",
    agentName: "Wachiraporn chailittichai",
    canViewAllAgents: false,
  },
  {
    username: "wassana",
    password: "Ws!3Kr7@Pn",
    displayName: "Wassana Phothong",
    role: "Agent",
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
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center p-6">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-violet-200 bg-white shadow-2xl lg:grid-cols-[1.05fr_0.95fr]">
          <div className="bg-gradient-to-br from-violet-950 via-violet-800 to-fuchsia-700 p-8 text-white lg:p-10">
            <div className="text-xs font-semibold uppercase tracking-[0.25em] text-violet-200">
              Robinhood QA Platform
            </div>

            <h1 className="mt-4 text-4xl font-bold leading-tight">
              QA Dashboard
              <br />
              Appeal Review
            </h1>

            <p className="mt-4 max-w-lg text-sm leading-7 text-violet-100">
              Sign in to access your QA Dashboard, Case Detail, and Appeal
              Review.
            </p>

            <div className="mt-8 grid gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <div className="text-sm font-semibold">Access Control</div>
                <div className="mt-1 text-xs text-violet-100">
                  Users with View all agents can access all dashboards. Other
                  users can access only their own data.
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <div className="text-sm font-semibold">Available Accounts</div>
                <div className="mt-1 text-xs text-violet-100">
                  This login page accepts only the configured agent accounts.
                </div>
              </div>
            </div>
          </div>

          <div className="p-8 lg:p-10">
            <div className="mx-auto max-w-md">
              <div className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-600">
                Login
              </div>

              <h2 className="mt-3 text-3xl font-bold text-slate-900">
                Welcome back
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                Enter your username and password to continue.
              </p>

              <form onSubmit={handleLogin} className="mt-8 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Username
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter username"
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                  />
                </div>

                {errorText ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {errorText}
                  </div>
                ) : null}

                <button
                  type="submit"
                  className="w-full rounded-2xl bg-violet-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-800"
                >
                  Sign In
                </button>
              </form>

              <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Access Summary
                </div>
                <div className="mt-3 text-xs leading-6 text-slate-600">
                  View all agents: anucha, krivut, Phrommarin, songpon,
                  suphitcha
                  <br />
                  Own data only: all remaining users
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
