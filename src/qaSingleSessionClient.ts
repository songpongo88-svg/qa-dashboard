import { canAcknowledgeQaTakeover } from "./qaTabLease.mjs";
import { signInWithCustomToken, signOut } from "firebase/auth";
import { firebaseAuth } from "./firebaseClient";
import {
  runQaServerLogout, waitForQaServerLogout,
  runQaFirebaseSignOut, waitForQaFirebaseSignOut,
} from "./qaSessionTransitionBarrier.mjs";
// New session protocol is OFF unless both preview/client and server explicitly
// enable it. A rejected server check must never silently fall back to legacy
// Firebase login once the feature flag is enabled.
export const QA_SINGLE_SESSION_CLIENT_ENABLED =
  String(import.meta.env?.VITE_QA_SINGLE_SESSION_ENABLED || "") === "true";

export type QaServerSessionResponse = {
  ok: boolean;
  status?: "active" | "conflict" | "pending" | "ready" | "none" | "flush_required" | "logged_out" | "retry_login" | "revoked" | "already_revoked" | "cleared";
  code?: string;
  firebaseToken?: string;
  sessionId?: string;
  expiresAt?: string;
  identity?: {
    username: string; role: string;
    displayName?: string; agentName?: string; email?: string;
  };
  deviceLabel?: string;
  pendingId?: string;
  deadline?: string;
  draft?: { revision: number; savedAt: string; snapshot: Record<string, unknown> } | null;
  sessions?: Array<{ username: string; deviceLabel: string; createdAt: string; expiresAt: string; active: boolean; pendingTakeover: boolean }>;
  revision?: number;
  savedAt?: string;
};

/** A stored browser role is never proof of QA authorization. */
export function matchesTrustedQaIdentity(
  account: { username: string; role: string } | null | undefined,
  server: QaServerSessionResponse,
): boolean {
  if (!account || !server.ok || !["active", "conflict"].includes(String(server.status)) || !server.identity) return false;
  return account.username.trim().toLowerCase() === server.identity.username.trim().toLowerCase() &&
    account.role.trim().toLowerCase() === server.identity.role.trim().toLowerCase();
}

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
  // A form editor in another tab may have changes the current tab cannot
  // inspect. Never acknowledge an all-drafts-saved takeover in that case.
  if (action === "ack" && !(await canAcknowledgeQaTakeover())) {
    throw new QaServerSessionError(409, "QA_OTHER_TABS_OPEN");
  }
  // A late old-session logout response can clear a fresh login Set-Cookie.
  // Wait for the old response before login or takeover starts, even after
  // network errors; the server still owns authoritative revocation.
  if (action === "login" || action === "request" || action === "commit") {
    await waitForQaServerLogout();
  }
  const send = async (): Promise<QaServerSessionResponse> => {
    const response = await fetch("/api/qa-single-session", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
      signal: action === "logout" ? AbortSignal.timeout(15_000) : undefined,
    });
    const data = await response.json().catch(() => ({ ok: false, code: "INVALID_RESPONSE" }));
    if (!response.ok && !(action === "login" && response.status === 409 && data?.status === "conflict")) {
      throw new QaServerSessionError(response.status, String(data?.code || "QA_SESSION_UNAVAILABLE"));
    }
    return data as QaServerSessionResponse;
  };
  if (action === "logout") return runQaServerLogout(send);
  return send();
}


/**
 * Authenticate the Firebase SDK against the same server-owned session used by
 * QA Dashboard, before any legacy Firebase workspace reads or writes.
 * This MUST be paired with deployed Firestore/Storage Rules that validate the
 * active-session pointer. A Firebase ID token alone is not revocation.
 */
export async function activateQaFirebaseIdentity(): Promise<void> {
  if (!QA_SINGLE_SESSION_CLIENT_ENABLED) return;
  await waitForQaFirebaseSignOut();
  const grant = await qaServerSessionRequest("firebase-token");
  const username = grant.identity?.username?.trim().toLowerCase();
  if (!grant.ok || grant.status !== "active" || !grant.firebaseToken ||
      !grant.sessionId || !username || !grant.identity?.role) {
    throw new QaServerSessionError(401, "QA_FIREBASE_SESSION_NOT_GRANTED");
  }
  // A Firebase sign-out may have begun while the token was requested.
  await waitForQaFirebaseSignOut();
  const login = await signInWithCustomToken(firebaseAuth, grant.firebaseToken);
  const idToken = await login.user.getIdTokenResult();
  if (login.user.uid !== "qa-" + username ||
      idToken.claims.qa_username !== username ||
      idToken.claims.qa_session_id !== grant.sessionId ||
      idToken.claims.qa_role !== grant.identity.role) {
    await signOut(firebaseAuth).catch(() => {});
    throw new QaServerSessionError(401, "QA_FIREBASE_IDENTITY_MISMATCH");
  }
}

export async function clearQaFirebaseIdentity(): Promise<void> {
  if (QA_SINGLE_SESSION_CLIENT_ENABLED) {
    await runQaFirebaseSignOut(() => signOut(firebaseAuth));
  }
}

/**
 * UI-level preflight for direct Firestore writes during the staged rollout.
 * This is NOT a server-side security boundary: Firestore rules and every
 * trusted mutation API must independently enforce the active session.
 * Never swallow a failed validation when Single Active Session is enabled.
 */
export async function assertTrustedQaSessionForMutation(): Promise<void> {
  if (!QA_SINGLE_SESSION_CLIENT_ENABLED) return;
  const result = await qaServerSessionRequest("validate");
  if (!result.ok || result.status !== "active") {
    throw new QaServerSessionError(401, "QA_SESSION_NOT_ACTIVE");
  }
}
