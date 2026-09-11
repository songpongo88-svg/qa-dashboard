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

const newWorkspace = String.raw`        <div className="overflow-hidden rounded-[24px] border border-emerald-200 bg-white shadow-[0_14px_38px_rgba(15,23,42,0.07)]">
          <div className="bg-gradient-to-r from-white via-slate-50/70 to-emerald-50/45 px-5 py-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-700">{activeSubmittedRecordId ? "Editing Evaluation" : "New Evaluation"}</span>
                  <span className="inline-flex rounded-full border border-emerald-200 bg-white px-2.5 py-0.5 text-[10px] font-black text-emerald-800 shadow-sm">{evaluationStatus}</span>
                </div>
                <div className="mt-1 truncate text-lg font-black text-slate-950">
                  {noCaseForMonth ? "No Case · " + selectedMonthKey : caseId || "New QA Evaluation"}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold text-slate-500">
                  <span>Evaluator: <span className="font-black text-slate-800">{evaluatorName}</span></span>
                  <span>Rubric: <span className="font-black text-slate-800">{activeRubric.code}</span></span>
                  <span>Submitted: <span className="font-black text-slate-700">{formatDisplayTimestamp(evaluationSubmittedAt, "Not submitted")}</span></span>
                  <span>Draft: <span className="font-black text-slate-700">{formatDisplayTimestamp(draftSavedAt, "Not saved")}</span></span>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <span title="ความคืบหน้าของหัวข้อที่กรอกคำอธิบายครบแล้ว" className="inline-flex h-8 items-center rounded-full border border-sky-200 bg-sky-50 px-3 text-[11px] font-black text-sky-800">Completion {completionPct}%</span>
                <span title="คะแนนรวมชั่วคราวของแบบประเมินที่กำลังทำ" className="inline-flex h-8 items-center rounded-full border border-violet-200 bg-violet-50 px-3 text-[11px] font-black text-violet-800">Draft Score {criticalError ? 0 : finalScore}/{activeRubric.totalScore}</span>
              </div>
            </div>

            {activeSubmittedRecordId ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-[11px] font-bold text-amber-900">
                กำลังแก้ไขเคส <span className="font-black">{caseId || "-"}</span> · บันทึกด้วย Save Changes หรือออกจากเคสด้วย Cancel Edit
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50/80 px-5 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Workspace Actions</div>
            <div className="flex flex-wrap items-center gap-2">
              <span title="บันทึกข้อมูลที่กำลังทำไว้เป็น Draft เพื่อกลับมาทำต่อภายหลัง" className="inline-flex">
                <button type="button" onClick={saveDraft} disabled={Boolean(missingScoreTopics.length)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3.5 text-xs font-black text-emerald-800 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-md disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:hover:translate-y-0 disabled:hover:shadow-sm">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 4h12l2 2v14H5z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/></svg>
                  Save Draft
                </button>
              </span>

              <span title="เปิดรายการ Draft ที่บันทึกไว้ เพื่อเลือกกลับมาทำต่อ" className="inline-flex">
                <button type="button" onClick={() => setWorkspaceView("drafts")} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-black text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 hover:shadow-md">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 5h16v14H4z"/><path d="M4 9h16M9 9v10"/></svg>
                  Draft Queue
                  <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] text-white">{draftInbox.length}</span>
                </button>
              </span>

              <span title="ดูประวัติผลประเมินที่เคย Submit จากแบบประเมินนี้" className="inline-flex">
                <button type="button" onClick={() => setWorkspaceView("history")} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-black text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 hover:shadow-md">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></svg>
                  History
                </button>
              </span>

              <span title={canOpenExportReport ? "เปิดหน้ารายงานเพื่อค้นหา ตรวจสอบ แก้ไข และ Export ผลประเมิน" : "เมนู Export Report ใช้ได้เฉพาะสิทธิ์ Quality Assurance"} className="inline-flex">
                <button type="button" onClick={() => { if (canOpenExportReport) setWorkspaceView("report"); }} disabled={!canOpenExportReport} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-black text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 hover:shadow-md disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:hover:translate-y-0 disabled:hover:shadow-sm">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 19h14"/></svg>
                  Export Report
                </button>
              </span>

              {activeSubmittedRecordId ? (
                <span title="ยกเลิกการแก้ไขเคสนี้ ล้างข้อมูลออกจากฟอร์ม และกลับไปเริ่มแบบประเมินใหม่" className="inline-flex">
                  <button type="button" onClick={cancelSubmittedEdit} className="inline-flex h-10 items-center gap-2 rounded-xl border border-rose-200 bg-white px-3.5 text-xs font-black text-rose-700 shadow-sm transition hover:-translate-y-0.5 hover:border-rose-300 hover:bg-rose-50 hover:shadow-md">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18"/></svg>
                    Cancel Edit
                  </button>
                </span>
              ) : (
                <span title="ล้างข้อมูลทั้งหมดที่กำลังกรอกในฟอร์มนี้ แล้วเริ่มเคสใหม่" className="inline-flex">
                  <button type="button" onClick={clearCurrentEvaluation} className="inline-flex h-10 items-center gap-2 rounded-xl border border-amber-200 bg-white px-3.5 text-xs font-black text-amber-800 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-50 hover:shadow-md">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/></svg>
                    Clear All
                  </button>
                </span>
              )}

              <span title={activeSubmittedRecordId ? "บันทึกการแก้ไขลงในเคสเดิม" : "ส่งผลประเมินและบันทึกเคสนี้เข้าสู่ระบบ"} className="inline-flex">
                <button type="button" onClick={submitEvaluation} disabled={Boolean(missingScoreTopics.length)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-black text-white shadow-[0_8px_20px_rgba(4,120,87,0.22)] transition hover:-translate-y-0.5 hover:bg-emerald-800 hover:shadow-[0_10px_24px_rgba(4,120,87,0.28)] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none disabled:hover:translate-y-0">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12l4 4L19 6"/></svg>
                  {activeSubmittedRecordId ? "Save Changes" : "Submit Evaluation"}
                </button>
              </span>
            </div>
          </div>

          {draftMessage ? (
            <div className="border-t border-emerald-100 bg-emerald-50 px-5 py-2.5 text-xs font-bold text-emerald-900">
              {draftMessage}
            </div>
          ) : null}
        </div>
`;

source = source.slice(0, cardIndex) + newWorkspace + source.slice(draftsIndex);

fs.writeFileSync(file, source);
console.log("Applied compact Evaluate workspace actions v72");
