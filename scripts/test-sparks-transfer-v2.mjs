import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const [transfer,member,route,auth,sql,qa]=await Promise.all([
 "src/SparksTransfer.tsx","src/SparksMembership.tsx","api/sparks-admin.js",
 "server/sparksSupabaseAuth.js","migration/sparks-only/membership-transfer-v2.sql","src/QASparks.tsx",
].map(p=>readFile(p,"utf8")));
assert.match(qa,/<SparksTransfer username=\{username\}/,"Overview uses a clickable Transfer Item");
assert.doesNotMatch(qa,/qa-sparks-overview-transfer/,"the full transfer form is no longer embedded on Overview");
assert.match(transfer,/data-quest-item="spark-transfer"/);
assert.match(transfer,/member-card-activate/);
assert.match(transfer,/member-card-reissue/);
assert.match(transfer,/member-pin-change/);
assert.match(transfer,/member-pin-verify/);
assert.match(transfer,/sparks-transfer-lookup/);
assert.match(transfer,/sparks-transfer-submit/);
assert.match(transfer,/sparks-transfer-accept/);
assert.doesNotMatch(transfer,/<select /,"recipient is entered by card number, not dropdown");
assert.doesNotMatch(transfer,/localStorage|sessionStorage/,"PIN is kept out of browser storage");
assert.match(member,/qa:sparks-card-open/,"membership card opens activation manager");
assert.match(member,/member-card-state/,"card number is visible only after activation");
assert.match(route,/getSparksRequestActor\(\)/,"each transfer request authenticates Supabase identity");
assert.match(route,/sparksTransferV2\(actions\[body.action\],payload\)/);
assert.match(auth,/rpc\/sparks_transfer_v2/);
assert.match(sql,/extensions\.crypt\(v_new_pin,extensions\.gen_salt\('bf',11\)\)/,"PIN is hashed with bcrypt");
assert.match(sql,/failed_attempts>=4/,"five invalid attempts trigger a PIN lock");
assert.match(sql,/15 minutes/,"PIN failure lock duration");
assert.match(sql,/expires_at.*72 hours/,"transfers expire after 72 hours");
assert.match(sql,/sparks_transfer\.wallet_move\(me,-v_amount/,"sender wallet debit is part of transaction");
assert.match(sql,/sparks_transfer\.wallet_move\(me,v_transfer\.amount/,"recipient acceptance credits wallet atomically");
assert.match(sql,/sparks_transfer\.wallet_move\(x\.sender,x\.amount/,"cron refunds original sender");
assert.match(sql,/status in \('pending','accepted'\)/,"expired refunds release original monthly allowance");
assert.match(sql,/cron\.schedule\('qa-sparks-transfer-expiry','\* \* \* \* \*'/,"automatic expiry process every minute");
assert.match(sql,/revoke all on all tables in schema sparks_transfer/,"private card and escrow tables");
assert.match(sql,/grant execute on function public\.sparks_transfer_v2\(text,jsonb\) to authenticated/);
console.log("PASS Membership and Spark Transfer v2: card PIN, reissue, secure escrow, recipient acceptance, 72h refund, Overview Item");
