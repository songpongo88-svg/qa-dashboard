import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const dashboard = await readFile(new URL("../src/DashboardMockup.tsx", import.meta.url), "utf8");
const caseList = dashboard.split('data-qa-case-list-empty-reason="true"')[1]?.split('className="min-w-0 bg-gradient-to-b')[0] || "";
assert.ok(caseList, "empty case list must explain zero-case state");
assert.ok(caseList.includes("isLoading ?"), "loading state must not imply no data");
assert.ok(caseList.includes("loadError && sourceCases.length === 0"), "source errors must be visible at case list");
assert.ok(caseList.includes("ไม่ได้หมายความว่าเคสถูกลบ"), "source errors must not suggest lost evaluations");
assert.ok(caseList.includes("sourceCases.length === 0"), "no cached data is distinct from filtered no-match");
assert.ok(caseList.includes("sourceCases.length} เคส"), "filtered no-match must show data availability");
assert.ok(caseList.includes("clearDateRange();"), "user must be able to remove date constraints");
assert.ok(caseList.includes('setCaseRecordFilter("all")'), "user must be able to reset Appeal-only filter");
assert.ok(caseList.includes('setSelectedTopicCode("")'), "user must be able to reset Topic filter");
console.log("PASS Preview empty-case states: loading, source failure, no cached cases, filtered mismatch and all-history reset");
