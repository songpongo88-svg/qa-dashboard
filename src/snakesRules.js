// Shared, pure board rules. Client artwork never imports server crypto or APIs.
// A reserved non-account identity used only for testing multiplayer games.
export const SNAKES_BOT_ID="__qa_sparks_bot_test__";
export const SNAKES_RULES=Object.freeze({
  squares:50,maxPlayers:3,minPlayers:2,rewardMinimum:1,rewardMaximum:300,
  rewardSquares:[3,7,12,16,21,26,32,36,41,47],
  ladders:{5:15,15:27,24:39,39:46},
  snakes:{18:9,28:13,35:20,44:29},
  traps:{9:"lose-percent",14:"lose-fixed",17:"skip",19:"skip",22:"back-five",
    29:"steal",31:"shield",33:"skip",37:"reset-other",43:"swap",45:"restart"},
});
export function resolveSnakeSquare(tile){
  if(tile===50)return {type:"finish",description:"ถึงเส้นชัย!"};
  if(SNAKES_RULES.rewardSquares.includes(tile))return {type:"reward",description:"หีบ Sparks ลึกลับ"};
  if(SNAKES_RULES.ladders[tile])return {type:"ladder",to:SNAKES_RULES.ladders[tile],description:"ปีนบันไดขึ้น"};
  if(SNAKES_RULES.snakes[tile])return {type:"snake",to:SNAKES_RULES.snakes[tile],description:"ถูกงูพาลง"};
  if(SNAKES_RULES.traps[tile])return {type:SNAKES_RULES.traps[tile],description:"เหตุการณ์พิเศษ"};
  return {type:"safe",description:"ช่องปลอดภัย"};
}
