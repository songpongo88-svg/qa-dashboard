import fs from "node:fs";

const PATCH = "evaluation-last-updated-v89-layout";

function replaceOnce(source, before, after, label, file) {
  if (!source.includes(before)) {
    throw new Error(`${PATCH}: missing ${label} in ${file}`);
  }
  return source.replace(before, after);
}

function patchPdf() {
  const file = "src/caseDetailOfficialPdf.ts";
  let source = fs.readFileSync(file, "utf8");
  if (source.includes(`// ${PATCH}-pdf`)) {
    console.log(`${PATCH}: PDF already patched`);
    return;
  }

  const markerAnchor = "// evaluation-last-updated-v87-pdf\n";
  if (!source.includes(markerAnchor)) {
    throw new Error(`${PATCH}: PDF v87 marker not found`);
  }
  source = source.replace(markerAnchor, `${markerAnchor}// ${PATCH}-pdf\n`);

  // v87 adds Last Updated as a full-width row. Remove that row and place both
  // timestamps in the existing Audit Date label/value pair instead.
  const standaloneRow = `\n    const lastUpdatedText = safeText(caseItem.lastUpdatedAt, "");\n    if (lastUpdatedText) {\n      addPageIfNeeded(8);\n      label(0, y, 1, 8, "Last Updated");\n      value(1, y, 7, 8, lastUpdatedText, LIGHT_PURPLE, { align: "left", valign: "middle", maxLines: 2, size: 6.4 });\n      y += 8;\n    }\n`;
  if (!source.includes(standaloneRow)) {
    throw new Error(`${PATCH}: standalone Last Updated PDF row not found`);
  }
  source = source.replace(standaloneRow, "\n");

  source = replaceOnce(
    source,
    `    const auditText = caseItem.auditTimestamp || caseItem.auditDate;\n    const caseDateText = caseItem.caseDate || caseItem.createdAt || caseItem.caseCreatedAt || caseItem.auditDate || caseItem.auditTimestamp || "-";`,
    `    const auditText = caseItem.auditTimestamp || caseItem.auditDate;\n    const auditLastUpdatedText = safeText(caseItem.lastUpdatedAt, "");\n    const auditLabelText = auditLastUpdatedText ? "Audit Date\\nLast Updated" : "Audit Date";\n    const auditValueText = auditLastUpdatedText ? \`${"${auditText}"}\\n${"${auditLastUpdatedText}"}\` : auditText;\n    const caseDateText = caseItem.caseDate || caseItem.createdAt || caseItem.caseCreatedAt || caseItem.auditDate || caseItem.auditTimestamp || "-";`,
    "Audit Date paired display source",
    file,
  );

  source = replaceOnce(
    source,
    `{ value: auditText, w: wOf(1), size: 6.2, padY: 4.4 },`,
    `{ value: auditValueText, w: wOf(1), size: 6.2, padY: auditLastUpdatedText ? 5.2 : 4.4 },`,
    "Audit Date row measurement",
    file,
  );

  source = replaceOnce(
    source,
    `label(0, y, 1, secondSelectionRowH, "Audit Date");`,
    `label(0, y, 1, secondSelectionRowH, auditLabelText);`,
    "Audit Date label cell",
    file,
  );

  source = replaceOnce(
    source,
    `value(1, y, 1, secondSelectionRowH, auditText, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 2, size: 6.4 });`,
    `value(1, y, 1, secondSelectionRowH, auditValueText, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: auditLastUpdatedText ? 2 : 1, size: 6.2 });`,
    "Audit Date value cell",
    file,
  );

  // Keep a legacy Appeal/Revised header consistent when those anchors still exist.
  const appealSourceAnchor = `    const appealAuditText = caseItem.auditTimestamp || caseItem.auditDate;\n    const appealSecondRowH = autoRowHeight(`;
  if (source.includes(appealSourceAnchor)) {
    source = source.replace(
      appealSourceAnchor,
      `    const appealAuditText = caseItem.auditTimestamp || caseItem.auditDate;\n    const appealLastUpdatedText = safeText(caseItem.lastUpdatedAt, "");\n    const appealAuditLabelText = appealLastUpdatedText ? "Audit Date\\nLast Updated" : "Audit Date";\n    const appealAuditValueText = appealLastUpdatedText ? \`${"${appealAuditText}"}\\n${"${appealLastUpdatedText}"}\` : appealAuditText;\n    const appealSecondRowH = autoRowHeight(`
    );
    source = source.replace(
      `{ value: appealAuditText, w: wOf(1), size: 6.4, padY: 4 },`,
      `{ value: appealAuditValueText, w: wOf(1), size: 6.4, padY: appealLastUpdatedText ? 5 : 4 },`
    );
    source = source.replace(
      `label(0, y, 1, appealSecondRowH, "Audit Date");`,
      `label(0, y, 1, appealSecondRowH, appealAuditLabelText);`
    );
    source = source.replace(
      `value(1, y, 1, appealSecondRowH, appealAuditText, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 3, size: 6.4 });`,
      `value(1, y, 1, appealSecondRowH, appealAuditValueText, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: appealLastUpdatedText ? 2 : 1, size: 6.4 });`
    );
  }

  const duplicateRowPattern = /label\(0, y, 1, 8, "Last Updated"\)/g;
  const duplicateCount = (source.match(duplicateRowPattern) || []).length;
  if (duplicateCount > 0) {
    throw new Error(`${PATCH}: found ${duplicateCount} standalone Last Updated PDF row(s)`);
  }

  fs.writeFileSync(file, source, "utf8");
  console.log(`${PATCH}: PDF Audit Date now shows Audit Date/Last Updated as two aligned lines in one field; duplicate rows=${duplicateCount}`);
}

