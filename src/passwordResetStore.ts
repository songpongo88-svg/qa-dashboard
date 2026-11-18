import { collection, doc, getDocs, orderBy, query, setDoc, serverTimestamp } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";
import * as FirestoreApi from "firebase/firestore";
import { recordFirestoreSnapshotDocs } from "./firestoreReadPolicy";

const PASSWORD_RESET_REQUEST_COLLECTION = "qa_password_reset_requests";
const PASSWORD_RESET_REQUEST_CACHE_KEY = "qa-dashboard:password-reset-requests-cache";

export type StoredPasswordResetRequest = {
  requestId: string;
  username: string;
  displayName: string;
  email: string;
  requestedAt: string;
  status: "Pending" | "Approved" | "Rejected";
  tempPassword?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  updatedAt?: string;
};

function safeDocId(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\//g, "__")
    .replace(/\s+/g, " ")
    || "unknown";
}

function normalizeStatus(value: unknown): StoredPasswordResetRequest["status"] {
  return value === "Approved" || value === "Rejected" ? value : "Pending";
}

function readCache() {
  if (typeof window === "undefined") return [] as StoredPasswordResetRequest[];
  const raw = window.localStorage.getItem(PASSWORD_RESET_REQUEST_CACHE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as StoredPasswordResetRequest[] : [];
  } catch {
    return [];
  }
}

function writeCache(rows: StoredPasswordResetRequest[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PASSWORD_RESET_REQUEST_CACHE_KEY, JSON.stringify(rows));
  } catch {
    // Local cache is only a fallback.
  }
}

function toResetRequest(row: any, fallbackId = ""): StoredPasswordResetRequest {
  return {
    requestId: String(row.requestId || row.request_id || fallbackId || ""),
    username: String(row.username || ""),
    displayName: String(row.displayName || row.display_name || row.username || ""),
    email: String(row.email || ""),
    requestedAt: String(row.requestedAt || row.requested_at || row.createdAt || row.created_at || ""),
    status: normalizeStatus(row.status),
    tempPassword: String(row.tempPassword || row.temp_password || ""),
    reviewedAt: String(row.reviewedAt || row.reviewed_at || ""),
    reviewedBy: String(row.reviewedBy || row.reviewed_by || ""),
    updatedAt: String(row.updatedAt || row.updated_at || ""),
  };
}

function sortRequests(rows: StoredPasswordResetRequest[]) {
  return [...rows].sort((a, b) => new Date(b.requestedAt || "").getTime() - new Date(a.requestedAt || "").getTime());
}

// Background badge checks can verify a tiny revision before opening the full
// request collection. Administrative approval/editing keeps full fresh reads.
let recentPasswordRequests: StoredPasswordResetRequest[] | null = null;
async function passwordRequestsUnchanged(reference: ReturnType<typeof collection>, rows: StoredPasswordResetRequest[]) {
  const [count, latest] = await Promise.all([
    FirestoreApi.getCountFromServer(reference),
    FirestoreApi.getDocsFromServer(FirestoreApi.query(
      reference, FirestoreApi.orderBy("updatedAt", "desc"), FirestoreApi.limit(1)
    )),
  ]);
  recordFirestoreSnapshotDocs("password-reset:revision-latest", latest.docs.length);
  if (count.data().count !== rows.length) return false;
  if (!rows.length) return latest.docs.length === 0;
  const newest = latest.docs[0];
  if (!newest) return false;
  const matching = rows.find((row) => safeDocId(row.requestId) === newest.id);
  return Boolean(matching && matching.updatedAt && matching.updatedAt === String(newest.data()?.updatedAt || ""));
}

export async function fetchStoredPasswordResetRequests(options: { background?: boolean } = {}) {
  try {
    const reference = collection(firebaseDb, PASSWORD_RESET_REQUEST_COLLECTION);
    if (options.background && recentPasswordRequests) {
      try {
        if (await passwordRequestsUnchanged(reference, recentPasswordRequests)) {
          return recentPasswordRequests;
        }
      } catch {
        // If the revision probe cannot be trusted, keep the original full read.
      }
    }
    const snapshot = await getDocs(query(reference, orderBy("requestedAt", "desc")));
    recordFirestoreSnapshotDocs("password-reset:full-collection", snapshot.docs.length);
    const rows = snapshot.docs
      .map((item) => toResetRequest(item.data(), item.id))
      .filter((item) => item.requestId && item.username);
    recentPasswordRequests = rows;
    writeCache(rows);
    return rows;
  } catch (error) {
    const cached = readCache();
    if (cached.length) return cached;
    throw error;
  }
}

export async function createStoredPasswordResetRequest(request: StoredPasswordResetRequest) {
  const now = new Date().toISOString();
  const normalizedStatus = normalizeStatus(request.status);
  const row = {
    ...request,
    status: normalizedStatus,
    requestedAt: request.requestedAt || now,
    reviewedAt:
      normalizedStatus === "Pending" ? "" : request.reviewedAt || now,
    reviewedBy:
      normalizedStatus === "Pending"
        ? ""
        : request.reviewedBy || "System Auto Recovery",
    updatedAt: now,
    updatedAtServer: serverTimestamp(),
  };

  await setDoc(doc(firebaseDb, PASSWORD_RESET_REQUEST_COLLECTION, safeDocId(row.requestId)), row, { merge: true });
  recentPasswordRequests = null;

  const cached = readCache().filter((item) => item.requestId !== row.requestId);
  writeCache(sortRequests([row, ...cached]));
}

export async function updateStoredPasswordResetRequest(
  requestId: string,
  updates: Partial<StoredPasswordResetRequest>
) {
  const now = new Date().toISOString();
  const row = {
    ...updates,
    requestId,
    updatedAt: now,
    updatedAtServer: serverTimestamp(),
  };

  await setDoc(doc(firebaseDb, PASSWORD_RESET_REQUEST_COLLECTION, safeDocId(requestId)), row, { merge: true });
  recentPasswordRequests = null;

  const cached = readCache();
  const existing = cached.find((item) => item.requestId === requestId);
  const nextRow = existing
    ? { ...existing, ...updates, requestId }
    : toResetRequest({ ...updates, requestId });
  writeCache(sortRequests([nextRow, ...cached.filter((item) => item.requestId !== requestId)]));
}
