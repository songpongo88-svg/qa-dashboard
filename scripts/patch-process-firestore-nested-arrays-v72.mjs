import fs from "node:fs";

function patchEvaluateOrganizationUi() {
  const evaluatePatchFile = "scripts/patch-evaluate-workspace-v72.mjs";
  let evaluatePatch = fs.readFileSync(evaluatePatchFile, "utf8");

  const replacements = [
    [
      'className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3.5 text-xs font-black text-emerald-800 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-md disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:hover:translate-y-0 disabled:hover:shadow-sm"',
      'className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#A9C5D5] bg-[#F3F8FB] px-3.5 text-xs font-black text-[#155B83] shadow-sm transition hover:-translate-y-0.5 hover:border-[#155B83] hover:bg-[#E5F0F5] hover:text-[#104A6B] hover:shadow-md disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:hover:translate-y-0 disabled:hover:shadow-sm"',
    ],
    [
      'className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-black text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 hover:shadow-md"',
      'className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#A9C5D5] bg-[#F3F8FB] px-3.5 text-xs font-black text-[#155B83] shadow-sm transition hover:-translate-y-0.5 hover:border-[#155B83] hover:bg-[#E5F0F5] hover:text-[#104A6B] hover:shadow-md"',
    ],
    [
      'className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-black text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 hover:shadow-md disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:hover:translate-y-0 disabled:hover:shadow-sm"',
      'className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#A9C5D5] bg-[#F3F8FB] px-3.5 text-xs font-black text-[#155B83] shadow-sm transition hover:-translate-y-0.5 hover:border-[#155B83] hover:bg-[#E5F0F5] hover:text-[#104A6B] hover:shadow-md disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:hover:translate-y-0 disabled:hover:shadow-sm"',
    ],
    [
      'className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] text-white"',
      'className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-[#D4B945] px-1.5 py-0.5 text-[10px] text-[#173B55]"',
    ],
    [
      'className="inline-flex h-10 items-center gap-2 rounded-xl border border-rose-200 bg-white px-3.5 text-xs font-black text-rose-700 shadow-sm transition hover:-translate-y-0.5 hover:border-rose-300 hover:bg-rose-50 hover:shadow-md"',
      'className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#D4B945] bg-[#FFFDF4] px-3.5 text-xs font-black text-[#806B18] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#FBF4D5] hover:text-[#66540F] hover:shadow-md"',
    ],
    [
      'className="inline-flex h-10 items-center gap-2 rounded-xl border border-amber-200 bg-white px-3.5 text-xs font-black text-amber-800 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-50 hover:shadow-md"',
      'className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#D4B945] bg-[#FFFDF4] px-3.5 text-xs font-black text-[#806B18] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#FBF4D5] hover:text-[#66540F] hover:shadow-md"',
    ],
    [
      'className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-black text-white shadow-[0_8px_20px_rgba(4,120,87,0.22)] transition hover:-translate-y-0.5 hover:bg-emerald-800 hover:shadow-[0_10px_24px_rgba(4,120,87,0.28)] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none disabled:hover:translate-y-0"',
      'className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-[#155B83] to-[#6F8B67] px-4 text-xs font-black text-white shadow-[0_8px_20px_rgba(21,91,131,0.24)] transition hover:-translate-y-0.5 hover:brightness-95 hover:shadow-[0_10px_24px_rgba(21,91,131,0.30)] disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:text-slate-600 disabled:shadow-none disabled:hover:translate-y-0 disabled:hover:brightness-100"',
    ],
    [
      '<div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Workspace Actions</div>',
      '<div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#155B83]">Workspace Actions</div>',
    ],
  ];

  replacements.forEach(([from, to]) => {
    evaluatePatch = evaluatePatch.split(from).join(to);
  });
  fs.writeFileSync(evaluatePatchFile, evaluatePatch);

  const richTextFile = "src/richText.tsx";
  let richTextSource = fs.readFileSync(richTextFile, "utf8");
  if (!richTextSource.includes('[[1, 1], [2, 2], [3, 3], [4, 4]]')) {
    if (!richTextSource.includes('[[2, 2], [3, 3], [4, 4]]')) {
      throw new Error("Rich text table size options anchor not found");
    }
    richTextSource = richTextSource.replace(
      '[[2, 2], [3, 3], [4, 4]]',
      '[[1, 1], [2, 2], [3, 3], [4, 4]]',
    );
    richTextSource = richTextSource.replace(
      'className="grid grid-cols-3 gap-1"',
      'className="grid grid-cols-2 gap-1"',
    );
    fs.writeFileSync(richTextFile, richTextSource);
  }

  console.log("Applied organization action palette and Rich Text 1x1 table option");
}

patchEvaluateOrganizationUi();

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
await import("./patch-process-reference-ui-v73.mjs");
