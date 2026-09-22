import fs from "node:fs";

const target = "src/DashboardMockup.tsx";
let source = fs.readFileSync(target, "utf8");
const before = 'originalQaName={caseItem.evaluatorName}';
const after = 'originalQaName={caseItem.evaluatorName || "Songpon Phothong"}';

if (source.includes(after)) {
  console.log("Original QA fallback already installed.");
  process.exit(0);
}

const matches = source.split(before).length - 1;
if (!matches) {
  throw new Error("Original QA metadata anchor not found");
}

source = source.split(before).join(after);
fs.writeFileSync(target, source);
console.log(`Installed original QA fallback in ${matches} location(s).`);
