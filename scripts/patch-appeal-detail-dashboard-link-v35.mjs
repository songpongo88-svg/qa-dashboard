import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appealPath = path.join(root, "src", "AppealMockup.tsx");
const appPath = path.join(root, "src", "App.tsx");
const marker = "appeal-detail-dashboard-link-v35";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Appeal Detail v35 anchor not found: ${label}`);
  }
  return source.replace(before, after);
}

function patchAppealDetail() {
  let source = fs.readFileSync(appealPath, "utf8");
  if (source.includes(`// ${marker}`)) return;

  source = replaceOnce(
    source,
    `  onSelectedAgentChange,\n  onGeneratePdf,\n}: {`,
    `  onSelectedAgentChange,\n  onOpenCaseDetail,\n  onGeneratePdf,\n}: {`,
    "Appeal component props destructure"
  );

  source = replaceOnce(
    source,
    `  onSelectedAgentChange?: (agentName: string) => void;\n  onGeneratePdf?: (caseId: string, agentName?: string, pdfType?: string) => void;`,
    `  onSelectedAgentChange?: (agentName: string) => void;\n  onOpenCaseDetail?: (caseId: string, agentName?: string) => void;\n  onGeneratePdf?: (caseId: string, agentName?: string, pdfType?: string) => void;`,
    "Appeal component prop type"
  );

  source = replaceOnce(
    source,
    `  // appeal-dashboard-layout-v34\n  const [searchCaseId, setSearchCaseId] = useState("");`,
    `  // appeal-dashboard-layout-v34\n  // ${marker}\n  const [searchCaseId, setSearchCaseId] = useState("");`,
    "v35 marker"
  );

  const detailStart = source.indexOf(
    `              <Panel>\n                <PanelHeader\n                  title="Appeal Case Detail"`
  );
  const legacyInfoStart = source.indexOf(
    `              <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.2fr)_360px]">`,
    detailStart
  );
  if (detailStart < 0 || legacyInfoStart < 0) {
    throw new Error("Appeal Detail v35 main detail bounds not found.");
  }

  const compactDetail = `              <Panel>
                <PanelHeader
                  title="Appeal Case Detail"
                  subtitle="สรุปผลอุทธรณ์ล่าสุด — กด Open Case Detail เพื่อดูรายละเอียดเคสแบบเดียวกับ Cases in Current View"
                />
                <PanelBody className="space-y-5">
                  <div className="rounded-[22px] border border-sky-100 bg-gradient-to-r from-sky-50 via-white to-violet-50 p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-2xl font-extrabold tracking-tight text-slate-950">{selectedCase.caseId}</div>
                          <span
                            className={
                              "rounded-full border px-3 py-1 text-xs font-extrabold " +
                              ((selectedRevision?.appealDecision ?? selectedCase.appealDecision) === "Rejected"
                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                : "border-emerald-200 bg-emerald-50 text-emerald-700")
                            }
                          >
                            {selectedRevision?.appealDecision ?? selectedCase.appealDecision}
                          </span>
                        </div>
                        <div className="mt-2 text-sm font-bold text-slate-700">{selectedCase.agent}</div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onOpenCaseDetail?.(selectedCase.caseId, selectedCase.agent)}
                        className="inline-flex shrink-0 items-center justify-center rounded-xl border border-sky-300 bg-white px-4 py-2.5 text-xs font-extrabold text-sky-700 shadow-sm transition hover:bg-sky-50"
                      >
                        Open Case Detail
                      </button>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-white/80 bg-white/90 px-4 py-3 shadow-sm">
                        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Case Date</div>
                        <div className="mt-1 text-sm font-extrabold text-slate-900">{selectedCase.auditDate || "-"}</div>
                      </div>
                      <div className="rounded-2xl border border-white/80 bg-white/90 px-4 py-3 shadow-sm">
                        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Result Date</div>
                        <div className="mt-1 text-sm font-extrabold text-slate-900">{sanitizeDisplayText(selectedRevision?.appealResultDateTime ?? selectedCase.appealResultDateTime, "-")}</div>
                      </div>
                      <div className="rounded-2xl border border-white/80 bg-white/90 px-4 py-3 shadow-sm">
                        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Month / Period</div>
                        <div className="mt-1 text-sm font-extrabold text-slate-900">{formatMonthKeyLabel(selectedCase.monthKey)}</div>
                      </div>
                      <div className="rounded-2xl border border-white/80 bg-white/90 px-4 py-3 shadow-sm">
                        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Appealed Topics</div>
                        <div className="mt-1 text-sm font-extrabold text-slate-900">{selectedRevision?.appealedTopics.length ?? selectedCase.appealedTopics.length} topic(s)</div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[1fr_116px_1fr] sm:items-stretch">
                    <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Original Result</div>
                      <div className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950">
                        {(selectedRevision?.previousScore ?? selectedCase.previousScore).toFixed(2)}
                      </div>
                      <span className={"mt-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-extrabold " + gradeTone(selectedCaseOriginalGrade ?? selectedCase.grade)}>
                        Grade {selectedCaseOriginalGrade ?? selectedCase.grade}
                      </span>
                    </div>

                    <div className="flex flex-col items-center justify-center rounded-[22px] border border-sky-100 bg-sky-50 px-3 py-4 text-center">
                      <div className="text-2xl font-extrabold text-sky-500">→</div>
                      <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.12em] text-sky-600">Score Change</div>
                      <div className={
                        "mt-1 text-base font-extrabold " +
                        ((selectedRevision?.finalScore ?? selectedCase.finalScore) - (selectedRevision?.previousScore ?? selectedCase.previousScore) > 0
                          ? "text-emerald-700"
                          : (selectedRevision?.finalScore ?? selectedCase.finalScore) - (selectedRevision?.previousScore ?? selectedCase.previousScore) < 0
                            ? "text-rose-700"
                            : "text-slate-600")
                      }>
                        {(selectedRevision?.finalScore ?? selectedCase.finalScore) - (selectedRevision?.previousScore ?? selectedCase.previousScore) > 0 ? "+" : ""}
                        {((selectedRevision?.finalScore ?? selectedCase.finalScore) - (selectedRevision?.previousScore ?? selectedCase.previousScore)).toFixed(2)}
                      </div>
                    </div>

                    <div className="rounded-[22px] border border-sky-200 bg-gradient-to-br from-sky-50 to-violet-50 p-4">
                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-600">Final Result</div>
                      <div className="mt-2 text-3xl font-extrabold tracking-tight text-sky-950">
                        {(selectedRevision?.finalScore ?? selectedCase.finalScore).toFixed(2)}
                      </div>
                      <span className={"mt-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-extrabold " + gradeTone(selectedCaseFinalGrade ?? selectedCase.grade)}>
                        Grade {selectedCaseFinalGrade ?? selectedCase.grade}
                      </span>
                      <div className="mt-2 text-[11px] font-bold text-sky-700">
                        Grade {selectedCaseOriginalGrade ?? selectedCase.grade} → {selectedCaseFinalGrade ?? selectedCase.grade}
                      </div>
                    </div>
                  </div>
                </PanelBody>
              </Panel>

`;

  source = source.slice(0, detailStart) + compactDetail + source.slice(legacyInfoStart);

  const duplicateStart = source.indexOf(
    `              <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.2fr)_360px]">`,
    detailStart
  );
  const duplicateEnd = source.indexOf(`              <AppealRevisionHistory`, duplicateStart);
  if (duplicateStart < 0 || duplicateEnd < 0) {
    throw new Error("Appeal Detail v35 legacy summary/timeline bounds not found.");
  }

  const appealInfo = `              <Panel>
                <PanelHeader
                  title="Appeal Information"
                  subtitle="ข้อมูลการยื่นอุทธรณ์และผลพิจารณา — รายละเอียดเคสเต็มเปิดผ่าน Open Case Detail"
                />
                <PanelBody className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-600">Appeal Submit</div>
                      <div className="mt-1 text-sm font-extrabold text-slate-900">{sanitizeDisplayText(selectedRevision?.appealSubmitDateTime, "-")}</div>
                    </div>
                    <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-600">Appeal Result</div>
                      <div className="mt-1 text-sm font-extrabold text-slate-900">{sanitizeDisplayText(selectedRevision?.appealResultDateTime, "-")}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Appeal Channel</div>
                      <div className="mt-1 text-sm font-extrabold text-slate-900">{sanitizeDisplayText(selectedRevision?.appealChannel, "-")}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Review Status</div>
                      <div className="mt-1 text-sm font-extrabold text-slate-900">{selectedRevision?.reviewStatus ?? selectedCase.reviewStatus}</div>
                    </div>
                    <div className={
                      "rounded-2xl border px-4 py-3 " +
                      ((selectedRevision?.appealDecision ?? selectedCase.appealDecision) === "Rejected"
                        ? "border-rose-200 bg-rose-50"
                        : "border-emerald-200 bg-emerald-50")
                    }>
                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Decision</div>
                      <div className="mt-1 text-sm font-extrabold text-slate-900">{selectedRevision?.appealDecision ?? selectedCase.appealDecision}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Appeal Round</div>
                      <div className="mt-1 text-sm font-extrabold text-slate-900">{selectedRevision?.appealRound ?? selectedCase.appealRound}</div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Review Summary</div>
                    <div className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-800">{sanitizeDisplayText(selectedRevision?.appealReviewSummary, "-")}</div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenCaseDetail?.(selectedCase.caseId, selectedCase.agent)}
                      className="inline-flex rounded-xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-xs font-extrabold text-sky-700 transition hover:bg-sky-100"
                    >
                      Open Case Detail
                    </button>
                    {(selectedRevision?.appealDecision ?? selectedCase.appealDecision) === "Approved" ? (
                      <button
                        type="button"
                        onClick={handleGeneratePdf}
                        disabled={pdfStatus === "generating"}
                        className="inline-flex rounded-xl border border-violet-300 bg-violet-50 px-4 py-2.5 text-xs font-extrabold text-violet-700 transition hover:bg-violet-100 disabled:cursor-wait disabled:opacity-60"
                      >
                        {pdfStatus === "generating" ? "Generating PDF..." : "Generate Appeal PDF"}
                      </button>
                    ) : null}
                  </div>

                  {pdfMessage ? (
                    <div className={
                      "rounded-2xl border px-4 py-3 text-sm font-semibold " +
                      (pdfStatus === "error"
                        ? "border-rose-200 bg-rose-50 text-rose-700"
                        : pdfStatus === "success"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-violet-200 bg-violet-50 text-violet-700")
                    }>
                      {pdfMessage}
                    </div>
                  ) : null}
                </PanelBody>
              </Panel>

`;

  source = source.slice(0, duplicateStart) + appealInfo + source.slice(duplicateEnd);

  fs.writeFileSync(appealPath, source, "utf8");
}

