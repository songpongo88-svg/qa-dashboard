import fs from "node:fs";

const PATCH = "evaluation-last-updated-v86";

function replaceOnce(source, from, to, label, file) {
  if (!source.includes(from)) {
    throw new Error(`${PATCH}: missing ${label} in ${file}`);
  }
  return source.replace(from, to);
}

function patchFile(file, marker, transform) {
  let source = fs.readFileSync(file, "utf8");
  if (source.includes(marker)) {
    console.log(`${PATCH}: ${file} already patched`);
    return;
  }
  const next = transform(source);
  if (next === source) throw new Error(`${PATCH}: no changes made to ${file}`);
  fs.writeFileSync(file, next);
  console.log(`${PATCH}: patched ${file}`);
}

patchFile("src/evaluationStore.ts", `// ${PATCH}-store`, (input) => {
  const file = "src/evaluationStore.ts";
  let source = input;

  source = replaceOnce(
    source,
    'export { isTestCaseEvaluation, excludeTestEvaluations } from "./lib/evaluationScope";\n',
    'export { isTestCaseEvaluation, excludeTestEvaluations } from "./lib/evaluationScope";\n// ' + PATCH + '-store\n',
    "store marker",
    file,
  );

  source = replaceOnce(
    source,
    '  updatedAt?: string;\n};',
    '  updatedAt?: string;\n  lastUpdatedAt?: string;\n};',
    "StoredEvaluation lastUpdatedAt field",
    file,
  );

  source = replaceOnce(
    source,
    '    updatedAt: String(row.updated_at || ""),\n  };\n}',
    '    updatedAt: String(row.updated_at || ""),\n    lastUpdatedAt: String(row.raw_data_preview?.["Last Updated"] || ""),\n  };\n}',
    "remote Last Updated mapping",
    file,
  );

  source = replaceOnce(
    source,
    '    submittedAt,\n    createdAt: submittedAt,\n    updatedAt: submittedAt,\n  };\n}\n\nfunction looksLikeSubmittedEvaluation',
    `    submittedAt,\n    createdAt: normalizeLocalString(localField(row, "createdAt", "created_at") || submittedAt),\n    updatedAt: normalizeLocalString(localField(row, "updatedAt", "updated_at") || submittedAt),\n    lastUpdatedAt: normalizeLocalString(\n      localField(row, "lastUpdatedAt", "last_updated_at") || rawDataPreview?.["Last Updated"]\n    ),\n  };\n}\n\nfunction parseEvaluationTimestamp(value: unknown) {\n  const text = String(value || "").trim();\n  if (!text || text === "-") return null;\n\n  const direct = new Date(text);\n  if (!Number.isNaN(direct.getTime())) return direct;\n\n  const match = text.match(/^(\\d{1,2})[\\/-](\\d{1,2})[\\/-](\\d{4})(?:,\\s*|\\s+)?(\\d{1,2})?:?(\\d{2})?:?(\\d{2})?/);\n  if (!match) return null;\n  const date = new Date(\n    Number(match[3]),\n    Number(match[2]) - 1,\n    Number(match[1]),\n    Number(match[4] || 0),\n    Number(match[5] || 0),\n    Number(match[6] || 0)\n  );\n  return Number.isNaN(date.getTime()) ? null : date;\n}\n\nfunction normalizedEvaluationTimestamp(value: unknown) {\n  const date = parseEvaluationTimestamp(value);\n  return date ? date.toISOString() : "";\n}\n\nfunction evaluationTimestampFromIdentity(record: Pick<StoredEvaluation, "id" | "evaluationKey">) {\n  for (const value of [record.id, record.evaluationKey]) {\n    const match = String(value || "").trim().match(/(?:^|[-_|])(\\d{13})$/);\n    if (!match) continue;\n    const date = new Date(Number(match[1]));\n    if (!Number.isNaN(date.getTime())) return date.toISOString();\n  }\n  return "";\n}\n\nexport function getOriginalEvaluationTimestamp(\n  record: Pick<\n    StoredEvaluation,\n    "id" | "evaluationKey" | "auditTimestamp" | "submittedAt" | "createdAt" | "rawDataPreview"\n  >\n) {\n  const identityTimestamp = evaluationTimestampFromIdentity(record);\n  if (identityTimestamp) return identityTimestamp;\n\n  const candidates = [\n    record.createdAt,\n    record.rawDataPreview?.["Original Audit Timestamp"],\n    record.rawDataPreview?.["Evaluation Submitted At"],\n    record.auditTimestamp,\n    record.submittedAt,\n  ];\n  for (const candidate of candidates) {\n    const normalized = normalizedEvaluationTimestamp(candidate);\n    if (normalized) return normalized;\n  }\n  return "";\n}\n\nexport function getEvaluationLastUpdatedAt(\n  record: Pick<\n    StoredEvaluation,\n    "id" | "evaluationKey" | "auditTimestamp" | "submittedAt" | "createdAt" | "updatedAt" | "lastUpdatedAt" | "rawDataPreview"\n  >\n) {\n  const explicit = normalizedEvaluationTimestamp(\n    record.lastUpdatedAt || record.rawDataPreview?.["Last Updated"]\n  );\n  if (explicit) return explicit;\n\n  const original = getOriginalEvaluationTimestamp(record);\n  const updated = normalizedEvaluationTimestamp(record.updatedAt);\n  if (!original || !updated) return "";\n\n  const originalMs = new Date(original).getTime();\n  const updatedMs = new Date(updated).getTime();\n  if (!Number.isFinite(originalMs) || !Number.isFinite(updatedMs)) return "";\n\n  // Initial save writes updated_at too. A one-minute gap avoids treating the\n  // first save as an edit, while legacy edited records can still be recovered.\n  return updatedMs - originalMs >= 60_000 ? updated : "";\n}\n\nfunction looksLikeSubmittedEvaluation`,
    "local timestamps and legacy recovery helpers",
    file,
  );

  source = replaceOnce(
    source,
    '      "Process Reference":\n        record.processReference || record.rawDataPreview?.["Process Reference"] || "",\n    },',
    '      "Process Reference":\n        record.processReference || record.rawDataPreview?.["Process Reference"] || "",\n      ...(record.lastUpdatedAt ? { "Last Updated": record.lastUpdatedAt } : {}),\n    },',
    "persist Last Updated in raw preview",
    file,
  );

  return source;
});

