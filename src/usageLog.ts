import { addDoc, collection, getDocs, limit as firestoreLimit, orderBy, query } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";
import { canonicalizeAgentName } from "./lib/agentIdentity";

type UsageLogUser = {
  username?: string;
  displayName?: string;
  role?: string;
  agentName?: string;
  loginAt?: string;
} | null;

export type UsageLogEvent = {
  id?: string;
  created_at?: string;
  event_type: string;
  username?: string;
  display_name?: string;
  role?: string;
  agent_name?: string;
  tab?: string;
  case_id?: string;
  target_agent?: string;
  details?: Record<string, unknown>;
  user_agent?: string;
  page_url?: string;
  session_login_at?: string;
};

const ACCESS_LOG_COLLECTION = "qa_access_logs";
const DEFAULT_USAGE_LOG_LIMIT = 300;
const MAX_GENERAL_USAGE_LOG_LIMIT = 5000;
const MAX_EVENT_USAGE_LOG_LIMIT = 5000;
const USAGE_LOG_READ_CACHE_TTL_MS = 60 * 1000;
const CHAT_EVENT_TYPES = new Set([
  "user_presence",
  "chat_message",
  "chat_message_edited",
  "chat_message_deleted",
  "chat_call_invite",
  "chat_call_response",
  "chat_call_ended",
  "chat_webrtc_signal",
]);
const ALLOWED_ACCESS_EVENT_TYPES = new Set([
  "login",
  "logout",
  "pretest_attempt_submitted",
  "pretest_attempt_reset",
  "pretest_retake_opened",
  "pretest_set_saved",
  "pretest_set_deleted",
  "pretest_history_cleared",
  "pretest_result_pdf_downloaded",
  "training_session_created",
  "training_session_updated",
  "training_session_closed",
  "training_roster_updated",
  "training_check_in",
  "training_check_out",
  "training_attendance_manual_update",
  ...CHAT_EVENT_TYPES,
]);

type UsageLogFetchOptions = number | {
  limit?: number;
  offset?: number;
  cacheTtlMs?: number;
  forceRefresh?: boolean;
};

type CachedUsageLogRequest = {
  expiresAt: number;
  promise: Promise<UsageLogEvent[]>;
};

const usageLogReadCache = new Map<string, CachedUsageLogRequest>();

export function isUsageLogConfigured() {
  return true;
}

export function isUsageLogEventTypeDisabled(eventType: string) {
  return !ALLOWED_ACCESS_EVENT_TYPES.has(eventType);
}

function normalizeFetchOptions(
  options: UsageLogFetchOptions | undefined,
  maxLimit: number
) {
  const parsed = typeof options === "number" || options === undefined
    ? { limit: options ?? DEFAULT_USAGE_LOG_LIMIT }
    : options;
  const rawLimit = Number(parsed.limit ?? DEFAULT_USAGE_LOG_LIMIT);
  const limit = Math.min(
    Math.max(Number.isFinite(rawLimit) ? Math.floor(rawLimit) : DEFAULT_USAGE_LOG_LIMIT, 1),
    maxLimit
  );
  const rawOffset = Number(parsed.offset ?? 0);
  const offset = Math.max(Number.isFinite(rawOffset) ? Math.floor(rawOffset) : 0, 0);
  const rawCacheTtlMs = Number(parsed.cacheTtlMs ?? USAGE_LOG_READ_CACHE_TTL_MS);
  const cacheTtlMs = Math.max(Number.isFinite(rawCacheTtlMs) ? rawCacheTtlMs : USAGE_LOG_READ_CACHE_TTL_MS, 0);
  return {
    limit,
    offset,
    cacheTtlMs,
    forceRefresh: parsed.forceRefresh === true,
  };
}

function clearUsageLogReadCache() {
  usageLogReadCache.clear();
}

async function cachedUsageLogRequest(
  cacheKey: string,
  cacheTtlMs: number,
  forceRefresh: boolean,
  request: () => Promise<UsageLogEvent[]>
) {
  const now = Date.now();
  const cached = usageLogReadCache.get(cacheKey);
  if (!forceRefresh && cached && cached.expiresAt > now) return cached.promise;

  const promise = request().catch((error) => {
    usageLogReadCache.delete(cacheKey);
    throw error;
  });
  usageLogReadCache.set(cacheKey, { expiresAt: now + cacheTtlMs, promise });
  return promise;
}

