import { useEffect } from "react";

/**
 * Award Quest #02 automatically during an authenticated QA Dashboard session.
 * It runs for existing custom-photo users as well as newly uploaded photos;
 * the server is authoritative about image existence, annual cap, deadlines,
 * and the immutable one-grant-per-member Firestore transaction.
 */
export default function AutoProfileQuestReward({ username, sessionId }: { username: string; sessionId: string }) {
  useEffect(() => {
    if (!username || !sessionId) return;
    let active = true;
    let pending = false;
    let rewarded = false;
    const check = async () => {
      if (!active || pending || rewarded) return;
      const parts = new Intl.DateTimeFormat("en-US", {
        year:"numeric",month:"2-digit",day:"2-digit",timeZone:"Asia/Bangkok"
      }).formatToParts(new Date());
      const dateOf=(key:string)=>parts.find(x=>x.type===key)?.value||"";
      const today=dateOf("year")+"-"+dateOf("month")+"-"+dateOf("day");
      if (today > "2026-12-15") return;
      pending = true;
      try {
        const response=await fetch("/api/sparks-admin",{
          method:"POST",cache:"no-store",headers:{"content-type":"application/json"},
          body:JSON.stringify({action:"claim-profile-makeover",actorUsername:username,sessionId})
        });
        if(!response.ok)return;
        const result=await response.json();
        if(!active)return;
        if(result.credited){
          rewarded=true;
          if(!result.alreadyApplied)window.dispatchEvent(new Event("qa:sparks-updated"));
          window.dispatchEvent(new Event("qa:profile-quest-checked"));
        }
      }catch{
        // No fake reward confirmation or client-side credit when Firebase is unavailable.
      }finally{pending=false;}
    };
    void check();
    const onPhoto=(event:Event)=>{
      const target=(event as CustomEvent<{username?:string}>).detail?.username;
      if(target?.toLowerCase()===username.toLowerCase())void check();
    };
    window.addEventListener("qa-profile-photo-updated",onPhoto);
    return ()=>{active=false;window.removeEventListener("qa-profile-photo-updated",onPhoto);};
  },[username,sessionId]);
  return null;
}
