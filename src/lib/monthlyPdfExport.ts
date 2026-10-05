import type { StoredSignatureDocument } from "../signatureStore";
import { canonicalAgentIdentityKey } from "./agentIdentity";

export function resolveMonthlySignatureDocument(
  documents: StoredSignatureDocument[],
  monthKey: string,
  agentName: string
): StoredSignatureDocument | undefined {
  const agentKey = canonicalAgentIdentityKey(agentName);
  if (!agentKey) return undefined;
  const matches = documents.filter((document) => {
    const separator = document.docId.indexOf("::");
    return separator >= 0 && document.docId.slice(0, separator) === monthKey &&
      canonicalAgentIdentityKey(document.docId.slice(separator + 2)) === agentKey;
  }).sort((left, right) => String(left.updatedAt || "").localeCompare(String(right.updatedAt || "")));
  if (!matches.length) return undefined;

  // A newer Pending entry is authoritative after a reset, even if an older
  // spelling of the same Agent's name still has a signed image.
  const entries = new Map<StoredSignatureDocument["entries"][number]["role"], StoredSignatureDocument["entries"][number]>();
  for (const document of matches) {
    if (!document.entries.length) entries.clear();
    for (const entry of document.entries) entries.set(entry.role, entry);
  }
  return { ...matches[matches.length - 1], entries: [...entries.values()] };
}

function caseKey(value: unknown) {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}

export function orderCasesByMonthlyList<T extends { caseId?: unknown }>(
  cases: T[],
  monthlyCases: Array<{ caseId?: unknown }>
): T[] {
  const positions = new Map(monthlyCases.map((item, index) => [caseKey(item.caseId), index]));
  return cases.map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const leftPosition = positions.get(caseKey(left.item.caseId)) ?? Number.MAX_SAFE_INTEGER;
      const rightPosition = positions.get(caseKey(right.item.caseId)) ?? Number.MAX_SAFE_INTEGER;
      return leftPosition - rightPosition || left.index - right.index;
    }).map(({ item }) => item);
}
