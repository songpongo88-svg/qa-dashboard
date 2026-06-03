const env = (import.meta as any).env || {};
const SUPABASE_URL = String(env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_ANON_KEY = String(env.VITE_SUPABASE_ANON_KEY || "");
const EVALUATION_TABLE = String(env.VITE_QA_EVALUATION_TABLE || "qa_evaluations");
const LOCAL_EVALUATION_HISTORY_KEY = "qa-dashboard:create-evaluation:history";
const REMOTE_EVALUATION_CACHE_KEY = "qa-dashboard:create-evaluation:remote-cache";
const DELETED_EVALUATION_IDS_KEY = "qa-dashboard:create-evaluation:deleted-ids";

export type StoredEvaluationTopic = {
  code: string;
  title: string;
  max: number;
  score: number;
  comment: string;
};

export type StoredEvaluation = {
  id: string;
  evaluationKey: string;
  caseId: string;
  agentName: string;
  targetUsername: string;
  targetDisplayName: string;
  targetEmail: string;
  targetRole: string;
  auditDate: string;
  auditTimestamp: string;
  waitingTime: string;
  serviceTime: string;
  caseUrl: string;
  inquiry: string;
  caseDescription: string;
  evidenceUrls: string[];
  criticalError: boolean;
  finalScore: number;
  grade: string;
  qaScheme: string;
  rubricName: string;
  rubricPeriod: string;
  completedTopics: number;
  totalTopics: number;
  strengths: string[];
  improvements: string[];
  topics: StoredEvaluationTopic[];
  rawDataPreview: Record<string, string | number>;
  evaluatorUsername: string;
  evaluatorName: string;
  submittedAt: string;
  createdAt?: string;
  updatedAt?: string;
};

export function isEvaluationStoreConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function endpoint(query = "") {
  return `${SUPABASE_URL}/rest/v1/${EVALUATION_TABLE}${query}`;
}

function headers(prefer?: string) {
  const nextHeaders: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
  if (prefer) nextHeaders.Prefer = prefer;
  return nextHeaders;
}

function toArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item || "")).filter(Boolean) : [];
}

