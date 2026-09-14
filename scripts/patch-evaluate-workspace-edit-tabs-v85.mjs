import fs from "node:fs";

const file = "src/CreateEvaluationMockup.tsx";
let source = fs.readFileSync(file, "utf8");

// The legacy workspace patch expects the original cancel handler. Restore that shape
// temporarily, let v72 rebuild the action bar, then re-apply dedicated Edit-tab behavior.
if (source.includes("// evaluate-dedicated-edit-memory-v85b") && !source.includes("// evaluate-workspace-actions-v72")) {
  const cancelPattern = /  function cancelSubmittedEdit\(\) \{[\s\S]*?\n  \}\n/;
  if (!cancelPattern.test(source)) throw new Error("v85 Evaluate wrapper: cancel handler not found before v72");
  source = source.replace(cancelPattern, `  function cancelSubmittedEdit() {
    const editingCaseId = caseId || "current case";
    setActiveSubmittedRecordId("");
    setSubmitPreview(null);
    setWorkspaceView("report");
    setDraftMessage(\`Edit cancelled for \${editingCaseId}. No changes were saved.\`);
  }
`);
  fs.writeFileSync(file, source);
}

await import("./patch-evaluate-workspace-v72.mjs");

source = fs.readFileSync(file, "utf8");
if (source.includes("// evaluate-dedicated-edit-memory-v85b") && !source.includes("// evaluate-edit-tab-cancel-v85")) {
  const cancelPattern = /  function cancelSubmittedEdit\(\) \{[\s\S]*?\n  \}\n\n  function clearCurrentEvaluation/;
  if (!cancelPattern.test(source)) throw new Error("v85 Evaluate wrapper: v72 cancel handler not found after patch");
  source = source.replace(cancelPattern, `  function cancelSubmittedEdit() {
    const editingCaseId = caseId || "current case";
    const ok = window.confirm("ยกเลิกการแก้ไขเคส " + editingCaseId + " หรือไม่?\\n\\nข้อมูลที่แก้ไขแต่ยังไม่ได้บันทึกจะถูกยกเลิก");
    if (!ok) return;
    if (isDedicatedEditWorkspaceV85b) {
      setActiveSubmittedRecordId("");
      setSubmitPreview(null);
      setDraftMessage(\`Edit cancelled for \${editingCaseId}. No changes were saved.\`);
      onCancelEdit?.();
      return;
    }
    resetEvaluationForm();
    setSubmitPreview(null);
    setWorkspaceView("form");
    setDraftMessage("");
  }

  // evaluate-edit-tab-cancel-v85
  function clearCurrentEvaluation`);
  fs.writeFileSync(file, source);
  console.log("Applied dedicated Edit-tab Cancel behavior after Evaluate workspace v72");
}

// Add browser-wide Capture Evidence bridge after the Evaluate workspace has reached
// its final build-time shape, so the Section B controls are patched only once.
await import("./patch-evidence-browser-capture-v96.mjs");

// Normalize the legacy Appeal timestamp anchors before applying the latest evaluation timestamp logic.
await import("./patch-evaluation-last-updated-v87-compat.mjs");

// Preserve the original Audit Date timestamp and expose only the latest Last Updated timestamp.
try {
  await import("./patch-evaluation-last-updated-v87.mjs");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.includes("missing Appeal PDF Last Updated row")) throw error;
  console.log("Merged Appeal PDF uses the main Case Detail header; applying Last Updated fallback there.");
  await import("./patch-evaluation-last-updated-v87-pdf-fallback.mjs");
}

// Recover legacy edit timestamps only when the stored record itself proves an edit occurred.
await import("./patch-evaluation-last-updated-v88-safety.mjs");

// Final display parity: PDF shares Audit Date cell, dashboard has no comma, and Selected Case shows Last Updated.
await import("./patch-evaluation-last-updated-v89-layout.mjs");
