import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const source = await fs.readFile("src/lib/processFileManagement.ts", "utf8");
const tmp = path.join(os.tmpdir(), "qa-process-management-" + process.pid + "-" + Date.now() + ".mjs");
try {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.filter(x => x.category === ts.DiagnosticCategory.Error).length, 0);
  await fs.writeFile(tmp, compiled.outputText, "utf8");
  const {
    managedProcessFileRows, selectedProcessFileRows, canRemoveProcessFile, processFileVisibilityUpdate,
  } = await import(pathToFileURL(tmp).href);

  const builtin = { id: "new-process-2026-seed-20260910", name: "New Process 2026",
    status: "current", uploadedAt: "2026-09-10T00:00:00Z" };
  const primary = { id: "x-active", name: "Cancellation Process", status: "current",
    uploadedAt: "2026-10-15T00:00:00Z", fileUrl: "firestore://x-active", hiddenFromPicker: false };
  const prior = { id: "x-old", name: "Cancellation Process", status: "archived",
    uploadedAt: "2026-09-15T00:00:00Z", fileUrl: "firestore://x-old", hiddenFromPicker: false };
  const separate = { id: "y-active", name: "Rider Process", status: "current",
    uploadedAt: "2026-10-16T00:00:00Z", fileUrl: "firestore://y-active", hiddenFromPicker: false };
  const chunk = { id: "__process_file_chunk__x-active__0000", kind: "file-chunk", name: "Cancellation Process" };
  const rows = [primary, prior, separate, chunk];
  const snapshot = structuredClone(rows);
  assert.deepEqual(managedProcessFileRows(rows, builtin).map(x => x.id),
    ["y-active", "x-active", "x-old", builtin.id], "manager shows every version but no file chunks");
  assert.deepEqual(selectedProcessFileRows(rows, builtin).map(x => x.id),
    ["x-active", builtin.id, "y-active"], "dropdown selects current version of each process name");
  assert.equal(canRemoveProcessFile(builtin, builtin.id), false, "protected system fallback");
  assert.equal(canRemoveProcessFile(primary, builtin.id), true, "uploaded Process is removable");

  const hidden = { ...primary, ...processFileVisibilityUpdate(true, "qa", "2026-11-04T08:00:00Z") };
  const hiddenRows = [hidden, prior, separate, chunk];
  assert.equal(selectedProcessFileRows(hiddenRows, builtin).some(x => x.name === primary.name), false,
    "hiding current version cannot resurrect an old archived file in the dropdown");
  assert.equal(managedProcessFileRows(hiddenRows, builtin).some(x => x.id === primary.id), true,
    "hidden file is retained for QA history and Restore");
  assert.equal(prior.fileUrl, "firestore://x-old", "archived file URL is unchanged");
  assert.deepEqual(processFileVisibilityUpdate(false, "qa", "2026-11-04T08:00:00Z"),
    { hiddenFromPicker: false, removedAt: "", removedBy: "" });
  const restored = { ...hidden, ...processFileVisibilityUpdate(false, "qa", "2026-11-04T08:00:00Z") };
  assert.equal(selectedProcessFileRows([restored, prior, separate], builtin).some(x => x.id === primary.id),
    true, "Restore immediately returns current Process to dropdown");
  assert.deepEqual(rows, snapshot, "management filtering is non-destructive and never changes evaluation references");

  const manager = await fs.readFile("src/ProcessFileManager.tsx", "utf8");
  const patch = await fs.readFile("scripts/patch-process-file-management-v85.mjs", "utf8");
  const launcher = await fs.readFile("scripts/patch-process-multifile-v84.mjs", "utf8");
  for(const label of ["Process File Management", "View File", "Remove", "Restore"]) {
    assert.ok(manager.includes(label), "manager must expose " + label);
  }
  assert.match(manager, /data-process-managed-version=/, "all versions are shown with stable IDs");
  assert.match(patch, /processFileVisibilityUpdate/, "writes only the hidden visibility metadata");
  assert.match(patch, /referencedIds=/, "current evaluation references remain visible");
  assert.ok(!/deleteDoc\s*\(|deleteObject\s*\(/.test(patch + "\n" + manager), "old Process versions are not permanently deleted");
  assert.match(launcher, /patch-process-file-management-v85\.mjs/, "management patch executes after the multi-file selector patch");
  console.log("PASS Process File Management: current/archived files, safe removal, Restore, previews and historical references");
} finally {
  await fs.rm(tmp, { force: true });
}
