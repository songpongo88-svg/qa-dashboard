// QA Lottery uses genuine GLO L6 results. Never treat an unofficial or partial
// result as a payable draw. All wallet mutations run inside Firestore transactions.
const PRICE = 120;
const MAX_PER_DRAW = 2;
const AWARDS = Object.freeze({first:3000, back3:1500, last2:1000});
const DRAW_COLLECTION = "qa_sparks_lottery_draws_v1";
const TH_TIMEZONE = "Asia/Bangkok";
const MAX_SETTLEMENT_PLAYERS = 120;
const GLO_HOST = "https://www.glo.or.th";

const error = (message, status = 400) => {throw Object.assign(new Error(message),{status});};
const nonnegative = n => Number.isSafeInteger(n) && n >= 0 ? n : 0;
function bangkokParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {timeZone:TH_TIMEZONE,
    year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",
    hourCycle:"h23"}).formatToParts(date);
  const get = type => Number(parts.find(part=>part.type===type)?.value || 0);
  return {year:get("year"),month:get("month"),day:get("day"),hour:get("hour"),minute:get("minute")};
}
const iso = (year, month, day) => [year,String(month).padStart(2,"0"),String(day).padStart(2,"0")].join("-");
function nominalCandidates(date = new Date()) {
  const {year,month} = bangkokParts(date);
  const items=[];
  for (let offset=-2;offset<=1;offset++) {
    const y=new Date(Date.UTC(year,month-1+offset,1));
    items.push(iso(y.getUTCFullYear(),y.getUTCMonth()+1,1),iso(y.getUTCFullYear(),y.getUTCMonth()+1,16));
  }
  return items.sort();
}
export function nextLotteryDraw(date = new Date()) {
  const {year,month,day,hour,minute} = bangkokParts(date);
  const minuteOfDay=hour*60+minute;
  // Stop on draw day at 14:00 BKK; no client clock can override this.
  const available = nominalCandidates(date).filter(draw => {
    const thisDay=iso(year,month,day);
    return draw > thisDay || (draw===thisDay && minuteOfDay<14*60);
  });
  return available[0];
}
export function previousLotteryDraw(date = new Date()) {
  const {year,month,day}=bangkokParts(date);
  const current=iso(year,month,day);
  return nominalCandidates(date).filter(x=>x<=current).at(-1);
}
export function lotteryPrize(number, result) {
  if (!/^[0-9]{6}$/.test(String(number))) error("หมายเลขต้องมี 6 หลัก");
  const matched=[];
  if (number===result.first) matched.push("first");
  if (result.back3.includes(number.slice(-3))) matched.push("back3");
  if (number.slice(-2)===result.last2) matched.push("last2");
  return {matched,amount:matched.reduce((sum,key)=>sum+AWARDS[key],0)};
}
function officialGroup(data,key,count,digits) {
  const raw=data?.[key]?.number;
  if (!Array.isArray(raw) || raw.length!==count) error("ข้อมูลผลสลาก GLO ไม่ครบ: "+key,503);
  const values=raw.map(item=>String(item?.value ?? "").trim());
  if (values.some(v=>!new RegExp("^[0-9]{"+digits+"}$").test(v)) ||
      new Set(values).size!==values.length) error("ข้อมูลผลสลาก GLO ผิดรูปแบบ: "+key,503);
  return values;
}
export function parseOfficialResult(envelope) {
  if (envelope?.statusCode!==200 || envelope?.status!==true || !envelope?.response) return null;
  const item=envelope.response.result || envelope.response;
  if (!item?.date || !/^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(item.date)) return null;
  const date=new Date(item.date+"T00:00:00+07:00");
  if (!Number.isFinite(date.getTime()) || bangkokParts(date).day!==Number(item.date.slice(-2))) return null;
  return {date:item.date,first:officialGroup(item.data,"first",1,6)[0],
    back3:officialGroup(item.data,"last3b",2,3),
    last2:officialGroup(item.data,"last2",1,2)[0],
    source:"GLO",sourceUrl:"https://www.glo.or.th/",confirmedAt:new Date().toISOString()};
}
async function gloRequest(endpoint,body) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),8500);
  try {
    const response=await fetch(GLO_HOST+endpoint,{method:"POST",headers:{
      "Content-Type":"application/json","Accept":"application/json",
      "User-Agent":"Mozilla/5.0 (compatible; QA-Lottery/1.0)"},body:JSON.stringify(body),
      signal:controller.signal});
    if (!response.ok) error("GLO ไม่พร้อมให้ตรวจผล (HTTP "+response.status+")",503);
    const raw=await response.text();
    if (raw.length>1500000) error("ข้อมูล GLO มีขนาดผิดปกติ",503);
    return JSON.parse(raw);
  } catch(e) {
    if (e?.status) throw e;
    error("ไม่สามารถเชื่อมต่อผลรางวัลของสำนักงานสลากฯ ได้",503);
  } finally {clearTimeout(timer);}
}
const dateDifference=(a,b)=>Math.round((Date.parse(a+"T00:00:00Z")-Date.parse(b+"T00:00:00Z"))/86400000);
async function fetchOfficial(drawDate) {
  const latest=parseOfficialResult(await gloRequest("/api/lottery/getLatestLottery",{}));
  if (latest && Math.abs(dateDifference(latest.date,drawDate))<=4) return latest;
  const parts=drawDate.split("-");
  const exact=parseOfficialResult(await gloRequest("/api/checking/getLotteryResult",{
    date:parts[2],month:parts[1],year:parts[0]}));
  if (!exact || Math.abs(dateDifference(exact.date,drawDate))>4) return null;
  return exact;
}

