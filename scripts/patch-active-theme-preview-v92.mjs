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

const oldPreview = `              <span className="flex shrink-0 items-center gap-0.5" aria-hidden="true">\n                {activeThemeOption.swatches.map((color, index) => (\n                  <span\n                    key={color}\n                    className={\`${index === 1 ? "h-4 w-2.5" : "h-4 w-1.5"} rounded-full\`}\n                    style={{ backgroundColor: color }}\n                  />\n                ))}\n              </span>`;

const newPreview = `              <span className="flex h-8 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg" aria-hidden="true">\n                {activeWeekdayPreviewIndex >= 0 ? (\n                  <span\n                    className="block h-full w-full rounded-lg border border-white/60 bg-no-repeat shadow-sm"\n                    style={{\n                      backgroundImage: 'url("/weekday-scenes-v3.png")',\n                      backgroundSize: "auto 700%",\n                      backgroundPosition: \`78% \${(activeWeekdayPreviewIndex / 6) * 100}%\`,\n                    }}\n                  />\n                ) : activeThemePreviewOption.patternImage ? (\n                  <span\n                    className="block h-full w-full rounded-lg border border-white/60 bg-center shadow-sm"\n                    style={{\n                      backgroundColor: activeThemePreviewOption.swatches[2],\n                      backgroundImage: \`url(\${activeThemePreviewOption.patternImage})\`,\n                      backgroundSize: "56px 56px",\n                    }}\n                  />\n                ) : activeFestivalPreviewColor ? (\n                  <span\n                    className="grid h-full w-full grid-cols-2 gap-0.5 rounded-lg border border-white/60 border-l-[5px] p-1 shadow-sm"\n                    style={{\n                      borderLeftColor: activeFestivalPreviewColor,\n                      background: \`linear-gradient(135deg, rgba(255,255,255,.92), \${activeFestivalPreviewColor})\`,\n                    }}\n                  >\n                    <i className="rounded-sm bg-white/90" />\n                    <i className="rounded-sm bg-white/90" />\n                    <i className="rounded-sm bg-white/90" />\n                    <i className="rounded-sm bg-white/90" />\n                  </span>\n                ) : (\n                  <span className="flex h-full w-full items-center justify-center gap-0.5 rounded-lg border border-white/40 bg-white/10 px-1 shadow-sm">\n                    {activeThemePreviewOption.swatches.map((color, index) => (\n                      <span\n                        key={color}\n                        className={\`${index === 1 ? "h-5 w-2.5" : "h-5 w-1.5"} rounded-full\`}\n                        style={{ backgroundColor: color }}\n                      />\n                    ))}\n                  </span>\n                )}\n              </span>`;

if (!source.includes(oldPreview)) {
  throw new Error(`${PATCH}: sidebar preview anchor not found`);
}
source = source.replaceAll(oldPreview, newPreview);

fs.writeFileSync(file, source, "utf8");
console.log(`${PATCH}: every Current Theme preview now follows the effective theme (weekday image, character image, festival preview, or color swatches)`);
