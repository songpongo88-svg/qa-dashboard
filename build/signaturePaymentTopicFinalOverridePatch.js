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
      // Topic only contains the short 1-4 code, so keep it compact and give the
      // recovered width to Description. Status remains wide enough for the full label.
      // Total: 12 + 99 + 17 + 11 + 13 + 28 = 180 mm.
      block = block
        .replace(/\["Topic",\s*\d+(?:\.\d+)?\]/g, '["Topic", 12]')
        .replace(/\["Description",\s*\d+(?:\.\d+)?\]/g, '["Description", 99]')
        .replace(/\["Avg Score",\s*\d+(?:\.\d+)?\]/g, '["Avg Score", 17]')
        .replace(/\["Max",\s*\d+(?:\.\d+)?\]/g, '["Max", 11]')
        .replace(/\["Avg %",\s*\d+(?:\.\d+)?\]/g, '["Avg %", 13]')
        .replace(/\["Status",\s*\d+(?:\.\d+)?\]/g, '["Status", 28]');

      // Keep long bilingual descriptions inside their own cell. If a label does not
      // fit on one line, wrap it instead of letting the text touch/cross the divider.
      block = block.replace(
        /const rowH = \d+(?:\.\d+)?;/,
        'const rowH = 13.5;'
      );
      block = block.replace(
        /(combinedTopicTitle,[\s\S]{0,260}?maxLines:)\s*1(,)/,
        '$1 2$2'
      );

      // Monthly Payment PDF percentage values must always use two decimal places.
      block = block.replace(/avgPct\.toFixed\(1\)/g, 'avgPct.toFixed(2)');

      // The approved-preview renderer historically hard-coded Improvement Needed at 5.4 pt,
      // while Strong / Excellent are promoted to 9.5 pt by the large-font patch. Normalize the
      // long label to the exact same body typography now that the Status column is wide enough.
      block = block.replace(
        /text\("Improvement Needed",\s*x \+ statusWCell \/ 2,\s*y \+ 6\.1,\s*\d+(?:\.\d+)?,\s*false,\s*black,\s*\{ align: "center" \}\);/g,
        'text("Improvement Needed", x + statusWCell / 2, y + 6.1, 9.5, false, black, { align: "center" });'
      );

      // Status text is rendered manually rather than through drawTableCell, so its old
      // fixed baseline (y + 6.1) no longer sits vertically centered after the row height
      // was increased to support wrapped descriptions. Center every Status label using
      // the actual row height, with a small baseline correction for the 9.5 pt font.
      block = block.replace(
        /x \+ statusWCell \/ 2,\s*y \+ 6\.1/g,
        'x + statusWCell / 2, y + rowH / 2 + 1.1'
      );

      if (block === before) return null;
      const next = code.slice(0, sectionStart) + block + code.slice(sectionEnd);
      return { code: next, map: null };
    },
  };
}
