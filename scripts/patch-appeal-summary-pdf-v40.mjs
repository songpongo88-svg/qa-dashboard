import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appealPath = path.join(root, "src", "AppealMockup.tsx");
const marker = "appeal-summary-pdf-v40";

let source = fs.readFileSync(appealPath, "utf8");

if (!source.includes(`// ${marker}`)) {
  const oldImport = `import { generateOfficialCaseDetailPdf } from "./caseDetailOfficialPdf";`;
  const newImport = `import { generateAppealSummaryPdf } from "./appealSummaryPdf";\n// ${marker}`;

  if (!source.includes(oldImport)) {
    throw new Error("Appeal Summary PDF v40 import anchor not found.");
  }
  source = source.replace(oldImport, newImport);

  const startToken = `  const handleGeneratePdf = async () => {`;
  const start = source.indexOf(startToken);
  if (start < 0) {
    throw new Error("Appeal Summary PDF v40 handleGeneratePdf start not found.");
  }

  const errorAnchor = `console.error("Generate Appeal PDF failed", error);`;
  const errorIndex = source.indexOf(errorAnchor, start);
  if (errorIndex < 0) {
    throw new Error("Appeal Summary PDF v40 error anchor not found.");
  }

  const endToken = `\n  };`;
  const endStart = source.indexOf(endToken, errorIndex);
  if (endStart < 0) {
    throw new Error("Appeal Summary PDF v40 handleGeneratePdf end not found.");
  }
  const end = endStart + endToken.length;

  const newBlock = `  const handleGeneratePdf = async () => {
    if (!selectedCase || !selectedRevision) {
      setPdfStatus("error");
      setPdfMessage("กรุณาเลือกเคสก่อนสร้าง Appeal PDF");
      return;
    }

    setPdfStatus("generating");
    setPdfMessage("กำลังสร้าง Appeal PDF...");

    try {
      const originalGrade = scoreToGrade(selectedRevision.previousScore, selectedCase.monthKey);
      const finalGrade = scoreToGrade(selectedRevision.finalScore, selectedCase.monthKey);

      const appealedTopics = selectedRevision.appealedTopics.map((topic) => ({
        code: String(topic.code || "").trim(),
        label: String(topic.label || "").trim(),
        max: Number(topic.max || 0),
        originalScore: Number(topic.originalScore ?? topic.score ?? 0),
        finalScore: Number(topic.score ?? topic.originalScore ?? 0),
        originalComment: String(topic.originalComment || "").trim(),
        appealReason: String(topic.appealReason || "").trim(),
        reviewComment: String(
          selectedRevision.appealDecision === "Rejected"
            ? topic.rejectReason || topic.comment || ""
            : topic.comment || ""
        ).trim(),
      }));

      const generated = await generateAppealSummaryPdf({
        caseId: selectedCase.caseId,
        agent: selectedCase.agent,
        monthLabel: formatMonthKeyLabel(selectedCase.monthKey),
        caseDate: selectedCase.auditDate,
        inquiry: selectedCase.inquiry,
        appealSubmitDateTime: selectedRevision.appealSubmitDateTime,
        appealResultDateTime: selectedRevision.appealResultDateTime,
        appealDecision: selectedRevision.appealDecision,
        appealRound: selectedRevision.appealRound,
        reviewSummary: selectedRevision.appealReviewSummary,
        previousScore: selectedRevision.previousScore,
        finalScore: selectedRevision.finalScore,
        originalGrade,
        finalGrade,
        appealedTopics,
      });

      downloadGeneratedAppealPdf(generated.blob, generated.fileName);
      onGeneratePdf?.(selectedCase.caseId, selectedCase.agent, "appeal");

      setPdfStatus("success");
      setPdfMessage(\`สร้าง \${generated.fileName} เรียบร้อยแล้ว\`);
    } catch (error) {
      console.error("Generate Appeal PDF failed", error);
      setPdfStatus("error");
      setPdfMessage(
        error instanceof Error
          ? \`สร้าง Appeal PDF ไม่สำเร็จ: \${error.message}\`
          : "สร้าง Appeal PDF ไม่สำเร็จ กรุณาลองใหม่"
      );
    }
  };`;

  source = source.slice(0, start) + newBlock + source.slice(end);
  fs.writeFileSync(appealPath, source, "utf8");
}

console.log("Patched Generate Appeal PDF to create a dedicated compact Appeal Summary containing only appealed topics and appeal-specific review details.");
