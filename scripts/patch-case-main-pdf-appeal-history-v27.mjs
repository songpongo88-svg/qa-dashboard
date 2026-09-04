import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dashboardPath = path.join(root, "src", "DashboardMockup.tsx");

let source = fs.readFileSync(dashboardPath, "utf8");
const original = source;

const officialImport = 'import { generateOfficialCaseDetailPdf } from "./caseDetailOfficialPdf";';
const addonImport = 'import { generateCasePdfWithAppealHistory } from "./caseAppealPdfAddon";';

if (!source.includes(addonImport)) {
  if (!source.includes(officialImport)) {
    throw new Error("Case PDF import anchor was not found in DashboardMockup.tsx");
  }
  source = source.replace(officialImport, `${officialImport}\n${addonImport}`);
}

const oldGeneratorCall = `const officialPdf = await generateOfficialCaseDetailPdf({
        caseItem,
        currentUser,
        pdfVariant,
      });`;
const newGeneratorCall = `const officialPdf = await generateCasePdfWithAppealHistory({
        caseItem,
        currentUser,
        pdfVariant,
        fallback: generateOfficialCaseDetailPdf,
      });`;

if (!source.includes(newGeneratorCall)) {
  if (!source.includes(oldGeneratorCall)) {
    throw new Error("Case PDF generator call anchor was not found in DashboardMockup.tsx");
  }
  source = source.replace(oldGeneratorCall, newGeneratorCall);
}

if (!source.includes("const hasAppealReport = hasAppealCase;")) {
  const approvedReportBlock = /\n  const hasApprovedAppealReport =\n(?:    .*\n)+?    !!caseItem\.displayRevisedTopicCodes\?\.length;\n/;
  if (!approvedReportBlock.test(source)) {
    throw new Error("Appeal report visibility anchor was not found in DashboardMockup.tsx");
  }
  source = source.replace(approvedReportBlock, "\n  const hasAppealReport = hasAppealCase;\n");
}

source = source.replaceAll("hasApprovedAppealReport", "hasAppealReport");

const originalPdfLabel = "                    Original PDF";
const mainPdfLabel = '                    {hasAppealCase ? "Main PDF" : "Original PDF"}';
if (!source.includes(mainPdfLabel)) {
  if (!source.includes(originalPdfLabel)) {
    throw new Error("Original PDF button label anchor was not found in DashboardMockup.tsx");
  }
  source = source.replace(originalPdfLabel, mainPdfLabel);
}

if (source !== original) {
  fs.writeFileSync(dashboardPath, source, "utf8");
  console.log("Applied Case Main PDF appeal-history patch v27.");
} else {
  console.log("Case Main PDF appeal-history patch v27 already applied.");
}
