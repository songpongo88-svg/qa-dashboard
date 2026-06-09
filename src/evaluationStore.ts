import { initializeApp, getApps } from "firebase/app";
import { collection, deleteDoc, doc, getDocs, getFirestore, limit as firestoreLimit, orderBy, query, setDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref as storageRef, uploadBytes } from "firebase/storage";

const env = (import.meta as any).env || {};
const SUPABASE_URL = String(env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_ANON_KEY = String(env.VITE_SUPABASE_ANON_KEY || "");
const EVALUATION_TABLE = String(env.VITE_QA_EVALUATION_TABLE || "qa_evaluations");

const FIREBASE_API_KEY = String(env.VITE_FIREBASE_API_KEY || "");
const FIREBASE_AUTH_DOMAIN = String(env.VITE_FIREBASE_AUTH_DOMAIN || "");
const FIREBASE_PROJECT_ID = String(env.VITE_FIREBASE_PROJECT_ID || "");
const FIREBASE_STORAGE_BUCKET = String(env.VITE_FIREBASE_STORAGE_BUCKET || "");
const FIREBASE_MESSAGING_SENDER_ID = String(env.VITE_FIREBASE_MESSAGING_SENDER_ID || "");
const FIREBASE_APP_ID = String(env.VITE_FIREBASE_APP_ID || "");
const FIREBASE_EVALUATION_COLLECTION = String(
  env.VITE_FIREBASE_QA_EVALUATION_COLLECTION || env.VITE_QA_EVALUATION_TABLE || "qa_evaluations"
);

const LOCAL_EVALUATION_HISTORY_KEY = "qa-dashboard:create-evaluation:history:v2";
const REMOTE_EVALUATION_CACHE_KEY = "qa-dashboard:create-evaluation:remote-cache:v2";
const DELETED_EVALUATION_IDS_KEY = "qa-dashboard:create-evaluation:deleted-ids:v2";
const SUPABASE_REQUEST_TIMEOUT_MS = 2500;
const DEFAULT_EVALUATION_LIMIT = 500;
const MAX_EVALUATION_LIMIT = 1000;
const REMOTE_EVALUATION_READ_CACHE_TTL_MS = 2 * 60 * 1000;
const AUTO_SYNC_LOCAL_EVALUATIONS =
  String(env.VITE_QA_AUTO_SYNC_LOCAL_EVALUATIONS || "").toLowerCase() === "true";
const EVALUATION_SELECT_COLUMNS = [
  "id",
  "evaluation_key",
  "case_id",
  "agent_name",
  "target_username",
  "target_display_name",
  "target_email",
  "target_role",
  "audit_date",
  "audit_timestamp",
  "waiting_time",
  "service_time",
  "case_url",
  "inquiry",
  "case_description",
  "evidence_urls",
  "critical_error",
  "final_score",
  "grade",
  "qa_scheme",
  "rubric_name",
  "rubric_period",
  "completed_topics",
  "total_topics",
  "strengths",
  "improvements",
  "topics",
  "raw_data_preview",
  "evaluator_username",
  "evaluator_name",
  "submitted_at",
  "created_at",
  "updated_at",
].join(",");

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

type CachedRemoteEvaluationRequest = {
  expiresAt: number;
  promise: Promise<StoredEvaluation[]>;
};

const remoteEvaluationReadCache = new Map<string, CachedRemoteEvaluationRequest>();

export function isFirebaseEvaluationConfigured() {
  return Boolean(FIREBASE_API_KEY && FIREBASE_PROJECT_ID && FIREBASE_APP_ID);
}

export function isSupabaseEvaluationConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function isEvaluationStoreConfigured() {
  return isFirebaseEvaluationConfigured();
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

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), SUPABASE_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

function normalizeEvaluationLimit(limit: number) {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed)) return DEFAULT_EVALUATION_LIMIT;
  return Math.min(Math.max(Math.floor(parsed), 1), MAX_EVALUATION_LIMIT);
}

function clearRemoteEvaluationReadCache() {
  remoteEvaluationReadCache.clear();
}

