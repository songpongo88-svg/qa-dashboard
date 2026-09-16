import { jsPDF } from "jspdf";
import { formatKnowledgeDate, KNOWLEDGE_BUILD, type TermsAcceptance } from "./model";
import { MANUAL, type GuideChapter } from "./guideModel";

type Fonts = { regular: string; semibold: string };
let fontPromise: Promise<Fonts> | null = null;
function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer); let value = "";
  for (let index = 0; index < bytes.length; index += 8192) value += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(value);
}
async function fonts() {
  if (!fontPromise) fontPromise = Promise.all(["Kanit-Regular.ttf", "Kanit-SemiBold.ttf"].map(async (name) => {
    const response = await fetch(`/fonts/${name}`);
    if (!response.ok) throw new Error("โหลดฟอนต์ PDF ไม่สำเร็จ กรุณาลองอีกครั้ง");
    return toBase64(await response.arrayBuffer());
  })).then(([regular, semibold]) => ({ regular, semibold })).catch((error) => { fontPromise = null; throw error; });
  return fontPromise;
}

async function pdfWriter(label: string, footer: string, providedFonts?: Fonts) {
  const loaded = providedFonts || await fonts();
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  pdf.addFileToVFS("Kanit-Regular.ttf", loaded.regular); pdf.addFont("Kanit-Regular.ttf", "Kanit", "normal");
  pdf.addFileToVFS("Kanit-SemiBold.ttf", loaded.semibold); pdf.addFont("Kanit-SemiBold.ttf", "Kanit", "bold");
  pdf.setProperties({ title: label, author: "QA Dashboard", subject: footer });
  const left = 17, width = 176, bottom = 275;
  let y = 30;
  const header = () => {
    pdf.setFillColor(109, 40, 217); pdf.rect(0, 0, 210, 4, "F");
    pdf.setFont("Kanit", "bold"); pdf.setFontSize(10); pdf.setTextColor(76, 29, 149);
    pdf.text("ROBINHOOD  /  QA DASHBOARD", left, 15);
    pdf.setDrawColor(226, 232, 240); pdf.line(left, 20, 193, 20);
  };
  header();
  const newPage = () => { pdf.addPage(); y = 30; header(); };
  const need = (height: number) => { if (y + height > bottom) newPage(); };
  const segments = (value: string, granularity: "word" | "grapheme") => Array.from(new Intl.Segmenter("th", { granularity }).segment(value), (entry) => entry.segment);
  const wrap = (value: string, maxWidth = width) => {
    const lines: string[] = [];
    for (const paragraph of String(value).split("\n")) {
      let line = "";
      for (const token of segments(paragraph, "word")) {
        if (pdf.getTextWidth(line + token) <= maxWidth) { line += token; continue; }
        if (line.trim()) lines.push(line.trimEnd());
        line = "";
        if (pdf.getTextWidth(token) <= maxWidth) { line = token.trimStart(); continue; }
        for (const glyph of segments(token, "grapheme")) {
          if (line && pdf.getTextWidth(line + glyph) > maxWidth) { lines.push(line); line = ""; }
          line += glyph;
        }
      }
      if (line.trim()) lines.push(line.trimEnd());
      if (!paragraph) lines.push("");
    }
    return lines;
  };
  const text = (value: string, options: { bold?: boolean; size?: number; indent?: number; gap?: number } = {}) => {
    const size = options.size || 10.5, indent = options.indent || 0, height = size * .48;
    pdf.setFont("Kanit", options.bold ? "bold" : "normal"); pdf.setFontSize(size); pdf.setTextColor(30, 41, 59);
    const lines = wrap(value, width - indent);
    for (const line of lines) { need(height); pdf.setFont("Kanit", options.bold ? "bold" : "normal"); pdf.setFontSize(size); pdf.setTextColor(30, 41, 59); pdf.text(line, left + indent, y); y += height; }
    y += options.gap ?? 3;
  };
  const heading = (value: string) => { need(22); text(value, { bold: true, size: 12, gap: 3 }); };
  const image = async (source: string, caption: string) => {
    let data = source;
    if (!source.startsWith("data:")) {
      const response = await fetch(source);
      if (!response.ok) throw new Error("โหลดภาพประกอบ PDF ไม่สำเร็จ");
      const buffer = await response.arrayBuffer();
      const mime = source.endsWith(".png") ? "image/png" : source.endsWith(".webp") ? "image/webp" : "image/jpeg";
      data = `data:${mime};base64,${toBase64(buffer)}`;
    }
    const info = pdf.getImageProperties(data);
    const w = Math.min(width, info.width * .22), h = Math.min(105, w * info.height / info.width);
    const finalW = h * info.width / info.height;
    need(h + 18);
    pdf.addImage(data, info.fileType, left, y, finalW, h); y += h + 6;
    if (caption) text(caption, { size: 9 });
  };
  const finish = () => {
    const count = pdf.getNumberOfPages();
    for (let page = 1; page <= count; page++) {
      pdf.setPage(page); pdf.setFont("Kanit", "normal"); pdf.setFontSize(8); pdf.setTextColor(100, 116, 139);
      pdf.setDrawColor(226, 232, 240); pdf.line(left, 281, 193, 281);
      pdf.text(footer, left, 287); pdf.text(`${page} / ${count}`, 193, 287, { align: "right" });
    }
    return pdf;
  };
  return { pdf, text, heading, need, image, finish, newPage, getY: () => y, setY: (value: number) => { y = value; } };
}