function toUsageLogEvent(id: string, row: any): UsageLogEvent {
  const details = row.details && typeof row.details === "object" ? row.details : {};
  return {
    id,
    created_at: String(row.created_at || row.createdAt || ""),
    event_type: String(row.event_type || row.eventType || ""),
    username: String(row.username || ""),
    display_name: canonicalizeAgentName(row.display_name || row.displayName),
    role: String(row.role || ""),
    agent_name: canonicalizeAgentName(row.agent_name || row.agentName),
    tab: String(row.tab || details.tab || ""),
    case_id: String(row.case_id || row.caseId || details.case_id || details.caseId || ""),
    target_agent: String(row.target_agent || row.targetAgent || details.target_agent || details.targetAgent || details.toUsername || ""),
    details,
    user_agent: String(row.user_agent || row.userAgent || ""),
    page_url: String(row.page_url || row.pageUrl || ""),
    session_login_at: String(row.session_login_at || row.sessionLoginAt || ""),
  };
}

export async function logUsageEvent(
  user: UsageLogUser,
  eventType: string,
  payload: Partial<UsageLogEvent> = {}
) {
  if (!ALLOWED_ACCESS_EVENT_TYPES.has(eventType)) return false;
  if (!user) return false;

  const now = new Date().toISOString();

  try {
    await addDoc(collection(firebaseDb, ACCESS_LOG_COLLECTION), {
      event_type: eventType,
      username: user.username || "",
      display_name: canonicalizeAgentName(user.displayName),
      role: user.role || "",
      agent_name: canonicalizeAgentName(user.agentName),
      session_login_at: user.loginAt || "",
      created_at: now,
      login_at: eventType === "login" ? now : user.loginAt || "",
      logout_at: eventType === "logout" ? now : "",
      tab: payload.tab || "",
      case_id: payload.case_id || "",
      target_agent: payload.target_agent || "",
      details: {
        ...(payload.details || {}),
        tab: payload.tab || payload.details?.tab || "",
      },
    });

    clearUsageLogReadCache();
    return true;
  } catch (error) {
    console.warn("Firebase access log failed", error);
    return false;
  }
}

export async function fetchUsageLogs(options: UsageLogFetchOptions = DEFAULT_USAGE_LOG_LIMIT) {
  const { limit, offset, cacheTtlMs, forceRefresh } = normalizeFetchOptions(options, MAX_GENERAL_USAGE_LOG_LIMIT);

  return cachedUsageLogRequest(`firebase-access:${limit}:${offset}`, cacheTtlMs, forceRefresh, async () => {
    const snapshot = await getDocs(
      query(collection(firebaseDb, ACCESS_LOG_COLLECTION), orderBy("created_at", "desc"), firestoreLimit(limit + offset))
    );

    return snapshot.docs
      .map((doc) => toUsageLogEvent(doc.id, doc.data()))
      .filter((item) => ALLOWED_ACCESS_EVENT_TYPES.has(item.event_type))
      .slice(offset, offset + limit);
  });
}

export async function fetchUsageLogsByEventTypes(
  eventTypes: string[],
  options: UsageLogFetchOptions = DEFAULT_USAGE_LOG_LIMIT
) {
  const cleanEventTypes = eventTypes.map((item) => item.trim()).filter(Boolean);
  const allowedTypes = cleanEventTypes.filter((eventType) => ALLOWED_ACCESS_EVENT_TYPES.has(eventType));

  if (!cleanEventTypes.length) return fetchUsageLogs(options);
  if (!allowedTypes.length) return [];

  const containsChatEvents = allowedTypes.some((eventType) => CHAT_EVENT_TYPES.has(eventType));
  const normalizedOptions = normalizeFetchOptions(options, MAX_EVENT_USAGE_LOG_LIMIT);
  const limit = normalizedOptions.limit;
  const offset = normalizedOptions.offset;
  const cacheTtlMs = containsChatEvents ? 0 : normalizedOptions.cacheTtlMs;
  const forceRefresh = containsChatEvents ? true : normalizedOptions.forceRefresh;
  const sortedTypes = [...allowedTypes].sort().join(",");

  return cachedUsageLogRequest(`firebase-access-events:${sortedTypes}:${limit}:${offset}`, cacheTtlMs, forceRefresh, async () => {
    const rows = await fetchUsageLogs({
      limit: Math.min(Math.max(limit + offset, containsChatEvents ? 1200 : limit + offset), MAX_GENERAL_USAGE_LOG_LIMIT),
      offset: 0,
      cacheTtlMs,
      forceRefresh,
    });
    return rows
      .filter((item) => allowedTypes.includes(item.event_type))
      .slice(offset, offset + limit);
  });
}
