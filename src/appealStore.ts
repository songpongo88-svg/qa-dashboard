import {
  collection,
  doc,
  getDocs,
  limit as firestoreLimit,
  orderBy,
  query,
  setDoc,
  runTransaction,
  where,
} from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";
import { canonicalizeAgentName } from "./lib/agentIdentity";
import { checkAppealSourceCases } from "./appealCaseAvailability";

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
  source_case_unavailable?: boolean;
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
  "appeal_internal_message",
  "appeal_additional_round_opened",
  "appeal_additional_round_cancelled",
  "appeal_additional_round_expired",
  "appeal_additional_evidence_submitted",
  "appeal_additional_access_requested",
  "appeal_additional_access_decided",
  "appeal_submission_edit_started",
  "appeal_submission_draft_saved",
  "appeal_submission_resubmitted",
  "appeal_additional_reason_option_added",
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

export function clearAppealEventReadCache() {
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
  const fullReviewerName = canonicalizeAgentName(row.agent_name || row.agentName);
  return {
    id,
    created_at: String(row.created_at || row.createdAt || ""),
    event_type: String(row.event_type || row.eventType || ""),
    username: String(row.username || ""),
    display_name: fullReviewerName || canonicalizeAgentName(row.display_name || row.displayName),
    role: String(row.role || ""),
    agent_name: fullReviewerName,
    tab: String(row.tab || row.details?.tab || ""),
    case_id: String(row.case_id || row.caseId || row.details?.caseId || ""),
    target_agent: canonicalizeAgentName(row.target_agent || row.targetAgent || row.details?.agent),
    details: row.details && typeof row.details === "object" ? row.details : {},
    user_agent: String(row.user_agent || ""),
    page_url: String(row.page_url || ""),
    session_login_at: String(row.session_login_at || row.sessionLoginAt || ""),
  };
}

