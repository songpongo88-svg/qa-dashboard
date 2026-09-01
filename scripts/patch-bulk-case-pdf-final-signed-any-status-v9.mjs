import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const bulkPath = path.resolve(__dirname, "../src/bulkCaseDetailPdf.ts");
const finalPath = path.resolve(__dirname, "../src/finalSignedCasePdf.ts");
const dashboardPath = path.resolve(__dirname, "../src/DashboardMockup.tsx");
const marker = "bulk-case-pdf-final-signed-any-status-v9";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing ${label} anchor`);
  return source.replace(before, after);
}

function patchBulk() {
  let source = fs.readFileSync(bulkPath, "utf8");
  if (source.includes(marker)) return;
  if (!source.includes("bulk-case-pdf-final-signed-v8")) {
    throw new Error("Final Signed bulk patch v8 must run before v9");
  }

  source = replaceOnce(
    source,
    'import { appendFinalSignedReportForAgent, isFinalSignedDocument, loadFinalSignedDocumentIndex } from "./finalSignedCasePdf";',
    `import { appendFinalSignedReportForAgent, loadFinalSignedDocumentIndex } from "./finalSignedCasePdf";\n// ${marker}`,
    "Final Signed import"
  );

  source = replaceOnce(
    source,
    "    if (storedDocument && isFinalSignedDocument(storedDocument)) {",
    "    if (storedDocument) {",
    "Final Signed completion gate"
  );

  fs.writeFileSync(bulkPath, source, "utf8");
}

function patchFinalRenderer() {
  let source = fs.readFileSync(finalPath, "utf8");
  if (source.includes(marker)) return;

  source = replaceOnce(
    source,
    "  if (!isFinalSignedDocument(storedDocument)) return false;\n  if (appendPage) doc.addPage();",
    `  // ${marker}\n  // Include the current Signature document even when some roles are still pending.\n  if (appendPage) doc.addPage();`,
    "Final Signed renderer completion gate"
  );

  fs.writeFileSync(finalPath, source, "utf8");
}

function patchDashboardMessage() {
  let source = fs.readFileSync(dashboardPath, "utf8");
  if (source.includes(marker)) return;
  if (!source.includes("bulk-case-pdf-final-signed-v8")) {
    throw new Error("Final Signed Dashboard patch v8 must run before v9");
  }

  source = replaceOnce(
    source,
    "      // bulk-case-pdf-final-signed-v8",
    `      // bulk-case-pdf-final-signed-v8\n      // ${marker}`,
    "Dashboard v9 marker"
  );

  source = replaceOnce(
    source,
    "Gen PDF สำเร็จ แต่ไม่พบ FINAL Final Signed PDF ที่ลงนามครบสำหรับ:",
    "Gen PDF สำเร็จ แต่ไม่พบเอกสาร Signature สำหรับ:",
    "Dashboard missing Signature wording"
  );

  source = source.replace(
    "ระบบข้ามเฉพาะ Signed PDF และยังรวม Case ของ Agent เหล่านี้ตามปกติ",
    "ระบบข้ามเฉพาะหน้า Signature และยังรวม Case ของ Agent เหล่านี้ตามปกติ"
  );

  fs.writeFileSync(dashboardPath, source, "utf8");
}

patchBulk();
patchFinalRenderer();
patchDashboardMessage();
console.log("Patched bulk Case PDF to include Signature documents regardless of completion status.");
