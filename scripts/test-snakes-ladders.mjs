import assert from "node:assert/strict";
import {createSnakesService,applySquare,resolveSnakeSquare,advanceTurn,advanceBotTurns,SNAKES_RULES} from "../server/snakesLaddersService.js";
import {SNAKES_BOT_ID} from "../src/snakesRules.js";

assert.equal(SNAKES_RULES.squares,50);
assert.equal(SNAKES_RULES.maxPlayers,3);
assert.equal(SNAKES_RULES.rewardMinimum,1);
assert.equal(SNAKES_RULES.rewardMaximum,300);
assert.equal(new Set(SNAKES_RULES.rewardSquares).size,10);
assert.equal(resolveSnakeSquare(50).type,"finish");
assert.equal(resolveSnakeSquare(5).to,15);
assert.equal(resolveSnakeSquare(44).to,29);
const person=(username,joined=true)=>({username,displayName:username,joined,position:1,pot:0,skips:0,shields:0,rewardedTiles:[],claimedAt:""});
const sample={members:[person("alice"),person("bob"),person("charlie")],currentTurn:"alice",pendingTarget:null};
let prize=applySquare(sample,"alice",3,()=>185);
assert.equal(prize.delta,185);
assert.equal(sample.members[0].pot,185);
assert.equal(applySquare(sample,"alice",3,()=>300).delta,0,"same prize cannot be farmed twice in one match");
prize=applySquare(sample,"alice",9);
assert.equal(prize.delta,-56);
assert.equal(sample.members[0].pot,129);
sample.members[0].position=18;
assert.equal(applySquare(sample,"alice",18).to,9);
assert.equal(sample.members[0].position,9);
sample.members[0].skips=1;
advanceTurn(sample);
assert.equal(sample.currentTurn,"bob");
advanceTurn(sample);
assert.equal(sample.currentTurn,"charlie");
advanceTurn(sample);
assert.equal(sample.currentTurn,"bob","skip exactly one assigned future turn");
assert.equal(sample.members[0].skips,0);
const stored=new Map();
let ver=0;
const clone=x=>structuredClone(x);
const mkSnap=(key)=>stored.has(key)?{data:clone(stored.get(key).value),updateTime:String(stored.get(key).version)}:null;
const db={
  firestoreRequest:async(endpoint,method="GET",body)=>{
    if(endpoint===":beginTransaction")return {transaction:"t"+(++ver)};
    if(endpoint===":rollback")return {};
    if(endpoint!==":commit")throw Error("unexpected Firestore operation "+endpoint);
    for(const w of body.writes){
      const snap=mkSnap(w.path);
      if(w.kind==="create"&&snap)throw Object.assign(Error("duplicate"),{firestoreStatus:"FAILED_PRECONDITION"});
      if(w.kind==="update"&&String(snap?.updateTime||"")!==String(w.original?.updateTime||""))throw Object.assign(Error("stale"),{firestoreStatus:"FAILED_PRECONDITION"});
    }
    for(const w of body.writes){
      const current=stored.get(w.path)?.value||{};
      stored.set(w.path,{value:{...clone(current),...clone(w.data)},version:++ver});
    }
    return {};
  },
  readDoc:async(key)=>mkSnap(key),
  recordValue:snap=>snap?.data||{},
  path:(...args)=>args.join("/"),
  updateWrite:(path,data,snap)=>({kind:"update",path,data,original:snap}),
  createWrite:(path,data)=>({kind:"create",path,data}),
  walletDocumentPath:name=>"qa_sparks_wallets/"+name,
  currentMemberYear:()=>2026,
  annualEarnedFromWallet:wallet=>wallet.memberYearEarned||0,
  spendableBalance:wallet=>wallet.balance||0,
  findProfileByUsername:async username=>({username,displayName:username,status:"Active"}),
  isSuspendedProfile:profile=>profile.status==="Suspended",
};
const game=createSnakesService(db);
const alice={username:"alice",displayName:"Alice"},bob={username:"bob",displayName:"Bob"},charlie={username:"charlie",displayName:"Charlie"};
const outsider={username:"outsider",displayName:"Outsider"};
const created=await game.create({requestId:"create-unique-00001"},alice);
assert.match(created.room.id,/^SG-[A-F0-9]{8}$/);
const roomId=created.room.id;
assert.equal(created.room.status,"lobby");
assert.equal(created.room.members.length,1);
const repeated=await game.create({requestId:"create-unique-00001"},alice);
assert.equal(repeated.room.id,roomId);
assert.equal(repeated.alreadyApplied,true);
await assert.rejects(()=>game.claim({roomId},alice),/ต้องรอให้เกมจบ/);
assert.equal((await game.state(outsider)).rooms.length,0,"outsider must not discover private rooms");
await assert.rejects(()=>game.invite({roomId,targetUsername:"alice"},alice),/กรุณาระบุ/);
await game.invite({roomId,targetUsername:"bob"},alice);
await game.invite({roomId,targetUsername:"charlie"},alice);
await assert.rejects(()=>game.invite({roomId,targetUsername:"outsider"},alice),/ครบ 3 คน/);
assert.equal((await game.state(bob)).rooms.length,1,"invite appears in recipient inbox");
await game.respond({roomId,decision:"accept"},bob);
await assert.rejects(()=>game.start({roomId},alice),/ยังมีผู้เล่นที่ไม่ตอบรับ/);
await game.respond({roomId,decision:"accept"},charlie);
const started=await game.start({roomId},alice);
assert.equal(started.room.status,"playing");
assert.equal(started.room.members.length,3);
await assert.rejects(()=>game.roll({roomId,requestId:"roll-nonce-outsider01"},outsider),/ไม่ได้รับเชิญ/);
const rolled=await game.roll({roomId,requestId:"roll-nonce-alice0001"},alice);
assert.ok(rolled.room.lastRoll>=1&&rolled.room.lastRoll<=6);
const repeatedRoll=await game.roll({roomId,requestId:"roll-nonce-alice0001"},alice);
assert.equal(repeatedRoll.alreadyApplied,true,"retry cannot roll a second time");
assert.equal(repeatedRoll.room.lastRoll,rolled.room.lastRoll);
const key="qa_sparks_snakes_rooms_v1/"+roomId;
const room=clone(stored.get(key).value);
room.status="finished";room.currentTurn="";room.winner="alice";room.finishedAt="2026-11-07T00:00:00Z";room.pendingTarget=null;
room.members[0].pot=185;room.members[1].pot=35;room.members[2].pot=0;
stored.set(key,{value:room,version:++ver});
await assert.rejects(()=>game.claim({roomId},outsider),/ไม่ได้รับเชิญ/);
const claimed=await game.claim({roomId},alice);
assert.equal(claimed.amount,185);
assert.equal(stored.get("qa_sparks_wallets/alice").value.balance,185);
assert.equal(stored.get("qa_sparks_wallets/alice/history/snake-ladder-"+roomId).value.amount,185);
assert.equal((await game.claim({roomId},alice)).alreadyApplied,true);
assert.equal(stored.get("qa_sparks_wallets/alice").value.balance,185,"claim is idempotent");
await game.claim({roomId},bob);
assert.equal(stored.get("qa_sparks_wallets/bob").value.balance,35,"loser receives own pot");
const zero=await game.claim({roomId},charlie);
assert.equal(zero.amount,0);
assert.ok(!stored.has("qa_sparks_wallets/charlie"),"zero reward doesn't write wallet");
assert.equal((await game.state(bob)).rooms[0].members.find(m=>m.username==="bob").claimedAt.length>0,true);
console.log("PASS Snakes & Ladders: 50 tiles, 3-player invites, protected turns, dice idempotency, hazards, deferred single-claim wallet transaction for every player");

