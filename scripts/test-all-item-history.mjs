import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isItemHistoryEntry,itemHistoryLabel,itemHistoryDeltaText,appendKnownItemExpirations} from "../src/sparksItemHistory.mjs";
const row=(source,title,rewardId="",extra={})=>({source,title,rewardId,...extra});
assert.equal(itemHistoryDeltaText(row("qa-auto-pass-free","QA Access Auto-Pass · Free 5","qa-access-auto-pass")),"+5 สิทธิ์");
assert.equal(itemHistoryDeltaText(row("reward-activation","QA Access Auto-Pass Used","qa-access-auto-pass")),"-1 สิทธิ์");
assert.equal(itemHistoryDeltaText(row("reward-activation","Typing Relief Activated","typing-relief")),"-1 สิทธิ์");
assert.match(itemHistoryLabel(row("reward-activation","Typing Relief Activated","typing-relief",{originalWords:10,remainingWords:4})).extra,/10 เหลือ 4/);
for(const id of ["truemoney-20-thb","punthai-65","amazon-55","seven-100","netflix-1m"])
 assert.equal(itemHistoryDeltaText(row("reward-redemption","Purchased",id)),"+1 สิทธิ์");
assert.equal(itemHistoryDeltaText(row("qa-lottery","QA Lottery · ไม่ถูกรางวัล")),"-1 สิทธิ์");
assert.equal(isItemHistoryEntry(row("admin-add","Admin Added Sparks")),false);
const t="2026-11-11T00:00:00.000Z";
const wallet={trueMoneyItems:[{itemId:"tm1",rewardId:"truemoney-20-thb",status:"unused",expiresAt:t},
{itemId:"tm2",rewardId:"truemoney-20-thb",status:"requested",expiresAt:t}],
specialRewardItems:[{itemId:"pun1",rewardId:"punthai-65",status:"unused",expiresAt:t},
{itemId:"amazon1",rewardId:"amazon-55",status:"activated",expiresAt:t}]};
const history=[{id:"regular",createdAt:t,amount:-10000}];
const projected=appendKnownItemExpirations(history,wallet,Date.parse("2026-11-12T00:00:00Z"));
assert.equal(projected.filter(x=>x.derived).length,2);
assert.equal(history.length,1);
assert.ok(projected.every(x=>!x.derived||x.balanceAfter===null));
for(const file of ["src/SparksHistory.tsx","src/SparksAdminPanel.tsx"]){
 const c=readFileSync(new URL("../"+file,import.meta.url),"utf8");
 assert.match(c,/isItemHistoryEntry/);
 assert.match(c,/itemHistoryDeltaText/);
}
const historyUi=readFileSync(new URL("../src/SparksHistory.tsx",import.meta.url),"utf8");
const historyCss=readFileSync(new URL("../src/qaSparks.css",import.meta.url),"utf8");
// Both the half-width Overview and full History tab render the same records.
assert.match(historyUi,/qa-sparks-history-list/,"render responsive history cards");
assert.match(historyUi,/qa-sparks-history-entry-changes/,"show Sparks and Item changes together");
assert.match(historyUi,/qa-sparks-history-search/,"search the already loaded history");
assert.match(historyUi,/setVisibleCount\(count=>count\+pageSize\)/,"reveal additional rows on demand");
assert.match(historyUi,/memberHistoryText\(item\)/,"preserve legacy detail wording");
assert.doesNotMatch(historyUi,/<table|history-scroll/,"no horizontally-scrolling history table");
assert.doesNotMatch(historyCss,/min-width:\s*860px/,"no 860px minimum width in history CSS");
assert.match(historyCss,/\.qa-sparks-history-entry\{/,"card styling exists");
console.log("PASS history cards: responsive, searchable, filtered, paginated, same source and no horizontal scroll");

console.log("PASS item event labels, quantities, safe expiry projection and both history screens");
