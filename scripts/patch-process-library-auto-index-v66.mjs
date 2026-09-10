import fs from "node:fs";

const filePath = "src/processLibrary.tsx";
const marker = "process-library-auto-index-v66";
let source = fs.readFileSync(filePath, "utf8");
if (source.includes(marker)) {
  console.log("Process Library auto-index v66 already applied");
  process.exit(0);
}

function replaceOnce(label, before, after) {
  if (!source.includes(before)) throw new Error(`Process Library v66 anchor not found: ${label}`);
  source = source.replace(before, after);
}

const helperAnchor = `export function ProcessReferenceSelector({ value, onChange, currentUser }: { value: string; onChange: (value: string) => void; currentUser?: any }) {`;
const helpers = `// ${marker}\nfunction zipU16(view: DataView, offset: number) { return view.getUint16(offset, true); }\nfunction zipU32(view: DataView, offset: number) { return view.getUint32(offset, true); }\n\nasync function inflateZipEntry(data: Uint8Array, method: number) {\n  if (method === 0) return data;\n  if (method !== 8 || typeof DecompressionStream === \"undefined\") throw new Error(\"Unsupported ZIP compression\");\n  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream(\"deflate-raw\"));\n  return new Uint8Array(await new Response(stream).arrayBuffer());\n}\n\nfunction decodeXmlText(value: string) {\n  const textarea = document.createElement(\"textarea\");\n  textarea.innerHTML = value;\n  return textarea.value.replace(/\\s+/g, \" \ ").trim();\n}\n\nasync function extractPptxSlideTitles(file: File) {\n  const bytes = new Uint8Array(await file.arrayBuffer());\n  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);\n  let eocd = -1;\n  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 70000); offset -= 1) {\n    if (zipU32(view, offset) === 0x06054b50) { eocd = offset; break; }\n  }\n  if (eocd < 0) throw new Error(\"Invalid PPTX ZIP\");\n  const totalEntries = zipU16(view, eocd + 10);\n  let cursor = zipU32(view, eocd + 16);\n  const decoder = new TextDecoder(\"utf-8\");\n  const found: { number: number; title: string }[] = [];\n\n  for (let index = 0; index < totalEntries && cursor + 46 <= bytes.length; index += 1) {\n    if (zipU32(view, cursor) !== 0x02014b50) break;\n    const method = zipU16(view, cursor + 10);\n    const compressedSize = zipU32(view, cursor + 20);\n    const fileNameLength = zipU16(view, cursor + 28);\n    const extraLength = zipU16(view, cursor + 30);\n    const commentLength = zipU16(view, cursor + 32);\n    const localOffset = zipU32(view, cursor + 42);\n    const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + fileNameLength));\n    const match = name.match(/^ppt\\/slides\\/slide(\\d+)\\.xml$/);\n    if (match && localOffset + 30 <= bytes.length && zipU32(view, localOffset) === 0x04034b50) {\n      const localNameLength = zipU16(view, localOffset + 26);\n      const localExtraLength = zipU16(view, localOffset + 28);\n      const dataStart = localOffset + 30 + localNameLength + localExtraLength;\n      const compressed = bytes.slice(dataStart, dataStart + compressedSize);\n      const raw = await inflateZipEntry(compressed, method);\n      const xml = decoder.decode(raw);\n      const chunks = [...xml.matchAll(/<a:t>([\\s\\S]*?)<\\/a:t>/g)].map((item) => decodeXmlText(item[1] || \"\")).filter(Boolean);\n      const title = chunks.find((text) => text.length <= 160 && !/copyright/i.test(text)) || chunks[0] || `Slide ${match[1]}`;\n      found.push({ number: Number(match[1]), title });\n    }\n    cursor += 46 + fileNameLength + extraLength + commentLength;\n  }\n  found.sort((a, b) => a.number - b.number);\n  return found.map((item, index) => item.title || `Slide ${index + 1}`);\n}\n\nasync function analyzeProcessUpload(file: File) {\n  const lower = file.name.toLowerCase();\n  if (lower.endsWith(\".pptx\")) {\n    const titles = await extractPptxSlideTitles(file);\n    if (titles.length) return titles;\n  }\n  if (lower.endsWith(\".pdf\")) {\n    const bytes = new Uint8Array(await file.arrayBuffer());\n    const text = new TextDecoder(\"latin1\").decode(bytes);\n    const count = Math.max(1, (text.match(/\\/Type\\s*\\/Page\\b/g) || []).length);\n    return Array.from({ length: count }, (_, index) => `Slide ${index + 1}`);\n  }\n  return [];\n}\n\n`;
replaceOnce("auto-index helper", helperAnchor, helpers + helperAnchor);