async function cachedRemoteEvaluations(limit: number, request: () => Promise<StoredEvaluation[]>) {
  const now = Date.now();
  const cacheKey = `submitted-at-desc:${limit}`;
  const cached = remoteEvaluationReadCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.promise;

  const promise = request().catch((error) => {
    remoteEvaluationReadCache.delete(cacheKey);
    throw error;
  });
  remoteEvaluationReadCache.set(cacheKey, {
    expiresAt: now + REMOTE_EVALUATION_READ_CACHE_TTL_MS,
    promise,
  });
  return promise;
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

function localField(row: any, camelKey: string, snakeKey?: string) {
  return row?.[camelKey] ?? row?.[snakeKey || camelKey];
}

function localRawPreview(row: any) {
  return (row?.rawDataPreview || row?.raw_data_preview || {}) as Record<string, string | number>;
}

function toLocalEvaluation(row: any): StoredEvaluation {
  const rawDataPreview = localRawPreview(row);
  const caseId = normalizeLocalString(localField(row, "caseId", "case_id"));
  const agentName = normalizeLocalString(localField(row, "agentName", "agent_name") || localField(row, "targetDisplayName", "target_display_name"));
  const auditDate = normalizeLocalString(localField(row, "auditDate", "audit_date"));
  const fallbackId = [
    "local-eval",
    caseId || "UNTITLED",
    agentName || "UNKNOWN",
    auditDate || "no-date",
    normalizeLocalString(localField(row, "submittedAt", "submitted_at") || row?.evaluationSubmittedAt || row?.recordId || Date.now()),
  ].join("|").replace(/[^a-zA-Z0-9_-]/g, "_");

  const submittedAt = normalizeLocalString(
    localField(row, "submittedAt", "submitted_at") ||
      row?.evaluationSubmittedAt ||
      rawDataPreview?.["Evaluation Submitted At"] ||
      rawDataPreview?.["Timestamp"] ||
      row?.savedAt ||
      ""
  );

  return {
    id: normalizeLocalString(row?.recordId || row?.id || fallbackId),
    evaluationKey: normalizeLocalString(localField(row, "evaluationKey", "evaluation_key") || row?.recordId || row?.id || fallbackId),
    caseId,
    agentName,
    targetUsername: normalizeLocalString(localField(row, "targetUsername", "target_username")),
    targetDisplayName: normalizeLocalString(localField(row, "targetDisplayName", "target_display_name") || agentName),
    targetEmail: normalizeLocalString(localField(row, "targetEmail", "target_email")),
    targetRole: normalizeLocalString(localField(row, "targetRole", "target_role")),
    auditDate,
    auditTimestamp: normalizeLocalString(localField(row, "auditTimestamp", "audit_timestamp") || submittedAt),
    waitingTime: normalizeLocalString(localField(row, "waitingTime", "waiting_time")),
    serviceTime: normalizeLocalString(localField(row, "serviceTime", "service_time")),
    caseUrl: normalizeLocalString(localField(row, "caseUrl", "case_url")),
    inquiry: normalizeLocalString(row?.inquiry),
    caseDescription: normalizeLocalString(localField(row, "caseDescription", "case_description")),
    evidenceUrls: toArray(localField(row, "evidenceUrls", "evidence_urls")),
    criticalError: localField(row, "criticalError", "critical_error") === true,
    finalScore: Number(localField(row, "finalScore", "final_score") || rawDataPreview?.["Final Score"] || 0),
    grade: normalizeLocalString(row?.grade),
    qaScheme: normalizeLocalString(localField(row, "qaScheme", "qa_scheme")),
    rubricName: normalizeLocalString(localField(row, "rubricName", "rubric_name")),
    rubricPeriod: normalizeLocalString(localField(row, "rubricPeriod", "rubric_period")),
    completedTopics: Number(localField(row, "completedTopics", "completed_topics") || 0),
    totalTopics: Number(localField(row, "totalTopics", "total_topics") || 0),
    strengths: toArray(row?.strengths),
    improvements: toArray(row?.improvements),
    topics: toTopics(row?.topics),
    rawDataPreview,
    evaluatorUsername: normalizeLocalString(localField(row, "evaluatorUsername", "evaluator_username")),
    evaluatorName: normalizeLocalString(localField(row, "evaluatorName", "evaluator_name") || rawDataPreview?.["Evaluator Name"]),
    submittedAt,
    createdAt: submittedAt,
    updatedAt: submittedAt,
  };
}

function looksLikeSubmittedEvaluation(row: any) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  const rawDataPreview = localRawPreview(row);
  const caseId = normalizeLocalString(localField(row, "caseId", "case_id"));
  const agentName = normalizeLocalString(localField(row, "agentName", "agent_name") || localField(row, "targetDisplayName", "target_display_name"));
  if (!caseId || !agentName) return false;

  const status = normalizeLocalString(localField(row, "evaluationStatus", "evaluation_status") || rawDataPreview?.["Evaluation Status"]).toLowerCase();
  if (status.includes("draft") || status.includes("not started")) return false;

  const hasSubmittedAt = Boolean(
    localField(row, "submittedAt", "submitted_at") ||
      row?.evaluationSubmittedAt ||
      rawDataPreview?.["Evaluation Submitted At"] ||
      rawDataPreview?.["Timestamp"]
  );
  const hasScore = localField(row, "finalScore", "final_score") !== undefined || rawDataPreview?.["Final Score"] !== undefined;
  const hasTopics = Array.isArray(row?.topics) && row.topics.length > 0;
  return hasSubmittedAt && (hasScore || hasTopics);
}

