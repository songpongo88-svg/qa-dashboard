export function signaturePaymentPdfTableFontBoostPatch() {
  return {
    name: "signature-payment-pdf-table-font-boost",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/src/SignatureCenterMockup.tsx")) return null;
      if (!code.includes('section("2. AGENT MONTHLY RANKING & PAYMENT DETAILS")')) return null;

      let next = code;

      // Agent ranking table: make text clearly readable at 100% PDF zoom without changing row height.
      next = next.replace(
        'size: label === "Document Ref." ? 6.6 : 7.2,',
        'size: label === "Document Ref." ? 8.6 : 9.3,'
      );
      next = next.replace(
        'size: colIndex === 1 ? 7.0 : colIndex === 2 ? 6.5 : 7.0,',
        'size: colIndex === 1 ? 9.0 : colIndex === 2 ? 8.2 : 8.8,'
      );
      next = next.replace(
        'size: 6.6,\n      bold: true,\n      align: "center",\n      maxLines: 2,',
        'size: 8.3,\n      bold: true,\n      align: "center",\n      maxLines: 2,'
      );

      // Team topic table: enlarge header, description, metrics and status while retaining the one-page layout.
      next = next.replace(
        'size: label === "Status" ? 6.7 : 7.0,',
        'size: label === "Status" ? 8.5 : 9.0,'
      );
      next = next.replace(
        'size: 6.7,\n      bold: true,\n      align: "left",',
        'size: 8.7,\n      bold: true,\n      align: "left",'
      );
      next = next.replace(/size: 6\.9,/g, 'size: 8.6,');
      next = next.replace(
        'text("Improvement Needed", x + statusWCell / 2, y + 6.1, 5.4, false, black, { align: "center" });',
        'text("Improvement Needed", x + statusWCell / 2, y + 6.1, 6.8, false, black, { align: "center" });'
      );
      next = next.replace(
        'text(status, x + statusWCell / 2, y + 6.1, 6.4, false, status === "-" ? muted : black, { align: "center" });',
        'text(status, x + statusWCell / 2, y + 6.1, 8.2, false, status === "-" ? muted : black, { align: "center" });'
      );

      return next === code ? null : { code: next, map: null };
    },
  };
}
