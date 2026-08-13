export function signaturePaymentPdfExactPreviewPatch() {
  return {
    name: "signature-payment-pdf-exact-approved-layout",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/src/SignatureCenterMockup.tsx")) return null;
      if (!code.includes('section("2. AGENT MONTHLY RANKING & PAYMENT DETAILS")')) return null;

      let next = code;

      // Run after the base generator and normalize the document body to the approved layout.
      next = next.replace(
        /  const left = \d+(?:\.\d+)?;\n  const right = \d+(?:\.\d+)?;/,
        "  const left = 15;\n  const right = 195;"
      );

      // Section 2 - compact fixed Agent table. Do not auto-fit from names/signatures.
      const section2Start = next.indexOf('  section("2. AGENT MONTHLY RANKING & PAYMENT DETAILS");');
      const section2End = next.indexOf('  pdf.addPage("a4", "portrait");', section2Start);
      if (section2Start >= 0 && section2End > section2Start) {
        let block = next.slice(section2Start, section2End);
        block = block.replace(
          /  setFont\(6\.3, true, black\);[\s\S]*?  const rankingHeaders: Array<\[string, number\]> = \[/,
          `  // Approved compact Agent table. Total width = 172 mm, centered.\n  const seqW = 7;\n  const agentW = 30;\n  const refW = 24;\n  const casesW = 10.5;\n  const avgW = 11.5;\n  const gradeW = 9.5;\n  const incentiveW = 17;\n  const signatureW = 40;\n  const statusW = 22.5;\n  const rankingHeaders: Array<[string, number]> = [`
        );

        // Always declare the approved table start explicitly. This prevents runtime scope errors
        // even when a browser/Vite transform changes the surrounding declaration block.
        block = block.replace(
          '  section("2. AGENT MONTHLY RANKING & PAYMENT DETAILS");',
          '  section("2. AGENT MONTHLY RANKING & PAYMENT DETAILS");\n  const approvedRankingStartX = 19;'
        );
        block = block.replace(/let x = left;/g, "let x = approvedRankingStartX;");

        // Never ship a partially transformed ranking layout: fail at build time instead of runtime.
        if (block.includes("measuredAgentW")) {
          throw new Error("Monthly Payment PDF exact Agent table transform did not apply");
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

        // Keep safe fallback color variables so PDF generation can never fail even if a browser build preserves the old render block.
        block = block.replace(
          /    const status =[^\n]*\n    const statusBg:[^\n]*\n    const statusFg:[^\n]*\n/,
          `    const status =\n      avgPct === null\n        ? "-"\n        : avgPct >= 90\n          ? "Excellent"\n          : avgPct >= 85\n            ? "Strong"\n            : avgPct >= 80\n              ? "Standard"\n              : "Improvement Needed";\n    const statusBg: [number, number, number] = [255, 255, 255];\n    const statusFg: [number, number, number] = black;\n`
        );

        // Approved design: plain Status text, no pill / no colored background.
        block = block.replace(
          /    const statusWCell = topicHeaders\[5\]\[1\];[\s\S]*?(?=    y \+= rowH;)/,
          `    const statusWCell = topicHeaders[5][1];\n    drawTableCell(x, y, statusWCell, rowH, "", { fill, align: "center" });\n    if (status === "Improvement Needed") {\n      text("Improvement", x + statusWCell / 2, y + 7.0, 4.8, false, black, { align: "center" });\n      text("Needed", x + statusWCell / 2, y + 10.8, 4.8, false, black, { align: "center" });\n    } else {\n      text(status, x + statusWCell / 2, y + 9.2, 5.6, false, status === "-" ? muted : black, { align: "center" });\n    }\n`
        );

        next = next.slice(0, section3Start) + block + next.slice(section3End);
      }

      // Use the same direct Blob download path that the other working PDFs use.
      next = next.replace(
        '  savePdfFile(pdf, fileName);\n  return fileName;',
        '  downloadBlob(pdf.output("blob"), fileName);\n  return fileName;'
      );

      // Surface runtime PDF errors immediately instead of failing silently in the sidebar message.
      next = next.replace(
        /      console\.error\("Generate payment PDF failed", error\);\n      setPaymentMessage\(error instanceof Error \? `Generate PDF failed: \$\{error\.message\}` : "Generate PDF failed"\);/,
        `      console.error("Generate payment PDF failed", error);\n      const paymentPdfError = error instanceof Error ? error.message : "Unknown PDF error";\n      setPaymentMessage("Generate PDF failed: " + paymentPdfError);\n      window.alert("Monthly Payment PDF failed: " + paymentPdfError);`
      );

      return { code: next, map: null };
    },
  };
}
