import { jsPDF, OFFICIAL_FONT } from "../officialPdf";
import { PDF_LOGO } from "../pdfLogo";
import { formatKnowledgeDate, KNOWLEDGE_BUILD, type TermsAcceptance } from "./model";
import { MANUAL, type GuideChapter } from "./guideModel";

type Fonts = unknown;
function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer); let value = "";
  for (let index = 0; index < bytes.length; index += 8192) value += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(value);
}
async function pdfWriter(label: string, footer: string, providedFonts?: Fonts) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  (pdf as any).__qaCustomOfficialHeader = true;
  const pageTexts: string[] = [""];
  pdf.setProperties({ title: label, author: "QA Dashboard", subject: footer });
  const left = 18, width = 174, bottom = 273;
  let y = 44;
  const header = () => {
    pdf.addImage(PDF_LOGO, "PNG", 18, 11, 17, 17, "robinhood-logo", "FAST");
    pdf.setFont(OFFICIAL_FONT,"bold"); pdf.setFontSize(16); pdf.setTextColor(57,40,86);
    pdf.text("Robinhood Quality Assurance",41,17);
    pdf.setFont(OFFICIAL_FONT,"normal"); pdf.setFontSize(14); pdf.text(label,41,25);
    pdf.setDrawColor(195,185,208); pdf.line(left,33,192,33);
  };
  header();
  const newPage = () => { pdf.addPage(); pageTexts.push(""); y = 44; header(); };
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
    const size = options.size || 16, indent = options.indent || 0, height = size * .40;
    pdf.setFont(OFFICIAL_FONT, options.bold ? "bold" : "normal"); pdf.setFontSize(size); pdf.setTextColor(30, 41, 59);
    const lines = wrap(value, width - indent);
    for (const line of lines) { need(height); pdf.setFont(OFFICIAL_FONT, options.bold ? "bold" : "normal"); pdf.setFontSize(size); pdf.setTextColor(30, 41, 59); pdf.text(line, left + indent, y); pageTexts[pdf.getCurrentPageInfo().pageNumber-1] += line+"\n"; y += height; }
    y += options.gap ?? 3;
  };
  const heading = (value: string) => { need(22); text(value, { bold: true, size: 18, gap: 3 }); };
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
    if (caption) text(caption, { size: 16 });
  };
  const finish = () => {
    const count = pdf.getNumberOfPages();
    for (let page = 1; page <= count; page++) {
      pdf.setPage(page); pdf.setFont(OFFICIAL_FONT, "normal"); pdf.setFontSize(11); pdf.setTextColor(100, 116, 139);
      pdf.setDrawColor(226, 232, 240); pdf.line(left, 281, 193, 281);
      pdf.text(footer, left, 287); pdf.text(`${page} / ${count}`, 193, 287, { align: "right" });
    }
    return pdf;
  };
  return { pdf, pageTexts, text, heading, need, image, finish, newPage, getY: () => y, setY: (value: number) => { y = value; } };
}

export async function generateTermsPdf(record: TermsAcceptance, providedFonts?: Fonts) {
  const writer = await pdfWriter("Terms & Acknowledgements", `T&C Version ${record.version} | ${formatKnowledgeDate(record.acceptedAt)} (Asia/Bangkok)`, providedFonts);
  const { document: content } = record;
  writer.text("หลักฐานการยอมรับข้อกำหนด", { bold: true, size: 24, gap: 5 });
  writer.text(content.title, { bold: true, size: 16 });
  writer.text(`Version ${content.version}  |  มีผล ${content.effectiveDate.split("-").reverse().join("/")}  |  Accepted`, { size: 14 });
  writer.text(`ผู้ยืนยัน: ${record.user.displayName}\nบัญชี: ${record.user.username}\nRole: ${record.user.role}  |  ทีม: ${record.user.teamName || "—"}\nวันเวลาที่ยอมรับ: ${formatKnowledgeDate(record.acceptedAt)} (เวลาไทย)`, { size: 14 });
  writer.text(`เลขอ้างอิง: ${record.id}\nDeploy Version: ${record.buildCommit.slice(0, 7) || "—"}`, { size: 12 });
  writer.text(content.introduction);
  content.sections.forEach((section, index) => { writer.heading(`${index + 1}. ${section.title}`); section.paragraphs.forEach((paragraph) => writer.text(paragraph)); });
  writer.heading("ข้อความที่ผู้ใช้งานยืนยัน"); writer.text(content.statement);
  writer.text(`วิธียืนยัน: เลือกช่องรับทราบและกดปุ่มยืนยันด้วยบัญชีตนเอง${record.signatureDataUrl ? " พร้อมแนบลายเซ็น" : ""}`, { size: 14 });
  if (record.signatureDataUrl) {
    writer.need(35); writer.pdf.addImage(record.signatureDataUrl, "PNG", 17, writer.getY(), 65, 22); writer.setY(writer.getY() + 29);
  }
  writer.text(`ผู้ยืนยัน: ${record.user.displayName}`, { size: 14 });
  writer.text(`รหัสตรวจสอบข้อความ (SHA-256): ${record.contentHash}`, { size: 11 });
  return writer.finish();
}

