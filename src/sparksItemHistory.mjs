/** Display-only projection. Never writes wallets or invents an Item use. */
const names={
 "qa-access-auto-pass":"QA Access Auto-Pass","typing-relief":"Typing Relief",
 "announcement-shield":"Announcement Shield","truemoney-20-thb":"TrueMoney 20 THB",
 "punthai-65":"PUNTHAI 65 THB","amazon-55":"Café Amazon 55 THB",
 "seven-100":"7-Eleven 100 THB","netflix-1m":"Netflix 1 เดือน",
 "qa-lottery-ticket":"QA Lottery Ticket"
};
const itemSources=new Set(["qa-auto-pass-free","reward-redemption","reward-activation",
 "special-reward","special-reward-admin","special-reward-activation","announcement-shield",
 "qa-lottery","item-expiry-derived","reward-payout"]);
export function isItemHistoryEntry(e){
 if(!e||typeof e!=="object")return false;
 const source=String(e.source||"");
 if(source==="reward-refund")return Boolean(names[e.rewardId]);
 if(["reward-redemption","reward-activation","reward-payout"].includes(source))return Boolean(names[e.rewardId]);
 return Boolean(names[e.rewardId])||itemSources.has(source);
}
export function itemHistoryLabel(e){
 if(!isItemHistoryEntry(e))return null;
 const source=String(e.source||""),title=String(e.title||"");
 const id=String(e.rewardId||"")||(source==="qa-auto-pass-free"?"qa-access-auto-pass":
  source==="announcement-shield"?"announcement-shield":source==="qa-lottery"?"qa-lottery-ticket":"");
 let action="บันทึก Item",quantity=null;
 if(source==="qa-auto-pass-free"){action="รับฟรี";quantity=5;}
 else if(source==="reward-redemption" || source==="special-reward"&&!/ Request$/.test(title)
   || source==="announcement-shield"&&/แลก Item/.test(title)){action="รับ / ซื้อ / แลก";quantity=1;}
 else if(source==="reward-activation"){
   action=/Payout Requested/.test(title)?"ใช้สิทธิ์ส่งคำขอ":"ใช้ Item";quantity=-1;
 }
 else if(source==="special-reward"&&/ Request$/.test(title)){action="ใช้สิทธิ์ส่งคำขอ";quantity=-1;}
 else if(source==="special-reward-activation"){action="เปิดใช้งาน Item";}
 else if(source==="special-reward-admin"){
   const status=title.match(/ · (approved|paid|delivered|rejected)$/i)?.[1]?.toLowerCase();
   action=({approved:"อนุมัติคำขอ",paid:"โอนเงินสำเร็จ",delivered:"ส่งสิทธิ์แล้ว",rejected:"ไม่อนุมัติคำขอ"})[status]||"อัปเดตสถานะรางวัล";
 }
 else if(source==="qa-lottery"){
   action=/ซื้อเลข/.test(title)?"ซื้อสลาก":/ไม่ถูกรางวัล/.test(title)?"ตรวจผล · ไม่ถูกรางวัล":"ตรวจผล · ถูกรางวัล";
   quantity=/ซื้อเลข/.test(title)?1:-1;
 }
 else if(source==="item-expiry-derived"){action="หมดอายุตามวันใน Item";quantity=-1;}
 else if(source==="announcement-shield"){
  if(/เริ่มใช้/.test(title))action="เริ่มใช้งาน";
  else if(/ยกเลิก/.test(title))action="ยกเลิกต่ออายุ";
  else if(/หมดอายุ/.test(title)){action="หมดอายุ";quantity=-1;}
  else if(/ผ่อนผัน/.test(title))action="เข้าสู่ระยะผ่อนผัน";
  else if(/ต่ออายุ/.test(title))action="ต่ออายุอัตโนมัติ";
 }
 else if(source==="reward-payout")action="ได้รับรางวัล";
 else if(source==="reward-refund")action="คืน Sparks จากการแลก";
 const details=[];
 if(e.challengeId)details.push("ภารกิจ "+e.challengeId);
 if(Number(e.originalWords)>0&&Number.isFinite(Number(e.remainingWords)))
   details.push("ลดคำจาก "+Number(e.originalWords)+" เหลือ "+Number(e.remainingWords));
 if(e.drawDate)details.push("งวด "+e.drawDate);
 if(Number.isSafeInteger(Number(e.inventoryAfter))&&e.inventoryAfter!==null&&e.inventoryAfter!==undefined)
   details.push("Item คงเหลือ "+Number(e.inventoryAfter)+" สิทธิ์");
 return {name:names[id]||title||"Item",action,quantity,extra:details.join(" · ")};
}
export function itemHistoryDeltaText(e){
 const audit=itemHistoryLabel(e);
 return audit?.quantity===null||!audit?"—":(audit.quantity>0?"+":"")+audit.quantity+" สิทธิ์";
}
/** Expired only if still UNUSED, with a confirmed itemId/expiresAt in wallet.
 * Virtual rows are UI-only; never write or fabricate a Sparks balance.
 */
export function appendKnownItemExpirations(history,wallet,now=Date.now()){
 const items=[...(Array.isArray(wallet?.trueMoneyItems)?wallet.trueMoneyItems:[]),
   ...(Array.isArray(wallet?.specialRewardItems)?wallet.specialRewardItems:[])];
 const out=[...(Array.isArray(history)?history:[])],seen=new Set(out.map(x=>String(x.id||"")));
 for(const x of items){
  if(String(x?.status||"").toLowerCase()!=="unused")continue;
  const ts=Date.parse(String(x.expiresAt||""));
  const itemId=String(x.itemId||"");
  if(!Number.isFinite(ts)||ts>now||!itemId||itemId.length>160)continue;
  const id="item-expiry-derived-"+itemId;
  if(seen.has(id))continue;seen.add(id);
  out.push({id,createdAt:new Date(ts).toISOString(),type:"event",
   source:"item-expiry-derived",rewardId:String(x.rewardId||""),itemId,
   title:(names[x.rewardId]||x.title||"Item")+" · หมดอายุ",
   detail:"ตามวันหมดอายุใน My Items (ไม่หัก Sparks หรือเขียนข้อมูลย้อนหลัง)",
   amount:0,balanceAfter:null,performedBy:"system",status:"Expired",derived:true});
 }
 return out.sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
}
