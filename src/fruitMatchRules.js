export const FRUIT_MATCH = Object.freeze({
  version: "fruit-match-12-v1", pairs: 12, durationMs: 150000, entryFee: 1,
  reward: 20, dailyRewardLimit: 2, dailyPlayLimit: 2, mismatchMs: 650, minimumFlipMs: 80,
});
export const FRUIT_MATCH_FRUITS = Object.freeze([
  ["apple", "แอปเปิล"], ["banana", "กล้วย"], ["coconut", "มะพร้าว"],
  ["lemon", "เลมอน"], ["lychee", "ลิ้นจี่"], ["mangosteen", "มังคุด"],
  ["orange", "ส้ม"], ["pear", "แพร์"], ["pineapple", "สับปะรด"],
  ["dragonfruit", "แก้วมังกร"], ["strawberry", "สตรอว์เบอร์รี"], ["watermelon", "แตงโม"],
].map(([id, name]) => Object.freeze({ id, name, image: `/games/fruit-match/cute/${id}.svg` })));

export const MATCH_THEMES = Object.freeze({
  fruit: {title:"Fruit Match", label:"จับคู่ผลไม้", days:"จันทร์–พุธ"},
  number: {title:"Number Match", label:"จับคู่ตัวเลข 2 หลัก", days:"พฤหัสบดี"},
  color: {title:"Color Match", label:"จับคู่สี", days:"ศุกร์–เสาร์"},
  cat: {title:"Cat Match", label:"จับคู่ท่าทางแมวจริง", days:"อาทิตย์"},
});
export const MATCH_COLORS = Object.freeze(["#ff143c","#0754df","#ffcd00","#03b93e","#9300dc","#ff8d00","#f22385","#06b5ae","#805031","#717780","#02bee9","#92db00"]);
export const MATCH_CATS = Object.freeze([
  ["หลับ","CAT_SLEEPING.jpg"],
  ["อ้าปากหาว","Cat_yawning.jpg"],
  ["ยืดตัว","2010-12-27_Cat_stretching.jpg"],
  ["นอนขด","Cat_sleep.jpg"],
  ["นอนพักในกล่อง","Kantaro_taking_a_rest_in_a_box_(5941709022).jpg"],
  ["นอนหมอน","Cat_relaxing_on_the_pillow.jpg"],
  ["เหยียดตัว","2010-03-10_cat_stretching_at_Asagaya.jpg"],
  ["ง่วงนอน","Colossus_is_sleepy.jpg"],
  ["หลับบนที่นอน","Domestic_cat_asleep.jpg"],
  ["เหยียดเท้า","Cute_paw_(6882033960).jpg"],
  ["นอนสบาย","Happy_nap_(12678277895).jpg"],
  ["หลับตา","Coco_sleeping.jpg"],
].map(([name,file])=>Object.freeze({name,image:"https://commons.wikimedia.org/wiki/Special:FilePath/"+encodeURIComponent(file).replace(/%2F/g,"/")+"?width=200"})));
export function matchThemeAt(ms=Date.now()){
  const day=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Bangkok",weekday:"short"}).format(new Date(ms));
  return day==="Thu"?"number":day==="Fri"||day==="Sat"?"color":day==="Sun"?"cat":"fruit";
}
// Monday 23 November 2026 at 11:00 Bangkok time, 04:00 UTC.
export const FRUIT_WEEKLY=Object.freeze({firstResetAt:Date.parse("2026-11-23T04:00:00Z"),
  weekMs:604800000,championSparks:100});
export function fruitWeekPeriod(ms=Date.now()){
  const index=Math.floor((ms-FRUIT_WEEKLY.firstResetAt)/FRUIT_WEEKLY.weekMs);
  if(index<0)return {index:-1,key:"legacy",startAt:null,nextResetAt:new Date(FRUIT_WEEKLY.firstResetAt).toISOString()};
  const from=FRUIT_WEEKLY.firstResetAt+index*FRUIT_WEEKLY.weekMs;
  return {index,key:new Date(from).toISOString().slice(0,10),startAt:new Date(from).toISOString(),
    nextResetAt:new Date(from+FRUIT_WEEKLY.weekMs).toISOString()};
}
export function formatFruitTime(ms, precise = false) {
  const cs = precise ? Math.round(Math.max(0, ms) / 10) : Math.ceil(Math.max(0, ms) / 1000) * 100;
  const clock = String(Math.floor(cs / 6000)).padStart(2, "0") + ":" + String(Math.floor(cs / 100) % 60).padStart(2, "0");
  return precise ? clock + "." + String(cs % 100).padStart(2, "0") : clock;
}
export function compareFruitRecords(a, b) {
  return a.elapsedMs - b.elapsedMs || a.moves - b.moves || String(a.achievedAt).localeCompare(String(b.achievedAt));
}

// Replay the issued board, rather than accepting a client score or reward amount.
export function replayFruitRound(deck, trace) {
  const invalid = () => { throw Object.assign(new Error("ข้อมูลการเล่นไม่ถูกต้อง กรุณาเริ่มรอบใหม่"), { status: 400 }); };
  if (!Array.isArray(deck) || deck.length !== FRUIT_MATCH.pairs * 2 || !Array.isArray(trace) || trace.length > 600) invalid();
  const counts = Array(FRUIT_MATCH.pairs).fill(0);
  for (const fruit of deck) { if (!Number.isInteger(fruit) || fruit < 0 || fruit >= counts.length) invalid(); counts[fruit]++; }
  if (counts.some(count => count !== 2)) invalid();
  const matched = new Set(); let first = null, previousAt = -Infinity, lockedUntil = 0, moves = 0;
  for (const event of trace) {
    if (!event || !Number.isInteger(event.card) || event.card < 0 || event.card >= deck.length
        || !Number.isInteger(event.at) || event.at < 0 || event.at >= FRUIT_MATCH.durationMs
        || event.at - previousAt < FRUIT_MATCH.minimumFlipMs || event.at < lockedUntil
        || matched.has(event.card) || first === event.card || matched.size === deck.length) invalid();
    previousAt = event.at;
    if (first === null) { first = event.card; continue; }
    moves++;
    if (deck[first] === deck[event.card]) { matched.add(first); matched.add(event.card); }
    else lockedUntil = event.at + FRUIT_MATCH.mismatchMs;
    first = null;
  }
  const won = matched.size === deck.length;
  return { won, pairs: matched.size / 2, moves,
    elapsedMs: won ? Math.round(previousAt / 10) * 10 : FRUIT_MATCH.durationMs };
}
