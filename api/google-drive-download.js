import { sessionPolicyEnabled, authorizeActiveSession } from "../server/qaSingleSessionAdmin.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const trustedSessionEnabled = sessionPolicyEnabled();
  if (trustedSessionEnabled) {
    // A replaced browser must not fetch cached evidence or bypass session
    // checks by navigating to a bare download URL. Do not cache the response.
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Vary", "Cookie");
    const origin = String(req.headers?.origin || "");
    const host = String(req.headers?.host || "");
    const site = String(req.headers?.["sec-fetch-site"] || "");
    if ((site && site !== "same-origin" && site !== "none") ||
        (origin && (!host || origin !== "https://" + host))) {
      return res.status(403).json({ error: "SAME_ORIGIN_REQUIRED" });
    }
    try {
      await authorizeActiveSession(req);
    } catch (error) {
      const status = error?.status === 401 ? 401 : error?.status === 403 ? 403 : 503;
      return res.status(status).json({
        error: status === 401 ? "QA_SESSION_EXPIRED_OR_REPLACED" : "QA_SESSION_UNAVAILABLE",
      });
    }
  }

  const id = String(req.query?.id || "").trim();
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return res.status(400).json({ error: "Invalid Google Drive file id" });
  }

  try {
    const target = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
    const response = await fetch(target, { redirect: "follow" });
    if (!response.ok) {
      return res.status(response.status).json({ error: "Google Drive download failed" });
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    if (contentType.includes("text/html")) {
      return res.status(502).json({
        error: "Google Drive returned a viewer page instead of the file. Check file sharing permission.",
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    const inline = String(req.query?.inline || "") === "1";
    const requestedName = String(req.query?.name || "").replace(/[\r\n"]/g, "").trim();
    const fallbackName = contentType.startsWith("audio/") ? `voice-${id}` : `evidence-${id}.pdf`;
    const safeName = requestedName || fallbackName;
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${safeName}"`);
    res.setHeader("Accept-Ranges", "bytes");
    if (!trustedSessionEnabled) {
      res.setHeader("Cache-Control", "private, max-age=60");
    }
    return res.status(200).send(Buffer.from(arrayBuffer));
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Google Drive download failed",
    });
  }
}
