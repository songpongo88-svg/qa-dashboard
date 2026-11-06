import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { FRUIT_MATCH, compareFruitRecords, replayFruitRound } from "../src/fruitMatchRules.js";

const COLLECTION = "qa_sparks_fruit_players_v1";
const BOARD_COLLECTION = "qa_sparks_fruit_boards";
const RECEIPTS = "qa_sparks_fruit_rounds";
const number = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const reject = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const sessionHash = session => createHash("sha256").update(String(session)).digest("hex");
function signingKey() {
  const secret = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!secret) reject("ระบบยังไม่พร้อมเริ่มเกม กรุณาลองใหม่ภายหลัง", 503);
  return createHash("sha256").update("qa-fruit-round-v1|" + secret).digest();
}
function ticket(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return encoded + "." + createHmac("sha256", signingKey()).update(encoded).digest("base64url");
}
function readTicket(value, actor, session) {
  if (typeof value !== "string" || value.length > 2500) reject("ไม่พบรอบเกมที่ถูกต้อง");
  const parts = value.split(".");
  if (parts.length !== 2) reject("รอบเกมไม่ถูกต้อง");
  const actual = Buffer.from(parts[1], "base64url");
  const expected = createHmac("sha256", signingKey()).update(parts[0]).digest();
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) reject("รอบเกมไม่ถูกต้อง", 403);
  let data;
  try { data = JSON.parse(Buffer.from(parts[0], "base64url").toString()); } catch { reject("รอบเกมไม่ถูกต้อง"); }
  if (data.version !== FRUIT_MATCH.version || data.username !== actor.username || data.sessionHash !== sessionHash(session)
      || !/^[a-f0-9-]{36}$/.test(data.id) || !Number.isSafeInteger(data.startedAt)) reject("รอบเกมไม่ตรงกับบัญชีที่เข้าสู่ระบบ", 403);
  return data;
}
const today = () => new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
function publicStats(stats) {
  return {
    played: number(stats.played), wins: number(stats.wins), completed: number(stats.completed),
    best: stats.best || null, history: Array.isArray(stats.history) ? stats.history.slice(-10) : [],
    dailyRewardCount: stats.rewardDay === today() ? number(stats.dailyRewardCount) : 0,
    dailyPlayCount: stats.playDay === today() ? number(stats.dailyPlayCount) : stats.rewardDay === today() ? number(stats.dailyRewardCount) : 0,
    playDay: today(), totalSparks: number(stats.totalSparks), rewardDay: today(),
  };
}
function rows(board) {
  return (Array.isArray(board.rows) ? board.rows : []).filter(row => row && typeof row.username === "string"
    && Number.isSafeInteger(row.elapsedMs) && Number.isSafeInteger(row.moves)).sort(compareFruitRecords).slice(0,100);
}