patchFile("src/CreateEvaluationMockup.tsx", `// ${PATCH}-create`, (input) => {
  const file = "src/CreateEvaluationMockup.tsx";
  let source = input;

  source = replaceOnce(
    source,
    '  fetchStoredEvaluations,\n  getStoredEvaluationMonthKey,',
    '  fetchStoredEvaluations,\n  getEvaluationLastUpdatedAt,\n  getOriginalEvaluationTimestamp,\n  getStoredEvaluationMonthKey,',
    "evaluation timestamp helper imports",
    file,
  );

  source = replaceOnce(
    source,
    '// process-library-v65\n',
    '// process-library-v65\n// ' + PATCH + '-create\n',
    "create marker",
    file,
  );

  source = replaceOnce(
    source,
    '  evaluationStartedAt: string;\n  submittedAt: string;\n};',
    '  evaluationStartedAt: string;\n  submittedAt: string;\n  lastUpdatedAt?: string;\n};',
    "submit payload lastUpdatedAt field",
    file,
  );

  source = replaceOnce(
    source,
    '    setEvaluationStartedAt(record.evaluationStartedAt || record.auditTimestamp || "");\n    setEvaluationSubmittedAt(record.submittedAt || "");',
    '    const originalEvaluationTimestamp = getOriginalEvaluationTimestamp(record);\n    setEvaluationStartedAt(record.evaluationStartedAt || originalEvaluationTimestamp || record.auditTimestamp || "");\n    setEvaluationSubmittedAt(originalEvaluationTimestamp || record.submittedAt || "");',
    "load original timestamp for edit",
    file,
  );

  source = replaceOnce(
    source,
    '                    <input type="date" value={auditDate} onChange={(event) => setAuditDate(event.target.value)} className={inputClass} />',
    '                    <input type="date" value={auditDate} disabled={Boolean(activeSubmittedRecordId)} onChange={(event) => setAuditDate(event.target.value)} className={`${inputClass} disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500`} />\n                    {activeSubmittedRecordId ? <span className="mt-2 block text-xs font-semibold text-slate-500">Audit Date เดิมจะถูกล็อกไว้เมื่อแก้ไข Evaluation</span> : null}',
    "lock Audit Date while editing",
    file,
  );

  source = replaceOnce(
    source,
    '    const now = new Date();\n    const submittedAt = formatTimestamp(now);\n    const noCaseRecordId = makeNoCaseEvaluationId(agentName, selectedMonthKey);',
    `    const now = new Date();\n    const latestUpdateAt = formatTimestamp(now);\n    const editingRecord = activeSubmittedRecordId\n      ? submittedRecords.find((record) => record.recordId === activeSubmittedRecordId) ||\n        evaluationHistory.find((record) => record.recordId === activeSubmittedRecordId)\n      : undefined;\n    const originalAuditDate = editingRecord?.auditDate || auditDate;\n    const originalSubmittedAt = editingRecord\n      ? getOriginalEvaluationTimestamp(editingRecord) ||\n        editingRecord.submittedAt ||\n        editingRecord.auditTimestamp ||\n        latestUpdateAt\n      : latestUpdateAt;\n    const submittedAt = originalSubmittedAt;\n    const lastUpdatedAt = editingRecord ? latestUpdateAt : "";\n    const noCaseRecordId = makeNoCaseEvaluationId(agentName, selectedMonthKey);`,
    "edit timestamp preservation",
    file,
  );

  source = replaceOnce(
    source,
    '      evaluationType: noCaseForMonth ? "no_case_month" : "case",\n      isTestCase: isTestCase && !noCaseForMonth,\n      evaluationMonthKey: selectedMonthKey,',
    '      evaluationType: noCaseForMonth ? "no_case_month" : "case",\n      isTestCase: isTestCase && !noCaseForMonth,\n      evaluationMonthKey: editingRecord?.evaluationMonthKey || getEvaluationMonthKey(originalAuditDate),',
    "preserve evaluation month on edit",
    file,
  );

  source = replaceOnce(
    source,
    '      auditDate,\n      auditTimestamp: submittedAt,',
    '      auditDate: originalAuditDate,\n      auditTimestamp: originalSubmittedAt,',
    "preserve audit date and timestamp",
    file,
  );

  source = replaceOnce(
    source,
    '      rawDataPreview: previewColumns,\n      evaluationStartedAt: submittedAt,\n      submittedAt,',
    `      rawDataPreview: {\n        ...previewColumns,\n        "Audit Date": formatThaiDate(originalAuditDate),\n        "Evaluation Started At": editingRecord?.evaluationStartedAt || originalSubmittedAt,\n        "Evaluation Submitted At": originalSubmittedAt,\n        ...(lastUpdatedAt ? { "Last Updated": lastUpdatedAt } : {}),\n      },\n      evaluationStartedAt: editingRecord?.evaluationStartedAt || originalSubmittedAt,\n      submittedAt: originalSubmittedAt,\n      lastUpdatedAt: lastUpdatedAt || undefined,`,
    "raw preview and Last Updated",
    file,
  );

  source = replaceOnce(
    source,
    '                              <div className="text-xs font-semibold text-slate-600">\n                                Submitted: <span className="font-black text-slate-900">{formatDisplayTimestamp(record.submittedAt, "-")}</span>\n                              </div>',
    `                              <div className="text-xs font-semibold text-slate-600">\n                                Submitted: <span className="font-black text-slate-900">{formatDisplayTimestamp(getOriginalEvaluationTimestamp(record) || record.submittedAt, "-")}</span>\n                                {getEvaluationLastUpdatedAt(record) ? (\n                                  <div className="mt-1">Last Updated: <span className="font-black text-violet-700">{formatDisplayTimestamp(getEvaluationLastUpdatedAt(record), "")}</span></div>\n                                ) : null}\n                              </div>`,
    "submitted report Last Updated display",
    file,
  );

  return source;
});

