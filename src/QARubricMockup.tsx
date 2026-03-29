import React from "react";

export default function QARubricMockup({
  currentUser,
}: {
  currentUser: any;
}) {
  const rubricItems = [
    "1.1 Greeting & Closing Standard",
    "1.2 Accuracy of Information",
    "1.3 PDPA & Policy",
    "2.1 Case Accuracy",
    "2.2 Completeness",
    "2.3 Clear Actionable Guidance",
    "2.4 Official Sources",
    "3.1 Root Cause & Resolution",
    "3.2 Case Ownership",
    "3.3 Clear Next Step Guidance",
    "4.1 Message Structure",
    "4.2 Language Quality",
    "4.3 Tone & Empathy",
    "4.4 Adaptation to Context",
    "5.1 Work Process Compliance",
    "5.2 SLA Compliance",
    "5.3 Case Logging / Status Accuracy",
  ];

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 rounded-3xl bg-gradient-to-r from-violet-950 via-violet-800 to-fuchsia-700 px-6 py-5 text-white shadow-xl">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">
            Robinhood QA Rubric
          </div>
          <h1 className="mt-3 text-3xl font-bold">QA Rubric</h1>
          <div className="mt-2 text-sm text-violet-100">
            Logged in as {currentUser?.displayName || "-"} ({currentUser?.role || "-"})
          </div>
        </div>

        <div className="rounded-3xl border border-violet-200 bg-white shadow-sm">
          <div className="border-b border-violet-100 px-6 py-4">
            <div className="text-lg font-semibold text-slate-900">
              Non-Voice QA Evaluation Criteria March 2026
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Reference rubric topics used in dashboard and appeal review
            </div>
          </div>

          <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
            {rubricItems.map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-violet-100 bg-violet-50 p-4 text-sm font-medium text-slate-800"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
