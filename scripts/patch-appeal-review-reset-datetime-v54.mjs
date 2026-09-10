import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dashboardPath = path.join(root, "src", "DashboardMockup.tsx");
const appealPath = path.join(root, "src", "AppealMockup.tsx");
const reviewPath = path.join(root, "src", "AppealRequestsMockup.tsx");
const appPath = path.join(root, "src", "App.tsx");
const watermarkPath = path.join(root, "src", "CaseWatermarks.tsx");

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Appeal v54: ${label} anchor not found.`);
  }
  return source.replace(before, after);
}

function patchDashboardDateSourceAndReset() {
  let source = fs.readFileSync(dashboardPath, "utf8");
  if (source.includes("// appeal-review-reset-datetime-v54-dashboard")) return;

  source = replaceOnce(
    source,
    `  appealReviewSummary?: string;\n  appealReviewedAt?: string;`,
    `  appealReviewSummary?: string;\n  appealSubmittedAt?: string;\n  appealReviewedAt?: string;\n  // appeal-review-reset-datetime-v54-dashboard`,
    "Case Detail appeal timestamp fields"
  );

  source = replaceOnce(
    source,
    `  displayRevisedTopicCodes: string[];\n  source?: "excel" | "firebase";\n};`,
    `  displayRevisedTopicCodes: string[];\n  submittedAt?: string;\n  reviewedAt?: string;\n  source?: "excel" | "firebase";\n};`,
    "Appeal merge timestamp fields"
  );

  source = replaceOnce(
    source,
    `type AppealOutcomeItem = {\n  caseId: string;\n  status: "Approved" | "Rejected";\n  reviewSummary: string;\n  reviewedAt: string;\n  requestId: string;\n  reviewedTopics: Topic[];\n};`,
    `type AppealOutcomeItem = {\n  caseId: string;\n  status: "Approved" | "Rejected";\n  reviewSummary: string;\n  submittedAt: string;\n  reviewedAt: string;\n  requestId: string;\n  reviewedTopics: Topic[];\n};\n\ntype AppealTimelineItem = {\n  caseId: string;\n  submittedAt: string;\n  reviewedAt: string;\n};`,
    "Appeal outcome timestamp type"
  );

  source = replaceOnce(
    source,
    `function buildAppealHistoryCaseIds(logs: UsageLogEvent[]) {\n  const caseIds = new Set<string>();\n  logs.forEach((log) => {\n    if (!["appeal_request_submitted", "appeal_request_reviewed", "appeal_request_reset"].includes(log.event_type)) return;\n    splitAppealCaseIds(log.case_id || log.details?.caseId).forEach((caseId) => caseIds.add(caseId));\n  });\n  return caseIds;\n}`,
    `function buildAppealHistoryCaseIds(logs: UsageLogEvent[]) {\n  const caseIds = new Set<string>();\n  buildLatestAppealRequestMap(logs).forEach((request, caseId) => {\n    // A reset closes the active appeal lifecycle, so Dashboard must remove APPEAL.\n    if (request.status !== "Reset") caseIds.add(caseId);\n  });\n  return caseIds;\n}`,
    "reset-aware Appeal watermark history"
  );

  const timelineAnchor = `\nfunction buildApprovedAppealMergeMap(`;
  const timelineBlock = `\nfunction buildAppealTimelineMap(logs: UsageLogEvent[]) {\n  const map = new Map<string, AppealTimelineItem>();\n  buildLatestAppealRequestMap(logs).forEach((request, caseId) => {\n    if (request.status === "Reset") return;\n    map.set(caseId, {\n      caseId,\n      submittedAt: formatCaseDetailDateTime(request.submittedAt),\n      reviewedAt: formatCaseDetailDateTime(request.reviewedAt),\n    });\n  });\n  return map;\n}\n`;
  source = replaceOnce(source, timelineAnchor, timelineBlock + timelineAnchor, "Appeal timeline insertion");

  source = replaceOnce(
    source,
    `      revisedTopics,\n      displayRevisedTopicCodes,\n      source: "firebase",`,
    `      revisedTopics,\n      displayRevisedTopicCodes,\n      submittedAt: formatCaseDetailDateTime(request.submittedAt),\n      reviewedAt: formatCaseDetailDateTime(request.reviewedAt),\n      source: "firebase",`,
    "Firebase Appeal merge timestamps"
  );

  source = replaceOnce(
    source,
    `      status: request.status,\n      reviewSummary: String(request.reviewSummary || "").trim(),\n      reviewedAt: String(request.reviewedAt || "").trim(),`,
    `      status: request.status,\n      reviewSummary: String(request.reviewSummary || "").trim(),\n      submittedAt: formatCaseDetailDateTime(request.submittedAt),\n      reviewedAt: formatCaseDetailDateTime(request.reviewedAt),`,
    "Appeal outcome timestamps"
  );

  source = replaceOnce(
    source,
    `  outcomeMap: Map<string, AppealOutcomeItem>,\n  appealHistoryCaseIds: Set<string> = new Set()\n) {`,
    `  outcomeMap: Map<string, AppealOutcomeItem>,\n  appealHistoryCaseIds: Set<string> = new Set(),\n  appealTimelineMap: Map<string, AppealTimelineItem> = new Map()\n) {`,
    "Appeal timeline apply parameter"
  );

  source = replaceOnce(
    source,
    `    const loggedOutcome = candidateCaseIds\n      .map((caseId) => outcomeMap.get(caseId))\n      .find(Boolean);`,
    `    const loggedOutcome = candidateCaseIds\n      .map((caseId) => outcomeMap.get(caseId))\n      .find(Boolean);\n    const appealTimeline = candidateCaseIds\n      .map((caseId) => appealTimelineMap.get(caseId))\n      .find(Boolean);`,
    "Case Detail Appeal timeline lookup"
  );

  source = replaceOnce(
    source,
    `      hasAppealHistory: Boolean(item.hasAppealHistory || mergedAppeal || loggedOutcome ||\n        candidateCaseIds.some((caseId) => appealHistoryCaseIds.has(caseId))),\n      appealStatus: effectiveStatus,\n      appealReviewSummary: loggedOutcome?.reviewSummary || "",\n      appealReviewedAt: loggedOutcome?.reviewedAt || "",`,
    `      hasAppealHistory: Boolean(mergedAppeal || loggedOutcome || appealTimeline ||\n        candidateCaseIds.some((caseId) => appealHistoryCaseIds.has(caseId))),\n      appealStatus: effectiveStatus,\n      appealReviewSummary: loggedOutcome?.reviewSummary || "",\n      appealSubmittedAt: appealTimeline?.submittedAt || loggedOutcome?.submittedAt || mergedAppeal?.submittedAt || "",\n      appealReviewedAt: appealTimeline?.reviewedAt || loggedOutcome?.reviewedAt || mergedAppeal?.reviewedAt || "",`,
    "Case Detail Appeal timestamp projection"
  );

  source = replaceOnce(
    source,
    `function roundExcelLikeMinute(date: Date) {\n  const rounded = new Date(date.getTime());\n  const seconds = rounded.getSeconds();\n  const milliseconds = rounded.getMilliseconds();\n\n  if (seconds >= 30 || milliseconds >= 500) {\n    rounded.setMinutes(rounded.getMinutes() + 1);\n  }\n\n  rounded.setSeconds(0, 0);\n  return rounded;\n}`,
    `function roundExcelLikeMinute(date: Date) {\n  // Preserve source seconds. Date-only and minute-only values naturally become :00.\n  return new Date(date.getTime());\n}`,
    "Case Detail seconds preservation"
  );

  const oldTimestampFormatter = `function formatAuditTimestamp(value: any): string {\n  const dt = excelDateToJSDate(value);\n  if (!dt) return "-";\n  const dd = \`\${dt.getDate()}\`.padStart(2, "0");\n  const mm = \`\${dt.getMonth() + 1}\`.padStart(2, "0");\n  const yyyy = dt.getFullYear();\n  const hh = \`\${dt.getHours()}\`.padStart(2, "0");\n  const min = \`\${dt.getMinutes()}\`.padStart(2, "0");\n  return \`\${dd}/\${mm}/\${yyyy} \${hh}:\${min}\`;\n}`;
  const newTimestampFormatter = `function formatAuditTimestamp(value: any): string {\n  if (value === null || value === undefined || value === "") return "-";\n  const raw = String(value).trim();\n  const localDateTime = raw.match(/^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})(?:\\s+(\\d{1,2}):(\\d{2})(?::(\\d{2}))?)?$/);\n  if (localDateTime) {\n    const [, day, month, year, hour = "00", minute = "00", second = "00"] = localDateTime;\n    return day.padStart(2, "0") + "/" + month.padStart(2, "0") + "/" + year + " " +\n      hour.padStart(2, "0") + ":" + minute + ":" + second;\n  }\n  const localIsoDate = raw.match(/^(\\d{4})-(\\d{2})-(\\d{2})(?:[ T](\\d{1,2}):(\\d{2})(?::(\\d{2}))?)?$/);\n  if (localIsoDate) {\n    const [, year, month, day, hour = "00", minute = "00", second = "00"] = localIsoDate;\n    return day + "/" + month + "/" + year + " " + hour.padStart(2, "0") + ":" + minute + ":" + second;\n  }\n  if (typeof value === "string" && /T/.test(raw) && /(Z|[+-]\\d{2}:?\\d{2})$/.test(raw)) {\n    const instant = new Date(raw);\n    if (!Number.isNaN(instant.getTime())) {\n      const parts = new Intl.DateTimeFormat("en-GB", {\n        timeZone: "Asia/Bangkok",\n        day: "2-digit",\n        month: "2-digit",\n        year: "numeric",\n        hour: "2-digit",\n        minute: "2-digit",\n        second: "2-digit",\n        hour12: false,\n      }).formatToParts(instant);\n      const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "00";\n      return part("day") + "/" + part("month") + "/" + part("year") + " " +\n        part("hour") + ":" + part("minute") + ":" + part("second");\n    }\n  }\n  const dt = excelDateToJSDate(value);\n  if (!dt) return "-";\n  const pad = (part: number) => String(part).padStart(2, "0");\n  return pad(dt.getDate()) + "/" + pad(dt.getMonth() + 1) + "/" + dt.getFullYear() + " " +\n    pad(dt.getHours()) + ":" + pad(dt.getMinutes()) + ":" + pad(dt.getSeconds());\n}\n\nfunction formatCaseDetailDateTime(value: any): string {\n  if (value === null || value === undefined || String(value).trim() === "") return "";\n  const formatted = formatAuditTimestamp(value);\n  return formatted === "-" ? "" : formatted;\n}`;
  source = replaceOnce(source, oldTimestampFormatter, newTimestampFormatter, "Case Detail timestamp formatter");

  source = replaceOnce(
    source,
    `      const evaluationAuditDateDisplay = formatAuditDateForDisplay(\n        record.auditTimestamp || record.submittedAt || record.auditDate\n      );`,
    `      const evaluationAuditDateDisplay = formatAuditTimestamp(\n        record.auditTimestamp || record.submittedAt || record.auditDate\n      );`,
    "stored evaluation Audit Date display"
  );
  source = replaceOnce(
    source,
    `        auditTimestamp: record.auditTimestamp || formatBangkokDateTime(record.submittedAt),`,
    `        auditTimestamp: formatAuditTimestamp(record.auditTimestamp || record.submittedAt || record.auditDate),`,
    "stored evaluation canonical timestamp"
  );
  source = replaceOnce(
    source,
    `                  evaluationAuditDate: formatAuditDateForDisplay(auditRaw || timestampRaw),`,
    `                  evaluationAuditDate: formatAuditTimestamp(timestampRaw || auditRaw),`,
    "V8 evaluation Audit Date timestamp"
  );
  source = replaceOnce(
    source,
    `              evaluationAuditDate: auditDateDisplay,`,
    `              evaluationAuditDate: formatAuditTimestamp(timestampRaw || auditRaw),`,
    "RawData evaluation Audit Date timestamp"
  );

  source = replaceOnce(
    source,
    `            revisedTopics,\n            displayRevisedTopicCodes,\n          });`,
    `            revisedTopics,\n            displayRevisedTopicCodes,\n            submittedAt: formatCaseDetailDateTime(getFirstAvailableHeaderValue(appealHelper, row, [\n              "Appeal Submit Date & Time", "Appeal Submit Date", "Submit Date & Time", "Submit Date"\n            ], "")),\n            reviewedAt: formatCaseDetailDateTime(getFirstAvailableHeaderValue(appealHelper, row, [\n              "Appeal Result Date & Time", "Appeal Result Date", "Result Date & Time", "Result Date"\n            ], "")),\n            source: "excel",\n          });`,
    "static Appeal timeline"
  );

  source = replaceOnce(
    source,
    `        let appealOutcomeMap = new Map<string, AppealOutcomeItem>();`,
    `        let appealOutcomeMap = new Map<string, AppealOutcomeItem>();\n        let appealTimelineMap = new Map<string, AppealTimelineItem>();`,
    "Appeal timeline map initialization"
  );
  source = replaceOnce(
    source,
    `          buildAppealHistoryCaseIds(reviewedLogs).forEach((caseId) => appealHistoryCaseIds.add(caseId));`,
    `          buildAppealHistoryCaseIds(reviewedLogs).forEach((caseId) => appealHistoryCaseIds.add(caseId));\n          appealTimelineMap = buildAppealTimelineMap(reviewedLogs);`,
    "Appeal timeline map load"
  );
  source = replaceOnce(
    source,
    `        const mergedCases = applyAppealMapsToCaseItems(canonicalCases, appealMap, appealOutcomeMap, appealHistoryCaseIds);`,
    `        const mergedCases = applyAppealMapsToCaseItems(\n          canonicalCases, appealMap, appealOutcomeMap, appealHistoryCaseIds, appealTimelineMap\n        );`,
    "Case Detail timeline application"
  );

  source = source.replaceAll(
    `item.evaluationAuditDate || formatAuditDateForDisplay(item.auditTimestamp) || "-"`,
    `item.evaluationAuditDate || item.auditTimestamp || "-"`
  );
  source = source.replaceAll(
    `activeSelectedCase.evaluationAuditDate || formatAuditDateForDisplay(activeSelectedCase.auditTimestamp) || "-"`,
    `activeSelectedCase.evaluationAuditDate || activeSelectedCase.auditTimestamp || "-"`
  );

  fs.writeFileSync(dashboardPath, source, "utf8");
}

