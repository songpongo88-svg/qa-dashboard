export type AutoPassAction =
  | "auto-pass-state" | "auto-pass-claim-free" | "auto-pass-buy" | "auto-pass-use";
export type AutoPassResponse = {
  owned?: number; balance?: number; freeClaimed?: boolean; freeActive?: boolean;
  updated?: boolean; alreadyApplied?: boolean; completed?: boolean;
};
export async function qaAutoPassAction(
  action: AutoPassAction, username: string, sessionId: string,
  data: { requestId?: string; expectedPrice?: number; challengeId?: string }={},
): Promise<AutoPassResponse> {
  if(!username||!sessionId)throw new Error("กรุณา Login QA Dashboard หรือ QA Sparks ก่อนใช้ Auto-Pass");
  const response=await fetch("/api/sparks-admin",{
    method:"POST",cache:"no-store",credentials:"same-origin",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({action,actorUsername:username,sessionId,...data}),
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(String(result?.error||"ไม่สามารถดำเนินการ QA Access Auto-Pass ได้"));
  if(action!=="auto-pass-state"&&typeof window!=="undefined")
    window.dispatchEvent(new Event("qa:sparks-updated"));
  return result as AutoPassResponse;
}
