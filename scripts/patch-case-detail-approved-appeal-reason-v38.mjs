import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dashboardPath = path.join(root, "src", "DashboardMockup.tsx");
const marker = "case-detail-approved-appeal-reason-v38";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Case Detail Appeal Reason v38 anchor not found: ${label}`);
  }
  return source.replace(before, after);
}

let source = fs.readFileSync(dashboardPath, "utf8");

if (!source.includes(`// ${marker}`)) {
  source = replaceOnce(
    source,
    `type Topic = {\n  code: string;\n  label: string;\n  score: number;\n  max: number;\n  pct: number;\n  comment?: string;\n};`,
    `type Topic = {\n  code: string;\n  label: string;\n  score: number;\n  max: number;\n  pct: number;\n  comment?: string;\n  appealReason?: string;\n};\n\n// ${marker}`,
    "Topic appealReason field"
  );

  source = replaceOnce(
    source,
    `        comment: String(matched.revisedComment || matched.comment || "").trim(),\n      });`,
    `        comment: String(matched.revisedComment || matched.comment || "").trim(),\n        appealReason: String(matched.appealReason || "").trim(),\n      });`,
    "Firebase approved revised topic appeal reason"
  );

  source = replaceOnce(
    source,
    `              pct: topic.max > 0 ? Math.round((score / topic.max) * 100) : 0,\n              comment,\n            });`,
    `              pct: topic.max > 0 ? Math.round((score / topic.max) * 100) : 0,\n              comment,\n              appealReason: String(appealReasonRaw ?? "").trim(),\n            });`,
    "Workbook approved revised topic appeal reason"
  );

  source = replaceOnce(
    source,
    `      const rejectedReviewTopic =\n        appealStatus === "Rejected"\n          ? appealReviewedTopics?.find((item) => item.code === originalTopic.code)\n          : undefined;`,
    `      const appealReviewTopic = appealReviewedTopics?.find((item) => item.code === originalTopic.code);\n      const rejectedReviewTopic =\n        appealStatus === "Rejected"\n          ? appealReviewTopic\n          : undefined;\n      const approvedReviewTopic =\n        appealStatus === "Approved"\n          ? appealReviewTopic\n          : undefined;`,
    "approved review topic lookup"
  );

  source = replaceOnce(
    source,
    `        revisedTopic,\n        rejectedReviewTopic,\n        shownTopic,`,
    `        revisedTopic,\n        rejectedReviewTopic,\n        approvedReviewTopic,\n        shownTopic,`,
    "approved review topic return"
  );

  source = replaceOnce(
    source,
    `      revisedTopic?: Topic;\n      rejectedReviewTopic?: AppealReviewedTopic;\n      shownTopic: Topic;`,
    `      revisedTopic?: Topic;\n      rejectedReviewTopic?: AppealReviewedTopic;\n      approvedReviewTopic?: AppealReviewedTopic;\n      shownTopic: Topic;`,
    "approved review topic type"
  );

  source = replaceOnce(
    source,
    `            <div className="mt-6 space-y-4">\n              {row.rejectedReviewTopic ? (`,
    `            <div className="mt-6 space-y-4">\n              {appealStatus === "Approved" && (row.approvedReviewTopic?.appealReason || row.revisedTopic?.appealReason) ? (\n                <div className="rounded-[20px] border border-amber-200 bg-amber-50/80 px-4 py-4">\n                  <div className="text-[13px] font-semibold text-amber-700">Appeal Reason</div>\n                  <div className="mt-4 whitespace-pre-line leading-7 text-amber-950">\n                    <RichTextContent\n                      value={row.approvedReviewTopic?.appealReason || row.revisedTopic?.appealReason}\n                      fallback="ไม่พบ Appeal Reason"\n                    />\n                  </div>\n                </div>\n              ) : null}\n\n              {row.rejectedReviewTopic ? (`,
    "approved Appeal Reason card"
  );

  fs.writeFileSync(dashboardPath, source, "utf8");
}

console.log("Patched Case Detail so Approved appeals show Appeal Reason per appealed topic, matching Rejected appeal context.");
