import fs from "node:fs";

const file = "src/CreateEvaluationMockup.tsx";
let source = fs.readFileSync(file, "utf8");
const marker = "// evaluate-workspace-actions-v72";

if (source.includes(marker)) {
  console.log("Evaluate workspace actions v72 already applied");
  process.exit(0);
}

function replaceOnce(from, to, label) {
  if (!source.includes(from)) throw new Error(`Evaluate workspace v72: missing ${label}`);
  source = source.replace(from, to);
}

replaceOnce(
  '// process-library-v65\n',
  '// process-library-v65\n' + marker + '\n',
  'source marker',
);

replaceOnce(
`  function cancelSubmittedEdit() {
    const editingCaseId = caseId || "current case";
    setActiveSubmittedRecordId("");
    setSubmitPreview(null);
    setWorkspaceView("report");
    setDraftMessage(\`Edit cancelled for \${editingCaseId}. No changes were saved.\`);
  }
`,
`  function cancelSubmittedEdit() {
    const editingCaseId = caseId || "current case";
    const ok = window.confirm("ยกเลิกการแก้ไขเคส " + editingCaseId + " และล้างข้อมูลออกจากฟอร์มหรือไม่?\\n\\nข้อมูลที่แก้ไขแต่ยังไม่ได้บันทึกจะถูกยกเลิก");
    if (!ok) return;
    resetEvaluationForm();
    setSubmitPreview(null);
    setWorkspaceView("form");
    setDraftMessage("");
  }

  function clearCurrentEvaluation() {
    const ok = window.confirm("ล้างข้อมูลทั้งหมดของแบบประเมินที่กำลังทำอยู่หรือไม่?\\n\\nข้อมูลที่ยังไม่ได้ Submit จะถูกล้างออกจากฟอร์ม");
    if (!ok) return;
    resetEvaluationForm();
    setSubmitPreview(null);
    setWorkspaceView("form");
    setDraftMessage("");
  }
`,
  'cancel edit handler',
);

const topCardsStart = '        <div className="grid gap-4 rounded-[26px] border border-emerald-200 bg-white p-4 shadow-[0_18px_48px_rgba(15,23,42,0.08)] lg:grid-cols-4">';
const mainCardStart = '        <div className="overflow-hidden rounded-[26px] border border-emerald-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]">';
const topIndex = source.indexOf(topCardsStart);
if (topIndex < 0) throw new Error("Evaluate workspace v72: top metric cards not found");
const mainIndex = source.indexOf(mainCardStart, topIndex + topCardsStart.length);
if (mainIndex < 0) throw new Error("Evaluate workspace v72: main workspace card not found");
source = source.slice(0, topIndex) + source.slice(mainIndex);

const cardIndex = source.indexOf(mainCardStart, topIndex);
const draftsMarker = '        {workspaceView === "drafts" ? (';
const draftsIndex = source.indexOf(draftsMarker, cardIndex);
if (cardIndex < 0 || draftsIndex < 0) throw new Error("Evaluate workspace v72: workspace card range not found");

const newWorkspace = String.raw`        <div className="overflow-hidden rounded-[26px] border border-emerald-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_520px]">
            <div className="border-b border-emerald-100 bg-gradient-to-br from-white via-slate-50 to-emerald-50/60 p-5 xl:border-b-0 xl:border-r">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-700">{activeSubmittedRecordId ? "Editing Evaluation" : "New Evaluation"}</div>
                  <div className="mt-1 truncate text-xl font-black text-slate-950">
                    {noCaseForMonth ? "No Case · " + selectedMonthKey : caseId || "New QA Evaluation"}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">
                    <span>Evaluator: <span className="font-black text-slate-800">{evaluatorName}</span></span>
                    <span>Rubric: <span className="font-black text-slate-800">{activeRubric.code}</span></span>
                    <span>Submitted: <span className="font-black text-slate-700">{formatDisplayTimestamp(evaluationSubmittedAt, "Not submitted")}</span></span>
                    <span>Draft: <span className="font-black text-slate-700">{formatDisplayTimestamp(draftSavedAt, "Not saved")}</span></span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <span className="inline-flex rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-black text-emerald-800 shadow-sm">{evaluationStatus}</span>
                  <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-black text-sky-800">Completion {completionPct}%</span>
                  <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-black text-violet-800">Draft Score {criticalError ? 0 : finalScore}/{activeRubric.totalScore}</span>
                </div>
              </div>
              {activeSubmittedRecordId ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900">
                  กำลังแก้ไขเคส <span className="font-black">{caseId || "-"}</span> · กด Save Changes เพื่อบันทึก หรือ Cancel Edit เพื่อออกจากเคสและล้างฟอร์ม
                </div>
              ) : null}
            </div>

            <div className="bg-slate-50 p-5">
              <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Workspace Actions</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={saveDraft} disabled={Boolean(missingScoreTopics.length)} className="rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-black text-emerald-800 shadow-sm transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400">
                  Save Draft
                </button>
                <button type="button" onClick={() => setWorkspaceView("drafts")} className="relative rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-50">
                  Draft Queue
                  <span className="ml-2 inline-flex min-w-[22px] items-center justify-center rounded-full bg-indigo-600 px-2 py-0.5 text-xs text-white">{draftInbox.length}</span>
                </button>
                <button type="button" onClick={() => setWorkspaceView("history")} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-50">
                  Evaluation History
                </button>
                <button type="button" onClick={() => { if (canOpenExportReport) setWorkspaceView("report"); }} disabled={!canOpenExportReport} title={canOpenExportReport ? "Open Export Report" : "Export Report is available for Quality Assurance only"} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">
                  Export Report
                </button>
                {activeSubmittedRecordId ? (
                  <button type="button" onClick={cancelSubmittedEdit} className="rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm font-black text-rose-700 shadow-sm transition hover:bg-rose-50">
                    Cancel Edit
                  </button>
                ) : (
                  <button type="button" onClick={clearCurrentEvaluation} className="rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm font-black text-amber-800 shadow-sm transition hover:bg-amber-50">
                    Clear All
                  </button>
                )}
                <button type="button" onClick={submitEvaluation} disabled={Boolean(missingScoreTopics.length)} className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white shadow-[0_12px_24px_rgba(4,120,87,0.18)] transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none">
                  {activeSubmittedRecordId ? "Save Changes" : "Submit Evaluation"}
                </button>
              </div>
            </div>
          </div>
          {draftMessage ? (
            <div className="mx-5 mb-5 mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">
              {draftMessage}
            </div>
          ) : null}
        </div>
`;

source = source.slice(0, cardIndex) + newWorkspace + source.slice(draftsIndex);

fs.writeFileSync(file, source);
console.log("Applied Evaluate workspace actions v72");
