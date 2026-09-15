import fs from "node:fs";

const PATCH = "active-theme-preview-v92";
const file = "src/App.tsx";
let source = fs.readFileSync(file, "utf8");

if (source.includes(`// ${PATCH}`)) {
  console.log(`${PATCH}: already applied`);
  process.exit(0);
}

const labelTail = `  }, [activeThemeOption.label, effectiveThemeId]);\n`;
if (!source.includes(labelTail)) {
  throw new Error(`${PATCH}: active theme label block from v91 not found`);
}

const previewState = `${labelTail}\n  // ${PATCH}\n  const activeThemePreviewOption = useMemo(\n    () => QA_THEME_OPTIONS.find((theme) => theme.id === effectiveThemeId) || activeThemeOption,\n    [activeThemeOption, effectiveThemeId]\n  );\n  const activeWeekdayPreviewIndex = [\n    "weekday-monday",\n    "weekday-tuesday",\n    "weekday-wednesday",\n    "weekday-thursday",\n    "weekday-friday",\n    "weekday-saturday",\n    "weekday-sunday",\n  ].indexOf(effectiveThemeId);\n  const activeFestivalPreviewColor = ({\n    "festival-new-year": "#7c3aed",\n    "festival-valentine": "#ec4899",\n    "festival-songkran": "#0ea5e9",\n    "festival-halloween": "#f97316",\n    "festival-loy-krathong": "#8b5cf6",\n    "festival-christmas": "#16a34a",\n  } as Record<string, string>)[effectiveThemeId] || "";\n`;
source = source.replace(labelTail, previewState);

const oldPreviewPattern = /              <span className="flex shrink-0 items-center gap-0\.5" aria-hidden="true">\s*\{activeThemeOption\.swatches\.map\(\(color, index\) => \(\s*<span\s*key=\{color\}\s*className=\{[^\n]+\}\s*style=\{\{ backgroundColor: color \}\}\s*\/>\s*\)\)\}\s*<\/span>/g;
const previewMatches = source.match(oldPreviewPattern) || [];
if (!previewMatches.length) {
  throw new Error(`${PATCH}: sidebar preview anchor not found`);
}

const newPreview = `              <span className="flex h-8 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg" aria-hidden="true">
                {activeWeekdayPreviewIndex >= 0 ? (
                  <span
                    className="block h-full w-full rounded-lg border border-white/60 bg-no-repeat shadow-sm"
                    style={{
                      backgroundImage: 'url("/weekday-scenes-v3.png")',
                      backgroundSize: "auto 700%",
                      backgroundPosition: "78% " + ((activeWeekdayPreviewIndex / 6) * 100) + "%",
                    }}
                  />
                ) : activeThemePreviewOption.patternImage ? (
                  <span
                    className="block h-full w-full rounded-lg border border-white/60 bg-center shadow-sm"
                    style={{
                      backgroundColor: activeThemePreviewOption.swatches[2],
                      backgroundImage: "url(" + activeThemePreviewOption.patternImage + ")",
                      backgroundSize: "56px 56px",
                    }}
                  />
                ) : activeFestivalPreviewColor ? (
                  <span
                    className="grid h-full w-full grid-cols-2 gap-0.5 rounded-lg border border-white/60 border-l-[5px] p-1 shadow-sm"
                    style={{
                      borderLeftColor: activeFestivalPreviewColor,
                      background: "linear-gradient(135deg, rgba(255,255,255,.92), " + activeFestivalPreviewColor + ")",
                    }}
                  >
                    <i className="rounded-sm bg-white/90" />
                    <i className="rounded-sm bg-white/90" />
                    <i className="rounded-sm bg-white/90" />
                    <i className="rounded-sm bg-white/90" />
                  </span>
                ) : (
                  <span className="flex h-full w-full items-center justify-center gap-0.5 rounded-lg border border-white/40 bg-white/10 px-1 shadow-sm">
                    {activeThemePreviewOption.swatches.map((color, index) => (
                      <span
                        key={color}
                        className="h-5 rounded-full"
                        style={{ backgroundColor: color, width: index === 1 ? "10px" : "6px" }}
                      />
                    ))}
                  </span>
                )}
              </span>`;

source = source.replace(oldPreviewPattern, newPreview);

fs.writeFileSync(file, source, "utf8");
console.log(`${PATCH}: ${previewMatches.length} Current Theme preview block(s) now follow the effective theme (weekday image, character image, festival preview, or color swatches)`);
