import fs from "node:fs";

const target = "src/DashboardMockup.tsx";
let source = fs.readFileSync(target, "utf8");

const before = '<div><span className="font-extrabold">QA:</span> {originalQaName || "-"}</div>';
const after = '<div><span className="font-extrabold">QA:</span> {originalQaName || "Songpon Phothong"}</div>';

if (source.includes(after) && !source.includes(before)) {
  console.log("Original QA display fallback already installed.");
  process.exit(0);
}

const matches = source.split(before).length - 1;
if (!matches) {
  throw new Error("Original QA display anchor not found");
}

source = source.split(before).join(after);
fs.writeFileSync(target, source);
console.log(`Installed Original QA display fallback in ${matches} location(s).`);
