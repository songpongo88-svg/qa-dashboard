export function signaturePaymentPdfExactPreviewPatch() {
  return {
    name: "signature-payment-pdf-exact-approved-layout",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/src/SignatureCenterMockup.tsx")) return null;
      if (!code.includes('section("2. AGENT MONTHLY RANKING & PAYMENT DETAILS")')) return null;

      let next = code;

      // Normalize the document body to the approved portrait layout.
      next = next.replace(
        /  const left = \d+(?:\.\d+)?;\n  const right = \d+(?:\.\d+)?;/,
        "  const left = 15;\n  const right = 195;"
      );

      // Section 2 - compact fixed Agent table. Apply each width independently so the
      // transform is not coupled to the surrounding source layout.
      const section2Start = next.indexOf('  section("2. AGENT MONTHLY RANKING & PAYMENT DETAILS");');
      const section2End = next.indexOf('  pdf.addPage("a4", "portrait");', section2Start);
      if (section2Start >= 0 && section2End > section2Start) {
        let block = next.slice(section2Start, section2End);

        block = block.replace(
          '  section("2. AGENT MONTHLY RANKING & PAYMENT DETAILS");',
          '  section("2. AGENT MONTHLY RANKING & PAYMENT DETAILS");\n  const approvedRankingStartX = 19;'
        );
        block = block.replace(/  const measuredAgentW = sortedDocs\.length[\s\S]*?\n    : 31;\n/, "");
        block = block.replace(/  const seqW = [^;]+;/, "  const seqW = 7;");
        block = block.replace(/  const agentW = [^;]+;/, "  const agentW = 30;");
        block = block.replace(/  const refW = [^;]+;/, "  const refW = 24;");
        block = block.replace(/  const casesW = [^;]+;/, "  const casesW = 10.5;");
        block = block.replace(/  const avgW = [^;]+;/, "  const avgW = 11.5;");
        block = block.replace(/  const gradeW = [^;]+;/, "  const gradeW = 9.5;");
        block = block.replace(/  const incentiveW = [^;]+;/, "  const incentiveW = 17;");
        block = block.replace(/  const statusW = [^;]+;/, "  const statusW = 22.5;");
        block = block.replace(/  const signatureW = [^;]+;/, "  const signatureW = 40;");
        block = block.replace(/let x = left;/g, "let x = approvedRankingStartX;");

        if (block.includes("measuredAgentW") || !block.includes("const approvedRankingStartX = 19;")) {
          throw new Error("Monthly Payment PDF fixed Agent table transform did not apply");
        }

        next = next.slice(0, section2Start) + block + next.slice(section2End);
      }

      // Section 3 - approved Topic table and Status wording.
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
          /    const status =[^\n]*\n    const statusBg:[^\n]*\n    const statusFg:[^\n]*\n/,
          `    const status =\n      avgPct === null\n        ? "-"\n        : avgPct >= 90\n          ? "Excellent"\n          : avgPct >= 85\n            ? "Strong"\n            : avgPct >= 80\n              ? "Standard"\n              : "Improvement Needed";\n    const statusBg: [number, number, number] = [255, 255, 255];\n    const statusFg: [number, number, number] = black;\n`
        );

        block = block.replace(
          /    const statusWCell = topicHeaders\[5\]\[1\];[\s\S]*?(?=    y \+= rowH;)/,
          `    const statusWCell = topicHeaders[5][1];\n    drawTableCell(x, y, statusWCell, rowH, "", { fill, align: "center" });\n    if (status === "Improvement Needed") {\n      text("Improvement", x + statusWCell / 2, y + 7.0, 4.8, false, black, { align: "center" });\n      text("Needed", x + statusWCell / 2, y + 10.8, 4.8, false, black, { align: "center" });\n    } else {\n      text(status, x + statusWCell / 2, y + 9.2, 5.6, false, status === "-" ? muted : black, { align: "center" });\n    }\n`
        );

        next = next.slice(0, section3Start) + block + next.slice(section3End);
      }

      // Use direct Blob download and surface any runtime failure to the user.
      next = next.replace(
        '  savePdfFile(pdf, fileName);\n  return fileName;',
        '  downloadBlob(pdf.output("blob"), fileName);\n  return fileName;'
      );
      next = next.replace(
        /      console\.error\("Generate payment PDF failed", error\);\n      setPaymentMessage\(error instanceof Error \? `Generate PDF failed: \$\{error\.message\}` : "Generate PDF failed"\);/,
        `      console.error("Generate payment PDF failed", error);\n      const paymentPdfError = error instanceof Error ? error.message : "Unknown PDF error";\n      setPaymentMessage("Generate PDF failed: " + paymentPdfError);\n      window.alert("Monthly Payment PDF failed: " + paymentPdfError);`
      );

      return { code: next, map: null };
    },
  };
}
