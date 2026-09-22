import fs from "node:fs";

const path = "src/DashboardMockup.tsx";
let text = fs.readFileSync(path, "utf8");

const marker = "// legacy-appeal-qa-fallback-v1";
if (text.includes(marker)) {
  console.log("Legacy Appeal QA fallback already installed.");
  process.exit(0);
}

const oldBlock = `            reviewedBy: String(getFirstAvailableHeaderValue(appealHelper, row, [
              "Appeal Reviewed By",
              "Reviewed By",
              "QA Name",
              "Reviewer Name",
            ], "") ?? "").trim(),`;

const newBlock = `            ${marker}
            reviewedBy: (() => {
              const reviewer = String(getFirstAvailableHeaderValue(appealHelper, row, [
                "Appeal Reviewed By",
                "Reviewed By",
                "QA Name",
                "QA Reviewer",
                "QA",
                "Reviewer Name",
              ], "") ?? "").trim();
              return reviewer || "Songpon Phothong";
            })(),`;

if (!text.includes(oldBlock)) {
  throw new Error("Legacy Appeal reviewedBy anchor not found");
}

text = text.replace(oldBlock, newBlock);
fs.writeFileSync(path, text);
console.log("Installed Legacy Appeal QA fallback: Songpon Phothong.");