export function createFruitMatchService(db) {
  const { firestoreRequest, readDoc, recordValue, path, updateWrite, createWrite, walletDocumentPath,
    currentMemberYear, annualEarnedFromWallet, spendableBalance } = db;
  const playerPath = actor => path(COLLECTION, actor.username);
  const boardPath = path(BOARD_COLLECTION, FRUIT_MATCH.version);
  async function transact(work) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const begin = await firestoreRequest(":beginTransaction", "POST", { options: {readWrite:{}} });
      if (!begin?.transaction) reject("ไม่สามารถบันทึกเกมได้ กรุณาลองอีกครั้ง", 503);
      let committed = false;
      try {
        const { writes, result } = await work(begin.transaction);
        if (writes.length) { await firestoreRequest(":commit", "POST", {transaction:begin.transaction,writes}); committed = true; }
        return result;
      } catch (error) {
        if (["ABORTED","FAILED_PRECONDITION"].includes(error?.firestoreStatus) && attempt < 3) continue;
        throw error;
      } finally {
        if (!committed) await firestoreRequest(":rollback", "POST", {transaction:begin.transaction}).catch(() => {});
      }
    }
    reject("มีการบันทึกพร้อมกัน กรุณาลองใหม่", 409);
  }
  async function data(actor) {
    const [statsDoc, boardDoc] = await Promise.all([readDoc(playerPath(actor)),readDoc(boardPath)]);
    return {stats:publicStats(recordValue(statsDoc)),leaderboard:rows(recordValue(boardDoc))};
  }
  async function start(body, actor) {
    if (!/^[a-zA-Z0-9_-]{12,100}$/.test(String(body.requestId || ""))) reject("รหัสเริ่มเกมไม่ถูกต้อง");
    return transact(async transaction => {
      const docPath = playerPath(actor), snap = await readDoc(docPath,transaction), stats = recordValue(snap);
      const now = Date.now(), previous = stats.activeRound;
      let round;
      if (previous?.requestId === body.requestId && previous.sessionHash === sessionHash(body.sessionId)
          && now >= previous.startedAt && now - previous.startedAt < FRUIT_MATCH.durationMs) round = previous;
      if (round) return {writes:[],result:{token:ticket(round),deck:round.deck,stats:publicStats(stats)}};
      if (previous && now - previous.startedAt < 1000) reject("กรุณารอสักครู่ก่อนเริ่มรอบใหม่", 429);
      const date=today();
      const dailyPlayCount=stats.playDay===date?number(stats.dailyPlayCount):stats.rewardDay===date?number(stats.dailyRewardCount):0;
      if (dailyPlayCount>=FRUIT_MATCH.dailyPlayLimit) reject("ครบสิทธิ์เล่น Fruit Match 2 ครั้งวันนี้แล้ว กรุณาเล่นอีกครั้งวันถัดไป",409);
      const deck = Array.from({length:FRUIT_MATCH.pairs*2},(_,index)=>index % FRUIT_MATCH.pairs);
      for (let i=deck.length-1;i>0;i--) { const j=randomInt(i+1); [deck[i],deck[j]]=[deck[j],deck[i]]; }
      round = {version:FRUIT_MATCH.version,id:randomUUID(),username:actor.username,sessionHash:sessionHash(body.sessionId),
        requestId:body.requestId,startedAt:now,deck};
      const updates = {username:actor.username,displayName:actor.displayName.slice(0,120),played:number(stats.played)+1,
        activeRound:round,playDay:date,dailyPlayCount:dailyPlayCount+1,updatedAt:new Date(now).toISOString()};
      return {writes:[updateWrite(docPath,updates,snap)],result:{token:ticket(round),deck,stats:publicStats({...stats,...updates})}};
    });
  }
  async function finish(body, actor) {
    const round = readTicket(body.token,actor,body.sessionId);
    const replay = replayFruitRound(round.deck,body.trace);
    const receiptPath = path(RECEIPTS,round.id), docPath = playerPath(actor);
    return transact(async transaction => {
      const [receiptDoc, statsDoc, boardDoc, walletDoc] = await Promise.all([
        readDoc(receiptPath,transaction),readDoc(docPath,transaction),readDoc(boardPath,transaction),
        readDoc(walletDocumentPath(actor.username),transaction),
      ]);
      const stats=recordValue(statsDoc), board=recordValue(boardDoc), wallet=recordValue(walletDoc);
      if (receiptDoc) return {writes:[],result:{alreadyApplied:true,result:recordValue(receiptDoc),stats:publicStats(stats),leaderboard:rows(board)}};
      const age = Date.now()-round.startedAt;
      if (age < 0 || age > FRUIT_MATCH.durationMs+5000 || replay.elapsedMs > age+250) reject("รอบเกมหมดอายุหรือเวลาการเล่นไม่ถูกต้อง กรุณาเริ่มรอบใหม่");
      if (!replay.won && age < FRUIT_MATCH.durationMs) reject("รอบนี้ยังไม่หมดเวลา");
      if (stats.activeRound?.id !== round.id) reject("บัญชีนี้เริ่มรอบใหม่แล้ว กรุณาเล่นในรอบล่าสุด",409);
      const date=today(), year=currentMemberYear(), annual=annualEarnedFromWallet(wallet,year);
      const claimed=stats.rewardDay===date?number(stats.dailyRewardCount):0;
      const earned=replay.won && claimed<FRUIT_MATCH.dailyRewardLimit ? FRUIT_MATCH.reward:0;
      const now=new Date().toISOString();
      const reason=earned?"earned":!replay.won?"timeout":"daily-limit";
      const result={roundId:round.id,...replay,earned,reason,createdAt:now,balanceAfter:spendableBalance(wallet,year)+earned};
      const candidate={username:actor.username,displayName:actor.displayName.slice(0,120),elapsedMs:replay.elapsedMs,moves:replay.moves,achievedAt:now};
      const improved=replay.won && (!stats.best || compareFruitRecords(candidate,stats.best)<0);
      const nextStats={username:actor.username,displayName:candidate.displayName,completed:number(stats.completed)+1,
        wins:number(stats.wins)+(replay.won?1:0),totalSparks:number(stats.totalSparks)+earned,
        best:improved?candidate:stats.best||null,history:[...(Array.isArray(stats.history)?stats.history:[]),result].slice(-10),
        activeRound:null,rewardDay:date,dailyRewardCount:claimed+(earned?1:0),updatedAt:now};
      let leaderboard=rows(board);
      const writes=[updateWrite(docPath,nextStats,statsDoc),createWrite(receiptPath,result)];
      if (improved) {
        leaderboard=[...leaderboard.filter(row=>row.username!==actor.username),candidate].sort(compareFruitRecords).slice(0,100);
        writes.push(updateWrite(boardPath,{version:FRUIT_MATCH.version,rows:leaderboard,updatedAt:now},boardDoc));
      }
      if (earned) {
        const balance=spendableBalance(wallet,year)+earned;
        const lifetime=Math.max(number(wallet.totalEarned),number(wallet.firstLogin?.amount));
        writes.push(updateWrite(walletDocumentPath(actor.username),{username:actor.username,balance,balanceYear:year,totalEarned:lifetime+earned,
          memberYear:year,memberYearEarned:annual+earned,updatedAt:now},walletDoc));
        writes.push(createWrite(path("qa_sparks_wallets",encodeURIComponent(actor.username),"history","fruit-match-"+round.id),{
          createdAt:now,type:"earn",source:"mini-game-fruit-match",title:"Fruit Match Reward",amount:earned,
          detail:"จับคู่ผลไม้ครบ 12 คู่ · "+(replay.elapsedMs/1000).toFixed(2)+" วินาที",balanceAfter:balance,
          performedBy:actor.username,status:"Completed",roundId:round.id,
        }));
      }
      return {writes,result:{alreadyApplied:false,result,stats:publicStats({...stats,...nextStats}),leaderboard}};
    });
  }
  return {data,start,finish};
}
