import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const weeklyPath = path.resolve(__dirname, "../src/weeklyCaseSummaryPdf.ts");
const marker = "weekly-summary-body-font-v30";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Weekly summary font v30: missing ${label} anchor`);
  return source.replace(before, after);
}

let source = fs.readFileSync(weeklyPath, "utf8");
if (source.includes(marker)) {
  console.log("Weekly summary body font v30 already applied.");
  process.exit(0);
}

source = replaceOnce(
  source,
  "  const tableW = 186;\n  let y = 10;",
  `  const tableW = 186;\n  // ${marker}\n  // Keep row data in Weekly Case List and Weekly Topic Performance at the same, slightly larger size.\n  const weeklyTableBodyFontSize = 7.6;\n  const weeklyTableBodyRowHeight = 9.0;\n  let y = 10;`,
  "weekly table font constants"
);

source = replaceOnce(
  source,
  `      cell(x, y, caseWidths[valueIndex], 8.2, value, fill, {\n        bold: true,\n        size: valueIndex === 3 ? 6.8 : 7.2,`,
  `      cell(x, y, caseWidths[valueIndex], weeklyTableBodyRowHeight, value, fill, {\n        bold: true,\n        size: weeklyTableBodyFontSize,`,
  "Weekly Case List body font"
);
source = replaceOnce(
  source,
  "    y += 8.2;",
  "    y += weeklyTableBodyRowHeight;",
  "Weekly Case List row height"
);

source = replaceOnce(
  source,
  `      cell(x, y, topicWidths[valueIndex], 8.6, value, fill, {\n        bold: true,\n        size: valueIndex === 1 ? 6.8 : 7.1,`,
  `      cell(x, y, topicWidths[valueIndex], weeklyTableBodyRowHeight, value, fill, {\n        bold: true,\n        size: weeklyTableBodyFontSize,`,
  "Weekly Topic Performance body font"
);
source = replaceOnce(
  source,
  "    y += 8.6;",
  "    y += weeklyTableBodyRowHeight;",
  "Weekly Topic Performance row height"
);

fs.writeFileSync(weeklyPath, source, "utf8");
console.log("Weekly PDF table row data now uses the same 7.6pt font in Case List and Topic Performance, with slightly taller rows for readability.");