replaceOnce(
  "upload title state",
  `  const [uploadSlides, setUploadSlides] = useState(CURRENT_PROCESS_TITLES.length);\n  const [uploadFile, setUploadFile] = useState<File | null>(null);`,
  `  const [uploadSlides, setUploadSlides] = useState(CURRENT_PROCESS_TITLES.length);\n  const [uploadSlideTitles, setUploadSlideTitles] = useState<string[]>(CURRENT_PROCESS_TITLES);\n  const [uploadAnalyzing, setUploadAnalyzing] = useState(false);\n  const [uploadFile, setUploadFile] = useState<File | null>(null);`
);

replaceOnce(
  "stored slide titles",
  `      const count = Math.max(1, Math.min(500, Number(uploadSlides || 1)));\n      await setDoc(doc(services.db, PROCESS_COLLECTION, id), { name: uploadName.trim() || uploadFile.name.replace(/\\.[^.]+$/, \"\"), versionLabel, fileName: uploadFile.name, fileUrl, fileType: fileType(uploadFile.name), slideCount: count, slideTitles: Array.from({ length: count }, (_, i) => \`Slide \${i + 1}\`), uploadedAt, uploadedBy: String(currentUser?.username || currentUser?.displayName || \"QA\"), status: \"current\" });`,
  `      const count = Math.max(1, Math.min(500, Number(uploadSlides || 1)));\n      const indexedTitles = Array.from({ length: count }, (_, i) => uploadSlideTitles[i] || \`Slide \${i + 1}\`);\n      await setDoc(doc(services.db, PROCESS_COLLECTION, id), { name: uploadName.trim() || uploadFile.name.replace(/\\.[^.]+$/, \"\"), versionLabel, fileName: uploadFile.name, fileUrl, fileType: fileType(uploadFile.name), slideCount: count, slideTitles: indexedTitles, uploadedAt, uploadedBy: String(currentUser?.username || currentUser?.displayName || \"QA\"), status: \"current\" });`
);

replaceOnce(
  "file chooser auto analyze",
  `<input type=\"file\" accept=\".pdf,.ppt,.pptx,application/pdf\" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} className=\"mt-2 block w-full text-xs font-semibold text-slate-600\" />`,
  `<input type=\"file\" accept=\".pdf,.ppt,.pptx,application/pdf\" onChange={async (e) => { const nextFile = e.target.files?.[0] || null; setUploadFile(nextFile); if (!nextFile) return; setUploadName(nextFile.name.replace(/\\.[^.]+$/, \"\")); setUploadAnalyzing(true); setMessage(\"กำลังอ่าน Slide จากไฟล์ Process...\"); try { const titles = await analyzeProcessUpload(nextFile); if (titles.length) { setUploadSlideTitles(titles); setUploadSlides(titles.length); setMessage(\`พบ \${titles.length} Slide · ระบบจะเริ่มนับ Slide 1 ใหม่เมื่อ Set Current\`); } else { setUploadSlideTitles([]); setMessage(\"อ่านจำนวน Slide อัตโนมัติไม่ได้ สามารถระบุจำนวน Slides เองได้\"); } } catch (error) { console.error(\"Analyze Process upload failed\", error); setUploadSlideTitles([]); setMessage(\"อ่าน Slide อัตโนมัติไม่ได้ สามารถระบุจำนวน Slides เองได้\"); } finally { setUploadAnalyzing(false); } }} className=\"mt-2 block w-full text-xs font-semibold text-slate-600\" />`
);

replaceOnce(
  "upload button analyzing",
  `{uploadBusy ? \"Uploading...\" : \"Set Current\"}`,
  `{uploadAnalyzing ? \"Indexing...\" : uploadBusy ? \"Uploading...\" : \"Set Current\"}`
);

replaceOnce(
  "upload button disabled",
  `disabled={!uploadFile || uploadBusy}`,
  `disabled={!uploadFile || uploadBusy || uploadAnalyzing}`
);

fs.writeFileSync(filePath, source, "utf8");
console.log("Process Library v66 applied: PPTX/PDF uploads auto-index slide count, PPTX slide titles, and reset numbering for each new Process version.");
