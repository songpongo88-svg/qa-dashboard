import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reviewPath = path.join(root, "src", "AppealRequestsMockup.tsx");
const marker = "appeal-review-reviewed-time-caseid-v60";

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Appeal Review v60: ${label} anchor not found.`);
  }
  return source.replace(before, after);
}

function patchAppealReview() {
  let source = fs.readFileSync(reviewPath, "utf8");
  if (source.includes(`// ${marker}`)) return;

  // Keep multiple Case IDs visible on separate lines instead of truncating with an ellipsis.
  const helperAnchor = `function appealReviewTopicLine(topic: AppealTopic, index: number) {`;
  const helper = `function splitAppealReviewCaseIds(value: unknown) {\n  const raw = String(value || "").trim();\n  if (!raw) return ["-"];\n  const parts = raw.split(/\\s*,\\s*|\\n+/g).map((item) => item.trim()).filter(Boolean);\n  return parts.length ? parts : [raw];\n}\n\n// ${marker}\n\n`;
  source = replaceRequired(source, helperAnchor, helper + helperAnchor, "Case ID helper");

  // Add Reviewed Date & Time in Information directly after Submitted Date & Time.
  const infoSubmitted = `<div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Submitted Date & Time</div><div className="font-semibold text-slate-900">{formatDateTime(selectedRequest.submittedAt)}</div></div>`;
  source = replaceRequired(
    source,
    infoSubmitted,
    `${infoSubmitted}\n                  <div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Reviewed Date & Time</div><div className="font-semibold text-slate-900">{formatDateTime(selectedRequest.reviewedAt)}</div></div>`,
    "Information Reviewed Date & Time"
  );

  // Rebalance the table to fit Submitted + Reviewed at 100% zoom without horizontal scroll.
  source = replaceRequired(
    source,
    `<colgroup>\n                    <col className="w-[13%]" />\n                    <col className="w-[23%]" />\n                    <col className="w-[12%]" />\n                    <col className="w-[19%]" />\n                    <col className="w-[11%]" />\n                    <col className="w-[9%]" />\n                    <col className="w-[6%]" />\n                    <col className="w-[7%]" />\n                  </colgroup>`,
    `<colgroup>\n                    <col className="w-[13%]" />\n                    <col className="w-[20%]" />\n                    <col className="w-[11%]" />\n                    <col className="w-[15%]" />\n                    <col className="w-[15%]" />\n                    <col className="w-[9%]" />\n                    <col className="w-[7%]" />\n                    <col className="w-[5%]" />\n                    <col className="w-[5%]" />\n                  </colgroup>`,
    "table widths"
  );

  const submittedHeader = `<th className="px-2 py-3 text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Submitted</th>`;
  source = replaceRequired(
    source,
    submittedHeader,
    `${submittedHeader}\n                      <th className="px-2 py-3 text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Reviewed</th>`,
    "Reviewed table header"
  );

  source = source.replace(`colSpan={8}`, `colSpan={9}`);

  const submittedCell = `<td className="whitespace-nowrap px-2 py-3 text-[10px] text-slate-600">{formatDateTime(item.submittedAt)}</td>`;
  source = replaceRequired(
    source,
    submittedCell,
    `${submittedCell}\n                        <td className="whitespace-nowrap px-2 py-3 text-[9px] text-slate-600">{formatDateTime(item.reviewedAt)}</td>`,
    "Reviewed table value"
  );

  const caseIdCell = `<td className="whitespace-nowrap px-2 py-3 text-[11px] font-extrabold text-slate-950">\n                          <button\n                            type="button"\n                            title="Open Appeal Review workspace tab"\n                            onClick={(event) => {\n                              event.stopPropagation();\n                              onOpenRequestWorkspace?.(item.requestId, item.caseId);\n                            }}\n                            className="inline-flex max-w-full items-center gap-1 truncate font-extrabold text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"\n                          >\n                            <span className="truncate">{item.caseId}</span>\n                            <span aria-hidden="true" className="shrink-0 text-[10px]">↗</span>\n                          </button>\n                        </td>`;
  const caseIdReplacement = `<td className="px-2 py-3 text-[11px] font-extrabold text-slate-950">\n                          <button\n                            type="button"\n                            title="Open Appeal Review workspace tab"\n                            onClick={(event) => {\n                              event.stopPropagation();\n                              onOpenRequestWorkspace?.(item.requestId, item.caseId);\n                            }}\n                            className="inline-flex max-w-full items-start gap-1 text-left font-extrabold text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"\n                          >\n                            <span className="min-w-0 leading-4">\n                              {splitAppealReviewCaseIds(item.caseId).map((caseIdPart, index) => (\n                                <span key={caseIdPart + index} className="block whitespace-nowrap">{caseIdPart}</span>\n                              ))}\n                            </span>\n                            <span aria-hidden="true" className="mt-0.5 shrink-0 text-[10px]">↗</span>\n                          </button>\n                        </td>`;
  source = replaceRequired(source, caseIdCell, caseIdReplacement, "multi-line Case ID");

  fs.writeFileSync(reviewPath, source, "utf8");
}

patchAppealReview();
console.log("Appeal Review v60 applied: Reviewed Date & Time is visible in Information and the case table, and multiple Case IDs wrap onto separate lines without ellipsis.");
