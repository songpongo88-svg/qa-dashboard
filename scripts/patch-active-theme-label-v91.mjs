import fs from "node:fs";

const PATCH = "active-theme-label-v91";
const file = "src/App.tsx";
let source = fs.readFileSync(file, "utf8");

if (source.includes(`// ${PATCH}`)) {
  console.log(`${PATCH}: already applied`);
  process.exit(0);
}

const activeThemeAnchor = `  const activeThemeOption = useMemo(\n    () => QA_THEME_OPTIONS.find((theme) => theme.id === selectedTheme) || QA_THEME_OPTIONS[0],\n    [selectedTheme]\n  );\n`;

if (!source.includes(activeThemeAnchor)) {
  throw new Error(`${PATCH}: activeThemeOption anchor not found`);
}

const activeThemeBlock = `${activeThemeAnchor}\n  // ${PATCH}\n  const [effectiveThemeId, setEffectiveThemeId] = useState(() =>\n    typeof document !== "undefined"\n      ? document.documentElement.dataset.qaTheme || selectedTheme\n      : selectedTheme\n  );\n\n  useEffect(() => {\n    const root = document.documentElement;\n    const syncEffectiveTheme = () => {\n      setEffectiveThemeId(root.dataset.qaTheme || selectedTheme);\n    };\n\n    syncEffectiveTheme();\n    const observer = new MutationObserver(syncEffectiveTheme);\n    observer.observe(root, { attributes: true, attributeFilter: ["data-qa-theme"] });\n    return () => observer.disconnect();\n  }, [selectedTheme]);\n\n  const activeThemeLabel = useMemo(() => {\n    const runtimeLabels: Record<string, string> = {\n      "weekday-monday": "7Days Collection - Monday",\n      "weekday-tuesday": "7Days Collection - Tuesday",\n      "weekday-wednesday": "7Days Collection - Wednesday",\n      "weekday-thursday": "7Days Collection - Thursday",\n      "weekday-friday": "7Days Collection - Friday",\n      "weekday-saturday": "7Days Collection - Saturday",\n      "weekday-sunday": "7Days Collection - Sunday",\n      "festival-new-year": "New Year",\n      "festival-valentine": "Valentine’s Day",\n      "festival-songkran": "Songkran",\n      "festival-halloween": "Halloween",\n      "festival-loy-krathong": "Loy Krathong",\n      "festival-christmas": "Christmas",\n    };\n    return runtimeLabels[effectiveThemeId]\n      || QA_THEME_OPTIONS.find((theme) => theme.id === effectiveThemeId)?.label\n      || activeThemeOption.label;\n  }, [activeThemeOption.label, effectiveThemeId]);\n`;

source = source.replace(activeThemeAnchor, activeThemeBlock);

const ariaOld = 'aria-label={`Theme ปัจจุบัน ${activeThemeOption.label}. กดเพื่อเปลี่ยน Theme`}';
const ariaNew = 'aria-label={`Theme ปัจจุบัน ${activeThemeLabel}. กดเพื่อเปลี่ยน Theme`}';
if (!source.includes(ariaOld)) {
  throw new Error(`${PATCH}: sidebar aria label anchor not found`);
}
source = source.replaceAll(ariaOld, ariaNew);

const labelOld = '<span className="block truncate text-[10px] font-medium text-white">{activeThemeOption.label}</span>';
const labelNew = '<span className="block truncate text-[10px] font-medium text-white">{activeThemeLabel}</span>';
if (!source.includes(labelOld)) {
  throw new Error(`${PATCH}: sidebar visible label anchor not found`);
}
source = source.replaceAll(labelOld, labelNew);

fs.writeFileSync(file, source, "utf8");
console.log(`${PATCH}: sidebar Theme label now follows the effective runtime theme, including 7Days Collection weekday names`);
