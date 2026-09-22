import fs from "node:fs";

const path = "src/DashboardMockup.tsx";
let text = fs.readFileSync(path, "utf8");

if (text.includes("legacy-appeal-reason-fallback-v1")) {
  console.log("Legacy Appeal Reason fallback already installed.");
  process.exit(0);
}

const mergeTypeAnchor = '  reviewSummary?: string;\n  status?: "Approved" | "Rejected";';
if (!text.includes(mergeTypeAnchor)) {
  throw new Error("AppealMergeItem reviewedTopics anchor not found");
}
text = text.replace(
  mergeTypeAnchor,
  '  reviewSummary?: string;\n  reviewedTopics?: Topic[];\n  status?: "Approved" | "Rejected";'
);

const historyMapPattern = /const appealMap = new Map<string, AppealMergeItem>\(\);\n\s*const appealHistoryCaseIds = new Set<string>\(\);\n\s*appealDataRows\.forEach\(\(row\) => \{\n\s*splitAppealCaseIds\(appealHelper\.getValue\(row, "Case ID"\)\)\n\s*\.forEach\(\(caseId\) => appealHistoryCaseIds\.add\(caseId\)\);\n\s*\}\);/;
const historyMapReplacement = `const appealMap = new Map<string, AppealMergeItem>();
        const appealHistoryCaseIds = new Set<string>();
        const appealRowsByCaseId = new Map<string, any[][]>();
        appealDataRows.forEach((row) => {
          const rowCaseIds = splitAppealCaseIds(appealHelper.getValue(row, "Case ID"));
          rowCaseIds.forEach((caseId) => {
            appealHistoryCaseIds.add(caseId);
            const normalizedCaseId = normalizeAppealCaseId(caseId);
            const existing = appealRowsByCaseId.get(normalizedCaseId) || [];
            existing.push(row);
            appealRowsByCaseId.set(normalizedCaseId, existing);
          });
        });`;
if (!historyMapPattern.test(text)) {
  throw new Error("Appeal history row-map anchor not found");
}
text = text.replace(historyMapPattern, historyMapReplacement);

const caseRowsPattern = /const caseId = String\(appealHelper\.getValue\(row, "Case ID"\) \?\? ""\)\.trim\(\);\n\s*if \(!caseId\) return;\n\n\s*const revisedTopics: Topic\[\] = \[\];\n\s*const displayRevisedTopicCodes: string\[\] = \[\];/;
const caseRowsReplacement = `const caseId = String(appealHelper.getValue(row, "Case ID") ?? "").trim();
          if (!caseId) return;

          const legacyAppealRowsForCase = appealRowsByCaseId.get(normalizeAppealCaseId(caseId)) || [row];
          const revisedTopics: Topic[] = [];
          const reviewedTopics: Topic[] = [];
          const displayRevisedTopicCodes: string[] = [];`;
if (!caseRowsPattern.test(text)) {
  throw new Error("Latest Appeal row topic-list anchor not found");
}
text = text.replace(caseRowsPattern, caseRowsReplacement);

const reasonPattern = /const originalScoreRaw = appealHelper\.getValue\(row, `\$\{topic\.code\} Score`\);\n\s*const revisedScoreRaw = appealHelper\.getValue\(row, `\$\{topic\.code\} Revised Score`\);\n\s*const originalCommentRaw = appealHelper\.getValue\(row, `\$\{topic\.code\} Comment`\);\n\s*const revisedCommentRaw = appealHelper\.getValue\(row, `\$\{topic\.code\} Revised Comment`\);\n\s*const appealReasonRaw = appealHelper\.getValue\(row, `\$\{topic\.code\} Appeal Reason`\);/;
const reasonReplacement = `const originalScoreRaw = appealHelper.getValue(row, \`${'${topic.code}'} Score\`);
            const revisedScoreRaw = appealHelper.getValue(row, \`${'${topic.code}'} Revised Score\`);
            const originalCommentRaw = appealHelper.getValue(row, \`${'${topic.code}'} Comment\`);
            const revisedCommentRaw = appealHelper.getValue(row, \`${'${topic.code}'} Revised Comment\`);
            // legacy-appeal-reason-fallback-v1
            const appealReasonRaw = (() => {
              const rowsToCheck = [
                row,
                ...legacyAppealRowsForCase
                  .filter((candidateRow) => candidateRow !== row)
                  .slice()
                  .reverse(),
              ];
              const topicSpecificHeaders = [
                \`${'${topic.code}'} Appeal Reason\`,
                \`${'${topic.code}'} Reason for Appeal\`,
                \`${'${topic.code}'} AppealReason\`,
              ];
              const genericReasonHeaders = [
                "Appeal Reason",
                "Reason for Appeal",
                "Appeal Request Reason",
                "Agent Appeal Reason",
                "Appeal Comment",
              ];
              const appealTopicHeaders = [
                "Appealed Topic",
                "Appeal Topic",
                "Appealed Topics",
                "Appeal Topics",
                "Appeal Topic(s)",
                "Topic Code",
              ];

              const getLastNonEmptyHeaderValue = (candidateRow: any[], header: string) => {
                let found: any = "";
                for (let occurrence = 0; occurrence < 50; occurrence += 1) {
                  const value = appealHelper.getValue(candidateRow, header, occurrence);
                  if (value === null || value === undefined) break;
                  if (String(value).trim() !== "") found = value;
                }
                return found;
              };

              for (const candidateRow of rowsToCheck) {
                for (const header of topicSpecificHeaders) {
                  const value = getLastNonEmptyHeaderValue(candidateRow, header);
                  if (String(value ?? "").trim()) return value;
                }

                let appealedTopicRaw: any = "";
                for (const header of appealTopicHeaders) {
                  appealedTopicRaw = getLastNonEmptyHeaderValue(candidateRow, header);
                  if (String(appealedTopicRaw ?? "").trim()) break;
                }

                const appealedTopicText = normalizeText(appealedTopicRaw);
                const topicMatches = Boolean(appealedTopicText) && (
                  appealedTopicText.includes(normalizeText(topic.code)) ||
                  appealedTopicText.includes(normalizeText(topic.label))
                );
                const candidateChanged = hasRealTopicChange(
                  appealHelper.getValue(candidateRow, \`${'${topic.code}'} Score\`),
                  appealHelper.getValue(candidateRow, \`${'${topic.code}'} Revised Score\`),
                  appealHelper.getValue(candidateRow, \`${'${topic.code}'} Comment\`),
                  appealHelper.getValue(candidateRow, \`${'${topic.code}'} Revised Comment\`)
                );

                if (!topicMatches && !candidateChanged) continue;

                for (const header of genericReasonHeaders) {
                  const value = getLastNonEmptyHeaderValue(candidateRow, header);
                  if (String(value ?? "").trim()) return value;
                }
              }

              return "";
            })();`;
