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

  source = replaceOnce(
    source,
    `const SONGKRAN_THEME_END = new Date(2026, 4, 25, 23, 59, 59);`,
    `function getBilingualAppealTopicLabel(topic: Topic, monthKey: string) {
  const label = String(topic.label || "").trim();
  const hasThai = /[ก-๙]/.test(label);

  const juneThai: Record<string, string> = {
    "1": "การปฏิบัติตามกระบวนการและนโยบาย",
    "2": "คุณภาพคำตอบและการวิเคราะห์ปัญหา",
    "3": "การจัดการเคสและการติดตาม",
    "4": "ทักษะการสื่อสาร",
  };
  const juneEnglish: Record<string, string> = {
    "1": "Process & Policy Compliance",
    "2": "Answer Quality & Problem Analysis",
    "3": "Case Handling & Follow-up",
    "4": "Communication Skills",
  };

  const aprilThai: Record<string, string> = {
    "1.1": "มาตรฐานการทักทายและปิดการสนทนา",
    "1.2": "การปฏิบัติตาม PDPA / Policy / ข้อกำหนด",
    "1.3": "การปฏิบัติตามกระบวนการและ SLA",
    "2.1": "ความถูกต้องของคำตอบ",
    "2.2": "ความครบถ้วนของคำตอบ",
    "2.3": "ความชัดเจนของขั้นตอนและแหล่งอ้างอิง",
    "3.1": "การวิเคราะห์และแก้ไขปัญหาได้ตรงจุด",
    "3.2": "Ownership และการแจ้ง Next Step",
    "4.1": "โครงสร้างข้อความและความอ่านง่าย",
    "4.2": "ความกระชับและความถูกต้องของภาษา",
    "4.3": "น้ำเสียงและความเหมาะสมตามสถานการณ์",
  };
  const aprilEnglish: Record<string, string> = {
    "1.1": "Standard Opening & Closing",
    "1.2": "PDPA / Policy / Requirements Compliance",
    "1.3": "Process & SLA Compliance",
    "2.1": "Answer Accuracy",
    "2.2": "Answer Completeness",
    "2.3": "Clear Steps & Official Sources",
    "3.1": "Problem Analysis & Resolution",
    "3.2": "Ownership & Next Step",
    "4.1": "Message Structure & Readability",
    "4.2": "Conciseness & Language Accuracy",
    "4.3": "Tone & Context Appropriateness",
  };

  const legacyThai: Record<string, string> = {
    "1.1": "มาตรฐานการทักทายและปิดการสนทนา",
    "1.2": "ความถูกต้องของข้อมูล",
    "1.3": "การปฏิบัติตาม PDPA และ Policy",
    "2.1": "ความถูกต้องของเคส",
    "2.2": "ความครบถ้วนของข้อมูล",
    "2.3": "คำแนะนำที่ชัดเจนและนำไปปฏิบัติได้",
    "2.4": "แหล่งข้อมูลทางการ",
    "3.1": "การวิเคราะห์สาเหตุและการแก้ไขปัญหา",
    "3.2": "การรับผิดชอบเคส",
    "3.3": "การแจ้งขั้นตอนถัดไปอย่างชัดเจน",
    "4.1": "โครงสร้างข้อความ",
    "4.2": "คุณภาพภาษา",
    "4.3": "น้ำเสียงและความเข้าใจผู้ติดต่อ",
    "4.4": "การปรับให้เหมาะกับบริบท",
    "5.1": "การปฏิบัติตามกระบวนการทำงาน",
    "5.2": "การปฏิบัติตาม SLA",
    "5.3": "ความถูกต้องของการบันทึกเคส / สถานะ",
  };
  const legacyEnglish: Record<string, string> = {
    "1.1": "Greeting & Closing Standard",
    "1.2": "Accuracy of Information",
    "1.3": "PDPA & Policy",
    "2.1": "Case Accuracy",
    "2.2": "Completeness",
    "2.3": "Clear Actionable Guidance",
    "2.4": "Official Sources",
    "3.1": "Root Cause & Resolution",
    "3.2": "Case Ownership",
    "3.3": "Clear Next Step Guidance",
    "4.1": "Message Structure",
    "4.2": "Language Quality",
    "4.3": "Tone & Empathy",
    "4.4": "Adaptation to Context",
    "5.1": "Work Process Compliance",
    "5.2": "SLA Compliance",
    "5.3": "Case Logging / Status Accuracy",
  };

  let thaiMap = legacyThai;
  let englishMap = legacyEnglish;
  if (monthKey !== "unknown" && monthKey >= "2026-06") {
    thaiMap = juneThai;
    englishMap = juneEnglish;
  } else if (monthKey !== "unknown" && monthKey >= "2026-04") {
    thaiMap = aprilThai;
    englishMap = aprilEnglish;
  }

  const thai = hasThai ? label : thaiMap[topic.code] || "";
  const english = hasThai ? englishMap[topic.code] || "" : label || englishMap[topic.code] || "";
  return {
    thai: thai || label || topic.code,
    english: english && english !== thai ? english : "",
  };
}

const SONGKRAN_THEME_END = new Date(2026, 4, 25, 23, 59, 59);`,
    "bilingual Appeal topic labels"
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
                <PanelBody className="space-y-4 bg-slate-50/90 p-4 sm:p-5">
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
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
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
                        <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2">
                          <span className="font-semibold text-slate-500">Appeal Submit</span>
                          <span className="font-bold text-slate-900">{sanitizeDisplayText(selectedRevision?.appealSubmitDateTime ?? selectedCase.appealSubmitDateTime, "-")}</span>
                        </div>
                        <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2">
                          <span className="font-semibold text-slate-500">Appeal Round</span>
                          <span className="font-bold text-slate-900">{selectedRevision?.appealRound ?? selectedCase.appealRound ?? 1}</span>
                        </div>
                        <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 sm:col-span-2">
                          <span className="font-semibold text-slate-500">Appealed Topics</span>
                          <span className="font-bold text-slate-900">{selectedRevision?.appealedTopics.length ?? selectedCase.appealedTopics.length} topic(s)</span>
                        </div>
                        <div className="grid gap-1 border-t border-slate-100 pt-2.5 sm:col-span-2 sm:grid-cols-[120px_minmax(0,1fr)]">
                          <span className="font-semibold text-slate-500">Customer Inquiry</span>
                          <span className="whitespace-pre-line font-semibold leading-5 text-slate-900">{sanitizeDisplayText(selectedCase.inquiry, "-")}</span>
                        </div>
                        <div className="grid gap-1 border-t border-slate-100 pt-2.5 sm:col-span-2 sm:grid-cols-[120px_minmax(0,1fr)]">
                          <span className="font-semibold text-slate-500">Appeal Review Summary</span>
                          <span className="whitespace-pre-line font-semibold leading-5 text-slate-900">{sanitizeDisplayText(selectedRevision?.appealReviewSummary ?? selectedCase.appealReviewSummary, "-")}</span>
                        </div>
                      </div>

                      {(selectedRevision?.appealDecision ?? selectedCase.appealDecision) === "Approved" ? (
                        <div className="mt-3 border-t border-slate-100 pt-3">
                          <button
                            type="button"
                            onClick={handleGeneratePdf}
                            disabled={pdfStatus === "generating"}
                            className="inline-flex rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] font-extrabold text-sky-700 transition hover:bg-sky-100 disabled:cursor-wait disabled:opacity-60"
                          >
                            {pdfStatus === "generating" ? "Generating PDF..." : "Generate Appeal PDF"}
                          </button>
                          {pdfMessage ? (
                            <div className={
                              "mt-2 rounded-xl border px-3 py-2 text-[11px] font-semibold " +
                              (pdfStatus === "error"
                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                : pdfStatus === "success"
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-sky-200 bg-sky-50 text-sky-700")
                            }>
                              {pdfMessage}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-sky-700">
                      <span className="text-base">▣</span>
                      <span>Appealed Topics</span>
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <div className="grid grid-cols-[42px_minmax(0,1fr)] border-b border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">
                        <div className="text-center">#</div>
                        <div>Topic</div>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {(selectedRevision?.appealedTopics ?? selectedCase.appealedTopics).length ? (
                          (selectedRevision?.appealedTopics ?? selectedCase.appealedTopics).map((topic, index) => {
                            const topicDisplay = getBilingualAppealTopicLabel(topic, selectedCase.monthKey);
                            return (
                              <div
                                key={selectedCase.caseId + "-appealed-topic-" + topic.code + "-" + index}
                                className="grid grid-cols-[42px_minmax(0,1fr)] items-start px-3 py-3"
                              >
                                <div className="pt-0.5 text-center text-xs font-bold text-slate-600">{index + 1}</div>
                                <div className="min-w-0">
                                  <div className="text-sm font-bold leading-5 text-slate-900">{topicDisplay.thai}</div>
                                  {topicDisplay.english ? (
                                    <div className="mt-0.5 text-[11px] font-semibold leading-4 text-slate-500">{topicDisplay.english}</div>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="px-4 py-5 text-center text-xs font-semibold text-slate-500">No appealed topics</div>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 text-[10px] font-semibold text-slate-400">ใช้ปุ่ม View Full Record ด้านบนเพื่อเปิดรายละเอียดเคสเต็ม</div>
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

  const oldAppealedPanelStart = source.indexOf(
    `              <Panel>\n                <PanelHeader\n                  title="Appealed Topics"`,
    detailStart
  );
  if (oldAppealedPanelStart >= 0) {
    const oldAppealedPanelClose = `\n              </Panel>`;
    const oldAppealedPanelEnd = source.indexOf(oldAppealedPanelClose, oldAppealedPanelStart);
    if (oldAppealedPanelEnd < 0) {
      throw new Error("Appeal two-column v36 old Appealed Topics panel end not found.");
    }
    source =
      source.slice(0, oldAppealedPanelStart) +
      source.slice(oldAppealedPanelEnd + oldAppealedPanelClose.length);
  }

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

console.log("Patched Appeal Case Detail to match the compact mockup: clean background, Customer Inquiry and Appeal Review Summary inside Appeal Information, non-clickable bilingual Appealed Topics, and View Full Record as the only case-opening action.");