function compactStoredText(value: unknown, maxLength = 32000) {
  const text = String(value ?? "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 28)}... [trimmed for central sync]`;
}

function compactStoredUrl(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (text.startsWith("data:")) return "[Local attachment preview only - reattach if needed]";
  return compactStoredText(text, 32000);
}

function compactStoredRecord(record: StoredEvaluation): StoredEvaluation {
  return {
    ...record,
    caseUrl: compactStoredUrl(record.caseUrl),
    inquiry: compactStoredText(record.inquiry),
    caseDescription: compactStoredText(record.caseDescription),
    evidenceUrls: (record.evidenceUrls || []).map(compactStoredUrl).filter(Boolean),
    strengths: (record.strengths || []).map((item) => compactStoredText(item, 2000)),
    improvements: (record.improvements || []).map((item) => compactStoredText(item, 2000)),
    topics: (record.topics || []).map((topic) => ({
      ...topic,
      title: compactStoredText(topic.title, 2000),
      comment: compactStoredText(topic.comment),
    })),
    rawDataPreview: Object.fromEntries(
      Object.entries(record.rawDataPreview || {}).map(([key, value]) => [
        key,
        typeof value === "number" ? value : compactStoredText(value),
      ])
    ),
  };
}

function toTopics(value: unknown): StoredEvaluationTopic[] {
  if (!Array.isArray(value)) return [];
  return value.map((item: any) => ({
    code: String(item?.code || ""),
    title: String(item?.title || item?.label || ""),
    max: Number(item?.max || 0),
    score: Number(item?.score || 0),
    comment: String(item?.comment || item?.reason || ""),
  })).filter((item) => item.code);
}

function toEvaluation(row: any): StoredEvaluation {
  return {
    id: String(row.id || ""),
    evaluationKey: String(row.evaluation_key || row.id || ""),
    caseId: String(row.case_id || ""),
    agentName: String(row.agent_name || ""),
    targetUsername: String(row.target_username || ""),
    targetDisplayName: String(row.target_display_name || row.agent_name || ""),
    targetEmail: String(row.target_email || ""),
    targetRole: String(row.target_role || ""),
    auditDate: String(row.audit_date || ""),
    auditTimestamp: String(row.audit_timestamp || ""),
    waitingTime: String(row.waiting_time || ""),
    serviceTime: String(row.service_time || ""),
    caseUrl: String(row.case_url || ""),
    inquiry: String(row.inquiry || ""),
    caseDescription: String(row.case_description || ""),
    evidenceUrls: toArray(row.evidence_urls),
    criticalError: row.critical_error === true,
    finalScore: Number(row.final_score || 0),
    grade: String(row.grade || ""),
    qaScheme: String(row.qa_scheme || ""),
    rubricName: String(row.rubric_name || ""),
    rubricPeriod: String(row.rubric_period || ""),
    completedTopics: Number(row.completed_topics || 0),
    totalTopics: Number(row.total_topics || 0),
    strengths: toArray(row.strengths),
    improvements: toArray(row.improvements),
    topics: toTopics(row.topics),
    rawDataPreview: (row.raw_data_preview || {}) as Record<string, string | number>,
    evaluatorUsername: String(row.evaluator_username || ""),
    evaluatorName: String(row.evaluator_name || ""),
    submittedAt: String(row.submitted_at || row.created_at || ""),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

function normalizeLocalString(value: unknown) {
  return String(value || "").trim();
}

function toLocalEvaluation(row: any): StoredEvaluation {
  const fallbackId = [
    "local-eval",
    normalizeLocalString(row?.caseId || "UNTITLED"),
    normalizeLocalString(row?.agentName || row?.targetDisplayName || "UNKNOWN"),
    normalizeLocalString(row?.auditDate || "no-date"),
    normalizeLocalString(row?.submittedAt || row?.evaluationSubmittedAt || row?.recordId || Date.now()),
  ].join("|").replace(/[^a-zA-Z0-9_-]/g, "_");

  const submittedAt = normalizeLocalString(
    row?.submittedAt ||
      row?.evaluationSubmittedAt ||
      row?.rawDataPreview?.["Evaluation Submitted At"] ||
      row?.rawDataPreview?.["Draft Saved At"] ||
      row?.savedAt ||
      ""
  );

  return {
    id: normalizeLocalString(row?.recordId || row?.id || fallbackId),
    evaluationKey: normalizeLocalString(row?.evaluationKey || row?.recordId || row?.id || fallbackId),
    caseId: normalizeLocalString(row?.caseId),
    agentName: normalizeLocalString(row?.agentName || row?.targetDisplayName),
    targetUsername: normalizeLocalString(row?.targetUsername),
    targetDisplayName: normalizeLocalString(row?.targetDisplayName || row?.agentName),
    targetEmail: normalizeLocalString(row?.targetEmail),
    targetRole: normalizeLocalString(row?.targetRole),
    auditDate: normalizeLocalString(row?.auditDate),
    auditTimestamp: normalizeLocalString(row?.auditTimestamp || submittedAt),
    waitingTime: normalizeLocalString(row?.waitingTime),
    serviceTime: normalizeLocalString(row?.serviceTime),
    caseUrl: normalizeLocalString(row?.caseUrl),
    inquiry: normalizeLocalString(row?.inquiry),
    caseDescription: normalizeLocalString(row?.caseDescription),
    evidenceUrls: toArray(row?.evidenceUrls),
    criticalError: row?.criticalError === true,
    finalScore: Number(row?.finalScore || 0),
    grade: normalizeLocalString(row?.grade),
    qaScheme: normalizeLocalString(row?.qaScheme),
    rubricName: normalizeLocalString(row?.rubricName),
    rubricPeriod: normalizeLocalString(row?.rubricPeriod),
    completedTopics: Number(row?.completedTopics || 0),
    totalTopics: Number(row?.totalTopics || 0),
    strengths: toArray(row?.strengths),
    improvements: toArray(row?.improvements),
    topics: toTopics(row?.topics),
    rawDataPreview: (row?.rawDataPreview || {}) as Record<string, string | number>,
    evaluatorUsername: normalizeLocalString(row?.evaluatorUsername),
    evaluatorName: normalizeLocalString(row?.evaluatorName || row?.rawDataPreview?.["Evaluator Name"]),
    submittedAt,
    createdAt: submittedAt,
    updatedAt: submittedAt,
  };
}

function readLocalEvaluationHistory() {
  if (typeof window === "undefined") return [];
  const rawHistory = window.localStorage.getItem(LOCAL_EVALUATION_HISTORY_KEY);
  if (!rawHistory) return [];

  try {
    const parsed = JSON.parse(rawHistory);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(toLocalEvaluation).filter((item) => item.id && item.caseId && item.agentName);
  } catch (error) {
    console.warn("Load local evaluation history failed", error);
    return [];
  }
}

function readRemoteEvaluationCache() {
  if (typeof window === "undefined") return [];
  const rawCache = window.localStorage.getItem(REMOTE_EVALUATION_CACHE_KEY);
  if (!rawCache) return [];

  try {
    const parsed = JSON.parse(rawCache);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(toLocalEvaluation).filter((item) => item.id && item.caseId && item.agentName);
  } catch (error) {
    console.warn("Load cached evaluation history failed", error);
    return [];
  }
}

function writeRemoteEvaluationCache(records: StoredEvaluation[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REMOTE_EVALUATION_CACHE_KEY, JSON.stringify(records));
  } catch (error) {
    console.warn("Cache evaluation history skipped", error);
  }
}

function readDeletedEvaluationIds() {
  if (typeof window === "undefined") return new Set<string>();
  const raw = window.localStorage.getItem(DELETED_EVALUATION_IDS_KEY);
  if (!raw) return new Set<string>();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.map((item) => String(item || "").trim()).filter(Boolean));
  } catch (error) {
    console.warn("Load deleted evaluation markers failed", error);
    return new Set<string>();
  }
}

