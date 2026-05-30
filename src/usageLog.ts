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

export function isUsageLogConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
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

export async function logUsageEvent(
  user: UsageLogUser,
  eventType: string,
  payload: Partial<UsageLogEvent> = {}
) {
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
    const response = await fetch(getUsageLogEndpoint(), {
      method: "POST",
      headers: getUsageLogHeaders("return=minimal"),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.warn("Usage log failed", response.status, await response.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (error) {
    console.warn("Usage log failed", error);
    return false;
  }
}

export async function fetchUsageLogs(limit = 300) {
  if (!isUsageLogConfigured()) return [];

  const params = new URLSearchParams({
    select: "*",
    order: "created_at.desc",
    limit: String(limit),
  });

  const response = await fetch(getUsageLogEndpoint(`?${params.toString()}`), {
    method: "GET",
    headers: getUsageLogHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Load usage logs failed: ${response.status}`);
  }

  return (await response.json()) as UsageLogEvent[];
}
