import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import { sanitizeRecoveryForm, saveEvaluationRecovery, readEvaluationRecovery, clearEvaluationRecovery } from "../src/lib/evaluation/sessionRecoveryStore.mjs";

globalThis.indexedDB = indexedDB;

const snapshot = {
  caseId: "AA1234", caseDescription: "Customer contacted support",
  topicState: { "1.1": { score: 10, reason: "Verified" } },
  evidenceFiles: [{ name: "private.png", previewUrl: "blob:secret" }],
  callLogs: [{ localPreviewUrl: "blob:private" }],
  evaluationStatus: "Draft",
};
const clean = sanitizeRecoveryForm(snapshot);
assert.equal(clean.caseId, "AA1234");
assert.equal("evidenceFiles" in clean, false);
assert.equal("callLogs" in clean, false);
assert.equal(await saveEvaluationRecovery("agent.one", snapshot), true);
const restored = await readEvaluationRecovery("agent.one");
assert.equal(restored.snapshot.caseId, "AA1234");
assert.equal(restored.snapshot.topicState["1.1"].score, 10);
assert.equal(await readEvaluationRecovery("agent.two"), null);
await clearEvaluationRecovery("agent.one");
assert.equal(await readEvaluationRecovery("agent.one"), null);
assert.equal(await saveEvaluationRecovery("agent.one", { ...snapshot, evaluationStatus: "Submitted" }), false);
assert.equal(await readEvaluationRecovery("agent.one"), null);
assert.equal(await saveEvaluationRecovery("agent.one", { caseId: "", caseDescription: "", inquiry: "" }), false);
assert.throws(() => sanitizeRecoveryForm(null));
console.log("evaluation browser-recovery tests passed");
