import fs from "node:fs";

const file = "src/DashboardMockup.tsx";
let source = fs.readFileSync(file, "utf8");
const marker = "// evaluation-last-updated-v87-compat";

if (source.includes(marker)) {
  console.log("Evaluation Last Updated v87 compatibility already applied");
  process.exit(0);
}

const alteredDisplay = `      const evaluationAuditDateDisplay = formatAuditTimestamp(\n        record.auditTimestamp || record.submittedAt || record.auditDate\n      );`;
const expectedDisplay = `      const evaluationAuditDateDisplay = formatAuditDateForDisplay(\n        record.auditTimestamp || record.submittedAt || record.auditDate\n      );`;

if (source.includes(alteredDisplay)) {
  source = source.replace(alteredDisplay, expectedDisplay);
} else if (!source.includes(expectedDisplay)) {
  throw new Error("Evaluation Last Updated v87 compat: stored Audit Date display anchor not found");
}

const alteredTimestamp = `        auditTimestamp: formatAuditTimestamp(record.auditTimestamp || record.submittedAt || record.auditDate),`;
const expectedTimestamp = `        auditTimestamp: record.auditTimestamp || formatBangkokDateTime(record.submittedAt),`;

if (source.includes(alteredTimestamp)) {
  source = source.replace(alteredTimestamp, expectedTimestamp);
} else if (!source.includes(expectedTimestamp)) {
  throw new Error("Evaluation Last Updated v87 compat: stored Audit timestamp anchor not found");
}

source = source.replace(
  "// process-library-v65\n",
  "// process-library-v65\n" + marker + "\n"
);

fs.writeFileSync(file, source, "utf8");
console.log("Prepared Dashboard timestamp anchors for Evaluation Last Updated v87");
