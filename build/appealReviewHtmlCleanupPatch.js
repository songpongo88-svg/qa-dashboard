export function appealReviewHtmlCleanupPatch() {
  let patched = false;

  return {
    name: "appeal-review-html-cleanup",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      if (!cleanId.endsWith("/src/AppealMockup.tsx")) return null;

      const pattern = /function sanitizeDisplayText\(value: unknown, fallback = \"-\"\) \{[\s\S]*?\n\}/;
      if (!pattern.test(code)) {
        this.error("Appeal Review HTML cleanup patch could not find sanitizeDisplayText().");
      }

      const replacement = `function decodeAppealTextEntities(value: unknown) {
  let text = String(value ?? "");
  if (!text) return text;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const before = text;

    if (typeof document !== "undefined") {
      const textarea = document.createElement("textarea");
      textarea.innerHTML = text;
      text = textarea.value;
    } else {
      text = text
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, "\\\"")
        .replace(/&#0*39;|&apos;/gi, "'")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&");
    }

    if (text === before) break;
  }

  return text;
}

function stripAppealHtmlArtifacts(value: unknown) {
  let text = decodeAppealTextEntities(value);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const before = text;

    text = text
      .replace(/<br\\s*\\/?\\s*>/gi, "\\n")
      .replace(/<hr\\b[^>]*>/gi, "\\n")
      .replace(/<\\/?(?:div|p|li|ul|ol|table|thead|tbody|tfoot|tr)\\b[^>]*>/gi, "\\n")
      .replace(/<\\/?(?:span|strong|b|em|i|u|font|td|th)\\b[^>]*>/gi, "")
      .replace(/<[^>]+>/g, "");

    text = decodeAppealTextEntities(text);
    if (text === before) break;
  }

  return text
    .replace(/\\u00a0/g, " ")
    .replace(/[ \\t]+\\n/g, "\\n")
    .replace(/\\n[ \\t]+/g, "\\n")
    .replace(/\\n{3,}/g, "\\n\\n")
    .trim();
}

function sanitizeDisplayText(value: unknown, fallback = "-") {
  const cleaned = stripInvisibleChars(
    repairMojibakeText(stripAppealHtmlArtifacts(value))
  ).trim();
  return cleaned || fallback;
}`;

      const next = code.replace(pattern, replacement);
      if (next === code) {
        this.error("Appeal Review HTML cleanup patch made no change.");
      }

      patched = true;
      return { code: next, map: null };
    },

    buildEnd(error) {
      if (!error && !patched) {
        this.error("Appeal Review HTML cleanup patch was not applied during build.");
      }
    },
  };
}
