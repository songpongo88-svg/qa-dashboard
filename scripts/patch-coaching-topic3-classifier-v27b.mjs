import fs from "node:fs";

const filePath = "src/CoachingMockup.tsx";
const marker = "// coaching-topic3-classifier-v27b";
let source = fs.readFileSync(filePath, "utf8");

if (source.includes(marker)) {
  console.log("coaching topic 3 classifier v27b already applied");
  process.exit(0);
}

const search = '    if (code === "3") return Number(topic.max || 0) >= 20 ? "process" : "handling";';
const replacement = `${marker}\n    if (code === "3") return /process|compliance|ขั้นตอน|sla/.test(title) ? "process" : "handling";`;

if (!source.includes(search)) {
  throw new Error("Coaching v27 Topic 3 classifier anchor not found");
}

source = source.replace(search, replacement);
fs.writeFileSync(filePath, source, "utf8");
console.log("Coaching Topic 3 classifier v27b applied");
