import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reviewPath = path.join(root, "src", "AppealRequestsMockup.tsx");
const marker = "appeal-review-information-newtab-v56";
const previousInformationMarker = "appeal-review-information-action-v55";

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Appeal Review v56: ${label} anchor not found.`);
  }
  return source.replace(before, after);
}

function patchAppealReview() {
  let source = fs.readFileSync(reviewPath, "utf8");
  if (source.includes(`// ${marker}`)) return;

  source = replaceRequired(
    source,
    `import { resolveCaseAgentTeam, type CaseAgentDirectoryEntry } from "./lib/caseAgentTeam";`,
    `import { resolveCaseAgentTeam, type CaseAgentDirectoryEntry } from "./lib/caseAgentTeam";\nimport { scoreToGrade } from "./lib/scoreIncentivePolicy"; // ${marker}`,
    "score policy import"
  );

  const parseAnchor = `function toNumber(value: unknown, fallback = 0) {`;
  const parseHelper = `function parseAppealReviewSubmittedTime(value: unknown) {\n  const raw = String(value || "").trim();\n  if (!raw) return 0;\n\n  const ddmmyyyy = raw.match(\n    /^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})(?:\\s+(\\d{1,2}):(\\d{2})(?::(\\d{2}))?)?$/\n  );\n  if (ddmmyyyy) {\n    const [, day, month, year, hour = "0", minute = "0", second = "0"] = ddmmyyyy;\n    return Date.UTC(\n      Number(year),\n      Number(month) - 1,\n      Number(day),\n      Number(hour),\n      Number(minute),\n      Number(second)\n    );\n  }\n\n  const parsed = Date.parse(raw);\n  return Number.isFinite(parsed) ? parsed : 0;\n}\n\n`;
  source = replaceRequired(source, parseAnchor, parseHelper + parseAnchor, "submitted-time parser");

  const topicAnchor = `function appealFinalScoreFromTopics(topics: AppealTopic[], originalFinalScore: number) {`;
  const topicHelper = `const APPEAL_REVIEW_TOPIC_LABELS: Record<string, [string, string]> = {\n  "1": ["การปฏิบัติตามกระบวนการและนโยบาย", "Process & Policy Compliance"],\n  "2": ["คุณภาพคำตอบและการวิเคราะห์ปัญหา", "Answer Quality & Problem Analysis"],\n  "3": ["การจัดการเคสและการติดตามผล", "Case Handling & Follow-up"],\n  "4": ["ทักษะการสื่อสาร", "Communication Skills"],\n  "1.1": ["มาตรฐานการทักทายและปิดการสนทนา", "Greeting & Closing Standard"],\n  "1.2": ["การปฏิบัติตาม PDPA / Policy / ข้อกำหนด", "PDPA & Policy Compliance"],\n  "1.3": ["การปฏิบัติตามกระบวนการและ SLA", "Process & SLA Compliance"],\n  "2.1": ["ความถูกต้องของคำตอบ", "Answer Accuracy"],\n  "2.2": ["ความครบถ้วนของคำตอบ", "Answer Completeness"],\n  "2.3": ["ความชัดเจนของขั้นตอนและแหล่งอ้างอิง", "Clear Steps & Official Sources"],\n  "3.1": ["การวิเคราะห์และแก้ไขปัญหาได้ตรงจุด", "Problem Analysis & Resolution"],\n  "3.2": ["Ownership และการแจ้ง Next Step", "Ownership & Next Step"],\n  "4.1": ["โครงสร้างข้อความและความอ่านง่าย", "Message Structure & Readability"],\n  "4.2": ["ความกระชับและความถูกต้องของภาษา", "Conciseness & Language Accuracy"],\n  "4.3": ["น้ำเสียงและความเหมาะสมตามสถานการณ์", "Tone & Context Appropriateness"],\n};\n\nfunction getAppealReviewTopicLine(topic: AppealTopic, index: number) {\n  const mapped = APPEAL_REVIEW_TOPIC_LABELS[String(topic.code || "").trim()];\n  const description = mapped\n    ? mapped[0] + " (" + mapped[1] + ")"\n    : String(topic.label || "-").trim();\n  return String(index + 1) + ". Topic " + String(topic.code || "-") + " " + description;\n}\n\n`;
  source = replaceRequired(source, topicAnchor, topicHelper + topicAnchor, "bilingual topic helper");

  source = replaceRequired(
    source,
    `      .sort((a, b) => {\n        const timeA = new Date(a.submittedAt).getTime();\n        const timeB = new Date(b.submittedAt).getTime();\n        return (Number.isNaN(timeB) ? 0 : timeB) - (Number.isNaN(timeA) ? 0 : timeA);\n      });`,
    `      .sort((a, b) =>\n        parseAppealReviewSubmittedTime(b.submittedAt) -\n        parseAppealReviewSubmittedTime(a.submittedAt)\n      );`,
    "Submitted Date & Time sorting"
  );

  const openCaseBlock = `function openCaseDetailTab(request: AppealRequest) {\n  const params = new URLSearchParams({\n    tab: "dashboard",\n    subTab: "case-detail",\n    caseId: request.caseId,\n  });\n  if (request.agent) params.set("agent", request.agent);\n  window.open(\`${window.location.origin}${window.location.pathname}?\${params.toString()}\`, "_blank", "noopener,noreferrer");\n}\n`;
  source = replaceRequired(
    source,
    openCaseBlock,
    `${openCaseBlock}\nfunction openAppealReviewTab(request: AppealRequest) {\n  const params = new URLSearchParams({\n    tab: "appeal-requests",\n    requestId: request.requestId,\n  });\n  window.open(\`${window.location.origin}${window.location.pathname}?\${params.toString()}\`, "_blank", "noopener,noreferrer");\n}\n`,
    "Appeal Review new-tab helper"
  );

  source = replaceRequired(
    source,
    `  const selectedRequest = requests.find((item) => item.requestId === selectedRequestId) || null;\n  const isReviewDetailOpen = Boolean(selectedRequest && detailRequestId === selectedRequest.requestId);`,
    `  const standaloneRequestId = useMemo(() => {\n    if (typeof window === "undefined") return "";\n    return new URLSearchParams(window.location.search).get("requestId") || "";\n  }, []);\n  const selectedRequest = requests.find(\n    (item) => item.requestId === (standaloneRequestId || selectedRequestId)\n  ) || null;\n  const isReviewDetailOpen = Boolean(\n    standaloneRequestId ||\n    (selectedRequest && detailRequestId === selectedRequest.requestId)\n  );`,
    "standalone Detail selection"
  );

  source = replaceRequired(
    source,
    `  const selectedCurrentGrade = selectedRequest\n    ? appealGradeFromScore(selectedCurrentScore)\n    : "-";`,
    `  const selectedCurrentGrade = selectedRequest\n    ? scoreToGrade(selectedCurrentScore, getAppealReviewMonthKey(selectedRequest))\n    : "-";`,
    "Current Grade parity"
  );

  source = replaceRequired(
    source,
    `                            onClick={(event) => {\n                              event.stopPropagation();\n                              setSelectedRequestId(item.requestId);\n                              setDetailRequestId(item.requestId);\n                            }}`,
    `                            onClick={(event) => {\n                              event.stopPropagation();\n                              openAppealReviewTab(item);\n                            }}`,
    "Action opens new tab"
  );

  source = replaceRequired(
    source,
    `        <div className="grid min-h-[640px] gap-0 xl:grid-cols-[minmax(0,1.42fr)_minmax(520px,0.98fr)]">\n          <div className="min-w-0 border-r border-violet-100 p-5">`,
    `        <div className={standaloneRequestId\n          ? "grid min-h-[640px] grid-cols-1 gap-0"\n          : "grid min-h-[640px] gap-0 xl:grid-cols-[minmax(0,1.42fr)_minmax(520px,0.98fr)]"\n        }>\n          <div className={standaloneRequestId ? "hidden" : "min-w-0 border-r border-violet-100 p-5"}>`,
    "standalone full-width Detail"
  );

  const informationStartToken = `<div className="space-y-5" data-appeal-review-information="${previousInformationMarker}">`;
  const informationStart = source.indexOf(informationStartToken);
  const detailContinuationToken = `            ) : (\n              <div className="space-y-5">\n                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">`;
  const detailContinuation = source.indexOf(detailContinuationToken, informationStart);
  if (informationStart < 0 || detailContinuation < 0) {
    throw new Error("Appeal Review v56: Information branch anchors not found.");
  }

  const informationPanel = `<section className="min-h-[520px] min-w-0" data-appeal-review-information="${marker}">\n                <div className="border-b border-slate-200 pb-4">\n                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-700">Information</div>\n                  <div className="mt-2 text-2xl font-extrabold text-slate-950">{selectedRequest.caseId}</div>\n                  <div className="mt-1 text-xs font-semibold text-slate-500">ข้อมูลคำขออุทธรณ์ของเคสที่เลือก</div>\n                </div>\n\n                <dl className="divide-y divide-slate-100">\n                  {[\n                    ["Case ID", selectedRequest.caseId || "-"],\n                    ["Agent", selectedRequest.agent || "-"],\n                    ["Team", selectedAgentTeam.teamName || "-"],\n                    ["Status", selectedRequest.status || "-"],\n                    ["Case Date", selectedRequest.auditDate || "-"],\n                    ["Audit Date", selectedRequest.auditTimestamp || selectedRequest.auditDate || "-"],\n                    ["Submitted By", selectedRequest.submittedByUsername || selectedRequest.submittedBy || "-"],\n                    ["Submitted Date & Time", formatDateTime(selectedRequest.submittedAt)],\n                    ["Intent", selectedRequest.inquiry || "-"],\n                    ["Original Score", selectedRequest.finalScore.toFixed(2)],\n                    ["Current Score", selectedCurrentScore.toFixed(2)],\n                    ["Current Grade", String(selectedCurrentGrade || "-")],\n                    ["Appealed Topics", String(selectedAppealedTopics.length) + " Topics"],\n                  ].map(([label, value]) => (\n                    <div key={label} className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm">\n                      <dt className="font-bold text-slate-500">{label}</dt>\n                      <dd className="min-w-0 font-semibold text-slate-900">{value}</dd>\n                    </div>\n                  ))}\n                </dl>\n\n                <div className="mt-4 border-t border-slate-200 pt-4">\n                  <div className="text-sm font-extrabold text-slate-950">\n                    Appealed Topics: {selectedAppealedTopics.length} Topics\n                  </div>\n                  <div className="mt-2 overflow-x-auto pb-2">\n                    <div className="min-w-max space-y-1.5">\n                      {selectedAppealedTopics.length ? selectedAppealedTopics.map((topic, index) => (\n                        <div\n                          key={topic.code}\n                          className="whitespace-nowrap text-[11px] font-semibold leading-5 text-slate-700 xl:text-xs"\n                        >\n                          {getAppealReviewTopicLine(topic, index)}\n                        </div>\n                      )) : (\n                        <div className="whitespace-nowrap text-[11px] font-semibold text-slate-500">-</div>\n                      )}\n                    </div>\n                  </div>\n                </div>\n              </section>\n`;

  source = source.slice(0, informationStart) +
    informationPanel +
    source.slice(detailContinuation);

  fs.writeFileSync(reviewPath, source, "utf8");
}

patchAppealReview();
console.log("Appeal Review v56 applied: Information-only side panel, plain appealed-topic lines, new-tab actions, and DD/MM/YYYY HH:mm:ss sorting.");
