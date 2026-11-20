// Payment-cycle month is named for the *next* performance period.
// An October performance signature corrected after Nov 15, 2026 is late
// for October; if completed before Dec 15, it belongs to November payment.
export function shiftPaymentMonth(month, offset=1) {
  const [year,m]=String(month||"").split("-").map(Number);
  if(!year||m<1||m>12)return "";
  const d=new Date(Date.UTC(year,m-1+offset,1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`;
}
function deadlineUtc(month) {
  const [year,m]=String(month||"").split("-").map(Number);
  return year&&m>0&&m<13 ? Date.UTC(year,m,15,16,59,59) : NaN;
}
export function carryOverCycle(performanceMonth, latestSignedAt, coachingCompletedAt="") {
  const signed=Date.parse(String(latestSignedAt||""));
  const coaching=coachingCompletedAt ? Date.parse(String(coachingCompletedAt)) : NaN;
  if(!Number.isFinite(signed))return "";
  const completed=Math.max(signed,Number.isFinite(coaching)?coaching:signed);
  const firstDeadline=deadlineUtc(performanceMonth);
  if(!Number.isFinite(firstDeadline)||completed<=firstDeadline)return "";
  let cycle=shiftPaymentMonth(performanceMonth,1);
  for(let i=0;i<24&&cycle;i++){
    if(completed<=deadlineUtc(cycle))return cycle;
    cycle=shiftPaymentMonth(cycle,1);
  }
  return "";
}
