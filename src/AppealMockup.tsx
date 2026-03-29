import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type UserLike = {
  username?: string;
  displayName?: string;
  role?: string;
  agentName?: string;
};

type AppealStatus =
  | "Pending"
  | "Approved"
  | "Partially Approved"
  | "Rejected"
  | "No Change"
  | "In Review"
  | "Draft";

type Grade = "A" | "B" | "C" | "D" | "F";

type TopicItem = {
  code: string;
  label: string;
  originalScore: number | null;
  revisedScore: number | null;
  originalComment: string;
  appealReason: string;
  revisedComment: string;
  changed: boolean;
};

type AppealCase = {
  id: string;
  caseId: string;
  agentName: string;
  auditDate: string;
  submitDate: string;
  resultDate: string;
  appealChannel: string;
  reviewType: string;
  criticalError: string;
  version: string;
  appealStatus: AppealStatus;
  commentStatus: string;
  customerInquiry: string;
  autoChangeRemark: string;
  decisionSummary: string;
  originalFinalScore: number;
  revisedFinalScore: number;
  originalGrade: Grade;
  revisedGrade: Grade;
  changedTopicsCount: number;
  appealedTopicsCount: number;
  topics: TopicItem[];
};

const TOPIC_MASTER = [
  { code: "1.1", label: "Greeting & Closing Standard", max: 10 },
  { code: "1.2", label: "Accuracy of Information", max: 5 },
  { code: "1.3", label: "PDPA & Policy", max: 5 },
  { code: "2.1", label: "Case Accuracy", max: 5 },
  { code: "2.2", label: "Completeness", max: 5 },
  { code: "2.3", label: "Clear Actionable Guidance", max: 5 },
  { code: "2.4", label: "Official Sources", max: 5 },
  { code: "3.1", label: "Root Cause & Resolution", max: 10 },
  { code: "3.2", label: "Case Ownership", max: 5 },
  { code: "3.3", label: "Clear Next Step Guidance", max: 5 },
  { code: "4.1", label: "Message Structure", max: 5 },
  { code: "4.2", label: "Language Quality", max: 5 },
  { code: "4.3", label: "Tone & Empathy", max: 5 },
  { code: "4.4", label: "Adaptation to Context", max: 5 },
  { code: "5.1", label: "Work Process Compliance", max: 10 },
  { code: "5.2", label: "SLA Compliance", max: 5 },
  { code: "5.3", label: "Case Logging / Status Accuracy", max: 5 },
] as const;

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function scoreToGrade(score: number): Grade {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function gradeTone(grade: Grade) {
  switch (grade) {
    case "A":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "B":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "C":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "D":
      return "border-orange-200 bg-orange-50 text-orange-700";
    default:
      return "border-rose-200 bg-rose-50 text-rose-700";
  }
}

function statusTone(status: AppealStatus) {
  switch (status) {
    case "Approved":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "Partially Approved":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "Rejected":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "No Change":
      return "border-slate-200 bg-slate-50 text-slate-700";
    case "In Review":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "Draft":
      return "border-slate-300 bg-slate-100 text-slate-700";
    default:
      return "border-violet-200 bg-violet-50 text-violet-700";
  }
}

function excelDateToText(value: any) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const dt = new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, parsed.S);
      return dt.toLocaleString("en-GB");
    }
  }
  const maybeDate = new Date(value);
  if (!Number.isNaN(maybeDate.getTime())) return maybeDate.toLocaleString("en-GB");
  return String(value);
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function buildHeaderHelpers(headerRow: any[]) {
  const normalizedHeaders = headerRow.map((h) => normalizeText(h));

  const colIndexes = (name: string) => {
    const target = normalizeText(name);
    return normalizedHeaders
      .map((h, idx) => (h === target ? idx : -1))
      .filter((idx) => idx >= 0);
  };

  const getValue = (row: any[], name: string, occurrence = 0) => {
    const indexes = colIndexes(name);
    const idx = indexes[occurrence];
    return idx >= 0 ? row[idx] : null;
  };

  const getLastValue = (row: any[], name: string) => {
    const indexes = colIndexes(name);
    if (!indexes.length) return null;
    return row[indexes[indexes.length - 1]];
  };

  const getFirstExisting = (row: any[], names: string[]) => {
    for (const name of names) {
      const value = getValue(row, name);
      if (value !== null && value !== undefined && String(value).trim() !== "") {
        return value;
      }
    }
    return null;
  };

  const hasAnyHeader = (names: string[]) => {
    return names.some((name) => colIndexes(name).length > 0);
  };

  return { getValue, getLastValue, getFirstExisting, hasAnyHeader };
}

