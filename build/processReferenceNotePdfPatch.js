export function processReferenceNotePdfPatch() {
  return {
    name: "process-reference-note-pdf",
    enforce: "pre",
    transform(code, id) {
      const normalized = id.replace(/\\/g, "/").split("?")[0];
      if (!normalized.endsWith("/src/caseDetailOfficialPdf.ts")) return null;

      const original = code;
      let next = code;

      if (!next.includes("const drawProcessReferenceRowNoteV2")) {
        const anchor = "  const drawWideTextRow = ({";
        if (!next.includes(anchor)) {
          throw new Error("Process Reference note PDF patch v2 failed: wide text row anchor missing");
        }

        const helper = `  const isProcessReferenceNoteLineV2 = (line: RichTextRun[]) => {
    const text = line.map((run) => run.text).join(\"\").replace(/\\u200B/g, \"\").trim();
    return /^โน้ตเพิ่มเติม\\s*:/i.test(text);
  };

  const drawProcessReferenceLinesV2 = (
    lines: RichTextRun[][],
    x: number,
    yy: number,
    w: number,
    h: number,
    size: number,
    leading: number,
    valign: \"top\" | \"middle\" = \"top\"
  ) => {
    const lineH = lineHeight(size, leading);
    const blockH = lines.length * lineH;
    const startY = valign === \"middle\" ? yy + Math.max(2.2, (h - blockH) / 2 + lineH * 0.78) : yy + 3.8;

    lines.forEach((line, lineIndex) => {
      let currentX = x + TEXT_INNER_PAD_X;
      const baselineY = startY + lineIndex * lineH;
      const isNoteLine = isProcessReferenceNoteLineV2(line);

      if (isNoteLine) {
        fill([255, 247, 237]);
        stroke([245, 190, 64]);
        doc.setLineWidth(0.18);
        const boxY = baselineY - lineH * 0.9;
        const boxH = Math.max(3.0, lineH * 1.16);
        doc.roundedRect(x + 0.8, boxY, Math.max(2, w - 1.6), boxH, 0.9, 0.9, \"FD\");
        currentX = x + TEXT_INNER_PAD_X + 0.8;
      }

      line.forEach((run) => {
        setFont(isNoteLine ? \"bold\" : richRunFontStyle(run));
        doc.setFontSize(size);
        const color = isNoteLine ? ([120, 75, 0] as [number, number, number]) : richRunColor(run.color);
        doc.setTextColor(color[0], color[1], color[2]);
        doc.text(run.text, currentX, baselineY);
        const actualSegmentWidth = doc.getTextWidth(run.text);
        const visibleSegmentWidth = Math.min(
          actualSegmentWidth,
          Math.max(0, x + w - TEXT_INNER_PAD_X - TEXT_WRAP_SAFETY - currentX)
        );
        if (run.underline && visibleSegmentWidth > 0) {
          doc.setDrawColor(color[0], color[1], color[2]);
          doc.setLineWidth(0.12);
          doc.line(currentX, baselineY + 0.45, currentX + visibleSegmentWidth, baselineY + 0.45);
        }
        currentX += actualSegmentWidth;
      });
    });
    stroke(GRID);
  };

  const drawProcessReferenceRowNoteV2 = (text: unknown) => {
    const lines = layoutRichTextLines(text, wOf(1, 7), CASE_DESCRIPTION_TEXT_SIZE);
    let index = 0;
    while (index < lines.length) {
      if (bottom - y < 14) {
        doc.addPage();
        y = top;
      }
      const fitCount = Math.max(1, fitLinesForHeight(bottom - y, CASE_DESCRIPTION_TEXT_SIZE, CASE_DESCRIPTION_LINE_SPACING, 5));
      const chunk = lines.slice(index, index + fitCount);
      const rowH = Math.max(14, chunk.length * lineHeight(CASE_DESCRIPTION_TEXT_SIZE, CASE_DESCRIPTION_LINE_SPACING) + 5);
      label(0, y, 1, rowH, index === 0 ? \"Process\\nReference\" : \"Process\\nReference\\n(cont.)\");
      const valueX = xOf(1);
      const valueW = wOf(1, 7);
      rect(valueX, y, valueW, rowH, LIGHT_PURPLE);
      drawProcessReferenceLinesV2(chunk, valueX, y, valueW, rowH, CASE_DESCRIPTION_TEXT_SIZE, CASE_DESCRIPTION_LINE_SPACING, \"top\");
      y += rowH;
      index += chunk.length;
      if (index < lines.length) {
        doc.addPage();
        y = top;
      }
    }
  };

`;

        next = next.replace(anchor, helper + anchor);
      }

      const originalPattern = /    const processReferenceText = formatProcessReferenceForPdfV84\(caseItem\.processReference\);\n    if \(processReferenceText\) \{\n      drawWideRichTextRow\(\{\n        labelText: \"Process\\nReference\",\n        text: processReferenceText,\n        size: CASE_DESCRIPTION_TEXT_SIZE,\n        leading: CASE_DESCRIPTION_LINE_SPACING,\n        minH: 14,\n        padY: 5,\n      \}\);\n    \}/g;

      const appealPattern = /    const processReferenceText = safeMultiline\(caseItem\.processReference, \"\"\);\n    if \(processReferenceText\) \{\n      drawWideRichTextRow\(\{\n        labelText: \"Process\\nReference\",\n        text: caseItem\.processReference,\n        size: CASE_DESCRIPTION_TEXT_SIZE,\n        leading: CASE_DESCRIPTION_LINE_SPACING,\n        minH: 14,\n        padY: 5,\n      \}\);\n    \}/g;

      const originalMatches = next.match(originalPattern) || [];
      const appealMatches = next.match(appealPattern) || [];
      if (originalMatches.length !== 1) {
        throw new Error(`Process Reference note PDF patch v2 failed: expected 1 Original QA Report block, found ${originalMatches.length}`);
      }
      if (appealMatches.length !== 1) {
        throw new Error(`Process Reference note PDF patch v2 failed: expected 1 Appeal block, found ${appealMatches.length}`);
      }

      next = next.replace(
        originalPattern,
        `    const processReferenceText = formatProcessReferenceForPdfV84(caseItem.processReference);\n    if (processReferenceText) {\n      drawProcessReferenceRowNoteV2(processReferenceText);\n    }`
      );

      next = next.replace(
        appealPattern,
        `    const processReferenceText = safeMultiline(caseItem.processReference, \"\");\n    if (processReferenceText) {\n      drawProcessReferenceRowNoteV2(caseItem.processReference);\n    }`
      );

      if (!next.includes("/^โน้ตเพิ่มเติม\\s*:/i")) {
        throw new Error("Process Reference note PDF patch v2 failed: note detector missing");
      }
      if ((next.match(/drawProcessReferenceRowNoteV2\(processReferenceText\)/g) || []).length !== 1) {
        throw new Error("Process Reference note PDF patch v2 failed: Original QA Report wiring missing");
      }
      if ((next.match(/drawProcessReferenceRowNoteV2\(caseItem\.processReference\)/g) || []).length !== 1) {
        throw new Error("Process Reference note PDF patch v2 failed: Appeal wiring missing");
      }
      if (next === original) {
        throw new Error("Process Reference note PDF patch v2 failed: no source changes were applied");
      }

      console.log("[process-reference-note-pdf] v2 wired Original QA Report + Appeal PDF note callouts");
      return { code: next, map: null };
    },
  };
}