function patchAppNavigation() {
  let source = fs.readFileSync(appPath, "utf8");
  if (source.includes(`// ${marker}-app`)) return;

  const appealStart = source.indexOf(`<AppealMockup`);
  if (appealStart < 0) throw new Error("Appeal Detail v35 App AppealMockup not found.");

  const agentProp = `            onSelectedAgentChange={setSelectedAgentGlobal}`;
  const agentPropIndex = source.indexOf(agentProp, appealStart);
  if (agentPropIndex < 0) throw new Error("Appeal Detail v35 App agent prop not found.");

  const insertAt = agentPropIndex + agentProp.length;
  const callback = `
            // ${marker}-app
            onOpenCaseDetail={(caseId, agentName) => {
              const caseWorkspaceKey = buildCaseWorkspaceKey(caseId || "", agentName || "");
              setDashboardSubTab("case-detail");
              setSelectedDashboardCaseId(caseId || "");
              if (agentName) {
                setSelectedAgentGlobal(agentName);
                setCaseSelectedAgent(agentName);
              }
              navigateToTab("dashboard", {
                workspaceKey: caseWorkspaceKey,
                params: {
                  subTab: "case-detail",
                  caseId: caseId || "",
                  agent: agentName || "",
                },
              });
            }}`;

  source = source.slice(0, insertAt) + callback + source.slice(insertAt);
  fs.writeFileSync(appPath, source, "utf8");
}

patchAppealDetail();
patchAppNavigation();
console.log("Patched Appeal Case Detail to match the dashboard-style design and open the shared Cases in Current View detail workspace.");
