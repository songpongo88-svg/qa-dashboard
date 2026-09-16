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

      // Draft means unfinished work is allowed. Keep the all-score requirement only for Submit.
      const scoreGuard = `    if (missingScoreTopics.length) {\n      const message = \`Please select score for every topic before saving draft. Missing: \${missingScoreText}\`;\n      setDraftMessage(message);\n      window.alert(message);\n      return;\n    }\n\n`;
      next = next.replace(scoreGuard, "");

      // There are Save Draft actions in both the compact workspace header and legacy form card.
      // Neither may be disabled simply because some topic scores are still null.
      next = next.replace(
        /(onClick=\{saveDraft\})\s+disabled=\{Boolean\(missingScoreTopics\.length\)\}/g,
        "$1"
      );
      next = next.replaceAll(
        "Score required before Save Draft / Submit:",
        "Score required before Submit Evaluation:"
      );

      if (next.includes("if (restoredEvaluateTabMemoryRef.current) return;")) {
        throw new Error("Draft Queue isolation patch failed: tab memory still blocks draft loading");
      }
      if (next.includes("if (normalizedDrafts[0]) loadDraftIntoForm(normalizedDrafts[0]);")) {
        throw new Error("Draft Queue isolation patch failed: latest draft still auto-loads into form");
      }
      if (!next.includes('onClick={() => { resetEvaluationForm(); setWorkspaceView("form"); }}')) {
        throw new Error("Draft Queue isolation patch failed: Back to Form does not reset the form");
      }
      if (next.includes("Please select score for every topic before saving draft")) {
        throw new Error("Draft Queue isolation patch failed: Save Draft still requires every topic score");
      }
      if (/onClick=\{saveDraft\}\s+disabled=\{Boolean\(missingScoreTopics\.length\)\}/.test(next)) {
        throw new Error("Draft Queue isolation patch failed: Save Draft button is still disabled for incomplete scores");
      }
      if (!next.includes('onClick={submitEvaluation} disabled={Boolean(missingScoreTopics.length)}')) {
        throw new Error("Draft Queue isolation patch failed: Submit score validation was changed unexpectedly");
      }
      if (next === original) {
        throw new Error("Draft Queue isolation patch failed: no source changes were applied");
      }

      return { code: next, map: null };
    },
  };
}
