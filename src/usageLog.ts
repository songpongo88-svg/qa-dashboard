import { addDoc, collection, getDocs, limit as firestoreLimit, orderBy, query, startAfter, where, type QueryDocumentSnapshot } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";
import { canonicalizeAgentName } from "./lib/agentIdentity";
import { assertFirestoreReadAllowed, noteFirestoreReadError } from "./firestoreReadPolicy";

type UsageLogUser = {
  username?: string;
  displayName?: string;
  role?: string;
  agentName?: string;
  loginAt?: string;
} | null;

export type UsageLogEvent = {
  source_case_unavailable?: boolean;
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

// The legacy Chat uses the access-log history. Keep the same 1,200-document
// history window but, after the first read, request only events appended since
// the newest item. This avoids downloading the entire log every five seconds.
const CHAT_LOG_WINDOW = 1200;
const CHAT_DELTA_PAGE = 100;
const CHAT_DELTA_MAX_PAGES = 30;
let chatAccessSnapshot: { rows: UsageLogEvent[]; checkedAt: number } | null = null;
let chatAccessReadInFlight: Promise<UsageLogEvent[]> | null = null;

export function fetchChatEventsIncrementally(forceRefresh = false): Promise<UsageLogEvent[]> {
  if (chatAccessReadInFlight) return chatAccessReadInFlight;
  if (!forceRefresh && chatAccessSnapshot && Date.now() - chatAccessSnapshot.checkedAt < 3_000) {
    return Promise.resolve(chatAccessSnapshot.rows.filter((item) => CHAT_EVENT_TYPES.has(item.event_type)).slice(0, 300));
  }

  const request = (async () => {
    assertFirestoreReadAllowed();
    const source = collection(firebaseDb, ACCESS_LOG_COLLECTION);
    if (!chatAccessSnapshot?.rows.length) {
      const first = await getDocs(query(source, orderBy("created_at", "desc"), firestoreLimit(CHAT_LOG_WINDOW)));
      chatAccessSnapshot = {
        rows: first.docs.map((item) => toUsageLogEvent(item.id, item.data())),
        checkedAt: Date.now(),
      };
    } else {
      const latestAt = chatAccessSnapshot.rows[0].created_at;
      if (!latestAt) throw new Error("Chat history cursor is unavailable.");
      // Inclusive boundary handles simultaneous writes with the same timestamp.
      const updates = new Map<string, UsageLogEvent>();
      let cursor: QueryDocumentSnapshot | undefined;
      let finished = false;
      for (let page = 0; page < CHAT_DELTA_MAX_PAGES; page++) {
        const constraints = [
          where("created_at", ">=", latestAt),
          orderBy("created_at", "desc"),
          ...(cursor ? [startAfter(cursor)] : []),
          firestoreLimit(CHAT_DELTA_PAGE),
        ];
        const batch = await getDocs(query(source, ...constraints));
        for (const item of batch.docs) updates.set(item.id, toUsageLogEvent(item.id, item.data()));
        if (batch.docs.length < CHAT_DELTA_PAGE) {
          finished = true;
          break;
        }
        cursor = batch.docs[batch.docs.length - 1];
      }
      // Never publish a partial result if the incremental cursor overflows.
      if (!finished) throw new Error("Chat event update is too large; retry required.");
      if (updates.size) {
        const merged = new Map(chatAccessSnapshot.rows.map((item) => [item.id, item] as const));
        for (const [id, item] of updates) merged.set(id, item);
        chatAccessSnapshot.rows = Array.from(merged.values())
          .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")) || String(b.id || "").localeCompare(String(a.id || "")))
          .slice(0, CHAT_LOG_WINDOW);
      }
      chatAccessSnapshot.checkedAt = Date.now();
    }
    return chatAccessSnapshot.rows.filter((item) => CHAT_EVENT_TYPES.has(item.event_type)).slice(0, 300);
  })().catch((error) => {
    noteFirestoreReadError(error);
    throw error;
  }).finally(() => {
    if (chatAccessReadInFlight === request) chatAccessReadInFlight = null;
  });
  chatAccessReadInFlight = request;
  return request;
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
