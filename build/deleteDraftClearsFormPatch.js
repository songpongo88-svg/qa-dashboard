export function deleteDraftClearsFormPatch() {
  return {
    name: "delete-draft-clears-form",
    enforce: "pre",
    transform(code, id) {
      const normalized = id.replace(/\\/g, "/");
      if (!normalized.endsWith("/src/CreateEvaluationMockup.tsx")) return null;

      const original = code;
      const oldBlock = `  function deleteDraft(draftId: string) {
    const nextDrafts = draftInbox.filter((draft) => (draft.draftId || makeDraftId(draft.caseId, draft.auditDate)) !== draftId);
    persistDrafts(nextDrafts);
    if (activeDraftId === draftId) {
      setActiveDraftId("");
      setDraftSavedAt("");
    }
    setDraftMessage("Draft deleted. The current form stays open until you start another draft.");
  }`;

      const newBlock = `  function deleteDraft(draftId: string) {
    const nextDrafts = draftInbox.filter((draft) => (draft.draftId || makeDraftId(draft.caseId, draft.auditDate)) !== draftId);
    const deletingCurrentDraft =
      activeDraftId === draftId ||
      (!activeSubmittedRecordId && makeDraftId(caseId, auditDate) === draftId);

    persistDrafts(nextDrafts);

    if (deletingCurrentDraft) {
      // Delete means delete: remove the saved draft and clear the same case from the live form.
      resetEvaluationForm();
      setWorkspaceView("form");
      setDraftMessage("Draft deleted.");
      return;
    }

    setDraftMessage("Draft deleted.");
  }`;

      if (!code.includes(oldBlock)) {
        throw new Error("Delete Draft patch failed: expected deleteDraft block was not found");
      }

      const next = code.replace(oldBlock, newBlock);

      if (!next.includes("const deletingCurrentDraft =")) {
        throw new Error("Delete Draft patch failed: current-draft detection was not installed");
      }
      if (!next.includes('resetEvaluationForm();\n      setWorkspaceView("form");')) {
        throw new Error("Delete Draft patch failed: active form reset was not installed");
      }
      if (next.includes("The current form stays open until you start another draft.")) {
        throw new Error("Delete Draft patch failed: legacy keep-form behavior is still present");
      }

      return next === original ? null : { code: next, map: null };
    },
  };
}
