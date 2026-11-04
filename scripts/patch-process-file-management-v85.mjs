import fs from "node:fs";

const path = "src/processLibrary.tsx";
let source = fs.readFileSync(path, "utf8");
const marker = "// process-file-management-v85";

if (source.includes(marker)) {
  console.log("Process File Management v85 already applied");
} else {
  if (!source.includes("// process-library-multi-file-v84")) {
    throw new Error("Process File Management v85 requires multi-file Process Library v84");
  }
  function replaceOnce(oldText, newText, label) {
    const count = source.split(oldText).length - 1;
    if (count !== 1) throw new Error("Process File Management v85 " + label + ": " + count + " matches");
    source = source.replace(oldText, newText);
  }

  const imports = [
    'import { managedProcessFileRows, selectedProcessFileRows, canRemoveProcessFile, processFileVisibilityUpdate } from "./lib/processFileManagement";',
    'import { ProcessFileManager } from "./ProcessFileManager";',
    marker,
  ];
  source = imports.join("\n") + "\n" + source;

  const oldLibrary = /function currentProcessLibraryV84\(rows: any\[\]\): ProcessVersion\[\] \{[\s\S]*?\n\}\n\n/;
  if (!oldLibrary.test(source)) throw new Error("Process File Management v85: current library helper missing");
  const newLibrary = [
    'function currentProcessLibraryV84(rows: any[]): ProcessVersion[] {',
    '  return selectedProcessFileRows(rows, { ...builtInVersionV68(), status: "current" })',
    '    .map((row) => currentProcessVersionV69([{ ...row, status: "current" }]))',
    '    .filter((row): row is ProcessVersion => Boolean(row))',
    '    .sort((a, b) => a.name.localeCompare(b.name, "th", { sensitivity: "base" }));',
    '}',
    '',
    '',
  ].join("\n");
  source = source.replace(oldLibrary, newLibrary);

  const states = [
    '  const [managedFilesV85, setManagedFilesV85] = useState<(ProcessVersion & { hiddenFromPicker: boolean })[]>([]);',
    '  const [managerOpenV85, setManagerOpenV85] = useState(false);',
    '  const [managerBusyIdV85, setManagerBusyIdV85] = useState("");',
    '  const [managerMessageV85, setManagerMessageV85] = useState("");',
    '  const [managerPreviewFileV85, setManagerPreviewFileV85] = useState<ProcessVersion | null>(null);',
    '  const [managerPreviewMetaV85, setManagerPreviewMetaV85] = useState<ProcessReferenceMeta | null>(null);',
    '  const processManageAllowedV85 = ["Quality Assurance", "Admin", "Administrator"].includes(String(currentUser?.role || ""));',
  ];
  replaceOnce(
    '  const [selectedProcessIdV84, setSelectedProcessIdV84] = useState(BUILTIN_VERSION.id);\n',
    '  const [selectedProcessIdV84, setSelectedProcessIdV84] = useState(BUILTIN_VERSION.id);\n' + states.join("\n") + "\n",
    "managed state",
  );

  const snapshot = [
    '        // Reuse the existing Process snapshot; no additional listeners or file chunk reads.',
    '        const managed = managedProcessFileRows(rows, { ...builtInVersionV68(), status: "current" });',
    '        setManagedFilesV85(managed.map((row: any) => ({',
    '          ...(currentProcessVersionV69([{ ...row, status: "current" }]) || builtInVersionV68()),',
    '          status: row.status === "archived" ? "archived" : "current",',
    '          hiddenFromPicker: Boolean(row.hiddenFromPicker),',
    '        })));',
  ];
  replaceOnce('        setProcessLibraryV84(library);\n',
    '        setProcessLibraryV84(library);\n' + snapshot.join("\n") + "\n", "shared snapshot");

  // Inject an ordinary JavaScript function body as TypeScript source. It writes
  // metadata only; no stored Process file chunks or historical cases are deleted.
  function applyVisibility(item, hidden) {
    if (!processManageAllowedV85 || !canRemoveProcessFile(item, BUILTIN_VERSION.id) || managerBusyIdV85) return;
    const action = hidden ? "นำออกจากรายการเลือก" : "นำกลับเข้าคลังไฟล์";
    const confirmed = window.confirm(
      action + "?\n\n" + item.name + " · Version " + item.versionLabel +
      "\n\nไฟล์ต้นฉบับและข้อมูลอ้างอิงในเคสเก่าจะยังอยู่" +
      (hidden ? "\nสามารถกด Restore ได้ในหน้านี้" : "")
    );
    if (!confirmed) return;
    const services = firebaseServices();
    if (!services) { setManagerMessageV85("Firebase ไม่พร้อม กรุณาลองใหม่"); return; }
    setManagerBusyIdV85(item.id);
    setManagerMessageV85("");
    try {
      const batch = writeBatch(services.db);
      batch.set(
        doc(services.db, PROCESS_COLLECTION, item.id),
        processFileVisibilityUpdate(hidden, String(currentUser?.username || currentUser?.displayName || "QA"), new Date().toISOString()),
        { merge: true },
      );
      await batch.commit();
      setManagerMessageV85(hidden
        ? "นำ " + item.name + " ออกจากรายการเลือกแล้ว · เคสเก่ายังเปิด Process เดิมได้"
        : "Restore " + item.name + " สำเร็จ · เวอร์ชัน Archived ยังคงอยู่ในประวัติ");
    } catch (error) {
      console.error("Update Process file visibility failed", error);
      setManagerMessageV85(error instanceof Error ? error.message : "เปลี่ยนสถานะไฟล์ไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setManagerBusyIdV85("");
    }
  }
  const handlers = [
    '  const setFileHiddenV85 = ' + applyVisibility.toString() + ';',
    '  const managerPreviewItemsV85 = managerPreviewFileV85',
    '    ? Array.from({ length: managerPreviewFileV85.slideCount }, (_, index) =>',
    '        fromVersion(managerPreviewFileV85, index + 1, "ทั้งสไลด์"))',
    '    : [];',
    '',
  ];
  replaceOnce('  const upload = async () => {\n', handlers.join("\n") + '\n  const upload = async () => {\n', "change visibility handler");

  const uploadButton = [
    '            Upload New Process',
    '          </button>',
    '        ) : null}',
  ].join("\n");
  const manageButton = [
    uploadButton,
    '        {processManageAllowedV85 ? (',
    '          <button type="button" data-manage-process-files="true"',
    '            onClick={() => { setManagerMessageV85(""); setManagerOpenV85(true); }}',
    '            className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-black text-[#155B83] shadow-sm hover:border-sky-300 hover:bg-sky-50">',
    '            Manage Process Files',
    '          </button>',
    '        ) : null}',
  ].join("\n");
  replaceOnce(uploadButton, manageButton, "manage button");

  const managerModal = [
    '      {managerOpenV85 && processManageAllowedV85 ? (',
    '        <ProcessFileManager',
    '          files={managedFilesV85} busyId={managerBusyIdV85} message={managerMessageV85}',
    '          referencedIds={parsedRefs.map((item) => item.versionId)}',
    '          protectedFileId={BUILTIN_VERSION.id}',
    '          onClose={() => setManagerOpenV85(false)}',
    '          onPreview={(file) => {',
    '            setManagerPreviewFileV85(file);',
    '            setManagerPreviewMetaV85(fromVersion(file, 1, "ทั้งสไลด์"));',
    '          }}',
    '          onChangeVisibility={(file, hidden) => { void setFileHiddenV85(file, hidden); }}',
    '        />',
    '      ) : null}',
    '      <ProcessSlideModalV68 meta={managerPreviewMetaV85} items={managerPreviewItemsV85}',
    '        onNavigate={setManagerPreviewMetaV85}',
    '        onClose={() => { setManagerPreviewMetaV85(null); setManagerPreviewFileV85(null); }} />',
  ].join("\n");
  replaceOnce('      <ProcessSlideModalV68 meta={previewMeta} items={parsedRefs}', managerModal + '\n      <ProcessSlideModalV68 meta={previewMeta} items={parsedRefs}', "manager modal");

  fs.writeFileSync(path, source);
  console.log("Applied Process File Management v85 · View / Remove / Restore with preserved historical references");
}
