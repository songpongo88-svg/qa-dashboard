import fs from "node:fs";

const file = "src/processLibrary.tsx";
let source = fs.readFileSync(file, "utf8");
const marker = "// process-library-firestore-nested-array-v72";

if (source.includes(marker)) {
  console.log("Process Library Firestore nested-array fix v72 already applied");
  process.exit(0);
}

function replaceOnce(from, to, label) {
  if (!source.includes(from)) throw new Error(`Process Library v72 patch: missing ${label}`);
  source = source.replace(from, to);
}

replaceOnce(
  'const PROCESS_FILE_MAX_BYTES_V71 = 40 * 1024 * 1024;\n',
  'const PROCESS_FILE_MAX_BYTES_V71 = 40 * 1024 * 1024;\n' + marker + '\n',
  'v71 marker anchor',
);

replaceOnce(
  '  const steps = Array.isArray(row.slideSteps)\n    ? row.slideSteps.map((entry: unknown) => Array.isArray(entry) ? uniqueStepsV68(entry) : [])\n    : [];',
  '  const steps = Array.isArray(row.slideSteps)\n    ? row.slideSteps.map((entry: unknown) => {\n        if (Array.isArray(entry)) return uniqueStepsV68(entry);\n        if (entry && typeof entry === "object" && Array.isArray((entry as any).items)) return uniqueStepsV68((entry as any).items);\n        return [];\n      })\n    : [];',
  'slideSteps decoder',
);

replaceOnce(
  '        slideSteps: uploadIndex.steps,\n',
  '        slideSteps: uploadIndex.steps.map((steps) => ({ items: uniqueStepsV68(steps) })),\n',
  'Firestore-safe slideSteps encoder',
);

fs.writeFileSync(file, source);
console.log("Applied Process Library Firestore nested-array fix v72");
