import fs from "node:fs";

const PATCH = "evaluation-last-updated-v87";

function replaceOnce(source, search, replacement, label, file) {
  if (typeof search === "string") {
    if (!source.includes(search)) throw new Error(`${PATCH}: missing ${label} in ${file}`);
    return source.replace(search, replacement);
  }
  if (!search.test(source)) throw new Error(`${PATCH}: missing ${label} in ${file}`);
  return source.replace(search, replacement);
}

function patchFile(file, marker, transform) {
  let source = fs.readFileSync(file, "utf8");
  if (source.includes(marker)) {
    console.log(`${PATCH}: ${file} already patched`);
    return;
  }
  const next = transform(source);
  if (next === source) throw new Error(`${PATCH}: no changes made to ${file}`);
  fs.writeFileSync(file, next, "utf8");
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
    '  createdAt?: string;\n  updatedAt?: string;\n};',
    '  createdAt?: string;\n  updatedAt?: string;\n  lastUpdatedAt?: string;\n};',
    "StoredEvaluation lastUpdatedAt field",
    file,
  );

  source = replaceOnce(
    source,
    '    createdAt: String(row.created_at || ""),\n    updatedAt: String(row.updated_at || ""),\n  };\n}',
    '    createdAt: String(row.created_at || ""),\n    updatedAt: String(row.updated_at || ""),\n    lastUpdatedAt: String(row.raw_data_preview?.["Last Updated"] || ""),\n  };\n}',
    "remote Last Updated mapping",
    file,
  );

  source = replaceOnce(
    source,
    '    submittedAt,\n    createdAt: submittedAt,\n    updatedAt: submittedAt,\n  };\n}\n\nfunction looksLikeSubmittedEvaluation',
    `    submittedAt,\n    createdAt: normalizeLocalString(localField(row, "createdAt", "created_at") || submittedAt),\n    updatedAt: normalizeLocalString(localField(row, "updatedAt", "updated_at") || submittedAt),\n    lastUpdatedAt: normalizeLocalString(\n      localField(row, "lastUpdatedAt", "last_updated_at") || rawDataPreview?.["Last Updated"]\n    ),\n  };\n}\n\ntype EvaluationTimestampRecord = {\n  id?: string;\n  recordId?: string;\n  evaluationKey?: string;\n  auditTimestamp?: string;\n  submittedAt?: string;\n  createdAt?: string;\n  updatedAt?: string;\n  lastUpdatedAt?: string;\n  rawDataPreview?: Record<string, string | number>;\n};\n\nfunction parseEvaluationTimestamp(value: unknown) {\n  const text = String(value || "").trim();\n  if (!text || text === "-") return null;\n\n  const slashMatch = text.match(/^(\\d{1,2})[\\/-](\\d{1,2})[\\/-](\\d{4})(?:,\\s*|\\s+)?(\\d{1,2})?:?(\\d{2})?:?(\\d{2})?/);\n  if (slashMatch) {\n    const date = new Date(\n      Number(slashMatch[3]),\n      Number(slashMatch[2]) - 1,\n      Number(slashMatch[1]),\n      Number(slashMatch[4] || 0),\n      Number(slashMatch[5] || 0),\n      Number(slashMatch[6] || 0)\n    );\n    if (!Number.isNaN(date.getTime())) return date;\n  }\n\n  const direct = new Date(text);\n  return Number.isNaN(direct.getTime()) ? null : direct;\n}\n\nfunction normalizedEvaluationTimestamp(value: unknown) {\n  const date = parseEvaluationTimestamp(value);\n  return date ? date.toISOString() : "";\n}\n\nfunction evaluationTimestampFromIdentity(record: EvaluationTimestampRecord) {\n  for (const value of [record.id, record.recordId, record.evaluationKey]) {\n    const match = String(value || "").trim().match(/(?:^|[-_|])(\\d{13})$/);\n    if (!match) continue;\n    const date = new Date(Number(match[1]));\n    if (!Number.isNaN(date.getTime())) return date.toISOString();\n  }\n  return "";\n}\n\nexport function getOriginalEvaluationTimestamp(record: EvaluationTimestampRecord) {\n  const identityTimestamp = evaluationTimestampFromIdentity(record);\n  if (identityTimestamp) return identityTimestamp;\n\n  const candidates = [\n    record.createdAt,\n    record.rawDataPreview?.["Original Audit Timestamp"],\n    record.rawDataPreview?.["Evaluation Submitted At"],\n    record.auditTimestamp,\n    record.submittedAt,\n  ];\n  for (const candidate of candidates) {\n    const normalized = normalizedEvaluationTimestamp(candidate);\n    if (normalized) return normalized;\n  }\n  return "";\n}\n\nexport function getEvaluationLastUpdatedAt(record: EvaluationTimestampRecord) {\n  const explicit = normalizedEvaluationTimestamp(\n    record.lastUpdatedAt || record.rawDataPreview?.["Last Updated"]\n  );\n  if (explicit) return explicit;\n\n  const original = getOriginalEvaluationTimestamp(record);\n  const updated = normalizedEvaluationTimestamp(record.updatedAt);\n  if (!original || !updated) return "";\n\n  const originalMs = new Date(original).getTime();\n  const updatedMs = new Date(updated).getTime();\n  if (!Number.isFinite(originalMs) || !Number.isFinite(updatedMs)) return "";\n\n  // Initial persistence writes updated_at too. Only treat a meaningfully later\n  // update as an edit when recovering legacy records.\n  return updatedMs - originalMs >= 60_000 ? updated : "";\n}\n\nfunction looksLikeSubmittedEvaluation`,
    "timestamp recovery helpers",
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
    `    const originalEvaluationTimestamp = getOriginalEvaluationTimestamp(record);\n    const originalEvaluationDisplay = originalEvaluationTimestamp\n      ? formatTimestamp(new Date(originalEvaluationTimestamp))\n      : record.auditTimestamp || "";\n    setEvaluationStartedAt(record.evaluationStartedAt || originalEvaluationDisplay);\n    setEvaluationSubmittedAt(originalEvaluationTimestamp || record.submittedAt || "");`,
    "load original timestamp for edit",
    file,
  );

  source = replaceOnce(
    source,
    '    const now = new Date();\n    const submittedAt = formatTimestamp(now);\n    const noCaseRecordId = makeNoCaseEvaluationId(agentName, selectedMonthKey);',
    `    const now = new Date();\n    const submittedAt = formatTimestamp(now);\n    const submittedAtIso = now.toISOString();\n    const editingRecord = activeSubmittedRecordId\n      ? submittedRecords.find((record) => record.recordId === activeSubmittedRecordId) ||\n        evaluationHistory.find((record) => record.recordId === activeSubmittedRecordId)\n      : undefined;\n    const originalTimestampIso = editingRecord\n      ? getOriginalEvaluationTimestamp(editingRecord)\n      : submittedAtIso;\n    const originalAuditTimestamp = editingRecord\n      ? originalTimestampIso\n        ? formatTimestamp(new Date(originalTimestampIso))\n        : editingRecord.auditTimestamp || submittedAt\n      : submittedAt;\n    const originalSubmittedAt = editingRecord\n      ? originalTimestampIso || editingRecord.submittedAt || submittedAtIso\n      : submittedAtIso;\n    const lastUpdatedAt = editingRecord ? submittedAtIso : "";\n    const noCaseRecordId = makeNoCaseEvaluationId(agentName, selectedMonthKey);`,
    "edit timestamp preservation",
    file,
  );

  source = replaceOnce(
    source,
    '      auditDate,\n      auditTimestamp: submittedAt,',
    '      auditDate,\n      auditTimestamp: originalAuditTimestamp,',
    "preserve Audit Date timestamp",
    file,
  );

  source = replaceOnce(
    source,
    '      rawDataPreview: previewColumns,\n      evaluationStartedAt: submittedAt,\n      submittedAt,',
    `      rawDataPreview: {\n        ...previewColumns,\n        "Evaluation Started At": editingRecord?.evaluationStartedAt || originalAuditTimestamp,\n        "Evaluation Submitted At": originalAuditTimestamp,\n        ...(lastUpdatedAt ? { "Last Updated": lastUpdatedAt } : {}),\n      },\n      evaluationStartedAt: editingRecord?.evaluationStartedAt || originalAuditTimestamp,\n      submittedAt: originalSubmittedAt,\n      lastUpdatedAt: lastUpdatedAt || undefined,`,
    "raw preview and Last Updated",
    file,
  );

  source = replaceOnce(
    source,
    '      setEvaluationStartedAt(record.evaluationStartedAt || record.submittedAt);\n      setEvaluationSubmittedAt(record.submittedAt);',
    '      setEvaluationStartedAt(record.evaluationStartedAt || record.auditTimestamp || record.submittedAt);\n      setEvaluationSubmittedAt(record.submittedAt);',
    "post-submit timestamp state",
    file,
  );

  source = replaceOnce(
    source,
    '            : `Evaluation submitted at ${record.submittedAt}. Result task was sent to ${record.targetDisplayName || record.agentName || "the selected agent"}.`',
    '            : `Evaluation submitted at ${formatDisplayTimestamp(record.submittedAt, record.submittedAt)}. Result task was sent to ${record.targetDisplayName || record.agentName || "the selected agent"}.`',
    "formatted submit confirmation",
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
    '      const caseDateDisplay = formatAuditDateForDisplay(record.auditDate);\n      const evaluationAuditDateDisplay = formatAuditDateForDisplay(\n        record.auditTimestamp || record.submittedAt || record.auditDate\n      );',
    `      const caseDateDisplay = formatAuditDateForDisplay(record.auditDate);\n      const originalAuditTimestamp = getOriginalEvaluationTimestamp(record);\n      const evaluationAuditDateDisplay = formatAuditDateForDisplay(\n        originalAuditTimestamp || record.auditTimestamp || record.submittedAt || record.auditDate\n      );\n      const lastUpdatedAt = getEvaluationLastUpdatedAt(record);`,
    "dashboard legacy timestamp recovery",
    file,
  );

  source = replaceOnce(
    source,
    '        auditTimestamp: record.auditTimestamp || formatBangkokDateTime(record.submittedAt),\n        monthKey,',
    `        auditTimestamp: originalAuditTimestamp\n          ? formatBangkokDateTime(originalAuditTimestamp)\n          : record.auditTimestamp || formatBangkokDateTime(record.submittedAt),\n        lastUpdatedAt: lastUpdatedAt ? formatBangkokDateTime(lastUpdatedAt) : "",\n        monthKey,`,
    "dashboard timestamp mapping",
    file,
  );

  source = replaceOnce(
    source,
    '<div className="grid gap-0 p-4 sm:grid-cols-3">\n                {[\n                  { label: "Audit Date", value: caseItem.auditTimestamp || "-" },\n                  {\n                    label: "Waiting Time / Service Time",\n                    value: formatWaitingServiceRange(caseItem.waitingTime, caseItem.serviceTime),\n                  },\n                  { label: "Evaluated By", value: caseItem.evaluatorName || "Not recorded" },\n                ].map((entry, index) => (',
    `<div className={\`grid gap-0 p-4 \${caseItem.lastUpdatedAt ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-3"}\`}>\n                {[\n                  { label: "Audit Date", value: caseItem.auditTimestamp || "-" },\n                  ...(caseItem.lastUpdatedAt ? [{ label: "Last Updated", value: caseItem.lastUpdatedAt }] : []),\n                  {\n                    label: "Waiting Time / Service Time",\n                    value: formatWaitingServiceRange(caseItem.waitingTime, caseItem.serviceTime),\n                  },\n                  { label: "Evaluated By", value: caseItem.evaluatorName || "Not recorded" },\n                ].map((entry, index) => (`,
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
    /    y \+= secondSelectionRowH;\n/,
    `    y += secondSelectionRowH;\n\n    const lastUpdatedText = safeText(caseItem.lastUpdatedAt, "");\n    if (lastUpdatedText) {\n      addPageIfNeeded(8);\n      label(0, y, 1, 8, "Last Updated");\n      value(1, y, 7, 8, lastUpdatedText, LIGHT_PURPLE, { align: "left", valign: "middle", maxLines: 2, size: 6.4 });\n      y += 8;\n    }\n`,
    "Original PDF Last Updated row",
    file,
  );

  source = replaceOnce(
    source,
    /    y \+= appealSecondRowH;\n/,
    `    y += appealSecondRowH;\n\n    const appealLastUpdatedText = safeText(caseItem.lastUpdatedAt, "");\n    if (appealLastUpdatedText) {\n      addPageIfNeeded(8);\n      label(0, y, 1, 8, "Last Updated");\n      value(1, y, 7, 8, appealLastUpdatedText, LIGHT_PURPLE, { align: "left", valign: "middle", maxLines: 2, size: 6.4 });\n      y += 8;\n    }\n`,
    "Appeal PDF Last Updated row",
    file,
  );

  return source;
});

console.log(`${PATCH}: complete`);
