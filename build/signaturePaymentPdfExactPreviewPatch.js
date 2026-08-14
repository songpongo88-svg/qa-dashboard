export function signaturePaymentPdfExactPreviewPatch() {
  return {
    name: "signature-payment-pdf-exact-approved-layout",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/src/SignatureCenterMockup.tsx")) return null;
      if (!code.includes('section("2. AGENT MONTHLY RANKING & PAYMENT DETAILS")')) return null;

      let next = code;
      next = next.replace("  const left = 13;\n  const right = 197;", "  const left = 15;\n  const right = 195;");

      // Keep the payment summary formal: plain document status, no UI-style badge.
      next = next.replace(
        '{ label: "Document Status", value: sortedDocs.length ? "READY TO EXPORT" : "HOLD", badge: true },',
        '{ label: "Document Status", value: sortedDocs.length ? "READY TO EXPORT" : "HOLD" },'
      );

      const section2Start = next.indexOf('  section("2. AGENT MONTHLY RANKING & PAYMENT DETAILS");');
      const section2End = next.indexOf('  pdf.addPage("a4", "portrait");', section2Start);
      if (section2Start >= 0 && section2End > section2Start) {
        let block = next.slice(section2Start, section2End);

        // Formal payment table: use the full approved 180 mm width with readable compact rows.
        block = block.replace(/  const measuredAgentW = sortedDocs\.length[\s\S]*?\n    : 31;\n/, "");
        block = block.replace(/  const seqW = [^\n]+;/, "  const seqW = 9;");
        block = block.replace(/  const agentW = [^\n]+;/, "  const agentW = 43;");
        block = block.replace(/  const refW = [^\n]+;/, "  const refW = 31;");
        block = block.replace(/  const casesW = [^\n]+;/, "  const casesW = 12;");
        block = block.replace(/  const avgW = [^\n]+;/, "  const avgW = 13;");
        block = block.replace(/  const gradeW = [^\n]+;/, "  const gradeW = 11;");
        block = block.replace(/  const incentiveW = [^\n]+;/, "  const incentiveW = 20;");
        block = block.replace(/  const statusW = [^\n]+;/, "  const statusW = 41;");

        block = block.replace(/  const signatureW = [^\n]+;/, "  const signatureW = 0;");
        block = block.replace(/\s*\["Agent Signature",\s*signatureW\],?\n/g, "\n");
        block = block.replace(
          /  const rankingHeaders: Array<\[string, number\]> = \[[\s\S]*?\n  \];/,
          `  const rankingHeaders: Array<[string, number]> = [\n    ["Seq", seqW],\n    ["Agent", agentW],\n    ["Document Ref.", refW],\n    ["Cases", casesW],\n    ["Avg", avgW],\n    ["Grade", gradeW],\n    ["Incentive", incentiveW],\n    ["Status", statusW],\n  ];`
        );

        block = block.replace(/let x = (?:left|rankingStartX|approvedRankingStartX|15|19|27|29|35);/g, "let x = 15;");
        block = block.replace(/    const rowH = \d+(?:\.\d+)?;/, "    const rowH = 9.0;");

        // Increase Agent table font sizes while keeping row height unchanged.
        block = block.replace(
          /size: label === "Document Ref\." \|\| label === "Agent Signature" \? 5\.8 : 6\.3,/g,
          'size: label === "Document Ref." ? 6.6 : 7.2,'
        );
        block = block.replace(/size: colIndex === 1 \? 6\.0 : colIndex === 2 \? 5\.5 : 6\.2,/g, "size: colIndex === 1 ? 7.0 : colIndex === 2 ? 6.5 : 7.0,");

        const signatureRenderStart = block.indexOf("    const agentSignatureW = rankingHeaders[7][1];");
        const rowEnd = block.indexOf("    y += rowH;", signatureRenderStart);
        if (signatureRenderStart >= 0 && rowEnd > signatureRenderStart) {
          const statusOnly = `    const rowStatus = agentWaived ? "Waived - Resigned" : agentSigned ? "Completed" : "Pending";\n    const statusColumnW = rankingHeaders[rankingHeaders.length - 1][1];\n    drawTableCell(x, y, statusColumnW, rowH, rowStatus, {\n      fill,\n      color: agentSigned ? green : agentWaived ? amber : muted,\n      size: 6.6,\n      bold: true,\n      align: "center",\n      maxLines: 2,\n    });\n`;
          block = block.slice(0, signatureRenderStart) + statusOnly + block.slice(rowEnd);
        }

        block = block.replace(/\["Agent Signature",\s*signatureW\],?/g, "");
        next = next.slice(0, section2Start) + block + next.slice(section2End);
      }

      // Remove only the explicit page break immediately before Team Topic Performance.
      next = next.replace(
        /\n\s*pdf\.addPage\("a4",\s*"portrait"\);\s*\n\s*drawHeader\(\);\s*\n\s*(?=section\("3\. TEAM TOPIC PERFORMANCE"\);)/,
        "\n\n  "
      );

      // Add a small visual gap after the Agent table so Section 3 does not feel cramped.
      next = next.replace(
        '  section("3. TEAM TOPIC PERFORMANCE");',
        '  y += 3.5;\n  section("3. TEAM TOPIC PERFORMANCE");'
      );

      const section3Start = next.indexOf('  section("3. TEAM TOPIC PERFORMANCE");');
      const section3End = next.indexOf('  section("4. PAYMENT CERTIFICATION");', section3Start);
      if (section3Start >= 0 && section3End > section3Start) {
        let block = next.slice(section3Start, section3End);

        block = block.replace(
          /  const topicHeaders: Array<\[string, number\]> = \[[\s\S]*?\n  \];/,
          `  const topicHeaders: Array<[string, number]> = [\n    ["Topic", 9],\n    ["Description", 101],\n    ["Avg Score", 20],\n    ["Max", 15],\n    ["Avg %", 15],\n    ["Status", 20],\n  ];`
        );
        block = block.replace(/  let topicX = (?:left|\d+(?:\.\d+)?);/, "  let topicX = 15;");
        block = block.replace(/    let x = (?:left|\d+(?:\.\d+)?);/g, "    let x = 15;");
        block = block.replace(/    const rowH = \d+(?:\.\d+)?;/, "    const rowH = 10.0;");
        block = block.replace(/Dashboard Status/g, "Status");
        block = block.replace(/size: label === "Status" \? 5\.3 : 6\.0,/g, 'size: label === "Status" ? 6.7 : 7.0,');
        block = block.replace(/size: label === "Status" \? 5\.8 : 6\.0,/g, 'size: label === "Status" ? 6.7 : 7.0,');
        block = block.replace(
          '    const status = avgPct === null ? "-" : avgPct >= 85 ? "Good" : avgPct >= 75 ? "Watch" : "Improve";',
          '    const status = avgPct === null ? "-" : avgPct >= 90 ? "Excellent" : avgPct >= 85 ? "Strong" : avgPct >= 80 ? "Standard" : "Improvement Needed";'
        );

        const descriptionStart = block.indexOf("    const descriptionW = topicHeaders[1][1];");
        const descriptionEndMarker = "    x += descriptionW;";
        const descriptionEnd = block.indexOf(descriptionEndMarker, descriptionStart);
        if (descriptionStart >= 0 && descriptionEnd > descriptionStart) {
          const compactDescription = `    const descriptionW = topicHeaders[1][1];\n    const topicLabel = splitTopicTitle(topic.title);\n    const combinedTopicTitle = topicLabel.secondary\n      ? topicLabel.primary + " (" + topicLabel.secondary + ")"\n      : topicLabel.primary;\n    drawTableCell(x, y, descriptionW, rowH, combinedTopicTitle, {\n      fill,\n      size: 6.7,\n      bold: true,\n      align: "left",\n      maxLines: 1,\n    });\n    x += descriptionW;`;
          block = block.slice(0, descriptionStart) + compactDescription + block.slice(descriptionEnd + descriptionEndMarker.length);
        }

        // Increase metric font sizes slightly.
        block = block.replace(/size: 6\.1,/g, "size: 6.9,");

        const renderStart = block.indexOf("    const statusWCell = topicHeaders[5][1];");
        const renderEnd = block.indexOf("    y += rowH;", renderStart);
        if (renderStart >= 0 && renderEnd > renderStart) {
          const plainStatus = `    const statusWCell = topicHeaders[5][1];\n    drawTableCell(x, y, statusWCell, rowH, "", { fill, align: "center" });\n    if (status === "Improvement Needed") {\n      text("Improvement Needed", x + statusWCell / 2, y + 6.1, 5.4, false, black, { align: "center" });\n    } else {\n      text(status, x + statusWCell / 2, y + 6.1, 6.4, false, status === "-" ? muted : black, { align: "center" });\n    }\n`;
          block = block.slice(0, renderStart) + plainStatus + block.slice(renderEnd);
        }
        next = next.slice(0, section3Start) + block + next.slice(section3End);
      }

      // Increase certification text readability without changing its structure.
      const section4Start = next.indexOf('  section("4. PAYMENT CERTIFICATION");');
      const authStartForSection4 = next.indexOf('  section("5. AUTHORIZATION & SIGNATURE");', section4Start);
      const footerStartForSection4 = next.indexOf("  const totalPages = pdf.getNumberOfPages();", section4Start);
      const section4End = authStartForSection4 >= 0 ? authStartForSection4 : footerStartForSection4;
      if (section4Start >= 0 && section4End > section4Start) {
        let block = next.slice(section4Start, section4End);
        block = block.replace(/text\(item\.label, x, y \+ 3\.8, 6\.1,/g, "text(item.label, x, y + 3.8, 7.0,");
        block = block.replace(/text\(item\.value, x, y \+ 9\.2, 8\.2,/g, "text(item.value, x, y + 9.2, 9.2,");
        block = block.replace(/text\("Certification", left, y \+ 5\.2, 6\.2,/g, 'text("Certification", left, y + 5.2, 7.0,');
        block = block.replace(/text\("Monthly QA incentive payment summary prepared for payment processing\."[^\n]*6\.8,/g, (match) => match.replace("6.8", "7.6"));
        next = next.slice(0, section4Start) + block + next.slice(section4End);
      }

      const authStart = next.indexOf('  section("5. AUTHORIZATION & SIGNATURE");');
      const footerStart = next.indexOf("  const totalPages = pdf.getNumberOfPages();", authStart);
      if (authStart >= 0 && footerStart > authStart) {
        next = next.slice(0, authStart) + next.slice(footerStart);
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