patchFile("src/App.tsx", `// ${PATCH}-app`, (input) => {
  const file = "src/App.tsx";
  let source = input;

  source = replaceOnce(
    source,
    '// data-password-history-v83\n',
    '// data-password-history-v83\n// ' + PATCH + '-app\n',
    "app marker",
    file,
  );

  source = replaceOnce(
    source,
    '        auditDate: compactCentralStoreText(payload.auditDate),\n        auditTimestamp: compactCentralStoreText(payload.auditTimestamp),',
    '        auditDate: compactCentralStoreText(payload.auditDate),\n        auditTimestamp: compactCentralStoreText(payload.auditTimestamp),\n        lastUpdatedAt: compactCentralStoreText(payload.lastUpdatedAt || ""),',
    "central Last Updated persistence",
    file,
  );

  source = replaceOnce(
    source,
    '        evaluatorUsername: currentUser.username || "",\n        evaluatorName: currentUser.displayName || currentUser.username || "",\n        submittedAt: new Date().toISOString(),',
    '        evaluatorUsername: currentUser.username || "",\n        evaluatorName: currentUser.displayName || currentUser.username || "",\n        submittedAt: payload.submittedAt || new Date().toISOString(),',
    "preserve original submittedAt",
    file,
  );

  source = replaceOnce(
    source,
    '        auditTimestamp: payload.auditTimestamp,\n        isTestCase: isTestCaseEvaluation(payload),',
    '        auditTimestamp: payload.auditTimestamp,\n        ...(payload.lastUpdatedAt ? { lastUpdatedAt: payload.lastUpdatedAt } : {}),\n        isTestCase: isTestCaseEvaluation(payload),',
    "usage log Last Updated",
    file,
  );

  return source;
});

