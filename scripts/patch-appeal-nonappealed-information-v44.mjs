import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appealPath = path.join(root, "src", "AppealMockup.tsx");
const pdfPath = path.join(root, "src", "caseDetailOfficialPdf.ts");
const marker = "appeal-nonappealed-information-v44";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Appeal PDF v44 anchor not found: ${label}`);
  }
  return source.replace(before, after);
}

function patchAppealPdfContext() {
  let source = fs.readFileSync(appealPath, "utf8");
  if (source.includes(`// ${marker}-context`)) return;

  const revisedTopicsAnchor = `      const revisedTopics = selectedRevision.appealedTopics.map((topic) => {\n        const revisedScore = Number(topic.score ?? 0);\n        const max = Number(topic.max || 0);\n\n        return {\n          ...topic,\n          score: revisedScore,\n          pct: max > 0 ? Math.round((revisedScore / max) * 100) : 0,\n          comment: String(topic.comment || "").trim(),\n          appealReason: String(topic.appealReason || "").trim(),\n        };\n      });`;

  const revisedTopicsReplacement = `${revisedTopicsAnchor}\n\n      // ${marker}-context\n      // Build Information from the full topic master, not only the appealed/revised subset.\n      // This guarantees that every non-appealed topic still appears after the table.\n      const appealedTopicCodesForPdf = new Set(\n        revisedTopics.map((topic) => String(topic.code || "").trim())\n      );\n      const topicMasterForPdf = getTopicMasterByMonth(selectedCase.monthKey);\n      const nonAppealedTopicsForPdf = topicMasterForPdf\n        .filter((master) => !appealedTopicCodesForPdf.has(String(master.code)))\n        .map((master) => {\n          const existing = selectedCase.allTopics.find(\n            (topic) => String(topic.code || "").trim() === String(master.code)\n          );\n          return existing || {\n            code: master.code,\n            label: master.label,\n            score: 0,\n            max: master.max,\n            pct: 0,\n            comment: "",\n          };\n        });`;

  source = replaceOnce(source, revisedTopicsAnchor, revisedTopicsReplacement, "build full non-appealed topic information");

  source = replaceOnce(
    source,
    `          nonAppealedTopics: originalTopics.filter(\n            (topic) => !revisedTopics.some((appealedTopic) => appealedTopic.code === topic.code)\n          ),`,
    `          nonAppealedTopics: nonAppealedTopicsForPdf,`,
    "pass explicit non-appealed topics to PDF"
  );

  fs.writeFileSync(appealPath, source, "utf8");
}

function patchInformationFormat() {
  let source = fs.readFileSync(pdfPath, "utf8");
  if (source.includes(`// ${marker}-format`)) return;

  const oldInfo = `        const infoDescription = bilingualAppealTopicDescription(\n          String(topic.code || ""),\n          topic.label\n        ).replace(/\\n+/g, " / ");\n        const infoText = \`Topic \${topic.code}  \${infoDescription}  - ไม่อุทธรณ์หัวข้อนี้\`;`;
  const newInfo = `        // ${marker}-format\n        const infoDescriptionRaw = bilingualAppealTopicDescription(\n          String(topic.code || ""),\n          topic.label\n        );\n        const infoParts = infoDescriptionRaw\n          .split(/\\n+/g)\n          .map((part) => part.trim())\n          .filter(Boolean);\n        const infoDescription = infoParts.length > 1\n          ? \`\${infoParts[0]} (\${infoParts.slice(1).join(" ")})\`\n          : (infoParts[0] || safeText(topic.label));\n        const infoText = \`Topic \${topic.code} \${infoDescription} — ไม่อุทธรณ์หัวข้อนี้\`;`;

  source = replaceOnce(source, oldInfo, newInfo, "Information line format");
  fs.writeFileSync(pdfPath, source, "utf8");
}

patchAppealPdfContext();
patchInformationFormat();
console.log("Patched Appeal PDF non-appealed Information to always use the full month topic master and show Thai + English topic names after the table.");
