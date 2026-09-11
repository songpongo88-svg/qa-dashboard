import fs from "node:fs";

const file = "src/processLibrary.tsx";
let source = fs.readFileSync(file, "utf8");
const marker = "// process-library-firestore-file-v71";

if (source.includes(marker)) {
  console.log("Process Library Firestore file storage v71 already applied");
  process.exit(0);
}

function replaceOnce(from, to, label) {
  if (!source.includes(from)) throw new Error(`Process Library v71 patch: missing ${label}`);
  source = source.replace(from, to);
}

replaceOnce(
  'import { getDownloadURL, getStorage, ref as storageRef, uploadBytes } from "firebase/storage";\n',
  '',
  'Firebase Storage import',
);

replaceOnce(
  'const PROCESS_COLLECTION = "qa_process_versions";\n',
  `const PROCESS_COLLECTION = "qa_process_versions";\n${marker}\nconst PROCESS_FILE_CHUNK_PREFIX_V71 = "__process_file_chunk__";\nconst PROCESS_FILE_CHUNK_BYTES_V71 = 512 * 1024;\nconst PROCESS_FILE_CHUNK_BATCH_V71 = 5;\nconst PROCESS_FILE_MAX_BYTES_V71 = 40 * 1024 * 1024;\n`,
  'process collection constant',
);

replaceOnce(
  '    return { db: getFirestore(app), storage: getStorage(app) };',
  '    return { db: getFirestore(app) };',
  'firebaseServices return',
);

replaceOnce(
  'function currentProcessVersionV69(rows: any[]): ProcessVersion | null {\n  const currentRows = rows.filter((row) => row?.status === "current");\n  currentRows.sort((a, b) => new Date(b?.uploadedAt || 0).getTime() - new Date(a?.uploadedAt || 0).getTime());\n  const row = currentRows[0] || rows.find((entry) => entry?.id === BUILTIN_VERSION.id);',
  'function currentProcessVersionV69(rows: any[]): ProcessVersion | null {\n  const versions = rows.filter((row) => row?.kind !== "file-chunk");\n  const currentRows = versions.filter((row) => row?.status === "current");\n  currentRows.sort((a, b) => new Date(b?.uploadedAt || 0).getTime() - new Date(a?.uploadedAt || 0).getTime());\n  const row = currentRows[0] || versions.find((entry) => entry?.id === BUILTIN_VERSION.id);',
  'current version chunk filter',
);

replaceOnce(
  'function processFileUrlV70(value: unknown) {\n  const url = String(value || "").trim();\n  if (!/^(?:https?:\\/\\/|\\/(?!\\/))/i.test(url)) return "";',
  'function processFileUrlV70(value: unknown) {\n  const url = String(value || "").trim();\n  if (/^firestore:\\/\\/[A-Za-z0-9._-]+$/i.test(url)) return url;\n  if (!/^(?:https?:\\/\\/|\\/(?!\\/))/i.test(url)) return "";',
  'process file URL validation',
);

replaceOnce(
  'function previewUrl(meta: ProcessReferenceMeta) {\n  const url = processFileUrlV70(meta.fileUrl);\n  if (!url) return "";\n  if (meta.fileType === "pdf" || url.toLowerCase().includes(".pdf")) return `${url.split("#")[0]}#page=${Math.max(1, meta.slideNumber)}&view=FitH`;',
  'function previewUrl(meta: ProcessReferenceMeta) {\n  const url = processFileUrlV70(meta.fileUrl);\n  if (!url || url.startsWith("firestore://")) return "";\n  if (meta.fileType === "pdf" || url.toLowerCase().includes(".pdf")) return `${url.split("#")[0]}#page=${Math.max(1, meta.slideNumber)}&view=FitH`;',
  'preview URL Firestore handling',
);