export async function generateTermsPdf(record: TermsAcceptance, providedFonts?: Fonts) {
  const writer = await pdfWriter("Terms & Acknowledgements", `T&C Version ${record.version} | ${formatKnowledgeDate(record.acceptedAt)} (Asia/Bangkok)`, providedFonts);
  const { document: content } = record;
  writer.text("หลักฐานการยอมรับข้อกำหนด", { bold: true, size: 20, gap: 5 });
  writer.text(content.title, { bold: true, size: 12 });
  writer.text(`Version ${content.version}  |  มีผล ${content.effectiveDate.split("-").reverse().join("/")}  |  Accepted`, { size: 10 });
  writer.text(`ผู้ยืนยัน: ${record.user.displayName}\nบัญชี: ${record.user.username}\nRole: ${record.user.role}  |  ทีม: ${record.user.teamName || "—"}\nวันเวลาที่ยอมรับ: ${formatKnowledgeDate(record.acceptedAt)} (เวลาไทย)`, { size: 10 });
  writer.text(`เลขอ้างอิง: ${record.id}\nDeploy Version: ${record.buildCommit.slice(0, 7) || "—"}`, { size: 9 });
  writer.text(content.introduction);
  content.sections.forEach((section, index) => { writer.heading(`${index + 1}. ${section.title}`); section.paragraphs.forEach((paragraph) => writer.text(paragraph)); });
  writer.heading("ข้อความที่ผู้ใช้งานยืนยัน"); writer.text(content.statement);
  writer.text(`วิธียืนยัน: เลือกช่องรับทราบและกดปุ่มยืนยันด้วยบัญชีตนเอง${record.signatureDataUrl ? " พร้อมแนบลายเซ็น" : ""}`, { size: 10 });
  if (record.signatureDataUrl) {
    writer.need(35); writer.pdf.addImage(record.signatureDataUrl, "PNG", 17, writer.getY(), 65, 22); writer.setY(writer.getY() + 29);
  }
  writer.text(`ผู้ยืนยัน: ${record.user.displayName}`, { size: 10 });
  writer.text(`รหัสตรวจสอบข้อความ (SHA-256): ${record.contentHash}`, { size: 8.5 });
  return writer.finish();
}

export async function generateGuidePdf(chapters: GuideChapter[], providedFonts?: Fonts) {
  const writer = await pdfWriter("คู่มือการใช้งาน QA Dashboard", `คู่มือ ${MANUAL.version} | Deploy ${String(KNOWLEDGE_BUILD.commitHash || "").slice(0, 7) || "local"}`, providedFonts);
  for (const [index, chapter] of chapters.entries()) {
    if (index) writer.newPage();
    writer.text(chapter.category, { size: 10, gap: 3 });
    writer.text(chapter.title, { bold: true, size: 19, gap: 5 });
    writer.text(chapter.summary, { size: 11 });
    writer.text(`สำหรับ: ${chapter.audience}\nแก้ไขเนื้อหา: ${formatKnowledgeDate(chapter.updatedAt)} (เวลาไทย)${chapter.revision ? ` | Revision ${chapter.revision}` : ""}`, { size: 9 });
    chapter.steps.forEach((step, stepIndex) => { writer.heading(`${stepIndex + 1}. ${step.title}`); writer.text(step.body); });
    for (const image of chapter.images || []) await writer.image(image.src, image.caption);
    writer.heading("ผลที่ควรเห็น"); writer.text(chapter.result);
    if (chapter.tips.length) { writer.heading("ข้อควรรู้"); chapter.tips.forEach((tip) => writer.text(`• ${tip}`)); }
    if (chapter.troubleshooting.length) { writer.heading("เมื่อพบปัญหา"); chapter.troubleshooting.forEach((tip) => writer.text(`• ${tip}`)); }
  }
  return writer.finish();
}
function safeName(value: string) { return value.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 100); }
export async function downloadTermsPdf(record: TermsAcceptance) { (await generateTermsPdf(record)).save(`QA_Terms_${safeName(record.user.username)}_v${safeName(record.version)}.pdf`); }
export async function downloadGuidePdf(chapters: GuideChapter[]) { (await generateGuidePdf(chapters)).save(`QA_User_Guide_${chapters.length === 1 ? safeName(chapters[0].id) : "All"}_v${MANUAL.version}.pdf`); }
