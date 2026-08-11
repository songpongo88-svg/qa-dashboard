function replaceRequired(code, before, after, label) {
  if (!code.includes(before)) {
    throw new Error(`Exact Payment PDF patch: ${label} target not found`)
  }
  return code.replace(before, after)
}

export function signaturePaymentPdfExactPreviewPatch() {
  return {
    name: "signature-payment-pdf-exact-approved-layout",
    enforce: "pre",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/src/SignatureCenterMockup.tsx")) return null;
      if (!code.includes('section("2. AGENT MONTHLY RANKING & PAYMENT DETAILS")')) return null;

      let next = code;

      // Keep the approved document body margins for all sections.
      next = replaceRequired(
        next,
        "  const left = 13;\n  const right = 197;",
        "  const left = 15;\n  const right = 195;",
        "page margins"
      );

      // Section 2: use a narrower fixed table, centered on A4. Never auto-fit.
      const widthsBefore = `  setFont(6.3, true, black);\n  const measuredAgentW = sortedDocs.length\n    ? Math.max(...sortedDocs.map((doc) => pdf.getTextWidth(String(doc.agentName || "")) + 5))\n    : 31;\n  const seqW = 7;\n  const agentW = Math.min(34, Math.max(31, measuredAgentW));\n  const refW = 25;\n  const casesW = 11;\n  const avgW = 12;\n  const gradeW = 10;\n  const incentiveW = 18;\n  const statusW = 25;\n  const signatureW = tableW - (seqW + agentW + refW + casesW + avgW + gradeW + incentiveW + statusW);`;

      const widthsAfter = `  // Approved compact Agent table. Total = 172 mm, centered.\n  const rankingStartX = 19;\n  const seqW = 7;\n  const agentW = 30;\n  const refW = 24;\n  const casesW = 10.5;\n  const avgW = 11.5;\n  const gradeW = 9.5;\n  const incentiveW = 17;\n  const signatureW = 40;\n  const statusW = 22.5;`;

      next = replaceRequired(next, widthsBefore, widthsAfter, "agent ranking widths");
      next = replaceRequired(
        next,
        "  const drawRankingHeader = () => {\n    let x = left;",
        "  const drawRankingHeader = () => {\n    let x = rankingStartX;",
        "agent ranking header start"
      );
      next = replaceRequired(
        next,
        "    let x = left;\n    values.forEach((value, colIndex) => {",
        "    let x = rankingStartX;\n    values.forEach((value, colIndex) => {",
        "agent ranking row start"
      );

      // Section 3: approved Topic table totals exactly 180 mm.
      const topicHeadersBefore = `  const topicHeaders: Array<[string, number]> = [\n    ["Topic", 9],\n    ["Description", 103],\n    ["Avg Score", 20],\n    ["Max", 15],\n    ["Avg %", 17],\n    ["Dashboard Status", 20],\n  ];`;

      const topicHeadersAfter = `  const topicHeaders: Array<[string, number]> = [\n    ["Topic", 10],\n    ["Description", 99],\n    ["Avg Score", 20],\n    ["Max", 14],\n    ["Avg %", 17],\n    ["Status", 20],\n  ];`;

      next = replaceRequired(next, topicHeadersBefore, topicHeadersAfter, "topic table widths");
      next = next.replace('size: label === "Dashboard Status" ? 5.3 : 6.0,', 'size: label === "Status" ? 5.8 : 6.0,');

      // Topic Status follows Monthly Grade & Incentive Criteria exactly.
      const statusLogicBefore = `    const status = avgPct === null ? "-" : avgPct >= 85 ? "Good" : avgPct >= 75 ? "Watch" : "Improve";\n    const statusBg: [number, number, number] = status === "Good" ? [220, 252, 231] : status === "Watch" ? [254, 243, 199] : status === "Improve" ? [255, 228, 230] : palePurple2;\n    const statusFg: [number, number, number] = status === "Good" ? green : status === "Watch" ? amber : status === "Improve" ? red : muted;`;

      const statusLogicAfter = `    const status =\n      avgPct === null\n        ? "-"\n        : avgPct >= 90\n          ? "Excellent"\n          : avgPct >= 85\n            ? "Strong"\n            : avgPct >= 80\n              ? "Standard"\n              : "Improvement Needed";`;

      next = replaceRequired(next, statusLogicBefore, statusLogicAfter, "topic status logic");

      // The approved dashboard criteria shows Status as plain text: no pill, no colored box.
      const statusRenderBefore = `    const statusWCell = topicHeaders[5][1];\n    drawTableCell(x, y, statusWCell, rowH, "", { fill, align: "center" });\n    if (status !== "-") {\n      pdf.setFillColor(statusBg[0], statusBg[1], statusBg[2]);\n      pdf.roundedRect(x + 2.1, y + 4.5, statusWCell - 4.2, 7, 3.2, 3.2, "F");\n      text(status, x + statusWCell / 2, y + 9.5, 5.8, true, statusFg, { align: "center" });\n    } else {\n      text("-", x + statusWCell / 2, y + 9.2, 5.8, false, muted, { align: "center" });\n    }`;

      const statusRenderAfter = `    const statusWCell = topicHeaders[5][1];\n    drawTableCell(x, y, statusWCell, rowH, "", { fill, align: "center" });\n    if (status === "Improvement Needed") {\n      text("Improvement", x + statusWCell / 2, y + 7.0, 4.8, false, black, { align: "center" });\n      text("Needed", x + statusWCell / 2, y + 10.8, 4.8, false, black, { align: "center" });\n    } else {\n      text(status, x + statusWCell / 2, y + 9.2, 5.6, false, status === "-" ? muted : black, { align: "center" });\n    }`;

      next = replaceRequired(next, statusRenderBefore, statusRenderAfter, "topic status rendering");

      return { code: next, map: null };
    },
  };
}