function getEffectiveScore(topic: TopicItem) {
  return topic.revisedScore ?? topic.originalScore ?? 0;
}

function calculateFinalScore(topics: TopicItem[], criticalError: string) {
  const normalized = normalizeText(criticalError);
  if (normalized.includes("critical")) return 0;
  return Number(
    topics.reduce((sum, topic) => sum + getEffectiveScore(topic), 0).toFixed(2)
  );
}

function buildAutoChangeRemark(topics: TopicItem[]) {
  const changedScoreCount = topics.filter(
    (t) => t.revisedScore !== null && t.revisedScore !== t.originalScore
  ).length;

  const changedCommentCount = topics.filter((t) => {
    const commentChanged =
      normalizeText(t.revisedComment) !== "" &&
      normalizeText(t.revisedComment) !== normalizeText(t.originalComment);
    const scoreChanged = t.revisedScore !== null && t.revisedScore !== t.originalScore;
    return commentChanged && !scoreChanged;
  }).length;

  if (changedScoreCount === 0 && changedCommentCount === 0) return "No change";
  if (changedScoreCount > 0 && changedCommentCount > 0) {
    return `Score changed ${changedScoreCount} topic(s), comment revised ${changedCommentCount} topic(s)`;
  }
  if (changedScoreCount > 0) return `Score changed ${changedScoreCount} topic(s)`;
  return `Comment revised ${changedCommentCount} topic(s)`;
}

function inferAppealStatus(
  rawStatus: string,
  originalFinalScore: number,
  revisedFinalScore: number,
  changedTopicsCount: number
): AppealStatus {
  const normalized = normalizeText(rawStatus);

  if (normalized.includes("partial")) return "Partially Approved";
  if (normalized.includes("approve")) return "Approved";
  if (normalized.includes("reject")) return "Rejected";
  if (normalized.includes("review")) return "In Review";
  if (normalized.includes("draft")) return "Draft";
  if (normalized.includes("pending")) return "Pending";

  if (changedTopicsCount === 0 && revisedFinalScore === originalFinalScore) return "No Change";
  if (changedTopicsCount > 0 && revisedFinalScore !== originalFinalScore) return "Partially Approved";
  return "Pending";
}

function hasValue(value: unknown) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function Panel({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-violet-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-violet-100 px-5 py-4">
        <div>
          <div className="text-lg font-semibold text-slate-900">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
        </div>
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
      <div className="h-1 bg-gradient-to-r from-violet-900 via-violet-700 to-fuchsia-600" />
      <div className="p-5">
        <div className="text-sm font-semibold text-slate-600">{title}</div>
        <div className="mt-3 text-3xl font-bold text-slate-900">{value}</div>
        <div className="mt-2 text-xs text-slate-500">{sub}</div>
      </div>
    </div>
  );
}

