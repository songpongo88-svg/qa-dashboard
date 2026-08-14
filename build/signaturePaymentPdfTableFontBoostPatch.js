export function signaturePaymentPdfTableFontBoostPatch() {
  return {
    name: "signature-payment-pdf-table-font-boost",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/src/SignatureCenterMockup.tsx")) return null;
      if (!code.includes('section("2. AGENT MONTHLY RANKING & PAYMENT DETAILS")')) return null;

      let next = code;

      // Agent ranking table: increase header/body/status text without changing row height.
      next = next.replace(
        'size: label === "Document Ref." ? 6.6 : 7.2,',
        'size: label === "Document Ref." ? 7.4 : 8.0,'
      );
      next = next.replace(
        'size: colIndex === 1 ? 7.0 : colIndex === 2 ? 6.5 : 7.0,',
        'size: colIndex === 1 ? 7.8 : colIndex === 2 ? 7.2 : 7.6,'
      );
      next = next.replace(
        'size: 6.6,\n      bold: true,\n      align: "center",\n      maxLines: 2,',
        'size: 7.2,\n      bold: true,\n      align: "center",\n      maxLines: 2,'
      );

      // Team topic table: increase header, description, metrics and status text.
      next = next.replace(
        'size: label === "Status" ? 6.7 : 7.0,',
        'size: label === "Status" ? 7.3 : 7.6,'
      );
      next = next.replace(
        'size: 6.7,\n      bold: true,\n      align: "left",',
        'size: 7.4,\n      bold: true,\n      align: "left",'
      );
      next = next.replace(/size: 6\.9,/g, 'size: 7.4,');
      next = next.replace(
        'text("Improvement Needed", x + statusWCell / 2, y + 6.1, 5.4, false, black, { align: "center" });',
        'text("Improvement Needed", x + statusWCell / 2, y + 6.1, 5.9, false, black, { align: "center" });'
      );
      next = next.replace(
        'text(status, x + statusWCell / 2, y + 6.1, 6.4, false, status === "-" ? muted : black, { align: "center" });',
        'text(status, x + statusWCell / 2, y + 6.1, 7.0, false, status === "-" ? muted : black, { align: "center" });'
      );

      return next === code ? null : { code: next, map: null };
    },
  };
}
