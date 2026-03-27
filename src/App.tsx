import { useState } from "react";
import DashboardMockup from "./DashboardMockup";
import AppealMockup from "./AppealMockup";

type UserAccount = {
  username: string;
  password: string;
  displayName: string;
  role: string;
  agentName?: string;
};

const USER_ACCOUNTS: UserAccount[] = [
  {
    username: "admin",
    password: "1234",
    displayName: "Admin",
    role: "Admin",
  },
  {
    username: "qa",
    password: "1234",
    displayName: "QA",
    role: "QA",
  },
  {
    username: "jariyawadee",
    password: "1234",
    displayName: "Jariyawadee Taboodda",
    role: "Agent",
    agentName: "Jariyawadee Taboodda",
  },
];

type LoginScreenProps = {
  username: string;
  password: string;
  error: string;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onLogin: () => void;
};

function LoginScreen({
  username,
  password,
  error,
  onUsernameChange,
  onPasswordChange,
  onLogin,
}: LoginScreenProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-violet-100 via-white to-fuchsia-100 p-6">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="text-sm font-medium text-violet-600">QA Portal</div>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Sign in</h1>
          <p className="mt-2 text-sm text-slate-500">
            เข้าสู่ระบบเพื่อดู Dashboard และ Appeal
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => onUsernameChange(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-400"
              placeholder="Enter username"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-400"
              placeholder="Enter password"
            />
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          ) : null}

          <button
            onClick={onLogin}
            className="w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-700"
          >
            Login
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "appeal">("dashboard");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);

  const handleLogin = () => {
    const user = USER_ACCOUNTS.find(
      (item) => item.username === username.trim().toLowerCase() && item.password === password
    );

    if (!user) {
      setLoginError("Username หรือ Password ไม่ถูกต้อง");
      return;
    }

    setCurrentUser(user);
    setLoginError("");
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setUsername("");
    setPassword("");
    setLoginError("");
    setActiveTab("dashboard");
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
    <div className="min-h-screen bg-slate-100">
      <div className="border-b bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 p-4">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`rounded-xl px-4 py-2 text-sm font-medium ${
                activeTab === "dashboard"
                  ? "bg-violet-600 text-white"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              Dashboard
            </button>

            <button
              onClick={() => setActiveTab("appeal")}
              className={`rounded-xl px-4 py-2 text-sm font-medium ${
                activeTab === "appeal"
                  ? "bg-violet-600 text-white"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              Appeal
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm text-slate-600">
              {currentUser.displayName} ({currentUser.role})
            </div>
            <button
              onClick={handleLogout}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {activeTab === "dashboard" ? (
        <DashboardMockup currentUser={currentUser} />
      ) : (
        <AppealMockup currentUser={currentUser} />
      )}
    </div>
  );
}
