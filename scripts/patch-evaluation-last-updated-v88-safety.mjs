import fs from "node:fs";

const storePath = "src/evaluationStore.ts";
const dashboardPath = "src/DashboardMockup.tsx";
const marker = "// evaluation-last-updated-v88-safety";

let store = fs.readFileSync(storePath, "utf8");
if (!store.includes(marker)) {
  const oldHelper = `export function getEvaluationLastUpdatedAt(record: EvaluationTimestampRecord) {\n  const explicit = normalizedEvaluationTimestamp(\n    record.lastUpdatedAt || record.rawDataPreview?.["Last Updated"]\n  );\n  if (explicit) return explicit;\n\n  const original = getOriginalEvaluationTimestamp(record);\n  const updated = normalizedEvaluationTimestamp(record.updatedAt);\n  if (!original || !updated) return "";\n\n  const originalMs = new Date(original).getTime();\n  const updatedMs = new Date(updated).getTime();\n  if (!Number.isFinite(originalMs) || !Number.isFinite(updatedMs)) return "";\n\n  // Initial persistence writes updated_at too. Only treat a meaningfully later\n  // update as an edit when recovering legacy records.\n  return updatedMs - originalMs >= 60_000 ? updated : "";\n}`;

  const newHelper = `// evaluation-last-updated-v88-safety\nexport function getEvaluationLastUpdatedAt(record: EvaluationTimestampRecord) {\n  const explicit = normalizedEvaluationTimestamp(\n    record.lastUpdatedAt || record.rawDataPreview?.["Last Updated"]\n  );\n  if (explicit) return explicit;\n\n  // For legacy records, recover Last Updated only when the immutable record ID\n  // proves that Audit Date was overwritten. Normal records are created with the\n  // same millisecond timestamp in both the ID suffix and auditTimestamp, so a\n  // later auditTimestamp is direct evidence that this record was edited.\n  const originalFromIdentity = evaluationTimestampFromIdentity(record);\n  const currentAudit = normalizedEvaluationTimestamp(record.auditTimestamp);\n  if (!originalFromIdentity || !currentAudit) return "";\n\n  const originalMs = new Date(originalFromIdentity).getTime();\n  const currentAuditMs = new Date(currentAudit).getTime();\n  if (!Number.isFinite(originalMs) || !Number.isFinite(currentAuditMs)) return "";\n  if (Math.abs(currentAuditMs - originalMs) < 5_000) return "";\n\n  const candidates = [\n    currentAudit,\n    normalizedEvaluationTimestamp(record.submittedAt),\n    normalizedEvaluationTimestamp(record.updatedAt),\n  ]\n    .filter(Boolean)\n    .map((value) => ({ value, ms: new Date(value).getTime() }))\n    .filter((item) => Number.isFinite(item.ms) && item.ms >= currentAuditMs - 5_000)\n    .sort((left, right) => right.ms - left.ms);\n\n  return candidates[0]?.value || currentAudit;\n}`;

  if (!store.includes(oldHelper)) {
    throw new Error("Evaluation Last Updated v88 safety: legacy recovery helper anchor not found");
  }
  store = store.replace(oldHelper, newHelper);
  fs.writeFileSync(storePath, store, "utf8");
  console.log("Applied evidence-based legacy Last Updated recovery");
}

let dashboard = fs.readFileSync(dashboardPath, "utf8");
const oldAuditDisplay = `      const evaluationAuditDateDisplay = formatAuditDateForDisplay(\n        originalAuditTimestamp || record.auditTimestamp || record.submittedAt || record.auditDate\n      );`;
const fullAuditDisplay = `      const evaluationAuditDateDisplay = formatAuditTimestamp(\n        originalAuditTimestamp || record.auditTimestamp || record.submittedAt || record.auditDate\n      );`;
if (dashboard.includes(oldAuditDisplay)) {
  dashboard = dashboard.replace(oldAuditDisplay, fullAuditDisplay);
  fs.writeFileSync(dashboardPath, dashboard, "utf8");
  console.log("Restored full Audit Date time with seconds after legacy recovery");
} else if (!dashboard.includes(fullAuditDisplay)) {
  throw new Error("Evaluation Last Updated v88 safety: Dashboard Audit Date display anchor not found");
}
