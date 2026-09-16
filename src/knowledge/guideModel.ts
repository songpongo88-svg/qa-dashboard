import manual from "./manual.json";
export type GuideImage = { src: string; caption: string };
export type GuideChapter = typeof manual.chapters[number] & { images?: GuideImage[]; revision?: number; publishedBy?: string };
export const MANUAL = manual;
export const canReadChapter = (chapter: GuideChapter, permissions: Record<string, boolean>) => !chapter.permissions.length || chapter.permissions.some((key) => permissions[key] === true);
export function contextualChapter(context: string, chapters: GuideChapter[]) {
  const normalized = context.startsWith("case:") ? "case-detail" : context;
  return chapters.find((chapter) => chapter.contexts.includes(normalized))?.id || chapters[0]?.id || "";
}
export function findChapters(chapters: GuideChapter[], search: string) {
  const words = search.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return chapters.filter((chapter) => { const text = JSON.stringify([chapter.title, chapter.summary, chapter.category, chapter.steps, chapter.tips, chapter.troubleshooting]).toLocaleLowerCase(); return words.every((word) => text.includes(word)); });
}
export function validGuideImage(src: string) {
  return /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(src) || /^\/guide\/[a-zA-Z0-9/_-]+\.(?:png|jpg|jpeg|webp)$/.test(src);
}
export function cleanGuideContent(base: GuideChapter, edited: GuideChapter): GuideChapter {
  if (!edited.title?.trim() || !edited.summary?.trim() || !edited.steps?.length || edited.steps.length > 15) throw new Error("กรุณาระบุชื่อบท คำอธิบาย และขั้นตอน 1–15 ข้อ");
  const text = (value: unknown, max: number) => { if (typeof value !== "string" || value.length > max) throw new Error("ข้อความยาวเกินกำหนดหรือรูปแบบไม่ถูกต้อง"); return value.trim(); };
  const steps = edited.steps.map((step) => ({ title: text(step.title, 180), body: text(step.body, 2500) }));
  if (steps.some((step) => !step.title || !step.body)) throw new Error("กรุณากรอกหัวข้อและคำอธิบายของทุกขั้นตอน");
  const images = (edited.images || []).map((image) => { if (!validGuideImage(image.src) || image.src.length > 330000) throw new Error("ภาพคู่มือต้องเป็น PNG, JPEG หรือ WebP ขนาดไม่เกิน 245 KB"); return { src: image.src, caption: text(image.caption, 400) }; });
  if (images.length > 2 || JSON.stringify(images).length > 500000) throw new Error("รองรับภาพไม่เกิน 2 ภาพ และขนาดรวมไม่เกิน 375 KB ต่อบท");
  // Routing and permission metadata always come from the deployed source, never from editable fields.
  return { ...base, title: text(edited.title, 180), summary: text(edited.summary, 1000), steps,
    result: text(edited.result, 1500), tips: edited.tips.slice(0, 12).map((item) => text(item, 1000)),
    troubleshooting: edited.troubleshooting.slice(0, 12).map((item) => text(item, 1200)), images };
}
