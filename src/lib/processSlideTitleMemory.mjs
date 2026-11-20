// Global, per-Process-Version Slide names. Never write an entire slideTitles array:
// concurrent editors must not erase names saved for another Slide.
export function slideTitleKey(versionId, slideNumber) {
  const name = String(versionId || "").trim();
  const slide = Number(slideNumber);
  if (!name || !Number.isInteger(slide) || slide < 1 || slide > 500) throw new Error("Invalid Process slide identity");
  return name + "::" + slide;
}

export function effectiveSlideTitle(row, slideNumber) {
  const slide = Number(slideNumber);
  if (!Number.isInteger(slide) || slide < 1 || slide > 500) throw new Error("Invalid slide number");
  const override = row?.slideTitleOverrides?.[String(slide)];
  const title = typeof override === "string" ? override.trim() : "";
  const imported = Array.isArray(row?.slideTitles) ? row.slideTitles[slide - 1] : "";
  return title || String(imported || "").trim() || "Slide " + slide;
}

export function slideTitleOverridePayload(slideNumber, input) {
  const slide = Number(slideNumber);
  const value = String(input || "").replace(/\s+/g, " ").trim().slice(0, 240);
  if (!Number.isInteger(slide) || slide < 1 || slide > 500 || !value) throw new Error("Invalid custom slide title");
  return { slideTitleOverrides: { [String(slide)]: value } };
}