async function prepareAppealEvent(
  user: AppealLogUser,
  eventType: string,
  payload: Partial<AppealLogEvent> = {}
) {
  if (!user || !isAppealEventType(eventType)) return null;
  if (["appeal_request_reviewed", "appeal_request_reset", "appeal_additional_round_opened", "appeal_additional_round_cancelled", "appeal_additional_round_expired", "appeal_additional_access_decided"].includes(eventType) && String(user.role || "") !== "Quality Assurance") return null;
  if (eventType === "appeal_internal_message" && !["Senior", "Supervisor", "Quality Assurance"].includes(String(user.role || ""))) return null;
  if (eventType === "appeal_additional_round_expired") return null; // The scheduled server endpoint alone records expiry.
  if (["appeal_additional_access_requested", "appeal_submission_edit_started", "appeal_submission_draft_saved", "appeal_submission_resubmitted"].includes(eventType) && !String(user.username || "").trim()) return false;
  if (eventType === "appeal_additional_access_requested" && (!String(payload.details?.requestId || "").trim() || !String(payload.details?.reason || "").trim())) throw new Error("ต้องระบุเคสและเหตุผลที่ขออุทธรณ์เพิ่มเติม");
  if (eventType === "appeal_additional_round_opened" && String(user.role || "") !== "Quality Assurance") return false;
  if (eventType === "appeal_additional_reason_option_added" && String(user.role || "") !== "Quality Assurance") return false;
  if (eventType === "appeal_additional_reason_option_added") {
    const reason = String(payload.details?.reason || "").trim();
    if (!reason || reason.length > 180) throw new Error("เหตุผลต้องมีความยาวไม่เกิน 180 ตัวอักษร");
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(String(payload.details?.optionId || ""))) {
      throw new Error("Invalid appeal reason option ID");
    }
  }

  if (["appeal_request_submitted", "appeal_request_reviewed", "appeal_additional_round_opened", "appeal_additional_evidence_submitted"].includes(eventType)) {
    const [checked] = await checkAppealSourceCases([{ ...payload, event_type: eventType }]);
    if (checked.source_case_unavailable) throw new Error("เคสต้นทางถูกลบแล้ว ไม่สามารถยื่นหรือบันทึกผลอุทธรณ์ของเคสนี้ได้");
  }

  const now = new Date().toISOString();
  const details = payload.details && typeof payload.details === "object" ? payload.details : {};
  const requestId = String((details as any).requestId || payload.id || payload.case_id || now);
  // Keep each review revision. Reusing its ID makes a retry idempotent while
  // preserving the original submission and all earlier review documents.
  const reviewId = eventType === "appeal_request_reviewed"
    ? String(details.reviewId || `${Date.now()}-${crypto.randomUUID()}`)
    : "";
  const messageId = eventType === "appeal_internal_message" ? String(details.messageId || "") : "";
  if (eventType === "appeal_internal_message" && !/^[a-zA-Z0-9_-]{8,100}$/.test(messageId)) {
    throw new Error("Internal appeal message requires a unique message ID");
  }
  const roundId = ["appeal_additional_round_opened", "appeal_additional_evidence_submitted", "appeal_additional_round_cancelled", "appeal_additional_round_expired"].includes(eventType)
    ? String(details.roundId || "") : "";
  if (["appeal_additional_round_opened", "appeal_additional_evidence_submitted", "appeal_additional_round_cancelled", "appeal_additional_round_expired"].includes(eventType) &&
      !/^[a-zA-Z0-9_-]{8,100}$/.test(roundId)) throw new Error("Appeal round ID is invalid");
  if (eventType === "appeal_additional_round_cancelled" &&
    (!String(details.reason || "").trim() || !String(details.cancelledAt || "").trim())) {
    throw new Error("ต้องระบุเหตุผลและเวลายกเลิกรอบอุทธรณ์เพิ่มเติม");
  }
  const submissionId = eventType === "appeal_additional_evidence_submitted" ? String(details.submissionId || "") : "";
  if (eventType === "appeal_additional_evidence_submitted" && !/^[a-zA-Z0-9_-]{8,100}$/.test(submissionId)) {
    throw new Error("Appeal evidence submission ID is invalid");
  }
  const reasonOptionId = eventType === "appeal_additional_reason_option_added" ? String(details.optionId || "") : "";
  const workflowId = ["appeal_additional_access_requested", "appeal_additional_access_decided", "appeal_submission_edit_started", "appeal_submission_draft_saved", "appeal_submission_resubmitted"].includes(eventType) ? String(details.workflowId || "") : "";
  if (workflowId && !/^[a-zA-Z0-9_-]{8,100}$/.test(workflowId)) throw new Error("Invalid appeal workflow event ID");
  const docId = sanitizeId(reasonOptionId
    ? `${eventType}-${reasonOptionId}`
    : `${eventType}-${requestId}${reviewId ? `-${reviewId}` : ""}${messageId ? `-${messageId}` : ""}${roundId ? `-${roundId}` : ""}${submissionId ? `-${submissionId}` : ""}${workflowId ? `-${workflowId}` : ""}`);
  const reviewerNameCandidates = [user.agentName, user.displayName]
    .map((value) => canonicalizeAgentName(value || ""))
    .filter(Boolean)
    .sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length);
  const fullReviewerName = reviewerNameCandidates[0] || canonicalizeAgentName(user.username || "");
  // appeal-reviewer-loading-fix-v64-store

  return {
    reference: doc(firebaseDb, APPEAL_EVENTS_COLLECTION, docId),
    data: {
      event_type: eventType,
      username: user.username || "",
      display_name: fullReviewerName,
      role: user.role || "",
      // Keep the canonical reviewer name in both identity fields so downstream
      // Case Detail / Appeal PDF exports never lose the QA reviewer when
      // agentName is empty but displayName is available.
      agent_name: fullReviewerName,
      tab: payload.tab || "",
      case_id: payload.case_id || "",
      target_agent: canonicalizeAgentName(payload.target_agent),
      details: reviewId ? { ...details, reviewId } : details,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      page_url: typeof window !== "undefined" ? window.location.href : "",
      session_login_at: user.loginAt || "",
      created_at: now,
      updated_at: now,
    },
  };
}

function notifyAppealChanged() {
  clearAppealEventReadCache();
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("qa-dashboard-data-refresh"));
}

export async function writeAppealEvent(user: AppealLogUser, eventType: string, payload: Partial<AppealLogEvent> = {}) {
  const prepared = await prepareAppealEvent(user, eventType, payload);
  if (!prepared) return false;
  await setDoc(prepared.reference, prepared.data, { merge: true });
  notifyAppealChanged();
  return true;
}