const testing=await game.create({requestId:"create-with-test-bot-0001"},alice);
const botRoomId=testing.room.id;
assert.equal(testing.room.members.length,1);
const hasBot=await game.addBot({roomId:botRoomId},alice);
assert.equal(hasBot.room.members.length,2);
const bot=hasBot.room.members.find(p=>p.isBot);
assert.ok(bot,"one Bot joins a room without a user session");
assert.equal(bot.username,SNAKES_BOT_ID);
assert.equal(bot.displayName,"Sparks Bot");
assert.equal(bot.claimedAt,"");
await assert.rejects(()=>game.addBot({roomId:botRoomId},alice),/เพียง 1 ตัว/);
await assert.rejects(()=>game.addBot({roomId:botRoomId},bob),/ไม่ได้รับเชิญ/);
const botStarted=await game.start({roomId:botRoomId},alice);
assert.equal(botStarted.room.status,"playing","one human plus Bot is enough to play");
const turn=await game.roll({roomId:botRoomId,requestId:"roll-bot-room-00001"},alice);
assert.ok(turn.turnEvent.actor==="alice","player sees their own roll before Bot auto-turn");
assert.ok(turn.botEvents.some(x=>x.actor===SNAKES_BOT_ID),"Bot plays automatically inside same Firestore transaction");
assert.ok(turn.room.events.some(x=>x.actor===SNAKES_BOT_ID),"Bot steps are visible in match history");
assert.equal(turn.room.members.find(p=>p.isBot).joined,true);
const again=await game.roll({roomId:botRoomId,requestId:"roll-bot-room-00001"},alice);
assert.equal(again.alreadyApplied,true);
assert.equal(again.room.events.length,turn.room.events.length,"retry does not repeat Bot turn");
await assert.rejects(()=>game.claim({roomId:botRoomId},{username:SNAKES_BOT_ID,displayName:"Fake Bot"}),/ไม่ได้รับเชิญ/);
await assert.rejects(()=>game.cancelRoom({roomId:botRoomId},bob),/ไม่ได้รับเชิญ/);
const cancelled=await game.cancelRoom({roomId:botRoomId},alice);
assert.equal(cancelled.cancelled,true);
assert.equal(cancelled.roomId,botRoomId);
assert.equal(stored.get("qa_sparks_snakes_rooms_v1/"+botRoomId).value.status,"cancelled");
assert.equal(stored.get("qa_sparks_snakes_members_v1/alice").value.activeRoom,"");
assert.equal((await game.state(alice,true)).rooms.some(x=>x.id===botRoomId),false,
  "cancelled rooms are removed from the player's visible room list");
await assert.rejects(()=>game.claim({roomId:botRoomId},alice),/ต้องรอให้เกมจบ/);
await assert.rejects(()=>game.roll({roomId:botRoomId,requestId:"roll-after-cancel-001"},alice),/ยังไม่ถึงตา/);
assert.equal(stored.has("qa_sparks_wallets/"+SNAKES_BOT_ID),false,
  "Bot never owns a QA Sparks wallet");
const nextGame=await game.create({requestId:"create-after-bot-cancel"},alice);
assert.notEqual(nextGame.room.id,botRoomId,"after cancelling, the host can create another room");
const nearFinish={status:"playing",currentTurn:SNAKES_BOT_ID,lastRoll:0,events:[],pendingTarget:null,
 members:[{...person("alice"),position:1},{...person(SNAKES_BOT_ID),isBot:true,displayName:"Sparks Bot",position:49}]};
const botFinishes=advanceBotTurns(nearFinish);
assert.equal(nearFinish.winner,SNAKES_BOT_ID);
assert.equal(nearFinish.status,"finished");
assert.ok(botFinishes.some(x=>x.type==="finish"));
console.log("PASS Snakes Bot: one bot per room, automatic server turns, replay safe, non-payable bot identity, host cancellation and room recreation");
