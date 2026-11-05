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
  const { SPARKS_ANNUAL_CAP, SPARKS_MEMBER_LEVELS, getSparksMemberLevel, annualEarnedFromWallet, sparksCalendarYear } = await import(pathToFileURL(out).href);
  assert.equal(SPARKS_ANNUAL_CAP, 200000);
  assert.equal(SPARKS_MEMBER_LEVELS.length, 7);
  const transitions = [
    [0, 1], [200, 1], [999, 1], [1000, 2], [4999, 2],
    [5000, 3], [19999, 3], [20000, 4], [49999, 4],
    [50000, 5], [99999, 5], [100000, 6], [149999, 6],
    [150000, 7], [199999, 7], [200000, 7],
  ];
  for (const [earned, expected] of transitions) {
    const info = getSparksMemberLevel(earned);
    assert.equal(info.current.level, expected, "unexpected Member Level for " + earned);
    assert.equal(info.annualRemaining, SPARKS_ANNUAL_CAP - earned);
  }
  assert.equal(getSparksMemberLevel(200).nextRequired, 800);
  assert.equal(getSparksMemberLevel(200).progress, 20);
  assert.equal(getSparksMemberLevel(200000).next, undefined);
  assert.equal(getSparksMemberLevel(200000).annualRemaining, 0);
  assert.equal(sparksCalendarYear(new Date("2026-12-31T16:59:59.000Z")), 2026);
  assert.equal(sparksCalendarYear(new Date("2026-12-31T17:00:00.000Z")), 2027);
  assert.equal(annualEarnedFromWallet({ memberYear: 2026, memberYearEarned: 25000, totalEarned: 150000 }, 2026), 25000);
  assert.equal(annualEarnedFromWallet({ memberYear: 2026, memberYearEarned: 25000, totalEarned: 150000 }, 2027), 0, "annual Level resets while balance remains stored");
  assert.equal(annualEarnedFromWallet({ memberYear: 2027, memberYearEarned: 10, totalEarned: 200010 }, 2027), 10);
  assert.equal(annualEarnedFromWallet({ totalEarned: 1900, firstLogin: { amount: 200, claimedAt: "2026-11-05T10:00:00Z" } }, 2026), 1900);
  assert.equal(annualEarnedFromWallet({ firstLogin: { amount: 200, claimedAt: "2026-11-05T10:00:00Z" } }, 2026), 200, "old first-login claims are counted without a migration");
  assert.equal(annualEarnedFromWallet({ firstLogin: { amount: 200, claimedAt: "2026-11-05T10:00:00Z" } }, 2027), 0);
  assert.equal(annualEarnedFromWallet({ memberYear: 2026, memberYearEarned: 200100 }, 2026), 200000);
  console.log("PASS 7 Member Levels, boundary thresholds, 200k cap, Bangkok January rollover, 2026 legacy fallback");
} finally {
  await rm(directory, { recursive: true, force: true });
}