function TopicCard({ topic }: { topic: TopicItem }) {
  const scoreChanged =
    topic.revisedScore !== null && topic.revisedScore !== topic.originalScore;

  const commentChanged =
    normalizeText(topic.revisedComment) !== "" &&
    normalizeText(topic.revisedComment) !== normalizeText(topic.originalComment);

  const appealed = normalizeText(topic.appealReason) !== "";

  return (
    <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-violet-700">
            {topic.code}
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900">{topic.label}</div>
        </div>

        <div className="flex flex-wrap gap-2">
          {appealed ? (
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-semibold text-sky-700">
              Appealed
            </span>
          ) : null}
          {scoreChanged ? (
            <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[10px] font-semibold text-violet-700">
              {topic.originalScore ?? 0} → {topic.revisedScore ?? 0}
            </span>
          ) : null}
          {!scoreChanged && commentChanged ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700">
              Comment Revised
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        {(hasValue(topic.originalScore) || hasValue(topic.originalComment)) && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Original
            </div>
            {hasValue(topic.originalScore) ? (
              <div className="mt-2 text-sm text-slate-700">
                <span className="font-semibold">Score:</span> {topic.originalScore}
              </div>
            ) : null}
            {hasValue(topic.originalComment) ? (
              <div className="mt-3 text-[13px] leading-6 text-slate-700 whitespace-pre-line">
                {topic.originalComment}
              </div>
            ) : null}
          </div>
        )}

        {hasValue(topic.appealReason) ? (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-sky-700">
              Appeal Reason
            </div>
            <div className="mt-3 text-[13px] leading-6 text-slate-800 whitespace-pre-line">
              {topic.appealReason}
            </div>
          </div>
        ) : null}

        {(hasValue(topic.revisedScore) || hasValue(topic.revisedComment)) && (
          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-violet-700">
              QA Response / Revised
            </div>
            {hasValue(topic.revisedScore) ? (
              <div className="mt-2 text-sm text-slate-800">
                <span className="font-semibold">Score:</span> {topic.revisedScore}
              </div>
            ) : null}
            {hasValue(topic.revisedComment) ? (
              <div className="mt-3 text-[13px] leading-6 text-slate-800 whitespace-pre-line">
                {topic.revisedComment}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AppealMockup({
  currentUser,
  selectedAgentFilter,
}: {
  currentUser: UserLike;
  selectedAgentFilter?: string;
}) {
  const [appealCases, setAppealCases] = useState<AppealCase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedAppealId, setSelectedAppealId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchText, setSearchText] = useState("");
  const [detailMode, setDetailMode] = useState<"all" | "appealedOnly" | "changedOnly">("appealedOnly");

  useEffect(() => {
    const loadAppealWorkbook = async () => {
      try {
        setIsLoading(true);
        setLoadError("");

        const response = await fetch("/Appleal ROWDATA.xlsx");
        if (!response.ok) {
          throw new Error("ไม่พบไฟล์ Appleal ROWDATA.xlsx ในโฟลเดอร์ public");
        }

        const buffer = await response.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
        const sheet =
          workbook.Sheets["Appeal_Data"] || workbook.Sheets[workbook.SheetNames[0]];

        const rows = XLSX.utils.sheet_to_json<any[]>(sheet, {
          header: 1,
          defval: null,
          raw: true,
        });

        const headerIndex = (() => {
          for (let i = 0; i < rows.length; i++) {
            const row = (rows[i] || []) as any[];
            const helper = buildHeaderHelpers(row);
            const hasCase = helper.hasAnyHeader(["Case ID", "CaseId", "Selected Case"]);
            const hasAgent = helper.hasAnyHeader(["Agent Name", "Agent", "QA Name", "Employee Name"]);
            if (hasCase && hasAgent) return i;
          }
          return -1;
        })();

        if (headerIndex === -1) {
          throw new Error("ไม่พบแถว Header ในไฟล์ Appleal ROWDATA.xlsx");
        }

        const headerRow = (rows[headerIndex] || []) as any[];
        const dataRows = rows.slice(headerIndex + 1);
        const helper = buildHeaderHelpers(headerRow);

        const mapped: AppealCase[] = dataRows
          .filter((row) => row && helper.getFirstExisting(row, ["Case ID", "CaseId", "Selected Case"]))
          .map((row, index) => {
            const topics: TopicItem[] = TOPIC_MASTER.map((topic) => {
              const originalScore = toNumberOrNull(
                helper.getFirstExisting(row, [`${topic.code} Score`, `${topic.code} Original Score`])
              );
              const revisedScore = toNumberOrNull(
                helper.getFirstExisting(row, [`${topic.code} Revised Score`, `${topic.code} New Score`])
              );
              const originalComment = String(
                helper.getFirstExisting(row, [`${topic.code} Comment`, `${topic.code} Original Comment`]) ?? ""
              ).trim();
              const appealReason = String(
                helper.getFirstExisting(row, [`${topic.code} Appeal Reason`, `${topic.code} Agent Appeal`, `${topic.code} Reason`]) ?? ""
              ).trim();
              const revisedComment = String(
                helper.getFirstExisting(row, [`${topic.code} Revised Comment`, `${topic.code} QA Comment`, `${topic.code} Result Comment`]) ?? ""
              ).trim();

              const scoreChanged =
                revisedScore !== null && originalScore !== null && revisedScore !== originalScore;

              const commentChanged =
                normalizeText(revisedComment) !== "" &&
                normalizeText(revisedComment) !== normalizeText(originalComment);

              return {
                code: topic.code,
                label: topic.label,
                originalScore,
                revisedScore,
                originalComment,
                appealReason,
                revisedComment,
                changed: scoreChanged || commentChanged,
              };
            });

            const criticalError = String(
              helper.getFirstExisting(row, ["Critical Error", "Critical", "Critical Error Status"]) ?? ""
            ).trim();

            const originalFinalScore =
              toNumberOrNull(helper.getValue(row, "Final Score", 0)) ??
              toNumberOrNull(helper.getFirstExisting(row, ["Original Final Score", "Previous Score", "Score Before Appeal"])) ??
              Number(topics.reduce((sum, topic) => sum + (topic.originalScore ?? 0), 0).toFixed(2));

            const revisedFinalScore =
              toNumberOrNull(helper.getLastValue(row, "Final Score")) ??
              toNumberOrNull(helper.getFirstExisting(row, ["Revised Final Score", "Score After Appeal"])) ??
              calculateFinalScore(topics, criticalError);

            const changedTopicsCount = topics.filter((topic) => topic.changed).length;
            const appealedTopicsCount = topics.filter(
              (topic) => normalizeText(topic.appealReason) !== ""
            ).length;

            const rawStatus = String(
              helper.getFirstExisting(row, ["Appeal Status", "Result Status", "Status"]) ?? ""
            ).trim();

            const autoChangeRemark =
              String(helper.getFirstExisting(row, ["Auto Change Remark", "Change Remark"]) ?? "").trim() ||
              buildAutoChangeRemark(topics);

            const decisionSummary =
              String(
                helper.getFirstExisting(row, ["สรุปผลพิจารณา", "Decision Summary", "QA Response Summary", "Result Summary"]) ?? ""
              ).trim();

            const appealStatus = inferAppealStatus(
              rawStatus,
              originalFinalScore,
              revisedFinalScore,
              changedTopicsCount
            );

            return {
              id: `APL-${String(index + 1).padStart(4, "0")}`,
              caseId: String(
                helper.getFirstExisting(row, ["Case ID", "CaseId", "Selected Case"]) ?? ""
              ).trim(),
              agentName: String(
                helper.getFirstExisting(row, ["Agent Name", "Agent", "QA Name", "Employee Name"]) ?? ""
              ).trim(),
              auditDate: excelDateToText(
                helper.getFirstExisting(row, ["Audit Date", "QA Date", "Evaluation Date"])
              ),
              submitDate: excelDateToText(
                helper.getFirstExisting(row, ["Appeal Submit Date & Time", "Timestamp", "Submit Date"])
              ),
              resultDate: excelDateToText(
                helper.getFirstExisting(row, ["Appeal Result Date & Time", "Result Date"])
              ),
              appealChannel: String(
                helper.getFirstExisting(row, ["Appeal Channel", "Channel"]) ?? ""
              ).trim(),
              reviewType: String(
                helper.getFirstExisting(row, ["Review Type", "Type"]) ?? ""
              ).trim(),
              criticalError,
              version: String(
                helper.getFirstExisting(row, ["Appeal Version", "Version", "Appeal Ver."]) ?? "REV1"
              ).trim(),
              appealStatus,
              commentStatus: String(
                helper.getFirstExisting(row, ["Comment Status", "QA Comment Status"]) ?? ""
              ).trim(),
              customerInquiry: String(
                helper.getFirstExisting(row, ["Customer Inquiry", "Inquiry", "Case Detail", "Issue Detail"]) ?? ""
              ).trim(),
              autoChangeRemark,
              decisionSummary,
              originalFinalScore,
              revisedFinalScore,
              originalGrade: scoreToGrade(originalFinalScore),
              revisedGrade: scoreToGrade(revisedFinalScore),
              changedTopicsCount,
              appealedTopicsCount,
              topics,
            };
          })
          .filter((item) => item.caseId);

        setAppealCases(mapped);
      } catch (error: any) {
        console.error(error);
        setLoadError(error?.message || "โหลดไฟล์ Appleal ROWDATA.xlsx ไม่สำเร็จ");
      } finally {
        setIsLoading(false);
      }
    };

    loadAppealWorkbook();
  }, []);

  const canViewAll = currentUser?.role !== "Agent";
  const effectiveAgent =
    currentUser?.role === "Agent" && currentUser?.agentName
      ? currentUser.agentName
      : "";

  const visibleCases = useMemo(() => {
    let items = [...appealCases];

    if (!canViewAll && effectiveAgent) {
      items = items.filter(
        (item) => normalizeText(item.agentName) === normalizeText(effectiveAgent)
      );
    } else if (canViewAll && hasValue(selectedAgentFilter)) {
      items = items.filter(
        (item) => normalizeText(item.agentName) === normalizeText(selectedAgentFilter)
      );
    }

    if (statusFilter !== "all") {
      items = items.filter((item) => item.appealStatus === statusFilter);
    }

    if (searchText.trim()) {
      const q = normalizeText(searchText);
      items = items.filter(
        (item) =>
          normalizeText(item.caseId).includes(q) ||
          normalizeText(item.agentName).includes(q)
      );
    }

    return items;
  }, [appealCases, canViewAll, effectiveAgent, selectedAgentFilter, statusFilter, searchText]);

  const selectedCase =
    visibleCases.find((item) => item.id === selectedAppealId) || visibleCases[0] || null;

  const detailTopics = useMemo(() => {
    if (!selectedCase) return [];

    if (detailMode === "appealedOnly") {
      return selectedCase.topics.filter((topic) => normalizeText(topic.appealReason) !== "");
    }
    if (detailMode === "changedOnly") {
      return selectedCase.topics.filter((topic) => topic.changed);
    }
    return selectedCase.topics;
  }, [selectedCase, detailMode]);

  const totalCases = visibleCases.length;
  const revisedCases = visibleCases.filter((item) => item.changedTopicsCount > 0).length;
  const pendingCases = visibleCases.filter(
    (item) => item.appealStatus === "Pending" || item.appealStatus === "In Review"
  ).length;
  const approvedCases = visibleCases.filter(
    (item) =>
      item.appealStatus === "Approved" || item.appealStatus === "Partially Approved"
  ).length;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-3xl border border-violet-200 bg-white px-6 py-5 text-slate-700 shadow-sm">
          กำลังโหลด Appleal ROWDATA.xlsx...
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="max-w-xl rounded-3xl border border-rose-200 bg-white px-6 py-5 text-rose-700 shadow-sm">
          <div className="text-lg font-semibold">โหลดไฟล์ไม่สำเร็จ</div>
          <div className="mt-2 text-sm">{loadError}</div>
          <div className="mt-3 text-sm text-slate-600">
            ตรวจสอบว่าไฟล์อยู่ที่ public/Appleal ROWDATA.xlsx
          </div>
        </div>
      </div>
    );
  }

  if (!visibleCases.length) {
    return (
      <div className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 rounded-3xl bg-gradient-to-r from-violet-950 via-violet-800 to-fuchsia-700 px-6 py-5 text-white shadow-xl">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">
              Robinhood QA Appeal
            </div>
            <h1 className="mt-3 text-3xl font-bold">QA Appeal Review</h1>
            <div className="mt-2 text-sm text-violet-100">
              Logged in as {currentUser?.displayName || "-"} ({currentUser?.role || "-"})
            </div>
          </div>

          <div className="rounded-3xl border border-violet-200 bg-white p-10 text-center shadow-sm">
            <div className="text-lg font-semibold text-slate-900">ไม่พบเคสอุทธรณ์</div>
            <div className="mt-2 text-sm text-slate-500">
              {currentUser?.role === "Agent"
                ? "บัญชีนี้ยังไม่มีเคสอุทธรณ์ของตัวเอง หรือชื่อในไฟล์ไม่ตรงกับชื่อ login"
                : hasValue(selectedAgentFilter)
                ? `Agent ที่เลือก (${selectedAgentFilter}) ยังไม่มีเคสอุทธรณ์`
                : "ไม่พบข้อมูลตามเงื่อนไขที่เลือก"}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl p-6">
        <div className="mb-6 rounded-3xl bg-gradient-to-r from-violet-950 via-violet-800 to-fuchsia-700 px-6 py-5 text-white shadow-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">
                Robinhood QA Appeal
              </div>
              <h1 className="mt-3 text-3xl font-bold leading-tight">QA Appeal Review</h1>
              <div className="mt-2 text-sm text-violet-100">
                Logged in as {currentUser?.displayName || "-"} ({currentUser?.role || "-"})
              </div>
              {canViewAll && hasValue(selectedAgentFilter) ? (
                <div className="mt-2 text-sm font-medium text-violet-100">
                  Current Agent Filter: {selectedAgentFilter}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="Total Appeal Cases" value={`${totalCases}`} sub="Visible in current view" />
          <MetricCard title="Pending / In Review" value={`${pendingCases}`} sub="Waiting for decision" />
          <MetricCard title="Changed Cases" value={`${revisedCases}`} sub="Score/comment revised" />
          <MetricCard title="Approved Cases" value={`${approvedCases}`} sub="Approved or partially approved" />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-6">
            <Panel title="Quick Controls" subtitle="Search and filter appeal cases">
              <div className="space-y-4">
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Search Case ID / Agent"
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm"
                />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm"
                >
                  <option value="all">All Statuses</option>
                  <option value="Pending">Pending</option>
                  <option value="In Review">In Review</option>
                  <option value="Approved">Approved</option>
                  <option value="Partially Approved">Partially Approved</option>
                  <option value="Rejected">Rejected</option>
                  <option value="No Change">No Change</option>
                  <option value="Draft">Draft</option>
                </select>
              </div>
            </Panel>

            <Panel title="Appeal Case List" subtitle="Click a case to open full appeal detail">
              <div className="space-y-3">
                {visibleCases.map((item) => {
                  const appealedCodes = item.topics
                    .filter((topic) => normalizeText(topic.appealReason) !== "")
                    .map((topic) => topic.code);

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedAppealId(item.id)}
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        selectedCase?.id === item.id
                          ? "border-violet-400 bg-violet-100 shadow-sm"
                          : "border-violet-100 bg-white hover:bg-violet-50"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{item.caseId}</div>
                          {hasValue(item.agentName) ? (
                            <div className="mt-1 text-xs text-slate-500">{item.agentName}</div>
                          ) : null}
                        </div>
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold ${statusTone(
                            item.appealStatus
                          )}`}
                        >
                          {item.appealStatus}
                        </span>
                      </div>

                      {appealedCodes.length > 0 ? (
                        <div className="mt-3 text-xs text-slate-500">
                          Topics appealed: {appealedCodes.join(", ")}
                        </div>
                      ) : null}

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                        <span className={`rounded-full border px-2 py-0.5 font-semibold ${gradeTone(item.originalGrade)}`}>
                          {item.originalGrade}
                        </span>
                        <span className="text-slate-500">
                          {item.originalFinalScore.toFixed(2)} → {item.revisedFinalScore.toFixed(2)}
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 font-semibold ${gradeTone(item.revisedGrade)}`}>
                          {item.revisedGrade}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Panel>
          </div>

          <div className="space-y-6">
            {selectedCase ? (
              <>
                <Panel
                  title={`Appeal Detail • ${selectedCase.caseId}`}
                  subtitle="Full appeal review by case"
                  right={
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setDetailMode("all")}
                        className={`rounded-2xl border px-3 py-2 text-sm font-semibold ${
                          detailMode === "all"
                            ? "border-violet-400 bg-violet-100 text-violet-800"
                            : "border-violet-200 bg-white text-violet-700"
                        }`}
                      >
                        All Topics
                      </button>
                      <button
                        type="button"
                        onClick={() => setDetailMode("appealedOnly")}
                        className={`rounded-2xl border px-3 py-2 text-sm font-semibold ${
                          detailMode === "appealedOnly"
                            ? "border-violet-400 bg-violet-100 text-violet-800"
                            : "border-violet-200 bg-white text-violet-700"
                        }`}
                      >
                        Appealed Only
                      </button>
                      <button
                        type="button"
                        onClick={() => setDetailMode("changedOnly")}
                        className={`rounded-2xl border px-3 py-2 text-sm font-semibold ${
                          detailMode === "changedOnly"
                            ? "border-violet-400 bg-violet-100 text-violet-800"
                            : "border-violet-200 bg-white text-violet-700"
                        }`}
                      >
                        Changed Only
                      </button>
                    </div>
                  }
                >
                  <div className="space-y-6">
                    <div className="grid gap-4 xl:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="grid gap-3 md:grid-cols-2">
                          {hasValue(selectedCase.caseId) ? (
                            <div>
                              <div className="text-xs text-slate-500">Case ID</div>
                              <div className="text-sm font-semibold text-slate-900">{selectedCase.caseId}</div>
                            </div>
                          ) : null}

                          {hasValue(selectedCase.agentName) ? (
                            <div>
                              <div className="text-xs text-slate-500">Agent Name</div>
                              <div className="text-sm font-semibold text-slate-900">{selectedCase.agentName}</div>
                            </div>
                          ) : null}

                          {hasValue(selectedCase.auditDate) ? (
                            <div>
                              <div className="text-xs text-slate-500">Audit Date</div>
                              <div className="text-sm font-semibold text-slate-900">{selectedCase.auditDate}</div>
                            </div>
                          ) : null}

                          {hasValue(selectedCase.version) ? (
                            <div>
                              <div className="text-xs text-slate-500">Appeal Version</div>
                              <div className="text-sm font-semibold text-slate-900">{selectedCase.version}</div>
                            </div>
                          ) : null}

                          {hasValue(selectedCase.submitDate) ? (
                            <div>
                              <div className="text-xs text-slate-500">Submit Date</div>
                              <div className="text-sm font-semibold text-slate-900">{selectedCase.submitDate}</div>
                            </div>
                          ) : null}

                          {hasValue(selectedCase.resultDate) ? (
                            <div>
                              <div className="text-xs text-slate-500">Result Date</div>
                              <div className="text-sm font-semibold text-slate-900">{selectedCase.resultDate}</div>
                            </div>
                          ) : null}

                          {hasValue(selectedCase.appealChannel) ? (
                            <div>
                              <div className="text-xs text-slate-500">Appeal Channel</div>
                              <div className="text-sm font-semibold text-slate-900">{selectedCase.appealChannel}</div>
                            </div>
                          ) : null}

                          {hasValue(selectedCase.reviewType) ? (
                            <div>
                              <div className="text-xs text-slate-500">Review Type</div>
                              <div className="text-sm font-semibold text-slate-900">{selectedCase.reviewType}</div>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <div className="text-xs text-slate-500">Original Final Score</div>
                            <div className="text-lg font-bold text-slate-900">
                              {selectedCase.originalFinalScore.toFixed(2)}
                            </div>
                          </div>

                          <div>
                            <div className="text-xs text-slate-500">Revised Final Score</div>
                            <div className="text-lg font-bold text-slate-900">
                              {selectedCase.revisedFinalScore.toFixed(2)}
                            </div>
                          </div>

                          <div>
                            <div className="text-xs text-slate-500">Original Grade</div>
                            <div className="mt-1">
                              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${gradeTone(selectedCase.originalGrade)}`}>
                                {selectedCase.originalGrade}
                              </span>
                            </div>
                          </div>

                          <div>
                            <div className="text-xs text-slate-500">Revised Grade</div>
                            <div className="mt-1">
                              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${gradeTone(selectedCase.revisedGrade)}`}>
                                {selectedCase.revisedGrade}
                              </span>
                            </div>
                          </div>

                          <div>
                            <div className="text-xs text-slate-500">Appeal Status</div>
                            <div className="mt-1">
                              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(selectedCase.appealStatus)}`}>
                                {selectedCase.appealStatus}
                              </span>
                            </div>
                          </div>

                          {hasValue(selectedCase.commentStatus) ? (
                            <div>
                              <div className="text-xs text-slate-500">Comment Status</div>
                              <div className="text-sm font-semibold text-slate-900">{selectedCase.commentStatus}</div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {hasValue(selectedCase.customerInquiry) ? (
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Customer Inquiry
                        </div>
                        <div className="mt-2 text-[13px] leading-6 text-slate-800 whitespace-pre-line">
                          {selectedCase.customerInquiry}
                        </div>
                      </div>
                    ) : null}

                    {hasValue(selectedCase.autoChangeRemark) ? (
                      <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                          Auto Change Remark
                        </div>
                        <div className="mt-2 text-[13px] leading-6 text-slate-800 whitespace-pre-line">
                          {selectedCase.autoChangeRemark}
                        </div>
                      </div>
                    ) : null}

                    {hasValue(selectedCase.decisionSummary) ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Decision Summary
                        </div>
                        <div className="mt-2 text-[13px] leading-6 text-slate-800 whitespace-pre-line">
                          {selectedCase.decisionSummary}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </Panel>

                <Panel title="Appeal Topic Review" subtitle="See exactly what was appealed and what changed">
                  {detailTopics.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
                      ไม่มีหัวข้อในมุมมองที่เลือก
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {detailTopics.map((topic) => (
                        <TopicCard key={topic.code} topic={topic} />
                      ))}
                    </div>
                  )}
                </Panel>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
