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

  // Remove the oversized summary / reviewed / current-view blocks so the page starts
  // with the case workspace, matching the approved mockup.
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

  source = source.replace(
    `                <PanelHeader\n                  title="Appeal Result"\n                  subtitle="สรุปผลอุทธรณ์ของเคสที่เลือก — รายละเอียดเคสจริงเปิดผ่าน Open Case Detail"\n                />`,
    `                <PanelHeader\n                  title="Appeal Case Detail"\n                  subtitle="Review the selected appeal result. View Full Record opens the same Case Detail used by the Dashboard."\n                />`
  );

  source = replaceOnce(
    source,
    `                      <button\n                        type="button"\n                        onClick={() => onOpenCaseDetail?.(selectedCase.caseId, selectedCase.agent)}\n                        className="inline-flex shrink-0 items-center justify-center rounded-xl border border-sky-300 bg-white px-4 py-2.5 text-xs font-extrabold text-sky-700 shadow-sm transition hover:bg-sky-50"\n                      >\n                        Open Case Detail\n                      </button>`,
    `                      <button\n                        type="button"\n                        onClick={() => onOpenCaseDetail?.(selectedCase.caseId, selectedCase.agent)}\n                        className="inline-flex shrink-0 items-center justify-center rounded-xl border border-sky-300 bg-white px-4 py-2.5 text-xs font-extrabold text-sky-700 shadow-sm transition hover:bg-sky-50"\n                      >\n                        View Full Record\n                      </button>`,
    "top View Full Record action"
  );

  source = replaceOnce(
    source,
    `                    <button\n                      type="button"\n                      onClick={() => onOpenCaseDetail?.(selectedCase.caseId, selectedCase.agent)}\n                      className="inline-flex rounded-xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-xs font-extrabold text-sky-700 transition hover:bg-sky-100"\n                    >\n                      Open Case Detail\n                    </button>\n`,
    ``,
    "remove duplicate Appeal Information case button"
  );

  source = replaceOnce(
    source,
    `                      <AppealedTopicsCorporateTable\n                        topics={selectedRevision?.appealedTopics ?? selectedCase.appealedTopics}\n                        decision={selectedRevision?.appealDecision ?? selectedCase.appealDecision}\n                      />`,
    `                      <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">\n                        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">\n                          <div>\n                            <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">Appealed Topics</div>\n                            <div className="mt-0.5 text-xs font-semibold text-slate-600">Select a topic to open the full Case Detail</div>\n                          </div>\n                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-extrabold text-slate-600">\n                            {(selectedRevision?.appealedTopics ?? selectedCase.appealedTopics).length} topic(s)\n                          </span>\n                        </div>\n\n                        <div className="divide-y divide-slate-100">\n                          {(selectedRevision?.appealedTopics ?? selectedCase.appealedTopics).length ? (\n                            (selectedRevision?.appealedTopics ?? selectedCase.appealedTopics).map((topic, index) => (\n                              <button\n                                type="button"\n                                key={selectedCase.caseId + "-appealed-topic-" + topic.code + "-" + index}\n                                onClick={() => onOpenCaseDetail?.(selectedCase.caseId, selectedCase.agent)}\n                                className="group flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-sky-50"\n                              >\n                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-50 text-xs font-extrabold text-sky-700 ring-1 ring-inset ring-sky-100">\n                                  {index + 1}\n                                </span>\n                                <div className="min-w-0 flex-1">\n                                  <div className="truncate text-sm font-extrabold text-slate-900">{topic.label}</div>\n                                  <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Topic {topic.code}</div>\n                                </div>\n                                <span className="text-xl font-bold text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-sky-600">›</span>\n                              </button>\n                            ))\n                          ) : (\n                            <div className="px-4 py-6 text-center text-xs font-semibold text-slate-500">No appealed topics</div>\n                          )}\n                        </div>\n                      </div>`,
    "compact Appealed Topics that open Case Detail"
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

console.log("Patched Appeal Cases to match the approved mockup: table left, selected Appeal Case Detail right, compact Appealed Topics, and topic clicks open the full Dashboard Case Detail.");
