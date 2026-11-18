import {randomInt} from "node:crypto";

// Rewards are granted on the server, never selected by the browser.
// Distribution: 60% 1–100, 25% 101–300, 10% 301–750,
// 4% 751–1200 and 1% 1201–1500 Sparks. Every amount is possible.
export function weightedMiningReward() {
  const tier = randomInt(10000);
  if (tier < 6000) return randomInt(1, 101);
  if (tier < 8500) return randomInt(101, 301);
  if (tier < 9500) return randomInt(301, 751);
  if (tier < 9900) return randomInt(751, 1201);
  return randomInt(1201, 1501);
}

const localTime = (ms) => {
  const fields = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(ms)).map(({type,value}) => [type,value]));
  return {day: fields.year + "-" + fields.month + "-" + fields.day,
    hour: Number(fields.hour), minute: Number(fields.minute)};
};
const count = value => Number.isSafeInteger(Number(value)) && Number(value)>=0 ? Number(value) : 0;
const fail = (message,status=409) => {throw Object.assign(new Error(message),{status});};
const isOpen = local => local.hour>=14 && local.hour<16;

export function createMiningService(db,{clock=()=>Date.now(),draw=weightedMiningReward}={}) {
  const {firestoreRequest,readDoc,recordValue,path,updateWrite,createWrite,walletDocumentPath,
    currentMemberYear,annualEarnedFromWallet,spendableBalance}=db;
  const historyPath = (username,day) =>
    path("qa_sparks_wallets",encodeURIComponent(username),"history","mining-"+day);

  async function state(actor) {
    const local = localTime(clock());
    const wallet = recordValue(await readDoc(walletDocumentPath(actor.username)));
    const claimedToday = wallet.miningLastDay === local.day;
    return {ok:true,day:local.day,open:isOpen(local),claimedToday,
      amount:claimedToday?count(wallet.miningLastAmount):0,
      available:isOpen(local)&&!claimedToday,
      opensAt:"14:00",closesAt:"16:00",timeZone:"Asia/Bangkok",
      minReward:1,maxReward:1500};
  }

  async function dig(actor) {
    if(!isOpen(localTime(clock())))fail("เหมืองเปิดให้ขุดเวลา 14:00–16:00 น. ตามเวลาไทยเท่านั้น");
    for(let attempt=0;attempt<5;attempt++){
      const started=await firestoreRequest(":beginTransaction","POST",{options:{readWrite:{}}});
      const transaction=started?.transaction;
      if(!transaction)fail("ไม่สามารถเริ่มธุรกรรมขุดเหมืองได้",503);
      let committed=false;
      try {
        const now=clock(),local=localTime(now);
        if(!isOpen(local))fail("หมดเวลาขุดเหมืองวันนี้แล้ว");
        const walletPath=walletDocumentPath(actor.username);
        const entryPath=historyPath(actor.username,local.day);
        const [walletDoc,historyDoc]=await Promise.all([
          readDoc(walletPath,transaction),readDoc(entryPath,transaction)
        ]);
        const wallet=recordValue(walletDoc),history=recordValue(historyDoc);
        if(historyDoc || wallet.miningLastDay === local.day) {
          // Idempotency: a second tab cannot grant the same day's reward again.
          return {ok:true,alreadyApplied:true,day:local.day,
            amount:count(history.amount || wallet.miningLastAmount),
            balance:spendableBalance(wallet,currentMemberYear())};
        }
        const amount=draw();
        if(!Number.isSafeInteger(amount)||amount<1||amount>1500)
          fail("Mining reward generator rejected invalid amount",500);
        const year=currentMemberYear();
        const balance=spendableBalance(wallet,year);
        const totalEarned=Math.max(count(wallet.totalEarned),count(wallet.firstLogin?.amount));
        const earned=annualEarnedFromWallet(wallet,year);
        if(![balance+amount,totalEarned+amount,earned+amount].every(Number.isSafeInteger))
          fail("ยอด Sparks เกินขอบเขตที่รองรับ",409);
        const iso=new Date(now).toISOString();
        const writes=[
          updateWrite(walletPath,{
            username:actor.username,balance:balance+amount,balanceYear:year,
            totalEarned:totalEarned+amount,memberYear:year,
            memberYearEarned:earned+amount,
            miningLastDay:local.day,miningLastAmount:amount,updatedAt:iso,
          },walletDoc),
          createWrite(entryPath,{
            createdAt:iso,type:"earn",source:"mini-game-mining",
            title:"Sparks Mining · ขุดเหมืองแร่",
            detail:"ขุดเหมืองประจำวันที่ "+local.day+" รับ "+amount+" Sparks",
            day:local.day,amount,balanceAfter:balance+amount,
            performedBy:actor.username,status:"Completed",
          }),
        ];
        await firestoreRequest(":commit","POST",{transaction,writes});
        committed=true;
        return {ok:true,alreadyApplied:false,day:local.day,amount,balance:balance+amount};
      }catch(error){
        if(["ABORTED","FAILED_PRECONDITION"].includes(error?.firestoreStatus)&&attempt<4)
          continue;
        throw error;
      }finally {
        if(!committed)await firestoreRequest(":rollback","POST",{transaction}).catch(()=>{});
      }
    }
    fail("มีรายการขุดเหมืองเกิดขึ้นพร้อมกัน กรุณาลองอีกครั้ง");
  }
  return {state,dig};
}