// Permission approval and its 72-hour round become visible together. A failed
// write cannot leave the owner with an approval but no usable submission form.
export async function writeAdditionalAppealAccessDecision(user: AppealLogUser,
  decision: Partial<AppealLogEvent>, round?: Partial<AppealLogEvent>) {
  if (user?.role !== "Quality Assurance") return false;
  if (Boolean(decision.details?.approved) !== Boolean(round)) throw new Error("Approval requires its additional appeal round");
  if (round && (!Array.isArray(round.details?.topics) || !round.details.topics.length ||
      round.details.requestId !== decision.details?.requestId || round.details.accessId !== decision.details?.accessId))
    throw new Error("Additional appeal topics and permission must belong to the same request");
  const preparedDecision = await prepareAppealEvent(user, "appeal_additional_access_decided", decision);
  const preparedRound = round ? await prepareAppealEvent(user, "appeal_additional_round_opened", round) : null;
  if (!preparedDecision || (round && !preparedRound)) return false;
  await runTransaction(firebaseDb, async transaction => {
    const existingDecision = await transaction.get(preparedDecision.reference);
    const existingRound = preparedRound ? await transaction.get(preparedRound.reference) : null;
    if (existingDecision.exists()) {
      const stored = existingDecision.data().details;
      if (stored.approved !== decision.details?.approved) throw new Error("Permission already decided");
      // Retrying a saved approval never changes its deadline or creates a second round.
      if (!preparedRound || existingRound?.exists()) return;
    }
    transaction.set(preparedDecision.reference, preparedDecision.data, { merge: true });
    if (preparedRound && !existingRound?.exists()) transaction.set(preparedRound.reference, preparedRound.data, { merge: true });
  });
  notifyAppealChanged();
  return true;
}

// Read a single appeal's private discussion by requestId rather than mixing
// conversation traffic into the latest 2,000 scored appeal events.
// Authorized recipients may see an out-of-team appeal only after QA
// explicitly directs an internal message to their account.
export async function fetchAssignedAppealRequestIds(username: string): Promise<string[]> {
  const target = String(username || "").trim();
  if (!target) return [];
  const snapshot = await getDocs(query(
    collection(firebaseDb, APPEAL_EVENTS_COLLECTION),
    where("details.seniorUsername", "==", target),
    firestoreLimit(500)
  ));
  return [...new Set(snapshot.docs
    .map(item => toAppealLogEvent(item.id, item.data()))
    .filter(event => event.event_type === "appeal_internal_message")
    .map(event => String(event.details?.requestId || "").trim())
    .filter(Boolean))];
}

// Reasons are shared between QA sessions and kept outside the scored appeal
// event list. Only QA can create options; reading does not change case history.
export async function fetchAdditionalAppealReasonOptions(): Promise<string[]> {
  const snapshot = await getDocs(query(
    collection(firebaseDb, APPEAL_EVENTS_COLLECTION),
    where("event_type", "==", "appeal_additional_reason_option_added"),
    firestoreLimit(200)
  ));
  const options = snapshot.docs
    .map(item => String(item.data()?.details?.reason || "").trim())
    .filter(Boolean);
  return [...new Map(options.map(reason => [reason.toLocaleLowerCase("th"), reason])).values()]
    .sort((a, b) => a.localeCompare(b, "th"));
}

export async function fetchAppealDiscussionEvents(requestId: string): Promise<AppealLogEvent[]> {
  const target = String(requestId || "").trim();
  if (!target) return [];
  const snapshot = await getDocs(
    query(
      collection(firebaseDb, APPEAL_EVENTS_COLLECTION),
      where("details.requestId", "==", target),
      firestoreLimit(500)
    )
  );
  return snapshot.docs
    .map(item => toAppealLogEvent(item.id, item.data()))
    .filter(event => event.event_type === "appeal_internal_message")
    .sort((a, b) => Date.parse(String(a.created_at || "")) - Date.parse(String(b.created_at || "")));
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

      const events = snapshot.docs
        .map((item) => toAppealLogEvent(item.id, item.data()))
        .filter((item) => cleanEventTypes.includes(item.event_type))
        .slice(offset, offset + limit);
      return checkAppealSourceCases(events);
    }
  );
}
