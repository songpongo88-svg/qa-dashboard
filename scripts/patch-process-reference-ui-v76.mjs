import fs from "node:fs";

const file = "src/processLibrary.tsx";
let source = fs.readFileSync(file, "utf8");
const marker = "// process-reference-pinned-minimize-eager-media-v76";

if (source.includes(marker)) {
  console.log("Process reference pinned minimize/eager media v76 already applied");
  await import("./patch-process-reference-ui-v77.mjs");
  process.exit(0);
}

if (!source.includes("// process-reference-centered-large-viewer-v75")) {
  throw new Error("Process reference v76 requires v75 first");
}

const modal = fs.readFileSync("scripts/process-reference-v76/modal.txt", "utf8");
const replaceRegex = (pattern, to, label) => {
  if (!pattern.test(source)) throw new Error(`Process reference v76: missing ${label}`);
  source = source.replace(pattern, to);
};

source = source.replace(
  "// process-reference-centered-large-viewer-v75\n",
  "// process-reference-centered-large-viewer-v75\n" + marker + "\n",
);

if (!source.includes('import { createPortal } from "react-dom";')) {
  const reactImport = 'import React, { useEffect, useMemo, useRef, useState } from "react";\n';
  if (!source.includes(reactImport)) throw new Error("Process reference v76: React import anchor missing");
  source = source.replace(reactImport, reactImport + 'import { createPortal } from "react-dom";\n');
}

replaceRegex(
  /function ProcessSlideModalV68\([\s\S]*?\n\}\n\nexport function ProcessReferenceSelector/,
  modal + "\nexport function ProcessReferenceSelector",
  "Process Slide modal",
);

const previewState = '  const [previewMeta, setPreviewMeta] = useState<ProcessReferenceMeta | null>(null);\n';
const previewStateWithToken = previewState + '  const [previewOpenTokenV76, setPreviewOpenTokenV76] = useState(0);\n';
const previewStateCount = source.split(previewState).length - 1;
if (previewStateCount < 2) throw new Error(`Process reference v76: expected preview state in selector/display, found ${previewStateCount}`);
source = source.split(previewState).join(previewStateWithToken);

const previewButton = 'onClick={() => setPreviewMeta(meta)}';
const previewButtonCount = source.split(previewButton).length - 1;
if (previewButtonCount < 2) throw new Error(`Process reference v76: expected preview buttons, found ${previewButtonCount}`);
source = source.split(previewButton).join('onClick={() => { setPreviewMeta(meta); setPreviewOpenTokenV76((value) => value + 1); }}');

const selectorModalCall = '<ProcessSlideModalV68 meta={previewMeta} items={parsedRefs} onNavigate={setPreviewMeta} onClose={() => setPreviewMeta(null)} />';
if (!source.includes(selectorModalCall)) throw new Error("Process reference v76: selector modal call missing");
source = source.replace(selectorModalCall, '<ProcessSlideModalV68 meta={previewMeta} items={parsedRefs} openToken={previewOpenTokenV76} onNavigate={setPreviewMeta} onClose={() => setPreviewMeta(null)} />');

const displayModalCall = '<ProcessSlideModalV68 meta={previewMeta} items={refs} onNavigate={(next) => setPreviewMeta(next)} onClose={() => setPreviewMeta(null)} />';
if (!source.includes(displayModalCall)) throw new Error("Process reference v76: display modal call missing");
source = source.replace(displayModalCall, '<ProcessSlideModalV68 meta={previewMeta} items={refs} openToken={previewOpenTokenV76} onNavigate={(next) => setPreviewMeta(next)} onClose={() => setPreviewMeta(null)} />');

if (!source.includes('lazyMedia: true,') || !source.includes('lazySlides: true,')) {
  throw new Error("Process reference v76: PPTX lazy rendering options missing");
}
source = source.replace('lazyMedia: true,', 'lazyMedia: false,');
source = source.replace('lazySlides: true,', 'lazySlides: false,');
source = source.replace('          pdfjs: false,\n', '');

fs.writeFileSync(file, source);
console.log("Applied viewport-pinned minimized bar, reopen-on-view, and eager PPTX media rendering v76");
await import("./patch-process-reference-ui-v77.mjs");
