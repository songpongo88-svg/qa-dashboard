import fs from "node:fs";

const file = "src/processLibrary.tsx";
let source = fs.readFileSync(file, "utf8");
const marker = "// process-reference-centered-large-viewer-v75";

if (source.includes(marker)) {
  console.log("Process reference centered large viewer v75 already applied");
  process.exit(0);
}

if (!source.includes("// process-reference-floating-viewer-v74")) {
  throw new Error("Process reference centered large viewer v75 requires v74 first");
}

const replaceRegex = (pattern, to, label) => {
  if (!pattern.test(source)) throw new Error(`Process reference viewer v75: missing ${label}`);
  source = source.replace(pattern, to);
};

source = source.replace(
  "// process-reference-floating-viewer-v74\n",
  "// process-reference-floating-viewer-v74\n" + marker + "\n",
);

replaceRegex(
  /  const viewportFrame = \(\) => \{[\s\S]*?\n  \};\n\n  useEffect\(\(\) => \{/,
`  const viewportFrame = () => {
    const viewportWidth = Math.max(360, window.innerWidth);
    const viewportHeight = Math.max(420, window.innerHeight);
    const horizontalMargin = viewportWidth >= 900 ? 48 : 24;
    const verticalMargin = viewportHeight >= 700 ? 48 : 24;
    const width = Math.max(420, Math.min(1500, viewportWidth - horizontalMargin));
    const height = Math.max(360, Math.min(920, viewportHeight - verticalMargin));
    const left = Math.max(8, Math.round((viewportWidth - width) / 2));
    const top = Math.max(8, Math.round((viewportHeight - height) / 2));
    return { left, top, width, height };
  };

  useEffect(() => {`,
  "centered initial viewer frame",
);

replaceRegex(
  /<div className="fixed bottom-5 right-5 z-\[260\] flex max-w-\[min\(92vw,620px\)\] items-center gap-3 rounded-2xl border border-sky-200 bg-white px-3 py-2\.5 shadow-\[0_18px_55px_rgba\(15,23,42,0\.25\)\]">/,
  '<div className="fixed bottom-6 right-6 z-[9999] flex w-[min(620px,calc(100vw-32px))] items-center gap-3 rounded-2xl border-2 border-[#155B83] bg-white px-4 py-3 shadow-[0_24px_80px_rgba(15,23,42,0.38)] ring-4 ring-white/90">',
  "minimized viewer visibility",
);

source = source.replace(
  '<div className="text-[9px] font-black uppercase tracking-[0.18em] text-[#155B83]">Process Slide · ย่ออยู่</div>',
  '<div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#155B83]">Process Slide · ย่อหน้าต่างอยู่</div>',
);

fs.writeFileSync(file, source);
console.log("Applied centered, larger initial Process Slide viewer and high-visibility minimized bar v75");