export function createQaLotteryService(db) {
  const {firestoreRequest,readDoc,listCollection,recordValue,path,updateWrite,createWrite,
    walletDocumentPath,currentMemberYear,annualEarnedFromWallet,spendableBalance}=db;
  const drawPath=date=>path(DRAW_COLLECTION,date);
  const playerPath=(date,username)=>drawPath(date)+"/players/"+encodeURIComponent(username);
  const historyPath=(username,id)=>walletDocumentPath(username)+"/history/"+encodeURIComponent(id);
  const ticketPath=(username,id)=>walletDocumentPath(username)+"/lottery_tickets/"+encodeURIComponent(id);
  async function transaction(work) {
    for (let attempt=0;attempt<4;attempt++) {
      const start=await firestoreRequest(":beginTransaction","POST",{options:{readWrite:{}}});
      if (!start?.transaction) error("ระบบ Sparks ยังไม่พร้อมทำรายการ",503);
      let committed=false;
      try {
        const {writes,result}=await work(start.transaction);
        if (writes.length) {
          await firestoreRequest(":commit","POST",{transaction:start.transaction,writes});
          committed=true;
        }
        return result;
      } catch(e) {
        if (["ABORTED","FAILED_PRECONDITION"].includes(e?.firestoreStatus) && attempt<3) continue;
        throw e;
      } finally {
        if (!committed) await firestoreRequest(":rollback","POST",{transaction:start.transaction}).catch(()=>{});
      }
    }
    error("มีการทำรายการพร้อมกัน กรุณาลองใหม่",409);
  }
  function publicDraw(date,draw,player) {
    return {
      date,status:draw.officialResult?"published":"pending",
      officialResult:draw.officialResult || null,
      tickets:(Array.isArray(player.tickets)?player.tickets:[]).map(t=>({
        id:String(t.id),number:String(t.number),createdAt:String(t.createdAt),
        paidAt:t.paidAt||null,prize:nonnegative(t.prize),matched:Array.isArray(t.matched)?t.matched:[],
      }))
    };
  }
  async function state(actor) {
    const current=nextLotteryDraw();
    const last=previousLotteryDraw();
    const [drawDoc,playerDoc,lastDraw,lastPlayer]=await Promise.all([
      readDoc(drawPath(current)),readDoc(playerPath(current,actor.username)),
      last===current?null:readDoc(drawPath(last)),
      last===current?null:readDoc(playerPath(last,actor.username))
    ]);
    return {price:PRICE,maxPerDraw:MAX_PER_DRAW,draw:publicDraw(current,recordValue(drawDoc),recordValue(playerDoc)),
      previous:last!==current?publicDraw(last,recordValue(lastDraw),recordValue(lastPlayer)):null,
      cutoffTime:"14:00",timeZone:TH_TIMEZONE};
  }
  async function listTickets(actor){
    const rows=await listCollection(walletDocumentPath(actor.username)+"/lottery_tickets",
      ["id","number","drawDate","createdAt","paidAt","prize","matched","status"]);
    if(rows.truncated) error("จำนวนตั๋ว QA Lottery มากเกินกำหนด",503);
    const owned=rows.documents.map(recordValue).filter(x=>/^[0-9]{6}$/.test(x.number||""));
    // Existing purchases from before My Items support are still shown for recent draws.
    const last=previousLotteryDraw();
    const next=nextLotteryDraw();
    const [lastPlayer,nextPlayer]=await Promise.all([
      readDoc(playerPath(last,actor.username)),readDoc(playerPath(next,actor.username))
    ]);
    for(const [date,doc] of [[last,lastPlayer],[next,nextPlayer]]){
      for(const t of recordValue(doc).tickets||[]){
        if(!owned.some(x=>x.id===t.id))owned.push({
          id:t.id,number:t.number,drawDate:date,createdAt:t.createdAt,paidAt:t.paidAt||null,
          prize:nonnegative(t.prize),matched:Array.isArray(t.matched)?t.matched:[],
          status:t.paidAt?"checked":"pending"
        });
      }
    }
    return {tickets:owned.sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")))};
  }
  async function purchase(body,actor) {
    const number=String(body.number||"").trim();
    const requestId=String(body.requestId||"");
    if (!/^[0-9]{6}$/.test(number)) error("กรุณากรอกเลข 6 หลัก (0–9) ให้ครบ");
    if (!/^[a-zA-Z0-9_-]{12,100}$/.test(requestId)) error("รหัสการซื้อไม่ถูกต้อง");
    // The selected draw must be the server-side open draw, not a client date.
    const date=nextLotteryDraw();
    if (body.drawDate!==date) error("งวดเปลี่ยนแล้ว กรุณาโหลดข้อมูลใหม่ก่อนซื้อ",409);
    return transaction(async tx => {
      // Recheck cutoff on every attempt, not just when the request begins.
      if (nextLotteryDraw()!==date) error("ปิดรับซื้อเลขของงวดนี้แล้ว",409);
      const pp=playerPath(date,actor.username), wp=walletDocumentPath(actor.username), dp=drawPath(date);
      const [playerDoc,walletDoc,drawDoc]=await Promise.all([readDoc(pp,tx),readDoc(wp,tx),readDoc(dp,tx)]);
      const player=recordValue(playerDoc),wallet=recordValue(walletDoc),draw=recordValue(drawDoc);
      const tickets=Array.isArray(player.tickets)?player.tickets:[];
      const duplicate=tickets.find(t=>t.id===requestId);
      if (duplicate) return {writes:[],result:{alreadyPurchased:true,number:duplicate.number,drawDate:date,tickets}};
      if (tickets.length>=MAX_PER_DRAW) error("ซื้อ QA Lottery ครบ 2 ครั้งของงวดนี้แล้ว",409);
      if (draw.officialResult) error("ประกาศผลรางวัลแล้ว ไม่สามารถซื้อเพิ่มได้",409);
      const year=currentMemberYear(), balance=spendableBalance(wallet,year);
      if (balance<PRICE) error("Sparks ไม่เพียงพอ ต้องใช้ 120 Sparks",409);
      const when=new Date().toISOString();
      const ticket={id:requestId,number,createdAt:when,prize:0,matched:[],paidAt:null};
      const nextBalance=balance-PRICE;
      const nextTickets=[...tickets,ticket];
      const writes=[
        updateWrite(wp,{username:actor.username,balance:nextBalance,balanceYear:year,
          totalSpent:nonnegative(wallet.totalSpent)+PRICE,updatedAt:when},walletDoc),
        updateWrite(pp,{username:actor.username,displayName:String(actor.displayName||actor.username).slice(0,120),
          drawDate:date,tickets:nextTickets,updatedAt:when},playerDoc),
        createWrite(ticketPath(actor.username,requestId),{
          id:requestId,number,drawDate:date,createdAt:when,paidAt:null,prize:0,matched:[],status:"pending"
        }),
        createWrite(historyPath(actor.username,"qa-lottery-buy-"+requestId),{
          createdAt:when,type:"spend",source:"qa-lottery",title:"QA Lottery · ซื้อเลข",
          detail:"งวด "+date+" · เลข "+number,amount:-PRICE,balanceAfter:nextBalance,
          performedBy:actor.username,status:"Completed",drawDate:date,requestId,
        })
      ];
      if (!drawDoc) writes.push(createWrite(dp,{drawDate:date,createdAt:when,updatedAt:when}));
      return {writes,result:{alreadyPurchased:false,number,drawDate:date,balance:nextBalance,tickets:nextTickets}};
    });
  }
  async function storeOfficial(date,confirmed) {
    const dp=drawPath(date);
    return transaction(async tx => {
      const snap=await readDoc(dp,tx);
      if (!snap) return {writes:[],result:null};
      const current=recordValue(snap);
      if (current.officialResult) {
        const old=current.officialResult;
        if (old.date!==confirmed.date || old.first!==confirmed.first ||
            old.last2!==confirmed.last2 || JSON.stringify(old.back3)!==JSON.stringify(confirmed.back3)) {
          error("ผลรางวัล GLO ไม่ตรงกับผลที่เคยบันทึก ระงับการจ่ายอัตโนมัติ",503);
        }
        return {writes:[],result:old};
      }
      return {writes:[updateWrite(dp,{officialResult:confirmed,updatedAt:new Date().toISOString()},snap)],result:confirmed};
    });
  }
  async function settlePlayer(date,username,result) {
    return transaction(async tx => {
      const pp=playerPath(date,username),wp=walletDocumentPath(username);
      const [playerDoc,walletDoc]=await Promise.all([readDoc(pp,tx),readDoc(wp,tx)]);
      if (!playerDoc) return {writes:[],result:{count:0,paid:0}};
      const player=recordValue(playerDoc),wallet=recordValue(walletDoc);
      const tickets=Array.isArray(player.tickets)?player.tickets:[];
      if (!tickets.length || tickets.every(t=>Boolean(t.paidAt))) return {writes:[],result:{count:0,paid:0}};
      const now=new Date().toISOString();
      const unsettled=tickets.filter(t=>!t.paidAt);
      const ticketDocuments=await Promise.all(unsettled.map(t=>readDoc(ticketPath(username,t.id),tx)));
      const settled=tickets.map(t=>{if (t.paidAt) return t; const award=lotteryPrize(t.number,result);return {...t,matched:award.matched,amount:award.amount,prize:award.amount,paidAt:now};});
      // Only official result fields are accepted; ignore result date/source sent by client.
      const total=settled.filter(t=>t.paidAt===now).reduce((n,t)=>n+nonnegative(t.amount),0);
      const year=currentMemberYear(),balance=spendableBalance(wallet,year),annual=annualEarnedFromWallet(wallet,year);
      const nextBalance=balance+total;
      const writes=[updateWrite(pp,{tickets:settled,updatedAt:now,settledAt:now},playerDoc)];
      for(let i=0;i<unsettled.length;i++){
        const ticket=settled.find(t=>t.id===unsettled[i].id);
        const doc=ticketDocuments[i],key=ticketPath(username,ticket.id);
        const data={id:ticket.id,number:ticket.number,drawDate:date,createdAt:ticket.createdAt,
          paidAt:now,prize:nonnegative(ticket.prize),matched:ticket.matched,status:"checked"};
        writes.push(doc?updateWrite(key,data,doc):createWrite(key,data));
      }
      if (total) {
        writes.push(updateWrite(wp,{username,balance:nextBalance,balanceYear:year,
          totalEarned:Math.max(nonnegative(wallet.totalEarned),nonnegative(wallet.firstLogin?.amount))+total,
          memberYear:year,memberYearEarned:annual+total,updatedAt:now},walletDoc));
        let runningBalance=balance;
        for (const ticket of settled.filter(t=>t.paidAt===now && t.amount>0)) {
          runningBalance+=ticket.amount;
          writes.push(createWrite(historyPath(username,"qa-lottery-win-"+ticket.id),{
            createdAt:now,type:"earn",source:"qa-lottery",title:"QA Lottery · ถูกรางวัล",
            detail:"งวด "+date+" · เลข "+ticket.number+" · "+ticket.matched.join("+"),
            amount:ticket.amount,balanceAfter:runningBalance,drawDate:date,
            officialDrawDate:result.date,requestId:ticket.id,status:"Completed"
          }));
        }
      }
      return {writes,result:{count:unsettled.length,paid:total}};
    });
  }
  async function settle() {
    const now=new Date();
    const today=bangkokParts(now),todayIso=iso(today.year,today.month,today.day);
    // Only two recent nominal draws; safe to retry every day. Draws without
    // purchases do not consume external GLO requests.
    const candidates=nominalCandidates(now).filter(d=>d<=todayIso && dateDifference(todayIso,d)<=32).slice(-3).reverse();
    const reports=[];
    for (const date of candidates) {
      const dp=drawPath(date);
      const existing=await readDoc(dp);
      if (!existing) continue;
      if (recordValue(existing).settledCompleteAt) continue;
      let result=recordValue(existing).officialResult;
      if (!result) {
        result=await fetchOfficial(date);
        if (!result) {reports.push({drawDate:date,status:"awaiting-official"});continue;}
        result=await storeOfficial(date,result);
      }
      const list=await listCollection(dp+"/players",["username","tickets"]);
      if (list.truncated) error("รายชื่อผู้ซื้อ QA Lottery เกินขีดจำกัด ไม่จ่ายรางวัลจนกว่าจะตรวจครบ",503);
      const pending=list.documents.map(item=>recordValue(item))
        .filter(p=>p.username && Array.isArray(p.tickets) && p.tickets.some(t=>!t.paidAt));
      let paid=0,processed=0;
      // Respect limited serverless execution and Firestore read budget.
      for (let i=0;i<Math.min(pending.length,MAX_SETTLEMENT_PLAYERS);i+=5) {
        const group=await Promise.all(pending.slice(i,i+5).map(p=>settlePlayer(date,p.username,result)));
        for (const record of group) {paid+=record.paid;processed+=record.count;}
      }
      if (pending.length<=MAX_SETTLEMENT_PLAYERS) {
        await transaction(async tx=>{
          const snap=await readDoc(dp,tx);
          if (!snap || recordValue(snap).settledCompleteAt) return {writes:[],result:null};
          return {writes:[updateWrite(dp,{settledCompleteAt:new Date().toISOString()},snap)],result:null};
        });
      }
      reports.push({drawDate:date,officialDrawDate:result.date,status:pending.length>MAX_SETTLEMENT_PLAYERS?"partial":"processed",
        ticketsProcessed:processed,paidSparks:paid,remainingPlayers:Math.max(0,pending.length-MAX_SETTLEMENT_PLAYERS)});
    }
    return {checkedAt:new Date().toISOString(),reports};
  }
  return {state,purchase,settle,listTickets};
}
