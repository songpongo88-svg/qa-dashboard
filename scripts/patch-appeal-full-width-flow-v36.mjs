import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appealPath = path.join(root, "src", "AppealMockup.tsx");
const marker = "appeal-two-column-mockup-v36";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Appeal two-column v36 anchor not found: ${label}`);
  }
  return source.replace(before, after);
}

let source = fs.readFileSync(appealPath, "utf8");

if (!source.includes(`// ${marker}`)) {
  source = replaceOnce(
    source,
    `  // appeal-detail-dashboard-link-v35\n  const [searchCaseId, setSearchCaseId] = useState("");`,
    `  // appeal-detail-dashboard-link-v35\n  // ${marker}\n  const [searchCaseId, setSearchCaseId] = useState("");`,
    "v36 marker"
  );

  const summaryStart = source.indexOf(
    `      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">`
  );
  const workspaceStart = source.indexOf(
    `      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(430px,0.85fr)]">`,
    Math.max(summaryStart, 0)
  );

  if (summaryStart >= 0 && workspaceStart > summaryStart) {
    source = source.slice(0, summaryStart) + source.slice(workspaceStart);
  }

  source = replaceOnce(
    source,
    `      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(430px,0.85fr)]">`,
    `      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.62fr)_minmax(440px,0.88fr)] xl:items-start">`,
    "two-column Appeal Cases workspace"
  );

  const detailStart = source.indexOf(
    `              <Panel>\n                <PanelHeader\n                  title="Appeal Case Detail"`
  );
  const historyStart = source.indexOf(
    `              <AppealRevisionHistory`,
    detailStart
  );

  if (detailStart < 0 || historyStart < 0) {
    throw new Error("Appeal two-column v36 compact detail bounds not found.");
  }

  const compactDetail = `              <Panel>
                <PanelHeader
                  title="Appeal Case Detail"
                  subtitle="สรุปผลอุทธรณ์ของเคสที่เลือก"
                />
                <PanelBody className="space-y-4 p-4 sm:p-5">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-xl font-extrabold tracking-tight text-slate-950">{selectedCase.caseId}</div>
                          <span
                            className={
                              "rounded-full border px-2.5 py-1 text-[10px] font-extrabold " +
                              ((selectedRevision?.appealDecision ?? selectedCase.appealDecision) === "Rejected"
                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                : "border-emerald-200 bg-emerald-50 text-emerald-700")
                            }
                          >
                            {selectedRevision?.appealDecision ?? selectedCase.appealDecision}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onOpenCaseDetail?.(selectedCase.caseId, selectedCase.agent)}
                        className="inline-flex shrink-0 items-center justify-center rounded-xl border border-sky-300 bg-white px-3.5 py-2 text-[11px] font-extrabold text-sky-700 shadow-sm transition hover:bg-sky-50"
                      >
                        View Full Record ↗
                      </button>
                    </div>

                    <div className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                      <div className="border-b border-slate-100 pb-2 sm:border-b-0 sm:border-r sm:pr-5">
                        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Agent</div>
                        <div className="mt-1 truncate text-sm font-extrabold text-slate-900">{selectedCase.agent}</div>
                      </div>
                      <div className="border-b border-slate-100 pb-2 sm:border-b-0">
                        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Month / Period</div>
                        <div className="mt-1 text-sm font-extrabold text-slate-900">{formatMonthKeyLabel(selectedCase.monthKey)}</div>
                      </div>
                      <div className="sm:border-r sm:pr-5">
                        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Case Date</div>
                        <div className="mt-1 text-sm font-extrabold text-slate-900">{selectedCase.auditDate || "-"}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Result Date</div>
                        <div className="mt-1 text-sm font-extrabold text-slate-900">{sanitizeDisplayText(selectedRevision?.appealResultDateTime ?? selectedCase.appealResultDateTime, "-")}</div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-[1fr_0.78fr_1fr]">
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-center shadow-sm">
                      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Original Result</div>
                      <div className="mt-1.5 text-2xl font-extrabold tracking-tight text-slate-950">
                        {(selectedRevision?.previousScore ?? selectedCase.previousScore).toFixed(2)}
                      </div>
                      <span className={"mt-1.5 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-extrabold " + gradeTone(selectedCaseOriginalGrade ?? selectedCase.grade)}>
                        Grade {selectedCaseOriginalGrade ?? selectedCase.grade}
                      </span>
                    </div>

                    <div className="flex flex-col items-center justify-center rounded-2xl border border-sky-100 bg-sky-50 px-2 py-3 text-center">
                      <div className="text-xl font-extrabold text-sky-500">→</div>
                      <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.11em] text-sky-600">Score Change</div>
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

                    <div className="rounded-2xl border border-sky-200 bg-white px-3 py-3 text-center shadow-sm">
                      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-sky-600">Final Result</div>
                      <div className="mt-1.5 text-2xl font-extrabold tracking-tight text-slate-950">
                        {(selectedRevision?.finalScore ?? selectedCase.finalScore).toFixed(2)}
                      </div>
                      <span className={"mt-1.5 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-extrabold " + gradeTone(selectedCaseFinalGrade ?? selectedCase.grade)}>
                        Grade {selectedCaseFinalGrade ?? selectedCase.grade}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-sky-700">
                      <span className="text-base">▣</span>
                      <span>Appeal Information</span>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                      <div className="grid gap-x-6 gap-y-2.5 text-xs sm:grid-cols-2">
                        <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2">
                          <span className="font-semibold text-slate-500">Case ID</span>
                          <span className="font-bold text-slate-900">{selectedCase.caseId}</span>
                        </div>
                        <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2">
                          <span className="font-semibold text-slate-500">Agent</span>
                          <span className="truncate font-bold text-slate-900">{selectedCase.agent}</span>
                        </div>
                        <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2">
                          <span className="font-semibold text-slate-500">Case Date</span>
                          <span className="font-bold text-slate-900">{selectedCase.auditDate || "-"}</span>
                        </div>
                        <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2">
                          <span className="font-semibold text-slate-500">Result Date</span>
                          <span className="font-bold text-slate-900">{sanitizeDisplayText(selectedRevision?.appealResultDateTime ?? selectedCase.appealResultDateTime, "-")}</span>
                        </div>
                        <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2">
                          <span className="font-semibold text-slate-500">Month / Period</span>
                          <span className="font-bold text-slate-900">{formatMonthKeyLabel(selectedCase.monthKey)}</span>
                        </div>
                        <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2">
                          <span className="font-semibold text-slate-500">Decision</span>
                          <span
                            className={
                              "w-fit rounded-full border px-2 py-0.5 text-[10px] font-extrabold " +
                              ((selectedRevision?.appealDecision ?? selectedCase.appealDecision) === "Rejected"
                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                : "border-emerald-200 bg-emerald-50 text-emerald-700")
                            }
                          >
                            {selectedRevision?.appealDecision ?? selectedCase.appealDecision}
                          </span>
                        </div>
                        <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 sm:col-span-2">
                          <span className="font-semibold text-slate-500">Appealed Topics</span>
                          <span className="font-bold text-slate-900">{selectedRevision?.appealedTopics.length ?? selectedCase.appealedTopics.length} topic(s)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </PanelBody>
              </Panel>

`;

  source = source.slice(0, detailStart) + compactDetail + source.slice(historyStart);

  const historyCallStart = source.indexOf(`              <AppealRevisionHistory`, detailStart);
  if (historyCallStart >= 0) {
    const historyCallEnd = source.indexOf(`/>`, historyCallStart);
    if (historyCallEnd < 0) {
      throw new Error("Appeal two-column v36 history call end not found.");
    }
    source = source.slice(0, historyCallStart) + source.slice(historyCallEnd + 2);
  }

  source = replaceOnce(
    source,
    `                      <AppealedTopicsCorporateTable\n                        topics={selectedRevision?.appealedTopics ?? selectedCase.appealedTopics}\n                        decision={selectedRevision?.appealDecision ?? selectedCase.appealDecision}\n                      />`,
    `                      <div className="space-y-2">\n                        <div className="flex items-center gap-2 text-sm font-extrabold text-sky-700">\n                          <span className="text-base">▣</span>\n                          <span>Appealed Topics</span>\n                        </div>\n                        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">\n                          <div className="grid grid-cols-[42px_minmax(0,1fr)_34px] border-b border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">\n                            <div className="text-center">#</div>\n                            <div>Topic</div>\n                            <div />\n                          </div>\n                          <div className="divide-y divide-slate-100">\n                            {(selectedRevision?.appealedTopics ?? selectedCase.appealedTopics).length ? (\n                              (selectedRevision?.appealedTopics ?? selectedCase.appealedTopics).map((topic, index) => (\n                                <button\n                                  type="button"\n                                  key={selectedCase.caseId + "-appealed-topic-" + topic.code + "-" + index}\n                                  onClick={() => onOpenCaseDetail?.(selectedCase.caseId, selectedCase.agent)}\n                                  className="group grid w-full grid-cols-[42px_minmax(0,1fr)_34px] items-center px-3 py-3 text-left transition hover:bg-sky-50"\n                                >\n                                  <div className="text-center text-xs font-bold text-slate-600">{index + 1}</div>\n                                  <div className="min-w-0">\n                                    <div className="truncate text-sm font-bold text-slate-900">{topic.label}</div>\n                                  </div>\n                                  <div className="text-center text-xl font-bold text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-sky-600">›</div>\n                                </button>\n                              ))\n                            ) : (\n                              <div className="px-4 py-5 text-center text-xs font-semibold text-slate-500">No appealed topics</div>\n                            )}\n                          </div>\n                        </div>\n                      </div>`,
    "compact Appealed Topics table"
  );

  source = source.replace(
    `              <div className="max-h-[720px] overflow-auto">`,
    `              <div className="max-h-[650px] overflow-auto">`
  );
  source = source.replace(
    `? "bg-sky-50 ring-1 ring-inset ring-sky-300"`,
    `? "bg-sky-50 ring-1 ring-inset ring-sky-400"`
  );

  fs.writeFileSync(appealPath, source, "utf8");
}

console.log("Patched Appeal Cases to use the compact approved right-side layout: concise case header, compact score cards, table-style Appeal Information, and clickable Appealed Topics.");