const firestoreHelpers = String.raw`
function firestoreProcessFileUrlV71(versionId: string) {
  return "firestore://" + versionId;
}

function processChunkDocIdV71(versionId: string, index: number) {
  return PROCESS_FILE_CHUNK_PREFIX_V71 + versionId + "__" + String(index).padStart(4, "0");
}

function bytesToBase64V71(bytes: Uint8Array) {
  let binary = "";
  const step = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += step) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + step)));
  }
  return btoa(binary);
}

function base64ToBytesV71(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function saveProcessFileToFirestoreV71(
  db: ReturnType<typeof getFirestore>,
  versionId: string,
  file: File,
  onProgress?: (saved: number, total: number) => void,
) {
  if (file.size <= 0) throw new Error("ไฟล์ Process ว่างเปล่า");
  if (file.size > PROCESS_FILE_MAX_BYTES_V71) throw new Error("ไฟล์ Process ต้องมีขนาดไม่เกิน 40 MB");

  const buffer = new Uint8Array(await file.arrayBuffer());
  const total = Math.ceil(buffer.length / PROCESS_FILE_CHUNK_BYTES_V71);

  for (let start = 0; start < total; start += PROCESS_FILE_CHUNK_BATCH_V71) {
    const batch = writeBatch(db);
    const end = Math.min(total, start + PROCESS_FILE_CHUNK_BATCH_V71);
    for (let index = start; index < end; index += 1) {
      const from = index * PROCESS_FILE_CHUNK_BYTES_V71;
      const to = Math.min(buffer.length, from + PROCESS_FILE_CHUNK_BYTES_V71);
      const encoded = bytesToBase64V71(buffer.subarray(from, to));
      batch.set(doc(db, PROCESS_COLLECTION, processChunkDocIdV71(versionId, index)), {
        kind: "file-chunk",
        versionId,
        index,
        bytes: to - from,
        data: encoded,
      });
    }
    await batch.commit();
    onProgress?.(end, total);
  }

  return { chunkCount: total, byteLength: buffer.length };
}

async function loadProcessBufferFromFirestoreV71(versionId: string, signal: AbortSignal) {
  const services = firebaseServices();
  if (!services) throw new Error("Firebase ยังไม่พร้อม");
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");

  const versionSnapshot = await getDoc(doc(services.db, PROCESS_COLLECTION, versionId));
  if (!versionSnapshot.exists()) throw new Error("ไม่พบ Process Version ที่บันทึกไว้");
  const version = versionSnapshot.data() as any;
  const chunkCount = Math.floor(Number(version?.fileChunkCount || 0));
  const byteLength = Math.floor(Number(version?.fileByteLength || 0));
  if (!Number.isFinite(chunkCount) || chunkCount < 1 || chunkCount > 200) throw new Error("ข้อมูลไฟล์ Process ไม่ครบ");
  if (!Number.isFinite(byteLength) || byteLength < 1 || byteLength > PROCESS_FILE_MAX_BYTES_V71) throw new Error("ขนาดไฟล์ Process ไม่ถูกต้อง");

  const snapshots = await Promise.all(
    Array.from({ length: chunkCount }, (_, index) => getDoc(doc(services.db, PROCESS_COLLECTION, processChunkDocIdV71(versionId, index))))
  );
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");

  const output = new Uint8Array(byteLength);
  let offset = 0;
  snapshots.forEach((snapshot, index) => {
    if (!snapshot.exists()) throw new Error("ไฟล์ Process ขาดส่วนที่ " + (index + 1));
    const data = String((snapshot.data() as any)?.data || "");
    if (!data) throw new Error("ไฟล์ Process ขาดส่วนที่ " + (index + 1));
    const chunk = base64ToBytesV71(data);
    if (offset + chunk.length > output.length) throw new Error("ขนาดไฟล์ Process ไม่ตรงกับข้อมูลที่บันทึก");
    output.set(chunk, offset);
    offset += chunk.length;
  });
  if (offset !== byteLength) throw new Error("ไฟล์ Process ไม่ครบ");
  return output.buffer;
}
`;

replaceOnce(
  'const pptxBufferCacheV69 = new Map<string, ArrayBuffer>();\n',
  firestoreHelpers + '\nconst pptxBufferCacheV69 = new Map<string, ArrayBuffer>();\n',
  'PPTX buffer cache insertion point',
);

replaceOnce(
  `async function loadPptxBufferV69(url: string, signal: AbortSignal) {\n  const cached = pptxBufferCacheV69.get(url);\n  if (cached) return cached;\n  if (pptxBufferCacheV69.size >= 2) pptxBufferCacheV69.delete(pptxBufferCacheV69.keys().next().value || "");\n  const response = await fetch(url, { signal });\n  if (!response.ok) throw new Error("เปิดไฟล์ Process ไม่สำเร็จ (HTTP " + response.status + ")");\n  const buffer = await response.arrayBuffer();\n  pptxBufferCacheV69.set(url, buffer);\n  return buffer;\n}`,
  `async function loadPptxBufferV69(url: string, signal: AbortSignal) {\n  const cached = pptxBufferCacheV69.get(url);\n  if (cached) return cached;\n  if (pptxBufferCacheV69.size >= 2) pptxBufferCacheV69.delete(pptxBufferCacheV69.keys().next().value || "");\n  const buffer = url.startsWith("firestore://")\n    ? await loadProcessBufferFromFirestoreV71(url.slice("firestore://".length), signal)\n    : await (async () => {\n        const response = await fetch(url, { signal });\n        if (!response.ok) throw new Error("เปิดไฟล์ Process ไม่สำเร็จ (HTTP " + response.status + ")");\n        return response.arrayBuffer();\n      })();\n  pptxBufferCacheV69.set(url, buffer);\n  return buffer;\n}`,
  'PPTX Firestore loader',
);

