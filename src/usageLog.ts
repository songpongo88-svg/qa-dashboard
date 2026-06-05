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

const env = (import.meta as any).env || {};
const SUPABASE_URL = String(env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_ANON_KEY = String(env.VITE_SUPABASE_ANON_KEY || "");
const USAGE_LOG_TABLE = String(env.VITE_USAGE_LOG_TABLE || "usage_logs");
const SUPABASE_REQUEST_TIMEOUT_MS = 2500;
const USAGE_LOG_SELECT_COLUMNS = [
  "id",
  "created_at",
  "event_type",
  "username",
  "display_name",
  "role",
  "agent_name",
  "tab",
  "case_id",
  "target_agent",
  "details",
  "user_agent",
  "page_url",
  "session_login_at",
].join(",");
const DEFAULT_USAGE_LOG_LIMIT = 300;
const MAX_GENERAL_USAGE_LOG_LIMIT = 1000;
const MAX_EVENT_USAGE_LOG_LIMIT = 2000;
const USAGE_LOG_READ_CACHE_TTL_MS = 60 * 1000;
const DISABLED_USAGE_EVENT_TYPES = new Set([
  "user_presence",
  "chat_message",
  "chat_message_edited",
  "chat_message_deleted",
  "chat_call_invite",
  "chat_call_response",
  "chat_call_ended",
  "chat_webrtc_signal",
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
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function isUsageLogEventTypeDisabled(eventType: string) {
  return DISABLED_USAGE_EVENT_TYPES.has(eventType);
}

function getUsageLogEndpoint(query = "") {
  return `${SUPABASE_URL}/rest/v1/${USAGE_LOG_TABLE}${query}`;
}

function getUsageLogHeaders(prefer?: string) {
  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;
  return headers;
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

export async function logUsageEvent(
  user: UsageLogUser,
  eventType: string,
  payload: Partial<UsageLogEvent> = {}
) {
  if (DISABLED_USAGE_EVENT_TYPES.has(eventType)) return false;
  if (!isUsageLogConfigured() || !user) return false;

  const body: UsageLogEvent = {
    event_type: eventType,
    username: user.username || "",
    display_name: user.displayName || "",
    role: user.role || "",
    agent_name: user.agentName || "",
    session_login_at: user.loginAt || "",
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    page_url: typeof window !== "undefined" ? window.location.href : "",
    ...payload,
  };

  try {
    const response = await fetchWithTimeout(getUsageLogEndpoint(), {
      method: "POST",
      headers: getUsageLogHeaders("return=minimal"),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.warn("Usage log failed", response.status, await response.text().catch(() => ""));
      return false;
    }
    clearUsageLogReadCache();
    return true;
  } catch (error) {
    console.warn("Usage log failed", error);
    return false;
  }
}

export async function fetchUsageLogs(options: UsageLogFetchOptions = DEFAULT_USAGE_LOG_LIMIT) {
  if (!isUsageLogConfigured()) return [];
  const { limit, offset, cacheTtlMs, forceRefresh } = normalizeFetchOptions(options, MAX_GENERAL_USAGE_LOG_LIMIT);

  const params = new URLSearchParams({
    select: USAGE_LOG_SELECT_COLUMNS,
    order: "created_at.desc",
    limit: String(limit),
    offset: String(offset),
  });

  const url = getUsageLogEndpoint(`?${params.toString()}`);
  return cachedUsageLogRequest(`all:${limit}:${offset}`, cacheTtlMs, forceRefresh, async () => {
    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: getUsageLogHeaders(),
      cache: "default",
    });

    if (!response.ok) {
      throw new Error(`Load usage logs failed: ${response.status}`);
    }

    return (await response.json()) as UsageLogEvent[];
  });
}

export async function fetchUsageLogsByEventTypes(
  eventTypes: string[],
  options: UsageLogFetchOptions = DEFAULT_USAGE_LOG_LIMIT
) {
  if (!isUsageLogConfigured()) return [];
  const cleanEventTypes = eventTypes.map((item) => item.trim()).filter(Boolean);
  if (!cleanEventTypes.length) return fetchUsageLogs(options);
  if (cleanEventTypes.every((eventType) => DISABLED_USAGE_EVENT_TYPES.has(eventType))) return [];
  const { limit, offset, cacheTtlMs, forceRefresh } = normalizeFetchOptions(options, MAX_EVENT_USAGE_LOG_LIMIT);

  const params = new URLSearchParams({
    select: USAGE_LOG_SELECT_COLUMNS,
    order: "created_at.desc",
    limit: String(limit),
    offset: String(offset),
  });
  params.set("event_type", `in.(${cleanEventTypes.join(",")})`);

  const sortedTypes = [...cleanEventTypes].sort().join(",");
  const url = getUsageLogEndpoint(`?${params.toString()}`);
  return cachedUsageLogRequest(`events:${sortedTypes}:${limit}:${offset}`, cacheTtlMs, forceRefresh, async () => {
    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: getUsageLogHeaders(),
      cache: "default",
    });

    if (!response.ok) {
      throw new Error(`Load usage logs failed: ${response.status}`);
    }

    return (await response.json()) as UsageLogEvent[];
  });
}
