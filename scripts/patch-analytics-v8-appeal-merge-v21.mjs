import fs from "node:fs";

const summaryPath = "src/SummaryMockup.tsx";
const marker = "// data-analytics-v8-appeal-merge-v21";
const requiredMarker = "// data-analytics-appeal-source-refresh-v20";

let source = fs.readFileSync(summaryPath, "utf8");
if (source.includes(marker)) {
  console.log("analytics V8 appeal merge v21 already applied");
  process.exit(0);
}
if (!source.includes(requiredMarker)) {
  throw new Error("SummaryMockup v20 marker not found; run patch:analytics-appeal-refresh first");
}

const anchor = `            setAllCases(mappedCases);\n            setAppealMergeCount(\n              mappedCases.filter((item) => item.reviewStatus === "Revised").length\n            );\n            setIsLoading(false);\n            return;`;

if (!source.includes(anchor)) {
  throw new Error("SummaryMockup V8 early-return anchor not found");
}

const replacement = `            ${marker}\n            // V8 is still the preferred effective-data source when present, but it must\n            // be overlaid with the latest approved appeal events before Analytics uses it.\n            let effectiveV8Cases = mappedCases;\n            try {\n              const v8CaseMonthKeyMap = new Map(\n                mappedCases.map((item) => [String(item.caseId || "").trim(), item.monthKey])\n              );\n              const reviewedLogs = await fetchAppealEvents([\n                "appeal_request_submitted",\n                "appeal_request_reviewed",\n                "appeal_request_reset",\n              ], { limit: 2000, forceRefresh: true }) as UsageLogEvent[];\n              const approvedAppeals = buildApprovedAppealMergeMap(reviewedLogs, v8CaseMonthKeyMap);\n              const normalizedApprovedAppeals = new Map(\n                [...approvedAppeals.entries()].map(([caseId, appeal]) => [\n                  String(caseId || "").replace(/\\s+/g, "").toUpperCase(),\n                  appeal,\n                ])\n              );\n\n              effectiveV8Cases = mappedCases.map((item) => {\n                const normalizedCaseId = String(item.caseId || "").replace(/\\s+/g, "").toUpperCase();\n                const mergedAppeal = normalizedApprovedAppeals.get(normalizedCaseId);\n                if (!mergedAppeal) return item;\n\n                const finalScore =\n                  mergedAppeal.finalScore ??\n                  (mergedAppeal.revisedTopics.length\n                    ? calcMergedFinalScore(item.topics, mergedAppeal.revisedTopics)\n                    : item.finalScore);\n\n                return {\n                  ...item,\n                  finalScore: Number(finalScore.toFixed(2)),\n                  previousScore: mergedAppeal.previousScore ?? item.previousScore ?? item.finalScore,\n                  grade: scoreToGrade(finalScore, item.monthKey),\n                  reviewStatus: "Revised" as ReviewStatus,\n                  revisedTopics: mergedAppeal.revisedTopics.length\n                    ? mergedAppeal.revisedTopics\n                    : item.revisedTopics,\n                  displayRevisedTopicCodes: mergedAppeal.displayRevisedTopicCodes,\n                };\n              });\n            } catch (error) {\n              console.warn("V8 approved appeal overlay skipped", error);\n            }\n\n            setAllCases(effectiveV8Cases);\n            setAppealMergeCount(\n              effectiveV8Cases.filter((item) => item.reviewStatus === "Revised").length\n            );\n            setIsLoading(false);\n            return;`;

source = source.replace(anchor, replacement);
fs.writeFileSync(summaryPath, source, "utf8");
console.log("analytics V8 approved appeal overlay v21 applied");