function patchDashboard() {
  const file = "src/DashboardMockup.tsx";
  let source = fs.readFileSync(file, "utf8");
  if (source.includes(`// ${PATCH}-dashboard`)) {
    console.log(`${PATCH}: Dashboard already patched`);
    return;
  }

  const markerAnchor = "// evaluation-last-updated-v87-dashboard\n";
  if (!source.includes(markerAnchor)) {
    throw new Error(`${PATCH}: Dashboard v87 marker not found`);
  }
  source = source.replace(markerAnchor, `${markerAnchor}// ${PATCH}-dashboard\n`);

  // Case Detail Timeline: exact DD/MM/YYYY HH:mm:ss with no comma.
  const oldTimestampMapping = `        auditTimestamp: originalAuditTimestamp\n          ? formatBangkokDateTime(originalAuditTimestamp)\n          : record.auditTimestamp || formatBangkokDateTime(record.submittedAt),\n        lastUpdatedAt: lastUpdatedAt ? formatBangkokDateTime(lastUpdatedAt) : "",`;
  const newTimestampMapping = `        auditTimestamp: formatAuditTimestamp(\n          originalAuditTimestamp || record.auditTimestamp || record.submittedAt || record.auditDate\n        ),\n        lastUpdatedAt: lastUpdatedAt ? formatAuditTimestamp(lastUpdatedAt) : "",`;
  source = replaceOnce(
    source,
    oldTimestampMapping,
    newTimestampMapping,
    "Case Detail Audit/Last Updated timestamp mapping",
    file,
  );

  // Selected Case: keep Appeal unchanged and keep Last Updated inside Audit Date.
  // The compact third line is intentionally small so the Audit Date card remains
  // the same visual height as the adjacent Case Date card.
  const auditCardPattern = /<div className="rounded-xl border border-slate-300 bg-white p-3"><div className="text-\[9px\] font-bold uppercase tracking-wide text-slate-500">Audit Date<\/div><div className="mt-1 text-xs font-bold text-slate-900">([\s\S]*?)<\/div><\/div>/;
  const auditCardMatch = source.match(auditCardPattern);
  if (!auditCardMatch || !auditCardMatch[0].includes("activeSelectedCase")) {
    throw new Error(`${PATCH}: Selected Case Audit Date card not found`);
  }
  const currentAuditValue = auditCardMatch[1];
  const compactAuditCard = `<div className="rounded-xl border border-slate-300 bg-white px-3 py-2">\n                                  <div className="text-[8px] font-bold uppercase tracking-wide leading-none text-slate-500">Audit Date</div>\n                                  <div className="mt-1 text-[11px] font-bold tabular-nums leading-none text-slate-900">${currentAuditValue}</div>\n                                  {activeSelectedCase.lastUpdatedAt ? (\n                                    <div className="mt-1 flex items-baseline gap-1.5 whitespace-nowrap leading-none">\n                                      <span className="text-[7px] font-bold uppercase tracking-wide text-rose-600">Last Updated</span>\n                                      <span className="text-[9px] font-bold tabular-nums text-rose-600">{activeSelectedCase.lastUpdatedAt}</span>\n                                    </div>\n                                  ) : null}\n                                </div>`;
  source = source.replace(auditCardPattern, compactAuditCard);

  // Guard against the previous layouts: Last Updated must not be appended to Appeal
  // and must not render as a separate Selected Case card.
  if (source.includes("lastUpdatedNodeV89")) {
    throw new Error(`${PATCH}: Last Updated is still attached to Selected Case Appeal text`);
  }
  if (source.includes('className="col-start-2 rounded-xl border border-slate-300 bg-white p-3"')) {
    throw new Error(`${PATCH}: Last Updated is still rendered as a separate Selected Case card`);
  }

  fs.writeFileSync(file, source, "utf8");
  console.log(`${PATCH}: Selected Case Last Updated compacted inside Audit Date card; PDF unchanged`);
}

patchPdf();
patchDashboard();
console.log(`${PATCH}: complete`);
