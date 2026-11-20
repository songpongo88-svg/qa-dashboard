// Exact Bangkok expiry boundaries for deterministic compensation policy tests.
// The authoritative award amount and active-member checks live in PostgreSQL.
const BKK="Asia/Bangkok";
export const SPECIAL_CHECKIN_DAY="2026-11-24";
export function checkinCompensationAmount(day) {
  return day===SPECIAL_CHECKIN_DAY?200:50;
}
export function miningCompensationTier(weight,position) {
  const n=Math.floor(Number(weight));
  if(!Number.isInteger(n)||n<0||n>=10000)throw Error("invalid tier");
  const index=Math.max(0,Math.min(.999999,Number(position)));
  if(n<6000)return 1+Math.floor(index*100);
  if(n<8500)return 101+Math.floor(index*200);
  if(n<9500)return 301+Math.floor(index*450);
  if(n<9900)return 751+Math.floor(index*450);
  return 1201+Math.floor(index*300);
}
export function treasureCompensationTier(weight,position) {
  const n=Math.floor(Number(weight));
  if(!Number.isInteger(n)||n<0||n>=1000)throw Error("invalid tier");
  const x=Math.max(0,Math.min(.999999,Number(position)));
  if(n<700)return 1+Math.floor(x*100);
  if(n<930)return 101+Math.floor(x*200);
  return 301+Math.floor(x*200);
}
const isoDay=(d)=>d.toISOString().slice(0,10);
export function bangkokMoment(day,hour=0,minute=0) {
  // Bangkok is UTC+07 in the 2026 campaign window.
  return new Date(Date.parse(day+"T00:00:00.000Z")+(hour-7)*3600000+minute*60000);
}
export function lostDailyOpportunity(from,to,day) {
  const expiration=bangkokMoment(isoDay(new Date(Date.parse(day+"T00:00Z")+86400000)));
  return Date.parse(from)<expiration.getTime()&&Date.parse(to)>=expiration.getTime();
}
export function lostMiningOpportunity(from,to,day) {
  const begin=bangkokMoment(day,14).getTime(),expiry=bangkokMoment(day,16).getTime();
  return Date.parse(from)<expiry&&Date.parse(to)>=expiry&&Date.parse(to)>begin;
}
export function fruitMatchRemainingReward(played,paid) {
  return 20*Math.max(0,2-Math.max(0,Math.floor(Number(played)||0),Math.floor(Number(paid)||0)));
}