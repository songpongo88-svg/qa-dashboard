import fs from "node:fs";

const file = "src/CreateEvaluationMockup.tsx";
let source = fs.readFileSync(file, "utf8");
const marker = "// evidence-browser-capture-v96";

if (source.includes(marker)) {
  console.log("Evidence browser capture v96 already applied");
  process.exit(0);
}

function replaceOnce(from, to, label) {
  if (!source.includes(from)) throw new Error(`Evidence capture v96: missing ${label}`);
  source = source.replace(from, to);
}

const evidenceTypePattern = /(type EvidenceFile = \{[\s\S]*?\n\};)/;
if (!evidenceTypePattern.test(source)) throw new Error("Evidence capture v96: EvidenceFile type not found");
source = source.replace(evidenceTypePattern, (match) => `${match}

type EvidenceCapturePayload = {
  captureId?: string;
  dataUrl: string;
  fileName?: string;
  capturedAt?: string;
  pageUrl?: string;
  pageTitle?: string;
  context?: { caseId?: string; draftId?: string; agentName?: string };
};

function evidenceCaptureDataUrlToFile(dataUrl: string, fileName: string) {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) throw new Error("Invalid captured image data");
  const header = dataUrl.slice(0, commaIndex);
  const encoded = dataUrl.slice(commaIndex + 1);
  const mime = header.match(/^data:([^;]+)/)?.[1] || "image/png";
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], fileName, { type: mime });
}

${marker}`);

replaceOnce(
  '  const [evidenceUploadMessage, setEvidenceUploadMessage] = useState("");',
  `  const [evidenceUploadMessage, setEvidenceUploadMessage] = useState("");
  const [evidenceCaptureExtensionReady, setEvidenceCaptureExtensionReady] = useState(false);
  const evidenceCaptureFilesRef = useRef<EvidenceFile[]>(readEvaluateTabMemory()?.evidenceFiles || []);
  const evidenceCaptureQueueRef = useRef<Promise<void>>(Promise.resolve());`,
  "evidence capture state",
);

replaceOnce(
  '  const [submittedRecordsLoading, setSubmittedRecordsLoading] = useState(false);',
  `  const [submittedRecordsLoading, setSubmittedRecordsLoading] = useState(false);

  useEffect(() => {
    evidenceCaptureFilesRef.current = evidenceFiles;
  }, [evidenceFiles]);

  useEffect(() => {
    const normalizedCaseId = caseId.trim();
    const context = { caseId: normalizedCaseId, draftId: activeDraftId, agentName };

    const handleEvidenceCaptureMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      const message = event.data as { source?: string; type?: string; payload?: EvidenceCapturePayload };
      if (!message || message.source !== "qa-evidence-extension") return;

      if (message.type === "QA_EVIDENCE_EXTENSION_READY") {
        setEvidenceCaptureExtensionReady(true);
        return;
      }

      if (message.type === "QA_EVIDENCE_CAPTURE_ERROR") {
        setEvidenceUploadMessage(String((message.payload as any)?.fileName || "Capture Evidence ไม่สำเร็จ"));
        return;
      }

      if (message.type !== "QA_EVIDENCE_CAPTURED" || !message.payload?.dataUrl) return;
      const capturedCaseId = String(message.payload.context?.caseId || "").trim();
      if (capturedCaseId && normalizedCaseId && capturedCaseId !== normalizedCaseId) {
        setEvidenceUploadMessage("พบภาพ Capture ของเคส " + capturedCaseId + " แต่เคสที่เปิดอยู่คือ " + normalizedCaseId + " จึงยังไม่แนบอัตโนมัติ");
        return;
      }

      const capturePayload = message.payload;
      evidenceCaptureQueueRef.current = evidenceCaptureQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          try {
            const fallbackName = "Evidence_Capture_" + new Date().toISOString().replace(/[:.]/g, "-") + ".png";
            const file = evidenceCaptureDataUrlToFile(capturePayload.dataUrl, capturePayload.fileName || fallbackName);
            const currentEvidence = evidenceCaptureFilesRef.current[0];

            if (currentEvidence?.uploadStatus === "pending") {
              throw new Error("กรุณารอให้อัปโหลดภาพก่อนหน้าสำเร็จก่อน");
            }

            const existingFiles = currentEvidence?.sourceFiles || [];
            const existingPreviewUrls = currentEvidence?.sourcePreviewUrls || [];
            const nextPreviewUrl = URL.createObjectURL(file);

            await createAndUploadEvidencePdfV2(
              [...existingFiles, file],
              currentEvidence?.id,
              [...existingPreviewUrls, nextPreviewUrl]
            );

            setEvidenceUploadMessage(
              "รับภาพ Capture แล้ว: " + file.name + " • รวม " + (existingFiles.length + 1) + " ภาพ"
            );
            window.postMessage({
              source: "qa-dashboard",
              type: "QA_EVIDENCE_CAPTURE_ACK",
              payload: { captureId: capturePayload.captureId || "" },
            }, "*");
          } catch (error) {
            console.error("Attach browser capture failed", error);
            setEvidenceUploadMessage(
              error instanceof Error ? error.message : "รับภาพ Capture ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"
            );
          }
        });
    };

    window.addEventListener("message", handleEvidenceCaptureMessage);
    window.postMessage({ source: "qa-dashboard", type: "QA_EVIDENCE_CONTEXT", payload: context }, "*");
    window.postMessage({ source: "qa-dashboard", type: "QA_EVIDENCE_PULL", payload: context }, "*");

    return () => window.removeEventListener("message", handleEvidenceCaptureMessage);
  }, [caseId, activeDraftId, agentName]);`,
  "capture message bridge",
);

