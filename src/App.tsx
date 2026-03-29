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
type MainTab = "dashboard" | "appeal" | "qa-rubric";
type DashboardSubTab = "overview" | "case-detail";
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const USER_ACCOUNTS: UserAccount[] = [
 { username: "qa", password: "qa1234", displayName: "QA Admin", role: "QA" },
 { username: "supervisor", password: "super1234", displayName: "Supervisor", role: "Supervisor" },
 { username: "senior", password: "senior1234", displayName: "Senior", role: "Senior" },
 { username: "admin", password: "admin1234", displayName: "Admin", role: "Admin" },
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
<div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_#4c1d95,_#0f172a_55%)] p-6">
<div className="w-full max-w-md overflow-hidden rounded-3xl border border-violet-400/20 bg-white shadow-2xl">
<div className="bg-gradient-to-r from-violet-950 via-violet-800 to-fuchsia-700 px-6 py-6 text-white">
<div className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">
           Robinhood QA System
</div>
<h1 className="mt-3 text-2xl font-bold">Sign in</h1>
<p className="mt-2 text-sm text-violet-100">
           ระบบจะออกจากระบบอัตโนมัติเมื่อไม่มีการใช้งาน 30 นาที
</p>
</div>
<div className="space-y-4 p-6">
<div>
<label className="mb-2 block text-sm font-medium text-slate-700">Username</label>
<input
             value={username}
             onChange={(e) => onUsernameChange(e.target.value)}
             placeholder="Enter username"
             className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
           />
</div>
<div>
<label className="mb-2 block text-sm font-medium text-slate-700">Password</label>
<input
             value={password}
             onChange={(e) => onPasswordChange(e.target.value)}
             type="password"
             placeholder="Enter password"
             className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
           />
</div>
         {error ? (
<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
             {error}
</div>
         ) : null}
<button
           type="button"
           onClick={onLogin}
           className="w-full rounded-2xl bg-gradient-to-r from-violet-900 via-violet-700 to-fuchsia-600 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:opacity-95"
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
       "1.1 Greeting & Closing Standard",
       "1.2 Accuracy / PDPA / Policy",
       "1.3 Process & SLA",
     ],
   },
   {
     title: "2. Answer Quality & Knowledge",
     items: ["2.1 Case Accuracy", "2.2 Completeness", "2.3 Clarity of Steps", "2.4 Official Sources"],
   },
   {
     title: "3. Resolution & Ownership",
     items: ["3.1 Root Cause & Fix", "3.2 Ownership", "3.3 Next Step"],
   },
   {
     title: "4. Communication Skill",
     items: ["4.1 Message Structure", "4.2 Language", "4.3 Tone", "4.4 Adaptation"],
   },
   {
     title: "5. Process & SLA",
     items: ["5.1 Process", "5.2 SLA", "5.3 Case Logging"],
   },
 ];
 return (
<div className="min-h-screen bg-slate-100">
<div className="mx-auto max-w-7xl p-6">
<div className="mb-6 rounded-3xl bg-gradient-to-r from-violet-950 via-violet-800 to-fuchsia-700 px-6 py-6 text-white shadow-xl">
<div className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">
           Private Workspace
</div>
<h1 className="mt-3 text-3xl font-bold">QA Rubric</h1>
<p className="mt-2 text-sm text-violet-100">
           หน้านี้ใช้สำหรับเก็บเกณฑ์ประเมิน QA และ reference ส่วนตัว
</p>
</div>
<div className="grid gap-6 lg:grid-cols-2">
         {sections.map((section) => (
<div
             key={section.title}
             className="overflow-hidden rounded-3xl border border-violet-200 bg-white shadow-sm"
>
<div className="bg-slate-900 px-5 py-4 text-sm font-semibold text-white">
               {section.title}
</div>
<div className="space-y-3 p-5">
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
export default function App() {
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
<div className="min-h-screen bg-slate-100">
<div className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950 shadow-lg">
<div className="mx-auto max-w-7xl px-4 py-4">
<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
<div className="flex flex-wrap items-center gap-2">
<button
               type="button"
               onClick={() => handleMainTabChange("dashboard")}
               className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                 activeTab === "dashboard"
                   ? "bg-gradient-to-r from-violet-700 to-fuchsia-600 text-white shadow-lg"
                   : "bg-slate-800 text-slate-200 hover:bg-slate-700"
               }`}
>
               Dashboard
</button>
<button
               type="button"
               onClick={() => handleMainTabChange("appeal")}
               className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                 activeTab === "appeal"
                   ? "bg-gradient-to-r from-violet-700 to-fuchsia-600 text-white shadow-lg"
                   : "bg-slate-800 text-slate-200 hover:bg-slate-700"
               }`}
>
               Appeal
</button>
             {canSeeRubric ? (
<button
                 type="button"
                 onClick={() => handleMainTabChange("qa-rubric")}
                 className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                   activeTab === "qa-rubric"
                     ? "bg-gradient-to-r from-violet-700 to-fuchsia-600 text-white shadow-lg"
                     : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                 }`}
>
                 QA Rubric
</button>
             ) : null}
</div>
<div className="flex items-center gap-3">
<div className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-right">
<div className="text-sm font-semibold text-white">{currentUser.displayName}</div>
<div className="text-xs text-slate-400">{currentUser.role}</div>
</div>
<button
               type="button"
               onClick={handleLogout}
               className="rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-200"
>
               Log out
</button>
</div>
</div>
         {activeTab === "dashboard" ? (
<div className="mt-4 border-t border-slate-800 pt-4">
<div className="flex flex-wrap items-center gap-2">
<button
                 type="button"
                 onClick={() => setDashboardSubTab("overview")}
                 className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                   dashboardSubTab === "overview"
                     ? "bg-violet-100 text-violet-800"
                     : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                 }`}
>
                 Overview
</button>
<button
                 type="button"
                 onClick={() => setDashboardSubTab("case-detail")}
                 className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                   dashboardSubTab === "case-detail"
                     ? "bg-violet-100 text-violet-800"
                     : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                 }`}
>
                 Case Detail
</button>
</div>
</div>
         ) : null}
</div>
</div>
     {activeTab === "dashboard" ? (
<DashboardMockup currentUser={currentUser} dashboardSubTab={dashboardSubTab} />
     ) : activeTab === "appeal" ? (
<AppealMockup currentUser={currentUser} />
     ) : (
<QARubricPage />
     )}
</div>
 );
}
