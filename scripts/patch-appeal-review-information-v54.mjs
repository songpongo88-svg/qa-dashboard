import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appealRequestsPath = path.join(root, "src", "AppealRequestsMockup.tsx");
const dashboardPath = path.join(root, "src", "DashboardMockup.tsx");
const marker = "appeal-review-information-action-v54";

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Appeal Review v54: ${label} anchor not found.`);
  }
  return source.replace(before, after);
}

function patchAppealRequests() {
  let source = fs.readFileSync(appealRequestsPath, "utf8");
  if (source.includes(`// ${marker}`)) return;

  source = replaceRequired(
    source,
    `import PageHero from "./PageHero";`,
    `import PageHero from "./PageHero";\nimport { fetchStoredUserProfiles, type StoredUserProfile } from "./userRoleStore";\nimport { scoreToGrade } from "./lib/scoreIncentivePolicy"; // ${marker}`,
    "imports"
  );

  source = replaceRequired(
    source,
    `  agent: string;\n  auditDate: string;\n  weekLabel: string;`,
    `  agent: string;\n  caseDate?: string;\n  evaluationAuditDate?: string;\n  auditDate: string;\n  auditTimestamp?: string;\n  monthKey?: string;\n  monthLabel?: string;\n  weekLabel: string;`,
    "AppealRequest date fields"
  );

  const helperAnchor = `function normalizeAppealReason(value: unknown) {`;
  const helpers = `function parseAppealSubmittedTimestamp(value: unknown) {\n  const raw = String(value || "").trim();\n  if (!raw) return 0;\n\n  const thaiStyle = raw.match(\n    /^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})(?:\\s+(\\d{1,2}):(\\d{2})(?::(\\d{2}))?)?$/\n  );\n  if (thaiStyle) {\n    const [, day, month, year, hour = "0", minute = "0", second = "0"] = thaiStyle;\n    return Date.UTC(\n      Number(year),\n      Number(month) - 1,\n      Number(day),\n      Number(hour),\n      Number(minute),\n      Number(second)\n    );\n  }\n\n  const parsed = Date.parse(raw);\n  return Number.isFinite(parsed) ? parsed : 0;\n}\n\nfunction normalizeAppealIdentity(value: unknown) {\n  return String(value || "")\n    .replace(/\\u00A0/g, " ")\n    .replace(/\\s+/g, " ")\n    .trim()\n    .toLowerCase()\n    .replace(/[^a-z0-9ก-๙]/g, "");\n}\n\nfunction getAppealAgentTeam(agentName: string, profiles: StoredUserProfile[]) {\n  const agentKey = normalizeAppealIdentity(agentName);\n  if (!agentKey) return "-";\n  const matched = profiles.find((profile) =>\n    [profile.agentName, profile.displayName, profile.username].some(\n      (candidate) => normalizeAppealIdentity(candidate) === agentKey\n    )\n  );\n  return String(matched?.teamName || "").trim() || "-";\n}\n\nconst APPEAL_TOPIC_BILINGUAL_LABELS: Record<string, [string, string]> = {\n  "1": ["การปฏิบัติตามกระบวนการและนโยบาย", "Process & Policy Compliance"],\n  "2": ["คุณภาพคำตอบและการวิเคราะห์ปัญหา", "Answer Quality & Problem Analysis"],\n  "3": ["การจัดการเคสและการติดตามผล", "Case Handling & Follow-up"],\n  "4": ["ทักษะการสื่อสาร", "Communication Skills"],\n  "1.1": ["มาตรฐานการทักทายและปิดการสนทนา", "Greeting & Closing Standard"],\n  "1.2": ["การปฏิบัติตาม PDPA / Policy / ข้อกำหนด", "PDPA & Policy Compliance"],\n  "1.3": ["การปฏิบัติตามกระบวนการและ SLA", "Process & SLA Compliance"],\n  "2.1": ["ความถูกต้องของคำตอบ", "Answer Accuracy"],\n  "2.2": ["ความครบถ้วนของคำตอบ", "Answer Completeness"],\n  "2.3": ["ความชัดเจนของขั้นตอนและแหล่งอ้างอิง", "Clear Steps & Official Sources"],\n  "3.1": ["การวิเคราะห์และแก้ไขปัญหาได้ตรงจุด", "Problem Analysis & Resolution"],\n  "3.2": ["Ownership และการแจ้ง Next Step", "Ownership & Next Step"],\n  "4.1": ["โครงสร้างข้อความและความอ่านง่าย", "Message Structure & Readability"],\n  "4.2": ["ความกระชับและความถูกต้องของภาษา", "Conciseness & Language Accuracy"],\n  "4.3": ["น้ำเสียงและความเหมาะสมตามสถานการณ์", "Tone & Context Appropriateness"],\n};\n\nfunction getAppealTopicDisplay(topic: AppealTopic, index: number) {\n  const mapped = APPEAL_TOPIC_BILINGUAL_LABELS[String(topic.code || "").trim()];\n  const description = mapped\n    ? mapped[0] + " (" + mapped[1] + ")"\n    : String(topic.label || "-").trim();\n  return String(index + 1) + ". Topic " + String(topic.code || "-") + " " + description;\n}\n\n`;
  source = replaceRequired(source, helperAnchor, helpers + helperAnchor, "helpers");

  source = replaceRequired(
    source,
    `        agent: String(log.target_agent || log.details?.agent || ""),\n        auditDate: String(log.details?.auditDate || ""),\n        weekLabel: String(log.details?.weekLabel || ""),`,
    `        agent: String(log.target_agent || log.details?.agent || ""),\n        caseDate: String(log.details?.caseDate || log.details?.auditDate || ""),\n        evaluationAuditDate: String(log.details?.evaluationAuditDate || ""),\n        auditDate: String(log.details?.auditDate || ""),\n        auditTimestamp: String(log.details?.auditTimestamp || ""),\n        monthKey: String(log.details?.monthKey || ""),\n        monthLabel: String(log.details?.monthLabel || ""),\n        weekLabel: String(log.details?.weekLabel || ""),`,
    "request date mapping"
  );

  const openCaseBlock = `function openCaseDetailTab(request: AppealRequest) {\n  const params = new URLSearchParams({\n    tab: "dashboard",\n    subTab: "case-detail",\n    caseId: request.caseId,\n  });\n  if (request.agent) params.set("agent", request.agent);\n  window.open(\`${window.location.origin}${window.location.pathname}?\${params.toString()}\`, "_blank", "noopener,noreferrer");\n}\n`;
  const openReviewBlock = `${openCaseBlock}\nfunction openAppealReviewTab(request: AppealRequest) {\n  const params = new URLSearchParams({\n    tab: "appeal-requests",\n    requestId: request.requestId,\n  });\n  window.open(\`${window.location.origin}${window.location.pathname}?\${params.toString()}\`, "_blank", "noopener,noreferrer");\n}\n`;
  source = replaceRequired(source, openCaseBlock, openReviewBlock, "new-tab helper");

  source = replaceRequired(
    source,
    `  const [logs, setLogs] = useState<UsageLogEvent[]>([]);\n  const [selectedRequestId, setSelectedRequestId] = useState("");`,
    `  const [logs, setLogs] = useState<UsageLogEvent[]>([]);\n  const [userProfiles, setUserProfiles] = useState<StoredUserProfile[]>([]);\n  const [selectedRequestId, setSelectedRequestId] = useState("");`,
    "user profile state"
  );

  source = replaceRequired(
    source,
    `  const requests = useMemo(() => buildAppealRequests(logs), [logs]);\n  const resetHistory = useMemo(() => buildAppealResetHistory(logs), [logs]);\n  const selectedRequest = requests.find((item) => item.requestId === selectedRequestId) || null;`,
    `  const standaloneRequestId = useMemo(() => {\n    if (typeof window === "undefined") return "";\n    return new URLSearchParams(window.location.search).get("requestId") || "";\n  }, []);\n  const requests = useMemo(\n    () => buildAppealRequests(logs)\n      .slice()\n      .sort((left, right) =>\n        parseAppealSubmittedTimestamp(right.submittedAt) -\n        parseAppealSubmittedTimestamp(left.submittedAt)\n      ),\n    [logs]\n  );\n  const resetHistory = useMemo(() => buildAppealResetHistory(logs), [logs]);\n  const selectedRequest = requests.find(\n    (item) => item.requestId === (standaloneRequestId || selectedRequestId)\n  ) || null;`,
    "sorted request selection"
  );

  source = replaceRequired(
    source,
    `  useEffect(() => {\n    void loadRequests();\n  }, []);\n\n  useEffect(() => {\n    if (!selectedRequest) return;`,
    `  useEffect(() => {\n    void loadRequests();\n    void fetchStoredUserProfiles()\n      .then((profiles) => setUserProfiles(profiles))\n      .catch(() => setUserProfiles([]));\n  }, []);\n\n  useEffect(() => {\n    if (standaloneRequestId || selectedRequestId || !visibleRequests.length) return;\n    setSelectedRequestId(visibleRequests[0].requestId);\n  }, [standaloneRequestId, selectedRequestId, listTab, visibleRequests[0]?.requestId]);\n\n  const selectedAppealedTopics = selectedRequest\n    ? selectedRequest.topics.filter(isAppealedTopic)\n    : [];\n  const selectedCurrentScore = selectedRequest\n    ? selectedRequest.status === "Approved"\n      ? appealFinalScoreFromTopics(selectedAppealedTopics, selectedRequest.finalScore)\n      : selectedRequest.finalScore\n    : 0;\n  const selectedCurrentGrade = selectedRequest\n    ? selectedRequest.status === "Approved"\n      ? scoreToGrade(selectedCurrentScore, selectedRequest.monthKey || "unknown")\n      : selectedRequest.grade || scoreToGrade(selectedCurrentScore, selectedRequest.monthKey || "unknown")\n    : "-";\n  const selectedTeam = selectedRequest\n    ? getAppealAgentTeam(selectedRequest.agent, userProfiles)\n    : "-";\n  const selectedCaseDate = selectedRequest\n    ? selectedRequest.caseDate || selectedRequest.auditDate || "-"\n    : "-";\n  const selectedAuditDate = selectedRequest\n    ? selectedRequest.auditTimestamp || selectedRequest.evaluationAuditDate || selectedRequest.auditDate || "-"\n    : "-";\n\n  useEffect(() => {\n    if (!selectedRequest) return;`,
    "profile loading and information values"
  );

  source = replaceRequired(
    source,
    `        <div className="grid gap-4 border-b border-violet-100 p-5 md:grid-cols-4">`,
    `        <div className={standaloneRequestId ? "hidden" : "grid gap-4 border-b border-violet-100 p-5 md:grid-cols-4"}>`,
    "standalone summary visibility"
  );

  source = replaceRequired(
    source,
    `        <div className="grid min-h-[640px] gap-0 lg:grid-cols-[430px_minmax(0,1fr)]">\n          <div className="border-r border-violet-100 p-5">`,
    `        <div className={standaloneRequestId\n          ? "grid min-h-[640px] grid-cols-1 gap-0"\n          : "grid min-h-[640px] gap-0 lg:grid-cols-[minmax(720px,1.35fr)_minmax(360px,0.65fr)]"\n        }>\n          <div className={standaloneRequestId ? "hidden" : "min-w-0 border-r border-violet-100 p-5"}>`,
    "main layout"
  );

  const taskStartAnchor = `            <div className="space-y-3">`;
  const taskStart = source.indexOf(taskStartAnchor, source.indexOf(`Task Inbox`));
  const taskEndAnchor = `            </div>\n          </div>\n\n          <div className="p-5">`;
  const taskEnd = source.indexOf(taskEndAnchor, taskStart);
  if (taskStart < 0 || taskEnd < 0) {
    throw new Error("Appeal Review v54: task list block not found.");
  }

  const taskTable = `            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">\n              <table className="w-full min-w-[790px] border-collapse text-left">\n                <thead className="bg-slate-50">\n                  <tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">\n                    <th className="px-3 py-3">Submitted Date & Time</th>\n                    <th className="px-3 py-3">Case ID</th>\n                    <th className="px-3 py-3">Agent</th>\n                    <th className="px-3 py-3">Status</th>\n                    <th className="px-3 py-3 text-center">Topics</th>\n                    <th className="px-3 py-3 text-right">Action</th>\n                  </tr>\n                </thead>\n                <tbody className="divide-y divide-slate-100">\n                  {visibleRequests.map((item) => {\n                    const isSelected = selectedRequest?.requestId === item.requestId;\n                    const appealedCount = item.topics.filter(isAppealedTopic).length;\n                    return (\n                      <tr\n                        key={item.requestId}\n                        onClick={() => setSelectedRequestId(item.requestId)}\n                        className={\`cursor-pointer transition \${\n                          isSelected ? "bg-violet-50" : "bg-white hover:bg-slate-50"\n                        }\`}\n                      >\n                        <td className="whitespace-nowrap px-3 py-3 text-[11px] font-semibold text-slate-600">\n                          {formatDateTime(item.submittedAt)}\n                        </td>\n                        <td className="whitespace-nowrap px-3 py-3 text-xs font-extrabold text-slate-950">\n                          {item.caseId}\n                        </td>\n                        <td className="whitespace-nowrap px-3 py-3 text-[11px] font-semibold text-slate-700">\n                          {item.agent || "-"}\n                        </td>\n                        <td className="whitespace-nowrap px-3 py-3">\n                          <span className={\`font-bold \${\n                            item.status === "Pending"\n                              ? "text-amber-700"\n                              : item.status === "Approved"\n                                ? "text-emerald-700"\n                                : item.status === "Reset"\n                                  ? "text-sky-700"\n                                  : "text-rose-700"\n                          }\`}>\n                            {item.status}\n                          </span>\n                        </td>\n                        <td className="whitespace-nowrap px-3 py-3 text-center text-[11px] font-bold text-violet-700">\n                          {appealedCount}\n                        </td>\n                        <td className="whitespace-nowrap px-3 py-3 text-right">\n                          <button\n                            type="button"\n                            onClick={(event) => {\n                              event.stopPropagation();\n                              openAppealReviewTab(item);\n                            }}\n                            className={\`rounded-xl px-3 py-2 text-[11px] font-black transition \${\n                              item.status === "Pending"\n                                ? "bg-violet-700 text-white hover:bg-violet-800"\n                                : "border border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"\n                            }\`}\n                          >\n                            {item.status === "Pending" ? "Review Appeal" : "View Detail"}\n                          </button>\n                        </td>\n                      </tr>\n                    );\n                  })}\n                  {!visibleRequests.length ? (\n                    <tr>\n                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">\n                        No {listTab} appeal requests in this view. Try another tab.\n                      </td>\n                    </tr>\n                  ) : null}\n                </tbody>\n              </table>\n            </div>`;

  source = source.slice(0, taskStart) + taskTable + source.slice(taskEnd);

  const detailBranchAnchor = `            ) : (\n              <div className="space-y-5">`;
  const detailBranchIndex = source.indexOf(detailBranchAnchor, source.indexOf(`<div className="p-5">`, taskStart));
  if (detailBranchIndex < 0) {
    throw new Error("Appeal Review v54: detail branch anchor not found.");
  }

  const informationPanel = `            ) : !standaloneRequestId ? (\n              <section className="min-h-[520px] min-w-0">\n                <div className="border-b border-slate-200 pb-4">\n                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-700">Information</div>\n                  <div className="mt-1 text-xl font-extrabold text-slate-950">{selectedRequest.caseId}</div>\n                  <div className="mt-1 text-xs font-semibold text-slate-500">ข้อมูลคำขออุทธรณ์ของเคสที่เลือก</div>\n                </div>\n\n                <dl className="divide-y divide-slate-100">\n                  {[\n                    ["Case ID", selectedRequest.caseId || "-"],\n                    ["Agent", selectedRequest.agent || "-"],\n                    ["Team", selectedTeam],\n                    ["Status", selectedRequest.status || "-"],\n                    ["Case Date", selectedCaseDate],\n                    ["Audit Date", selectedAuditDate],\n                    ["Submitted By", selectedRequest.submittedByUsername || selectedRequest.submittedBy || "-"],\n                    ["Submitted Date & Time", formatDateTime(selectedRequest.submittedAt)],\n                    ["Intent", selectedRequest.inquiry || "-"],\n                    ["Original Score", selectedRequest.finalScore.toFixed(2)],\n                    ["Current Score", selectedCurrentScore.toFixed(2)],\n                    ["Current Grade", String(selectedCurrentGrade || "-")],\n                    ["Appealed Topics", String(selectedAppealedTopics.length) + " Topics"],\n                  ].map(([label, value]) => (\n                    <div key={label} className="grid grid-cols-[150px_minmax(0,1fr)] gap-4 py-3 text-sm">\n                      <dt className="font-bold text-slate-500">{label}</dt>\n                      <dd className="min-w-0 font-semibold text-slate-900">{value}</dd>\n                    </div>\n                  ))}\n                </dl>\n\n                <div className="mt-4 border-t border-slate-200 pt-4">\n                  <div className="text-sm font-extrabold text-slate-950">\n                    Appealed Topics: {selectedAppealedTopics.length} Topics\n                  </div>\n                  <div className="mt-2 overflow-x-auto pb-2">\n                    <div className="min-w-max space-y-1.5">\n                      {selectedAppealedTopics.map((topic, index) => (\n                        <div\n                          key={topic.code}\n                          className="whitespace-nowrap text-[11px] font-semibold leading-5 text-slate-700 xl:text-xs"\n                        >\n                          {getAppealTopicDisplay(topic, index)}\n                        </div>\n                      ))}\n                      {!selectedAppealedTopics.length ? (\n                        <div className="whitespace-nowrap text-[11px] font-semibold text-slate-500">-</div>\n                      ) : null}\n                    </div>\n                  </div>\n                </div>\n              </section>\n            ) : (\n              <div className="space-y-5">`;

  source = source.slice(0, detailBranchIndex) +
    informationPanel +
    source.slice(detailBranchIndex + detailBranchAnchor.length);

  fs.writeFileSync(appealRequestsPath, source, "utf8");
}

function patchAppealSubmissionContext() {
  let source = fs.readFileSync(dashboardPath, "utf8");
  if (source.includes(`// ${marker}-submission`)) return;

  source = replaceRequired(
    source,
    `          caseId: caseItem.caseId,\n          agent: caseItem.agent,\n          auditDate: caseItem.auditDate,\n          auditTimestamp: caseItem.auditTimestamp,`,
    `          caseId: caseItem.caseId,\n          agent: caseItem.agent,\n          // ${marker}-submission\n          caseDate: caseItem.caseDate || caseItem.auditDate,\n          evaluationAuditDate: caseItem.evaluationAuditDate || "",\n          auditDate: caseItem.auditDate,\n          auditTimestamp: caseItem.auditTimestamp,`,
    "appeal submission date context"
  );

  fs.writeFileSync(dashboardPath, source, "utf8");
}

patchAppealRequests();
patchAppealSubmissionContext();
console.log("Appeal Review v54 applied: Information-only side panel, submitted-time sorting, and new-tab Review/View actions.");
