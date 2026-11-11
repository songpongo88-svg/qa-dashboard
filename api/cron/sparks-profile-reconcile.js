import { runSparksProfileReconciliation } from "../../server/sparksProfileReconcile.js";
import { getSparksAccessState } from "../../server/sparksAccessControl.js";

// Runs daily at 18:15 Bangkok, before the user's 19:30 local QA backup sync.
// No Firebase writes. Never reads QA case scores. Disabled by default until
// the owner enables SPARKS_PROFILE_SYNC_ENABLED after verification.
export default async function handler(req,res) {
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="GET")return res.status(405).json({error:"method-not-allowed"});
  const secret=String(process.env.CRON_SECRET||"");
  if(secret.length<20||req.headers?.authorization!=="Bearer "+secret)
    return res.status(401).json({error:"unauthorized"});
  try {
    if(!(await getSparksAccessState()).enabled)return res.status(200).json({ok:true,skipped:true,reason:"SPARKS_ACCESS_PAUSED"});
    const result=await runSparksProfileReconciliation();
    return res.status(200).json(result);
  }catch(error){
    const code=String(error?.code||"SPARKS_PROFILE_SYNC_UNAVAILABLE");
    console.error("qa_sparks_daily_profile_reconcile_failed",code);
    return res.status(503).json({error:"sync-unavailable",code});
  }
}
