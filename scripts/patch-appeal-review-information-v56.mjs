import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reviewPath = path.join(root, "src", "AppealRequestsMockup.tsx");
const marker = "appeal-review-information-newtab-v56";

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) {
    console.warn(`Appeal Review v56 skipped: ${label} anchor not found.`);
    return source;
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
  const parseHelper = `function parseAppealReviewSubmittedTime(value: unknown) {\n  const raw = String(value || "").trim();\n  if (!raw) return 0;\n  const ddmmyyyy = raw.match(/^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})(?:\\s+(\\d{1,2}):(\\d{2})(?::(\\d{2}))?)?$/);\n  if (ddmmyyyy) {\n    const [, day, month, year, hour = "0", minute = "0", second = "0"] = ddmmyyyy;\n    return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));\n  }\n  const parsed = Date.parse(raw);\n  return Number.isFinite(parsed) ? parsed : 0;\n}\n\n`;
  source = replaceRequired(source, parseAnchor, parseHelper + parseAnchor, "submitted-time parser");

  source = replaceRequired(
    source,
    `      .sort((a, b) => {\n        const timeA = new Date(a.submittedAt).getTime();\n        const timeB = new Date(b.submittedAt).getTime();\n        return (Number.isNaN(timeB) ? 0 : timeB) - (Number.isNaN(timeA) ? 0 : timeA);\n      });`,
    `      .sort((a, b) =>\n        parseAppealReviewSubmittedTime(b.submittedAt) -\n        parseAppealReviewSubmittedTime(a.submittedAt)\n      );`,
    "Submitted Date & Time sorting"
  );

  const openCaseBlock = `function openCaseDetailTab(request: AppealRequest) {\n  const params = new URLSearchParams({\n    tab: "dashboard",\n    subTab: "case-detail",\n    caseId: request.caseId,\n  });\n  if (request.agent) params.set("agent", request.agent);\n  window.open(\`\${window.location.origin}\${window.location.pathname}?\${params.toString()}\`, "_blank", "noopener,noreferrer");\n}\n`;
  source = replaceRequired(
    source,
    openCaseBlock,
    `${openCaseBlock}\nfunction openAppealReviewTab(request: AppealRequest) {\n  const params = new URLSearchParams({ tab: "appeal-requests", requestId: request.requestId });\n  window.open(\`\${window.location.origin}\${window.location.pathname}?\${params.toString()}\`, "_blank", "noopener,noreferrer");\n}\n`,
    "Appeal Review new-tab helper"
  );

  source = replaceRequired(
    source,
    `  const selectedRequest = requests.find((item) => item.requestId === selectedRequestId) || null;\n  const isReviewDetailOpen = Boolean(selectedRequest && detailRequestId === selectedRequest.requestId);`,
    `  const standaloneRequestId = useMemo(() => {\n    if (typeof window === "undefined") return "";\n    return new URLSearchParams(window.location.search).get("requestId") || "";\n  }, []);\n  const selectedRequest = requests.find((item) => item.requestId === (standaloneRequestId || selectedRequestId)) || null;\n  const isReviewDetailOpen = Boolean(standaloneRequestId || (selectedRequest && detailRequestId === selectedRequest.requestId));`,
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

  fs.writeFileSync(reviewPath, source, "utf8");
}

patchAppealReview();
console.log("Appeal Review v56 applied: new-tab Action, policy Grade parity, and DD/MM/YYYY HH:mm:ss sorting.");
