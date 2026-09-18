export function processReferenceReportTextPatch() {
  return {
    name: "process-reference-report-text",
    enforce: "post",
    transform(code, id) {
      const normalized = id.replace(/\\\\/g, "/").split("?")[0];
      if (!normalized.endsWith("/src/caseDetailOfficialPdf.ts")) return null;

      let next = code;

      // The selected Process step/title is already the exact text entered by QA.
      // Do not prepend an extra "ข้อ:" because users may already type "ข้อ 9..." themselves.
      next = next.replace(
        /lines\.push\((["'])ข้อ:\s*\1\s*\+\s*displayTitle\);/g,
        "lines.push(displayTitle);"
      );

      next = next.replace(
        /lines\.push\((["'])ข้อ:\s*\1\s*\+\s*ref\.step\);/g,
        "lines.push(ref.step);"
      );

      return next === code ? null : { code: next, map: null };
    },
  };
}
