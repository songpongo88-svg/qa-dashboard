import fs from "node:fs";

const file = "src/CreateEvaluationMockup.tsx";
let source = fs.readFileSync(file, "utf8");
const marker = "// evaluate-v83-pre-v72-compat";

if (!source.includes(marker)) {
  const sourceMarker = "// evaluate-internal-edit-tab-v83\n";
  if (!source.includes(sourceMarker)) throw new Error("v83 compatibility requires internal edit patch first");
  source = source.replace(sourceMarker, sourceMarker + marker + "\n");

  const patched = `  function cancelSubmittedEdit() {
    const editingCaseId = caseId || "current case";
    setActiveSubmittedRecordId("");
    setSubmitPreview(null);
    setWorkspaceView("report");
    setDraftMessage(\`Edit cancelled for \${editingCaseId}. No changes were saved.\`);
    directEditHandledRefV82.current = "";
  }
`;
  const original = `  function cancelSubmittedEdit() {
    const editingCaseId = caseId || "current case";
    setActiveSubmittedRecordId("");
    setSubmitPreview(null);
    setWorkspaceView("report");
    setDraftMessage(\`Edit cancelled for \${editingCaseId}. No changes were saved.\`);
  }
`;
  if (!source.includes(patched)) throw new Error("v83 compatibility could not find patched cancel handler");
  source = source.replace(patched, original);
  fs.writeFileSync(file, source);
  console.log("Restored Evaluate cancel anchor for workspace v72 compatibility");
} else {
  console.log("Evaluate v83/v72 compatibility already applied");
}