export async function generateGuidePdfBundle(chapters: GuideChapter[]) {
  const writer = await pdfWriter("คู่มือการใช้งาน QA Dashboard", `คู่มือ ${MANUAL.version} | Deploy ${String(KNOWLEDGE_BUILD.commitHash || "").slice(0, 7) || "local"}`);
  const toc: { page: number; y: number; target?: number }[] = [];
  if (chapters.length > 1) {
    writer.text("สารบัญคู่มือการใช้งาน", { size: 24, bold: true, gap: 6 });
    writer.text("กดหัวข้อในสารบัญเพื่อไปยังบทที่ต้องการ คู่มือรวมแสดงครบทุกหัวข้อ การทำรายการจริงยังขึ้นอยู่กับสิทธิ์ของบัญชี", { size: 15 });
    for (const chapter of chapters) {
      writer.need(15);
      toc.push({ page: writer.pdf.getCurrentPageInfo().pageNumber, y: writer.getY() });
      writer.text(chapter.title, { size: 15, indent: 0, gap: 3 });
    }
    writer.newPage();
  }
  for (const [index, chapter] of chapters.entries()) {
    if (index) writer.newPage();
    const page = writer.pdf.getCurrentPageInfo().pageNumber;
    if (toc[index]) toc[index].target = page;
    writer.pdf.outline?.add(null,chapter.title,{ pageNumber: page });
    writer.text(chapter.category, { size: 13, gap: 3 });
    writer.text(chapter.title, { bold: true, size: 24, gap: 5 });
    writer.text(chapter.summary, { size: 16 });
    writer.text(`สำหรับ: ${chapter.audience}\nแก้ไขเนื้อหา: ${formatKnowledgeDate(chapter.updatedAt)} (เวลาไทย)${chapter.revision ? ` | Revision ${chapter.revision}` : ""}`, { size: 13 });
    for (const image of chapter.images || []) if (!image.step) await writer.image(image.src,image.caption);
    for (const [stepIndex,step] of chapter.steps.entries()) {
      writer.heading(`${stepIndex + 1}. ${step.title}`); writer.text(step.body);
      for (const image of chapter.images || []) if (image.step === stepIndex+1) await writer.image(image.src,image.caption);
    }
    writer.heading("ผลที่ควรเห็น"); writer.text(chapter.result);
    if (chapter.tips.length) { writer.heading("ข้อควรรู้"); chapter.tips.forEach(tip=>writer.text(`• ${tip}`)); }
    if (chapter.troubleshooting.length) { writer.heading("เมื่อพบปัญหา"); chapter.troubleshooting.forEach(tip=>writer.text(`• ${tip}`)); }
  }
  for (const row of toc) {
    writer.pdf.setPage(row.page); writer.pdf.setFont(OFFICIAL_FONT,"normal"); writer.pdf.setFontSize(13);
    writer.pdf.text(String(row.target),192,row.y,{align:"right"});
    writer.pdf.link(18,row.y-5,174,10,{pageNumber:row.target});
  }
  return { pdf: writer.finish(), pageTexts: writer.pageTexts };
}
export async function generateGuidePdf(chapters: GuideChapter[], _providedFonts?: Fonts) { return (await generateGuidePdfBundle(chapters)).pdf; }
function safeName(value: string) { return value.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 100); }
export async function downloadTermsPdf(record: TermsAcceptance) { (await generateTermsPdf(record)).save(`QA_Terms_${safeName(record.user.username)}_v${safeName(record.version)}.pdf`); }
export async function downloadGuidePdf(chapters: GuideChapter[]) { (await generateGuidePdf(chapters)).save(`QA_User_Guide_${chapters.length === 1 ? safeName(chapters[0].id) : "All"}_v${MANUAL.version}.pdf`); }
