import { getSparksAccessState, invalidateSparksAccessState } from "../server/sparksAccessControl.js";
import { withSparksRequest, getSparksRequestActor, getVerifiedSparksAccessToken } from "../server/sparksSupabaseAuth.js";
const URL = String(process.env.SPARKS_SUPABASE_AUTH_URL || "").replace(/\/$/, "");
const KEY = () => String(process.env.SPARKS_SUPABASE_PUBLISHABLE_KEY || "");
export default async function handler(req,res) {
  res.setHeader("Cache-Control","no-store, private");
  res.setHeader("X-Content-Type-Options","nosniff");
  const site = String(req.headers?.["sec-fetch-site"]||"");
  if (site && site !== "same-origin" && site !== "none")
    return res.status(403).json({error:"Cross-origin Sparks requests are forbidden"});
  if (req.method==="GET") return res.status(200).json(await getSparksAccessState());
  if (req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
  const origin=String(req.headers?.origin||""),host=String(req.headers?.host||"");
  if (origin && (!host || origin!=="https://"+host))
    return res.status(403).json({error:"Same-origin request required"});
  return withSparksRequest(req,res,async()=>{
    try {
      const body=typeof req.body==="string"?JSON.parse(req.body):req.body||{};
      if (typeof body.enabled!=="boolean") return res.status(400).json({error:"Invalid requested state"});
      const actor=await getSparksRequestActor();
      if (actor.username!=="songpon" || actor.role!=="Quality Assurance")
        return res.status(403).json({error:"เฉพาะเจ้าของ QA Sparks เท่านั้น"});
      const jwt=getVerifiedSparksAccessToken();
      if (!jwt || !KEY() || !URL.startsWith("https://"))
        return res.status(503).json({error:"Sparks control unavailable"});
      const response=await fetch(URL+"/rest/v1/rpc/qa_sparks_set_access_enabled_v1",{
        method:"POST",
        headers:{apikey:KEY(),Authorization:"Bearer "+jwt,"content-type":"application/json"},
        body:JSON.stringify({p_enabled:body.enabled}),
        cache:"no-store",signal:AbortSignal.timeout(10000)
      });
      if (!response.ok) return res.status(response.status===403?403:503).json({error:"ไม่สามารถเปลี่ยนสถานะ QA Sparks ได้"});
      const value=await response.json();
      if (value?.enabled!==body.enabled) throw Error("Unexpected control response");
      invalidateSparksAccessState();
      return res.status(200).json({enabled:value.enabled,updatedAt:value.updatedAt||""});
    }catch(error){
      const code=Number(error?.status)||503;
      return res.status(code).json({error:code===403?"ไม่มีสิทธิ์เปลี่ยนสถานะ QA Sparks":"ไม่สามารถเปลี่ยนสถานะ QA Sparks ได้"});
    }
  });
}
