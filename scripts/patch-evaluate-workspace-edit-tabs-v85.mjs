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

// Run Signature PDF geometry last. Several earlier build patches also rewrite
// SignatureCenterMockup.tsx, so the centering correction must be applied after
// every other prebuild transform to prevent the old +3.5 mm date offset returning.
await import("./patch-signature-date-center-final-v93.mjs");
await import("./patch-signature-date-plain-center-v94.mjs");
await import("./patch-signature-date-axis-v95.mjs");

// Add browser-wide Capture Evidence bridge after the Evaluate workspace has reached
// its final build-time shape, so the Section B controls are patched only once.
await import("./patch-evidence-browser-capture-v96.mjs");

// Put Agent, Senior, Supervisor, and QA signature panels on one landscape row.
await import("./patch-signature-four-column-landscape-v98.mjs");
// Keep only the signed date/time value on the true center axis of each landscape panel.
await import("./patch-signature-landscape-date-axis-v99.mjs");
