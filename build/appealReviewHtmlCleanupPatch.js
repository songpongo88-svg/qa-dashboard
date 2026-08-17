export function appealReviewHtmlCleanupPatch() {
  return {
    name: "appeal-review-html-cleanup",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/src/AppealMockup.tsx")) return null;
      if (!code.includes("function sanitizeDisplayText")) return null;

      const pattern = /function sanitizeDisplayText\(value: unknown, fallback = \"-\"\) \{[\s\S]*?\n\}/;
      if (!pattern.test(code)) return null;

      const replacement = `function decodeAppealHtmlEntities(value: unknown) {
  let text = String(value ?? "");
  if (!text || typeof document === "undefined") return text;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = text;
    const decoded = textarea.value;
    if (!decoded || decoded === text) break;
    text = decoded;
  }

  return text;
}

function sanitizeDisplayText(value: unknown, fallback = "-") {
  let cleaned = richTextToPlainText(decodeAppealHtmlEntities(value));

  // Some historical Evaluation comments were HTML/entity encoded more than once.
  // Keep normalizing until no supported rich-text tags remain so Appeal Review
  // never exposes literal <div>, <br>, <span>, etc. to the reviewer.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!/<\\/?(?:div|p|br|strong|b|em|i|u|span|ul|ol|li|font|table|thead|tbody|tfoot|tr|td|th|hr)\\b/i.test(cleaned)) break;
    const next = richTextToPlainText(decodeAppealHtmlEntities(cleaned));
    if (!next || next === cleaned) break;
    cleaned = next;
  }

  cleaned = stripInvisibleChars(repairMojibakeText(cleaned))
    .replace(/\\n{3,}/g, "\\n\\n")
    .trim();
  return cleaned || fallback;
}`;

      const next = code.replace(pattern, replacement);
      return next === code ? null : { code: next, map: null };
    },
  };
}
