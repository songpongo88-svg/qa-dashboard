import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appealPath = path.join(root, "src", "AppealMockup.tsx");
const marker = "appeal-case-center-v33";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Appeal Case Center v33 anchor not found: ${label}`);
  }
  return source.replace(before, after);
}

let source = fs.readFileSync(appealPath, "utf8");

if (!source.includes(`// ${marker}`)) {
  source = replaceOnce(
    source,
    `  const [searchCaseId, setSearchCaseId] = useState("");\n  const [selectedMonthKey, setSelectedMonthKey] = useState("all");`,
    `  // ${marker}\n  const [searchCaseId, setSearchCaseId] = useState("");\n  const [selectedDecision, setSelectedDecision] = useState<"all" | AppealDecision>("all");\n  const [selectedMonthKey, setSelectedMonthKey] = useState("all");`,
    "decision filter state"
  );

  source = replaceOnce(
    source,
    `    grade: item.grade,`,
    `    grade: scoreToGrade(item.finalScore, item.monthKey),`,
    "rewrite history grade recalculation"
  );

  source = replaceOnce(
    source,
    `      return {\n        ...latest,\n        appealRound: rewriteHistory.length,\n        rewriteHistory,\n      };`,
    `      return {\n        ...latest,\n        grade: scoreToGrade(latest.finalScore, latest.monthKey),\n        appealRound: rewriteHistory.length,\n        rewriteHistory,\n      };`,
    "latest appeal grade recalculation"
  );

  source = replaceOnce(
    source,
    `            const appealedTopics = topics.filter((topic) => topic.appealed);\n            const changedTopics = topics.filter((topic) => topic.changed);\n\n            return {\n              key: \`appeal-\${index + 1}-\${caseId}\`,`,
    `            const appealedTopics = topics.filter((topic) => topic.appealed);\n            const changedTopics = topics.filter((topic) => topic.changed);\n            const finalScoreFromTopics = topics.reduce((sum, topic) => sum + Number(topic.score || 0), 0);\n            const effectiveFinalScore =\n              appealDecision === "Rejected"\n                ? previousScore\n                : Number.isFinite(finalScoreFromTopics) && finalScoreFromTopics > 0\n                  ? finalScoreFromTopics\n                  : finalScore;\n\n            return {\n              key: \`appeal-\${index + 1}-\${caseId}\`,`,
    "static appeal effective score"
  );

  source = replaceOnce(
    source,
    `              previousScore,\n              finalScore,\n              reviewStatus: appealDecision === "Approved" && changedTopics.length ? "Revised" : "Original",\n              appealDecision,\n              grade: scoreToGrade(finalScore, monthKey),`,
    `              previousScore,\n              finalScore: effectiveFinalScore,\n              reviewStatus: appealDecision === "Approved" && changedTopics.length ? "Revised" : "Original",\n              appealDecision,\n              grade: scoreToGrade(effectiveFinalScore, monthKey),`,
    "static appeal final score and grade"
  );

  source = replaceOnce(
    source,
    `  const filteredCases = useMemo(() => {\n    const keyword = searchCaseId.trim().toLowerCase();\n    if (!keyword) return baseVisibleCases;\n    return baseVisibleCases.filter((item) => item.caseId.toLowerCase().includes(keyword));\n  }, [baseVisibleCases, searchCaseId]);`,
    `  const filteredCases = useMemo(() => {\n    const keyword = searchCaseId.trim().toLowerCase();\n    return baseVisibleCases.filter((item) => {\n      if (selectedDecision !== "all" && item.appealDecision !== selectedDecision) return false;\n      if (keyword && !item.caseId.toLowerCase().includes(keyword)) return false;\n      return true;\n    });\n  }, [baseVisibleCases, searchCaseId, selectedDecision]);\n\n  const appealStats = useMemo(() => {\n    const approved = baseVisibleCases.filter((item) => item.appealDecision === "Approved").length;\n    const rejected = baseVisibleCases.filter((item) => item.appealDecision === "Rejected").length;\n    const scoreChanged = baseVisibleCases.filter(\n      (item) => Math.abs(Number(item.finalScore || 0) - Number(item.previousScore || 0)) > 0.0001\n    ).length;\n    return {\n      total: baseVisibleCases.length,\n      approved,\n      rejected,\n      scoreChanged,\n    };\n  }, [baseVisibleCases]);`,
    "decision filtering and summary metrics"
  );

  source = replaceOnce(
    source,
    `    setSelectedMonthKey("all");\n    setSearchCaseId(externalSelectedCaseId);`,
    `    setSelectedMonthKey("all");\n    setSelectedDecision("all");\n    setSearchCaseId(externalSelectedCaseId);`,
    "external case clears decision filter"
  );

  source = replaceOnce(
    source,
    `  const selectedCaseUsesNewPolicy = selectedCase ? isNewPolicyMonth(selectedCase.monthKey) : false;\n  const selectedCaseOriginalGrade = selectedCase\n    ? scoreToGrade(selectedRevision?.previousScore ?? selectedCase.previousScore, selectedCase.monthKey)\n    : null;\n  const selectedCaseGradeShift =\n    selectedCase && selectedRevision && selectedCaseOriginalGrade\n      ? gradeShiftTone(selectedCaseOriginalGrade, selectedRevision.grade)\n      : null;`,
    `  const selectedCaseUsesNewPolicy = selectedCase ? isNewPolicyMonth(selectedCase.monthKey) : false;\n  const selectedCaseOriginalGrade = selectedCase\n    ? scoreToGrade(selectedRevision?.previousScore ?? selectedCase.previousScore, selectedCase.monthKey)\n    : null;\n  const selectedCaseFinalGrade = selectedCase\n    ? scoreToGrade(selectedRevision?.finalScore ?? selectedCase.finalScore, selectedCase.monthKey)\n    : null;\n  const selectedCaseGradeShift =\n    selectedCase && selectedRevision && selectedCaseOriginalGrade && selectedCaseFinalGrade\n      ? gradeShiftTone(selectedCaseOriginalGrade, selectedCaseFinalGrade)\n      : null;`,
    "selected appeal live grade"
  );

  source = replaceOnce(
    source,
    `          grade: selectedRevision.grade,`,
    `          grade: selectedCaseFinalGrade ?? scoreToGrade(selectedRevision.finalScore, selectedCase.monthKey),`,
    "Appeal PDF live grade"
  );

  source = replaceOnce(
    source,
    `        title="Appeal Cases"\n        subtitle="ดูเคสอุทธรณ์ทั้ง Approved และ Rejected พร้อมเหตุผลและผลการพิจารณา"`,
    `        title="Appeal Case Center"\n        subtitle="ดูผลอุทธรณ์แบบ Original → Final พร้อมคะแนน Grade และเหตุผลการพิจารณาในหน้าเดียว"`,
    "Appeal page hero"
  );

  source = replaceOnce(
    source,
    `      <AppealClosedBanner />\n\n      <div className="flex flex-col gap-3 rounded-[24px] border border-violet-200 bg-violet-50/80 px-5 py-4 shadow-[0_10px_24px_rgba(109,40,217,0.08)] lg:flex-row lg:items-center lg:justify-between">`,
    `      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">\n        <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">\n          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Total Appeals</div>\n          <div className="mt-2 text-3xl font-extrabold text-slate-950">{appealStats.total}</div>\n          <div className="mt-1 text-xs text-slate-500">Reviewed cases in current scope</div>\n        </div>\n        <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4">\n          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">Approved</div>\n          <div className="mt-2 text-3xl font-extrabold text-emerald-900">{appealStats.approved}</div>\n          <div className="mt-1 text-xs text-emerald-700">Approved appeal results</div>\n        </div>\n        <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4">\n          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-rose-700">Rejected</div>\n          <div className="mt-2 text-3xl font-extrabold text-rose-900">{appealStats.rejected}</div>\n          <div className="mt-1 text-xs text-rose-700">Original score remains active</div>\n        </div>\n        <div className="rounded-[24px] border border-violet-200 bg-violet-50 px-5 py-4">\n          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-700">Score Changed</div>\n          <div className="mt-2 text-3xl font-extrabold text-violet-900">{appealStats.scoreChanged}</div>\n          <div className="mt-1 text-xs text-violet-700">Cases with a changed final score</div>\n        </div>\n      </div>\n\n      <div className="flex flex-col gap-3 rounded-[24px] border border-violet-200 bg-violet-50/80 px-5 py-4 shadow-[0_10px_24px_rgba(109,40,217,0.08)] lg:flex-row lg:items-center lg:justify-between">`,
    "Appeal summary cards"
  );

  source = replaceOnce(
    source,
    `              setSelectedMonthKey("all");\n              setSearchCaseId("");`,
    `              setSelectedMonthKey("all");\n              setSelectedDecision("all");\n              setSearchCaseId("");`,
    "reset decision filter"
  );

  source = replaceOnce(
    source,
    `            <div>\n              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">\n                Search Case ID\n              </label>`,
    `            <div>\n              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">\n                Decision\n              </label>\n              <select\n                value={selectedDecision}\n                onChange={(e) => setSelectedDecision(e.target.value as "all" | AppealDecision)}\n                className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none ring-0 transition focus:border-violet-400"\n              >\n                <option value="all">All Decisions</option>\n                <option value="Approved">Approved</option>\n                <option value="Rejected">Rejected</option>\n              </select>\n            </div>\n\n            <div>\n              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">\n                Search Case ID\n              </label>`,
    "Decision filter control"
  );

  source = source.replace(
    `      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">`,
    `      <div className="grid gap-6 xl:grid-cols-[390px_minmax(0,1fr)]">`
  );

  source = source.replace(
    `            title="Cases"\n            subtitle="รายการเคสอุทธรณ์และสถานะการพิจารณา"`,
    `            title="Appeal Cases"\n            subtitle="เลือกเคสเพื่อดู Original → Final, Grade และรายละเอียดการพิจารณา"`
  );

  const quickStart = source.indexOf("function QuickCaseCard({");
  const quickEnd = source.indexOf("\nfunction AppealedTopicsCaseDetailTable", quickStart);
  if (quickStart < 0 || quickEnd < 0) {
    throw new Error("Appeal Case Center v33 QuickCaseCard bounds not found.");
  }

  const quickCaseCard = `function QuickCaseCard({
  item,
  isSelected,
  onClick,
}: {
  item: AppealCaseItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  const originalGrade = scoreToGrade(item.previousScore, item.monthKey);
  const finalGrade = scoreToGrade(item.finalScore, item.monthKey);
  const delta = Number(item.finalScore || 0) - Number(item.previousScore || 0);
  const gradeChanged = originalGrade !== finalGrade;

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "relative w-full overflow-hidden rounded-[24px] border p-4 text-left transition " +
        (isSelected
          ? "border-violet-500 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 shadow-[0_14px_30px_rgba(109,40,217,0.15)]"
          : "border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/50")
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate text-sm font-extrabold text-slate-950">{item.caseId}</div>
            <span
              className={
                "rounded-full border px-2.5 py-1 text-[10px] font-extrabold " +
                (item.appealDecision === "Rejected"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700")
              }
            >
              {item.appealDecision}
            </span>
          </div>
          <div className="mt-1 truncate text-[11px] font-medium text-slate-500">
            {item.agent}
          </div>
          <div className="mt-1 text-[10px] text-slate-400">
            Case Date {item.auditDate || "-"} • Result {item.appealResultDateTime || "-"}
          </div>
        </div>

        <span className="shrink-0 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[10px] font-bold text-violet-700">
          View
        </span>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">Original</div>
          <div className="mt-1 text-lg font-extrabold text-slate-900">{item.previousScore.toFixed(2)}</div>
          <span className={"mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-extrabold " + gradeTone(originalGrade)}>
            Grade {originalGrade}
          </span>
        </div>

        <div className="text-center">
          <div className="text-lg font-extrabold text-violet-400">→</div>
          <div className={"mt-1 text-[10px] font-extrabold " + (delta > 0 ? "text-emerald-700" : delta < 0 ? "text-rose-700" : "text-slate-500")}>
            {delta > 0 ? "+" : ""}{delta.toFixed(2)}
          </div>
        </div>

        <div className="text-right">
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-violet-500">Final</div>
          <div className="mt-1 text-lg font-extrabold text-violet-900">{item.finalScore.toFixed(2)}</div>
          <span className={"mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-extrabold " + gradeTone(finalGrade)}>
            Grade {finalGrade}
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-[10px]">
        <span className={gradeChanged ? "font-bold text-violet-700" : "font-medium text-slate-500"}>
          {gradeChanged ? "Grade " + originalGrade + " → " + finalGrade : "Grade " + finalGrade}
        </span>
        <span className="text-slate-500">{item.appealedTopics.length} appealed topic(s)</span>
      </div>
    </button>
  );
}
`;

  source = source.slice(0, quickStart) + quickCaseCard + source.slice(quickEnd + 1);

  const scoreStart = source.indexOf(`              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">`);
  const scoreEnd = source.indexOf(
    `              <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.2fr)_360px]">`,
    scoreStart
  );
  if (scoreStart < 0 || scoreEnd < 0) {
    throw new Error("Appeal Case Center v33 result summary bounds not found.");
  }

  const resultSummary = `              <div className="overflow-hidden rounded-[30px] border border-violet-200 bg-white shadow-[0_16px_40px_rgba(76,29,149,0.10)]">
                <div className="flex flex-col gap-3 border-b border-violet-100 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-600">Current Appeal Result</div>
                    <div className="mt-1 text-xl font-extrabold text-slate-950">{selectedCase.caseId}</div>
                    <div className="mt-1 text-xs font-medium text-slate-500">{selectedCase.agent}</div>
                  </div>
                  <span
                    className={
                      "w-fit rounded-full border px-3 py-1.5 text-xs font-extrabold " +
                      ((selectedRevision?.appealDecision ?? selectedCase.appealDecision) === "Rejected"
                        ? "border-rose-200 bg-rose-50 text-rose-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700")
                    }
                  >
                    {selectedRevision?.appealDecision ?? selectedCase.appealDecision}
                  </span>
                </div>

                <div className="grid gap-4 p-5 lg:grid-cols-[1fr_130px_1fr] lg:items-stretch">
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Original Result</div>
                    <div className="mt-3 text-4xl font-extrabold tracking-tight text-slate-950">
                      {(selectedRevision?.previousScore ?? selectedCase.previousScore).toFixed(2)}
                    </div>
                    <span className={"mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-extrabold " + gradeTone(selectedCaseOriginalGrade ?? selectedCase.grade)}>
                      Grade {selectedCaseOriginalGrade ?? selectedCase.grade}
                    </span>
                  </div>

                  <div className="flex flex-col items-center justify-center rounded-[24px] border border-violet-100 bg-violet-50 px-3 py-5 text-center">
                    <div className="text-3xl font-extrabold text-violet-500">→</div>
                    <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-violet-500">Score Change</div>
                    <div className={
                      "mt-1 text-lg font-extrabold " +
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

                  <div className="rounded-[24px] border border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-600">Final Result</div>
                    <div className="mt-3 text-4xl font-extrabold tracking-tight text-violet-950">
                      {(selectedRevision?.finalScore ?? selectedCase.finalScore).toFixed(2)}
                    </div>
                    <span className={"mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-extrabold " + gradeTone(selectedCaseFinalGrade ?? selectedCase.grade)}>
                      Grade {selectedCaseFinalGrade ?? selectedCase.grade}
                    </span>
                    <div className="mt-3 text-xs font-semibold text-violet-700">
                      {selectedCaseOriginalGrade && selectedCaseFinalGrade && selectedCaseOriginalGrade !== selectedCaseFinalGrade
                        ? "Grade " + selectedCaseOriginalGrade + " → " + selectedCaseFinalGrade
                        : "Grade " + (selectedCaseFinalGrade ?? selectedCase.grade)}
                    </div>
                  </div>
                </div>
              </div>

`;

  source = source.slice(0, scoreStart) + resultSummary + source.slice(scoreEnd);

  source = source.replace(
    `        title="Rewrite History"\n        subtitle="ประวัติการแก้ไขเคสและคะแนนล่าสุด"`,
    `        title="Appeal History"\n        subtitle="ดูคะแนนและ Grade ของแต่ละรอบการอุทธรณ์"`
  );

  fs.writeFileSync(appealPath, source, "utf8");
}

console.log("Patched Appeal Case Center UI and recalculated Grade from the effective final score for every appeal round.");
