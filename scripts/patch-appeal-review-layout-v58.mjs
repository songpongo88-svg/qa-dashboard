import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reviewPath = path.join(root, "src", "AppealRequestsMockup.tsx");
const marker = "appeal-review-layout-v58";

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Appeal Review v58: ${label} anchor not found.`);
  }
  return source.replace(before, after);
}

function patchAppealReviewLayout() {
  let source = fs.readFileSync(reviewPath, "utf8");
  if (source.includes(`// ${marker}`)) return;

  // In a standalone request tab, hide the case list and use the full width for the working detail.
  source = replaceRequired(
    source,
    `        <div className="grid min-h-[640px] gap-0 xl:grid-cols-[minmax(0,1.42fr)_minmax(520px,0.98fr)]">\n          <div className="min-w-0 border-r border-violet-100 p-5">`,
    `        <div\n          className={standaloneRequestId\n            ? "grid min-h-[640px] grid-cols-1 gap-0"\n            : "grid min-h-[640px] gap-0 xl:grid-cols-[minmax(0,1.42fr)_minmax(520px,0.98fr)]"\n          }\n          data-appeal-review-layout="${marker}"\n        >\n          <div className={standaloneRequestId ? "hidden" : "min-w-0 border-r border-violet-100 p-5"}>`,
    "workspace grid"
  );

  const gridMarkerIndex = source.indexOf(`data-appeal-review-layout="${marker}"`);
  const rightPanelAnchor = `\n\n          <div className="p-5">`;
  const rightPanelIndex = source.indexOf(rightPanelAnchor, gridMarkerIndex);
  if (rightPanelIndex < 0) {
    throw new Error("Appeal Review v58: right panel anchor not found.");
  }
  source =
    source.slice(0, rightPanelIndex) +
    `\n\n          <div className={standaloneRequestId ? "p-5" : "p-5 xl:pt-[210px]"}>` +
    source.slice(rightPanelIndex + rightPanelAnchor.length);

  // Keep the list visible at 100% zoom without a horizontal scrollbar.
  source = replaceRequired(
    source,
    `<div className="max-h-[650px] overflow-auto">\n                <table className="w-full min-w-[1040px] border-collapse text-left">`,
    `<div className="max-h-[650px] overflow-y-auto overflow-x-hidden">\n                <table className="w-full table-fixed border-collapse text-left">\n                  <colgroup>\n                    <col className="w-[13%]" />\n                    <col className="w-[23%]" />\n                    <col className="w-[12%]" />\n                    <col className="w-[19%]" />\n                    <col className="w-[11%]" />\n                    <col className="w-[9%]" />\n                    <col className="w-[6%]" />\n                    <col className="w-[7%]" />\n                  </colgroup>`,
    "fixed-width table"
  );

  const tableStart = source.indexOf(`<table className="w-full table-fixed border-collapse text-left">`);
  const tableEnd = source.indexOf(`</table>`, tableStart);
  if (tableStart < 0 || tableEnd < 0) {
    throw new Error("Appeal Review v58: table bounds not found.");
  }

  let table = source.slice(tableStart, tableEnd + `</table>`.length);

  table = table.replace(
    `                      <th className="px-3 py-3 text-center text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Action</th>\n`,
    ``
  );
  table = table.replace(`colSpan={9}`, `colSpan={8}`);

  table = replaceRequired(
    table,
    `<td className="whitespace-nowrap px-3 py-3 text-xs font-extrabold text-slate-950">{item.caseId}</td>`,
    `<td className="whitespace-nowrap px-2 py-3 text-[11px] font-extrabold text-slate-950">\n                          <button\n                            type="button"\n                            title="Open Appeal Review in new tab"\n                            onClick={(event) => {\n                              event.stopPropagation();\n                              openAppealReviewTab(item);\n                            }}\n                            className="inline-flex max-w-full items-center gap-1 truncate font-extrabold text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"\n                          >\n                            <span className="truncate">{item.caseId}</span>\n                            <span aria-hidden="true" className="shrink-0 text-[10px]">↗</span>\n                          </button>\n                        </td>`,
    "clickable Case ID"
  );

  table = table.replace(
    `<td className="min-w-[150px] px-3 py-3 text-xs font-semibold text-slate-800">{item.agent || "-"}</td>`,
    `<td title={item.agent || "-"} className="truncate px-2 py-3 text-[11px] font-semibold text-slate-800">{item.agent || "-"}</td>`
  );
  table = table.replace(
    `<td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">{item.auditDate || "-"}</td>`,
    `<td className="whitespace-nowrap px-2 py-3 text-[10px] text-slate-600">{item.auditDate || "-"}</td>`
  );
  table = table.replace(
    `<td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">{formatDateTime(item.submittedAt)}</td>`,
    `<td className="whitespace-nowrap px-2 py-3 text-[10px] text-slate-600">{formatDateTime(item.submittedAt)}</td>`
  );
  table = table.replace(
    `<td className="px-3 py-3"><span className={"inline-flex rounded-full border px-2.5 py-1 text-[10px] font-extrabold " + appealReviewStatusTone(item.status)}>{item.status}</span></td>`,
    `<td className="px-2 py-3"><span className={"inline-flex max-w-full rounded-full border px-2 py-1 text-[9px] font-extrabold " + appealReviewStatusTone(item.status)}>{item.status}</span></td>`
  );
  table = table.replace(
    `<td className="px-3 py-3 text-xs font-bold text-slate-800">{item.finalScore.toFixed(2)}</td>`,
    `<td className="px-2 py-3 text-[10px] font-bold text-slate-800">{item.finalScore.toFixed(2)}</td>`
  );
  table = table.replace(
    `<td className="px-3 py-3 text-xs font-extrabold text-violet-800">{item.grade || "-"}</td>`,
    `<td className="px-2 py-3 text-[10px] font-extrabold text-violet-800">{item.grade || "-"}</td>`
  );
  table = table.replace(
    `<td className="px-3 py-3 text-center text-xs font-bold text-slate-700">{item.topics.filter(isAppealedTopic).length}</td>`,
    `<td className="px-2 py-3 text-center text-[10px] font-bold text-slate-700">{item.topics.filter(isAppealedTopic).length}</td>`
  );

  // v55/v56 built an Action button. Remove that entire final cell from each row.
  table = table.replace(
    /\n\s*<td className="px-3 py-3 text-center">\s*<button[\s\S]*?\{item\.status === "Pending" \? "Review Appeal" : "View Detail"\}[\s\S]*?<\/button>\s*<\/td>/g,
    ""
  );

  // Compact table header paddings after removing Action.
  table = table.replaceAll(`className="px-3 py-3 text-[10px]`, `className="px-2 py-3 text-[9px]`);
  table = table.replaceAll(`className="px-3 py-3 text-center text-[10px]`, `className="px-2 py-3 text-center text-[9px]`);

  source = source.slice(0, tableStart) + table + source.slice(tableEnd + `</table>`.length);

  source = source.replace(
    `Select a row for Information • Use Action to open Detail`,
    `Select a row for Information • Click Case ID to open Appeal Review in a new tab`
  );

  fs.writeFileSync(reviewPath, source, "utf8");
}

patchAppealReviewLayout();
console.log("Appeal Review v58 applied: Information aligned with the case table, no horizontal scrollbar, no Action column, and Case ID opens a full-width review tab.");
