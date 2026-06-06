import {
  collection,
  doc,
  getDocs,
  limit as firestoreLimit,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";

export type AppealLogUser = {
  username?: string;
  displayName?: string;
  role?: string;
  agentName?: string;
  loginAt?: string;
} | null;

export type AppealLogEvent = {
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

type FetchOptions = number | {
  limit?: number;
  offset?: number;
  cacheTtlMs?: number;
  forceRefresh?: boolean;
};

const APPEAL_EVENTS_COLLECTION = "qa_appeal_events";
const DEFAULT_APPEAL_EVENT_LIMIT = 500;
const MAX_APPEAL_EVENT_LIMIT = 2000;
const APPEAL_EVENT_READ_CACHE_TTL_MS = 30 * 1000;

export const APPEAL_EVENT_TYPES = new Set([
  "appeal_request_submitted",
  "appeal_request_reviewed",
  "appeal_request_reset",
  "appeal_case_override_added",
  "appeal_case_override_removed",
]);

type CachedAppealEventRequest = {
  expiresAt: number;
  promise: Promise<AppealLogEvent[]>;
};

const appealEventReadCache = new Map<string, CachedAppealEventRequest>();

export function isAppealEventType(eventType: string) {
  return APPEAL_EVENT_TYPES.has(String(eventType || "").trim());
}

function sanitizeId(value: string) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 240);
}

function normalizeFetchOptions(options: FetchOptions | undefined) {
  const parsed = typeof options === "number" || options === undefined
    ? { limit: options ?? DEFAULT_APPEAL_EVENT_LIMIT }
    : options;

  const rawLimit = Number(parsed.limit ?? DEFAULT_APPEAL_EVENT_LIMIT);
  const limit = Math.min(
    Math.max(Number.isFinite(rawLimit) ? Math.floor(rawLimit) : DEFAULT_APPEAL_EVENT_LIMIT, 1),
    MAX_APPEAL_EVENT_LIMIT
  );

  const rawOffset = Number(parsed.offset ?? 0);
  const offset = Math.max(Number.isFinite(rawOffset) ? Math.floor(rawOffset) : 0, 0);

  const rawCacheTtlMs = Number(parsed.cacheTtlMs ?? APPEAL_EVENT_READ_CACHE_TTL_MS);
  const cacheTtlMs = Math.max(
    Number.isFinite(rawCacheTtlMs) ? rawCacheTtlMs : APPEAL_EVENT_READ_CACHE_TTL_MS,
    0
  );

  return {
    limit,
    offset,
    cacheTtlMs,
    forceRefresh: parsed.forceRefresh === true,
  };
}

function clearAppealEventReadCache() {
  appealEventReadCache.clear();
}

async function cachedAppealEventRequest(
  cacheKey: string,
  cacheTtlMs: number,
  forceRefresh: boolean,
  request: () => Promise<AppealLogEvent[]>
) {
  const now = Date.now();
  const cached = appealEventReadCache.get(cacheKey);
  if (!forceRefresh && cached && cached.expiresAt > now) return cached.promise;

  const promise = request().catch((error) => {
    appealEventReadCache.delete(cacheKey);
    throw error;
  });

  appealEventReadCache.set(cacheKey, {
    expiresAt: now + cacheTtlMs,
    promise,
  });

  return promise;
}

function toAppealLogEvent(id: string, row: any): AppealLogEvent {
  return {
    id,
    created_at: String(row.created_at || row.createdAt || ""),
    event_type: String(row.event_type || row.eventType || ""),
    username: String(row.username || ""),
    display_name: String(row.display_name || row.displayName || ""),
    role: String(row.role || ""),
    agent_name: String(row.agent_name || row.agentName || ""),
    tab: String(row.tab || row.details?.tab || ""),
    case_id: String(row.case_id || row.caseId || row.details?.caseId || ""),
    target_agent: String(row.target_agent || row.targetAgent || row.details?.agent || ""),
    details: row.details && typeof row.details === "object" ? row.details : {},
    user_agent: String(row.user_agent || ""),
    page_url: String(row.page_url || ""),
    session_login_at: String(row.session_login_at || row.sessionLoginAt || ""),
  };
}

export async function writeAppealEvent(
  user: AppealLogUser,
  eventType: string,
  payload: Partial<AppealLogEvent> = {}
) {
  if (!user || !isAppealEventType(eventType)) return false;

  const now = new Date().toISOString();
  const details = payload.details && typeof payload.details === "object" ? payload.details : {};
  const requestId = String((details as any).requestId || payload.id || payload.case_id || now);
  const docId = sanitizeId(`${eventType}-${requestId}`);

  await setDoc(
    doc(firebaseDb, APPEAL_EVENTS_COLLECTION, docId),
    {
      event_type: eventType,
      username: user.username || "",
      display_name: user.displayName || "",
      role: user.role || "",
      agent_name: user.agentName || "",
      tab: payload.tab || "",
      case_id: payload.case_id || "",
      target_agent: payload.target_agent || "",
      details,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      page_url: typeof window !== "undefined" ? window.location.href : "",
      session_login_at: user.loginAt || "",
      created_at: now,
      updated_at: now,
    },
    { merge: true }
  );

  clearAppealEventReadCache();
  return true;
}

export async function fetchAppealEvents(
  eventTypes: string[] = [...APPEAL_EVENT_TYPES],
  options: FetchOptions = DEFAULT_APPEAL_EVENT_LIMIT
) {
  const cleanEventTypes = eventTypes.map((item) => item.trim()).filter(isAppealEventType);
  if (!cleanEventTypes.length) return [];

  const { limit, offset, cacheTtlMs, forceRefresh } = normalizeFetchOptions(options);
  const sortedTypes = [...cleanEventTypes].sort().join(",");

  return cachedAppealEventRequest(
    `firebase-appeal-events:${sortedTypes}:${limit}:${offset}`,
    cacheTtlMs,
    forceRefresh,
    async () => {
      const snapshot = await getDocs(
        query(
          collection(firebaseDb, APPEAL_EVENTS_COLLECTION),
          orderBy("created_at", "desc"),
          firestoreLimit(limit + offset)
        )
      );

      return snapshot.docs
        .map((item) => toAppealLogEvent(item.id, item.data()))
        .filter((item) => cleanEventTypes.includes(item.event_type))
        .slice(offset, offset + limit);
    }
  );
}
