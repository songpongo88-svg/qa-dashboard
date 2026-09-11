import fs from "node:fs";

const file = "src/processLibrary.tsx";
let source = fs.readFileSync(file, "utf8");
const marker = "// process-reference-floating-viewer-v74";

if (source.includes(marker)) {
  console.log("Process reference floating viewer v74 already applied");
  await import("./patch-process-reference-ui-v75.mjs");
  process.exit(0);
}

if (!source.includes("// process-reference-custom-labels-v73")) {
  throw new Error("Process reference floating viewer v74 requires v73 first");
}

const readSnippet = (name) => fs.readFileSync(`scripts/process-reference-v74/${name}.txt`, "utf8");
const replaceRegex = (pattern, to, label) => {
  if (!pattern.test(source)) throw new Error(`Process reference floating viewer v74: missing ${label}`);
  source = source.replace(pattern, to);
};

source = source.replace(
  "// process-reference-custom-labels-v73\n",
  "// process-reference-custom-labels-v73\n" + marker + "\n",
);

replaceRegex(
  /function ProcessSlideModalV68\([\s\S]*?\n\}\n\nexport function ProcessReferenceSelector/,
  readSnippet("modal") + "\nexport function ProcessReferenceSelector",
  "process slide modal",
);

replaceRegex(
  /export function ProcessReferenceDisplay\(\{ value, className = "" \}: \{ value: string; className\?: string \}\) \{[\s\S]*\}\s*$/,
  readSnippet("display") + "\n",
  "process reference display",
);

fs.writeFileSync(file, source);
console.log("Applied list display + draggable, resizable, minimizable Process Slide viewer v74");
await import("./patch-process-reference-ui-v75.mjs");
