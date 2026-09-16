import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reviewPath = "docs/guide-release-review.json";
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
export function reviewedSources(root) {
  const files = [];
  for (const directory of ["src", "build", "scripts", ".github/workflows", "public/guide"]) {
    const walk = (folder) => {
      if (!fs.existsSync(folder)) return;
      for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
        const full = path.join(folder, item.name);
        if (item.isDirectory()) walk(full);
        else if (/\.(tsx?|m?js|css|json|ya?ml|png|jpe?g|webp|svg)$/.test(item.name)) files.push(path.relative(root, full).replaceAll("\\", "/"));
      }
    };
    walk(path.join(root, directory));
  }
  for (const name of ["package.json", "vite.config.js"]) if (fs.existsSync(path.join(root, name))) files.push(name);
  return Object.fromEntries(files.sort().map((file) => [file, hash(fs.readFileSync(path.join(root, file)))]));
}
function readTerms(root) {
  const document = JSON.parse(fs.readFileSync(path.join(root, "src/knowledge/terms.json"), "utf8"));
  return { document, hash: hash(JSON.stringify(document)) };
}
export function checkGuideReview(root = projectRoot) {
  const absolute = path.join(root, reviewPath);
  if (!fs.existsSync(absolute)) throw new Error("Missing guide release review. Review the changed workflow before publishing.");
  const review = JSON.parse(fs.readFileSync(absolute, "utf8"));
  if (!review.reason?.trim() || !review.reviewedAt || !review.sourceHashes) throw new Error("Guide review is incomplete.");
  const current = reviewedSources(root);
  const changed = [...new Set([...Object.keys(current), ...Object.keys(review.sourceHashes)])].filter((file) => current[file] !== review.sourceHashes[file]);
  if (changed.length) throw new Error(`คู่มือยังไม่ได้ตรวจร่วมกับโค้ดล่าสุด (${changed.length} ไฟล์):\n${changed.slice(0, 15).join("\n")}\nตรวจขั้นตอน/ภาพ แล้วใช้ npm run guide:review -- --reason "เหตุผลที่ตรวจ" --chapters "chapter-id" หรือ --no-content-change`);
  const terms = readTerms(root);
  if (review.termsVersions?.[terms.document.version] !== terms.hash) throw new Error("T&C changed without a new reviewed version.");
  return review;
}
export function recordGuideReview(root = projectRoot, args = process.argv.slice(2)) {
  const value = (name) => { const index = args.indexOf(name); return index < 0 ? "" : String(args[index + 1] || "").trim(); };
  const reason = value("--reason");
  const chapters = value("--chapters").split(",").map((item) => item.trim()).filter(Boolean);
  const unchanged = args.includes("--no-content-change");
  if (reason.length < 12 || (!chapters.length && !unchanged) || (chapters.length && unchanged)) throw new Error("ระบุ --reason ที่อธิบายผลตรวจ และเลือก --chapters หรือ --no-content-change อย่างใดอย่างหนึ่ง");
  const manual = JSON.parse(fs.readFileSync(path.join(root, "src/knowledge/manual.json"), "utf8"));
  if (chapters.some((id) => id !== "all" && !manual.chapters.some((chapter) => chapter.id === id))) throw new Error("Unknown guide chapter ID.");
  const absolute = path.join(root, reviewPath);
  const previous = fs.existsSync(absolute) ? JSON.parse(fs.readFileSync(absolute, "utf8")) : {};
  const terms = readTerms(root);
  if (previous.termsVersions?.[terms.document.version] && previous.termsVersions[terms.document.version] !== terms.hash) {
    throw new Error("ห้ามแก้ข้อความ T&C ในเวอร์ชันเดิม ให้ประกาศ version ใหม่เพื่อรักษาหลักฐานเดิม");
  }
  const review = { schemaVersion: 1, reviewedAt: new Date().toISOString(), reason, contentChanged: !unchanged,
    reviewedChapters: chapters, termsVersions: { ...previous.termsVersions, [terms.document.version]: terms.hash }, sourceHashes: reviewedSources(root) };
  fs.mkdirSync(path.dirname(absolute), { recursive: true }); fs.writeFileSync(absolute, JSON.stringify(review, null, 2) + "\n");
  return review;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes("--record")) { recordGuideReview(); console.log("Recorded guide review for the current source. Commit docs/guide-release-review.json with the release."); }
    else { const review = checkGuideReview(); console.log(`User guide verified: ${review.reviewedAt} — ${review.reason}`); }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
