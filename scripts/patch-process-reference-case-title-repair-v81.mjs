import fs from "node:fs";

const processFile = "src/processLibrary.tsx";
let source = fs.readFileSync(processFile, "utf8");
const marker = "// process-reference-case-title-repair-v81";

if (!source.includes(marker)) {
  if (!source.includes("// process-reference-picker-preview-title-sync-v80")) {
    throw new Error("Process reference v81 requires v80 first");
  }

  source = source.replace(
    "// process-reference-picker-preview-title-sync-v80\n",
    "// process-reference-picker-preview-title-sync-v80\n" + marker + "\n",
  );

  const importAnchor = 'import { RichTextContent } from "./richText";\n';
  if (!source.includes(importAnchor)) throw new Error("Process reference v81: RichText import anchor missing");
  source = source.replace(
    importAnchor,
    importAnchor + 'import { fetchStoredEvaluations } from "./evaluationStore";\n',
  );

  const backfillAnchor = `    void batch.commit().catch((error) => console.error("Backfill custom Process slide titles failed", error));
  }, [historical, active.id, active.slideCount, active.slideTitles, parsedRefs]);
`;
  if (!source.includes(backfillAnchor)) throw new Error("Process reference v81: v80 backfill anchor missing");

  const repairEffect = `

  // Repair titles from the submitted cases that originally introduced the custom names.
  // Their Process Reference keeps the QA-entered title in Step, even when the Process Version
  // itself still contains the title automatically extracted from PowerPoint.
  useEffect(() => {
    if (historical || !active.id) return;
    let cancelled = false;

    void fetchStoredEvaluations(1000)
      .then((records) => {
        if (cancelled) return;
        const repairCaseIds = new Set(["AA297049", "AA298679"]);
        const recovered = new Map<number, string>();

        // fetchStoredEvaluations returns newest records first. Keep the newest custom title
        // when an edited case has more than one stored revision.
        records.forEach((record) => {
          const caseId = String(record.caseId || "").trim().toUpperCase();
          if (!repairCaseIds.has(caseId) || !record.processReference) return;
          parseProcessReferenceListV68(record.processReference).forEach((item) => {
            if (item.versionId !== active.id) return;
            if (recovered.has(item.slideNumber)) return;
            const customTitle = item.step && item.step !== "ทั้งสไลด์" ? String(item.step).trim() : "";
            if (!customTitle) return;
            recovered.set(item.slideNumber, customTitle);
          });
        });

        if (!recovered.size) return;
        const nextTitles = [...active.slideTitles];
        while (nextTitles.length < active.slideCount) nextTitles.push("Slide " + (nextTitles.length + 1));
        let changed = false;
        recovered.forEach((title, slideNumber) => {
          const index = slideNumber - 1;
          if (index < 0 || index >= active.slideCount || nextTitles[index] === title) return;
          nextTitles[index] = title;
          changed = true;
        });
        if (!changed) return;

        setCurrent((row) => row.id === active.id ? { ...row, slideTitles: nextTitles } : row);
        const services = firebaseServices();
        if (!services) return;
        const batch = writeBatch(services.db);
        batch.set(doc(services.db, PROCESS_COLLECTION, active.id), {
          slideTitles: nextTitles,
          customTitleRepairCases: ["AA297049", "AA298679"],
          customTitleRepairUpdatedAt: new Date().toISOString(),
        }, { merge: true });
        void batch.commit().catch((error) => console.error("Repair Process titles from submitted cases failed", error));
      })
      .catch((error) => console.error("Load submitted cases for Process title repair failed", error));

    return () => { cancelled = true; };
  }, [historical, active.id]);
`;

  source = source.replace(backfillAnchor, backfillAnchor + repairEffect);
  fs.writeFileSync(processFile, source);
  console.log("Applied submitted-case Process title repair for AA297049 and AA298679 v81");
} else {
  console.log("Process submitted-case title repair v81 already applied");
}

await import("./patch-case-tabs-edit-slide-viewer-v82.mjs");
await import("./patch-internal-tabs-slide-fidelity-v83.mjs");
await import("./patch-v83-pre-evaluate-workspace-compat.mjs");
await import("./patch-process-svg-preview-v84.mjs");
await import("./patch-process-multifile-v84.mjs");
await import("./patch-process-pdf-parity-v84.mjs");
