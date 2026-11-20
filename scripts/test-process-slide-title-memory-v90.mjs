import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {effectiveSlideTitle,slideTitleOverridePayload,slideTitleKey}
  from "../src/lib/processSlideTitleMemory.mjs";

const original={slideTitles:Array.from({length:65},(_,index)=>"Slide "+(index+1))};
assert.equal(effectiveSlideTitle(original,44),"Slide 44");
assert.equal(effectiveSlideTitle({ ...original,slideTitleOverrides:{"44":"การยืนยันตัวตนร้านค้า (Merchant)"}},44),"การยืนยันตัวตนร้านค้า (Merchant)");
assert.equal(effectiveSlideTitle({ ...original,slideTitleOverrides:{"44":"ชื่อใหม่"}},45),"Slide 45");
assert.deepEqual(slideTitleOverridePayload(44,"  Merchant Verify  "),{slideTitleOverrides:{"44":"Merchant Verify"}});
assert.notDeepEqual(slideTitleKey("process-version-a",44),slideTitleKey("process-version-b",44));
assert.notDeepEqual(slideTitleKey("process-version-a",44),slideTitleKey("process-version-a",45));
assert.throws(()=>slideTitleOverridePayload(0,"invalid"));
assert.throws(()=>slideTitleOverridePayload(44,"   "));
const src=readFileSync(new URL("../src/processLibrary.tsx",import.meta.url),"utf8");
assert.match(src,/process-slide-title-persistence-v90/);
assert.match(src,/effectiveSlideTitle\(row, index \+ 1\)/);
assert.match(src,/slideTitleOverridePayload\(slideNumber,cleanTitle\),\{merge:true\}/);
assert.match(src,/titleDraftsV90\.current\.get\(slideTitleKey\(active\.id,slideNumber\)\)/);
assert.match(src,/titleSaveStateV90\.status==="error"/);
assert.doesNotMatch(src,/Backfill custom titles already stored in the current case into the Process Version/);
assert.doesNotMatch(src,/Repair titles from the submitted cases that originally introduced the custom names/);
console.log("PASS Process slide names: per-version, per-slide overrides, optimistic reselect, error feedback, no stale case title repair");
