export const FRUIT_MATCH = Object.freeze({
  version: "fruit-match-12-v1", pairs: 12, durationMs: 150000,
  reward: 20, dailyRewardLimit: 2, dailyPlayLimit: 2, mismatchMs: 650, minimumFlipMs: 80,
});
export const FRUIT_MATCH_FRUITS = Object.freeze([
  ["apple", "แอปเปิล"], ["banana", "กล้วย"], ["coconut", "มะพร้าว"],
  ["lemon", "เลมอน"], ["lychee", "ลิ้นจี่"], ["mangosteen", "มังคุด"],
  ["orange", "ส้ม"], ["pear", "แพร์"], ["pineapple", "สับปะรด"],
  ["dragonfruit", "แก้วมังกร"], ["strawberry", "สตรอว์เบอร์รี"], ["watermelon", "แตงโม"],
].map(([id, name]) => Object.freeze({ id, name, image: `/games/fruit-match/${id}.jpg` })));

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