const pdfPreview = String.raw`
function FirestorePdfPreviewV71({ meta }: { meta: ProcessReferenceMeta }) {
  const [src, setSrc] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "";
    setSrc("");
    setError("");
    void loadPptxBufferV69(meta.fileUrl, controller.signal)
      .then((buffer) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(new Blob([buffer], { type: "application/pdf" }));
        setSrc(objectUrl + "#page=" + Math.max(1, meta.slideNumber) + "&view=FitH");
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        console.error("Render Process PDF failed", cause);
        setError(cause instanceof Error ? cause.message : "เปิด PDF ไม่สำเร็จ");
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [meta.fileUrl, meta.slideNumber]);

  if (error) return <div className="flex h-[70vh] items-center justify-center rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm font-black text-rose-800">{error}</div>;
  if (!src) return <div className="flex h-[70vh] items-center justify-center text-sm font-bold text-slate-600">กำลังเปิด PDF...</div>;
  return <iframe key={src} src={src} title={"Process Slide " + meta.slideNumber} allowFullScreen className="h-[78vh] w-full rounded-xl border border-slate-200 bg-white" />;
}
`;

replaceOnce(
  'function ProcessSlideFileV70({ meta }: { meta: ProcessReferenceMeta }) {\n',
  pdfPreview + '\nfunction ProcessSlideFileV70({ meta }: { meta: ProcessReferenceMeta }) {\n',
  'PDF preview insertion point',
);

replaceOnce(
  '    const src = previewUrl(resolvedMeta);\n    if (isPptx) return <PptxSlidePreviewV69 meta={resolvedMeta} />;\n    if (src) return <iframe key={src} src={src} title={"Process Slide " + meta.slideNumber} allowFullScreen className="h-[78vh] w-full rounded-xl border border-slate-200 bg-white" />;',
  '    const src = previewUrl(resolvedMeta);\n    if (isPptx) return <PptxSlidePreviewV69 meta={resolvedMeta} />;\n    if (resolvedMeta.fileUrl.startsWith("firestore://") && resolvedMeta.fileType === "pdf") return <FirestorePdfPreviewV71 meta={resolvedMeta} />;\n    if (src) return <iframe key={src} src={src} title={"Process Slide " + meta.slideNumber} allowFullScreen className="h-[78vh] w-full rounded-xl border border-slate-200 bg-white" />;',
  'Process file Firestore PDF branch',
);

const oldUpload = String.raw`  const upload = async () => {
    if (!uploadFile || !uploadIndex?.titles.length || uploadBusy || uploadAnalyzing) return;
    const services = firebaseServices();
    if (!services) { setMessage("Firebase ยังไม่พร้อม จึงยังอัปโหลด Process ไม่ได้"); return; }
    setUploadBusy(true);
    setMessage("กำลังอัปโหลด Process version ใหม่...");
    try {
      const id = makeVersionId(uploadFile.name);
      const uploadedAt = new Date().toISOString();
      const versionLabel = uploadedAt.slice(0, 16).replace(/-/g, ".").replace("T", "-").replace(":", ".");
      const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
      const target = storageRef(services.storage, "qa-process/" + id + "/" + safeName);
      await uploadBytes(target, uploadFile, { contentType: uploadFile.type || undefined });
      const fileUrl = await getDownloadURL(target);
      const existing = await getDocs(collection(services.db, PROCESS_COLLECTION));
      const processName = uploadFile.name.replace(/\.[^.]+$/, "").replace(/\s*\(\d+\)\s*$/, "").trim() || "Process";
      const batch = writeBatch(services.db);
      existing.docs.forEach((entry) => {
        if ((entry.data() as any).status === "current") batch.set(entry.ref, { status: "archived" }, { merge: true });
      });
      batch.set(doc(services.db, PROCESS_COLLECTION, id), {
        name: processName,
        versionLabel,
        fileName: uploadFile.name,
        fileUrl,
        fileType: fileType(uploadFile.name),
        slideCount: uploadIndex.titles.length,
        slideTitles: uploadIndex.titles,
        slideSteps: uploadIndex.steps,
        slideOfficeIds: uploadIndex.officeIds,
        uploadedAt,
        uploadedBy: String(currentUser?.username || currentUser?.displayName || "QA"),
        status: "current",
      });
      await batch.commit();
      setMessage("อัปโหลดสำเร็จ · " + uploadIndex.titles.length + " Slides · เริ่มนับ Slide 1 ใหม่แล้ว");
      setUploadOpen(false);
      setUploadFile(null);
      setUploadIndex(null);
      onChange("");
    } catch (error) {
      console.error("Process upload failed", error);
      setMessage("อัปโหลด Process ไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setUploadBusy(false);
    }
  };
`;