function patchWatermarkReset() {
  let source = fs.readFileSync(watermarkPath, "utf8");
  if (source.includes("appeal-reset-clears-watermark-v54")) return;
  source = replaceOnce(
    source,
    `  if (item.hasAppealHistory || item.appealRequestId || item.reviewStatus === "Revised" ||\n    /^(Pending|Approved|Rejected|Reset)$/i.test(item.appealStatus || "")) labels.push("APPEAL");`,
    `  // appeal-reset-clears-watermark-v54\n  if (item.hasAppealHistory || item.appealRequestId || item.reviewStatus === "Revised" ||\n    /^(Pending|Approved|Rejected)$/i.test(item.appealStatus || "")) labels.push("APPEAL");`,
    "watermark Reset exclusion"
  );
  fs.writeFileSync(watermarkPath, source, "utf8");
}

function patchAppealCasesDateSourceAndAdminName() {
  let source = fs.readFileSync(appealPath, "utf8");
  if (source.includes("// case-detail-datetime-source-v54")) return;

  source = replaceOnce(
    source,
    `function roundExcelLikeMinute(date: Date) {\n  const rounded = new Date(date.getTime());\n  const seconds = rounded.getSeconds();\n  const milliseconds = rounded.getMilliseconds();\n\n  if (seconds >= 30 || milliseconds >= 500) {\n    rounded.setMinutes(rounded.getMinutes() + 1);\n  }\n\n  rounded.setSeconds(0, 0);\n  return rounded;\n}`,
    `function roundExcelLikeMinute(date: Date) {\n  return new Date(date.getTime());\n}`,
    "Appeal Cases seconds preservation"
  );

  const componentAnchor = `\nexport default function AppealMockup({`;
  const sourceHelper = `\nfunction applyCaseDetailDateSource(\n  item: AppealCaseItem,\n  externalCaseDetailCases: readonly any[]\n): AppealCaseItem {\n  const caseId = normalizeCaseId(item.caseId);\n  const matches = externalCaseDetailCases.filter((candidate) =>\n    normalizeCaseId(candidate?.caseId) === caseId\n  );\n  const sourceCase = matches.find((candidate) =>\n    candidate?.agent && isSameAgent(String(candidate.agent), item.agent)\n  ) || matches[0];\n  if (!sourceCase) return item;\n\n  const sourceValue = (...values: unknown[]) =>\n    values.map((value) => String(value ?? "").trim()).find(Boolean) || "";\n\n  return {\n    ...item,\n    auditDate: sourceValue(sourceCase.caseDate, sourceCase.auditDate, item.auditDate),\n    auditTimestamp: sourceValue(\n      sourceCase.evaluationAuditDate, sourceCase.auditTimestamp, item.auditTimestamp\n    ),\n    appealSubmitDateTime: sourceValue(sourceCase.appealSubmittedAt, item.appealSubmitDateTime),\n    appealResultDateTime: sourceValue(sourceCase.appealReviewedAt, item.appealResultDateTime),\n  };\n}\n\n// case-detail-datetime-source-v54\n`;
  source = replaceOnce(source, componentAnchor, sourceHelper + componentAnchor, "Appeal Case Detail source helper");

  source = replaceOnce(
    source,
    `  agentDirectory,\n  externalSelectedAgent,`,
    `  agentDirectory,\n  externalCaseDetailCases,\n  externalSelectedAgent,`,
    "Appeal Cases external Case Detail property"
  );
  source = replaceOnce(
    source,
    `  agentDirectory?: CaseAgentDirectoryEntry[];\n  // appeal-identity-fallback-v52`,
    `  agentDirectory?: CaseAgentDirectoryEntry[];\n  externalCaseDetailCases?: any[];\n  // appeal-identity-fallback-v52`,
    "Appeal Cases external Case Detail property type"
  );
  source = replaceOnce(
    source,
    `        setAllCases(reviewedCases);`,
    `        setAllCases(\n          reviewedCases.map((item) => applyCaseDetailDateSource(item, externalCaseDetailCases || []))\n        );`,
    "Appeal Cases Case Detail date projection"
  );
  source = replaceOnce(
    source,
    `  }, [appealReloadKey, agentDirectory]);`,
    `  }, [appealReloadKey, agentDirectory, externalCaseDetailCases]);`,
    "Appeal Cases Case Detail date dependency"
  );

  const shortAdmin = `      const appealPdfAdminUser = String(appealPdfAdminProfile?.username || "").trim() || "-";`;
  if (source.includes(shortAdmin)) {
    source = source.replace(
      shortAdmin,
      `      const appealPdfAdminUser = String(\n        appealPdfAdminProfile?.displayName ||\n        appealPdfAdminProfile?.agentName ||\n        appealPdfAdminProfile?.username ||\n        ""\n      ).trim() || "-";`
    );
  }

  fs.writeFileSync(appealPath, source, "utf8");
}

