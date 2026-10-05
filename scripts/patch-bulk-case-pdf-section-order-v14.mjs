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

  source = replaceRequired(
    source,
    `  allMonthRows,
  appendPage,
}: {`,
    `  allMonthRows,
  appendPage,
  renderMode = "full",
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
}) {
  // ${marker}-adapter`,
    "adapter type"
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

  source = replaceRequired(
    source,
    `      allMonthRows: referenceMonthRows,
      appendPage: hasWrittenContent,
    });
    if (appended) hasWrittenContent = true;`,
    `      allMonthRows: referenceMonthRows,
      appendPage: hasWrittenContent,
      renderMode: "summary",
    });
    // ${marker}-bulk
    // Required order per Agent:
    // Monthly QA Dashboard -> Monthly Coaching -> Case Detail -> Acknowledgement / Signature.
    if (appended) hasWrittenContent = true;`,
    "summary render mode"
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
