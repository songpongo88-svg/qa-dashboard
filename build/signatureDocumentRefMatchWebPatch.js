export function signatureDocumentRefMatchWebPatch() {
  return {
    name: "signature-document-ref-match-web",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/src/SignatureCenterMockup.tsx")) return null;
      if (!code.includes("getMonthlyDocumentRef")) return null;

      let next = code;

      // The web UI uses the full `documents` collection to calculate Document Ref.
      // Pass that exact collection to generated Payment PDF / Excel as the reference source.
      next = next.replace(
        "generatePaymentExcelFile(selectedMonth, selectedMonthPaymentExportDocs, signatures, selectedMonthAllDocs);",
        "generatePaymentExcelFile(selectedMonth, selectedMonthPaymentExportDocs, signatures, documents);"
      );
      next = next.replace(
        "generatePaymentPdfFile(selectedMonth, selectedMonthPaymentExportDocs, signatures, selectedMonthAllDocs);",
        "generatePaymentPdfFile(selectedMonth, selectedMonthPaymentExportDocs, signatures, documents);"
      );

      // Excel: keep monthly totals scoped to the selected month, while Document Ref. uses all documents
      // so it matches the current web UI exactly.
      const excelStart = next.indexOf("function generatePaymentExcelFile(");
      const excelEnd = next.indexOf("function makePaymentPdfFileName(", excelStart);
      if (excelStart >= 0 && excelEnd > excelStart) {
        let block = next.slice(excelStart, excelEnd);
        block = block.replace(
          "  const dashboardSummary = getDashboardMonthSummaryForExport(monthKey, allMonthDocs, sortedDocs);",
          "  const monthDocs = allMonthDocs.filter((doc) => doc.monthKey === monthKey);\n  const dashboardSummary = getDashboardMonthSummaryForExport(monthKey, monthDocs, sortedDocs);"
        );
        next = next.slice(0, excelStart) + block + next.slice(excelEnd);
      }

      // Payment PDF exact layout: split monthly summary data from the global Document Ref. source.
      const pdfStart = next.indexOf("function generatePaymentPdfFile(");
      const pdfEnd = next.indexOf("function SignaturePill(", pdfStart);
      if (pdfStart >= 0 && pdfEnd > pdfStart) {
        let block = next.slice(pdfStart, pdfEnd);
        block = block.replace(
          "  const sourceDocs = allMonthDocs.length ? allMonthDocs : sortedDocs;\n  const dashboardSummary = getDashboardMonthSummaryForExport(monthKey, sourceDocs, sortedDocs);",
          "  const referenceDocs = allMonthDocs.length ? allMonthDocs : sortedDocs;\n  const sourceDocs = referenceDocs.filter((doc) => doc.monthKey === monthKey);\n  const dashboardSummary = getDashboardMonthSummaryForExport(monthKey, sourceDocs, sortedDocs);"
        );
        block = block.replace(/getMonthlyDocumentRef\(doc, sourceDocs\)/g, "getMonthlyDocumentRef(doc, referenceDocs)");
        next = next.slice(0, pdfStart) + block + next.slice(pdfEnd);
      }

      return next === code ? null : { code: next, map: null };
    },
  };
}