function rememberDeletedEvaluationId(id: string) {
  if (typeof window === "undefined") return;
  const normalizedId = String(id || "").trim();
  if (!normalizedId) return;
  const deletedIds = readDeletedEvaluationIds();
  deletedIds.add(normalizedId);
  window.localStorage.setItem(DELETED_EVALUATION_IDS_KEY, JSON.stringify([...deletedIds]));
}

function evaluationIdentityValues(item: Pick<StoredEvaluation, "id" | "evaluationKey" | "caseId">) {
  return [
    item.id,
    item.evaluationKey,
    item.caseId ? `case:${String(item.caseId).trim().toUpperCase()}` : "",
  ].map((value) => String(value || "").trim()).filter(Boolean);
}

function isDeletedEvaluation(item: Pick<StoredEvaluation, "id" | "evaluationKey" | "caseId">, deletedIds = readDeletedEvaluationIds()) {
  return evaluationIdentityValues(item).some((value) => deletedIds.has(value));
}

function removeEvaluationFromStorage(id: string, caseId?: string) {
  if (typeof window === "undefined") return;
  const normalizedId = String(id || "").trim();
  if (!normalizedId) return;
  rememberDeletedEvaluationId(normalizedId);
  const normalizedCaseId = String(caseId || "").trim().toUpperCase();
  if (normalizedCaseId) rememberDeletedEvaluationId(`case:${normalizedCaseId}`);
  const deletedMarkers = [normalizedId, normalizedCaseId ? `case:${normalizedCaseId}` : ""].filter(Boolean);

  const removeFromKey = (storageKey: string) => {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const nextRows = parsed.filter((row: any) => {
        const candidateIds = [
          row?.id,
          row?.recordId,
          row?.evaluationKey,
          row?.evaluation_key,
          row?.caseId ? `case:${String(row.caseId).trim().toUpperCase()}` : "",
          row?.case_id ? `case:${String(row.case_id).trim().toUpperCase()}` : "",
        ].map((value) => String(value || "").trim());
        return !deletedMarkers.some((marker) => candidateIds.includes(marker));
      });
      window.localStorage.setItem(storageKey, JSON.stringify(nextRows));
    } catch (error) {
      console.warn("Remove evaluation from local storage skipped", error);
    }
  };

  removeFromKey(LOCAL_EVALUATION_HISTORY_KEY);
  removeFromKey(REMOTE_EVALUATION_CACHE_KEY);
}

function mergeEvaluationSources(remote: StoredEvaluation[], local: StoredEvaluation[]) {
  const merged = new Map<string, StoredEvaluation>();
  const deletedIds = readDeletedEvaluationIds();
  local.forEach((item) => {
    if (isDeletedEvaluation(item, deletedIds)) return;
    merged.set(item.evaluationKey || item.id, item);
  });
  remote.forEach((item) => {
    if (isDeletedEvaluation(item, deletedIds)) return;
    merged.set(item.evaluationKey || item.id, item);
  });

  return [...merged.values()].sort((a, b) => {
    const left = new Date(a.submittedAt || a.updatedAt || a.createdAt || 0).getTime();
    const right = new Date(b.submittedAt || b.updatedAt || b.createdAt || 0).getTime();
    return right - left;
  });
}

