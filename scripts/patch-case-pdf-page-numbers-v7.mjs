import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pdfPath = path.resolve(__dirname, "../src/caseDetailOfficialPdf.ts");
const bulkPath = path.resolve(__dirname, "../src/bulkCaseDetailPdf.ts");
const marker = "case-pdf-page-numbers-v7";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing ${label} anchor`);
  return source.replace(before, after);
}

function patchOfficialPdf() {
  let source = fs.readFileSync(pdfPath, "utf8");
  if (source.includes(marker)) return;
  if (!source.includes("bulk-case-detail-pdf-v1")) {
    throw new Error("Bulk PDF shared-document patch must run before page-number patch v7");
  }

  const helperAnchor = `function safeText(value: unknown, fallback = "-") {\n  const text = richTextToPlainText(value).replace(/\\s+/g, " ").trim();\n  return text || fallback;\n}`;
  source = replaceOnce(
    source,
    helperAnchor,
    `${helperAnchor}\n\n// ${marker}\nexport function addOfficialPdfPageNumbers(doc: jsPDF) {\n  const totalPages = doc.getNumberOfPages();\n  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {\n    doc.setPage(pageNumber);\n    try {\n      doc.setFont("THSarabunNew", "normal");\n    } catch {\n      doc.setFont("helvetica", "normal");\n    }\n    doc.setFontSize(5.8);\n    doc.setTextColor(125, 125, 125);\n    const pageW = doc.internal.pageSize.getWidth();\n    const pageH = doc.internal.pageSize.getHeight();\n    doc.text(\`Page \${pageNumber} of \${totalPages}\`, pageW - 7.5, pageH - 4.2, { align: "right" });\n  }\n  doc.setTextColor(0, 0, 0);\n}`,
    "official PDF page-number helper"
  );

  const returnAnchor = `  return {\n    blob: suppressOutput ? new Blob([], { type: "application/pdf" }) : doc.output("blob"),`;
  source = replaceOnce(
    source,
    returnAnchor,
    `  if (!suppressOutput) addOfficialPdfPageNumbers(doc);\n\n${returnAnchor}`,
    "official PDF output"
  );

  fs.writeFileSync(pdfPath, source, "utf8");
}

function patchBulkPdf() {
  let source = fs.readFileSync(bulkPath, "utf8");
  if (source.includes(marker)) return;

  source = replaceOnce(
    source,
    `import { generateOfficialCaseDetailPdf } from "./caseDetailOfficialPdf";`,
    `import { addOfficialPdfPageNumbers, generateOfficialCaseDetailPdf } from "./caseDetailOfficialPdf";\n// ${marker}`,
    "bulk PDF import"
  );

  const returnAnchor = `  return {\n    blob: doc.output("blob"),`;
  source = replaceOnce(
    source,
    returnAnchor,
    `  addOfficialPdfPageNumbers(doc);\n\n${returnAnchor}`,
    "bulk PDF output"
  );

  fs.writeFileSync(bulkPath, source, "utf8");
}

patchOfficialPdf();
patchBulkPdf();
console.log("Patched Case Detail PDFs with Page X of Y footer numbering.");