function collectLocalEvaluations(value: unknown, records: StoredEvaluation[], depth = 0) {
  if (depth > 5 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectLocalEvaluations(item, records, depth + 1));
    return;
  }
  if (typeof value !== "object") return;

  const row = value as Record<string, unknown>;
  if (looksLikeSubmittedEvaluation(row)) {
    const evaluation = toLocalEvaluation(row);
    if (evaluation.id && evaluation.caseId && evaluation.agentName) records.push(evaluation);
    return;
  }

  Object.values(row).forEach((item) => collectLocalEvaluations(item, records, depth + 1));
}

function readRecoveredLocalEvaluations() {
  if (typeof window === "undefined") return [];
  const records: StoredEvaluation[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || key === DELETED_EVALUATION_IDS_KEY) continue;
    const normalizedKey = key.toLowerCase();
    if (!normalizedKey.includes("qa-dashboard") && !normalizedKey.includes("evaluation")) continue;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      collectLocalEvaluations(JSON.parse(raw), records);
    } catch {
      // Non-JSON keys are not evaluation stores.
    }
  }
  return records;
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

function forgetDeletedEvaluationMarkers(record: Pick<StoredEvaluation, "id" | "evaluationKey" | "caseId">) {
  if (typeof window === "undefined") return;
  const deletedIds = readDeletedEvaluationIds();
  let changed = false;
  for (const marker of evaluationIdentityValues(record)) {
    if (deletedIds.delete(marker)) changed = true;
  }
  if (!changed) return;
  window.localStorage.setItem(DELETED_EVALUATION_IDS_KEY, JSON.stringify([...deletedIds]));
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

let firebaseEvaluationDb: ReturnType<typeof getFirestore> | null = null;

function getFirebaseEvaluationDb() {
  if (!isFirebaseEvaluationConfigured()) return null;
  if (firebaseEvaluationDb) return firebaseEvaluationDb;

  const app =
    getApps().length > 0
      ? getApps()[0]
      : initializeApp({
          apiKey: FIREBASE_API_KEY,
          authDomain: FIREBASE_AUTH_DOMAIN,
          projectId: FIREBASE_PROJECT_ID,
          storageBucket: FIREBASE_STORAGE_BUCKET,
          messagingSenderId: FIREBASE_MESSAGING_SENDER_ID,
          appId: FIREBASE_APP_ID,
        });

  firebaseEvaluationDb = getFirestore(app);
  return firebaseEvaluationDb;
}


type PendingEvidenceUpload = {
  id: string;
  caseId: string;
  url: string;
  name: string;
  type: string;
  uploadedAt: string;
};

const PENDING_EVIDENCE_UPLOADS_KEY = "qa-dashboard:pending-evidence-uploads:v1";
const PENDING_EVIDENCE_MAX_AGE_MS = 60 * 60 * 1000;
let firebaseEvaluationStorage: ReturnType<typeof getStorage> | null = null;
let pendingEvidenceUploadTasks: Promise<PendingEvidenceUpload | null>[] = [];
let evidenceAttachmentListenerInstalled = false;

function getFirebaseEvaluationStorage() {
  if (!isFirebaseEvaluationConfigured() || !FIREBASE_STORAGE_BUCKET) return null;
  if (firebaseEvaluationStorage) return firebaseEvaluationStorage;

  const app =
    getApps().length > 0
      ? getApps()[0]
      : initializeApp({
          apiKey: FIREBASE_API_KEY,
          authDomain: FIREBASE_AUTH_DOMAIN,
          projectId: FIREBASE_PROJECT_ID,
          storageBucket: FIREBASE_STORAGE_BUCKET,
          messagingSenderId: FIREBASE_MESSAGING_SENDER_ID,
          appId: FIREBASE_APP_ID,
        });

  firebaseEvaluationStorage = getStorage(app);
  return firebaseEvaluationStorage;
}

function sanitizeStoragePathPart(value: unknown, fallback = "file") {
  const text = String(value || "").trim();
  const safe = text
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  return safe || fallback;
}

function normalizeEvidenceCaseId(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

function getCurrentCaseIdFromPage() {
  if (typeof document === "undefined") return "";

  const values = Array.from(document.querySelectorAll("input, textarea, select"))
    .map((node: any) => String(node?.value || "").trim())
    .filter(Boolean);

  const exact = values.find((value) => /^AA[A-Z0-9_-]{3,}$/i.test(value));
  if (exact) return normalizeEvidenceCaseId(exact);

  const anyMatch = values.join(" ").match(/\bAA[A-Z0-9_-]{3,}\b/i);
  return normalizeEvidenceCaseId(anyMatch?.[0] || "");
}

function readPendingEvidenceUploads(): PendingEvidenceUpload[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PENDING_EVIDENCE_UPLOADS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter((item: any) => {
      const uploadedAt = new Date(item?.uploadedAt || 0).getTime();
      return item?.url && now - uploadedAt <= PENDING_EVIDENCE_MAX_AGE_MS;
    });
  } catch {
    return [];
  }
}

function writePendingEvidenceUploads(items: PendingEvidenceUpload[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PENDING_EVIDENCE_UPLOADS_KEY, JSON.stringify(items.slice(-80)));
}

function rememberPendingEvidenceUpload(item: PendingEvidenceUpload) {
  const current = readPendingEvidenceUploads();
  writePendingEvidenceUploads([...current, item]);
}

function isUploadableEvidenceValue(value: unknown) {
  const text = String(value || "").trim();
  return text.startsWith("data:") || text.startsWith("blob:");
}

function isEvidencePlaceholder(value: unknown) {
  const text = String(value || "").trim().toLowerCase();
  return (
    text.startsWith("attached evidence") ||
    text.startsWith("attachment:") ||
    text.includes("local attachment preview only") ||
    text.includes("preview only") ||
    text.includes("(image/") ||
    text.includes("(application/pdf")
  );
}

function isRemoteEvidenceUrl(value: unknown) {
  const text = String(value || "").trim();
  return text.startsWith("http://") || text.startsWith("https://");
}

function extensionFromMimeType(contentType: string) {
  const type = String(contentType || "").toLowerCase();
  if (type.includes("png")) return "png";
  if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
  if (type.includes("webp")) return "webp";
  if (type.includes("gif")) return "gif";
  if (type.includes("pdf")) return "pdf";
  return "bin";
}

async function uploadEvidenceBlobToFirebase(
  blob: Blob,
  fileName: string,
  contentType: string,
  caseId: string
) {
  const storage = getFirebaseEvaluationStorage();
  if (!storage) throw new Error("Firebase Storage is not configured.");

  const safeCaseId = sanitizeStoragePathPart(caseId || "uncategorized", "uncategorized");
  const safeName = sanitizeStoragePathPart(fileName || "evidence", "evidence");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const random = Math.random().toString(36).slice(2, 8);
  const path = `qa-evaluation-evidence/${safeCaseId}/${timestamp}-${random}-${safeName}`;

  const objectRef = storageRef(storage, path);
  await uploadBytes(objectRef, blob, {
    contentType: contentType || blob.type || "application/octet-stream",
  });
  return getDownloadURL(objectRef);
}

async function uploadEvidenceFileToFirebase(file: File, caseId: string): Promise<PendingEvidenceUpload | null> {
  try {
    const url = await uploadEvidenceBlobToFirebase(
      file,
      file.name || `evidence.${extensionFromMimeType(file.type)}`,
      file.type || "application/octet-stream",
      caseId
    );

    const item: PendingEvidenceUpload = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      caseId: normalizeEvidenceCaseId(caseId),
      url,
      name: file.name || "Attached Evidence",
      type: file.type || "application/octet-stream",
      uploadedAt: new Date().toISOString(),
    };

    rememberPendingEvidenceUpload(item);
    return item;
  } catch (error) {
    console.warn("Upload evidence file to Firebase Storage failed", error);
    return null;
  }
}

