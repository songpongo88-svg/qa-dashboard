import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";

const SESSION_COLLECTION = "qa_user_sessions";
const SESSION_CONTROL_COLLECTION = "qa_user_session_controls";

export const SESSION_POLICY_VERSION = "qa-session-policy-2026-07-15-v1";
export const SESSION_INACTIVITY_MS = 2 * 60 * 60 * 1000;

export type SessionIdentity = {
  username: string;
  displayName: string;
  role: string;
  agentName: string;
  email?: string;
};

export type StoredUserSession = {
  sessionId: string;
  username: string;
  displayName: string;
  role: string;
  agentName: string;
  email: string;
  policyVersion: string;
  status: "active" | "revoked";
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
  revokedAt: string;
  revokeReason: string;
};

export type SessionValidationResult =
  | { valid: true; session: StoredUserSession }
  | { valid: false; reason: "missing" | "mismatch" | "revoked" | "expired" | "policy" };

function safeDocId(value: unknown) {
  return (
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\//g, "__")
      .replace(/\s+/g, "_") || "unknown"
  );
}

function createSessionId(username: string) {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

  return `${safeDocId(username)}-${randomPart}`;
}

function parseSession(row: any, sessionId: string): StoredUserSession {
  return {
    sessionId,
    username: String(row.username || ""),
    displayName: String(row.displayName || ""),
    role: String(row.role || ""),
    agentName: String(row.agentName || ""),
    email: String(row.email || ""),
    policyVersion: String(row.policyVersion || ""),
    status: row.status === "revoked" ? "revoked" : "active",
    createdAt: String(row.createdAt || ""),
    lastActivityAt: String(row.lastActivityAt || ""),
    expiresAt: String(row.expiresAt || ""),
    revokedAt: String(row.revokedAt || ""),
    revokeReason: String(row.revokeReason || ""),
  };
}

export async function createStoredUserSession(user: SessionIdentity) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_INACTIVITY_MS);
  const sessionId = createSessionId(user.username);

  const session: StoredUserSession = {
    sessionId,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    agentName: user.agentName,
    email: user.email || "",
    policyVersion: SESSION_POLICY_VERSION,
    status: "active",
    createdAt: now.toISOString(),
    lastActivityAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    revokedAt: "",
    revokeReason: "",
  };

  await setDoc(doc(firebaseDb, SESSION_COLLECTION, sessionId), {
    ...session,
    updatedAtServer: serverTimestamp(),
  });

  return session;
}

export async function validateStoredUserSession(
  sessionId: string,
  username: string
): Promise<SessionValidationResult> {
  if (!sessionId || !username) return { valid: false, reason: "missing" };

  const normalizedUsername = safeDocId(username);
  const [sessionSnapshot, controlSnapshot] = await Promise.all([
    getDoc(doc(firebaseDb, SESSION_COLLECTION, sessionId)),
    getDoc(doc(firebaseDb, SESSION_CONTROL_COLLECTION, normalizedUsername)),
  ]);

  if (!sessionSnapshot.exists()) return { valid: false, reason: "missing" };

  const session = parseSession(sessionSnapshot.data(), sessionId);
  if (safeDocId(session.username) !== normalizedUsername) {
    return { valid: false, reason: "mismatch" };
  }
  if (session.policyVersion !== SESSION_POLICY_VERSION) {
    return { valid: false, reason: "policy" };
  }
  if (session.status !== "active") {
    return { valid: false, reason: "revoked" };
  }

  const expiresAt = new Date(session.expiresAt).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return { valid: false, reason: "expired" };
  }

  const control = controlSnapshot.exists() ? controlSnapshot.data() : null;
  const revokedBefore = new Date(String(control?.revokedBefore || "")).getTime();
  const createdAt = new Date(session.createdAt).getTime();

  if (
    Number.isFinite(revokedBefore) &&
    Number.isFinite(createdAt) &&
    createdAt <= revokedBefore
  ) {
    return { valid: false, reason: "revoked" };
  }

  return { valid: true, session };
}

export async function touchStoredUserSession(sessionId: string, username: string) {
  if (!sessionId || !username) return null;

  const validation = await validateStoredUserSession(sessionId, username);
  if (!validation.valid) return null;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_INACTIVITY_MS);

  await updateDoc(doc(firebaseDb, SESSION_COLLECTION, sessionId), {
    lastActivityAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    updatedAtServer: serverTimestamp(),
  });

  return expiresAt.toISOString();
}

export async function revokeAllStoredUserSessions(
  username: string,
  sessionId: string,
  reason: string
) {
  if (!username) return;

  const now = new Date().toISOString();
  const writes: Promise<unknown>[] = [
    setDoc(
      doc(firebaseDb, SESSION_CONTROL_COLLECTION, safeDocId(username)),
      {
        username,
        revokedBefore: now,
        revokeReason: reason || "logout",
        updatedAt: now,
        updatedAtServer: serverTimestamp(),
      },
      { merge: true }
    ),
  ];

  if (sessionId) {
    writes.push(
      setDoc(
        doc(firebaseDb, SESSION_COLLECTION, sessionId),
        {
          status: "revoked",
          revokedAt: now,
          revokeReason: reason || "logout",
          updatedAtServer: serverTimestamp(),
        },
        { merge: true }
      )
    );
  }

  await Promise.all(writes);
}
