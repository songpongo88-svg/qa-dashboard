// Browser storage is a convenience for restoring a verified QA session,
// never the authorization source. Firestore session validation stays mandatory.
// Do not clear user drafts, IndexedDB, report snapshots or other account data.
export const QA_CURRENT_USER_STORAGE_KEY = "qa_current_user";

type BrowserCurrentUser = {
  username: string;
  displayName: string;
  role: string;
  agentName: string;
  email?: string;
  loginAt?: string;
  sessionId?: string;
  sessionPolicyVersion?: string;
  sessionExpiresAt?: string;
};

export type CurrentUserPersistence = "local" | "session" | "memory";

export function readCurrentUserStorage(): string | null {
  // A quota fallback is scoped to the same browser tab. It has precedence
  // over an older localStorage record which could not be overwritten.
  try {
    const inTab = window.sessionStorage.getItem(QA_CURRENT_USER_STORAGE_KEY);
    if (inTab) return inTab;
  } catch {}
  try {
    return window.localStorage.getItem(QA_CURRENT_USER_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveCurrentUserStorage(user: BrowserCurrentUser): CurrentUserPersistence {
  // Never serialize the entire mutable React model. Only these fields are
  // needed to validate and restore the server-side single-active session.
  const raw = JSON.stringify({
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    agentName: user.agentName,
    email: user.email || "",
    loginAt: user.loginAt || "",
    sessionId: user.sessionId || "",
    sessionPolicyVersion: user.sessionPolicyVersion || "",
    sessionExpiresAt: user.sessionExpiresAt || "",
  });
  try {
    window.localStorage.setItem(QA_CURRENT_USER_STORAGE_KEY, raw);
    try { window.sessionStorage.removeItem(QA_CURRENT_USER_STORAGE_KEY); } catch {}
    return "local";
  } catch {
    // QuotaExceededError / SecurityError must not masquerade as bad credentials.
  }
  try {
    window.sessionStorage.setItem(QA_CURRENT_USER_STORAGE_KEY, raw);
    return "session";
  } catch {
    // Authenticated in memory only: reload requires another verified sign-in.
    // Do not delete other keys to "make room": those may hold unsaved drafts.
    return "memory";
  }
}

export function clearCurrentUserStorage(): void {
  try { window.sessionStorage.removeItem(QA_CURRENT_USER_STORAGE_KEY); } catch {}
  try { window.localStorage.removeItem(QA_CURRENT_USER_STORAGE_KEY); } catch {}
}

export function readLocalStorageSafely(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

export function writeLocalStorageSafely(key: string, value: string | null): boolean {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
    return true;
  } catch { return false; }
}

export function writeSessionStorageSafely(key: string, value: string): boolean {
  try { window.sessionStorage.setItem(key, value); return true; } catch { return false; }
}
