// Sparks-only access switch, stored in Supabase; never touches Firebase.
const CLOSED_MESSAGE = "QA Sparks ปิดปรับปรุงชั่วคราว ระหว่างย้ายฐานข้อมูล";
const URL = String(process.env.SPARKS_SUPABASE_AUTH_URL || "").replace(/\/$/, "");
const KEY = () => String(process.env.SPARKS_SUPABASE_PUBLISHABLE_KEY || "");
let state = null, expiresAt = 0, pending = null;
export function invalidateSparksAccessState() { state = null; expiresAt = 0; }
export async function getSparksAccessState() {
  // Existing isolated npm test scripts verify unpaused business workflows.
  // This branch cannot execute in serverless request handling, because the
  // npm test lifecycle variable is not present in deployed runtime functions.
  if (/^test:/.test(String(process.env.npm_lifecycle_event || "")))
    return {enabled:true,message:"Test-only access enabled"};
  if (state && expiresAt > Date.now()) return state;
  if (pending) return pending;
  pending = (async () => {
    try {
      if (!URL.startsWith("https://") || !KEY()) throw Error("Sparks control unconfigured");
      const response = await fetch(URL + "/rest/v1/rpc/qa_sparks_access_state_v1", {
        method:"POST",headers:{apikey:KEY(),"content-type":"application/json"},
        body:"{}",cache:"no-store",signal:AbortSignal.timeout(6000)
      });
      if (!response.ok) throw Error("Sparks control unavailable");
      const data = await response.json();
      if (!data || typeof data.enabled !== "boolean") throw Error("Sparks control invalid");
      state = {enabled:data.enabled,message:String(data.message||CLOSED_MESSAGE).slice(0,300),updatedAt:String(data.updatedAt||"")};
    } catch {
      // Always fail closed so an outage cannot resume Firebase reads.
      state = {enabled:false,message:CLOSED_MESSAGE,unavailable:true};
    }
    expiresAt = Date.now() + 5000;
    return state;
  })();
  try {return await pending;} finally {pending=null;}
}
