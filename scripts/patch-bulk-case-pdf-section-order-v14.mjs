import fs from "node:fs";

const finalPath = "src/finalSignedCasePdf.ts";
const bulkPath = "src/bulkCaseDetailPdf.ts";
const marker = "bulk-case-pdf-section-order-v14";

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Bulk PDF v14 missing anchor: ${label}`);
  }
  return source.replace(before, after);
}

function patchFinalAdapter() {
  let source = fs.readFileSync(finalPath, "utf8");
  if (source.includes(`// ${marker}-adapter`)) return;

  source = replaceRequired(source,
    `type FinalSignedEntry, type FinalSignedRole }`,
    `type FinalSignedEntry, type FinalSignedRole, type FinalSignedPdfSource }`,
    "adapter source type import"
  );

  source = replaceRequired(
    source,
    `  allMonthRows,
  appendPage,
}: {`,
    `  allMonthRows,
  appendPage,
  onSourceLoaded,
}: {`,
    "adapter arguments"
  );

  source = replaceRequired(
    source,
    `  allMonthRows: StoredSignatureDocument[];
  appendPage: boolean;
}) {`,
    `  allMonthRows: StoredSignatureDocument[];
  appendPage: boolean;
  onSourceLoaded?: (source: FinalSignedPdfSource) => void;
}) {
  // ${marker}-adapter`,
    "adapter type"
  );

  source = replaceRequired(source,
    `    const finalSource = await loadSignatureCenterFinalSignedSource(monthKey, agentName);\n    if (!finalSource) return false;`,
    `    const finalSource = await loadSignatureCenterFinalSignedSource(monthKey, agentName, [], allMonthRows);\n    if (!finalSource) return false;\n    onSourceLoaded?.(finalSource);`,
    "use one source for the complete monthly cover and case order"
  );

  fs.writeFileSync(finalPath, source, "utf8");
}

function patchBulkOrder() {
  let source = fs.readFileSync(bulkPath, "utf8");
  if (source.includes(`// ${marker}-bulk`)) return;

  source = replaceRequired(source,
    `import { canonicalAgentIdentityKey } from "./lib/agentIdentity";`,
    `import { canonicalAgentIdentityKey } from "./lib/agentIdentity";\nimport { orderCasesByMonthlyList } from "./lib/monthlyPdfExport";\nimport type { FinalSignedPdfSource } from "./finalSignedPdfRenderer";`,
    "bulk source imports"
  );
  source = replaceRequired(source,
    `  const { index: finalSignedIndex, allMonthRows } = await loadFinalSignedDocumentIndex(monthKey).catch((error) => {\n    console.warn("Load Final Signed PDF data failed", error);\n    return { index: new Map(), allMonthRows: [] };\n  });`,
    `  const { index: finalSignedIndex, allMonthRows } = await loadFinalSignedDocumentIndex(monthKey);`,
    "stop export when saved signatures cannot be read"
  );
  source = replaceRequired(source,
    `  for (const group of groups) {`,
    `  for (const group of groups) {\n    let monthlySource: FinalSignedPdfSource | undefined;`,
    "per-agent source snapshot"
  );

  source = replaceRequired(
    source,
    `      allMonthRows: referenceMonthRows,
      appendPage: hasWrittenContent,
    });
    if (appended) hasWrittenContent = true;`,
    `      allMonthRows: referenceMonthRows,
      appendPage: hasWrittenContent,
      onSourceLoaded: (source) => { monthlySource = source; },
    });
    // ${marker}-bulk
    // Required order per Agent:
    // Monthly QA Dashboard with signatures -> Monthly Coaching -> Case Detail.
    if (appended) hasWrittenContent = true;`,
    "complete monthly cover before coaching and cases"
  );

  source = replaceRequired(source,
    `    for (const sourceCase of groupCases) {`,
    `    const orderedGroupCases = monthKey >= "2026-09"\n      ? orderCasesByMonthlyList(groupCases, monthlySource?.document.cases || [])\n      : groupCases;\n\n    for (const sourceCase of orderedGroupCases) {`,
    "cases follow the displayed monthly sequence"
  );

  fs.writeFileSync(bulkPath, source, "utf8");
}

patchFinalAdapter();
patchBulkOrder();
console.log("Bulk monthly PDF order v14 applied: Dashboard with signatures -> Coaching -> Case Detail.");