function fromEvaluation(record: StoredEvaluation) {
  const now = new Date().toISOString();
  return {
    id: record.id,
    evaluation_key: record.evaluationKey,
    case_id: record.caseId,
    agent_name: record.agentName,
    target_username: record.targetUsername,
    target_display_name: record.targetDisplayName,
    target_email: record.targetEmail,
    target_role: record.targetRole,
    audit_date: record.auditDate || null,
    audit_timestamp: record.auditTimestamp || "",
    waiting_time: record.waitingTime || "",
    service_time: record.serviceTime || "",
    case_url: record.caseUrl || "",
    inquiry: record.inquiry || "",
    case_description: record.caseDescription || "",
    evidence_urls: record.evidenceUrls || [],
    critical_error: record.criticalError,
    final_score: Number(record.finalScore || 0),
    grade: record.grade || "",
    qa_scheme: record.qaScheme || "",
    rubric_name: record.rubricName || "",
    rubric_period: record.rubricPeriod || "",
    completed_topics: Number(record.completedTopics || 0),
    total_topics: Number(record.totalTopics || 0),
    strengths: record.strengths || [],
    improvements: record.improvements || [],
    topics: record.topics || [],
    raw_data_preview: record.rawDataPreview || {},
    evaluator_username: record.evaluatorUsername || "",
    evaluator_name: record.evaluatorName || "",
    submitted_at: record.submittedAt || now,
    updated_at: now,
  };
}

export async function upsertStoredEvaluation(record: StoredEvaluation) {
  if (!isEvaluationStoreConfigured()) throw new Error("Supabase is not configured.");
  const response = await fetch(endpoint("?on_conflict=id"), {
    method: "POST",
    headers: headers("resolution=merge-duplicates,return=minimal"),
    body: JSON.stringify([fromEvaluation(compactStoredRecord(record))]),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Supabase evaluation upsert failed: ${response.status}${detail ? ` - ${detail}` : ""}`);
  }
}

export async function deleteStoredEvaluation(id: string, caseId?: string) {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) throw new Error("Evaluation id is required.");
  if (!isEvaluationStoreConfigured()) {
    removeEvaluationFromStorage(normalizedId, caseId);
    return;
  }
  const params = new URLSearchParams({
    id: `eq.${normalizedId}`,
  });
  const response = await fetch(endpoint(`?${params.toString()}`), {
    method: "DELETE",
    headers: headers("return=minimal"),
  });
  if (!response.ok) throw new Error(`Supabase evaluation delete failed: ${response.status}`);
  removeEvaluationFromStorage(normalizedId, caseId);
}

async function syncLocalEvaluationsToRemote(remoteEvaluations: StoredEvaluation[], localEvaluations: StoredEvaluation[]) {
  if (!isEvaluationStoreConfigured()) return [];
  const deletedIds = readDeletedEvaluationIds();
  const remoteIdentities = new Set(remoteEvaluations.flatMap(evaluationIdentityValues));
  const restored: StoredEvaluation[] = [];

  for (const item of localEvaluations) {
    if (isDeletedEvaluation(item, deletedIds)) continue;
    const identities = evaluationIdentityValues(item);
    if (identities.some((identity) => remoteIdentities.has(identity))) continue;
    try {
      const restoredRecord = compactStoredRecord(item);
      await upsertStoredEvaluation(restoredRecord);
      identities.forEach((identity) => remoteIdentities.add(identity));
      restored.push(restoredRecord);
    } catch (error) {
      console.warn("Sync local evaluation to Supabase skipped", item.caseId, error);
    }
  }

  return restored;
}

export async function fetchStoredEvaluations(limit = 5000) {
  const localEvaluations = readLocalEvaluationHistory();
  const cachedEvaluations = readRemoteEvaluationCache();
  const localSources = mergeEvaluationSources(cachedEvaluations, localEvaluations);
  if (!isEvaluationStoreConfigured()) {
    return localSources.slice(0, limit);
  }

  const params = new URLSearchParams({
    select: "*",
    order: "submitted_at.desc",
    limit: String(limit),
  });
  const response = await fetch(endpoint(`?${params.toString()}`), {
    method: "GET",
    headers: headers(),
  });
  if (!response.ok) {
    console.warn("Load stored evaluations failed", response.status);
    return localSources.slice(0, limit);
  }
  const remoteEvaluations = ((await response.json()) as any[]).map(toEvaluation).filter((item) => item.id && item.caseId);
  const syncedLocalEvaluations = await syncLocalEvaluationsToRemote(remoteEvaluations, localSources);
  const availableEvaluations = mergeEvaluationSources([...remoteEvaluations, ...syncedLocalEvaluations], localSources);
  writeRemoteEvaluationCache(availableEvaluations);
  return availableEvaluations.slice(0, limit);
}