replaceOnce(
  '  async function handleEvidenceFilesV2(files: FileList | null) {',
  `  function armBrowserEvidenceCapture() {
    const normalizedCaseId = caseId.trim();
    if (!normalizedCaseId) {
      setEvidenceUploadMessage("กรุณากรอก Case ID ก่อนเริ่ม Capture Evidence เพื่อป้องกันการแนบภาพผิดเคส");
      return;
    }
    const context = { caseId: normalizedCaseId, draftId: activeDraftId, agentName };
    window.postMessage({ source: "qa-dashboard", type: "QA_EVIDENCE_ARM_CAPTURE", payload: context }, "*");
    setEvidenceUploadMessage(
      evidenceCaptureExtensionReady
        ? "Continuous Capture เริ่มแล้ว ลากครอบได้ต่อเนื่อง เปลี่ยนแท็บได้ และกด Esc เมื่อต้องการจบ"
        : "ส่งคำสั่ง Capture แล้ว หากยังไม่เห็นสถานะ Extension Ready ให้ติดตั้ง QA Evidence Capture บน Chrome/Edge ก่อน"
    );
  }

  async function handleEvidenceFilesV2(files: FileList | File[] | null) {`,
  "capture arm handler",
);

const attachAnchor = `                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-black text-white shadow-[0_12px_24px_rgba(2,132,199,0.22)] transition hover:bg-sky-800">
                      Attach Files`;
const attachReplacement = `                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={armBrowserEvidenceCapture} className="inline-flex items-center rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-black text-white shadow-[0_12px_24px_rgba(4,120,87,0.22)] transition hover:bg-emerald-800">
                      Capture Evidence
                    </button>
                    <label className="inline-flex cursor-pointer items-center rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-black text-white shadow-[0_12px_24px_rgba(2,132,199,0.22)] transition hover:bg-sky-800">
                      Attach Files`;
replaceOnce(attachAnchor, attachReplacement, "Attach Files action row");

const helperAnchor = `                    <span className="text-xs font-semibold text-slate-600">JPG, PNG, WEBP - รวมเป็น PDF หลายหน้า / PDF เดี่ยว - อัปโหลดเป็นลิงก์เดียว</span>
                  </div>

                  {evidenceUploadMessage ? (`;
const helperReplacement = `                    <span className="text-xs font-semibold text-slate-600">JPG, PNG, WEBP - รวมเป็น PDF หลายหน้า / PDF เดี่ยว - อัปโหลดเป็นลิงก์เดียว</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-600">
                    <span className={"inline-flex rounded-full border px-2.5 py-1 font-black " + (evidenceCaptureExtensionReady ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700")}>
                      {evidenceCaptureExtensionReady ? "Extension Ready" : "Chrome / Edge Extension"}
                    </span>
                    <span>กด Capture Evidence หรือ Alt + Shift + S เพียงครั้งเดียว → ลากครอบต่อเนื่อง → เปลี่ยนแท็บได้ → Esc เพื่อจบ</span>
                  </div>

                  {evidenceUploadMessage ? (`;
replaceOnce(helperAnchor, helperReplacement, "capture helper text");

fs.writeFileSync(file, source, "utf8");
console.log("Applied continuous browser-wide Evidence Capture bridge to Create Evaluation");
