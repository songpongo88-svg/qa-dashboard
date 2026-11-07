// Display-only classification. Never mutate or delete stored items or reward history.
export type ItemShelfFilter="available"|"processing"|"history";

export function classifyTrueMoneyItem(item:{status:string;expiresAt?:string},request?:{status:string}|null,now=Date.now()):ItemShelfFilter{
  if(request?.status==="paid"||item.status==="paid")return "history";
  if(request||item.status==="requested")return "processing";
  if(item.status==="unused")return Number.isFinite(Date.parse(item.expiresAt||""))
    &&Date.parse(item.expiresAt||"")<=now?"history":"available";
  return "history";
}
export function classifySpecialRewardItem(item:{status:string;expiresAt?:string},now=Date.now()):ItemShelfFilter{
  const status=String(item.status||"").toLowerCase();
  if(["paid","delivered","completed","rejected","expired","cancelled"].includes(status))return "history";
  if(status==="unused")return Number.isFinite(Date.parse(item.expiresAt||""))
    &&Date.parse(item.expiresAt||"")<=now?"history":"available";
  // Once an item has been activated or its request submitted, its original
  // 30-day redemption expiry must never cancel an outstanding payout.
  return "processing";
}
export function classifyLotteryTicket(ticket:{paidAt?:string|null;status?:string}):ItemShelfFilter{
  return ticket.paidAt||["checked","settled","paid"].includes(String(ticket.status||"").toLowerCase())
    ?"history":"processing";
}
