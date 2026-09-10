import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reviewPath = path.join(root, "src", "AppealRequestsMockup.tsx");
const appPath = path.join(root, "src", "App.tsx");
const marker = "appeal-review-information-action-v55";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Appeal v55: ${label} anchor not found.`);
  }
  return source.replace(before, after);
}

function patchAppealReviewInformationAndAction() {
  let source = fs.readFileSync(reviewPath, "utf8");
  if (source.includes(marker)) return;

  source = replaceOnce(
    source,
    `import PageHero from "./PageHero";`,
    `import PageHero from "./PageHero";\nimport { resolveCaseAgentTeam, type CaseAgentDirectoryEntry } from "./lib/caseAgentTeam";`,
    "Case Agent Team import"
  );

  source = replaceOnce(
    source,
    `  agent: string;\n  auditDate: string;`,
    `  agent: string;\n  targetUsername?: string;\n  auditDate: string;`,
    "Appeal request target username type"
  );

  source = replaceOnce(
    source,
    `        agent: String(log.target_agent || log.details?.agent || ""),\n        auditDate: String(log.details?.auditDate || ""),`,
    `        agent: String(log.target_agent || log.details?.agent || ""),\n        targetUsername: String(log.details?.targetUsername || log.details?.agentUsername || ""),\n        auditDate: String(log.details?.auditDate || ""),`,
    "Appeal request target username source"
  );

  source = replaceOnce(
    source,
    `    ...request,\n    auditDate: sourceValue(sourceCase.caseDate, sourceCase.auditDate, request.auditDate),`,
    `    ...request,\n    targetUsername: sourceValue(sourceCase.targetUsername, request.targetUsername),\n    auditDate: sourceValue(sourceCase.caseDate, sourceCase.auditDate, request.auditDate),`,
    "Case Detail target username projection"
  );

  source = replaceOnce(
    source,
    `  currentUser,\n  externalCaseDetailCases,\n  onTasksChanged,\n}: {\n  currentUser: any;\n  externalCaseDetailCases?: any[];\n  onTasksChanged?: () => void;`,
    `  currentUser,\n  agentDirectory,\n  externalCaseDetailCases,\n  onTasksChanged,\n}: {\n  currentUser: any;\n  agentDirectory?: CaseAgentDirectoryEntry[];\n  externalCaseDetailCases?: any[];\n  onTasksChanged?: () => void;`,
    "Appeal Review Agent directory property"
  );

  source = replaceOnce(
    source,
    `  const [selectedRequestId, setSelectedRequestId] = useState("");\n  const [draftTopics, setDraftTopics] = useState<AppealTopic[]>([]);`,
    `  const [selectedRequestId, setSelectedRequestId] = useState("");\n  const [detailRequestId, setDetailRequestId] = useState("");\n  const [draftTopics, setDraftTopics] = useState<AppealTopic[]>([]);`,
    "Appeal Review detail state"
  );

  source = replaceOnce(
    source,
    `  const selectedRequest = requests.find((item) => item.requestId === selectedRequestId) || null;\n  const pendingRequests = requests.filter((item) => item.status === "Pending");`,
    `  const selectedRequest = requests.find((item) => item.requestId === selectedRequestId) || null;\n  const isReviewDetailOpen = Boolean(selectedRequest && detailRequestId === selectedRequest.requestId);\n  const selectedAppealedTopics = selectedRequest?.topics.filter(isAppealedTopic) || [];\n  const selectedCurrentScore = selectedRequest?.status === "Approved"\n    ? appealFinalScoreFromTopics(selectedAppealedTopics, selectedRequest.finalScore)\n    : selectedRequest?.finalScore || 0;\n  const selectedCurrentGrade = selectedRequest\n    ? appealGradeFromScore(selectedCurrentScore)\n    : "-";\n  const selectedAgentTeam = resolveCaseAgentTeam(selectedRequest, agentDirectory || []);\n  const pendingRequests = requests.filter((item) => item.status === "Pending");`,
    "Appeal Review Information values"
  );

  source = replaceOnce(
    source,
    `  useEffect(() => {\n    if (!selectedRequest) return;\n    setSelectedRequestId(selectedRequest.requestId);`,
    `  useEffect(() => {\n    if (!selectedRequest) {\n      setDetailRequestId("");\n      return;\n    }\n    setSelectedRequestId(selectedRequest.requestId);`,
    "Appeal Review selection lifecycle"
  );

  source = replaceOnce(
    source,
    `      setSelectedRequestId("");\n      setDraftTopics([]);`,
    `      setSelectedRequestId("");\n      setDetailRequestId("");\n      setDraftTopics([]);`,
    "Reset closes Appeal detail"
  );

  source = source.replaceAll(
    `setSelectedRequestId(""); }}`,
    `setSelectedRequestId(""); setDetailRequestId(""); }}`
  );

  source = replaceOnce(
    source,
    `<tr key={item.requestId} onClick={() => setSelectedRequestId(item.requestId)} className={"cursor-pointer transition " + (selectedRequest?.requestId === item.requestId ? "bg-sky-50 ring-1 ring-inset ring-sky-400" : "bg-white hover:bg-slate-50")}>`,
    `<tr key={item.requestId} onClick={() => { setSelectedRequestId(item.requestId); setDetailRequestId(""); }} className={"cursor-pointer transition " + (selectedRequest?.requestId === item.requestId ? "bg-sky-50 ring-1 ring-inset ring-sky-400" : "bg-white hover:bg-slate-50")}>`,
    "Appeal table row Information selection"
  );

  source = replaceOnce(
    source,
    `<td className="px-3 py-3 text-center"><button type="button" onClick={(event) => { event.stopPropagation(); setSelectedRequestId(item.requestId); }} className="rounded-xl border border-sky-300 bg-white px-3 py-1.5 text-[11px] font-extrabold text-sky-700 hover:bg-sky-50">View</button></td>`,
    `<td className="px-3 py-3 text-center">\n                          <button\n                            type="button"\n                            onClick={(event) => {\n                              event.stopPropagation();\n                              setSelectedRequestId(item.requestId);\n                              setDetailRequestId(item.requestId);\n                            }}\n                            className={"whitespace-nowrap rounded-xl border px-3 py-1.5 text-[11px] font-extrabold transition " + (item.status === "Pending"\n                              ? "border-violet-300 bg-violet-700 text-white hover:bg-violet-800"\n                              : "border-sky-300 bg-white text-sky-700 hover:bg-sky-50")}\n                          >\n                            {item.status === "Pending" ? "Review Appeal" : "View Detail"}\n                          </button>\n                        </td>`,
    "Appeal table Action button"
  );

  source = replaceOnce(
    source,
    `<span className="font-semibold text-slate-700">Select View to open Review Detail</span>`,
    `<span className="font-semibold text-slate-700">Select a row for Information • Use Action to open Detail</span>`,
    "Appeal table Action help text"
  );

  source = replaceOnce(
    source,
    `<div className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-700">No Task Opened</div>\n                  <div className="mt-2 text-2xl font-extrabold text-slate-950">Select a case from Appeal Cases</div>\n                  <div className="mt-2 max-w-md text-sm leading-6 text-slate-600">\n                    Choose a case from the table on the left to open details, review requested topics, and save the result.\n                  </div>`,
    `<div className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-700">Information</div>\n                  <div className="mt-2 text-2xl font-extrabold text-slate-950">Select a case from Appeal Cases</div>\n                  <div className="mt-2 max-w-md text-sm leading-6 text-slate-600">\n                    เลือกแถวเพื่อดูข้อมูลสรุปของเคส แล้วใช้ปุ่มในคอลัมน์ Action เมื่อต้องการเข้า Detail\n                  </div>`,
    "Appeal Review empty Information state"
  );

  const detailBranchAnchor = `            ) : (\n              <div className="space-y-5">\n                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">`;
  const informationBranch = `            ) : !isReviewDetailOpen ? (\n              <div className="space-y-5" data-appeal-review-information="${marker}">\n                <div className="rounded-3xl border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-sky-50 p-5 shadow-sm">\n                  <div className="flex flex-wrap items-start justify-between gap-3">\n                    <div>\n                      <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-700">Information</div>\n                      <div className="mt-2 text-2xl font-extrabold text-slate-950">{selectedRequest.caseId}</div>\n                      <div className="mt-1 text-sm text-slate-600">ข้อมูลสรุปคำขออุทธรณ์</div>\n                    </div>\n                    <span className={"inline-flex rounded-full border px-3 py-1.5 text-xs font-extrabold " + appealReviewStatusTone(selectedRequest.status)}>\n                      {selectedRequest.status}\n                    </span>\n                  </div>\n\n                  <div className="mt-5 grid gap-3 sm:grid-cols-2">\n                    <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">\n                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Agent</div>\n                      <div className="mt-1 text-sm font-extrabold text-slate-950">{selectedRequest.agent || "-"}</div>\n                    </div>\n                    <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">\n                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Team</div>\n                      <div className="mt-1 text-sm font-extrabold text-slate-950">{selectedAgentTeam.teamName || "-"}</div>\n                    </div>\n                    <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">\n                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Case Date</div>\n                      <div className="mt-1 text-sm font-extrabold text-slate-950">{selectedRequest.auditDate || "-"}</div>\n                    </div>\n                    <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">\n                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Audit Date</div>\n                      <div className="mt-1 text-sm font-extrabold text-slate-950">{selectedRequest.auditTimestamp || selectedRequest.auditDate || "-"}</div>\n                    </div>\n                    <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">\n                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Submitted By</div>\n                      <div className="mt-1 text-sm font-extrabold text-slate-950">{selectedRequest.submittedBy || "-"}</div>\n                    </div>\n                    <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">\n                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Submitted Date & Time</div>\n                      <div className="mt-1 text-sm font-extrabold text-slate-950">{formatDateTime(selectedRequest.submittedAt)}</div>\n                    </div>\n                  </div>\n\n                  <div className="mt-3 rounded-2xl border border-white bg-white p-4 shadow-sm">\n                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Intent</div>\n                    <div className="mt-2 text-sm font-semibold leading-6 text-slate-800">{selectedRequest.inquiry || "-"}</div>\n                  </div>\n                </div>\n\n                <div className="grid gap-3 sm:grid-cols-3">\n                  <div className="rounded-2xl border border-slate-200 bg-white p-4">\n                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Original Score</div>\n                    <div className="mt-1 text-xl font-extrabold text-slate-950">{selectedRequest.finalScore.toFixed(2)}</div>\n                  </div>\n                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">\n                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">Current Score</div>\n                    <div className="mt-1 text-xl font-extrabold text-emerald-800">{selectedCurrentScore.toFixed(2)}</div>\n                  </div>\n                  <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">\n                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-700">Current Grade</div>\n                    <div className="mt-1 text-xl font-extrabold text-violet-800">{selectedCurrentGrade}</div>\n                  </div>\n                </div>\n\n                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">\n                  <div className="flex items-center justify-between gap-3">\n                    <div>\n                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700">Appealed Topics</div>\n                      <div className="mt-1 text-sm text-slate-600">หัวข้อที่ส่งมาอุทธรณ์ในเคสนี้</div>\n                    </div>\n                    <div className="rounded-2xl bg-violet-100 px-4 py-2 text-center">\n                      <div className="text-2xl font-extrabold text-violet-800">{selectedAppealedTopics.length}</div>\n                      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-violet-700">Topics</div>\n                    </div>\n                  </div>\n                  <div className="mt-4 space-y-2">\n                    {selectedAppealedTopics.length ? selectedAppealedTopics.map((topic) => (\n                      <div key={topic.code} className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">\n                        <div>\n                          <div className="text-sm font-extrabold text-slate-950">{topic.code} {topic.label}</div>\n                          <div className="mt-1 text-xs text-slate-500">หัวข้อที่ Agent ส่งอุทธรณ์</div>\n                        </div>\n                        <div className="whitespace-nowrap rounded-xl bg-white px-3 py-2 text-xs font-extrabold text-slate-700 shadow-sm">\n                          {topic.score} / {topic.max}\n                        </div>\n                      </div>\n                    )) : (\n                      <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">ไม่พบหัวข้อที่อุทธรณ์</div>\n                    )}\n                  </div>\n                </div>\n\n                <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-violet-100 bg-violet-50 p-4">\n                  <button\n                    type="button"\n                    onClick={() => openCaseDetailTab(selectedRequest)}\n                    className="rounded-xl border border-sky-200 bg-white px-4 py-2 text-sm font-extrabold text-sky-700 hover:bg-sky-50"\n                  >\n                    Open Case Detail\n                  </button>\n                  <button\n                    type="button"\n                    onClick={() => setDetailRequestId(selectedRequest.requestId)}\n                    className="rounded-xl bg-violet-700 px-5 py-2.5 text-sm font-extrabold text-white shadow-sm hover:bg-violet-800"\n                  >\n                    {selectedRequest.status === "Pending" ? "Review Appeal" : "View Detail"}\n                  </button>\n                </div>\n              </div>\n            ) : (\n              <div className="space-y-5">\n                {/* ${marker} */}\n                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">\n                  <button\n                    type="button"\n                    onClick={() => setDetailRequestId("")}\n                    className="rounded-xl border border-violet-200 bg-white px-4 py-2 text-xs font-extrabold text-violet-700 hover:bg-violet-100"\n                  >\n                    ← Back to Information\n                  </button>\n                  <div className="text-right">\n                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Appeal Detail</div>\n                    <div className="text-sm font-extrabold text-slate-900">{selectedRequest.caseId}</div>\n                  </div>\n                </div>\n                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">`;
  source = replaceOnce(source, detailBranchAnchor, informationBranch, "Appeal Information/detail branch");

  fs.writeFileSync(reviewPath, source, "utf8");
}

function patchAppAgentDirectory() {
  let source = fs.readFileSync(appPath, "utf8");
  if (source.includes(`${marker}-app`)) return;
  source = replaceOnce(
    source,
    `<AppealRequestsMockup\n            currentUser={currentUser}\n            externalCaseDetailCases={dashboardEffectiveCases || []}`,
    `<AppealRequestsMockup\n            currentUser={currentUser}\n            agentDirectory={caseAgentDirectory /* ${marker}-app */}\n            externalCaseDetailCases={dashboardEffectiveCases || []}`,
    "Appeal Review Agent directory wiring"
  );
  fs.writeFileSync(appPath, source, "utf8");
}

patchAppealReviewInformationAndAction();
patchAppAgentDirectory();
console.log("Appeal v55 applied: row selection shows Information and Action opens the review Detail.");
