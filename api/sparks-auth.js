import {
  withSparksRequest, getSparksRequestActor, exchangeSparksAuthTokens, clearSparksAuthCookies,
  sparksProfileSyncStatus, sparksActiveDirectory,
} from "../server/sparksSupabaseAuth.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const site = String(req.headers?.["sec-fetch-site"] || "");
  if (site && site !== "same-origin" && site !== "none") {
    return res.status(403).json({ error: "Cross-origin Sparks authentication is not permitted" });
  }
  try {
    if (req.method === "GET") {
      const action = String(req.query?.action || "");
      if (action === "sync-status") {
        const status = await withSparksRequest(req,res,()=>sparksProfileSyncStatus());
        return res.status(200).json({ok:true,status});
      }
      // Never return passwords or unreviewed identities; verified owner only.
      if (action === "migration-roster") {
        const users = await withSparksRequest(req,res,()=>sparksActiveDirectory());
        return res.status(200).json({
          ok:true,
          usernames:users.map(user=>String(user.username||"").trim().toLowerCase()),
        });
      }
      if (action) return res.status(400).json({error:"Unsupported action"});
      const actor = await withSparksRequest(req, res, () => getSparksRequestActor());
      return res.status(200).json({ ok: true, actor });
    }
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      if (body.action !== "exchange") return res.status(400).json({ error: "Invalid Sparks authentication request" });
      const actor = await exchangeSparksAuthTokens(res, body);
      return res.status(200).json({ ok: true, actor });
    }
    if (req.method === "DELETE") {
      clearSparksAuthCookies(res);
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    const status = Number(error?.status) || 503;
    return res.status(status).json({
      ok: false,
      code: String(error?.code || "SPARKS_AUTH_UNAVAILABLE"),
      error: status >= 500 ? "Sparks authentication is temporarily unavailable" : String(error.message || "Sign-in failed"),
    });
  }
}
