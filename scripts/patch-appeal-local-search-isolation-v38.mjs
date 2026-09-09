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

  source = source.replace(/\n\s*onSelectedAgentChange\?\.\(scopedAgent \|\| ""\);/g, "");
  source = source.replace(/\n\s*onSelectedAgentChange\?\.\(""\);/g, "");
  source = source.replace(/\n\s*onSelectedAgentChange\?\.\(next\);/g, "");
  source = source.replace(/\n\s*onSelectedAgentChange\?\.\(matchedCase\.agent\);/g, "");

  source = source.replace(
    `  }, [roleScopedAgentList, selectedAgent, visibleAgentList, onSelectedAgentChange]);`,
    `  }, [roleScopedAgentList, selectedAgent, visibleAgentList]);`
  );

  const oldExternalDeps = `  }, [\n    externalSelectedCaseId,\n    externalSelectedAgent,\n    allCases,\n    selectedCaseKey,\n    selectedMonthKey,\n    selectedAgent,\n    roleScopedAgentList,\n    onSelectedAgentChange,\n  ]);`;
  const newExternalDeps = `  }, [\n    externalSelectedCaseId,\n    allCases,\n    roleScopedAgentList,\n  ]);`;

  if (!source.includes(oldExternalDeps)) {
    throw new Error("Appeal local search v38 external selection dependency anchor not found.");
  }
  source = source.replace(oldExternalDeps, newExternalDeps);

  fs.writeFileSync(appealPath, source, "utf8");
}

let dashboardSource = fs.readFileSync(dashboardPath, "utf8");

if (!dashboardSource.includes(`// ${caseDetailMarker}`)) {
  let applied = 0;

  const lookupBefore = `      const rejectedReviewTopic =\n        appealStatus === "Rejected"\n          ? appealReviewedTopics?.find((item) => item.code === originalTopic.code)\n          : undefined;`;
  const lookupAfter = `      const appealReviewTopic = appealReviewedTopics?.find((item) => item.code === originalTopic.code);\n      const rejectedReviewTopic =\n        appealStatus === "Rejected"\n          ? appealReviewTopic\n          : undefined;\n      const approvedReviewTopic =\n        appealStatus === "Approved"\n          ? appealReviewTopic\n          : undefined;`;
  if (dashboardSource.includes(lookupBefore)) {
    dashboardSource = dashboardSource.replace(lookupBefore, lookupAfter);
    applied += 1;
  }

  const returnBefore = `        revisedTopic,\n        rejectedReviewTopic,\n        shownTopic,`;
  const returnAfter = `        revisedTopic,\n        rejectedReviewTopic,\n        approvedReviewTopic,\n        shownTopic,`;
  if (dashboardSource.includes(returnBefore)) {
    dashboardSource = dashboardSource.replace(returnBefore, returnAfter);
    applied += 1;
  }

  const typeBefore = `      revisedTopic?: Topic;\n      rejectedReviewTopic?: AppealReviewedTopic;\n      shownTopic: Topic;`;
  const typeAfter = `      revisedTopic?: Topic;\n      rejectedReviewTopic?: AppealReviewedTopic;\n      approvedReviewTopic?: AppealReviewedTopic;\n      shownTopic: Topic;`;
  if (dashboardSource.includes(typeBefore)) {
    dashboardSource = dashboardSource.replace(typeBefore, typeAfter);
    applied += 1;
  }

  const renderBefore = `            <div className="mt-6 space-y-4">\n              {row.rejectedReviewTopic ? (`;
  const renderAfter = `            <div className="mt-6 space-y-4">\n              {appealStatus === "Approved" && row.approvedReviewTopic?.appealReason ? (\n                <div className="rounded-[20px] border border-amber-200 bg-amber-50/80 px-4 py-4">\n                  <div className="text-[13px] font-semibold text-amber-700">Appeal Reason</div>\n                  <div className="mt-4 whitespace-pre-line leading-7 text-amber-950">\n                    <RichTextContent\n                      value={row.approvedReviewTopic.appealReason}\n                      fallback="ไม่พบ Appeal Reason"\n                    />\n                  </div>\n                </div>\n              ) : null}\n\n              {row.rejectedReviewTopic ? (`;
  if (dashboardSource.includes(renderBefore)) {
    dashboardSource = dashboardSource.replace(renderBefore, renderAfter);
    applied += 1;
  }

  if (applied === 4) {
    dashboardSource = dashboardSource.replace(
      `const CASE_TARGET = 10;`,
      `// ${caseDetailMarker}\nconst CASE_TARGET = 10;`
    );
    fs.writeFileSync(dashboardPath, dashboardSource, "utf8");
    console.log("Patched Approved Case Detail to show Appeal Reason for each appealed topic.");
  } else {
    console.warn(`Case Detail Appeal Reason v39 applied ${applied}/4 anchors; build continues without partial write.`);
  }
}

console.log("Patched Appeal local search isolation and checked Approved Case Detail Appeal Reason.");
