import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appealPath = path.join(root, "src", "AppealMockup.tsx");
const marker = "appeal-kpi-grade-topic-format-v37";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Appeal KPI v37 anchor not found: ${label}`);
  }
  return source.replace(before, after);
}

let source = fs.readFileSync(appealPath, "utf8");

if (!source.includes(`// ${marker}`)) {
  source = replaceOnce(
    source,
    `  // appeal-two-column-mockup-v36\n  const [searchCaseId, setSearchCaseId] = useState("");`,
    `  // appeal-two-column-mockup-v36\n  // ${marker}\n  const [searchCaseId, setSearchCaseId] = useState("");`,
    "v37 marker"
  );

  source = replaceOnce(
    source,
    `                            <td className="px-3 py-3 text-xs font-bold text-slate-800">{item.previousScore.toFixed(2)}</td>\n                            <td className="px-3 py-3 text-xs font-extrabold text-violet-800">{item.finalScore.toFixed(2)}</td>\n                            <td className="whitespace-nowrap px-3 py-3">\n                              <span className={"inline-flex rounded-full border px-2.5 py-1 text-[10px] font-extrabold " + gradeTone(finalGrade)}>\n                                {originalGrade === finalGrade ? finalGrade : originalGrade + " → " + finalGrade}\n                              </span>\n                            </td>`,
    `                            <td\n                              className={\n                                "px-3 py-3 text-xs font-extrabold " +\n                                (item.previousScore >= 85 ? "text-emerald-700" : "text-rose-700")\n                              }\n                            >\n                              {item.previousScore.toFixed(2)}\n                            </td>\n                            <td\n                              className={\n                                "px-3 py-3 text-xs font-extrabold " +\n                                (item.finalScore >= 85 ? "text-emerald-700" : "text-rose-700")\n                              }\n                            >\n                              {item.finalScore.toFixed(2)}\n                            </td>\n                            <td className="whitespace-nowrap px-3 py-3">\n                              <span\n                                className={\n                                  "inline-flex rounded-full border px-2.5 py-1 text-[10px] font-extrabold " +\n                                  (item.finalScore >= 85\n                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"\n                                    : "border-rose-200 bg-rose-50 text-rose-700")\n                                }\n                              >\n                                {originalGrade + " → " + finalGrade}\n                              </span>\n                            </td>`,
    "table KPI score and grade flow"
  );

  source = replaceOnce(
    source,
    `                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-center shadow-sm">\n                      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Original Result</div>\n                      <div className="mt-1.5 text-2xl font-extrabold tracking-tight text-slate-950">\n                        {(selectedRevision?.previousScore ?? selectedCase.previousScore).toFixed(2)}\n                      </div>\n                      <span className={"mt-1.5 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-extrabold " + gradeTone(selectedCaseOriginalGrade ?? selectedCase.grade)}>\n                        Grade {selectedCaseOriginalGrade ?? selectedCase.grade}\n                      </span>\n                    </div>`,
    `                    <div\n                      className={\n                        "rounded-2xl border px-3 py-3 text-center shadow-sm " +\n                        ((selectedRevision?.previousScore ?? selectedCase.previousScore) >= 85\n                          ? "border-emerald-200 bg-emerald-50/80"\n                          : "border-rose-200 bg-rose-50/80")\n                      }\n                    >\n                      <div\n                        className={\n                          "text-[10px] font-bold uppercase tracking-[0.12em] " +\n                          ((selectedRevision?.previousScore ?? selectedCase.previousScore) >= 85\n                            ? "text-emerald-700"\n                            : "text-rose-700")\n                        }\n                      >\n                        Original Result\n                      </div>\n                      <div\n                        className={\n                          "mt-1.5 text-2xl font-extrabold tracking-tight " +\n                          ((selectedRevision?.previousScore ?? selectedCase.previousScore) >= 85\n                            ? "text-emerald-800"\n                            : "text-rose-800")\n                        }\n                      >\n                        {(selectedRevision?.previousScore ?? selectedCase.previousScore).toFixed(2)}\n                      </div>\n                      <span\n                        className={\n                          "mt-1.5 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-extrabold " +\n                          ((selectedRevision?.previousScore ?? selectedCase.previousScore) >= 85\n                            ? "border-emerald-300 bg-white text-emerald-700"\n                            : "border-rose-300 bg-white text-rose-700")\n                        }\n                      >\n                        Grade {selectedCaseOriginalGrade ?? selectedCase.grade}\n                      </span>\n                    </div>`,
    "original result KPI card"
  );

  source = replaceOnce(
    source,
    `                    <div className="rounded-2xl border border-sky-200 bg-white px-3 py-3 text-center shadow-sm">\n                      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-sky-600">Final Result</div>\n                      <div className="mt-1.5 text-2xl font-extrabold tracking-tight text-slate-950">\n                        {(selectedRevision?.finalScore ?? selectedCase.finalScore).toFixed(2)}\n                      </div>\n                      <span className={"mt-1.5 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-extrabold " + gradeTone(selectedCaseFinalGrade ?? selectedCase.grade)}>\n                        Grade {selectedCaseFinalGrade ?? selectedCase.grade}\n                      </span>\n                    </div>`,
    `                    <div\n                      className={\n                        "rounded-2xl border px-3 py-3 text-center shadow-sm " +\n                        ((selectedRevision?.finalScore ?? selectedCase.finalScore) >= 85\n                          ? "border-emerald-200 bg-emerald-50/80"\n                          : "border-rose-200 bg-rose-50/80")\n                      }\n                    >\n                      <div\n                        className={\n                          "text-[10px] font-bold uppercase tracking-[0.12em] " +\n                          ((selectedRevision?.finalScore ?? selectedCase.finalScore) >= 85\n                            ? "text-emerald-700"\n                            : "text-rose-700")\n                        }\n                      >\n                        Final Result\n                      </div>\n                      <div\n                        className={\n                          "mt-1.5 text-2xl font-extrabold tracking-tight " +\n                          ((selectedRevision?.finalScore ?? selectedCase.finalScore) >= 85\n                            ? "text-emerald-800"\n                            : "text-rose-800")\n                        }\n                      >\n                        {(selectedRevision?.finalScore ?? selectedCase.finalScore).toFixed(2)}\n                      </div>\n                      <span\n                        className={\n                          "mt-1.5 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-extrabold " +\n                          ((selectedRevision?.finalScore ?? selectedCase.finalScore) >= 85\n                            ? "border-emerald-300 bg-white text-emerald-700"\n                            : "border-rose-300 bg-white text-rose-700")\n                        }\n                      >\n                        Grade {selectedCaseFinalGrade ?? selectedCase.grade}\n                      </span>\n                    </div>`,
    "final result KPI card"
  );

  source = replaceOnce(
    source,
    `<div className="mt-0.5 text-[11px] font-semibold leading-4 text-slate-500">{topicDisplay.english}</div>`,
    `<div className="mt-0.5 text-[11px] font-semibold leading-4 text-rose-600">{topicDisplay.english}</div>`,
    "Appealed Topics English red"
  );

  fs.writeFileSync(appealPath, source, "utf8");
}

console.log("Patched Appeal Cases with KPI-aligned score colors, always-visible Grade flow, and Dashboard-style bilingual topics with red English labels.");
