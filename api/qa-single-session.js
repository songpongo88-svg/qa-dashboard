import { verifyQaUsernamePassword } from "../server/qaFirebaseCredentials.js";
import {
  sessionPolicyEnabled, issueSessionCookie, issueCandidateCookie,
  clearSessionCookie, candidateFromRequest, authorizeActiveSession,
  activateNewSession, requestTakeover, getTakeoverForOldBrowser,
  acknowledgeTakeover, commitTakeover, revokeOwnSession,
  saveOwnedDraft, fetchOwnedDraft, clearOwnedDraft, renewActiveSession,
} from "../server/qaSingleSessionAdmin.js";

const actions = new Set([
  "login", "request", "pending", "ack", "commit",
  "validate", "touch", "logout", "draft-save", "draft-read", "draft-clear",
]);
function validRequestBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") return JSON.parse(req.body);
  return req.body;
}
function statusOf(error) {
  const value = Number(error?.status);
  return Number.isInteger(value) && value >= 400 && value <= 599 ? value : 503;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (!sessionPolicyEnabled()) return res.status(503).json({
    ok: false, code: "QA_SINGLE_SESSION_NOT_READY",
  });
  if (req.method !== "POST") return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });

  const origin = String(req.headers?.origin || "");
  const host = String(req.headers?.host || "");
  const site = String(req.headers?.["sec-fetch-site"] || "");
  if ((site && site !== "same-origin" && site !== "none") ||
      (origin && (!host || origin !== "https://" + host))) {
    return res.status(403).json({ ok: false, code: "SAME_ORIGIN_REQUIRED" });
  }
  let body;
  try { body = validRequestBody(req); }
  catch { return res.status(400).json({ ok: false, code: "INVALID_BODY" }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({ ok: false, code: "INVALID_BODY" });
  }
  const action = String(body.action || "");
  if (!actions.has(action)) return res.status(400).json({ ok: false, code: "INVALID_ACTION" });
  try {
    switch (action) {
      case "login": {
        const actor = await verifyQaUsernamePassword(body.username, body.password);
        if (!actor) return res.status(401).json({ ok: false, code: "INVALID_QA_LOGIN" });
        const result = await activateNewSession(actor, body.deviceLabel);
        if (result.status === "active") issueSessionCookie(res, actor, result.sessionId);
        else issueCandidateCookie(res, actor);
        return res.status(result.status === "conflict" ? 409 : 200)
          .json({ ok: true, status: result.status, deviceLabel: result.deviceLabel || "" });
      }
      case "request": {
        const candidate = candidateFromRequest(req);
        const result = await requestTakeover(candidate);
        return res.status(result.status === "pending" ? 200 : 409).json({ ok: result.status === "pending", ...result });
      }
      case "pending": {
        const result = await getTakeoverForOldBrowser(req);
        return res.status(200).json({ ok: true, ...result });
      }
      case "draft-save": {
        const result = await saveOwnedDraft(req, body.documentKey, body.revision, body.snapshot);
        return res.status(200).json({ ok: true, ...result });
      }
      case "draft-clear": {
        const result = await clearOwnedDraft(req, body.documentKey);
        return res.status(200).json({ ok: true, ...result });
      }
      case "draft-read": {
        const result = await fetchOwnedDraft(req, body.documentKey);
        return res.status(200).json({ ok: true, draft: result });
      }
      case "ack": {
        const result = await acknowledgeTakeover(req, body.pendingId, body.documentKey, body.revision);
        return res.status(200).json({ ok: true, ...result });
      }
      case "commit": {
        const candidate = candidateFromRequest(req);
        const result = await commitTakeover(candidate, body.pendingId);
        issueSessionCookie(res, candidate, result.sessionId);
        return res.status(200).json({ ok: true, status: "active" });
      }
      case "touch": {
        const active = await renewActiveSession(req);
        issueSessionCookie(res, active, active.sessionId);
        return res.status(200).json({ ok: true, status: "active" });
      }
      case "validate": {
        await authorizeActiveSession(req);
        return res.status(200).json({ ok: true, status: "active" });
      }
      case "logout": {
        await revokeOwnSession(req);
        clearSessionCookie(res);
        return res.status(200).json({ ok: true, status: "logged_out" });
      }
      default:
        return res.status(400).json({ ok: false, code: "INVALID_ACTION" });
    }
  } catch (error) {
    const status = statusOf(error);
    return res.status(status).json({
      ok: false,
      code: String(error?.code || "QA_SESSION_UNAVAILABLE"),
      error: status >= 500 ? "ระบบ Session ยังไม่พร้อม กรุณาลองใหม่" :
        status === 401 ? "Session หมดอายุหรือถูกย้าย กรุณาเข้าสู่ระบบใหม่" :
          "ไม่สามารถเปลี่ยน Session ได้ กรุณาตรวจสอบข้อมูลที่ยังไม่ได้บันทึก",
    });
  }
}
