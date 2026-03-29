import React, { useMemo, useState } from "react";

type AppealStatus =
  | "Draft"
  | "Submitted"
  | "In Review"
  | "Approved"
  | "Rejected"
  | "Revised";

type TopicItem = {
  code: string;
  label: string;
  originalScore: number;
  revisedScore: number | null;
  originalComment: string;
  appealReason: string;
  revisedComment: string;
};

type AppealCase = {
  id: string;
  caseId: string;
  agentName: string;
  submitDate: string;
  auditDate: string;
  originalFinalScore: number;
  status: AppealStatus;
  version: string;
  decisionSummary: string;
  autoChangeRemark: string;
  topics: TopicItem[];
};

type UserLike = {
  username?: string;
  displayName?: string;
  role?: string;
  agentName?: string;
};

const MOCK_APPEALS: AppealCase[] = [
  {
    id: "APL-001",
    caseId: "AA205349",
    agentName: "Krivut Vongkampan",
    submitDate: "2026-03-25",
    auditDate: "2026-03-23",
    originalFinalScore: 81,
    status: "Revised",
    version: "REV1",
    decisionSummary: "Adjusted after appeal review in selected topics.",
    autoChangeRemark: "Score changed 1 topic",
    topics: [
      {
        code: "3.3",
        label: "Clear Next Step Guidance",
        originalScore: 3,
        revisedScore: 4,
        originalComment: "Next step not fully clear.",
        appealReason: "Agent explained the next action and timeline clearly.",
        revisedComment: "Revised to reflect clearer next-step guidance.",
      },
      {
        code: "4.1",
        label: "Message Structure",
        originalScore: 5,
        revisedScore: null,
        originalComment: "Structure was acceptable.",
        appealReason: "",
        revisedComment: "",
      },
    ],
  },
  {
    id: "APL-002",
    caseId: "AA206880",
    agentName: "Natcha Chai-in",
    submitDate: "2026-03-26",
    auditDate: "2026-03-26",
    originalFinalScore: 74,
    status: "In Review",
    version: "REV1",
    decisionSummary: "",
    autoChangeRemark: "",
    topics: [
      {
        code: "2.2",
        label: "Completeness",
        originalScore: 2,
        revisedScore: null,
        originalComment: "Answer did not fully cover the concern.",
        appealReason:
          "The response followed policy limits and addressed the main issue.",
        revisedComment: "",
      },
      {
        code: "2.3",
        label: "Clear Actionable Guidance",
        originalScore: 2,
        revisedScore: null,
        originalComment: "Guidance was limited.",
        appealReason:
          "Policy restriction prevented more detailed guidance.",
        revisedComment: "",
      },
    ],
  },
  {
    id: "APL-003",
    caseId: "AA205172",
    agentName: "Jariyawadee Taboodda",
    submitDate: "2026-03-23",
    auditDate: "2026-03-22",
    originalFinalScore: 96,
    status: "Approved",
    version: "REV1",
    decisionSummary: "Appeal reviewed and acknowledged with no score change.",
    autoChangeRemark: "No change",
    topics: [
      {
        code: "1.1",
        label: "Greeting & Closing Standard",
        originalScore: 10,
        revisedScore: 10,
        originalComment: "Standard followed correctly.",
        appealReason: "No appeal reason provided.",
        revisedComment: "No change.",
      },
    ],
  },
];

function statusTone(status: AppealStatus) {
  switch (status) {
    case "Draft":
      return "border-slate-300 bg-slate-100 text-slate-700";
    case "Submitted":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "In Review":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "Approved":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "Rejected":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "Revised":
      return "border-violet-200 bg-violet-50 text-violet-700";
    default:
      return "border-slate-300 bg-slate-100 text-slate-700";
  }
}

function calculateRevisedFinalScore(
  topics: TopicItem[],
  originalFinalScore: number
) {
  const originalTopicTotal = topics.reduce(
    (sum, item) => sum + item.originalScore,
    0
  );
  const revisedTopicTotal = topics.reduce(
    (sum, item) => sum + (item.revisedScore ?? item.originalScore),
    0
  );

  return originalFinalScore - originalTopicTotal + revisedTopicTotal;
}

function getChangedTopics(topics: TopicItem[]) {
  return topics.filter(
    (item) =>
      item.revisedScore !== null && item.revisedScore !== item.originalScore
  ).length;
}

function buildAutoChangeRemark(topics: TopicItem[]) {
  const changedCount = topics.filter(
    (item) =>
      item.revisedScore !== null && item.revisedScore !== item.originalScore
  ).length;

  if (changedCount === 0) return "No change";
  if (changedCount === 1) return "Score changed 1 topic";
  return `Score changed ${changedCount} topics`;
}