async function uploadEvidenceValueToFirebase(
  value: unknown,
  record: StoredEvaluation,
  index: number
) {
  const text = String(value || "").trim();
  if (!isUploadableEvidenceValue(text)) return text;

  const response = await fetch(text);
  const blob = await response.blob();
  const ext = extensionFromMimeType(blob.type);
  const caseId = normalizeEvidenceCaseId(record.caseId || record.id || record.evaluationKey || "uncategorized");

  return uploadEvidenceBlobToFirebase(
    blob,
    `attached-evidence-${index + 1}.${ext}`,
    blob.type || "application/octet-stream",
    caseId
  );
}

async function waitForPendingEvidenceUploadTasks() {
  if (!pendingEvidenceUploadTasks.length) return;

  const tasks = pendingEvidenceUploadTasks.slice();
  pendingEvidenceUploadTasks = [];

  await Promise.allSettled(tasks);
}

async function takePendingEvidenceUploadsForRecord(record: StoredEvaluation) {
  await waitForPendingEvidenceUploadTasks();

  const current = readPendingEvidenceUploads();
  const caseId = normalizeEvidenceCaseId(record.caseId);
  const now = Date.now();

  const matched: PendingEvidenceUpload[] = [];
  const remaining: PendingEvidenceUpload[] = [];

  current.forEach((item) => {
    const itemCaseId = normalizeEvidenceCaseId(item.caseId);
    const uploadedAt = new Date(item.uploadedAt || 0).getTime();
    const isFresh = now - uploadedAt <= PENDING_EVIDENCE_MAX_AGE_MS;
    const caseMatched = caseId && itemCaseId && itemCaseId === caseId;
    const recentWithoutCase = !itemCaseId && isFresh;

    if (isFresh && (caseMatched || recentWithoutCase)) {
      matched.push(item);
    } else {
      remaining.push(item);
    }
  });

  writePendingEvidenceUploads(remaining);
  return matched;
}

