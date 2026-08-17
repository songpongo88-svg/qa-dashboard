export function appealRequestsOriginalCommentCleanupPatch() {
  return {
    name: "appeal-requests-original-comment-cleanup",
    enforce: "pre",
    transform(code, id) {
      const normalizedId = id.replace(/\\/g, "/");
      if (!normalizedId.endsWith("/src/AppealRequestsMockup.tsx")) return null;

      const renderMarker = '{topic.comment || "-"}';
      const componentMarker = "export default function AppealRequestsMockup";

      if (!code.includes(renderMarker)) {
        throw new Error("[appeal-requests-original-comment-cleanup] Original Comment render marker not found");
      }
      if (!code.includes(componentMarker)) {
        throw new Error("[appeal-requests-original-comment-cleanup] AppealRequestsMockup component marker not found");
      }

      const helper = `function cleanAppealReviewComment(value: unknown) {
  let text = String(value ?? "");
  if (!text) return "";

  // Historical evaluation comments can contain raw HTML or HTML entities encoded more than once.
  if (typeof document !== "undefined") {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const textarea = document.createElement("textarea");
      textarea.innerHTML = text;
      const decoded = textarea.value;
      if (!decoded || decoded === text) break;
      text = decoded;
    }
  }

  text = text
    .replace(/<br\\s*\\/?>/gi, "\\n")
    .replace(/<\\/(?:div|p|li|tr|h[1-6])\\s*>/gi, "\\n")
    .replace(/<(?:div|p|li|tr|h[1-6])\\b[^>]*>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/[ \\t]+\\n/g, "\\n")
    .replace(/\\n[ \\t]+/g, "\\n")
    .replace(/\\n{3,}/g, "\\n\\n")
    .trim();

  return text;
}

`;

      let next = code.replace(componentMarker, helper + componentMarker);
      next = next.replace(
        renderMarker,
        '<span className="whitespace-pre-line">{cleanAppealReviewComment(topic.comment) || "-"}</span>'
      );

      if (!next.includes("cleanAppealReviewComment(topic.comment)")) {
        throw new Error("[appeal-requests-original-comment-cleanup] Original Comment cleanup was not injected");
      }

      return { code: next, map: null };
    },
  };
}
