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
  // ใช้ชุดเดียวกับของเดิม
];

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
      <div>หน้า Login กลาง</div>
    );
  }

  return (
    <div>
      <div>
        <button onClick={() => setActiveTab("dashboard")}>Dashboard</button>
        <button onClick={() => setActiveTab("appeal")}>Appeal</button>
        <button onClick={handleLogout}>Logout</button>
      </div>

      {activeTab === "dashboard" ? (
        <DashboardMockup currentUser={currentUser} />
      ) : (
        <AppealMockup currentUser={currentUser} />
      )}
    </div>
  );
}
