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

  // Keep Audit Date as the original audit timestamp only.
  // The v87 fallback already adds Last Updated as its own row directly below the header row.
  const standaloneRow = `\n    const lastUpdatedText = safeText(caseItem.lastUpdatedAt, "");\n    if (lastUpdatedText) {\n      addPageIfNeeded(8);\n      label(0, y, 1, 8, "Last Updated");\n      value(1, y, 7, 8, lastUpdatedText, LIGHT_PURPLE, { align: "left", valign: "middle", maxLines: 2, size: 6.4 });\n      y += 8;\n    }\n`;
  if (!source.includes(standaloneRow)) {
    throw new Error(`${PATCH}: standalone Last Updated PDF row not found`);
  }

  // Keep Appeal/Revised PDF consistent if the legacy Appeal header is used.
  const appealRowAnchor = `    y += appealSecondRowH;\n\n    const inquiryText = caseItem.inquiryTh || caseItem.inquiryEn || "-";`;
  if (source.includes(appealRowAnchor)) {
    source = source.replace(
      appealRowAnchor,
      `    y += appealSecondRowH;\n\n    const appealLastUpdatedText = safeText(caseItem.lastUpdatedAt, "");\n    if (appealLastUpdatedText) {\n      addPageIfNeeded(8);\n      label(0, y, 1, 8, "Last Updated");\n      value(1, y, 7, 8, appealLastUpdatedText, LIGHT_PURPLE, { align: "left", valign: "middle", maxLines: 2, size: 6.4 });\n      y += 8;\n    }\n\n    const inquiryText = caseItem.inquiryTh || caseItem.inquiryEn || "-";`
    );
  }

  // Safety: Last Updated must not be merged into the Audit Date display value.
  if (source.includes("Last Updated: ${auditLastUpdatedText}")) {
    throw new Error(`${PATCH}: Last Updated is still merged into Audit Date`);
  }

  fs.writeFileSync(file, source, "utf8");
  console.log(`${PATCH}: Last Updated kept as a separate PDF row below Audit Date`);
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

  // Selected Case: Appeal stays on the first line; Last Updated is a separate red line underneath.
  const componentStart = `function SelectedCaseAppealCountdownV64({ caseItem }: { caseItem: CaseItem }) {\n  const [nowMs, setNowMs] = useState(() => Date.now());\n  const deadline = getAppealDeadline(caseItem.auditDateObj);`;
  const componentStartNext = `function SelectedCaseAppealCountdownV64({ caseItem }: { caseItem: CaseItem }) {\n  const [nowMs, setNowMs] = useState(() => Date.now());\n  const deadline = getAppealDeadline(caseItem.auditDateObj);\n  const lastUpdatedTextV89 = caseItem.lastUpdatedAt\n    ? String(caseItem.lastUpdatedAt).replace(/,\\s*/, " ").trim()\n    : "";\n  const lastUpdatedNodeV89 = lastUpdatedTextV89 ? (\n    <span className="block mt-0.5 font-extrabold text-rose-600">Last Updated {lastUpdatedTextV89}</span>\n  ) : null;`;
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
  console.log(`${PATCH}: normalized timestamps and moved Selected Case Last Updated to its own line`);
}

patchPdf();
patchDashboard();
console.log(`${PATCH}: complete`);
