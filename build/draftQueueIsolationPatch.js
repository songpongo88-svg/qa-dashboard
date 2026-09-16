export function draftQueueIsolationPatch() {
  return {
    name: "draft-queue-isolation",
    enforce: "pre",
    transform(code, id) {
      const normalized = id.replace(/\\/g, "/");
      if (!normalized.endsWith("/src/CreateEvaluationMockup.tsx")) return null;

      const original = code;
      let next = code;

      next = next.replace(
        `  useEffect(() => {\n    if (restoredEvaluateTabMemoryRef.current) return;\n    const rawDrafts = window.localStorage.getItem(DRAFT_STORAGE_KEY);`,
        `  useEffect(() => {\n    const rawDrafts = window.localStorage.getItem(DRAFT_STORAGE_KEY);`
      );

      next = next.replace(
        `        setDraftInbox([legacyDraft]);\n        loadDraftIntoForm(legacyDraft);\n        return;`,
        `        setDraftInbox([legacyDraft]);\n        return;`
      );

      next = next.replace(
        `      const normalizedDrafts = sortDrafts(drafts.map(normalizeDraft));\n      setDraftInbox(normalizedDrafts);\n      if (normalizedDrafts[0]) loadDraftIntoForm(normalizedDrafts[0]);`,
        `      const normalizedDrafts = sortDrafts(drafts.map(normalizeDraft));\n      setDraftInbox(normalizedDrafts);`
      );

      const draftHeader = `                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-sky-100">Saved Drafts</div>\n                <div className="mt-1 text-xl font-black">Saved Draft Cases</div>\n              </div>\n              <button type="button" onClick={() => setWorkspaceView("form")} className="rounded-xl border border-white/35 bg-white/10 px-4 py-2 text-sm font-black text-white transition hover:bg-white/20">`;
      const draftHeaderReplacement = `                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-sky-100">Saved Drafts</div>\n                <div className="mt-1 text-xl font-black">Saved Draft Cases</div>\n              </div>\n              <button type="button" onClick={() => { resetEvaluationForm(); setWorkspaceView("form"); }} className="rounded-xl border border-white/35 bg-white/10 px-4 py-2 text-sm font-black text-white transition hover:bg-white/20">`;
      next = next.replace(draftHeader, draftHeaderReplacement);

      if (next.includes("if (restoredEvaluateTabMemoryRef.current) return;")) {
        throw new Error("Draft Queue isolation patch failed: tab memory still blocks draft loading");
      }
      if (next.includes("if (normalizedDrafts[0]) loadDraftIntoForm(normalizedDrafts[0]);")) {
        throw new Error("Draft Queue isolation patch failed: latest draft still auto-loads into form");
      }
      if (!next.includes('onClick={() => { resetEvaluationForm(); setWorkspaceView("form"); }}')) {
        throw new Error("Draft Queue isolation patch failed: Back to Form does not reset the form");
      }
      if (next === original) {
        throw new Error("Draft Queue isolation patch failed: no source changes were applied");
      }

      return { code: next, map: null };
    },
  };
}
