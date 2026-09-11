import fs from "node:fs";

const file = "src/processLibrary.tsx";
let source = fs.readFileSync(file, "utf8");
const marker = "// process-pptx-svg-fidelity-v84";

if (!source.includes(marker)) {
  if (!source.includes("// process-pptx-original-media-fidelity-v83")) {
    throw new Error("Process SVG preview v84 requires v83 media fidelity first");
  }

  source = source.replace(
    "// process-pptx-original-media-fidelity-v83\n",
    "// process-pptx-original-media-fidelity-v83\n" + marker + "\n",
  );

  const oldRelationship = `    const blip = block.match(/<a:blip\\b[^>]*>/i)?.[0] || "";
    const relationshipId = xmlAttributeV69(blip, "r:embed");`;
  const newRelationship = `    const blip = block.match(/<a:blip\\b[^>]*>/i)?.[0] || "";
    const svgBlip = block.match(/<asvg:svgBlip\\b[^>]*>/i)?.[0] || "";
    const relationshipId = xmlAttributeV69(blip, "r:embed") || xmlAttributeV69(svgBlip, "r:embed");`;
  if (!source.includes(oldRelationship)) throw new Error("Process SVG preview v84: picture relationship anchor missing");
  source = source.replace(oldRelationship, newRelationship);

  const oldPlaceholder = `  container.querySelectorAll<HTMLElement>("*").forEach((element) => {
    if (element.childElementCount) return;
    const text = String(element.textContent || "").trim();
    if (/^image$/i.test(text) || text === "🏠" || text === "🏡") {
      element.style.visibility = "hidden";
    }
  });`;
  const newPlaceholder = `  container.querySelectorAll<HTMLElement>("*").forEach((element) => {
    const text = String(element.textContent || "").trim();
    if (/^image$/i.test(text)) {
      element.style.visibility = "hidden";
    }
  });`;
  if (source.includes(oldPlaceholder)) source = source.replace(oldPlaceholder, newPlaceholder);

  fs.writeFileSync(file, source);
  console.log("Applied original PPTX SVG media relationship support v84");
} else {
  console.log("Process PPTX SVG media fidelity v84 already applied");
}
