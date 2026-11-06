import assert from "node:assert/strict";
import {nextLotteryDraw,previousLotteryDraw,lotteryPrize,parseOfficialResult} from "../server/qaLotteryService.js";
const at=value=>new Date(value);
assert.equal(nextLotteryDraw(at("2026-11-06T10:00:00+07:00")),"2026-11-16");
assert.equal(nextLotteryDraw(at("2026-11-16T13:59:00+07:00")),"2026-11-16");
assert.equal(nextLotteryDraw(at("2026-11-16T14:00:00+07:00")),"2026-12-01");
assert.equal(previousLotteryDraw(at("2026-11-06T12:00:00+07:00")),"2026-11-01");
const envelope={statusCode:200,status:true,response:{date:"2026-11-01",data:{
  first:{number:[{value:"123456",round:1}]},
  last3b:{number:[{value:"456",round:1},{value:"100",round:2}]},
  last2:{number:[{value:"56",round:1}]}
}}};
const result=parseOfficialResult(envelope);
assert.equal(result.first,"123456");
assert.equal(lotteryPrize("123456",result).amount,5500);
assert.deepEqual(lotteryPrize("123456",result).matched,["first","back3","last2"]);
assert.equal(lotteryPrize("555456",result).amount,2500);
assert.equal(lotteryPrize("999956",result).amount,1000);
assert.equal(lotteryPrize("999900",result).amount,0);
assert.equal(parseOfficialResult({...envelope,response:null}),null);
assert.throws(()=>parseOfficialResult({...envelope,response:{...envelope.response,
  data:{...envelope.response.data,last3b:{number:[{value:"456"}]}}}}),/ไม่ครบ/);
console.log("QA Lottery rules passed");