function updateRawPreviewEvidenceUrls(
  rawDataPreview: Record<string, string | number>,
  evidenceUrls: string[]
) {
  const joined = evidenceUrls.filter(isRemoteEvidenceUrl).join("\n");
  if (!joined) return rawDataPreview;

  return {
    ...rawDataPreview,
    "Evidence URL / PDF / IMAGE": joined,
    "Evidence URL": joined,
    "Case Image URL": joined,
    "Case Image URL / ภาพประกอบเคส": joined,
  };
}

async function uploadEvaluationEvidenceAttachments(record: StoredEvaluation): Promise<StoredEvaluation> {
  const pendingUploads = await takePendingEvidenceUploadsForRecord(record);
  const pendingUrls = pendingUploads.map((item) => item.url).filter(Boolean);

  const currentEvidenceUrls = Array.isArray(record.evidenceUrls) ? record.evidenceUrls : [];
  const nextEvidenceUrls: string[] = [];

  for (let index = 0; index < currentEvidenceUrls.length; index += 1) {
    const value = currentEvidenceUrls[index];

    if (isUploadableEvidenceValue(value)) {
      try {
        const uploadedUrl = await uploadEvidenceValueToFirebase(value, record, index);
        if (uploadedUrl) nextEvidenceUrls.push(uploadedUrl);
      } catch (error) {
        console.warn("Upload inline evidence skipped", error);
      }
      continue;
    }

    if (isEvidencePlaceholder(value) && pendingUrls.length) {
      continue;
    }

    if (String(value || "").trim()) {
      nextEvidenceUrls.push(String(value).trim());
    }
  }

  pendingUrls.forEach((url) => {
    if (!nextEvidenceUrls.includes(url)) nextEvidenceUrls.push(url);
  });

  if (!nextEvidenceUrls.length) return record;

  return {
    ...record,
    evidenceUrls: nextEvidenceUrls,
    rawDataPreview: updateRawPreviewEvidenceUrls(record.rawDataPreview || {}, nextEvidenceUrls),
  };
}

function installEvidenceAttachmentUploadListener() {
  if (typeof document === "undefined") return;
  if (evidenceAttachmentListenerInstalled) return;

  evidenceAttachmentListenerInstalled = true;

  document.addEventListener(
    "change",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.type !== "file") return;
      if (!target.files || !target.files.length) return;

      const caseId = getCurrentCaseIdFromPage();
      const files = Array.from(target.files);

      files.forEach((file) => {
        const task = uploadEvidenceFileToFirebase(file, caseId);
        pendingEvidenceUploadTasks.push(task);
      });
    },
    true
  );
}

installEvidenceAttachmentUploadListener();