if (!reasonPattern.test(text)) {
  throw new Error("Legacy Appeal Reason parser anchor not found");
}
text = text.replace(reasonPattern, reasonReplacement);

const includeReasonPattern = /const hasRevisedComment =\n\s*revisedCommentRaw !== null && String\(revisedCommentRaw\)\.trim\(\) !== "";\n\n\s*if \(!hasRevisedScore && !hasRevisedComment\) return;/;
const includeReasonReplacement = `const hasRevisedComment =
              revisedCommentRaw !== null && String(revisedCommentRaw).trim() !== "";

            const hasAppealReason =
              Boolean(String(appealReasonRaw ?? "").trim()) && !isNoAppealReason(appealReasonRaw);

            if (hasAppealReason) {
              const reviewedScore = hasRevisedScore
                ? Number(revisedScoreRaw)
                : Number(originalScoreRaw ?? 0);
              const reviewedComment = hasRevisedComment
                ? String(revisedCommentRaw).trim()
                : String(originalCommentRaw ?? "").trim();
              reviewedTopics.push({
                code: topic.code,
                label: topic.label,
                score: Number.isFinite(reviewedScore) ? reviewedScore : 0,
                max: topic.max,
                pct: topic.max > 0 && Number.isFinite(reviewedScore)
                  ? Math.round((reviewedScore / topic.max) * 100)
                  : 0,
                comment: reviewedComment,
                appealReason: String(appealReasonRaw ?? "").trim(),
              });
            }

            if (!hasRevisedScore && !hasRevisedComment) return;`;
if (!includeReasonPattern.test(text)) {
  throw new Error("Appeal Reason reviewed-topic anchor not found");
}
text = text.replace(includeReasonPattern, includeReasonReplacement);

const appealedThisTopicPattern = /const appealedThisTopic = Boolean\(String\(appealReasonRaw \?\? ""\)\.trim\(\)\) && !isNoAppealReason\(appealReasonRaw\);/;
if (!appealedThisTopicPattern.test(text)) {
  throw new Error("appealedThisTopic anchor not found");
}
text = text.replace(appealedThisTopicPattern, "const appealedThisTopic = hasAppealReason;");

const mergeReviewedTopicsPattern = /revisedTopics,\n\s*displayRevisedTopicCodes,\n\s*submittedAt:/;
if (!mergeReviewedTopicsPattern.test(text)) {
  throw new Error("Appeal merge reviewedTopics anchor not found");
}
text = text.replace(
  mergeReviewedTopicsPattern,
  `revisedTopics,\n            reviewedTopics,\n            displayRevisedTopicCodes,\n            submittedAt:`
);

const caseDetailFallbackPattern = /appealReviewedTopics: loggedOutcome\?\.reviewedTopics\?\.length\n\s*\? loggedOutcome\.reviewedTopics\n\s*: mergedAppeal\?\.revisedTopics\?\.filter\(\(topic\) => \{\n\s*const reason = String\(topic\.appealReason \|\| ""\)\.trim\(\);\n\s*return Boolean\(reason\) && !isNoAppealReason\(reason\);\n\s*\}\) \|\| null,/;
const caseDetailFallbackReplacement = `appealReviewedTopics: loggedOutcome?.reviewedTopics?.length
        ? loggedOutcome.reviewedTopics
        : mergedAppeal?.reviewedTopics?.length
          ? mergedAppeal.reviewedTopics
          : mergedAppeal?.revisedTopics?.filter((topic) => {
              const reason = String(topic.appealReason || "").trim();
              return Boolean(reason) && !isNoAppealReason(reason);
            }) || null,`;
if (!caseDetailFallbackPattern.test(text)) {
  throw new Error("Case Detail legacy Appeal Reason fallback anchor not found");
}
text = text.replace(caseDetailFallbackPattern, caseDetailFallbackReplacement);

if (!text.includes("legacy-appeal-reason-fallback-v1")) {
  throw new Error("Legacy Appeal Reason marker missing after patch");
}
if (!text.includes("reviewedTopics?: Topic[];")) {
  throw new Error("AppealMergeItem reviewedTopics field missing after patch");
}
if (!text.includes("mergedAppeal?.reviewedTopics?.length")) {
  throw new Error("Case Detail reviewedTopics fallback missing after patch");
}

fs.writeFileSync(path, text);
console.log("Applied legacy Appleal ROWDATA Appeal Reason fallback.");
