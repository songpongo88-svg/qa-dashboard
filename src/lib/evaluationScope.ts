/** Missing flags are real evaluations, preserving all historical records. */
export function isTestCaseEvaluation(record: unknown): boolean {
  if (!record || typeof record !== "object") return false;
  const row = record as Record<string, any>;
  const value = row.isTestCase ?? row.is_test_case ??
    row.rawDataPreview?.["Test Case"] ?? row.raw_data_preview?.["Test Case"] ??
    row.rowData?.["Test Case"] ?? row["Test Case"];
  return value === true || value === 1 ||
    (typeof value === "string" && /^(true|yes|1)$/i.test(value.trim()));
}

/** Use at reporting boundaries, never at the shared store or Case Detail. */
export function excludeTestEvaluations<T>(records: readonly T[]): T[] {
  return records.filter((record) => !isTestCaseEvaluation(record));
}

/** Tests get a separate read/cache budget, so they cannot evict real results. */
export function limitEvaluationScopes<T>(records: readonly T[], limit: number): T[] {
  let realCount = 0;
  let testCount = 0;
  return records.filter((record) => isTestCaseEvaluation(record)
    ? testCount++ < limit
    : realCount++ < limit);
}
