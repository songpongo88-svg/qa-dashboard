import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reviewPath = path.join(root, "src", "AppealRequestsMockup.tsx");
const appPath = path.join(root, "src", "App.tsx");
const marker = "appeal-review-workspace-tabs-v59";

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Appeal Review v59: ${label} anchor not found.`);
  }
  return source.replace(before, after);
}

function patchAppealReviewComponent() {
  let source = fs.readFileSync(reviewPath, "utf8");
  if (source.includes(`// ${marker}-review`)) return;

  source = replaceRequired(
    source,
    `  currentUser,\n  agentDirectory,\n  externalCaseDetailCases,\n  onTasksChanged,\n}: {\n  currentUser: any;\n  agentDirectory?: CaseAgentDirectoryEntry[];\n  externalCaseDetailCases?: any[];\n  onTasksChanged?: () => void;`,
    `  currentUser,\n  agentDirectory,\n  externalCaseDetailCases,\n  externalRequestId,\n  onOpenRequestWorkspace,\n  onTasksChanged,\n}: {\n  currentUser: any;\n  agentDirectory?: CaseAgentDirectoryEntry[];\n  externalCaseDetailCases?: any[];\n  externalRequestId?: string;\n  onOpenRequestWorkspace?: (requestId: string, caseId: string) => void;\n  onTasksChanged?: () => void;\n  // ${marker}-review`,
    "Appeal Review workspace props"
  );

  source = replaceRequired(
    source,
    `  const standaloneRequestId = useMemo(() => {\n    if (typeof window === "undefined") return "";\n    return new URLSearchParams(window.location.search).get("requestId") || "";\n  }, []);`,
    `  const standaloneRequestId = String(externalRequestId || "").trim();`,
    "workspace request id source"
  );

  source = replaceRequired(
    source,
    `                              openAppealReviewTab(item);`,
    `                              onOpenRequestWorkspace?.(item.requestId, item.caseId);`,
    "Case ID internal workspace action"
  );

  // Remove the four KPI cards above the Appeal Cases workspace.
  const summaryStartToken = `        <div className="grid gap-4 border-b border-violet-100 p-5 md:grid-cols-4">`;
  const summaryStart = source.indexOf(summaryStartToken);
  const workspaceGridToken = `        <div\n          className={standaloneRequestId`;
  const workspaceGrid = source.indexOf(workspaceGridToken, summaryStart);
  if (summaryStart < 0 || workspaceGrid < 0) {
    throw new Error("Appeal Review v59: summary cards/workspace grid anchors not found.");
  }
  source = source.slice(0, summaryStart) + source.slice(workspaceGrid);

  // Status in Information is text-only but follows the status color.
  source = replaceRequired(
    source,
    `<div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Status</div><div className="font-semibold text-slate-900">{selectedRequest.status || "-"}</div></div>`,
    `<div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Status</div><div className={"font-extrabold " + (selectedRequest.status === "Approved" ? "text-emerald-700" : selectedRequest.status === "Pending" ? "text-amber-700" : selectedRequest.status === "Rejected" ? "text-rose-700" : selectedRequest.status === "Reset" ? "text-sky-700" : "text-slate-900")}>{selectedRequest.status || "-"}</div></div>`,
    "Information status color"
  );

  source = source.replace(
    `Select a row for Information • Click Case ID to open Appeal Review in a new tab`,
    `Select a row for Information • Click Case ID to open a workspace tab`
  );
  source = source.replace(
    `title="Open Appeal Review in new tab"`,
    `title="Open Appeal Review workspace tab"`
  );

  fs.writeFileSync(reviewPath, source, "utf8");
}

