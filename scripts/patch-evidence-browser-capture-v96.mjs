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
source = source.replace(evidenceTypePattern, (match) => `${match}\n\ntype EvidenceCapturePayload = {\n  captureId?: string;\n  dataUrl: string;\n  fileName?: string;\n  capturedAt?: string;\n  pageUrl?: string;\n  pageTitle?: string;\n  context?: { caseId?: string; draftId?: string; agentName?: string };\n};\n\nfunction evidenceCaptureDataUrlToFile(dataUrl: string, fileName: string) {\n  const commaIndex = dataUrl.indexOf(\",\");\n  if (commaIndex < 0) throw new Error(\"Invalid captured image data\");\n  const header = dataUrl.slice(0, commaIndex);\n  const encoded = dataUrl.slice(commaIndex + 1);\n  const mime = header.match(/^data:([^;]+)/)?.[1] || \"image/png\";\n  const binary = atob(encoded);\n  const bytes = new Uint8Array(binary.length);\n  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);\n  return new File([bytes], fileName, { type: mime });\n}\n\n${marker}`);

replaceOnce(
  '  const [evidenceUploadMessage, setEvidenceUploadMessage] = useState("");',
  '  const [evidenceUploadMessage, setEvidenceUploadMessage] = useState("");\n  const [evidenceCaptureExtensionReady, setEvidenceCaptureExtensionReady] = useState(false);',
  "evidence capture state",
);

replaceOnce(
  '  const [submittedRecordsLoading, setSubmittedRecordsLoading] = useState(false);',
  `  const [submittedRecordsLoading, setSubmittedRecordsLoading] = useState(false);\n\n  useEffect(() => {\n    const normalizedCaseId = caseId.trim();\n    const context = { caseId: normalizedCaseId, draftId: activeDraftId, agentName };\n\n    const handleEvidenceCaptureMessage = (event: MessageEvent) => {\n      if (event.source !== window) return;\n      const message = event.data as { source?: string; type?: string; payload?: EvidenceCapturePayload };\n      if (!message || message.source !== \"qa-evidence-extension\") return;\n\n      if (message.type === \"QA_EVIDENCE_EXTENSION_READY\") {\n        setEvidenceCaptureExtensionReady(true);\n        return;\n      }\n\n      if (message.type === \"QA_EVIDENCE_CAPTURE_ERROR\") {\n        setEvidenceUploadMessage(String((message.payload as any)?.fileName || \"Capture Evidence ไม่สำเร็จ\"));\n        return;\n      }\n\n      if (message.type !== \"QA_EVIDENCE_CAPTURED\" || !message.payload?.dataUrl) return;\n      const capturedCaseId = String(message.payload.context?.caseId || \"\").trim();\n      if (capturedCaseId && normalizedCaseId && capturedCaseId !== normalizedCaseId) {\n        setEvidenceUploadMessage(\"พบภาพ Capture ของเคส \" + capturedCaseId + \" แต่เคสที่เปิดอยู่คือ \" + normalizedCaseId + \" จึงยังไม่แนบอัตโนมัติ\");\n        return;\n      }\n\n      try {\n        const fallbackName = \"Evidence_Capture_\" + new Date().toISOString().replace(/[:.]/g, \"-\") + \".png\";\n        const file = evidenceCaptureDataUrlToFile(message.payload.dataUrl, message.payload.fileName || fallbackName);\n        void handleEvidenceFilesV2([file]);\n        setEvidenceUploadMessage(\"รับภาพ Capture แล้ว: \" + file.name);\n        window.postMessage({\n          source: \"qa-dashboard\",\n          type: \"QA_EVIDENCE_CAPTURE_ACK\",\n          payload: { captureId: message.payload.captureId || \"\" },\n        }, \"*\");\n      } catch (error) {\n        console.error(\"Attach browser capture failed\", error);\n        setEvidenceUploadMessage(\"รับภาพ Capture ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง\");\n      }\n    };\n\n    window.addEventListener(\"message\", handleEvidenceCaptureMessage);\n    window.postMessage({ source: \"qa-dashboard\", type: \"QA_EVIDENCE_CONTEXT\", payload: context }, \"*\");\n    window.postMessage({ source: \"qa-dashboard\", type: \"QA_EVIDENCE_PULL\", payload: context }, \"*\");\n\n    return () => window.removeEventListener(\"message\", handleEvidenceCaptureMessage);\n  }, [caseId, activeDraftId, agentName]);`,
  "capture message bridge",
);

