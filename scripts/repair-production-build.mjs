import fs from 'node:fs';

const file = 'src/evaluationStore.ts';
let source = fs.readFileSync(file, 'utf8');

if (!source.includes('export function getOriginalEvaluationTimestamp')) {
  const anchor = '\nfunction isStoredEvaluationRecord(item: StoredEvaluation) {';
  if (!source.includes(anchor)) throw new Error('evaluationStore insertion anchor not found');

  const helper = `

type EvaluationTimestampRecord = {
  id?: string;
  recordId?: string;
  evaluationKey?: string;
  auditTimestamp?: string;
  submittedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  lastUpdatedAt?: string;
  rawDataPreview?: Record<string, string | number>;
};

function parseEvaluationTimestamp(value: unknown) {
  const text = String(value || "").trim();
  if (!text || text === "-") return null;

  const slashMatch = text.match(/^(\\d{1,2})[\\/-](\\d{1,2})[\\/-](\\d{4})(?:,\\s*|\\s+)?(\\d{1,2})?:?(\\d{2})?:?(\\d{2})?/);
  if (slashMatch) {
    const date = new Date(
      Number(slashMatch[3]),
      Number(slashMatch[2]) - 1,
      Number(slashMatch[1]),
      Number(slashMatch[4] || 0),
      Number(slashMatch[5] || 0),
      Number(slashMatch[6] || 0)
    );
    if (!Number.isNaN(date.getTime())) return date;
  }

  const direct = new Date(text);
  return Number.isNaN(direct.getTime()) ? null : direct;
}

function normalizedEvaluationTimestamp(value: unknown) {
  const date = parseEvaluationTimestamp(value);
  return date ? date.toISOString() : "";
}

function evaluationTimestampFromIdentity(record: EvaluationTimestampRecord) {
  for (const value of [record.id, record.recordId, record.evaluationKey]) {
    const match = String(value || "").trim().match(/(?:^|[-_|])(\\d{13})$/);
    if (!match) continue;
    const date = new Date(Number(match[1]));
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return "";
}

export function getOriginalEvaluationTimestamp(record: EvaluationTimestampRecord) {
  const identityTimestamp = evaluationTimestampFromIdentity(record);
  if (identityTimestamp) return identityTimestamp;

  const candidates = [
    record.createdAt,
    record.rawDataPreview?.["Original Audit Timestamp"],
    record.rawDataPreview?.["Evaluation Submitted At"],
    record.auditTimestamp,
    record.submittedAt,
  ];

  for (const candidate of candidates) {
    const normalized = normalizedEvaluationTimestamp(candidate);
    if (normalized) return normalized;
  }
  return "";
}

export function getEvaluationLastUpdatedAt(record: EvaluationTimestampRecord) {
  const explicit = normalizedEvaluationTimestamp(
    record.lastUpdatedAt || record.rawDataPreview?.["Last Updated"]
  );
  if (explicit) return explicit;

  const originalFromIdentity = evaluationTimestampFromIdentity(record);
  const currentAudit = normalizedEvaluationTimestamp(record.auditTimestamp);
  if (!originalFromIdentity || !currentAudit) return "";

  const originalMs = new Date(originalFromIdentity).getTime();
  const currentAuditMs = new Date(currentAudit).getTime();
  if (!Number.isFinite(originalMs) || !Number.isFinite(currentAuditMs)) return "";
  if (Math.abs(currentAuditMs - originalMs) < 5_000) return "";

  const candidates = [
    currentAudit,
    normalizedEvaluationTimestamp(record.submittedAt),
    normalizedEvaluationTimestamp(record.updatedAt),
  ]
    .filter(Boolean)
    .map((value) => ({ value, ms: new Date(value).getTime() }))
    .filter((item) => Number.isFinite(item.ms) && item.ms >= currentAuditMs - 5_000)
    .sort((left, right) => right.ms - left.ms);

  return candidates[0]?.value || currentAudit;
}
`;

  source = source.replace(anchor, helper + anchor);
  fs.writeFileSync(file, source, 'utf8');
  console.log('Restored evaluation timestamp helpers required by Dashboard.');
} else {
  console.log('Evaluation timestamp helpers already present.');
}
