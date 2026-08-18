export function caseDetailPdfThaiWrapPatch() {
  let patched = false;

  return {
    name: "case-detail-pdf-thai-wrap-fix",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      if (!cleanId.endsWith("/src/caseDetailOfficialPdf.ts")) return null;

      let next = code;

      const safetyAnchor = "const TEXT_WRAP_SAFETY = 0.8;";
      if (!next.includes(safetyAnchor)) {
        this.error("Case Detail PDF wrap patch could not find TEXT_WRAP_SAFETY anchor.");
      }
      next = next.replace(safetyAnchor, "const TEXT_WRAP_SAFETY = 1.2;");

      const measureAnchor = "        return sum + doc.getTextWidth(run.text);";
      if (!next.includes(measureAnchor)) {
        this.error("Case Detail PDF wrap patch could not find rich text measure anchor.");
      }
      next = next.replace(
        measureAnchor,
        "        return sum + doc.getTextWidth(run.text) * 1.035;"
      );

      const graphemeAnchor = "          const graphemeWidth = doc.getTextWidth(grapheme);";
      if (!next.includes(graphemeAnchor)) {
        this.error("Case Detail PDF wrap patch could not find grapheme width anchor.");
      }
      next = next.replace(
        graphemeAnchor,
        "          const graphemeWidth = doc.getTextWidth(grapheme) * 1.035;"
      );

      const drawAnchor = `        doc.text(run.text, currentX, baselineY);\n        const segmentWidth = Math.min(\n          doc.getTextWidth(run.text),\n          Math.max(0, x + w - TEXT_INNER_PAD_X - TEXT_WRAP_SAFETY - currentX)\n        );\n        if (run.underline && segmentWidth > 0) {\n          doc.setDrawColor(color[0], color[1], color[2]);\n          doc.setLineWidth(0.12);\n          doc.line(currentX, baselineY + 0.45, currentX + segmentWidth, baselineY + 0.45);\n        }\n        currentX += segmentWidth;`;

      if (!next.includes(drawAnchor)) {
        this.error("Case Detail PDF wrap patch could not find rich text draw anchor.");
      }

      next = next.replace(
        drawAnchor,
        `        doc.text(run.text, currentX, baselineY);\n        const actualSegmentWidth = doc.getTextWidth(run.text);\n        const visibleSegmentWidth = Math.min(\n          actualSegmentWidth,\n          Math.max(0, x + w - TEXT_INNER_PAD_X - TEXT_WRAP_SAFETY - currentX)\n        );\n        if (run.underline && visibleSegmentWidth > 0) {\n          doc.setDrawColor(color[0], color[1], color[2]);\n          doc.setLineWidth(0.12);\n          doc.line(currentX, baselineY + 0.45, currentX + visibleSegmentWidth, baselineY + 0.45);\n        }\n        currentX += actualSegmentWidth;`
      );

      if (next === code) {
        this.error("Case Detail PDF wrap patch made no change.");
      }

      patched = true;
      return { code: next, map: null };
    },

    buildEnd(error) {
      if (!error && !patched) {
        this.error("Case Detail PDF wrap patch was not applied during build.");
      }
    },
  };
}
