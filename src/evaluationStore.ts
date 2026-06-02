const env = (import.meta as any).env || {};
const SUPABASE_URL = String(env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_ANON_KEY = String(env.VITE_SUPABASE_ANON_KEY || "");
const EVALUATION_TABLE = String(env.VITE_QA_EVALUATION_TABLE || "qa_evaluations");

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
    body: JSON.stringify([fromEvaluation(record)]),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Supabase evaluation upsert failed: ${response.status}${detail ? ` - ${detail}` : ""}`);
  }
}

export async function deleteStoredEvaluation(id: string) {
  if (!isEvaluationStoreConfigured()) throw new Error("Supabase is not configured.");
  const normalizedId = String(id || "").trim();
  if (!normalizedId) throw new Error("Evaluation id is required.");
  const params = new URLSearchParams({
    id: `eq.${normalizedId}`,
  });
  const response = await fetch(endpoint(`?${params.toString()}`), {
    method: "DELETE",
    headers: headers("return=minimal"),
  });
  if (!response.ok) throw new Error(`Supabase evaluation delete failed: ${response.status}`);
}

export async function fetchStoredEvaluations(limit = 5000) {
  if (!isEvaluationStoreConfigured()) return [];
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
    return [];
  }
  return ((await response.json()) as any[]).map(toEvaluation).filter((item) => item.id && item.caseId);
}
