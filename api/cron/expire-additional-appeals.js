import { createSign } from "node:crypto";

const EVENTS_COLLECTION = "qa_appeal_events";
const HOUR_MS = 60 * 60 * 1000;
const WINDOW_MS = 72 * HOUR_MS;
const MAX_OPENED = 2000;
const MAX_WRITES = 75;

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function authToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const assertion = [encode({ alg: "RS256", typ: "JWT" }), encode({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: serviceAccount.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3000,
  })].join(".");
  const signature = createSign("RSA-SHA256").update(assertion).sign(serviceAccount.private_key, "base64url");
  const tokenResponse = await fetch(serviceAccount.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: assertion + "." + signature,
    }),
  });
  if (!tokenResponse.ok) throw new Error("Google service account token request failed: HTTP " + tokenResponse.status);
  const token = await tokenResponse.json();
  if (!token.access_token) throw new Error("Google service account returned no access token");
  return String(token.access_token);
}

function str(fields, field) {
  return String(fields?.[field]?.stringValue || fields?.[field]?.timestampValue || "");
}
function data(doc) {
  const fields = doc?.fields || {};
  return {
    eventType: str(fields, "event_type"),
    caseId: str(fields, "case_id"),
    targetAgent: str(fields, "target_agent"),
    createdAt: str(fields, "created_at"),
    details: fields.details?.mapValue?.fields || {},
  };
}
function detail(event, name) {
  return str(event.details, name);
}
function field(value) {
  return { stringValue: String(value || "") };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const expectedSecret = String(process.env.CRON_SECRET || "").trim();
  if (!expectedSecret || req.headers.authorization !== "Bearer " + expectedSecret) {
    return res.status(401).json({ error: "Unauthorized cron request" });
  }
  const serviceJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceJson) return res.status(503).json({ error: "Firebase service account not configured" });

  try {
    const account = JSON.parse(serviceJson);
    const project = String(process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || "qa-dashboard-b0b5d").trim();
    const token = await authToken(account);
    const root = "https://firestore.googleapis.com/v1/projects/" + encodeURIComponent(project) + "/databases/(default)/documents";
    const headers = { Authorization: "Bearer " + token, "Content-Type": "application/json" };

    async function runQuery(where, limit = MAX_OPENED) {
      const response = await fetch(root + ":runQuery", {
        method: "POST", headers,
        body: JSON.stringify({ structuredQuery: {
          from: [{ collectionId: EVENTS_COLLECTION }],
          where: { fieldFilter: { field: { fieldPath: where.path }, op: "EQUAL", value: field(where.value) } },
          limit,
        } }),
      });
      if (!response.ok) throw new Error("Firestore query failed (HTTP " + response.status + ")");
      return (await response.json()).filter(entry => entry.document).map(entry => data(entry.document));
    }

    const allOpened = await runQuery({ path: "event_type", value: "appeal_additional_round_opened" });
    const now = Date.now();
    const due = allOpened
      .map(event => ({
        event,
        roundId: detail(event, "roundId"),
        requestId: detail(event, "requestId"),
        openedAt: detail(event, "openedAt") || event.createdAt,
      }))
      .filter(item => item.roundId && item.requestId && Number.isFinite(Date.parse(item.openedAt)) &&
        now >= Date.parse(item.openedAt) + WINDOW_MS)
      .sort((a,b) => Date.parse(b.openedAt) - Date.parse(a.openedAt));

    let recorded = 0, skipped = 0, examined = 0;
    for (const candidate of due) {
      if (recorded >= MAX_WRITES) break;
      examined += 1;
      const roundEvents = await runQuery({ path: "details.roundId", value: candidate.roundId }, 100);
      const deadline = Date.parse(candidate.openedAt) + WINDOW_MS;
      const alreadyFinalized = roundEvents.some(event => {
        const type = event.eventType;
        if (type === "appeal_additional_round_cancelled" || type === "appeal_additional_round_expired" ||
            type === "appeal_request_reviewed") return true;
        if (type !== "appeal_additional_evidence_submitted") return false;
        const submitted = Date.parse(detail(event, "submittedAt") || event.createdAt);
        return Number.isFinite(submitted) && submitted < deadline;
      });
      if (alreadyFinalized) { skipped += 1; continue; }
      const docId = ["appeal_additional_round_expired", candidate.requestId, candidate.roundId]
        .join("-").replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 500);
      const expiresAt = new Date(deadline).toISOString();
      const recordedAt = new Date().toISOString();
      const fields = {
        event_type: field("appeal_additional_round_expired"),
        case_id: field(candidate.event.caseId),
        target_agent: field(candidate.event.targetAgent),
        role: field("System"),
        username: field("system-cron"),
        display_name: field("System"),
        tab: field("appeal-requests"),
        created_at: field(recordedAt),
        updated_at: field(recordedAt),
        details: { mapValue: { fields: {
          requestId: field(candidate.requestId),
          roundId: field(candidate.roundId),
          expiresAt: field(expiresAt),
          expiredAt: field(expiresAt),
          recordedAt: field(recordedAt),
          reason: field("หมดเวลายื่นอุทธรณ์เพิ่มเติมอัตโนมัติหลังเปิดสิทธิ์ครบ 72 ชั่วโมง"),
        } } },
      };
      const write = await fetch(root + "/" + EVENTS_COLLECTION + "/" + encodeURIComponent(docId), {
        method: "PATCH", headers, body: JSON.stringify({ fields }),
      });
      if (!write.ok) throw new Error("Firestore expiry write failed (HTTP " + write.status + ")");
      recorded += 1;
    }
    return res.status(200).json({
      ok: true, deadlineHours: 72, due: due.length, examined,
      recorded, alreadyClosed: skipped, runAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Automatic additional appeal expiration failed", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Scheduled expiration failed" });
  }
}