replaceOnce(
  '  async function handleEvidenceFilesV2(files: FileList | null) {',
  `  function armBrowserEvidenceCapture() {\n    const normalizedCaseId = caseId.trim();\n    if (!normalizedCaseId) {\n      setEvidenceUploadMessage(\"กรุณากรอก Case ID ก่อนเริ่ม Capture Evidence เพื่อป้องกันการแนบภาพผิดเคส\");\n      return;\n    }\n    const context = { caseId: normalizedCaseId, draftId: activeDraftId, agentName };\n    window.postMessage({ source: \"qa-dashboard\", type: \"QA_EVIDENCE_ARM_CAPTURE\", payload: context }, \"*\");\n    setEvidenceUploadMessage(\n      evidenceCaptureExtensionReady\n        ? \"Capture Evidence พร้อมแล้ว ไปยังหน้าเว็บที่ต้องการ กด Alt + Shift + S แล้วลากเมาส์ครอบพื้นที่\"\n        : \"ส่งคำสั่ง Capture แล้ว หากยังไม่เห็นสถานะ Extension Ready ให้ติดตั้ง QA Evidence Capture บน Chrome/Edge ก่อน\"\n    );\n  }\n\n  async function handleEvidenceFilesV2(files: FileList | File[] | null) {`,
  "capture arm handler",
);

const attachAnchor = `                  <div className="flex flex-wrap items-center gap-2">\n                    <label className="inline-flex cursor-pointer items-center rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-black text-white shadow-[0_12px_24px_rgba(2,132,199,0.22)] transition hover:bg-sky-800">\n                      Attach Files`;
const attachReplacement = `                  <div className="flex flex-wrap items-center gap-2">\n                    <button type="button" onClick={armBrowserEvidenceCapture} className="inline-flex items-center rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-black text-white shadow-[0_12px_24px_rgba(4,120,87,0.22)] transition hover:bg-emerald-800">\n                      Capture Evidence\n                    </button>\n                    <label className="inline-flex cursor-pointer items-center rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-black text-white shadow-[0_12px_24px_rgba(2,132,199,0.22)] transition hover:bg-sky-800">\n                      Attach Files`;
replaceOnce(attachAnchor, attachReplacement, "Attach Files action row");

const helperAnchor = `                    <span className="text-xs font-semibold text-slate-600">JPG, PNG, WEBP - รวมเป็น PDF หลายหน้า / PDF เดี่ยว - อัปโหลดเป็นลิงก์เดียว</span>\n                  </div>\n\n                  {evidenceUploadMessage ? (`;
const helperReplacement = `                    <span className="text-xs font-semibold text-slate-600">JPG, PNG, WEBP - รวมเป็น PDF หลายหน้า / PDF เดี่ยว - อัปโหลดเป็นลิงก์เดียว</span>\n                  </div>\n                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-600">\n                    <span className={\"inline-flex rounded-full border px-2.5 py-1 font-black \" + (evidenceCaptureExtensionReady ? \"border-emerald-200 bg-emerald-50 text-emerald-700\" : \"border-amber-200 bg-amber-50 text-amber-700\")}>\n                      {evidenceCaptureExtensionReady ? \"Extension Ready\" : \"Chrome / Edge Extension\"}\n                    </span>\n                    <span>กด Capture Evidence → ไปหน้าเว็บใดก็ได้ → Alt + Shift + S → ลากครอบพื้นที่ ภาพจะกลับเข้าเคสนี้อัตโนมัติ</span>\n                  </div>\n\n                  {evidenceUploadMessage ? (`;
replaceOnce(helperAnchor, helperReplacement, "capture helper text");

fs.writeFileSync(file, source, "utf8");
console.log("Applied browser-wide Evidence Capture bridge to Create Evaluation");
