import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appealPath = path.join(root, "src", "AppealMockup.tsx");
const dashboardPath = path.join(root, "src", "DashboardMockup.tsx");
const marker = "appeal-local-search-isolation-v38";
const caseDetailMarker = "case-detail-approved-appeal-reason-v39";

let source = fs.readFileSync(appealPath, "utf8");

if (!source.includes(`// ${marker}`)) {
  const stateAnchor = `  const [searchCaseId, setSearchCaseId] = useState("");`;
  if (!source.includes(stateAnchor)) {
    throw new Error("Appeal local search v38 state anchor not found.");
  }
  source = source.replace(
    stateAnchor,
    `  // ${marker}\n${stateAnchor}`
  );

  // Appeal page filters are local UI state. Do not push Agent changes back to Dashboard.
  source = source.replace(/\n\s*onSelectedAgentChange\?\.\(scopedAgent \|\| ""\);/g, "");
  source = source.replace(/\n\s*onSelectedAgentChange\?\.\(""\);/g, "");
  source = source.replace(/\n\s*onSelectedAgentChange\?\.\(next\);/g, "");
  source = source.replace(/\n\s*onSelectedAgentChange\?\.\(matchedCase\.agent\);/g, "");

  source = source.replace(
    `  }, [roleScopedAgentList, selectedAgent, visibleAgentList, onSelectedAgentChange]);`,
    `  }, [roleScopedAgentList, selectedAgent, visibleAgentList]);`
  );

  // External Case ID may initialize/select an Appeal case, but local search/filter state
  // must not cause the external Dashboard selection effect to run again.
  const oldExternalDeps = `  }, [\n    externalSelectedCaseId,\n    externalSelectedAgent,\n    allCases,\n    selectedCaseKey,\n    selectedMonthKey,\n    selectedAgent,\n    roleScopedAgentList,\n    onSelectedAgentChange,\n  ]);`;
  const newExternalDeps = `  }, [\n    externalSelectedCaseId,\n    allCases,\n    roleScopedAgentList,\n  ]);`;

  if (!source.includes(oldExternalDeps)) {
    throw new Error("Appeal local search v38 external selection dependency anchor not found.");
  }
  source = source.replace(oldExternalDeps, newExternalDeps);

  fs.writeFileSync(appealPath, source, "utf8");
}

let dashboardSource = fs.readFileSync(dashboardPath, "utf8");

function replaceDashboardOnce(before, after, label) {
  if (!dashboardSource.includes(before)) {
    throw new Error(`Case Detail Appeal Reason v39 anchor not found: ${label}`);
  }
  dashboardSource = dashboardSource.replace(before, after);
}

if (!dashboardSource.includes(`// ${caseDetailMarker}`)) {
  replaceDashboardOnce(
    `type Topic = {\n  code: string;\n  label: string;\n  score: number;\n  max: number;\n  pct: number;\n  comment?: string;\n};`,
    `type Topic = {\n  code: string;\n  label: string;\n  score: number;\n  max: number;\n  pct: number;\n  comment?: string;\n  appealReason?: string;\n};\n\n// ${caseDetailMarker}`,
    "Topic appealReason field"
  );

  replaceDashboardOnce(
    `        comment: String(matched.revisedComment || matched.comment || "").trim(),\n      });`,
    `        comment: String(matched.revisedComment || matched.comment || "").trim(),\n        appealReason: String(matched.appealReason || "").trim(),\n      });`,
    "Firebase approved revised topic appeal reason"
  );

  replaceDashboardOnce(
    `              pct: topic.max > 0 ? Math.round((score / topic.max) * 100) : 0,\n              comment,\n            });`,
    `              pct: topic.max > 0 ? Math.round((score / topic.max) * 100) : 0,\n              comment,\n              appealReason: String(appealReasonRaw ?? "").trim(),\n            });`,
    "Workbook approved revised topic appeal reason"
  );

  replaceDashboardOnce(
    `      const rejectedReviewTopic =\n        appealStatus === "Rejected"\n          ? appealReviewedTopics?.find((item) => item.code === originalTopic.code)\n          : undefined;`,
    `      const appealReviewTopic = appealReviewedTopics?.find((item) => item.code === originalTopic.code);\n      const rejectedReviewTopic =\n        appealStatus === "Rejected"\n          ? appealReviewTopic\n          : undefined;\n      const approvedReviewTopic =\n        appealStatus === "Approved"\n          ? appealReviewTopic\n          : undefined;`,
    "approved review topic lookup"
  );

  replaceDashboardOnce(
    `        revisedTopic,\n        rejectedReviewTopic,\n        shownTopic,`,
    `        revisedTopic,\n        rejectedReviewTopic,\n        approvedReviewTopic,\n        shownTopic,`,
    "approved review topic return"
  );

  replaceDashboardOnce(
    `      revisedTopic?: Topic;\n      rejectedReviewTopic?: AppealReviewedTopic;\n      shownTopic: Topic;`,
    `      revisedTopic?: Topic;\n      rejectedReviewTopic?: AppealReviewedTopic;\n      approvedReviewTopic?: AppealReviewedTopic;\n      shownTopic: Topic;`,
    "approved review topic type"
  );

  replaceDashboardOnce(
    `            <div className="mt-6 space-y-4">\n              {row.rejectedReviewTopic ? (`,
    `            <div className="mt-6 space-y-4">\n              {appealStatus === "Approved" && (row.approvedReviewTopic?.appealReason || row.revisedTopic?.appealReason) ? (\n                <div className="rounded-[20px] border border-amber-200 bg-amber-50/80 px-4 py-4">\n                  <div className="text-[13px] font-semibold text-amber-700">Appeal Reason</div>\n                  <div className="mt-4 whitespace-pre-line leading-7 text-amber-950">\n                    <RichTextContent\n                      value={row.approvedReviewTopic?.appealReason || row.revisedTopic?.appealReason}\n                      fallback="ไม่พบ Appeal Reason"\n                    />\n                  </div>\n                </div>\n              ) : null}\n\n              {row.rejectedReviewTopic ? (`,
    "approved Appeal Reason card"
  );

  fs.writeFileSync(dashboardPath, dashboardSource, "utf8");
}

console.log("Patched Appeal local search isolation and Case Detail Appeal Reason for Approved/Rejected appeal context.");
