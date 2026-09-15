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

      // Render Status with the exact same table-cell renderer and body size as
      // Avg Score / Max / Avg %. This guarantees identical horizontal/vertical
      // centering and puts every Status value on the same visual baseline as the metrics.
      block = block.replace(
        /const statusWCell = topicHeaders\[5\]\[1\];[\s\S]*?(?=\s*y \+= rowH;)/,
        `const statusWCell = topicHeaders[5][1];
    drawTableCell(x, y, statusWCell, rowH, status, {
      fill,
      color: status === "-" ? muted : black,
      size: 9.8,
      bold: false,
      align: "center",
      maxLines: 1,
    });
`
      );

      if (block === before) return null;
      const next = code.slice(0, sectionStart) + block + code.slice(sectionEnd);
      return { code: next, map: null };
    },
  };
}
