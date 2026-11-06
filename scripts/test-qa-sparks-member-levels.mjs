import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

await mkdir(resolve("node_modules/.cache"), { recursive: true });
const directory = await mkdtemp(resolve("node_modules/.cache/member-level-"));
try {
  const out = resolve(directory, "member-levels.mjs");
  await build({ entryPoints: ["src/qaSparksMemberLevels.ts"], outfile: out,
    platform: "node", bundle: true, format: "esm", logLevel: "silent" });
  const { SPARKS_TOP_LEVEL_POINTS, SPARKS_MEMBER_LEVELS, getSparksMemberLevel,
    annualEarnedFromWallet, spendableSparksFromWallet, sparksCalendarYear } = await import(pathToFileURL(out).href);
  assert.equal(SPARKS_TOP_LEVEL_POINTS, 500000);
  assert.equal(SPARKS_MEMBER_LEVELS.length, 10);
  const transitions = [
    [0,1],[200,1],[999,1],[1000,2],[4999,2],[5000,3],[19999,3],
    [20000,4],[49999,4],[50000,5],[99999,5],[100000,6],[149999,6],
    [150000,7],[199999,7],[200000,8],[299999,8],[300000,9],
    [499999,9],[500000,10],[1000000,10],
  ];
  for (const [earned, expected] of transitions) {
    const info = getSparksMemberLevel(earned);
    assert.equal(info.current.level, expected, "unexpected Member Level for "+earned);
    assert.equal(info.annualEarned,earned,"earned points must not be capped");
  }
  assert.equal(getSparksMemberLevel(200).nextRequired,800);
  assert.equal(getSparksMemberLevel(200).progress,20);
  assert.equal(getSparksMemberLevel(500000).next,undefined);
  assert.equal(getSparksMemberLevel(750000).annualEarned,750000);
  assert.equal(sparksCalendarYear(new Date("2026-12-31T16:59:59.000Z")),2026);
  assert.equal(sparksCalendarYear(new Date("2026-12-31T17:00:00.000Z")),2027);
  assert.equal(annualEarnedFromWallet({memberYear:2026,memberYearEarned:675000,totalEarned:850000},2026),675000);
  assert.equal(annualEarnedFromWallet({memberYear:2026,memberYearEarned:675000,totalEarned:850000},2027),0);
  assert.equal(annualEarnedFromWallet({memberYear:2027,memberYearEarned:10,totalEarned:850010},2027),10);
  assert.equal(annualEarnedFromWallet({totalEarned:1900,firstLogin:{amount:200,claimedAt:"2026-11-05T10:00:00Z"}},2026),1900);
  assert.equal(spendableSparksFromWallet({balance:650000},2026),650000,"2026 legacy wallets remain valid in 2026");
  assert.equal(spendableSparksFromWallet({balance:650000},2027),0,"legacy Sparks expire Jan 1");
  assert.equal(spendableSparksFromWallet({balance:85000,balanceYear:2027},2027),85000);
  assert.equal(spendableSparksFromWallet({balance:85000,balanceYear:2027},2028),0);
  console.log("PASS 10 Member Levels, 500k+ highest tier, unlimited annual earned points and Bangkok Jan 1 wallet expiry");
} finally {
  await rm(directory, { recursive: true, force: true });
}
