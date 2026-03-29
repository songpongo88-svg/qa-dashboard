import React, { useMemo, useState } from "react";
import DashboardMockup from "./DashboardMockup";
import AppealMockup from "./AppealMockup";
import QARubricMockup from "./QARubricMockup";

type UserLike = {
  username?: string;
  displayName?: string;
  role?: string;
  agentName?: string;
};

export default function MainScreen({
  currentUser,
}: {
  currentUser: UserLike;
}) {
  const [activeTab, setActiveTab] = useState<"dashboard" | "appeal" | "rubric">(
    "dashboard"
  );
  const [dashboardSubTab, setDashboardSubTab] = useState<
    "overview" | "case-detail"
  >("overview");
  const [selectedAgentGlobal, setSelectedAgentGlobal] = useState<string>("");

  const effectiveSelectedAgent = useMemo(() => {
    if (currentUser?.role === "Agent" && currentUser?.agentName) {
      return currentUser.agentName;
    }
    return selectedAgentGlobal;
  }, [currentUser, selectedAgentGlobal]);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="border-b border-slate-200 bg-white">
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
        </div>
      </div>

      {activeTab === "dashboard" ? (
        <DashboardMockup
          currentUser={currentUser}
          dashboardSubTab={dashboardSubTab}
          externalSelectedAgent={effectiveSelectedAgent}
          onSelectedAgentChange={setSelectedAgentGlobal}
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
