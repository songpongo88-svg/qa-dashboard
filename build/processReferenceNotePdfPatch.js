export function processReferenceNotePdfPatch() {
  return {
    name: "process-reference-note-pdf",
    enforce: "pre",
    transform(code, id) {
      const normalized = id.replace(/\\/g, "/");
      if (!normalized.endsWith("/src/caseDetailOfficialPdf.ts")) return null;

      const original = code;
      let next = code;

      if (!next.includes("const drawProcessReferenceRowNoteV1")) {
        const anchor = "  const drawWideTextRow = ({";
        if (!next.includes(anchor)) {
          throw new Error("Process Reference note PDF patch failed: wide text row anchor missing");
        }

        const helper = `  const isProcessReferenceNoteLineV1 = (line: RichTextRun[]) => {
    const text = line.map((run) => run.text).join(\"\").trim();
    return /^โน้ตเพิ่มเติม\\s*:/i.test(text);
  };

  const drawProcessReferenceLinesV1 = (
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
      const isNoteLine = isProcessReferenceNoteLineV1(line);

      if (isNoteLine) {
        fill([255, 249, 230]);
        stroke([236, 190, 78]);
        doc.setLineWidth(0.16);
        const boxY = baselineY - lineH * 0.82;
        const boxH = Math.max(2.4, lineH * 0.98);
        doc.roundedRect(x + 0.7, boxY, Math.max(2, w - 1.4), boxH, 1.0, 1.0, \"FD\");
      }

      line.forEach((run) => {
        setFont(richRunFontStyle(run));
        doc.setFontSize(size);
        const color = isNoteLine ? ([124, 84, 0] as [number, number, number]) : richRunColor(run.color);
        doc.setTextColor(color[0], color[1], color[2]);
        doc.text(run.text, currentX, baselineY);
        const segmentWidth = Math.min(
          doc.getTextWidth(run.text),
          Math.max(0, x + w - TEXT_INNER_PAD_X - TEXT_WRAP_SAFETY - currentX)
        );
        if (run.underline && segmentWidth > 0) {
          doc.setDrawColor(color[0], color[1], color[2]);
          doc.setLineWidth(0.12);
          doc.line(currentX, baselineY + 0.45, currentX + segmentWidth, baselineY + 0.45);
        }
        currentX += segmentWidth;
      });
    });
    stroke(GRID);
  };

  const drawProcessReferenceRowNoteV1 = (text: unknown) => {
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
      drawProcessReferenceLinesV1(chunk, valueX, y, valueW, rowH, CASE_DESCRIPTION_TEXT_SIZE, CASE_DESCRIPTION_LINE_SPACING, \"top\");
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

      const blockPattern = /    const processReferenceText = safeMultiline\(caseItem\.processReference, \"\"\);\n    if \(processReferenceText\) \{\n      drawWideRichTextRow\(\{\n        labelText: \"Process\\nReference\",\n        text: caseItem\.processReference,\n        size: CASE_DESCRIPTION_TEXT_SIZE,\n        leading: CASE_DESCRIPTION_LINE_SPACING,\n        minH: 14,\n        padY: 5,\n      \}\);\n    \}/g;

      const matches = next.match(blockPattern) || [];
      if (matches.length < 1) {
        throw new Error("Process Reference note PDF patch failed: Process Reference block missing");
      }

      next = next.replace(
        blockPattern,
        `    const processReferenceText = safeMultiline(caseItem.processReference, \"\");\n    if (processReferenceText) {\n      drawProcessReferenceRowNoteV1(caseItem.processReference);\n    }`
      );

      if (!next.includes("/^โน้ตเพิ่มเติม\\s*:/i")) {
        throw new Error("Process Reference note PDF patch failed: note detector missing");
      }
      if ((next.match(/drawProcessReferenceRowNoteV1\(caseItem\.processReference\)/g) || []).length < 1) {
        throw new Error("Process Reference note PDF patch failed: Process Reference wiring missing");
      }
      if (next === original) {
        throw new Error("Process Reference note PDF patch failed: no source changes were applied");
      }

      return { code: next, map: null };
    },
  };
}
