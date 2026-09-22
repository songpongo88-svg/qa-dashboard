import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cleanBase = "4507bf00ab60ed6095a361be0e8efdd59ec04e3c";

function file(relativePath) {
  return path.join(root, relativePath);
}
function read(relativePath) {
  return fs.readFileSync(file(relativePath), "utf8");
}
function write(relativePath, value) {
  fs.writeFileSync(file(relativePath), value, "utf8");
}
function fromGit(ref, relativePath) {
  return execFileSync("git", ["show", `${ref}:${relativePath}`], { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
}
function replaceOne(source, from, to, label) {
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 anchor, found ${count}`);
  return source.replace(from, to);
}

// Restore the two files that accidentally captured generated prebuild output.
write("src/App.tsx", fromGit(cleanBase, "src/App.tsx"));
write("src/AppealRequestsMockup.tsx", fromGit(cleanBase, "src/AppealRequestsMockup.tsx"));

// Appeal Submit: ignore placeholder '-' and recover from event timestamp/request id.
{
  let source = read("src/AppealRequestsMockup.tsx");
  const marker = `function toNumber(value: unknown, fallback = 0) {`;
  const helpers = `function firstStoredAppealDateTime(...values: unknown[]) {\n  for (const value of values) {\n    const text = String(value ?? "").trim();\n    if (!text || text === "-" || text.toLowerCase() === "null" || text.toLowerCase() === "undefined") continue;\n    return text;\n  }\n  return "";\n}\n\nfunction appealSubmittedAtFromRequestId(value: unknown) {\n  const match = String(value ?? "").trim().match(/-(\\d{13})$/);\n  if (!match) return "";\n  const epochMs = Number(match[1]);\n  if (!Number.isFinite(epochMs)) return "";\n  const date = new Date(epochMs);\n  return Number.isNaN(date.getTime()) ? "" : date.toISOString();\n}\n\n${marker}`;
  source = replaceOne(source, marker, helpers, "Appeal helper marker");
  source = replaceOne(
    source,
    `        submittedAt: String(log.details?.submittedAt || log.created_at || ""),`,
    `        submittedAt: firstStoredAppealDateTime(\n          log.details?.submittedAt,\n          log.created_at,\n          appealSubmittedAtFromRequestId(requestId)\n        ),`,
    "Appeal submittedAt"
  );
  source = replaceOne(
    source,
    `        reviewedAt: String(review?.details?.reviewedAt || review?.created_at || ""),`,
    `        reviewedAt: firstStoredAppealDateTime(review?.details?.reviewedAt, review?.created_at),`,
    "Appeal reviewedAt"
  );
  write("src/AppealRequestsMockup.tsx", source);
}

// Sidebar: show active collection name instead of stale base color when 7 Days / Weather / Festival is active.
{
  let source = read("src/App.tsx");
  const activeThemeMarker = `  const activeThemeOption = useMemo(\n    () => QA_THEME_OPTIONS.find((theme) => theme.id === selectedTheme) || QA_THEME_OPTIONS[0],\n    [selectedTheme]\n  );`;
  const activeThemeFixed = `${activeThemeMarker}\n  const [sidebarThemeCollection, setSidebarThemeCollection] = useState<"weekday" | "weather" | "festival" | "">("");\n\n  useEffect(() => {\n    const syncSidebarThemeCollection = () => {\n      let customPreference = "";\n      try {\n        customPreference = window.localStorage.getItem(QA_CUSTOM_THEME_STORAGE_KEY) || "";\n      } catch {\n        customPreference = "";\n      }\n\n      const root = document.documentElement;\n      if (customPreference === "weather-auto" || root.dataset.qaWeatherCollection === "auto") {\n        setSidebarThemeCollection("weather");\n        return;\n      }\n      if (customPreference === "weekday-auto" || /^weekday-/.test(customPreference) || root.dataset.qaWeekdayCollection === "auto") {\n        setSidebarThemeCollection("weekday");\n        return;\n      }\n      if (root.dataset.qaFestivalOverride) {\n        setSidebarThemeCollection("festival");\n        return;\n      }\n      setSidebarThemeCollection("");\n    };\n\n    syncSidebarThemeCollection();\n    const observer = new MutationObserver(syncSidebarThemeCollection);\n    observer.observe(document.documentElement, {\n      attributes: true,\n      attributeFilter: ["data-qa-theme", "data-qa-weekday-collection", "data-qa-weather-collection", "data-qa-festival-override"],\n    });\n    window.addEventListener("qa-appearance-change", syncSidebarThemeCollection);\n    window.addEventListener("storage", syncSidebarThemeCollection);\n    return () => {\n      observer.disconnect();\n      window.removeEventListener("qa-appearance-change", syncSidebarThemeCollection);\n      window.removeEventListener("storage", syncSidebarThemeCollection);\n    };\n  }, []);\n\n  const sidebarThemeLabel =\n    sidebarThemeCollection === "weekday"\n      ? "7 Days · ธีมประจำวันอัตโนมัติ"\n      : sidebarThemeCollection === "weather"\n        ? "Weather Collection"\n        : sidebarThemeCollection === "festival"\n          ? "Festival Collection"\n          : activeThemeOption.label;`;
  source = replaceOne(source, activeThemeMarker, activeThemeFixed, "activeThemeOption");
  source = replaceOne(
    source,
    `              aria-label={\`Theme ปัจจุบัน \${activeThemeOption.label}. กดเพื่อเปลี่ยน Theme\`}`,
    `              aria-label={\`Theme ปัจจุบัน \${sidebarThemeLabel}. กดเพื่อเปลี่ยน Theme\`}`,
    "Theme aria label"
  );
  source = replaceOne(
    source,
    `                    <span className="block truncate text-[10px] font-medium text-white">{activeThemeOption.label}</span>`,
    `                    <span className="block truncate text-[10px] font-medium text-white">{sidebarThemeLabel}</span>`,
    "Theme visible label"
  );
  write("src/App.tsx", source);
}

console.log("Restored clean source and reapplied only Appeal Submit + selected Theme label fixes.");