const newUpload = String.raw`  const upload = async () => {
    if (!uploadFile || !uploadIndex?.titles.length || uploadBusy || uploadAnalyzing) return;
    const services = firebaseServices();
    if (!services) { setMessage("Firebase ยังไม่พร้อม จึงยังบันทึก Process ไม่ได้"); return; }
    setUploadBusy(true);
    setMessage("กำลังบันทึก Process โดยไม่ใช้ Firebase Storage...");
    try {
      const uploadedAt = new Date().toISOString();
      const processName = uploadFile.name.replace(/\.[^.]+$/, "").replace(/\s*\(\d+\)\s*$/, "").trim() || "Process";
      const attachToSeed = current.id === BUILTIN_VERSION.id && processName === BUILTIN_VERSION.name && !processFileUrlV70(current.fileUrl);
      const id = attachToSeed ? current.id : makeVersionId(uploadFile.name);
      const versionLabel = attachToSeed
        ? current.versionLabel
        : uploadedAt.slice(0, 16).replace(/-/g, ".").replace("T", "-").replace(":", ".");
      const savedFile = await saveProcessFileToFirestoreV71(services.db, id, uploadFile, (saved, total) => {
        setMessage("กำลังบันทึกไฟล์ Process... " + saved + "/" + total + " ส่วน");
      });
      const existing = await getDocs(collection(services.db, PROCESS_COLLECTION));
      const batch = writeBatch(services.db);
      existing.docs.forEach((entry) => {
        const row = entry.data() as any;
        if (row?.kind === "file-chunk") return;
        if (entry.id !== id && row?.status === "current") batch.set(entry.ref, { status: "archived" }, { merge: true });
      });
      batch.set(doc(services.db, PROCESS_COLLECTION, id), {
        name: processName,
        versionLabel,
        fileName: uploadFile.name,
        fileUrl: firestoreProcessFileUrlV71(id),
        fileType: fileType(uploadFile.name),
        fileStorage: "firestore-chunks",
        fileChunkCount: savedFile.chunkCount,
        fileByteLength: savedFile.byteLength,
        slideCount: uploadIndex.titles.length,
        slideTitles: uploadIndex.titles,
        slideSteps: uploadIndex.steps,
        slideOfficeIds: uploadIndex.officeIds,
        uploadedAt,
        uploadedBy: String(currentUser?.username || currentUser?.displayName || "QA"),
        status: "current",
      }, { merge: attachToSeed });
      await batch.commit();
      setMessage((attachToSeed ? "เชื่อมไฟล์กับ Version เดิมสำเร็จ" : "บันทึก Process version ใหม่สำเร็จ") + " · " + uploadIndex.titles.length + " Slides");
      setUploadOpen(false);
      setUploadFile(null);
      setUploadIndex(null);
      onChange("");
    } catch (error) {
      console.error("Process upload failed", error);
      setMessage(error instanceof Error ? error.message : "บันทึก Process ไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setUploadBusy(false);
    }
  };
`;

replaceOnce(oldUpload, newUpload, 'Process upload flow');

replaceOnce(
  '            <div className="text-[11px] font-semibold leading-5 text-slate-500">Version Name และ Slides จะแสดงหลังเลือกไฟล์และแก้ไขเองไม่ได้</div>',
  '            <div className="text-[11px] font-semibold leading-5 text-slate-500">Version Name และ Slides จะแสดงหลังเลือกไฟล์และแก้ไขเองไม่ได้ · ไฟล์เก็บใน Firestore โดยไม่ใช้ Firebase Storage</div>',
  'upload storage note',
);

fs.writeFileSync(file, source);
console.log("Applied Process Library Firestore file storage v71");
