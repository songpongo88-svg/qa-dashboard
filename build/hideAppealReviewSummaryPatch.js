// Legacy layout migrations rebuild Appeal Information during prebuild.
// Remove only their generated summary row before compiling the page.
export function hideAppealReviewSummaryPatch() {
  return {
    name: "hide-appeal-review-summary",
    enforce: "pre",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/src/AppealMockup.tsx")) return null;
      const next = code.replace(/<div className="grid gap-1[^"\n]*">\s*<span className="font-semibold text-slate-500">Appeal Review Summary<\/span>\s*<span[^>]*>\{sanitizeDisplayText\(selectedRevision\?\.appealReviewSummary \?\? selectedCase\.appealReviewSummary, "-"\)\}<\/span>\s*<\/div>/g, "");
      if (/>\s*Appeal Review Summary\s*</.test(next)) throw new Error("Appeal Review Summary presentation was not removed");
      return next === code ? null : {code: next, map: null};
    },
  };
}
