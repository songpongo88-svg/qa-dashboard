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
    `      10,\n      hasAppealUpdate ? 20 : 14\n    );\n    addPageIfNeeded(secondSelectionRowH);\n    label(0, y, 1, secondSelectionRowH, "Audit Date");\n    value(1, y, 1, secondSelectionRowH, auditText, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 2, size: 6.4 });`,
    `      auditLastUpdatedText ? 14 : 10,\n      hasAppealUpdate ? 20 : (auditLastUpdatedText ? 16 : 14)\n    );\n    addPageIfNeeded(secondSelectionRowH);\n    label(0, y, 1, secondSelectionRowH, auditLabelText);\n    value(1, y, 1, secondSelectionRowH, auditValueText, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: auditLastUpdatedText ? 2 : 1, size: 6.2 });`,
    "Audit Date label and value cells",
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

  // Selected Case: keep Appeal as-is. Put Last Updated inside the existing Audit Date card.
  const auditCard = `<div className="rounded-xl border border-slate-300 bg-white p-3"><div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Audit Date</div><div className="mt-1 text-xs font-bold text-slate-900">{activeSelectedCase.evaluationAuditDate || formatAuditDateForDisplay(activeSelectedCase.auditTimestamp) || "-"}</div></div>`;
  const auditCardWithLastUpdated = `<div className="rounded-xl border border-slate-300 bg-white p-3">\n                                  <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Audit Date</div>\n                                  <div className="mt-1 text-xs font-bold text-slate-900">{activeSelectedCase.evaluationAuditDate || formatAuditDateForDisplay(activeSelectedCase.auditTimestamp) || "-"}</div>\n                                  {activeSelectedCase.lastUpdatedAt ? (\n                                    <div className="mt-2 border-t border-slate-100 pt-2">\n                                      <div className="text-[9px] font-bold uppercase tracking-wide text-rose-600">Last Updated</div>\n                                      <div className="mt-1 text-xs font-bold tabular-nums text-rose-600">{activeSelectedCase.lastUpdatedAt}</div>\n                                    </div>\n                                  ) : null}\n                                </div>`;
  source = replaceOnce(
    source,
    auditCard,
    auditCardWithLastUpdated,
    "Selected Case Audit Date card",
    file,
  );

  // Guard against the previous layout: Last Updated must not be appended to Appeal text.
  if (source.includes("lastUpdatedNodeV89")) {
    throw new Error(`${PATCH}: Last Updated is still attached to Selected Case Appeal text`);
  }

  fs.writeFileSync(file, source, "utf8");
  console.log(`${PATCH}: Selected Case Last Updated moved into Audit Date card; Appeal text unchanged`);
}

patchPdf();
patchDashboard();
console.log(`${PATCH}: complete`);
