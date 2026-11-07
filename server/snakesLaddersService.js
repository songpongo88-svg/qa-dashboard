import { randomInt, randomUUID } from "node:crypto";

// One persistent room per match. Every change and payout is a Firestore
// compare-and-swap transaction; dice, traps and prizes are server-generated.
import {SNAKES_RULES,resolveSnakeSquare} from "../src/snakesRules.js";
export {SNAKES_RULES,resolveSnakeSquare};
const ROOMS="qa_sparks_snakes_rooms_v1";
const USERS="qa_sparks_snakes_members_v1";
const err=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const count=v=>Number.isSafeInteger(v)&&v>=0?v:0;
const validName=v=>typeof v==="string"&&/^[a-zA-Z0-9_.-]{2,100}$/.test(v);
const randomReward=()=>randomInt(1,301);
const sanitizeMember=p=>({
  username:p.username,displayName:p.displayName,joined:p.joined===true,
  position:p.position||1,pot:count(p.pot),shields:count(p.shields),skips:count(p.skips),
  claimedAt:p.claimedAt||"",rewardedTiles:Array.isArray(p.rewardedTiles)?p.rewardedTiles:[],
});
const toPublic=(room,actor)=>room?{
  id:room.id,host:room.host,status:room.status,
  members:(room.members||[]).map(sanitizeMember),
  invited:(room.members||[]).filter(p=>!p.joined).map(p=>p.username),
  currentTurn:room.currentTurn||"",winner:room.winner||"",
  event:room.event||null,events:Array.isArray(room.events)?room.events.slice(-14):[],
  pendingTarget:room.pendingTarget||null,createdAt:room.createdAt,startedAt:room.startedAt||"",
  finishedAt:room.finishedAt||"",lastRoll:room.lastRoll||0,
  yourUsername:actor.username,updatedAt:room.updatedAt,
}:null;