patchFile("src/DashboardMockup.tsx", `// ${PATCH}-dashboard`, (input) => {
  const file = "src/DashboardMockup.tsx";
  let source = input;

  source = replaceOnce(
    source,
    '  fetchStoredEvaluations,\n  getStoredEvaluationMonthKey,',
    '  fetchStoredEvaluations,\n  getEvaluationLastUpdatedAt,\n  getOriginalEvaluationTimestamp,\n  getStoredEvaluationMonthKey,',
    "dashboard timestamp helper imports",
    file,
  );

  source = replaceOnce(
    source,
    '// process-library-v65\n',
    '// process-library-v65\n// ' + PATCH + '-dashboard\n',
    "dashboard marker",
    file,
  );

  source = replaceOnce(
    source,
    '  auditTimestamp: string;\n  monthKey: string;',
    '  auditTimestamp: string;\n  lastUpdatedAt?: string;\n  monthKey: string;',
    "CaseItem Last Updated field",
    file,
  );

  source = replaceOnce(
    source,
    '      const evaluationAuditDateDisplay = formatAuditDateForDisplay(\n        record.auditTimestamp || record.submittedAt || record.auditDate\n      );',
    '      const originalAuditTimestamp = getOriginalEvaluationTimestamp(record);\n      const evaluationAuditDateDisplay = formatAuditDateForDisplay(\n        originalAuditTimestamp || record.auditTimestamp || record.submittedAt || record.auditDate\n      );\n      const lastUpdatedAt = getEvaluationLastUpdatedAt(record);',
    "dashboard legacy timestamp recovery",
    file,
  );

  source = replaceOnce(
    source,
    '        auditTimestamp: record.auditTimestamp || formatBangkokDateTime(record.submittedAt),\n        monthKey,',
    '        auditTimestamp: originalAuditTimestamp\n          ? formatBangkokDateTime(originalAuditTimestamp)\n          : record.auditTimestamp || formatBangkokDateTime(record.submittedAt),\n        lastUpdatedAt: lastUpdatedAt ? formatBangkokDateTime(lastUpdatedAt) : "",\n        monthKey,',
    "dashboard timestamp mapping",
    file,
  );

  source = replaceOnce(
    source,
    '              <div className="grid gap-0 p-4 sm:grid-cols-3">\n                {[\n                  { label: "Audit Date", value: caseItem.auditTimestamp || "-" },\n                  {\n                    label: "Waiting Time / Service Time",\n                    value: formatWaitingServiceRange(caseItem.waitingTime, caseItem.serviceTime),\n                  },\n                  { label: "Evaluated By", value: caseItem.evaluatorName || "Not recorded" },\n                ].map((entry, index) => (',
    `              <div className={\`grid gap-0 p-4 \${caseItem.lastUpdatedAt ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-3"}\`}>\n                {[\n                  { label: "Audit Date", value: caseItem.auditTimestamp || "-" },\n                  ...(caseItem.lastUpdatedAt ? [{ label: "Last Updated", value: caseItem.lastUpdatedAt }] : []),\n                  {\n                    label: "Waiting Time / Service Time",\n                    value: formatWaitingServiceRange(caseItem.waitingTime, caseItem.serviceTime),\n                  },\n                  { label: "Evaluated By", value: caseItem.evaluatorName || "Not recorded" },\n                ].map((entry, index) => (`,
    "conditional Last Updated timeline",
    file,
  );

  return source;
});

