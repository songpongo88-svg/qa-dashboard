import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reviewPath = path.join(root, "src", "AppealRequestsMockup.tsx");
const marker = "appeal-review-fixed-datetime-v63";

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Appeal Review v63: ${label} anchor not found.`);
  }
  return source.replace(before, after);
}

function patchAppealReview() {
  let source = fs.readFileSync(reviewPath, "utf8");
  if (source.includes(`// ${marker}`)) return;

  const helperAnchor = `function appealReviewTopicLine(topic: AppealTopic, index: number) {`;
  const helper = `function appealReviewFixedDateTimeParts(value: unknown) {\n  const formatted = formatDateTime(value);\n  const parts = String(formatted || "-").trim().split(/\\s+/g);\n  return {\n    datePart: parts[0] || "-",\n    timePart: parts.slice(1).join(" "),\n  };\n}\n\n// ${marker}\n\n`;
  source = replaceRequired(source, helperAnchor, helper + helperAnchor, "fixed datetime helper");

  const submittedBefore = `<div className="font-extrabold text-purple-700"><span className="inline-block min-w-[176px] whitespace-nowrap text-left text-[14px] leading-5 tabular-nums tracking-[0.01em]" style={{ fontVariantNumeric: "tabular-nums", fontFeatureSettings: '\"tnum\" 1' }}>{formatDateTime(selectedRequest.submittedAt)}</span></div>`;
  const submittedAfter = `<div className="font-extrabold text-purple-700">\n                      {(() => {\n                        const { datePart, timePart } = appealReviewFixedDateTimeParts(selectedRequest.submittedAt);\n                        return (\n                          <span className="inline-grid grid-cols-[80px_64px] items-center gap-2 whitespace-nowrap text-left text-[14px] leading-5">\n                            <span className="inline-flex">\n                              {datePart.split("").map((char, index) => <span key={"submitted-date-" + index} className="inline-block w-[8px] text-center">{char}</span>)}\n                            </span>\n                            <span className="inline-flex">\n                              {timePart.split("").map((char, index) => <span key={"submitted-time-" + index} className="inline-block w-[8px] text-center">{char}</span>)}\n                            </span>\n                          </span>\n                        );\n                      })()}\n                    </div>`;
  source = replaceRequired(source, submittedBefore, submittedAfter, "Submitted fixed datetime");

  const reviewedBefore = `<div className={"font-extrabold " + (selectedRequest.status === "Approved" ? "text-emerald-700" : selectedRequest.status === "Rejected" ? "text-rose-700" : selectedRequest.status === "Reset" ? "text-sky-700" : "text-slate-400")}><span className="inline-block min-w-[176px] whitespace-nowrap text-left text-[14px] leading-5 tabular-nums tracking-[0.01em]" style={{ fontVariantNumeric: "tabular-nums", fontFeatureSettings: '\"tnum\" 1' }}>{formatDateTime(selectedRequest.reviewedAt)}</span></div>`;
  const reviewedAfter = `<div className={"font-extrabold " + (selectedRequest.status === "Approved" ? "text-emerald-700" : selectedRequest.status === "Rejected" ? "text-rose-700" : selectedRequest.status === "Reset" ? "text-sky-700" : "text-slate-400")}>\n                      {(() => {\n                        const { datePart, timePart } = appealReviewFixedDateTimeParts(selectedRequest.reviewedAt);\n                        return (\n                          <span className="inline-grid grid-cols-[80px_64px] items-center gap-2 whitespace-nowrap text-left text-[14px] leading-5">\n                            <span className="inline-flex">\n                              {datePart.split("").map((char, index) => <span key={"reviewed-date-" + index} className="inline-block w-[8px] text-center">{char}</span>)}\n                            </span>\n                            <span className="inline-flex">\n                              {timePart.split("").map((char, index) => <span key={"reviewed-time-" + index} className="inline-block w-[8px] text-center">{char}</span>)}\n                            </span>\n                          </span>\n                        );\n                      })()}\n                    </div>`;
  source = replaceRequired(source, reviewedBefore, reviewedAfter, "Reviewed fixed datetime");

  fs.writeFileSync(reviewPath, source, "utf8");
}

patchAppealReview();
await import("./patch-bulk-weekly-summary-v29b.mjs");
await import("./patch-weekly-summary-body-font-v30.mjs");
await import("./patch-selected-case-appeal-countdown-v64.mjs");
await import("./patch-process-library-v65.mjs");
await import("./patch-process-reference-ux-v67.mjs");
console.log("Appeal Review v63 applied: Submitted and Reviewed date/time use fixed-width character cells so every digit and separator aligns exactly while keeping Kanit.");
