import { useState } from "react";
import DashboardMockup from "./DashboardMockup";
import AppealMockup from "./AppealMockup";
type UserAccount = {
 username: string;
 password: string;
 displayName: string;
 role: "QA" | "Supervisor" | "Senior" | "Admin" | "Agent";
 agentName?: string;
};
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
function App() {
 const [username, setUsername] = useState("");
 const [password, setPassword] = useState("");
 const [loginError, setLoginError] = useState("");
 const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
 const [activeTab, setActiveTab] = useState<"dashboard" | "appeal">("dashboard");
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
<div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
<div className="flex items-center gap-2">
<button
             type="button"
             onClick={() => setActiveTab("dashboard")}
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
             onClick={() => setActiveTab("appeal")}
             className={`rounded-xl px-4 py-2 text-sm font-semibold ${
               activeTab === "appeal"
                 ? "bg-violet-700 text-white"
                 : "bg-slate-100 text-slate-700 hover:bg-slate-200"
             }`}
>
             Appeal
</button>
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
</div>
     {activeTab === "dashboard" ? (
<DashboardMockup currentUser={currentUser} />
     ) : (
<AppealMockup currentUser={currentUser} />
     )}
</div>
 );
}
export default App;