patchFile("src/caseDetailOfficialPdf.ts", `// ${PATCH}-pdf`, (input) => {
  const file = "src/caseDetailOfficialPdf.ts";
  let source = input;

  source = replaceOnce(
    source,
    'import { parseRichTextRuns, richTextToPlainText, type RichTextRun } from "./richText";\n',
    'import { parseRichTextRuns, richTextToPlainText, type RichTextRun } from "./richText";\n// ' + PATCH + '-pdf\n',
    "PDF marker",
    file,
  );

  source = replaceOnce(
    source,
    '    y += secondSelectionRowH;\n\n    const inquiryText = caseItem.inquiryTh || caseItem.inquiryEn || "-";',
    `    y += secondSelectionRowH;\n\n    const lastUpdatedText = safeText(caseItem.lastUpdatedAt, "");\n    if (lastUpdatedText) {\n      addPageIfNeeded(8);\n      label(0, y, 1, 8, "Last Updated");\n      value(1, y, 7, 8, lastUpdatedText, LIGHT_PURPLE, { align: "left", valign: "middle", maxLines: 2, size: 6.4 });\n      y += 8;\n    }\n\n    const inquiryText = caseItem.inquiryTh || caseItem.inquiryEn || "-";`,
    "Original PDF Last Updated row",
    file,
  );

  source = replaceOnce(
    source,
    '    y += appealSecondRowH;\n\n    const inquiryText = caseItem.inquiryTh || caseItem.inquiryEn || "-";',
    `    y += appealSecondRowH;\n\n    const appealLastUpdatedText = safeText(caseItem.lastUpdatedAt, "");\n    if (appealLastUpdatedText) {\n      addPageIfNeeded(8);\n      label(0, y, 1, 8, "Last Updated");\n      value(1, y, 7, 8, appealLastUpdatedText, LIGHT_PURPLE, { align: "left", valign: "middle", maxLines: 2, size: 6.4 });\n      y += 8;\n    }\n\n    const inquiryText = caseItem.inquiryTh || caseItem.inquiryEn || "-";`,
    "Appeal PDF Last Updated row",
    file,
  );

  return source;
});

console.log(`${PATCH}: complete`);
