export type AutoPassAction =
  | "auto-pass-state" | "auto-pass-claim-free" | "auto-pass-buy" | "auto-pass-use";
export type AutoPassResponse = {
  owned?: number; balance?: number; typingReliefOwned?: number; quotaReadFallback?: boolean; freeClaimed?: boolean; freeActive?: boolean;
  updated?: boolean; alreadyApplied?: boolean; completed?: boolean;
};
export async function qaAutoPassAction(
  action: AutoPassAction, username: string, sessionId: string,
  data: { requestId?: string; expectedPrice?: number; challengeId?: string }={},
): Promise<AutoPassResponse> {
  if(!username||!sessionId)throw new Error("กรุณา Login QA Dashboard หรือ QA Sparks ก่อนใช้ Auto-Pass");
  let readGrant="";
  if(action==="auto-pass-state"){try{const saved=JSON.parse(sessionStorage.getItem("qa:sparks:verified-read-grant:v1")||"null");if(saved?.username===username.trim().toLowerCase()&&saved?.sessionId===sessionId)readGrant=String(saved.grant||"");}catch{}}
  const response=await fetch("/api/sparks-admin",{
    method:"POST",cache:"no-store",credentials:"same-origin",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({action,actorUsername:username,sessionId,...data,...(readGrant?{readGrant}:{})}),
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(String(result?.error||"ไม่สามารถดำเนินการ QA Access Auto-Pass ได้")+" (HTTP "+response.status+")");
  if(action==="auto-pass-state"&&typeof result.readGrant==="string"){try{sessionStorage.setItem("qa:sparks:verified-read-grant:v1",JSON.stringify({username:username.trim().toLowerCase(),sessionId,grant:result.readGrant}));}catch{}}
  if(action!=="auto-pass-state"&&typeof window!=="undefined")
    window.dispatchEvent(new Event("qa:sparks-updated"));
  return result as AutoPassResponse;
}
