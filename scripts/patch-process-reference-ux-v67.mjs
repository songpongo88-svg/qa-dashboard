import fs from "node:fs";

const filePath = "src/processLibrary.tsx";
const marker = "process-reference-ux-v67";
let source = fs.readFileSync(filePath, "utf8");

if (source.includes(marker)) {
  console.log("Process reference UX v67 already applied");
  process.exit(0);
}

function replaceOnce(label, before, after) {
  if (!source.includes(before)) throw new Error(`Process reference UX v67 anchor not found: ${label}`);
  source = source.replace(before, after);
}

replaceOnce(
  "step selector",
  `<label><span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">ข้อ / Step</span><input value={step} disabled={historical} onChange={(e) => { const next = e.target.value; setStep(next); if (slide) onChange(serializeProcessReference(fromVersion(active, slide, next))); }} placeholder="ทั้งสไลด์ / ข้อ 1 / Step ..." className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold" /></label>`,
  `<label><span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">ข้อที่ใช้เทียบ</span><select value={step || "ทั้งสไลด์"} disabled={historical} onChange={(e) => { const next = e.target.value; setStep(next); if (slide) onChange(serializeProcessReference(fromVersion(active, slide, next))); }} className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold"><option value="ทั้งสไลด์">ทั้งสไลด์</option>{Array.from({ length: 20 }, (_, index) => <option key={index + 1} value={`ข้อ ${index + 1}`}>{`ข้อ ${index + 1}`}</option>)}<option value="Think to Know">Think to Know</option><option value="เงื่อนไข / หมายเหตุ">เงื่อนไข / หมายเหตุ</option></select><span className="mt-1.5 block text-[11px] font-semibold leading-5 text-slate-500">เลือก “ทั้งสไลด์” เมื่อใช้ทั้งหน้า หรือเลือกข้อที่ใช้เป็นจุดอ้างอิงในการประเมิน</span></label>`
);

replaceOnce(
  "selector preview interaction",
  `{preview ? <iframe src={preview} title={\`Process Slide \${meta.slideNumber}\`} className="aspect-video w-full rounded-xl border border-violet-100 bg-white" /> : <img src={snapshot(meta)} alt={\`Process Slide \${meta.slideNumber} reference snapshot\`} className="aspect-video w-full rounded-xl border border-violet-100 bg-white object-contain" />}{!preview ? <div className="mt-2 text-[11px] font-semibold text-amber-700">Version นี้ยังไม่มีไฟล์ Preview ในระบบ จึงแสดง Reference Snapshot ตาม Slide ที่เลือก</div> : null}`,
  `{preview && meta.fileType === "pdf" ? <iframe src={preview} title={\`Process Slide \${meta.slideNumber}\`} className="pointer-events-none aspect-video w-full rounded-xl border border-violet-100 bg-white" /> : <img src={snapshot(meta)} alt={\`Process Slide \${meta.slideNumber} reference snapshot\`} className="pointer-events-none aspect-video w-full rounded-xl border border-violet-100 bg-white object-contain" />}{preview && meta.fileType !== "pdf" ? <div className="mt-2 text-[11px] font-semibold text-slate-500">ไฟล์ PowerPoint เปิดดูจากปุ่ม View Process เท่านั้น เพื่อไม่ให้พื้นที่ Preview รับการคลิก</div> : !preview ? <div className="mt-2 text-[11px] font-semibold text-amber-700">Version นี้ยังไม่มีไฟล์ Preview ในระบบ จึงแสดง Reference Snapshot ตาม Slide ที่เลือก</div> : null}`
);

replaceOnce(
  "case detail step label",
  `<span className="font-bold text-slate-500">ข้อ / Step:</span> <span className="font-extrabold text-slate-900">{meta.step || "ทั้งสไลด์"}</span>`,
  `<span className="font-bold text-slate-500">อ้างอิง:</span> <span className="font-extrabold text-slate-900">{meta.step || "ทั้งสไลด์"}</span>`
);

replaceOnce(
  "case detail preview interaction",
  `{preview ? <iframe src={preview} title={\`Process Slide \${meta.slideNumber}\`} className="aspect-video w-full bg-white" /> : <img src={snapshot(meta)} alt={\`Process Slide \${meta.slideNumber} reference snapshot\`} className="aspect-video w-full bg-white object-contain" />}`,
  `{preview && meta.fileType === "pdf" ? <iframe src={preview} title={\`Process Slide \${meta.slideNumber}\`} className="pointer-events-none aspect-video w-full bg-white" /> : <img src={snapshot(meta)} alt={\`Process Slide \${meta.slideNumber} reference snapshot\`} className="pointer-events-none aspect-video w-full bg-white object-contain" />}`
);

replaceOnce(
  "view process button selector",
  `className="text-xs font-black text-violet-700 underline">View Process</a>`,
  `className="inline-flex items-center rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-700 shadow-sm transition hover:bg-violet-100">View Process</a>`
);

replaceOnce(
  "view process button detail",
  `className="text-xs font-black text-violet-700 underline">View Process</a>`,
  `className="inline-flex items-center rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-700 shadow-sm transition hover:bg-violet-100">View Process</a>`
);

source = `// ${marker}\n` + source;
fs.writeFileSync(filePath, source, "utf8");
console.log("Process reference UX v67 applied: step dropdown, clearer Case Detail label, non-interactive preview, and View Process-only click target.");
