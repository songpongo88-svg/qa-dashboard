import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content, "utf8");
}

function replaceExact(relativePath, from, to, expectedCount = 1) {
  const source = read(relativePath);
  const count = source.split(from).length - 1;
  if (count !== expectedCount) {
    throw new Error(`${relativePath}: expected ${expectedCount} occurrence(s), found ${count}`);
  }
  write(relativePath, source.split(from).join(to));
}

// 1) Case Detail: owner/timestamp metadata belongs above the Original Comment heading.
{
  const relativePath = "src/DashboardMockup.tsx";
  const source = read(relativePath);
  let count = 0;
  const pattern = /^([ \t]*)<div className="text-\[13px\] font-semibold text-slate-600">Original Comment<\/div>\r?\n[ \t]*<div className="mt-3 space-y-1 text-\[13px\] font-semibold text-slate-700">\r?\n[ \t]*<div><span className="font-extrabold">QA:<\/span> \{originalQaName \|\| "-"\}<\/div>\r?\n[ \t]*<div><span className="font-extrabold">Audit Date:<\/span> \{originalAuditDate \|\| "-"\}<\/div>\r?\n[ \t]*<\/div>/gm;
  const fixed = source.replace(pattern, (_match, indent) => {
    count += 1;
    return `${indent}<div className="space-y-1 text-[13px] font-semibold text-slate-700">\n${indent}  <div><span className="font-extrabold">QA:</span> {originalQaName || "-"}</div>\n${indent}  <div><span className="font-extrabold">Audit Date:</span> {originalAuditDate || "-"}</div>\n${indent}</div>\n${indent}<div className="mt-3 text-[13px] font-semibold text-slate-600">Original Comment</div>`;
  });
  if (count !== 2) throw new Error(`${relativePath}: expected 2 Original Comment metadata blocks, found ${count}`);
  write(relativePath, fixed);
}

// Also accept common historical spreadsheet headers for Appeal Submit time.
replaceExact(
  "src/DashboardMockup.tsx",
  `              "Appeal Submit Date & Time", "Appeal Submit Date", "Submit Date & Time", "Submit Date"`,
  `              "Appeal Submit Date & Time", "Appeal Submit Date", "Appeal Submitted At", "Submitted At", "Appeal Submitted Date", "Appeal Date & Time", "Appeal Date", "Submit Date & Time", "Submit Date"`,
  1
);

// 2) Appeal history: reject placeholder values and recover submission time from event time or the Date.now() suffix in requestId.
const appealHelperMarker = `function toNumber(value: unknown, fallback = 0) {`;
const appealHelper = `function firstStoredAppealDateTime(...values: unknown[]) {\n  for (const value of values) {\n    const text = String(value ?? "").trim();\n    if (!text || text === "-" || text.toLowerCase() === "null" || text.toLowerCase() === "undefined") continue;\n    return text;\n  }\n  return "";\n}\n\nfunction appealSubmittedAtFromRequestId(value: unknown) {\n  const match = String(value ?? "").trim().match(/-(\\d{13})$/);\n  if (!match) return "";\n  const epochMs = Number(match[1]);\n  if (!Number.isFinite(epochMs)) return "";\n  const date = new Date(epochMs);\n  return Number.isNaN(date.getTime()) ? "" : date.toISOString();\n}\n\n${appealHelperMarker}`;
replaceExact("src/AppealRequestsMockup.tsx", appealHelperMarker, appealHelper, 1);

replaceExact(
  "src/AppealRequestsMockup.tsx",
  `        submittedAt: String(log.details?.submittedAt || log.created_at || ""),`,
  `        submittedAt: firstStoredAppealDateTime(\n          log.details?.submittedAt,\n          log.created_at,\n          appealSubmittedAtFromRequestId(requestId)\n        ),`,
  1
);
replaceExact(
  "src/AppealRequestsMockup.tsx",
  `        reviewedAt: String(review?.details?.reviewedAt || review?.created_at || ""),`,
  `        reviewedAt: firstStoredAppealDateTime(review?.details?.reviewedAt, review?.created_at),`,
  1
);

// 3) Sidebar Theme label: show the selected collection instead of the underlying base color theme.
const activeThemeMarker = `  const activeThemeOption = useMemo(\n    () => QA_THEME_OPTIONS.find((theme) => theme.id === selectedTheme) || QA_THEME_OPTIONS[0],\n    [selectedTheme]\n  );`;
const activeThemeFixed = `${activeThemeMarker}\n  const [sidebarThemeCollection, setSidebarThemeCollection] = useState<"weekday" | "weather" | "festival" | "">("");\n\n  useEffect(() => {\n    const syncSidebarThemeCollection = () => {\n      let customPreference = "";\n      try {\n        customPreference = window.localStorage.getItem(QA_CUSTOM_THEME_STORAGE_KEY) || "";\n      } catch {\n        customPreference = "";\n      }\n\n      const root = document.documentElement;\n      if (customPreference === "weather-auto" || root.dataset.qaWeatherCollection === "auto") {\n        setSidebarThemeCollection("weather");\n        return;\n      }\n      if (customPreference === "weekday-auto" || /^weekday-/.test(customPreference) || root.dataset.qaWeekdayCollection === "auto") {\n        setSidebarThemeCollection("weekday");\n        return;\n      }\n      if (root.dataset.qaFestivalOverride) {\n        setSidebarThemeCollection("festival");\n        return;\n      }\n      setSidebarThemeCollection("");\n    };\n\n    syncSidebarThemeCollection();\n    const observer = new MutationObserver(syncSidebarThemeCollection);\n    observer.observe(document.documentElement, {\n      attributes: true,\n      attributeFilter: ["data-qa-theme", "data-qa-weekday-collection", "data-qa-weather-collection", "data-qa-festival-override"],\n    });\n    window.addEventListener("qa-appearance-change", syncSidebarThemeCollection);\n    window.addEventListener("storage", syncSidebarThemeCollection);\n    return () => {\n      observer.disconnect();\n      window.removeEventListener("qa-appearance-change", syncSidebarThemeCollection);\n      window.removeEventListener("storage", syncSidebarThemeCollection);\n    };\n  }, []);\n\n  const sidebarThemeLabel =\n    sidebarThemeCollection === "weekday"\n      ? "7 Days · ธีมประจำวันอัตโนมัติ"\n      : sidebarThemeCollection === "weather"\n        ? "Weather Collection"\n        : sidebarThemeCollection === "festival"\n          ? "Festival Collection"\n          : activeThemeOption.label;`;
replaceExact("src/App.tsx", activeThemeMarker, activeThemeFixed, 1);
replaceExact(
  "src/App.tsx",
  `              aria-label={\`Theme ปัจจุบัน \${activeThemeOption.label}. กดเพื่อเปลี่ยน Theme\`}`,
  `              aria-label={\`Theme ปัจจุบัน \${sidebarThemeLabel}. กดเพื่อเปลี่ยน Theme\`}`,
  1
);
replaceExact(
  "src/App.tsx",
  `                    <span className="block truncate text-[10px] font-medium text-white">{activeThemeOption.label}</span>`,
  `                    <span className="block truncate text-[10px] font-medium text-white">{sidebarThemeLabel}</span>`,
  1
);

console.log("Applied Case Detail appeal metadata, Appeal Submit fallback, and Theme label fixes.");