export function advanceTurn(room){
  const joined=room.members.filter(m=>m.joined);
  if(joined.length<2)return;
  let idx=joined.findIndex(m=>m.username===room.currentTurn);
  // Skip tokens are consumed on the skipped player's next assigned turn.
  for(let n=0;n<joined.length*8;n++){
    idx=(idx+1)%joined.length;
    const next=room.members.find(m=>m.username===joined[idx].username);
    if(next.skips>0){next.skips-=1;continue;}
    room.currentTurn=next.username;
    return;
  }
  err("ไม่สามารถหาผู้เล่นรอบถัดไป",409);
}
export function applySquare(room,actorUsername,tile,randomAmount=randomReward){
  const member=room.members.find(m=>m.username===actorUsername);
  if(!member||!member.joined)err("ไม่ได้เข้าร่วมเกม",403);
  const rule=resolveSnakeSquare(tile);
  let delta=0,to=tile,description=rule.description;
  if(rule.type==="reward"){
    if(member.rewardedTiles.includes(tile)){description="เคยรับรางวัลช่องนี้แล้ว";}
    else {
      delta=Math.max(1,Math.min(300,Number(randomAmount())||1));
      member.pot+=delta;
      member.rewardedTiles.push(tile);
      description="ค้นพบ "+delta+" Sparks (รอรับหลังจบเกม)";
    }
  }else if(rule.type==="ladder"||rule.type==="snake"){
    to=rule.to;member.position=to;
    description=(rule.type==="ladder"?"ปีนบันไดขึ้นช่อง ":"งูพากลับลงช่อง ")+to;
  }else if(rule.type==="lose-percent"){
    const lost=Math.ceil(member.pot*0.3);member.pot-=lost;delta=-lost;
    description="กับดัก! เสีย 30% ของ Game Pot";
  }else if(rule.type==="lose-fixed"){
    const lost=Math.min(member.pot,60);member.pot-=lost;delta=-lost;description="เสีย 60 Sparks (ไม่เกินยอดที่มี)";
  }else if(rule.type==="skip"){
    member.skips+=1;description="ถูกพักการทอยหนึ่งตา";
  }else if(rule.type==="back-five"){
    to=Math.max(1,tile-5);member.position=to;description="ถอยหลัง 5 ช่อง";
  }else if(rule.type==="shield"){
    member.shields=Math.min(member.shields+1,2);description="ได้รับโล่ป้องกันการโจมตี";
  }else if(rule.type==="restart"){
    to=1;member.position=1;description="ติดกับดัก! กลับจุดเริ่มต้น";
  }else if(["steal","reset-other","swap"].includes(rule.type)){
    room.pendingTarget={actor:actorUsername,type:rule.type,tile};
    description=rule.type==="steal"?"เลือกผู้เล่นเพื่อขโมย Game Pot":
      rule.type==="reset-other"?"เลือกคู่แข่งให้กลับจุดเริ่มต้น":"เลือกคู่แข่งเพื่อสลับตำแหน่ง";
  }
  return {type:rule.type,tile,to,delta,description};
}
export function createSnakesService(db){
  const {firestoreRequest,readDoc,recordValue,path,updateWrite,createWrite,
    walletDocumentPath,currentMemberYear,annualEarnedFromWallet,spendableBalance,
    findProfileByUsername,isSuspendedProfile}=db;
  const roomPath=id=>path(ROOMS,id);
  const userPath=username=>path(USERS,username.toLowerCase());
  const read=async(p,t)=>({snap:await readDoc(p,t)});
  const load=(doc)=>doc?recordValue(doc):{};
  const requireRoom=async(id,actor,transaction)=>{
    if(!/^SG-[A-F0-9]{8}$/.test(String(id)))err("รหัสห้องไม่ถูกต้อง");
    const snap=await readDoc(roomPath(id),transaction),room=load(snap);
    if(!snap)err("ไม่พบห้องเกม",404);
    if(!room.members?.some(p=>p.username===actor.username))err("คุณไม่ได้รับเชิญเข้าห้องนี้",403);
    return {snap,room};
  };
  async function transact(work){
    for(let attempt=0;attempt<4;attempt++){
      const begun=await firestoreRequest(":beginTransaction","POST",{options:{readWrite:{}}});
      const t=begun?.transaction;
      if(!t)err("ไม่สามารถเริ่มบันทึกเกมได้",503);
      let committed=false;
      try{
        const {writes,result}=await work(t);
        if(writes.length){await firestoreRequest(":commit","POST",{transaction:t,writes});committed=true;}
        return result;
      }catch(e){
        if(["ABORTED","FAILED_PRECONDITION"].includes(e?.firestoreStatus)&&attempt<3)continue;
        throw e;
      }finally{
        if(!committed)await firestoreRequest(":rollback","POST",{transaction:t}).catch(()=>{});
      }
    }
    err("มีผู้เล่นดำเนินการพร้อมกัน กรุณารีเฟรช",409);
  }
  function memberIndex(before,patch){return {...before,...patch};}
  async function state(actor,includeHistory=false){
    const index=load(await readDoc(userPath(actor.username)));
    // Poll only the active room and latest invitations. History loads on an
    // explicit refresh; otherwise every client would re-read 12 old rooms.
    const ids=[...new Set([index.activeRoom,
      ...(Array.isArray(index.invitations)?index.invitations.slice(-3):[]),
      ...(includeHistory&&Array.isArray(index.rooms)?index.rooms.slice(-5):[])].filter(Boolean))].slice(-9).reverse();
    const rows=await Promise.all(ids.map(async id=>{
      const room=load(await readDoc(roomPath(id)));
      return room.id&&room.members?.some(p=>p.username===actor.username)?toPublic(room,actor):null;
    }));
    const rooms=rows.filter(Boolean).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return {rooms,activeRoomId:index.activeRoom||"",rules:SNAKES_RULES};
  }
  async function create(body,actor){
    const requestId=String(body.requestId||"");
    if(!/^[A-Za-z0-9_-]{12,100}$/.test(requestId))err("รหัสคำขอสร้างห้องไม่ถูกต้อง");
    return transact(async t=>{
      const indexPath=userPath(actor.username),indexSnap=await readDoc(indexPath,t),index=load(indexSnap);
      if(index.createRequestId===requestId && index.activeRoom){
        const existing=await readDoc(roomPath(index.activeRoom),t);
        if(existing)return {writes:[],result:{room:toPublic(load(existing),actor),alreadyApplied:true}};
      }
      if(index.activeRoom){
        const active=load(await readDoc(roomPath(index.activeRoom),t));
        if(["lobby","playing"].includes(active.status))err("คุณมีห้องเกมที่ยังเล่นอยู่ กรุณากลับไปห้องนั้น",409);
      }
      const id="SG-"+randomUUID().replace(/-/g,"").slice(0,8).toUpperCase();
      const now=new Date().toISOString();
      const room={id,host:actor.username,status:"lobby",createdAt:now,updatedAt:now,
        members:[{username:actor.username,displayName:actor.displayName.slice(0,80),
          joined:true,position:1,pot:0,skips:0,shields:0,rewardedTiles:[],claimedAt:""}],
        currentTurn:"",winner:"",events:[],lastRoll:0,pendingTarget:null};
      const rooms=[...new Set([...(index.rooms||[]),id])].slice(-12);
      return {writes:[createWrite(roomPath(id),room),updateWrite(indexPath,
        {username:actor.username,rooms,activeRoom:id,createRequestId:requestId,updatedAt:now},indexSnap)],
        result:{room:toPublic(room,actor)}};
    });
  }
  async function invite(body,actor){
    const target=String(body.targetUsername||"").trim().toLowerCase();
    if(!validName(target)||target===actor.username)err("กรุณาระบุ Username ของผู้รับคำเชิญ");
    const profile=await findProfileByUsername(target);
    if(isSuspendedProfile(profile))err("ไม่สามารถเชิญบัญชีที่ถูกระงับได้",403);
    return transact(async t=>{
      const {room,snap}=await requireRoom(body.roomId,actor,t);
      if(room.host!==actor.username||room.status!=="lobby")err("เชิญสมาชิกได้เฉพาะเจ้าของห้องก่อนเริ่มเกม",403);
      if(room.members.length>=3)err("ห้องนี้มีผู้เล่นครบ 3 คนแล้ว",409);
      if(room.members.some(p=>p.username===target))err("สมาชิกอยู่ในคำเชิญหรือห้องนี้แล้ว",409);
      const ix=userPath(target),ixSnap=await readDoc(ix,t),index=load(ixSnap);
      const now=new Date().toISOString();
      room.members.push({username:target,displayName:String(profile.displayName||profile.agentName||target).slice(0,80),
        joined:false,position:1,pot:0,skips:0,shields:0,rewardedTiles:[],claimedAt:""});
      room.updatedAt=now;
      const invitations=[...new Set([...(index.invitations||[]),room.id])].slice(-12);
      return {writes:[updateWrite(roomPath(room.id),room,snap),
        updateWrite(ix,{username:target,invitations,updatedAt:now},ixSnap)],
        result:{room:toPublic(room,actor)}};
    });
  }
  async function respond(body,actor){
    if(!["accept","decline"].includes(body.decision))err("กรุณาตอบรับหรือปฏิเสธ");
    return transact(async t=>{
      const {room,snap}=await requireRoom(body.roomId,actor,t);
      const player=room.members.find(p=>p.username===actor.username);
      if(room.status!=="lobby"||room.host===actor.username||player.joined)err("คำเชิญไม่พร้อมให้ตอบรับ",409);
      const indexPath=userPath(actor.username),indexSnap=await readDoc(indexPath,t),index=load(indexSnap);
      if(body.decision==="accept"&&index.activeRoom){
        const active=load(await readDoc(roomPath(index.activeRoom),t));
        if(["lobby","playing"].includes(active.status))err("คุณมีเกมที่ยังเล่นอยู่",409);
      }
      const now=new Date().toISOString();
      if(body.decision==="decline")room.members=room.members.filter(m=>m.username!==actor.username);
      else player.joined=true;
      room.updatedAt=now;
      const invites=(index.invitations||[]).filter(id=>id!==room.id);
      const rooms=body.decision==="accept"?[...new Set([...(index.rooms||[]),room.id])].slice(-12):(index.rooms||[]);
      const changes={username:actor.username,invitations:invites,rooms,updatedAt:now};
      if(body.decision==="accept")changes.activeRoom=room.id;
      return {writes:[updateWrite(roomPath(room.id),room,snap),
        updateWrite(indexPath,changes,indexSnap)],result:{room:body.decision==="accept"?toPublic(room,actor):null,declined:body.decision==="decline"}};
    });
  }
  async function start(body,actor){
    return transact(async t=>{
      const {room,snap}=await requireRoom(body.roomId,actor,t);
      if(room.host!==actor.username||room.status!=="lobby")err("เฉพาะเจ้าของห้องเท่านั้นที่เริ่มเกมได้",403);
      const joined=room.members.filter(m=>m.joined);
      if(joined.length<2||joined.length>3)err("ต้องมีผู้เล่นที่ตอบรับแล้ว 2–3 คน");
      if(room.members.some(m=>!m.joined))err("ยังมีผู้เล่นที่ไม่ตอบรับคำเชิญ กรุณารอก่อนเริ่มเกม");
      const now=new Date().toISOString();
      room.status="playing";room.startedAt=now;room.currentTurn=room.host;room.updatedAt=now;
      room.events=[{type:"start",description:"เริ่มเกมบันไดงู 50 ช่อง",at:now}];
      return {writes:[updateWrite(roomPath(room.id),room,snap)],result:{room:toPublic(room,actor)}};
    });
  }
  async function roll(body,actor){
    const requestId=String(body.requestId||"");
    if(!/^[A-Za-z0-9_-]{12,100}$/.test(requestId))err("รหัสการทอยไม่ถูกต้อง");
    return transact(async t=>{
      const {room,snap}=await requireRoom(body.roomId,actor,t);
      if(room.lastRequestId===requestId&&room.lastRequestActor===actor.username)return {writes:[],result:{room:toPublic(room,actor),alreadyApplied:true}};
      if(room.status!=="playing"||room.currentTurn!==actor.username||room.pendingTarget)err("ยังไม่ถึงตาของคุณ หรือมีเหตุการณ์ที่ต้องเลือกเป้าหมาย",409);
      const player=room.members.find(m=>m.username===actor.username);
      if(!player?.joined)err("คุณไม่ได้อยู่ในเกม",403);
      const dice=randomInt(1,7),from=player.position,tile=Math.min(50,from+dice);
      player.position=tile;
      let event;
      const now=new Date().toISOString();
      if(tile===50){
        event={type:"finish",tile:50,to:50,delta:0,description:player.displayName+" เข้าเส้นชัยแล้ว"};
        room.status="finished";room.winner=actor.username;room.finishedAt=now;
        room.currentTurn="";
      }else{
        event=applySquare(room,actor.username,tile);
        if(!room.pendingTarget)advanceTurn(room);
      }
      room.lastRoll=dice;room.lastRequestId=requestId;room.lastRequestActor=actor.username;
      room.event={...event,actor:actor.username,dice,from,at:now};
      room.events=[...(room.events||[]),room.event].slice(-20);
      room.updatedAt=now;
      return {writes:[updateWrite(roomPath(room.id),room,snap)],result:{room:toPublic(room,actor)}};
    });
  }
  async function target(body,actor){
    const targetUsername=String(body.targetUsername||"").trim().toLowerCase();
    return transact(async t=>{
      const {room,snap}=await requireRoom(body.roomId,actor,t);
      const pending=room.pendingTarget;
      if(room.status!=="playing"||room.currentTurn!==actor.username||pending?.actor!==actor.username)err("ไม่มีเหตุการณ์ที่ต้องเลือกเป้าหมาย",409);
      if(targetUsername===actor.username)err("ไม่สามารถโจมตีตัวเอง");
      const player=room.members.find(p=>p.username===actor.username);
      const opponent=room.members.find(p=>p.username===targetUsername&&p.joined);
      if(!opponent)err("ไม่พบคู่แข่งในห้องนี้");
      const now=new Date().toISOString();
      let description,delta=0;
      if(opponent.shields>0){
        opponent.shields--;description=opponent.displayName+" ใช้โล่ป้องกันสำเร็จ";
      }else if(pending.type==="reset-other"){
        opponent.position=1;description="ส่ง "+opponent.displayName+" กลับช่อง 1";
      }else if(pending.type==="swap"){
        const previous=player.position;player.position=opponent.position;opponent.position=previous;
        description="สลับตำแหน่งกับ "+opponent.displayName;
      }else if(pending.type==="steal"){
        delta=Math.min(100,Math.ceil(opponent.pot*0.2));opponent.pot-=delta;player.pot+=delta;
        description="ขโมย "+delta+" Sparks จาก "+opponent.displayName;
      }else err("เหตุการณ์ผิดรูปแบบ");
      room.pendingTarget=null;
      room.event={type:pending.type,actor:actor.username,target:targetUsername,delta,
        description,tile:pending.tile,at:now};
      room.events=[...(room.events||[]),room.event].slice(-20);
      advanceTurn(room);room.updatedAt=now;
      return {writes:[updateWrite(roomPath(room.id),room,snap)],result:{room:toPublic(room,actor)}};
    });
  }
  async function claim(body,actor){
    return transact(async t=>{
      const {room,snap}=await requireRoom(body.roomId,actor,t);
      if(room.status!=="finished")err("ต้องรอให้เกมจบก่อนจึงรับ Sparks ได้",409);
      const player=room.members.find(m=>m.username===actor.username&&m.joined);
      if(!player)err("คุณไม่ใช่ผู้เล่นที่เข้าร่วมเกม",403);
      if(player.claimedAt)return {writes:[],result:{alreadyApplied:true,amount:player.pot,room:toPublic(room,actor)}};
      const now=new Date().toISOString(),amount=count(player.pot),year=currentMemberYear();
      const wp=walletDocumentPath(actor.username),hd=path("qa_sparks_wallets",encodeURIComponent(actor.username),"history","snake-ladder-"+room.id);
      const [walletDoc,receiptDoc]=await Promise.all([readDoc(wp,t),readDoc(hd,t)]);
      const wallet=load(walletDoc);
      if(receiptDoc)err("รางวัลนี้มีหลักฐานการจ่ายแล้ว กรุณารีเฟรชเกม",409);
      const writes=[];
      player.claimedAt=now;room.updatedAt=now;
      writes.push(updateWrite(roomPath(room.id),room,snap));
      if(amount>0){
        const balance=spendableBalance(wallet,year)+amount;
        const lifetime=Math.max(count(wallet.totalEarned),count(wallet.firstLogin?.amount));
        writes.push(updateWrite(wp,{username:actor.username,balance,balanceYear:year,
          totalEarned:lifetime+amount,memberYear:year,
          memberYearEarned:annualEarnedFromWallet(wallet,year)+amount,updatedAt:now},walletDoc));
        writes.push(createWrite(hd,{createdAt:now,type:"earn",source:"mini-game-snakes-ladders",
          title:"Snakes & Ladders · Game Pot",detail:"เกม "+room.id+" · "+(room.winner===actor.username?"ผู้ชนะ":"ผู้ร่วมเล่น"),
          amount,balanceAfter:balance,gameId:room.id}));
      }
      return {writes,result:{amount,alreadyApplied:false,room:toPublic(room,actor)}};
    });
  }
  return {state,create,invite,respond,start,roll,target,claim};
}
