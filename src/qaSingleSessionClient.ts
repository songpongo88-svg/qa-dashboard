// New session protocol is OFF unless both preview/client and server explicitly
// enable it. A rejected server check must never silently fall back to legacy
// Firebase login once the feature flag is enabled.
export const QA_SINGLE_SESSION_CLIENT_ENABLED =
  String(import.meta.env?.VITE_QA_SINGLE_SESSION_ENABLED || "") === "true";

export type QaServerSessionResponse = {
  ok: boolean;
  status?: "active" | "conflict" | "pending" | "ready" | "none" | "flush_required" | "logged_out" | "retry_login" | "revoked" | "already_revoked" | "cleared";
  code?: string;
  deviceLabel?: string;
  pendingId?: string;
  deadline?: string;
  draft?: { revision: number; savedAt: string; snapshot: Record<string, unknown> } | null;
  sessions?: Array<{ username: string; deviceLabel: string; createdAt: string; expiresAt: string; active: boolean; pendingTakeover: boolean }>;
  revision?: number;
  savedAt?: string;
};

export class QaServerSessionError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export async function qaServerSessionRequest(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<QaServerSessionResponse> {
  if (!QA_SINGLE_SESSION_CLIENT_ENABLED) {
    throw new QaServerSessionError(503, "QA_SINGLE_SESSION_DISABLED");
  }
  const response = await fetch("/api/qa-single-session", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json().catch(() => ({ ok: false, code: "INVALID_RESPONSE" }));
  if (!response.ok && !(action === "login" && response.status === 409 && data?.status === "conflict")) {
    throw new QaServerSessionError(response.status, String(data?.code || "QA_SESSION_UNAVAILABLE"));
  }
  return data as QaServerSessionResponse;
}
