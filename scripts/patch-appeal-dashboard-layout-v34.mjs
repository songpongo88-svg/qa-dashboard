import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appealPath = path.join(root, "src", "AppealMockup.tsx");
const marker = "appeal-dashboard-layout-v34";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Appeal dashboard layout v34 anchor not found: ${label}`);
  }
  return source.replace(before, after);
}

let source = fs.readFileSync(appealPath, "utf8");

if (!source.includes(`// ${marker}`)) {
  source = replaceOnce(
    source,
    `  // appeal-case-center-v33\n  const [searchCaseId, setSearchCaseId] = useState("");`,
    `  // appeal-case-center-v33\n  // ${marker}\n  const [searchCaseId, setSearchCaseId] = useState("");`,
    "v34 marker"
  );

  source = replaceOnce(
    source,
    `            const finalScoreFromTopics = topics.reduce((sum, topic) => sum + Number(topic.score || 0), 0);\n            const effectiveFinalScore =\n              appealDecision === "Rejected"\n                ? previousScore\n                : Number.isFinite(finalScoreFromTopics) && finalScoreFromTopics > 0\n                  ? finalScoreFromTopics\n                  : finalScore;`,
    `            const approvedScoreDelta = changedTopics.reduce(\n              (sum, topic) => sum + (Number(topic.score || 0) - Number(topic.originalScore ?? topic.score ?? 0)),\n              0\n            );\n            const effectiveFinalScore =\n              appealDecision === "Rejected"\n                ? previousScore\n                : Number((previousScore + approvedScoreDelta).toFixed(2));`,
    "static appeal effective score parity"
  );

  source = replaceOnce(
    source,
    `            const finalScoreFromTopics = topics.reduce((sum, topic) => sum + Number(topic.score || 0), 0);\n            const approvedFinalScore = Number.isFinite(finalScoreFromTopics) && finalScoreFromTopics > 0\n              ? finalScoreFromTopics\n              : previousScore;\n            const finalScore = appealDecision === "Rejected" ? previousScore : approvedFinalScore;`,
    `            const approvedScoreDelta = changedTopics.reduce(\n              (sum, topic) => sum + (Number(topic.score || 0) - Number(topic.originalScore ?? topic.score ?? 0)),\n              0\n            );\n            const finalScore =\n              appealDecision === "Rejected"\n                ? previousScore\n                : Number((previousScore + approvedScoreDelta).toFixed(2));`,
    "firebase appeal effective score parity"
  );

  source = source.replace(
    `      <div className="grid gap-6 xl:grid-cols-[390px_minmax(0,1fr)]">`,
    `      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(430px,0.85fr)]">`
  );

  source = replaceOnce(
    source,
    `          <PanelBody className="space-y-4">\n            {!roleScopedAgentList.length ? (`,
    `          <PanelBody className="space-y-5">\n            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">\n            {!roleScopedAgentList.length ? (`,
    "filter grid open"
  );

  source = replaceOnce(
    source,
    `            <div className="rounded-2xl border border-violet-100 bg-violet-50/70 px-4 py-3 text-sm text-violet-900">`,
    `            </div>\n\n            <div className="rounded-2xl border border-violet-100 bg-violet-50/70 px-4 py-3 text-sm text-violet-900">`,
    "filter grid close"
  );

  const listStart = source.indexOf(`            <div className="space-y-3">\n              {!filteredCases.length ? (`);
  const listEndMarker = `            </div>\n          </PanelBody>`;
  const listEnd = source.indexOf(listEndMarker, listStart);
  if (listStart < 0 || listEnd < 0) {
    throw new Error("Appeal dashboard layout v34 case list bounds not found.");
  }

  const tableBlock = [
    '            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white">',
    '              <div className="max-h-[720px] overflow-auto">',
    '                <table className="min-w-[1040px] w-full border-collapse text-left">',
    '                  <thead className="sticky top-0 z-10 bg-slate-50">',
    '                    <tr className="border-b border-slate-200">',
    '                      <th className="px-3 py-3 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Case ID</th>',
    '                      <th className="px-3 py-3 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Agent</th>',
    '                      <th className="px-3 py-3 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Case Date</th>',
    '                      <th className="px-3 py-3 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Result Date</th>',
    '                      <th className="px-3 py-3 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Decision</th>',
    '                      <th className="px-3 py-3 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Original</th>',
    '                      <th className="px-3 py-3 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Final</th>',
    '                      <th className="px-3 py-3 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Grade</th>',
    '                      <th className="px-3 py-3 text-center text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Topics</th>',
    '                      <th className="px-3 py-3 text-center text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Action</th>',
    '                    </tr>',
    '                  </thead>',
    '                  <tbody className="divide-y divide-slate-100">',
    '                    {!filteredCases.length ? (',
    '                      <tr>',
    '                        <td colSpan={10} className="px-5 py-10 text-center text-sm text-slate-500">ไม่พบข้อมูลเคส</td>',
    '                      </tr>',
    '                    ) : (',
    '                      filteredCases.map((item) => {',
    '                        const originalGrade = scoreToGrade(item.previousScore, item.monthKey);',
    '                        const finalGrade = scoreToGrade(item.finalScore, item.monthKey);',
    '                        return (',
    '                          <tr',
    '                            key={item.key}',
    '                            onClick={() => setSelectedCaseKey(item.key)}',
    '                            className={',
    '                              "cursor-pointer transition " +',
    '                              (selectedCase?.key === item.key',
    '                                ? "bg-sky-50 ring-1 ring-inset ring-sky-300"',
    '                                : "bg-white hover:bg-slate-50")',
    '                            }',
    '                          >',
    '                            <td className="whitespace-nowrap px-3 py-3 text-xs font-extrabold text-slate-950">{item.caseId}</td>',
    '                            <td className="min-w-[150px] px-3 py-3 text-xs font-semibold text-slate-800">{item.agent}</td>',
    '                            <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">{item.auditDate || "-"}</td>',
    '                            <td className="min-w-[135px] px-3 py-3 text-xs text-slate-600">{sanitizeDisplayText(item.appealResultDateTime, "-")}</td>',
    '                            <td className="px-3 py-3">',
    '                              <span className={',
    '                                "inline-flex rounded-full border px-2.5 py-1 text-[10px] font-extrabold " +',
    '                                (item.appealDecision === "Rejected"',
    '                                  ? "border-rose-200 bg-rose-50 text-rose-700"',
    '                                  : "border-emerald-200 bg-emerald-50 text-emerald-700")',
    '                              }>{item.appealDecision}</span>',
    '                            </td>',
    '                            <td className="px-3 py-3 text-xs font-bold text-slate-800">{item.previousScore.toFixed(2)}</td>',
    '                            <td className="px-3 py-3 text-xs font-extrabold text-violet-800">{item.finalScore.toFixed(2)}</td>',
    '                            <td className="whitespace-nowrap px-3 py-3">',
    '                              <span className={"inline-flex rounded-full border px-2.5 py-1 text-[10px] font-extrabold " + gradeTone(finalGrade)}>',
    '                                {originalGrade === finalGrade ? finalGrade : originalGrade + " → " + finalGrade}',
    '                              </span>',
    '                            </td>',
    '                            <td className="px-3 py-3 text-center text-xs font-bold text-slate-700">{item.appealedTopics.length}</td>',
    '                            <td className="px-3 py-3 text-center">',
    '                              <button',
    '                                type="button"',
    '                                onClick={() => setSelectedCaseKey(item.key)}',
    '                                className="rounded-xl border border-sky-300 bg-white px-3 py-1.5 text-[11px] font-extrabold text-sky-700 transition hover:bg-sky-50"',
    '                              >',
    '                                View',
    '                              </button>',
    '                            </td>',
    '                          </tr>',
    '                        );',
    '                      })',
    '                    )}',
    '                  </tbody>',
    '                </table>',
    '              </div>',
    '              <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/70 px-4 py-3 text-xs text-slate-500">',
    '                <span>Showing {filteredCases.length} appeal case(s)</span>',
    '                <span className="font-semibold text-slate-700">Select View to open Appeal Case Detail</span>',
    '              </div>',
    '            </div>',
  ].join("\n");

  source = source.slice(0, listStart) + tableBlock + "\n" + source.slice(listEnd + "            </div>\n".length);

  const resultStart = source.indexOf(`              <div className="overflow-hidden rounded-[30px] border border-violet-200 bg-white shadow-[0_16px_40px_rgba(76,29,149,0.10)]">`);
  const resultEndMarker = `              <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.2fr)_360px]">`;
  const resultEnd = source.indexOf(resultEndMarker, resultStart);
  if (resultStart < 0 || resultEnd < 0) {
    throw new Error("Appeal dashboard layout v34 result detail bounds not found.");
  }

  const detailBlock = [
    '              <Panel>',
    '                <PanelHeader',
    '                  title="Appeal Case Detail"',
    '                  subtitle="รายละเอียดเคสและผลอุทธรณ์ล่าสุดที่ใช้ร่วมกับ Dashboard"',
    '                />',
    '                <PanelBody className="space-y-5">',
    '                  <div className="flex flex-col gap-4 rounded-[22px] border border-sky-100 bg-gradient-to-r from-sky-50 via-white to-violet-50 p-5 lg:flex-row lg:items-start lg:justify-between">',
    '                    <div>',
    '                      <div className="flex flex-wrap items-center gap-2">',
    '                        <div className="text-2xl font-extrabold tracking-tight text-slate-950">{selectedCase.caseId}</div>',
    '                        <span className={',
    '                          "rounded-full border px-3 py-1 text-xs font-extrabold " +',
    '                          ((selectedRevision?.appealDecision ?? selectedCase.appealDecision) === "Rejected"',
    '                            ? "border-rose-200 bg-rose-50 text-rose-700"',
    '                            : "border-emerald-200 bg-emerald-50 text-emerald-700")',
    '                        }>',
    '                          {selectedRevision?.appealDecision ?? selectedCase.appealDecision}',
    '                        </span>',
    '                      </div>',
    '                      <div className="mt-2 text-sm font-bold text-slate-700">{selectedCase.agent}</div>',
    '                    </div>',
    '                    {selectedCase.caseUrl ? (',
    '                      <a',
    '                        href={selectedCase.caseUrl}',
    '                        target="_blank"',
    '                        rel="noreferrer"',
    '                        className="inline-flex rounded-xl border border-sky-300 bg-white px-4 py-2 text-xs font-extrabold text-sky-700 transition hover:bg-sky-50"',
    '                      >',
    '                        View Full Record',
    '                      </a>',
    '                    ) : null}',
    '                  </div>',
    '',
    '                  <div className="grid gap-3 sm:grid-cols-2">',
    '                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">',
    '                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Case Date</div>',
    '                      <div className="mt-1 text-sm font-extrabold text-slate-900">{selectedCase.auditDate || "-"}</div>',
    '                    </div>',
    '                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">',
    '                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Result Date</div>',
    '                      <div className="mt-1 text-sm font-extrabold text-slate-900">{sanitizeDisplayText(selectedRevision?.appealResultDateTime ?? selectedCase.appealResultDateTime, "-")}</div>',
    '                    </div>',
    '                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">',
    '                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Month / Period</div>',
    '                      <div className="mt-1 text-sm font-extrabold text-slate-900">{formatMonthKeyLabel(selectedCase.monthKey)}</div>',
    '                    </div>',
    '                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">',
    '                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Appealed Topics</div>',
    '                      <div className="mt-1 text-sm font-extrabold text-slate-900">{selectedRevision?.appealedTopics.length ?? selectedCase.appealedTopics.length} topic(s)</div>',
    '                    </div>',
    '                  </div>',
    '',
    '                  <div className="grid gap-3 lg:grid-cols-[1fr_150px_1fr] lg:items-stretch">',
    '                    <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-5">',
    '                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Original Result</div>',
    '                      <div className="mt-3 text-4xl font-extrabold tracking-tight text-slate-950">{(selectedRevision?.previousScore ?? selectedCase.previousScore).toFixed(2)}</div>',
    '                      <span className={"mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-extrabold " + gradeTone(selectedCaseOriginalGrade ?? selectedCase.grade)}>',
    '                        Grade {selectedCaseOriginalGrade ?? selectedCase.grade}',
    '                      </span>',
    '                    </div>',
    '                    <div className="flex flex-col items-center justify-center rounded-[22px] border border-sky-100 bg-sky-50 px-3 py-5 text-center">',
    '                      <div className="text-3xl font-extrabold text-sky-500">→</div>',
    '                      <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-600">Score Change</div>',
    '                      <div className={',
    '                        "mt-1 text-xl font-extrabold " +',
    '                        ((selectedRevision?.finalScore ?? selectedCase.finalScore) - (selectedRevision?.previousScore ?? selectedCase.previousScore) > 0',
    '                          ? "text-emerald-700"',
    '                          : (selectedRevision?.finalScore ?? selectedCase.finalScore) - (selectedRevision?.previousScore ?? selectedCase.previousScore) < 0',
    '                            ? "text-rose-700"',
    '                            : "text-slate-600")',
    '                      }>',
    '                        {(selectedRevision?.finalScore ?? selectedCase.finalScore) - (selectedRevision?.previousScore ?? selectedCase.previousScore) > 0 ? "+" : ""}',
    '                        {((selectedRevision?.finalScore ?? selectedCase.finalScore) - (selectedRevision?.previousScore ?? selectedCase.previousScore)).toFixed(2)}',
    '                      </div>',
    '                    </div>',
    '                    <div className="rounded-[22px] border border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-5">',
    '                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-600">Final Result</div>',
    '                      <div className="mt-3 text-4xl font-extrabold tracking-tight text-violet-950">{(selectedRevision?.finalScore ?? selectedCase.finalScore).toFixed(2)}</div>',
    '                      <span className={"mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-extrabold " + gradeTone(selectedCaseFinalGrade ?? selectedCase.grade)}>',
    '                        Grade {selectedCaseFinalGrade ?? selectedCase.grade}',
    '                      </span>',
    '                      <div className="mt-3 text-xs font-bold text-violet-700">',
    '                        Grade {(selectedCaseOriginalGrade ?? selectedCase.grade) + " → " + (selectedCaseFinalGrade ?? selectedCase.grade)}',
    '                      </div>',
    '                    </div>',
    '                  </div>',
    '                </PanelBody>',
    '              </Panel>',
    '',
  ].join("\n");

  source = source.slice(0, resultStart) + detailBlock + source.slice(resultEnd);

  source = source.replace(
    `                    title="Appeal Case Summary"\n                    subtitle="ข้อมูลสรุปของเคสและผลการพิจารณาอุทธรณ์"`,
    `                    title="Appeal Information"\n                    subtitle="ข้อมูลเคส วันที่พิจารณา สถานะ และรายละเอียดผลอุทธรณ์"`
  );

  fs.writeFileSync(appealPath, source, "utf8");
}

console.log("Patched Appeal Cases to dashboard-style table/detail layout and aligned approved final scores with Dashboard appeal deltas.");