function Panel({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-violet-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-violet-100 bg-white px-5 py-4">
        <div className="text-lg font-semibold text-slate-900">{title}</div>
        {right ? <div>{right}</div> : null}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  sub,
}: {
  title: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-violet-200 bg-white shadow-sm">
      <div className="h-1 bg-gradient-to-r from-violet-700 via-fuchsia-600 to-violet-500" />
      <div className="p-5">
        <div className="text-sm font-semibold text-slate-600">{title}</div>
        <div className="mt-3 text-3xl font-bold text-slate-900">{value}</div>
        <div className="mt-2 text-xs text-slate-500">{sub}</div>
      </div>
    </div>
  );
}

function SmallButton({
  children,
  dark = false,
  onClick,
}: {
  children: React.ReactNode;
  dark?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        dark
          ? "rounded-2xl border border-white/10 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20"
          : "rounded-2xl border border-violet-200 bg-white px-4 py-2.5 text-sm font-semibold text-violet-700 hover:bg-violet-50"
      }
    >
      {children}
    </button>
  );
}

export default function AppealMockup({ currentUser }: { currentUser: UserLike }) {
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedAppealId, setSelectedAppealId] = useState<string | null>(null);
  const [appeals, setAppeals] = useState<AppealCase[]>(MOCK_APPEALS);

  const canSeeAll = currentUser?.role !== "Agent";
  const effectiveAgent =
    currentUser?.role === "Agent" && currentUser?.agentName
      ? currentUser.agentName
      : "";

  const visibleAppeals = useMemo(() => {
    let items = [...appeals];

    if (!canSeeAll && effectiveAgent) {
      items = items.filter((item) => item.agentName === effectiveAgent);
    }

    if (selectedStatus !== "all") {
      items = items.filter((item) => item.status === selectedStatus);
    }

    return items;
  }, [appeals, canSeeAll, effectiveAgent, selectedStatus]);

  const selectedAppeal =
    visibleAppeals.find((item) => item.id === selectedAppealId) || null;

  const totalAppeals = visibleAppeals.length;
  const revisedCases = visibleAppeals.filter(
    (item) => item.status === "Revised"
  ).length;
  const inReviewCases = visibleAppeals.filter(
    (item) => item.status === "In Review"
  ).length;
  const approvedCases = visibleAppeals.filter(
    (item) => item.status === "Approved"
  ).length;

  const updateTopic = (
    appealId: string,
    topicCode: string,
    field: "revisedScore" | "revisedComment",
    value: string
  ) => {
    setAppeals((prev) =>
      prev.map((appeal) => {
        if (appeal.id !== appealId) return appeal;

        const updatedTopics = appeal.topics.map((topic) => {
          if (topic.code !== topicCode) return topic;

          if (field === "revisedScore") {
            return {
              ...topic,
              revisedScore: value === "" ? null : Number(value),
            };
          }

          return {
            ...topic,
            revisedComment: value,
          };
        });

        return {
          ...appeal,
          topics: updatedTopics,
          autoChangeRemark: buildAutoChangeRemark(updatedTopics),
        };
      })
    );
  };

  const updateAppealField = (
    appealId: string,
    field: "status" | "autoChangeRemark" | "decisionSummary",
    value: string
  ) => {
    setAppeals((prev) =>
      prev.map((appeal) => {
        if (appeal.id !== appealId) return appeal;

        if (field === "status") {
          return {
            ...appeal,
            status: value as AppealStatus,
          };
        }

        if (field === "autoChangeRemark") {
          return {
            ...appeal,
            autoChangeRemark: value,
          };
        }

        return {
          ...appeal,
          decisionSummary: value,
        };
      })
    );
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl p-6">
        <div className="mb-6 rounded-3xl bg-gradient-to-r from-violet-950 via-violet-800 to-fuchsia-700 px-6 py-5 text-white shadow-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">
                Robinhood QA Appeal
              </div>
              <h1 className="mt-3 text-3xl font-bold leading-tight">
                QA Appeal Dashboard
              </h1>
              <div className="mt-2 text-sm text-violet-100">
                Logged in as {currentUser?.displayName || "-"} (
                {currentUser?.role || "-"})
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <SmallButton onClick={() => window.print()}>
                Print / Save PDF
              </SmallButton>
              <SmallButton dark onClick={() => window.print()}>
                Export
              </SmallButton>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Total Appeals"
            value={`${totalAppeals}`}
            sub="Visible in current view"
          />
          <MetricCard
            title="In Review"
            value={`${inReviewCases}`}
            sub="Pending reviewer action"
          />
          <MetricCard
            title="Revised Cases"
            value={`${revisedCases}`}
            sub="Score changed after review"
          />
          <MetricCard
            title="Approved"
            value={`${approvedCases}`}
            sub="Appeal process completed"
          />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-6">
            <Panel title="Quick Controls">
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Appeal Status
                  </label>
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                  >
                    <option value="all">All Statuses</option>
                    <option value="Draft">Draft</option>
                    <option value="Submitted">Submitted</option>
                    <option value="In Review">In Review</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected</option>
                    <option value="Revised">Revised</option>
                  </select>
                </div>

                <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
                  <div className="text-xs text-slate-500">Visibility Rule</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {canSeeAll ? "View all appeals" : "View own appeals only"}
                  </div>
                </div>

                {!canSeeAll ? (
                  <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
                    <div className="text-xs text-slate-500">Current Agent</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      {effectiveAgent || "-"}
                    </div>
                  </div>
                ) : null}
              </div>
            </Panel>

            <Panel title="Appeal Status Guide">
              <div className="space-y-3">
                {[
                  "Draft = ยังไม่ส่ง",
                  "Submitted = ส่งแล้ว รอเปิดเคส",
                  "In Review = อยู่ระหว่างตรวจสอบ",
                  "Approved = พิจารณาเสร็จสิ้น",
                  "Rejected = ไม่ปรับผล",
                  "Revised = มีการปรับคะแนน/ผลลัพธ์",
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel title="Appeal Queue">
              {visibleAppeals.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
                  ไม่พบข้อมูลอุทธรณ์ในเงื่อนไขที่เลือก
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-violet-100">
                  <table className="min-w-[1080px] w-full text-sm">
                    <thead>
                      <tr className="bg-violet-900 text-[11px] text-white">
                        <th className="px-3 py-3 text-left">Appeal ID</th>
                        <th className="px-3 py-3 text-left">Case ID</th>
                        <th className="px-3 py-3 text-left">Agent</th>
                        <th className="px-3 py-3 text-left">Submit Date</th>
                        <th className="px-3 py-3 text-center">Original</th>
                        <th className="px-3 py-3 text-center">Revised</th>
                        <th className="px-3 py-3 text-left">Topic(s)</th>
                        <th className="px-3 py-3 text-center">Status</th>
                        <th className="px-3 py-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleAppeals.map((item) => (
                        <tr key={item.id} className="bg-white">
                          <td className="border-t border-slate-200 px-3 py-3 font-medium text-slate-900">
                            {item.id}
                          </td>
                          <td className="border-t border-slate-200 px-3 py-3">
                            {item.caseId}
                          </td>
                          <td className="border-t border-slate-200 px-3 py-3">
                            {item.agentName}
                          </td>
                          <td className="border-t border-slate-200 px-3 py-3">
                            {item.submitDate}
                          </td>
                          <td className="border-t border-slate-200 px-3 py-3 text-center">
                            {item.originalFinalScore}
                          </td>
                          <td className="border-t border-slate-200 px-3 py-3 text-center">
                            {calculateRevisedFinalScore(
                              item.topics,
                              item.originalFinalScore
                            )}
                          </td>
                          <td className="border-t border-slate-200 px-3 py-3">
                            {item.topics.map((topic) => topic.code).join(", ")}
                          </td>
                          <td className="border-t border-slate-200 px-3 py-3 text-center">
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(
                                item.status
                              )}`}
                            >
                              {item.status}
                            </span>
                          </td>
                          <td className="border-t border-slate-200 px-3 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => setSelectedAppealId(item.id)}
                              className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100"
                            >
                              Open
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            {selectedAppeal ? (
              <Panel
                title={`Appeal Review • ${selectedAppeal.caseId}`}
                right={
                  <button
                    type="button"
                    onClick={() => setSelectedAppealId(null)}
                    className="rounded-2xl border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50"
                  >
                    Back to List
                  </button>
                }
              >
                <div className="space-y-6">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs text-slate-500">Case ID</div>
                      <div className="text-lg font-semibold text-slate-900">
                        {selectedAppeal.caseId}
                      </div>

                      <div className="mt-4 text-xs text-slate-500">Agent Name</div>
                      <div className="text-sm font-medium text-slate-900">
                        {selectedAppeal.agentName}
                      </div>

                      <div className="mt-4 text-xs text-slate-500">Audit Date</div>
                      <div className="text-sm font-medium text-slate-900">
                        {selectedAppeal.auditDate}
                      </div>

                      <div className="mt-4 text-xs text-slate-500">Version</div>
                      <div className="text-sm font-medium text-slate-900">
                        {selectedAppeal.version}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs text-slate-500">
                        Original Final Score
                      </div>
                      <div className="text-lg font-semibold text-slate-900">
                        {selectedAppeal.originalFinalScore}
                      </div>

                      <div className="mt-4 text-xs text-slate-500">
                        Revised Final Score
                      </div>
                      <div className="text-lg font-semibold text-slate-900">
                        {calculateRevisedFinalScore(
                          selectedAppeal.topics,
                          selectedAppeal.originalFinalScore
                        )}
                      </div>

                      <div className="mt-4 text-xs text-slate-500">
                        Changed Topics
                      </div>
                      <div className="text-sm font-medium text-slate-900">
                        {getChangedTopics(selectedAppeal.topics)}
                      </div>

                      <div className="mt-4 text-xs text-slate-500">Status</div>
                      <div className="mt-1">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(
                            selectedAppeal.status
                          )}`}
                        >
                          {selectedAppeal.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {selectedAppeal.topics.map((topic) => (
                      <div
                        key={topic.code}
                        className="rounded-2xl border border-violet-100 bg-white p-4"
                      >
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs text-slate-500">
                              {topic.code}
                            </div>
                            <div className="text-base font-semibold text-slate-900">
                              {topic.label}
                            </div>
                          </div>
                          <div className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                            {topic.revisedScore !== null
                              ? `Revised: ${topic.originalScore} → ${topic.revisedScore}`
                              : "No score change"}
                          </div>
                        </div>

                        <div className="grid gap-4 xl:grid-cols-3">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Original
                            </div>
                            <div className="mt-3 text-sm text-slate-700">
                              <span className="font-semibold">Score:</span>{" "}
                              {topic.originalScore}
                            </div>
                            <div className="mt-3 text-sm text-slate-700">
                              {topic.originalComment}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Appeal Reason
                            </div>
                            <div className="mt-3 text-sm text-slate-700">
                              {topic.appealReason || "-"}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Reviewer Update
                            </div>

                            <div className="mt-3">
                              <label className="mb-1 block text-xs text-slate-500">
                                Revised Score
                              </label>
                              <input
                                type="number"
                                value={topic.revisedScore ?? ""}
                                disabled={!canSeeAll}
                                onChange={(e) =>
                                  updateTopic(
                                    selectedAppeal.id,
                                    topic.code,
                                    "revisedScore",
                                    e.target.value
                                  )
                                }
                                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200 disabled:bg-slate-100"
                              />
                            </div>

                            <div className="mt-3">
                              <label className="mb-1 block text-xs text-slate-500">
                                Revised Comment
                              </label>
                              <textarea
                                value={topic.revisedComment}
                                disabled={!canSeeAll}
                                onChange={(e) =>
                                  updateTopic(
                                    selectedAppeal.id,
                                    topic.code,
                                    "revisedComment",
                                    e.target.value
                                  )
                                }
                                className="min-h-[110px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200 disabled:bg-slate-100"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        Auto Change Remark
                      </label>
                      <input
                        type="text"
                        value={selectedAppeal.autoChangeRemark}
                        disabled={!canSeeAll}
                        onChange={(e) =>
                          updateAppealField(
                            selectedAppeal.id,
                            "autoChangeRemark",
                            e.target.value
                          )
                        }
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200 disabled:bg-slate-100"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        Appeal Status
                      </label>
                      <select
                        value={selectedAppeal.status}
                        disabled={!canSeeAll}
                        onChange={(e) =>
                          updateAppealField(
                            selectedAppeal.id,
                            "status",
                            e.target.value
                          )
                        }
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200 disabled:bg-slate-100"
                      >
                        <option value="Draft">Draft</option>
                        <option value="Submitted">Submitted</option>
                        <option value="In Review">In Review</option>
                        <option value="Approved">Approved</option>
                        <option value="Rejected">Rejected</option>
                        <option value="Revised">Revised</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Decision Summary
                    </label>
                    <textarea
                      value={selectedAppeal.decisionSummary}
                      disabled={!canSeeAll}
                      onChange={(e) =>
                        updateAppealField(
                          selectedAppeal.id,
                          "decisionSummary",
                          e.target.value
                        )
                      }
                      className="min-h-[140px] w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200 disabled:bg-slate-100"
                    />
                  </div>

                  {canSeeAll ? (
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        className="rounded-2xl border border-violet-200 bg-white px-4 py-2.5 text-sm font-semibold text-violet-700 hover:bg-violet-50"
                      >
                        Save Draft
                      </button>
                      <button
                        type="button"
                        className="rounded-2xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800"
                      >
                        Submit Review
                      </button>
                    </div>
                  ) : null}
                </div>
              </Panel>
            ) : null}

            <Panel title="Latest Appeal Remarks">
              <div className="space-y-3">
                {visibleAppeals.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                    ไม่มีหมายเหตุในมุมมองนี้
                  </div>
                ) : (
                  visibleAppeals.map((item) => (
                    <div
                      key={`${item.id}-remark`}
                      className="rounded-2xl border border-violet-100 bg-white p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-slate-900">
                          {item.caseId} • {item.agentName}
                        </div>
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(
                            item.status
                          )}`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <div className="mt-2 text-sm text-slate-600">
                        {item.topics.map((topic) => topic.code).join(", ")}
                      </div>
                      <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                        {item.autoChangeRemark || item.decisionSummary || "-"}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
