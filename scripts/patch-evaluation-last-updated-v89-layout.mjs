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

  // Remove the standalone Last Updated row added by v87. Last Updated belongs
  // inside the Audit Date value cell so it cannot be rendered twice.
  const standaloneRow = `\n    const lastUpdatedText = safeText(caseItem.lastUpdatedAt, "");\n    if (lastUpdatedText) {\n      addPageIfNeeded(8);\n      label(0, y, 1, 8, "Last Updated");\n      value(1, y, 7, 8, lastUpdatedText, LIGHT_PURPLE, { align: "left", valign: "middle", maxLines: 2, size: 6.4 });\n      y += 8;\n    }\n`;
  if (source.includes(standaloneRow)) {
    source = source.replace(standaloneRow, "\n");
  }

  source = replaceOnce(
    source,
    `    const auditText = caseItem.auditTimestamp || caseItem.auditDate;\n    const caseDateText = caseItem.caseDate || caseItem.createdAt || caseItem.caseCreatedAt || caseItem.auditDate || caseItem.auditTimestamp || "-";`,
    `    const auditText = caseItem.auditTimestamp || caseItem.auditDate;\n    const auditLastUpdatedText = safeText(caseItem.lastUpdatedAt, "");\n    const auditDisplayText = auditLastUpdatedText\n      ? \`${"${auditText}"}\\nLast Updated: ${"${auditLastUpdatedText}"}\`\n      : auditText;\n    const caseDateText = caseItem.caseDate || caseItem.createdAt || caseItem.caseCreatedAt || caseItem.auditDate || caseItem.auditTimestamp || "-";`,
    "Original Audit Date display source",
    file,
  );

  source = replaceOnce(
    source,
    `{ value: auditText, w: wOf(1), size: 6.4, padY: 4 },`,
    `{ value: auditDisplayText, w: wOf(1), size: 6.4, padY: 5 },`,
    "Original Audit Date row height",
    file,
  );

  source = replaceOnce(
    source,
    `value(1, y, 1, secondSelectionRowH, auditText, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 2, size: 6.4 });`,
    `value(1, y, 1, secondSelectionRowH, auditDisplayText, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 3, size: 6.4 });`,
    "Original Audit Date cell",
    file,
  );

  // Keep the Appeal/Revised PDF consistent if it is generated from the same renderer.
  source = replaceOnce(
    source,
    `    const appealAuditText = caseItem.auditTimestamp || caseItem.auditDate;\n    const appealSecondRowH = autoRowHeight(`,
    `    const appealAuditText = caseItem.auditTimestamp || caseItem.auditDate;\n    const appealLastUpdatedText = safeText(caseItem.lastUpdatedAt, "");\n    const appealAuditDisplayText = appealLastUpdatedText\n      ? \`${"${appealAuditText}"}\\nLast Updated: ${"${appealLastUpdatedText}"}\`\n      : appealAuditText;\n    const appealSecondRowH = autoRowHeight(`,
    "Appeal Audit Date display source",
    file,
  );

  source = replaceOnce(
    source,
    `{ value: appealAuditText, w: wOf(1), size: 6.4, padY: 4 },`,
    `{ value: appealAuditDisplayText, w: wOf(1), size: 6.4, padY: 5 },`,
    "Appeal Audit Date row height",
    file,
  );

  source = replaceOnce(
    source,
    `value(1, y, 1, appealSecondRowH, appealAuditText, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 3, size: 6.4 });`,
    `value(1, y, 1, appealSecondRowH, appealAuditDisplayText, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 3, size: 6.4 });`,
    "Appeal Audit Date cell",
    file,
  );

  // Duplicate guard: no standalone Last Updated label row is allowed in this PDF.
  const duplicateRowPattern = /label\(0, y, 1, 8, "Last Updated"\)/g;
  const duplicateCount = (source.match(duplicateRowPattern) || []).length;
  if (duplicateCount > 0) {
    throw new Error(`${PATCH}: found ${duplicateCount} standalone Last Updated PDF row(s)`);
  }

  fs.writeFileSync(file, source, "utf8");
  console.log(`${PATCH}: merged Last Updated into Audit Date PDF cell; duplicate rows=${duplicateCount}`);
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

  // Selected Case: keep the current Appeal text/countdown and append plain red
  // Last Updated text only for edited cases.
  const componentStart = `function SelectedCaseAppealCountdownV64({ caseItem }: { caseItem: CaseItem }) {\n  const [nowMs, setNowMs] = useState(() => Date.now());\n  const deadline = getAppealDeadline(caseItem.auditDateObj);`;
  const componentStartNext = `function SelectedCaseAppealCountdownV64({ caseItem }: { caseItem: CaseItem }) {\n  const [nowMs, setNowMs] = useState(() => Date.now());\n  const deadline = getAppealDeadline(caseItem.auditDateObj);\n  const lastUpdatedTextV89 = caseItem.lastUpdatedAt\n    ? String(caseItem.lastUpdatedAt).replace(/,\\s*/, " ").trim()\n    : "";\n  const lastUpdatedNodeV89 = lastUpdatedTextV89 ? (\n    <span className="ml-1 font-extrabold text-rose-600">· Last Updated {lastUpdatedTextV89}</span>\n  ) : null;`;
  source = replaceOnce(
    source,
    componentStart,
    componentStartNext,
    "Selected Case appeal helper",
    file,
  );

  const returns = [
    [
      `return <div className="mt-1 text-[11px] font-extrabold text-sky-600">Appeal · ใช้งานแล้ว</div>;`,
      `return <div className="mt-1 text-[11px] font-extrabold text-sky-600">Appeal · ใช้งานแล้ว{lastUpdatedNodeV89}</div>;`,
    ],
    [
      `return <div className="mt-1 text-[11px] font-bold text-slate-400">Appeal · ไม่พบกำหนดเวลา</div>;`,
      `return <div className="mt-1 text-[11px] font-bold text-slate-400">Appeal · ไม่พบกำหนดเวลา{lastUpdatedNodeV89}</div>;`,
    ],
    [
      `return <div className="mt-1 text-[11px] font-extrabold text-slate-500">Appeal · หมดเวลาอุทธรณ์</div>;`,
      `return <div className="mt-1 text-[11px] font-extrabold text-slate-500">Appeal · หมดเวลาอุทธรณ์{lastUpdatedNodeV89}</div>;`,
    ],
    [
      `return <div className={\`mt-1 text-[11px] font-extrabold tabular-nums \${tone}\`}>Appeal · {text}</div>;`,
      `return <div className={\`mt-1 text-[11px] font-extrabold tabular-nums \${tone}\`}>Appeal · {text}{lastUpdatedNodeV89}</div>;`,
    ],
  ];
  for (const [before, after] of returns) {
    source = replaceOnce(source, before, after, "Selected Case Last Updated return", file);
  }

  fs.writeFileSync(file, source, "utf8");
  console.log(`${PATCH}: normalized timestamps and appended Selected Case Last Updated text`);
}

patchPdf();
patchDashboard();
console.log(`${PATCH}: complete`);