function patchAppealReviewTable() {
  let source = fs.readFileSync(reviewPath, "utf8");
  if (source.includes("// appeal-review-table-v54")) return;

  source = replaceOnce(
    source,
    `type AppealListTab = "pending" | "reviewed" | "reset";`,
    `type AppealListTab = "all" | "pending" | "approved" | "rejected" | "reset";`,
    "Appeal Review status filter type"
  );

  const helperAnchor = `\nfunction openCaseDetailTab(request: AppealRequest) {`;
  const helperBlock = `\nfunction normalizeAppealReviewCaseId(value: unknown) {\n  return String(value ?? "").replace(/\\s+/g, "").trim().toUpperCase();\n}\n\nfunction normalizeAppealReviewAgent(value: unknown) {\n  return String(value ?? "").replace(/\\s+/g, " ").trim().toLowerCase();\n}\n\nfunction mergeRequestWithCaseDetail(\n  request: AppealRequest,\n  externalCaseDetailCases: readonly any[]\n): AppealRequest {\n  const caseId = normalizeAppealReviewCaseId(request.caseId);\n  const candidates = externalCaseDetailCases.filter((item) =>\n    normalizeAppealReviewCaseId(item?.caseId) === caseId\n  );\n  const agent = normalizeAppealReviewAgent(request.agent);\n  const sourceCase = candidates.find((item) =>\n    normalizeAppealReviewAgent(item?.agent) === agent\n  ) || candidates[0];\n  if (!sourceCase) return request;\n  const sourceValue = (...values: unknown[]) =>\n    values.map((value) => String(value ?? "").trim()).find(Boolean) || "";\n  return {\n    ...request,\n    auditDate: sourceValue(sourceCase.caseDate, sourceCase.auditDate, request.auditDate),\n    auditTimestamp: sourceValue(\n      sourceCase.evaluationAuditDate, sourceCase.auditTimestamp, request.auditTimestamp\n    ),\n    submittedAt: sourceValue(sourceCase.appealSubmittedAt, request.submittedAt),\n    reviewedAt: sourceValue(sourceCase.appealReviewedAt, request.reviewedAt),\n  };\n}\n\nfunction getAppealReviewMonthKey(request: AppealRequest) {\n  for (const value of [request.auditDate, request.auditTimestamp, request.submittedAt]) {\n    const text = String(value || "").trim();\n    const thaiDate = text.match(/^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})/);\n    if (thaiDate) return thaiDate[3] + "-" + thaiDate[2].padStart(2, "0");\n    const isoDate = text.match(/^(\\d{4})-(\\d{2})-/);\n    if (isoDate) return isoDate[1] + "-" + isoDate[2];\n  }\n  return "unknown";\n}\n\nfunction formatAppealReviewMonth(monthKey: string) {\n  const match = monthKey.match(/^(\\d{4})-(\\d{2})$/);\n  if (!match) return "Unknown Month";\n  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(\n    new Date(Number(match[1]), Number(match[2]) - 1, 1)\n  );\n}\n\nfunction appealReviewStatusTone(status: AppealRequest["status"]) {\n  if (status === "Pending") return "border-amber-200 bg-amber-50 text-amber-700";\n  if (status === "Approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";\n  if (status === "Reset") return "border-sky-200 bg-sky-50 text-sky-700";\n  return "border-rose-200 bg-rose-50 text-rose-700";\n}\n\n// appeal-review-table-v54\n`;
  source = replaceOnce(source, helperAnchor, helperBlock + helperAnchor, "Appeal Review table helpers");

  source = replaceOnce(
    source,
    `  currentUser,\n  onTasksChanged,\n}: {\n  currentUser: any;\n  onTasksChanged?: () => void;`,
    `  currentUser,\n  externalCaseDetailCases,\n  onTasksChanged,\n}: {\n  currentUser: any;\n  externalCaseDetailCases?: any[];\n  onTasksChanged?: () => void;`,
    "Appeal Review Case Detail property"
  );

  source = replaceOnce(
    source,
    `  const [busy, setBusy] = useState(false);\n  const [listTab, setListTab] = useState<AppealListTab>("pending");\n\n  const requests = useMemo(() => buildAppealRequests(logs), [logs]);`,
    `  const [busy, setBusy] = useState(false);\n  const [listTab, setListTab] = useState<AppealListTab>("pending");\n  const [selectedAgentFilter, setSelectedAgentFilter] = useState("");\n  const [selectedMonthFilter, setSelectedMonthFilter] = useState("all");\n  const [searchCaseId, setSearchCaseId] = useState("");\n\n  const requests = useMemo(\n    () => buildAppealRequests(logs).map((request) =>\n      mergeRequestWithCaseDetail(request, externalCaseDetailCases || [])\n    ),\n    [logs, externalCaseDetailCases]\n  );`,
    "Appeal Review filter state and Case Detail projection"
  );

  source = replaceOnce(
    source,
    `  const resetRequests = requests.filter((item) => item.status === "Reset");\n  const visibleRequests =\n    listTab === "pending" ? pendingRequests : listTab === "reviewed" ? reviewedRequests : resetRequests;`,
    `  const resetRequests = requests.filter((item) => item.status === "Reset");\n  const agentOptions = useMemo(\n    () => [...new Set(requests.map((item) => item.agent).filter(Boolean))].sort((a, b) => a.localeCompare(b)),\n    [requests]\n  );\n  const monthOptions = useMemo(\n    () => [...new Set(requests.map(getAppealReviewMonthKey).filter((item) => item !== "unknown"))].sort((a, b) => b.localeCompare(a)),\n    [requests]\n  );\n  const visibleRequests = useMemo(() => {\n    const keyword = searchCaseId.trim().toUpperCase();\n    return requests\n      .filter((item) => {\n        if (listTab !== "all" && item.status.toLowerCase() !== listTab) return false;\n        if (selectedAgentFilter && item.agent !== selectedAgentFilter) return false;\n        if (selectedMonthFilter !== "all" && getAppealReviewMonthKey(item) !== selectedMonthFilter) return false;\n        if (keyword && !item.caseId.toUpperCase().includes(keyword)) return false;\n        return true;\n      })\n      .sort((a, b) => {\n        const timeA = new Date(a.submittedAt).getTime();\n        const timeB = new Date(b.submittedAt).getTime();\n        return (Number.isNaN(timeB) ? 0 : timeB) - (Number.isNaN(timeA) ? 0 : timeA);\n      });\n  }, [requests, listTab, searchCaseId, selectedAgentFilter, selectedMonthFilter]);`,
    "Appeal Review table filters"
  );

  source = replaceOnce(
    source,
    `          reason: "Reset by Songpon to allow the case owner to submit again.",`,
    `          reason: "Reset by Songpon to allow the case owner to submit again.",\n          clearAppealWatermark: true,`,
    "Reset watermark event flag"
  );
  source = replaceOnce(
    source,
    `      setMessage(\`Reset \${selectedRequest.caseId}. The case owner can submit this case again if the appeal window is still open.\`);`,
    `      setMessage(\`Reset \${selectedRequest.caseId}. APPEAL watermark was removed and the case owner can submit again while the appeal window is open.\`);`,
    "Reset success message"
  );

  const leftStartToken = `        <div className="grid min-h-[640px] gap-0 lg:grid-cols-[430px_minmax(0,1fr)]">`;
  const rightToken = `\n\n          <div className="p-5">`;
  const leftStart = source.indexOf(leftStartToken);
  const rightStart = source.indexOf(rightToken, leftStart);
  if (leftStart < 0 || rightStart < 0) {
    throw new Error("Appeal v54: Appeal Review list/detail layout anchors not found.");
  }

  const leftReplacement = `        <div className="grid min-h-[640px] gap-0 xl:grid-cols-[minmax(0,1.42fr)_minmax(520px,0.98fr)]">\n          <div className="min-w-0 border-r border-violet-100 p-5">\n            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">\n              <div>\n                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-700">Appeal Cases</div>\n                <div className="mt-1 text-sm text-slate-600">เลือกเคสจากตารางเพื่อเปิดรายละเอียดและพิจารณา</div>\n              </div>\n              <div className="flex gap-2">\n                <button type="button" onClick={loadRequests} className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-700 hover:bg-violet-50">Refresh</button>\n                <button type="button" onClick={() => exportAppealRows(requests)} className="rounded-xl bg-violet-700 px-3 py-2 text-xs font-bold text-white hover:bg-violet-800">Export Appeal ROWDATA</button>\n              </div>\n            </div>\n\n            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">\n              <div>\n                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Agent</label>\n                <select value={selectedAgentFilter} onChange={(event) => { setSelectedAgentFilter(event.target.value); setSelectedRequestId(""); }} className="w-full rounded-2xl border border-violet-200 bg-white px-3 py-3 text-sm outline-none focus:border-violet-400">\n                  <option value="">All Agents</option>\n                  {agentOptions.map((agent) => <option key={agent} value={agent}>{agent}</option>)}\n                </select>\n              </div>\n              <div>\n                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Month</label>\n                <select value={selectedMonthFilter} onChange={(event) => { setSelectedMonthFilter(event.target.value); setSelectedRequestId(""); }} className="w-full rounded-2xl border border-violet-200 bg-white px-3 py-3 text-sm outline-none focus:border-violet-400">\n                  <option value="all">All Months</option>\n                  {monthOptions.map((month) => <option key={month} value={month}>{formatAppealReviewMonth(month)}</option>)}\n                </select>\n              </div>\n              <div>\n                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Status</label>\n                <select value={listTab} onChange={(event) => { setListTab(event.target.value as AppealListTab); setSelectedRequestId(""); }} className="w-full rounded-2xl border border-violet-200 bg-white px-3 py-3 text-sm outline-none focus:border-violet-400">\n                  <option value="all">All Statuses</option>\n                  <option value="pending">Pending ({pendingCount})</option>\n                  <option value="approved">Approved</option>\n                  <option value="rejected">Rejected</option>\n                  <option value="reset">Reset ({resetCount})</option>\n                </select>\n              </div>\n              <div>\n                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Search Case ID</label>\n                <input value={searchCaseId} onChange={(event) => setSearchCaseId(event.target.value)} placeholder="เช่น AA207397" className="w-full rounded-2xl border border-violet-200 bg-white px-3 py-3 text-sm outline-none focus:border-violet-400" />\n              </div>\n            </div>\n\n            <div className="my-4 rounded-2xl border border-violet-100 bg-violet-50/70 px-4 py-3 text-sm text-violet-900">\n              <span className="font-semibold">{selectedMonthFilter === "all" ? "All Months" : formatAppealReviewMonth(selectedMonthFilter)}</span>\n              <span className="text-slate-500"> • {visibleRequests.length} case(s)</span>\n            </div>\n\n            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white">\n              <div className="max-h-[650px] overflow-auto">\n                <table className="w-full min-w-[1040px] border-collapse text-left">\n                  <thead className="sticky top-0 z-10 bg-slate-50">\n                    <tr className="border-b border-slate-200">\n                      <th className="px-3 py-3 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Case ID</th>\n                      <th className="px-3 py-3 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Agent</th>\n                      <th className="px-3 py-3 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Case Date</th>\n                      <th className="px-3 py-3 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Submitted</th>\n                      <th className="px-3 py-3 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Status</th>\n                      <th className="px-3 py-3 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Original</th>\n                      <th className="px-3 py-3 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Grade</th>\n                      <th className="px-3 py-3 text-center text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Topics</th>\n                      <th className="px-3 py-3 text-center text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Action</th>\n                    </tr>\n                  </thead>\n                  <tbody className="divide-y divide-slate-100">\n                    {!visibleRequests.length ? (\n                      <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-slate-500">ไม่พบข้อมูลเคส</td></tr>\n                    ) : visibleRequests.map((item) => (\n                      <tr key={item.requestId} onClick={() => setSelectedRequestId(item.requestId)} className={"cursor-pointer transition " + (selectedRequest?.requestId === item.requestId ? "bg-sky-50 ring-1 ring-inset ring-sky-400" : "bg-white hover:bg-slate-50")}>\n                        <td className="whitespace-nowrap px-3 py-3 text-xs font-extrabold text-slate-950">{item.caseId}</td>\n                        <td className="min-w-[150px] px-3 py-3 text-xs font-semibold text-slate-800">{item.agent || "-"}</td>\n                        <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">{item.auditDate || "-"}</td>\n                        <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">{formatDateTime(item.submittedAt)}</td>\n                        <td className="px-3 py-3"><span className={"inline-flex rounded-full border px-2.5 py-1 text-[10px] font-extrabold " + appealReviewStatusTone(item.status)}>{item.status}</span></td>\n                        <td className="px-3 py-3 text-xs font-bold text-slate-800">{item.finalScore.toFixed(2)}</td>\n                        <td className="px-3 py-3 text-xs font-extrabold text-violet-800">{item.grade || "-"}</td>\n                        <td className="px-3 py-3 text-center text-xs font-bold text-slate-700">{item.topics.filter(isAppealedTopic).length}</td>\n                        <td className="px-3 py-3 text-center"><button type="button" onClick={(event) => { event.stopPropagation(); setSelectedRequestId(item.requestId); }} className="rounded-xl border border-sky-300 bg-white px-3 py-1.5 text-[11px] font-extrabold text-sky-700 hover:bg-sky-50">View</button></td>\n                      </tr>\n                    ))}\n                  </tbody>\n                </table>\n              </div>\n              <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/70 px-4 py-3 text-xs text-slate-500">\n                <span>Showing {visibleRequests.length} appeal review case(s)</span>\n                <span className="font-semibold text-slate-700">Select View to open Review Detail</span>\n              </div>\n            </div>\n          </div>`;

  source = source.slice(0, leftStart) + leftReplacement + source.slice(rightStart);
  source = source.replace("Select a task from Inbox", "Select a case from Appeal Cases");
  source = source.replace(
    "Choose an appeal task on the left to open the case details, review requested topics, and save the result.",
    "Choose a case from the table on the left to open details, review requested topics, and save the result."
  );
  source = source.replace(
    `<div className="mt-1 text-xs text-slate-500">Submitted by {selectedRequest.submittedBy || "-"} at {formatDateTime(selectedRequest.submittedAt)}</div>`,
    `<div className="mt-1 text-xs text-slate-500">Audit Date {selectedRequest.auditTimestamp || selectedRequest.auditDate || "-"}</div>\n                      <div className="mt-1 text-xs text-slate-500">Submitted by {selectedRequest.submittedBy || "-"} at {formatDateTime(selectedRequest.submittedAt)}</div>`
  );
  source = source.replace(
    `disabled={busy}\n                        onClick={resetRequest}`,
    `disabled={busy || selectedRequest.status === "Reset"}\n                        onClick={resetRequest}`
  );

  fs.writeFileSync(reviewPath, source, "utf8");
}

