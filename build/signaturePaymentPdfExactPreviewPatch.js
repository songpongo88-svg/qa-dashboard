export function signaturePaymentPdfExactPreviewPatch() {
  return {
    name: "signature-payment-pdf-exact-approved-layout",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/src/SignatureCenterMockup.tsx")) return null;
      if (!code.includes('section("2. AGENT MONTHLY RANKING & PAYMENT DETAILS")')) return null;

      let next = code;
      next = next.replace("  const left = 13;\n  const right = 197;", "  const left = 15;\n  const right = 195;");

      const section2Start = next.indexOf('  section("2. AGENT MONTHLY RANKING & PAYMENT DETAILS");');
      const section2End = next.indexOf('  pdf.addPage("a4", "portrait");', section2Start);
      if (section2Start >= 0 && section2End > section2Start) {
        let block = next.slice(section2Start, section2End);
        block = block.replace(/  const agentW = [^\n]+;/, "  const agentW = 30;");
        block = block.replace(/  const refW = [^\n]+;/, "  const refW = 24;");
        block = block.replace(/  const casesW = [^\n]+;/, "  const casesW = 10.5;");
        block = block.replace(/  const avgW = [^\n]+;/, "  const avgW = 11.5;");
        block = block.replace(/  const gradeW = [^\n]+;/, "  const gradeW = 9.5;");
        block = block.replace(/  const incentiveW = [^\n]+;/, "  const incentiveW = 17;");
        block = block.replace(/  const statusW = [^\n]+;/, "  const statusW = 22.5;");
        block = block.replace(/  const signatureW = [^\n]+;/, "  const signatureW = 40;");
        block = block.replace(/let x = (?:left|rankingStartX|approvedRankingStartX);/g, "let x = 19;");
        next = next.slice(0, section2Start) + block + next.slice(section2End);
      }

      const section3Start = next.indexOf('  section("3. TEAM TOPIC PERFORMANCE");');
      const section3End = next.indexOf('  section("4. PAYMENT CERTIFICATION");', section3Start);
      if (section3Start >= 0 && section3End > section3Start) {
        let block = next.slice(section3Start, section3End);
        block = block.replace(
          /  const topicHeaders: Array<\[string, number\]> = \[[\s\S]*?\n  \];/,
          `  const topicHeaders: Array<[string, number]> = [\n    ["Topic", 10],\n    ["Description", 99],\n    ["Avg Score", 20],\n    ["Max", 14],\n    ["Avg %", 17],\n    ["Status", 20],\n  ];`
        );
        block = block.replace(/size: label === "Dashboard Status" \? 5\.3 : 6\.0,/g, 'size: label === "Status" ? 5.8 : 6.0,');
        block = block.replace(
          '    const status = avgPct === null ? "-" : avgPct >= 85 ? "Good" : avgPct >= 75 ? "Watch" : "Improve";',
          '    const status = avgPct === null ? "-" : avgPct >= 90 ? "Excellent" : avgPct >= 85 ? "Strong" : avgPct >= 80 ? "Standard" : "Improvement Needed";'
        );

        const renderStart = block.indexOf("    const statusWCell = topicHeaders[5][1];");
        const renderEnd = block.indexOf("    y += rowH;", renderStart);
        if (renderStart >= 0 && renderEnd > renderStart) {
          const plainStatus = `    const statusWCell = topicHeaders[5][1];\n    drawTableCell(x, y, statusWCell, rowH, "", { fill, align: "center" });\n    if (status === "Improvement Needed") {\n      text("Improvement", x + statusWCell / 2, y + 7.0, 4.8, false, black, { align: "center" });\n      text("Needed", x + statusWCell / 2, y + 10.8, 4.8, false, black, { align: "center" });\n    } else {\n      text(status, x + statusWCell / 2, y + 9.2, 5.6, false, status === "-" ? muted : black, { align: "center" });\n    }\n`;
          block = block.slice(0, renderStart) + plainStatus + block.slice(renderEnd);
        }
        next = next.slice(0, section3Start) + block + next.slice(section3End);
      }

      next = next.replace('  savePdfFile(pdf, fileName);\n  return fileName;', '  downloadBlob(pdf.output("blob"), fileName);\n  return fileName;');
      next = next.replace(
        /      console\.error\("Generate payment PDF failed", error\);\n      setPaymentMessage\(error instanceof Error \? `Generate PDF failed: \$\{error\.message\}` : "Generate PDF failed"\);/,
        `      console.error("Generate payment PDF failed", error);\n      const paymentPdfError = error instanceof Error ? error.message : "Unknown PDF error";\n      setPaymentMessage("Generate PDF failed: " + paymentPdfError);\n      window.alert("Monthly Payment PDF failed: " + paymentPdfError);`
      );

      return { code: next, map: null };
    },
  };
}
