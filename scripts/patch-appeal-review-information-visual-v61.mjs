import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reviewPath = path.join(root, "src", "AppealRequestsMockup.tsx");
const marker = "appeal-review-information-visual-v61";

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Appeal Review v61: ${label} anchor not found.`);
  }
  return source.replace(before, after);
}

function patchAppealReview() {
  let source = fs.readFileSync(reviewPath, "utf8");
  if (source.includes(`// ${marker}`)) return;

  source = replaceRequired(
    source,
    `<section className="min-h-[520px] min-w-0" data-appeal-review-information="appeal-review-information-plain-v57">`,
    `<section className="min-h-[520px] min-w-0" data-appeal-review-information="appeal-review-information-plain-v57">\n                {/* // ${marker} */}`,
    "Information marker"
  );

  const replacements = [
    [
      `<div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Case ID</div><div className="font-semibold text-slate-900">{selectedRequest.caseId || "-"}</div></div>`,
      `<div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Case ID</div><div className="font-extrabold text-violet-700">{selectedRequest.caseId || "-"}</div></div>`,
      "Case ID emphasis",
    ],
    [
      `<div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Agent</div><div className="font-semibold text-slate-900">{selectedRequest.agent || "-"}</div></div>`,
      `<div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Agent</div><div className="font-semibold text-slate-950">{selectedRequest.agent || "-"}</div></div>`,
      "Agent emphasis",
    ],
    [
      `<div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Team</div><div className="font-semibold text-slate-900">{selectedAgentTeam.teamName || "-"}</div></div>`,
      `<div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Team</div><div className="font-semibold text-slate-800">{selectedAgentTeam.teamName || "-"}</div></div>`,
      "Team emphasis",
    ],
    [
      `<div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Case Date</div><div className="font-semibold text-slate-900">{selectedRequest.auditDate || "-"}</div></div>`,
      `<div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Case Date</div><div className="font-extrabold tabular-nums text-sky-700">{selectedRequest.auditDate || "-"}</div></div>`,
      "Case Date emphasis",
    ],
    [
      `<div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Audit Date</div><div className="font-semibold text-slate-900">{selectedRequest.auditTimestamp || selectedRequest.auditDate || "-"}</div></div>`,
      `<div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Audit Date</div><div className="font-extrabold tabular-nums text-sky-700">{selectedRequest.auditTimestamp || selectedRequest.auditDate || "-"}</div></div>`,
      "Audit Date emphasis",
    ],
    [
      `<div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Submitted By</div><div className="font-semibold text-slate-900">{selectedRequest.submittedByUsername || selectedRequest.submittedBy || "-"}</div></div>`,
      `<div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Submitted By</div><div className="font-semibold text-violet-700">{selectedRequest.submittedByUsername || selectedRequest.submittedBy || "-"}</div></div>`,
      "Submitted By emphasis",
    ],
    [
      `<div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Submitted Date & Time</div><div className="font-semibold text-slate-900">{formatDateTime(selectedRequest.submittedAt)}</div></div>`,
      `<div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Submitted Date & Time</div><div className="font-extrabold tabular-nums text-violet-700">{formatDateTime(selectedRequest.submittedAt)}</div></div>`,
      "Submitted datetime emphasis",
    ],
    [
      `<div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Reviewed Date & Time</div><div className="font-semibold text-slate-900">{formatDateTime(selectedRequest.reviewedAt)}</div></div>`,
      `<div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Reviewed Date & Time</div><div className={"font-extrabold tabular-nums " + (selectedRequest.status === "Approved" ? "text-emerald-700" : selectedRequest.status === "Rejected" ? "text-rose-700" : selectedRequest.status === "Reset" ? "text-sky-700" : "text-slate-400")}>{formatDateTime(selectedRequest.reviewedAt)}</div></div>`,
      "Reviewed datetime emphasis",
    ],
    [
      `<div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Intent</div><div className="min-w-0 font-semibold leading-6 text-slate-900">{selectedRequest.inquiry || "-"}</div></div>`,
      `<div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Intent</div><div className="min-w-0 font-semibold leading-6 text-slate-950">{selectedRequest.inquiry || "-"}</div></div>`,
      "Intent emphasis",
    ],
    [
      `<div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Original Score</div><div className="font-semibold text-slate-900">{selectedRequest.finalScore.toFixed(2)}</div></div>`,
      `<div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Original Score</div><div className="font-extrabold tabular-nums text-slate-600">{selectedRequest.finalScore.toFixed(2)}</div></div>`,
      "Original Score emphasis",
    ],
    [
      `<div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Current Score</div><div className="font-semibold text-slate-900">{selectedCurrentScore.toFixed(2)}</div></div>`,
      `<div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Current Score</div><div className={"font-extrabold tabular-nums " + (selectedCurrentScore >= 85 ? "text-emerald-700" : "text-rose-700")}>{selectedCurrentScore.toFixed(2)}</div></div>`,
      "Current Score emphasis",
    ],
    [
      `<div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Current Grade</div><div className="font-semibold text-slate-900">{selectedCurrentGrade || "-"}</div></div>`,
      `<div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Current Grade</div><div className={"font-extrabold " + (selectedCurrentGrade === "A" ? "text-emerald-700" : selectedCurrentGrade === "B" ? "text-sky-700" : selectedCurrentGrade === "C" ? "text-amber-700" : selectedCurrentGrade === "D" ? "text-orange-700" : selectedCurrentGrade === "F" ? "text-rose-700" : "text-slate-700")}>{selectedCurrentGrade || "-"}</div></div>`,
      "Current Grade emphasis",
    ],
  ];

  replacements.forEach(([before, after, label]) => {
    source = replaceRequired(source, before, after, label);
  });

  // Tabular numerals keep equal-length date/time strings visually aligned while preserving Kanit.
  source = source.replace(
    `<td className="whitespace-nowrap px-2 py-3 text-[10px] text-slate-600">{formatDateTime(item.submittedAt)}</td>`,
    `<td className="whitespace-nowrap px-2 py-3 text-[10px] tabular-nums text-slate-600">{formatDateTime(item.submittedAt)}</td>`
  );
  source = source.replace(
    `<td className="whitespace-nowrap px-2 py-3 text-[9px] text-slate-600">{formatDateTime(item.reviewedAt)}</td>`,
    `<td className="whitespace-nowrap px-2 py-3 text-[9px] tabular-nums text-slate-600">{formatDateTime(item.reviewedAt)}</td>`
  );

  // Give Topics more breathing room from the right-side scrollbar/edge.
  source = replaceRequired(
    source,
    `<colgroup>\n                    <col className="w-[13%]" />\n                    <col className="w-[20%]" />\n                    <col className="w-[11%]" />\n                    <col className="w-[15%]" />\n                    <col className="w-[15%]" />\n                    <col className="w-[9%]" />\n                    <col className="w-[7%]" />\n                    <col className="w-[5%]" />\n                    <col className="w-[5%]" />\n                  </colgroup>`,
    `<colgroup>\n                    <col className="w-[13%]" />\n                    <col className="w-[19%]" />\n                    <col className="w-[11%]" />\n                    <col className="w-[14%]" />\n                    <col className="w-[14%]" />\n                    <col className="w-[9%]" />\n                    <col className="w-[7%]" />\n                    <col className="w-[5%]" />\n                    <col className="w-[8%]" />\n                  </colgroup>`,
    "Topics column width"
  );
  source = replaceRequired(
    source,
    `<th className="px-2 py-3 text-center text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Topics</th>`,
    `<th className="py-3 pl-3 pr-5 text-center text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Topics</th>`,
    "Topics header spacing"
  );
  source = replaceRequired(
    source,
    `<td className="px-2 py-3 text-center text-[10px] font-bold text-slate-700">{item.topics.filter(isAppealedTopic).length}</td>`,
    `<td className="py-3 pl-3 pr-5 text-center text-[10px] font-bold text-slate-700">{item.topics.filter(isAppealedTopic).length}</td>`,
    "Topics value spacing"
  );

  fs.writeFileSync(reviewPath, source, "utf8");
}

patchAppealReview();
console.log("Appeal Review v61 applied: Information values use visual emphasis, date/time uses tabular numerals, and Topics has more right-side spacing.");
