export function signaturePaymentPdfLargeFontPatch() {
  return {
    name: "signature-payment-pdf-large-font",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/src/SignatureCenterMockup.tsx")) return null;
      if (!code.includes('section("2. AGENT MONTHLY RANKING & PAYMENT DETAILS")')) return null;

      let next = code;

      next = next.replace(
        'size: label === "Document Ref." ? 6.6 : 7.2,',
        'size: label === "Document Ref." ? 10.8 : 11.6,'
      );
      next = next.replace(
        'size: colIndex === 1 ? 7.0 : colIndex === 2 ? 6.5 : 7.0,',
        'size: colIndex === 1 ? 11.3 : colIndex === 2 ? 10.5 : 11.0,'
      );
      next = next.replace(
        'size: 6.6,\n      bold: true,\n      align: "center",\n      maxLines: 2,',
        'size: 10.5,\n      bold: true,\n      align: "center",\n      maxLines: 2,'
      );

      next = next.replace(
        'size: label === "Status" ? 6.7 : 7.0,',
        'size: label === "Status" ? 10.5 : 11.2,'
      );
      next = next.replace(
        'size: 6.7,\n      bold: true,\n      align: "left",',
        'size: 10.8,\n      bold: true,\n      align: "left",'
      );
      next = next.replace(/size: 6\.9,/g, 'size: 10.6,');
      next = next.replace(
        'text(status, x + statusWCell / 2, y + 6.1, 6.4, false, status === "-" ? muted : black, { align: "center" });',
        'text(status, x + statusWCell / 2, y + 6.1, 10.0, false, status === "-" ? muted : black, { align: "center" });'
      );

      return next === code ? null : { code: next, map: null };
    },
  };
}
