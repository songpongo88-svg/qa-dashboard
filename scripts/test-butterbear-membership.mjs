import assert from "node:assert/strict";
import {butterbearActive,butterbearExpiresAt} from "../server/butterbearCardService.js";
const wallet={butterbearPurchasedAt:"2026-11-25T04:00:00.000Z",memberCardSkin:"default"};
assert.equal(butterbearExpiresAt(wallet),"2027-11-25T04:00:00.000Z");
assert.equal(butterbearActive(wallet,Date.parse("2027-11-25T03:59:59.999Z")),true);
assert.equal(butterbearActive(wallet,Date.parse("2027-11-25T04:00:00.000Z")),false);
assert.equal(butterbearActive({...wallet,butterbearForfeitedAt:"2026-12-01T00:00:00Z"},Date.parse("2026-12-02T00:00:00Z")),false);
assert.equal(butterbearExpiresAt({butterbearPurchasedAt:"2028-02-29T08:00:00Z"}),"2029-02-28T08:00:00.000Z");
console.log("Special card lifecycle boundary tests passed");
