import fs from "node:fs";

const rendererPath = "src/finalSignedPdfRenderer.ts";
const finalPath = "src/finalSignedCasePdf.ts";
const bulkPath = "src/bulkCaseDetailPdf.ts";
const marker = "bulk-case-pdf-section-order-v14";

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Bulk PDF v14 missing anchor: ${label}`);
  }
  return source.replace(before, after);
}

function patchRenderer() {
  let source = fs.readFileSync(rendererPath, "utf8");
  if (source.includes(`// ${marker}-renderer`)) return;

  source = replaceRequired(
    source,
    `  appendPage = false,
  generatedAt = new Date().toISOString(),
}: {`,
    `  appendPage = false,
  generatedAt = new Date().toISOString(),
  renderMode = "full",
}: {`,
    "renderer arguments"
  );

  source = replaceRequired(
    source,
    `  appendPage?: boolean;
  generatedAt?: string;
}) {`,
    `  appendPage?: boolean;
  generatedAt?: string;
  renderMode?: "full" | "summary" | "acknowledgement";
}) {`,
    "renderer type"
  );

  source = replaceRequired(source,
    `  const coachingRecord = coachingEnabled\n`,
    `  const coachingRecord = coachingEnabled && renderMode !== "acknowledgement"\n`,
    "coaching lookup only during summary"
  );
  source = replaceRequired(source,
    `  const topicReserve = coachingEnabled ? 0 : acknowledgementH;`,
    `  const topicReserve = renderMode === "full" && !coachingRecord ? acknowledgementH : 0;`,
    "reserve signature space without coaching"
  );
  source = replaceRequired(source,
    `  if (coachingEnabled) {\n`,
    `  if (coachingEnabled && coachingRecord) {\n`,
    "omit empty coaching page"
  );
  source = replaceRequired(source,
    `    // Acknowledgement / Signature always starts after all Coaching content.\n    pdf.addPage("a4", "portrait");\n    y = 10;`,
    `    // Only a full report needs an acknowledgement page here. Bulk summary\n    // mode must end on Coaching, without leaving an empty page before cases.\n    if (renderMode === "full") {\n      pdf.addPage("a4", "portrait");\n      y = 10;\n    }`,
    "no empty acknowledgement page in summary"
  );

  source = replaceRequired(
    source,
    `  drawHeader(
    "Monthly QA Dashboard",`,
    `  // ${marker}-renderer
  // Bulk monthly export can render the summary/coaching first and defer the
  // unchanged acknowledgement page until after all Case Detail pages.
  if (renderMode !== "acknowledgement") {
  drawHeader(
    "Monthly QA Dashboard",`,
    "dashboard start"
  );

  source = replaceRequired(
    source,
    `  }

  // The acknowledgement is always the final section.
  drawSection("Acknowledgement / Signature");`,
    `  }
  }

  if (renderMode !== "summary") {
  // The acknowledgement keeps the existing layout; only its position changes
  // in the bulk monthly export.
  drawSection("Acknowledgement / Signature");`,
    "acknowledgement start"
  );

  source = replaceRequired(
    source,
    `  const safeAgentFileName =`,
    `  }
  
  const safeAgentFileName =`,
    "acknowledgement end"
  );

  fs.writeFileSync(rendererPath, source, "utf8");
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
  renderMode = "full",
  source: providedSource,
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
  renderMode?: "full" | "summary" | "acknowledgement";
  source?: FinalSignedPdfSource;
  onSourceLoaded?: (source: FinalSignedPdfSource) => void;
}) {
  // ${marker}-adapter
  // September introduced Coaching. Preserve the original Jan-August cover.
  if (monthKey < "2026-09") {
    if (renderMode === "acknowledgement") return false;
    renderMode = "full";
  }`,
    "adapter type"
  );

  source = replaceRequired(source,
    `    const finalSource = await loadSignatureCenterFinalSignedSource(monthKey, agentName);\n    if (!finalSource) return false;`,
    `    const finalSource = providedSource || await loadSignatureCenterFinalSignedSource(monthKey, agentName, [], allMonthRows);\n    if (!finalSource) return false;\n    onSourceLoaded?.(finalSource);`,
    "reuse one source for summary, case order and signatures"
  );

  source = source.replaceAll(
    `      appendPage,
    });`,
    `      appendPage,
      renderMode,
    });`
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
      renderMode: "summary",
      onSourceLoaded: (source) => { monthlySource = source; },
    });
    // ${marker}-bulk
    // Required order per Agent:
    // Monthly QA Dashboard -> Monthly Coaching -> Case Detail -> Acknowledgement / Signature.
    if (appended) hasWrittenContent = true;`,
    "summary render mode"
  );

  source = replaceRequired(source,
    `    for (const sourceCase of groupCases) {`,
    `    const orderedGroupCases = monthKey >= "2026-09"\n      ? orderCasesByMonthlyList(groupCases, monthlySource?.document.cases || [])\n      : groupCases;\n\n    for (const sourceCase of orderedGroupCases) {`,
    "cases follow the displayed monthly sequence"
  );

  source = replaceRequired(
    source,
    `      if (completedCases % 8 === 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
    }
  }

`,
    `      if (completedCases % 8 === 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
    }

    // Reuse the exact same Signature renderer and stored signer data, but append
    // it only after every Case Detail page for this Agent.
    const acknowledgementAppended = await appendFinalSignedReportForAgent({
      doc,
      cases: group.cases,
      monthKey,
      agentName: group.agentName,
      storedDocument: signatureDocument,
      allMonthRows: referenceMonthRows,
      appendPage: hasWrittenContent,
      renderMode: "acknowledgement",
      source: monthlySource,
    });
    if (acknowledgementAppended) hasWrittenContent = true;
  }

`,
    "acknowledgement after cases"
  );

  fs.writeFileSync(bulkPath, source, "utf8");
}

patchRenderer();
patchFinalAdapter();
patchBulkOrder();
console.log("Bulk monthly PDF order v14 applied: Dashboard -> Coaching -> Case Detail -> Acknowledgement/Signature.");
