// Staged authenticated API. Explicitly disabled until QA Dashboard's primary
// login uses the same verified identity and every sensitive write checks session.
// Never accept a client-provided username or session ID for authorization.
import { withSparksRequest, getSparksRequestActor, getVerifiedSparksAccessToken } from "../server/sparksSupabaseAuth.js";

const ALLOWED_ACTIONS = new Set(["begin", "request", "ack", "commit", "validate", "logout"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (process.env.QA_SINGLE_SESSION_ENABLED !== "true") {
    return res.status(503).json({ ok: false, code: "QA_SINGLE_SESSION_NOT_READY" });
  }
  if (req.method !== "POST") return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });
  const site = String(req.headers?.["sec-fetch-site"] || "");
  const host = String(req.headers?.host || "");
  const origin = String(req.headers?.origin || "");
  if ((site && !["same-origin", "none"].includes(site)) ||
      (origin && (!host || origin !== "https://" + host))) {
    return res.status(403).json({ ok: false, code: "SAME_ORIGIN_REQUIRED" });
  }
  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    if (!body || typeof body !== "object" || Array.isArray(body)) throw Error("Invalid body");
  } catch {
    return res.status(400).json({ ok: false, code: "BAD_BODY" });
  }
  const action = String(body.action || "");
  if (!ALLOWED_ACTIONS.has(action)) return res.status(400).json({ ok: false, code: "BAD_ACTION" });
  const requestId = body.requestId == null ? null : String(body.requestId);
  if (requestId !== null && !UUID.test(requestId)) {
    return res.status(400).json({ ok: false, code: "BAD_REQUEST_ID" });
  }
  const revision = body.revision == null ? null : Number(body.revision);
  if (revision !== null && (!Number.isSafeInteger(revision) || revision < 0)) {
    return res.status(400).json({ ok: false, code: "BAD_REVISION" });
  }
  try {
    return await withSparksRequest(req, res, async () => {
      const actor = await getSparksRequestActor();
      const jwt = getVerifiedSparksAccessToken();
      const base = String(process.env.SPARKS_SUPABASE_AUTH_URL || "").replace(/\/$/, "");
      const key = String(process.env.SPARKS_SUPABASE_PUBLISHABLE_KEY || "");
      if (!actor?.username || !jwt || !base.startsWith("https://") || !key) {
        return res.status(503).json({ ok: false, code: "QA_SESSION_BACKEND_UNAVAILABLE" });
      }
      const result = await fetch(base + "/rest/v1/rpc/qa_session_control_v1", {
        method: "POST", cache: "no-store", signal: AbortSignal.timeout(12000),
        headers: {
          apikey: key, Authorization: "Bearer " + jwt,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          p_action: action,
          p_request_id: requestId,
          p_revision: revision,
        }),
      });
      if (!result.ok) {
        return res.status(result.status === 401 || result.status === 403 ? 403 : 503)
          .json({ ok: false, code: "QA_SESSION_REJECTED" });
      }
      const state = await result.json();
      return res.status(200).json({ ok: true, ...state });
    });
  } catch (error) {
    const status = [401, 403].includes(Number(error?.status)) ? Number(error.status) : 503;
    return res.status(status).json({ ok: false, code: "QA_SESSION_AUTH_REQUIRED" });
  }
}
