export function caseIssueTagsPdfHtml(value: unknown): string {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split("|") : [];
  const seen = new Set<string>();
  const names = values
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().replace(/\s+/g, " "))
    .filter((name) => {
      const key = name.toLocaleLowerCase("th-TH");
      if (!name || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (!names.length) return "";

  const escaped = names.map((name) => name
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;"));
  return `<div><strong>Tag ที่พบปัญหา :</strong> ${escaped.join(" • ")}</div>`;
}
