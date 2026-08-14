export function signaturePaymentTopicFinalOverridePatch() {
  return {
    name: "signature-payment-topic-final-override",
    enforce: "post",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/src/SignatureCenterMockup.tsx")) return null;

      const sectionStart = code.indexOf('section("3. TEAM TOPIC PERFORMANCE")');
      const sectionEnd = code.indexOf('section("4. PAYMENT CERTIFICATION")', sectionStart);
      if (sectionStart < 0 || sectionEnd <= sectionStart) return null;

      let block = code.slice(sectionStart, sectionEnd);
      const before = block;

      // Final layout authority for Team Topic Performance.
      // Total width remains 180 mm: 26 + 97 + 17 + 11 + 13 + 16.
      block = block
        .replace(/\["Topic",\s*\d+(?:\.\d+)?\]/g, '["Topic", 26]')
        .replace(/\["Description",\s*\d+(?:\.\d+)?\]/g, '["Description", 97]')
        .replace(/\["Avg Score",\s*\d+(?:\.\d+)?\]/g, '["Avg Score", 17]')
        .replace(/\["Max",\s*\d+(?:\.\d+)?\]/g, '["Max", 11]')
        .replace(/\["Avg %",\s*\d+(?:\.\d+)?\]/g, '["Avg %", 13]')
        .replace(/\["Status",\s*\d+(?:\.\d+)?\]/g, '["Status", 16]');

      if (block === before) return null;
      const next = code.slice(0, sectionStart) + block + code.slice(sectionEnd);
      return { code: next, map: null };
    },
  };
}
