import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const client = await readFile(new URL("../src/qaSingleSessionClient.ts", import.meta.url), "utf8");
assert.match(client, /export async function assertTrustedQaSessionForMutation\(/);
assert.match(client, /await qaServerSessionRequest\("validate"\)/);
assert.match(client, /throw new QaServerSessionError\(401, "QA_SESSION_NOT_ACTIVE"\)/);

const expectations = [
  ["evaluationStore.ts", ["upsertStoredEvaluation", "deleteStoredEvaluation", "uploadCallRecordingFile", "uploadEvidenceBlobToFirebase"]],
  ["coachingStore.ts", ["upsertStoredCoachingRecord", "saveMonthlyCoachingRecord"]],
  ["coachingAttachmentUpload.ts", ["uploadCoachingAttachment"]],
  ["appealStore.ts", ["writeAppealEvent", "updateAppealDiscussionMessage", "writeAdditionalAppealAccessDecision"]],
];

for (const [file, functions] of expectations) {
  const source = await readFile(new URL("../src/" + file, import.meta.url), "utf8");
  assert.match(source, /import \{ assertTrustedQaSessionForMutation \} from ["\x27]\.\/qaSingleSessionClient["\x27]/,
    file + " must import the guarded preflight");
  for (const name of functions) {
    const index = source.indexOf("function " + name + "(");
    assert.ok(index >= 0, file + ": missing " + name);
    const start = source.indexOf("{", index);
    // For multi-line parameter / type declarations, start might find a typed object;
    // verify the mutation's initial code region before any await that modifies data.
    const snippet = source.slice(index, index + 700);
    assert.ok(snippet.includes("await assertTrustedQaSessionForMutation();"),
      file + ": unguarded mutation " + name);
  }
}
const application = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const takeoverEffect = application.split("// Server-backed takeover requests are checked independently")[1]?.split("  const startSessionTimers = () => {")[0] || "";
assert.ok(takeoverEffect.includes('document.visibilityState !== "visible"'),
  "Hidden tabs must not repeatedly poll the session backend");
assert.ok(takeoverEffect.includes('window.setInterval(() => void checkTakeover(), 10_000)'),
  "Takeover checks should be quota-aware and within the 30-second save window");
assert.ok(takeoverEffect.includes('document.addEventListener("visibilitychange", onVisible)'),
  "Visible sessions must promptly resume takeover checks");

console.log("QA critical mutation preflight checks passed");
