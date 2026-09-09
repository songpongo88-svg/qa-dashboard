import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appealPath = path.join(root, "src", "AppealMockup.tsx");
const pdfPath = path.join(root, "src", "caseDetailOfficialPdf.ts");
const marker = "appeal-nonappealed-information-v44";

function patchAppealPdfContext() {
  let source = fs.readFileSync(appealPath, "utf8");
  if (source.includes(`// ${marker}-context`)) return;

  const generatedAnchor = `      const generated = await generateOfficialCaseDetailPdf({`;
  const generatedIndex = source.indexOf(generatedAnchor);
  if (generatedIndex < 0) {
    console.warn("Appeal PDF v44: generate PDF anchor not found; skipping context patch.");
    return;
  }

  const contextBlock = `      // ${marker}-context\n      // Build Information from the complete topic master for the selected month.\n      // This is independent from the appealed/revised topic subset.\n      const appealedTopicCodesForPdf = new Set(\n        revisedTopics.map((topic) => String(topic.code || "").trim())\n      );\n      const nonAppealedTopicsForPdf = getTopicMasterByMonth(selectedCase.monthKey)\n        .filter((master) => !appealedTopicCodesForPdf.has(String(master.code)))\n        .map((master) => {\n          const existing = selectedCase.allTopics.find(\n            (topic) => String(topic.code || "").trim() === String(master.code)\n          );\n          return existing || {\n            code: master.code,\n            label: master.label,\n            score: 0,\n            max: master.max,\n            pct: 0,\n            comment: "",\n          };\n        });\n\n`;

  source = source.slice(0, generatedIndex) + contextBlock + source.slice(generatedIndex);

  // Add an explicit property immediately before previousScore. If v43 already added an older
  // nonAppealedTopics property, this later property intentionally overrides it.
  const previousScoreAnchor = `          previousScore: selectedRevision.previousScore,`;
  if (source.includes(previousScoreAnchor)) {
    source = source.replace(
      previousScoreAnchor,
      `          nonAppealedTopics: nonAppealedTopicsForPdf,\n${previousScoreAnchor}`
    );
  } else {
    console.warn("Appeal PDF v44: previousScore anchor not found; non-appealed context was not attached.");
  }

  fs.writeFileSync(appealPath, source, "utf8");
}

function patchPdfInformationRenderer() {
  let source = fs.readFileSync(pdfPath, "utf8");
  if (source.includes(`// ${marker}-render`)) return;

  // Disable the older conditional Information block from v42 so the explicit block below is
  // the single source of truth and cannot duplicate rows.
  source = source.replace(
    `  if (includeAppeal && nonAppealedTopics.length) {`,
    `  if (false && includeAppeal && nonAppealedTopics.length) {`
  );

  const returnAnchor = `\n\n  return {\n    blob: doc.output("blob"),`;
  const returnIndex = source.lastIndexOf(returnAnchor);
  if (returnIndex < 0) {
    console.warn("Appeal PDF v44: final return anchor not found; skipping Information renderer.");
    fs.writeFileSync(pdfPath, source, "utf8");
    return;
  }

  const renderBlock = `\n\n  // ${marker}-render\n  // Non-appealed topics are summary information only; they do not belong in Detailed Topic Scores.\n  if (includeAppeal) {\n    const informationTopics = Array.isArray(caseItem.nonAppealedTopics)\n      ? caseItem.nonAppealedTopics.filter((topic: any) => num(topic.max) > 0)\n      : [];\n\n    if (informationTopics.length) {\n      addPageIfNeeded(16);\n      y += 4;\n      setWidths(topWidths);\n      purpleRow(y, 5, "Information");\n      y += 7;\n\n      informationTopics.forEach((topic: any) => {\n        const rawDescription = bilingualAppealTopicDescription(\n          String(topic.code || ""),\n          topic.label\n        );\n        const descriptionParts = rawDescription\n          .split(/\\n+/g)\n          .map((part) => part.trim())\n          .filter(Boolean);\n        const descriptionText = descriptionParts.length > 1\n          ? descriptionParts[0] + " (" + descriptionParts.slice(1).join(" ") + ")"\n          : (descriptionParts[0] || safeText(topic.label));\n        const infoText =\n          "Topic " + String(topic.code || "-") + " " + descriptionText + " — ไม่อุทธรณ์หัวข้อนี้";\n        const infoH = Math.max(8, Math.min(15, measureTextHeight(infoText, fullW, 6.4, 0.42, 4)));\n\n        if (y + infoH > bottom) {\n          doc.addPage();\n          y = top;\n          setWidths(topWidths);\n          purpleRow(y, 5, "Information");\n          y += 7;\n        }\n\n        rect(left, y, fullW, infoH, WHITE);\n        writeText(infoText, left, y, fullW, infoH, {\n          size: 6.4,\n          valign: "middle",\n          maxLines: 3,\n          leading: 0.42,\n        });\n        y += infoH;\n      });\n    }\n  }`;

  source = source.slice(0, returnIndex) + renderBlock + source.slice(returnIndex);
  fs.writeFileSync(pdfPath, source, "utf8");
}

patchAppealPdfContext();
patchPdfInformationRenderer();
console.log("Appeal PDF non-appealed Information now comes from the complete month topic master and is rendered explicitly after the appeal table.");
