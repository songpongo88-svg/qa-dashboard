// Process File Management: metadata-only visibility preserves historical QA references.
// Firestore version documents and file chunks are never deleted by this feature.
export type ProcessFileLibraryRow = {
  id?: string;
  name?: string;
  fileName?: string;
  fileUrl?: string;
  kind?: string;
  status?: string;
  hiddenFromPicker?: boolean;
  uploadedAt?: string;
  uploadedBy?: string;
};

export function processFileNameKey(value: unknown): string {
  return String(value || "Process").trim().toLowerCase().replace(/\s+/g, " ");
}

export function managedProcessFileRows<T extends ProcessFileLibraryRow>(
  rows: T[],
  builtin: T,
): T[] {
  const versions = rows.filter((row) => row && row.id && row.kind !== "file-chunk");
  if (!versions.some((row) => row.id === builtin.id)) versions.push(builtin);
  return [...versions].sort(
    (a, b) => (b.uploadedAt || "").localeCompare(a.uploadedAt || "")
      || String(a.name || a.fileName || "").localeCompare(String(b.name || b.fileName || ""), "th"),
  );
}

export function selectedProcessFileRows<T extends ProcessFileLibraryRow>(
  rows: T[],
  builtin: T,
): T[] {
  const versions = managedProcessFileRows(rows, builtin);
  const groups = new Map<string, T[]>();
  for (const version of versions) {
    const key = processFileNameKey(version.name || version.fileName);
    const group = groups.get(key) || [];
    group.push(version);
    groups.set(key, group);
  }
  const selected: T[] = [];
  for (const group of groups.values()) {
    const visible = group.filter((row) => !row.hiddenFromPicker);
    const current = visible.find((row) => row.status === "current");
    // If the active version was hidden, do not silently resurface an older
    // archived version under the same name.
    const hiddenCurrent = group.some((row) => row.status === "current" && row.hiddenFromPicker);
    const chosen = current || (hiddenCurrent ? null : visible[0]);
    if (chosen) selected.push(chosen);
  }
  return selected.sort((a, b) =>
    String(a.name || a.fileName || "").localeCompare(String(b.name || b.fileName || ""), "th", { sensitivity: "base" })
  );
}

export function canRemoveProcessFile(row: ProcessFileLibraryRow, builtinId: string): boolean {
  // The hard-coded fallback Process must remain available for legacy cases.
  return Boolean(row.id && row.id !== builtinId && row.kind !== "file-chunk");
}

export function processFileVisibilityUpdate(hidden: boolean, actor: string, timestamp: string) {
  return hidden
    ? { hiddenFromPicker: true, removedAt: timestamp, removedBy: actor }
    : { hiddenFromPicker: false, removedAt: "", removedBy: "" };
}