function saveEvaluationLocally(record: StoredEvaluation) {
  if (typeof window === "undefined") return;

  try {
    const localRecord = compactStoredRecord({
      ...record,
      submittedAt: record.submittedAt || new Date().toISOString(),
    });
    const recordIdentities = new Set(evaluationIdentityValues(localRecord));
    const currentLocal = readLocalEvaluationHistory().filter(
      (item) => !evaluationIdentityValues(item).some((identity) => recordIdentities.has(identity))
    );
    const nextLocal = [localRecord, ...currentLocal].slice(0, MAX_EVALUATION_LIMIT);
    window.localStorage.setItem(LOCAL_EVALUATION_HISTORY_KEY, JSON.stringify(nextLocal));
    forgetDeletedEvaluationMarkers(localRecord);
    clearRemoteEvaluationReadCache();
  } catch (error) {
    console.warn("Save evaluation locally failed", error);
  }
}

function toFirebaseEvaluation(record: StoredEvaluation) {
  return fromEvaluation(compactStoredRecord(record));
}

export async function upsertStoredEvaluation(record: StoredEvaluation) {
  const recordWithUploadedEvidence = await uploadEvaluationEvidenceAttachments(record);

  const localRecord = compactStoredRecord({
    ...recordWithUploadedEvidence,
    submittedAt: record.submittedAt || new Date().toISOString(),
  });

  saveEvaluationLocally(localRecord);

  if (!isFirebaseEvaluationConfigured()) {
    console.warn("Firebase evaluation store is not configured. Saved locally on this browser.");
    return;
  }

  try {
    const db = getFirebaseEvaluationDb();
    if (!db) return;

    const documentId = String(localRecord.id || localRecord.evaluationKey || localRecord.caseId || Date.now())
      .replace(/[\\/#?\[\]]/g, "_");

    await setDoc(
      doc(db, FIREBASE_EVALUATION_COLLECTION, documentId),
      toFirebaseEvaluation({ ...localRecord, id: documentId }),
      { merge: true }
    );

    clearRemoteEvaluationReadCache();
    forgetDeletedEvaluationMarkers({ ...localRecord, id: documentId });
  } catch (error) {
    console.warn("Firebase evaluation save failed. Saved locally on this browser.", error);
  }
}

export async function deleteStoredEvaluation(id: string, caseId?: string) {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) throw new Error("Evaluation id is required.");

  removeEvaluationFromStorage(normalizedId, caseId);

  if (!isFirebaseEvaluationConfigured()) return;

  try {
    const db = getFirebaseEvaluationDb();
    if (!db) return;

    const documentId = normalizedId.replace(/[\\/#?\[\]]/g, "_");
    await deleteDoc(doc(db, FIREBASE_EVALUATION_COLLECTION, documentId));
    clearRemoteEvaluationReadCache();
  } catch (error) {
    console.warn("Firebase evaluation delete skipped", error);
  }
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
      console.warn("Sync local evaluation to remote store skipped", item.caseId, error);
    }
  }

  return restored;
}

export async function fetchStoredEvaluations(limit = DEFAULT_EVALUATION_LIMIT) {
  const safeLimit = normalizeEvaluationLimit(limit);
  const localEvaluations = readLocalEvaluationHistory();
  const cachedEvaluations = isFirebaseEvaluationConfigured() ? [] : readRemoteEvaluationCache();
  const recoveredLocalEvaluations = isFirebaseEvaluationConfigured() ? [] : readRecoveredLocalEvaluations();
  const localSources = mergeEvaluationSources([...cachedEvaluations, ...recoveredLocalEvaluations], localEvaluations);

  if (isFirebaseEvaluationConfigured()) {
    const firebaseEvaluations = await cachedRemoteEvaluations(safeLimit, async () => {
      try {
        const db = getFirebaseEvaluationDb();
        if (!db) return [];
        const snapshot = await getDocs(
          query(
            collection(db, FIREBASE_EVALUATION_COLLECTION),
            orderBy("submitted_at", "desc"),
            firestoreLimit(safeLimit)
          )
        );
        return snapshot.docs
          .map((item) => toEvaluation({ id: item.id, ...item.data() }))
          .filter((item) => item.id && item.caseId);
      } catch (error) {
        console.warn("Load Firebase evaluations failed", error);
        return [];
      }
    }).catch(() => []);

    const syncedLocalEvaluations = AUTO_SYNC_LOCAL_EVALUATIONS
      ? await syncLocalEvaluationsToRemote(firebaseEvaluations, localSources)
      : [];
    const availableEvaluations = mergeEvaluationSources([...firebaseEvaluations, ...syncedLocalEvaluations], localSources);
    writeRemoteEvaluationCache(availableEvaluations);
    return availableEvaluations.slice(0, safeLimit);
  }

  return localSources.slice(0, safeLimit);
}