function patchAppCaseDetailSource() {
  let source = fs.readFileSync(appPath, "utf8");
  if (source.includes("case-detail-datetime-source-v54-app")) return;
  source = replaceOnce(
    source,
    `            agentDirectory={caseAgentDirectory /* appeal-identity-fallback-v52-app */}\n            externalSelectedAgent={selectedAgentGlobal}`,
    `            agentDirectory={caseAgentDirectory /* appeal-identity-fallback-v52-app */}\n            externalCaseDetailCases={dashboardEffectiveCases || [] /* case-detail-datetime-source-v54-app */}\n            externalSelectedAgent={selectedAgentGlobal}`,
    "Appeal Cases Case Detail source property"
  );
  source = replaceOnce(
    source,
    `<AppealRequestsMockup currentUser={currentUser} onTasksChanged={loadInboxTasks} />`,
    `<AppealRequestsMockup\n            currentUser={currentUser}\n            externalCaseDetailCases={dashboardEffectiveCases || []}\n            onTasksChanged={loadInboxTasks}\n          />`,
    "Appeal Review Case Detail source property"
  );
  fs.writeFileSync(appPath, source, "utf8");
}

patchDashboardDateSourceAndReset();
patchWatermarkReset();
patchAppealCasesDateSourceAndAdminName();
patchAppealReviewTable();
patchAppCaseDetailSource();
console.log("Appeal v54 applied: Appeal Review table parity, reset-aware watermark, and Case Detail timestamp source with seconds.");
