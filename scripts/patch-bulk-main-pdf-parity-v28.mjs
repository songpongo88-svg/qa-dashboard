import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const addonPath = path.join(root, "src", "caseAppealPdfAddon.ts");
const bulkPath = path.join(root, "src", "bulkCaseDetailPdf.ts");
const marker = "bulk-main-pdf-appeal-parity-v28";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Bulk Main PDF parity v28 anchor not found: ${label}`);
  }
  return source.replace(before, after);
}

function patchAppealAwareRenderer() {
  let source = fs.readFileSync(addonPath, "utf8");
  if (source.includes(marker)) return;

  source = replaceOnce(
    source,
    `type PdfGenerator = (input: {\n  caseItem: any;\n  currentUser?: any;\n  pdfVariant?: PdfVariant;\n}) => Promise<PdfResult>;`,
    `// ${marker}\ntype PdfGenerator = (input: {\n  caseItem: any;\n  currentUser?: any;\n  pdfVariant?: PdfVariant;\n  pdfDoc?: any;\n  appendPage?: boolean;\n  suppressOutput?: boolean;\n}) => Promise<PdfResult>;`,
    "PDF generator input"
  );

  source = replaceOnce(
    source,
    `type GenerateAppealAwarePdfInput = {\n  caseItem: any;\n  currentUser?: any;\n  pdfVariant?: PdfVariant;\n  fallback: PdfGenerator;\n};`,
    `type GenerateAppealAwarePdfInput = {\n  caseItem: any;\n  currentUser?: any;\n  pdfVariant?: PdfVariant;\n  fallback: PdfGenerator;\n  pdfDoc?: any;\n  appendPage?: boolean;\n  suppressOutput?: boolean;\n};`,
    "appeal-aware input"
  );

  source = replaceOnce(
    source,
    `export async function generateCasePdfWithAppealHistory({\n  caseItem,\n  currentUser,\n  pdfVariant = "original",\n  fallback,\n}: GenerateAppealAwarePdfInput): Promise<PdfResult> {\n  if (!hasResolvedAppeal(caseItem)) {\n    return fallback({ caseItem, currentUser, pdfVariant });\n  }`,
    `export async function generateCasePdfWithAppealHistory({\n  caseItem,\n  currentUser,\n  pdfVariant = "original",\n  fallback,\n  pdfDoc,\n  appendPage = false,\n  suppressOutput = false,\n}: GenerateAppealAwarePdfInput): Promise<PdfResult> {\n  if (!hasResolvedAppeal(caseItem)) {\n    return fallback({\n      caseItem,\n      currentUser,\n      pdfVariant,\n      pdfDoc,\n      appendPage,\n      suppressOutput,\n    });\n  }`,
    "appeal-aware function passthrough"
  );

  source = replaceOnce(
    source,
    `  return fallback({ caseItem: updatedCaseItem, currentUser, pdfVariant: "original" });`,
    `  return fallback({\n    caseItem: updatedCaseItem,\n    currentUser,\n    pdfVariant: "original",\n    pdfDoc,\n    appendPage,\n    suppressOutput,\n  });`,
    "appeal-aware final renderer passthrough"
  );

  fs.writeFileSync(addonPath, source, "utf8");
}

function patchBulkRenderer() {
  let source = fs.readFileSync(bulkPath, "utf8");
  if (source.includes(marker)) return;

  const officialImportMatch = source.match(/import \{[^\n]*generateOfficialCaseDetailPdf[^\n]*\} from "\.\/caseDetailOfficialPdf";/);
  if (!officialImportMatch) {
    throw new Error("Bulk Main PDF parity v28 official renderer import not found");
  }
  source = source.replace(
    officialImportMatch[0],
    `${officialImportMatch[0]}\nimport { generateCasePdfWithAppealHistory } from "./caseAppealPdfAddon";\n// ${marker}`
  );

  const renderCall = `      await generateOfficialCaseDetailPdf({\n        caseItem,\n        currentUser,\n        pdfVariant: useAppeal ? "appeal" : "original",\n        pdfDoc: doc,\n        appendPage: hasWrittenContent,\n        suppressOutput: true,\n      });`;
  const parityCall = `      // Generate the exact same current Main PDF content used by Case Detail.\n      // Appeal-aware transformation stays centralized in caseAppealPdfAddon.\n      await generateCasePdfWithAppealHistory({\n        caseItem: sourceCase,\n        currentUser,\n        pdfVariant: useAppeal ? "appeal" : "original",\n        fallback: generateOfficialCaseDetailPdf,\n        pdfDoc: doc,\n        appendPage: hasWrittenContent,\n        suppressOutput: true,\n      });`;

  source = replaceOnce(source, renderCall, parityCall, "bulk Case renderer call");

  fs.writeFileSync(bulkPath, source, "utf8");
}

patchAppealAwareRenderer();
patchBulkRenderer();
console.log("Patched Gen All Case PDF to render each Case through the same current Main PDF appeal-aware source.");