function patchAppWorkspaceTabs() {
  let source = fs.readFileSync(appPath, "utf8");
  if (source.includes(`// ${marker}-app`)) return;

  source = replaceRequired(
    source,
    `type CaseWorkspaceTabKey = \`case:\${string}\`;\ntype WorkspaceTabKey = AppTab | "case-detail" | CaseWorkspaceTabKey;`,
    `type CaseWorkspaceTabKey = \`case:\${string}\`;\ntype AppealReviewWorkspaceTabKey = \`appeal-review:\${string}\`;\ntype WorkspaceTabKey = AppTab | "case-detail" | CaseWorkspaceTabKey | AppealReviewWorkspaceTabKey;`,
    "workspace tab type"
  );

  const helperAnchor = `function normalizeWorkspaceTabKey(value: unknown): WorkspaceTabKey | "" {`;
  const helperBlock = `function buildAppealReviewWorkspaceKey(requestId: string, caseId: string): AppealReviewWorkspaceTabKey {\n  return \`appeal-review:\${encodeURIComponent(String(requestId || "").trim())}|\${encodeURIComponent(String(caseId || "").trim())}\` as AppealReviewWorkspaceTabKey;\n}\n\nfunction parseAppealReviewWorkspaceKey(value: unknown) {\n  const normalized = String(value || "");\n  if (!normalized.startsWith("appeal-review:")) return { requestId: "", caseId: "" };\n  const payload = normalized.slice("appeal-review:".length);\n  const separatorIndex = payload.indexOf("|");\n  const encodedRequestId = separatorIndex >= 0 ? payload.slice(0, separatorIndex) : payload;\n  const encodedCaseId = separatorIndex >= 0 ? payload.slice(separatorIndex + 1) : "";\n  try {\n    return {\n      requestId: decodeURIComponent(encodedRequestId || ""),\n      caseId: decodeURIComponent(encodedCaseId || ""),\n    };\n  } catch {\n    return { requestId: encodedRequestId, caseId: encodedCaseId };\n  }\n}\n\nfunction isAppealReviewWorkspaceTabKey(value: unknown): value is AppealReviewWorkspaceTabKey {\n  return String(value || "").startsWith("appeal-review:") && Boolean(parseAppealReviewWorkspaceKey(value).requestId);\n}\n\n// ${marker}-app\n\n`;
  source = replaceRequired(source, helperAnchor, helperBlock + helperAnchor, "Appeal workspace helpers");

  source = replaceRequired(
    source,
    `  if (isCaseWorkspaceTabKey(normalized)) return normalized as CaseWorkspaceTabKey;\n  return VALID_WORKSPACE_TAB_KEYS.has(normalized as AppTab | "case-detail")`,
    `  if (isCaseWorkspaceTabKey(normalized)) return normalized as CaseWorkspaceTabKey;\n  if (isAppealReviewWorkspaceTabKey(normalized)) return normalized as AppealReviewWorkspaceTabKey;\n  return VALID_WORKSPACE_TAB_KEYS.has(normalized as AppTab | "case-detail")`,
    "normalize Appeal workspace tab"
  );

  source = replaceRequired(
    source,
    `      retained.add(\n        workspaceKey === "case-detail" || isCaseWorkspaceTabKey(workspaceKey)\n          ? "dashboard"\n          : workspaceKey\n      );`,
    `      retained.add(\n        workspaceKey === "case-detail" || isCaseWorkspaceTabKey(workspaceKey)\n          ? "dashboard"\n          : isAppealReviewWorkspaceTabKey(workspaceKey)\n            ? "appeal-requests"\n            : workspaceKey as AppTab\n      );`,
    "retained Appeal Review workspace"
  );

  source = replaceRequired(
    source,
    `  const activateWorkspaceTab = useCallback((workspaceKey: WorkspaceTabKey) => {\n    if (isCaseWorkspaceTabKey(workspaceKey)) {`,
    `  const activateWorkspaceTab = useCallback((workspaceKey: WorkspaceTabKey) => {\n    if (isAppealReviewWorkspaceTabKey(workspaceKey)) {\n      navigateToTab("appeal-requests", {\n        workspaceKey,\n        params: { requestId: "" },\n      });\n      return;\n    }\n\n    if (isCaseWorkspaceTabKey(workspaceKey)) {`,
    "activate Appeal Review workspace"
  );

  source = replaceRequired(
    source,
    `              const label = isCaseWorkspaceTabKey(workspaceKey)\n                ? parseCaseWorkspaceKey(workspaceKey).caseId\n                : WORKSPACE_TAB_LABELS[workspaceKey];`,
    `              const label = isCaseWorkspaceTabKey(workspaceKey)\n                ? parseCaseWorkspaceKey(workspaceKey).caseId\n                : isAppealReviewWorkspaceTabKey(workspaceKey)\n                  ? (parseAppealReviewWorkspaceKey(workspaceKey).caseId || "Appeal Review")\n                  : WORKSPACE_TAB_LABELS[workspaceKey as AppTab | "case-detail"];`,
    "Appeal workspace tab label"
  );

  source = replaceRequired(
    source,
    `          <AppealRequestsMockup\n            currentUser={currentUser}\n            agentDirectory={caseAgentDirectory /* appeal-review-information-action-v55-app */}\n            externalCaseDetailCases={dashboardEffectiveCases || []}\n            onTasksChanged={loadInboxTasks}\n          />`,
    `          <AppealRequestsMockup\n            currentUser={currentUser}\n            agentDirectory={caseAgentDirectory /* appeal-review-information-action-v55-app */}\n            externalCaseDetailCases={dashboardEffectiveCases || []}\n            externalRequestId={isAppealReviewWorkspaceTabKey(activeWorkspaceTab) ? parseAppealReviewWorkspaceKey(activeWorkspaceTab).requestId : ""}\n            onOpenRequestWorkspace={(requestId, caseId) => {\n              const workspaceKey = buildAppealReviewWorkspaceKey(requestId, caseId);\n              navigateToTab("appeal-requests", {\n                workspaceKey,\n                params: { requestId: "" },\n              });\n            }}\n            onTasksChanged={loadInboxTasks}\n          />`,
    "Appeal Review workspace wiring"
  );

  fs.writeFileSync(appPath, source, "utf8");
}

patchAppealReviewComponent();
patchAppWorkspaceTabs();
console.log("Appeal Review v59 applied: summary cards removed, Case ID opens an internal workspace tab, and Information status uses status colors.");
