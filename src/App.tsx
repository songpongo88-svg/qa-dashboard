import { useState } from "react";
import DashboardMockup from "./DashboardMockup";
import AppealMockup from "./AppealMockup";

export default function App() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "appeal">("dashboard");

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="border-b bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl gap-2 p-4">
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
      </div>

      {activeTab === "dashboard" ? <DashboardMockup /> : <AppealMockup />}
    </div>
  );
}
