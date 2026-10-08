// Display-only filenames for appeal evidence. The stored Google Drive filename
// and image ID remain unchanged so existing attachments keep working.
export type AppealEvidenceTopicForNaming = {
  code: string;
  evidenceImages?: readonly unknown[];
};

export function appealEvidenceDisplayName(caseId: string, sequenceNumber: number): string {
  const normalizedCaseId = String(caseId || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .toUpperCase();
  if (!normalizedCaseId) return "";
  const number = Math.max(1, Math.floor(Number(sequenceNumber) || 1));
  return `${normalizedCaseId}_${String(number).padStart(2, "0")}.jpg`;
}

// Number all files in a single appeal, even when the files belong to
// different topic panels. Topic codes provide a stable ordering on every page.
export function appealEvidenceStartIndex(
  topics: readonly AppealEvidenceTopicForNaming[] | null | undefined,
  topicCode: string
): number {
  const ordered = [...(topics || [])].sort((left, right) =>
    String(left.code).localeCompare(String(right.code), undefined, { numeric: true })
  );
  let count = 0;
  for (const topic of ordered) {
    if (String(topic.code) === String(topicCode)) return count;
    count += Array.isArray(topic.evidenceImages) ? topic.evidenceImages.length : 0;
  }
  return count;
}
