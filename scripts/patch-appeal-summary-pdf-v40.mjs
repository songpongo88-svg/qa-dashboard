import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pdfPath = path.join(root, "src", "caseDetailOfficialPdf.ts");
const marker = "appeal-pdf-header-status-parity-v41";

let source = fs.readFileSync(pdfPath, "utf8");

if (!source.includes(`// ${marker}`)) {
  const startToken = `  const drawAppealTop = () => {`;
  const endToken = `  const drawTopicTitle = () => {`;
  const start = source.indexOf(startToken);
  const end = start >= 0 ? source.indexOf(endToken, start) : -1;

  if (start >= 0 && end > start) {
    let block = source.slice(start, end);

    // Keep the old purple Appeal PDF format, but align the top two rows with Case Detail PDF.
    block = block.replace(
      `  const drawAppealTop = () => {`,
      `  // ${marker}\n  const drawAppealTop = () => {`
    );

    block = block.replace(
      `{ value: caseItem.appealVersion || "REV1", w: wOf(6, 2), size: 7.2, padY: 4 },`,
      `{ value: caseItem.caseId, w: wOf(6, 2), size: 7.4, padY: 4 },`
    );
    block = block.replace(`      13\n    );`, `      12\n    );`);
    block = block.replace(`label(5, y, 1, appealSelectionRowH, "Appeal Ver.");`, `label(5, y, 1, appealSelectionRowH, "Case ID");`);
    block = block.replace(
      `value(6, y, 2, appealSelectionRowH, caseItem.appealVersion || "REV1", LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 2, size: 7.2 });`,
      `value(6, y, 2, appealSelectionRowH, caseItem.caseId, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 1, size: 7.4 });`
    );

    block = block.replace(
      `    const appealAuditText = caseItem.auditTimestamp || caseItem.auditDate;`,
      `    const appealAuditText = caseItem.auditTimestamp || caseItem.auditDate;\n    const appealCaseDateText = caseItem.caseDate || caseItem.createdAt || caseItem.caseCreatedAt || caseItem.auditDate || caseItem.auditTimestamp || "-";`
    );
    block = block.replace(
      `{ value: caseItem.caseId, w: wOf(3), size: 7.2, padY: 4 },`,
      `{ value: appealCaseDateText, w: wOf(3), size: 6.4, padY: 4 },`
    );
    block = block.replace(`      15\n    );`, `      14\n    );`);
    block = block.replace(`label(2, y, 1, appealSecondRowH, "Case ID");`, `label(2, y, 1, appealSecondRowH, "Case Date");`);
    block = block.replace(
      `value(3, y, 1, appealSecondRowH, caseItem.caseId, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 2, size: 7.2 });`,
      `value(3, y, 1, appealSecondRowH, appealCaseDateText, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 2, size: 6.4 });`
    );
    block = block.replace(/size: 8\.4/g, "size: 8.2");

    // Status wording should match the Case Detail concepts, not legacy internal fields.
    block = block.replace(`label(2, y, 1, 8, "Comment Status");`, `label(2, y, 1, 8, "Review Status");`);
    block = block.replace(
      `value(3, y, 1, 8, caseItem.commentStatus || "Approved", LIGHT_PURPLE, { align: "center", maxLines: 1 });`,
      `value(3, y, 1, 8, caseItem.reviewStatus || "Revised", LIGHT_PURPLE, { align: "center", maxLines: 1 });`
    );
    block = block.replace(`label(4, y, 1, 8, "Review Type");`, `label(4, y, 1, 8, "Appeal Version");`);
    block = block.replace(
      `value(5, y, 3, 8, "Revised", LIGHT_PURPLE, { align: "center", maxLines: 1 });`,
      `value(5, y, 3, 8, caseItem.appealVersion || "REV1", LIGHT_PURPLE, { align: "center", maxLines: 1 });`
    );

    source = source.slice(0, start) + block + source.slice(end);
    fs.writeFileSync(pdfPath, source, "utf8");
  } else {
    console.warn("Appeal PDF parity v41: drawAppealTop block not found; leaving source unchanged.");
  }
}

// Run after the legacy parity patch so the final Appeal PDF Current Selection block
// matches the equal four-column Case Detail grid without changing the rest of the report.
await import("./patch-appeal-pdf-equal-grid-v42.mjs");

console.log("Appeal PDF keeps the legacy purple format; Current Selection now uses the same equal-box grid as Case Detail.");
