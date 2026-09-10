import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reviewPath = path.join(root, "src", "AppealRequestsMockup.tsx");
const marker = "appeal-review-datetime-color-v62";

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Appeal Review v62: ${label} anchor not found.`);
  }
  return source.replace(before, after);
}

function patchAppealReview() {
  let source = fs.readFileSync(reviewPath, "utf8");
  if (source.includes(`// ${marker}`)) return;

  source = replaceRequired(
    source,
    `{/* // appeal-review-information-visual-v61 */}`,
    `{/* // appeal-review-information-visual-v61 */}\n                {/* // ${marker} */}`,
    "v62 marker"
  );

  // Use one exact purple token for Case ID and submission identity/time.
  source = source.replace(
    `<div className="font-extrabold text-violet-700">{selectedRequest.caseId || "-"}</div>`,
    `<div className="font-extrabold text-purple-700">{selectedRequest.caseId || "-"}</div>`
  );
  source = source.replace(
    `<div className="font-semibold text-violet-700">{selectedRequest.submittedByUsername || selectedRequest.submittedBy || "-"}</div>`,
    `<div className="font-semibold text-purple-700">{selectedRequest.submittedByUsername || selectedRequest.submittedBy || "-"}</div>`
  );

  // Submitted and Reviewed timestamps use exactly the same typography and fixed width.
  source = replaceRequired(
    source,
    `<div className="font-extrabold tabular-nums text-violet-700">{formatDateTime(selectedRequest.submittedAt)}</div>`,
    `<div className="font-extrabold text-purple-700"><span className="inline-block min-w-[176px] whitespace-nowrap text-left text-[14px] leading-5 tabular-nums tracking-[0.01em]" style={{ fontVariantNumeric: "tabular-nums", fontFeatureSettings: '\"tnum\" 1' }}>{formatDateTime(selectedRequest.submittedAt)}</span></div>`,
    "Submitted Date & Time typography"
  );
  source = replaceRequired(
    source,
    `<div className={"font-extrabold tabular-nums " + (selectedRequest.status === "Approved" ? "text-emerald-700" : selectedRequest.status === "Rejected" ? "text-rose-700" : selectedRequest.status === "Reset" ? "text-sky-700" : "text-slate-400")}>{formatDateTime(selectedRequest.reviewedAt)}</div>`,
    `<div className={"font-extrabold " + (selectedRequest.status === "Approved" ? "text-emerald-700" : selectedRequest.status === "Rejected" ? "text-rose-700" : selectedRequest.status === "Reset" ? "text-sky-700" : "text-slate-400")}><span className="inline-block min-w-[176px] whitespace-nowrap text-left text-[14px] leading-5 tabular-nums tracking-[0.01em]" style={{ fontVariantNumeric: "tabular-nums", fontFeatureSettings: '\"tnum\" 1' }}>{formatDateTime(selectedRequest.reviewedAt)}</span></div>`,
    "Reviewed Date & Time typography"
  );

  // The list table had Submitted at 10px and Reviewed at 9px. Make them identical.
  source = replaceRequired(
    source,
    `<td className="whitespace-nowrap px-2 py-3 text-[10px] tabular-nums text-slate-600">{formatDateTime(item.submittedAt)}</td>`,
    `<td className="whitespace-nowrap px-2 py-3 text-[10px] tabular-nums text-slate-600" style={{ fontVariantNumeric: "tabular-nums", fontFeatureSettings: '\"tnum\" 1' }}>{formatDateTime(item.submittedAt)}</td>`,
    "Submitted table datetime"
  );
  source = replaceRequired(
    source,
    `<td className="whitespace-nowrap px-2 py-3 text-[9px] tabular-nums text-slate-600">{formatDateTime(item.reviewedAt)}</td>`,
    `<td className="whitespace-nowrap px-2 py-3 text-[10px] tabular-nums text-slate-600" style={{ fontVariantNumeric: "tabular-nums", fontFeatureSettings: '\"tnum\" 1' }}>{formatDateTime(item.reviewedAt)}</td>`,
    "Reviewed table datetime"
  );

  fs.writeFileSync(reviewPath, source, "utf8");
}

patchAppealReview();
console.log("Appeal Review v62 applied: Case ID/submission purple is consistent and Submitted/Reviewed timestamps use identical sizing, width, and tabular numerals.");
