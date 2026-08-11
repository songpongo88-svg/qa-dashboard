export function signaturePaymentPdfExactPreviewPatch() {
  return {
    name: "signature-payment-pdf-exact-preview-v4",
    enforce: "pre",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/src/SignatureCenterMockup.tsx")) return null;
      if (!code.includes('section("2. AGENT MONTHLY RANKING & PAYMENT DETAILS")')) return null;

      let next = code;
      const marginBefore = "  const left = 13;\n  const right = 197;";
      const marginAfter = "  const left = 15;\n  const right = 195;";
      if (!next.includes(marginBefore)) {
        throw new Error("Exact Preview v4 patch: page margin target not found");
      }
      next = next.replace(marginBefore, marginAfter);

      const widthsBefore = `  setFont(6.3, true, black);\n  const measuredAgentW = sortedDocs.length\n    ? Math.max(...sortedDocs.map((doc) => pdf.getTextWidth(String(doc.agentName || "")) + 5))\n    : 31;\n  const seqW = 7;\n  const agentW = Math.min(34, Math.max(31, measuredAgentW));\n  const refW = 25;\n  const casesW = 11;\n  const avgW = 12;\n  const gradeW = 10;\n  const incentiveW = 18;\n  const statusW = 25;\n  const signatureW = tableW - (seqW + agentW + refW + casesW + avgW + gradeW + incentiveW + statusW);`;

      const widthsAfter = `  // Approved Preview v4: fixed A4 portrait geometry. Do not auto-fit these columns.\n  const seqW = 7;\n  const agentW = 31;\n  const refW = 25;\n  const casesW = 11;\n  const avgW = 12;\n  const gradeW = 10;\n  const incentiveW = 18;\n  const signatureW = 42;\n  const statusW = 24;`;

      if (!next.includes(widthsBefore)) {
        throw new Error("Exact Preview v4 patch: ranking width target not found");
      }
      next = next.replace(widthsBefore, widthsAfter);

      return { code: next, map: null };
    },
  };
}
