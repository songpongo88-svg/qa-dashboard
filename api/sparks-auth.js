import qaSessionEndpoint from "../server/qaSingleSessionEndpoint.js";
import {
  withSparksRequest, getSparksRequestActor, exchangeSparksAuthTokens, clearSparksAuthCookies,
  sparksProfileSyncStatus, sparksOwnerAuthStatus, getVerifiedSparksAccessToken,
} from "../server/sparksSupabaseAuth.js";
import { getSparksAccessState, invalidateSparksAccessState } from "../server/sparksAccessControl.js";

export default async function handler(req, res) {
  // Reuse this deployment function for the separately authenticated QA session API.
  // Dedicated rewrite adds the marker; regular Sparks auth traffic remains unchanged.
  if (String(req.query?.__qa_single_session || "") === "1") return qaSessionEndpoint(req, res);
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const site = String(req.headers?.["sec-fetch-site"] || "");
  if (site && site !== "same-origin" && site !== "none") {
    return res.status(403).json({ error: "Cross-origin Sparks authentication is not permitted" });
  }
  try {
    if (req.method === "GET") {
      const action = String(req.query?.action || "");
      if (action === "access") return res.status(200).json(await getSparksAccessState());
      if (action === "sync-status") {
        const status = await withSparksRequest(req,res,()=>sparksProfileSyncStatus());
        return res.status(200).json({ok:true,status});
      }
      if (action === "auth-status") {
        const users = await withSparksRequest(req, res, () => sparksOwnerAuthStatus());
        return res.status(200).json({
          ok: true, users, checkedAt: new Date().toISOString(),
          sparksProvider: "supabase", qaDashboardProvider: "firebase",
        });
      }
      if (action) return res.status(400).json({error:"Unsupported action"});
      const actor = await withSparksRequest(req, res, () => getSparksRequestActor());
      return res.status(200).json({ ok: true, actor });
    }
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      if (body.action === "access-set") {
        const origin = String(req.headers?.origin || "");
        const host = String(req.headers?.host || "");
        if (origin && (!host || origin !== "https://" + host))
          return res.status(403).json({error:"Same-origin owner request required"});
        if (typeof body.enabled !== "boolean")
          return res.status(400).json({error:"Invalid Sparks enabled status"});
        return withSparksRequest(req,res,async()=>{
          const actor=await getSparksRequestActor();
          if(actor.username!=="songpon"||actor.role!=="Quality Assurance")
            return res.status(403).json({error:"เฉพาะเจ้าของ QA Sparks เท่านั้น"});
          const jwt=getVerifiedSparksAccessToken();
          const url=String(process.env.SPARKS_SUPABASE_AUTH_URL||"").replace(/\/$/,"");
          const key=String(process.env.SPARKS_SUPABASE_PUBLISHABLE_KEY||"");
          if(!jwt||!url.startsWith("https://")||!key)
            return res.status(503).json({error:"Sparks access control unavailable"});
          const result=await fetch(url+"/rest/v1/rpc/qa_sparks_set_access_enabled_v1",{
            method:"POST",headers:{apikey:key,Authorization:"Bearer "+jwt,"content-type":"application/json"},
            body:JSON.stringify({p_enabled:body.enabled}),cache:"no-store",signal:AbortSignal.timeout(10000)
          });
          if(!result.ok)return res.status(result.status===403?403:503).json({error:"ไม่สามารถเปลี่ยนสถานะ QA Sparks ได้"});
          const response=await result.json();
          if(response?.enabled!==body.enabled)throw Error("Unexpected Sparks access response");
          invalidateSparksAccessState();
          return res.status(200).json({enabled:response.enabled,updatedAt:response.updatedAt||""});
        });
      }
      if (body.action !== "exchange") return res.status(400).json({ error: "Invalid Sparks authentication request" });
      const actor = await exchangeSparksAuthTokens(res, body, req);
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
