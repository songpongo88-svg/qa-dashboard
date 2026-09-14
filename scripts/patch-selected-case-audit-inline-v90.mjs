import fs from "node:fs";

const PATCH = "selected-case-audit-inline-v90";
const file = "src/DashboardMockup.tsx";
let source = fs.readFileSync(file, "utf8");

if (source.includes(`// ${PATCH}`)) {
  console.log(`${PATCH}: already applied`);
  process.exit(0);
}

const compactCardPattern = /<div className="rounded-xl border border-slate-300 bg-white px-3 py-2">\s*<div className="text-\[8px\] font-bold uppercase tracking-wide leading-none text-slate-500">Audit Date<\/div>\s*<div className="mt-1 text-\[11px\] font-bold tabular-nums leading-none text-slate-900">([\s\S]*?)<\/div>\s*\{activeSelectedCase\.lastUpdatedAt \? \(\s*<div className="mt-1 flex items-baseline gap-1\.5 whitespace-nowrap leading-none">\s*<span className="text-\[7px\] font-bold uppercase tracking-wide text-rose-600">Last Updated<\/span>\s*<span className="text-\[9px\] font-bold tabular-nums text-rose-600">\{activeSelectedCase\.lastUpdatedAt\}<\/span>\s*<\/div>\s*\) : null\}\s*<\/div>/;

const match = source.match(compactCardPattern);
if (!match) {
  throw new Error(`${PATCH}: compact Audit Date card from v89 not found`);
}

const auditValueExpression = match[1];
const newCard = `<div className="rounded-xl border border-slate-300 bg-white p-3">\n                                  <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Audit Date</div>\n                                  <div className="mt-1 text-xs font-bold text-slate-900">${auditValueExpression}</div>\n                                  {activeSelectedCase.lastUpdatedAt ? (\n                                    <div className="mt-2">\n                                      <div className="text-[9px] font-bold uppercase tracking-wide text-rose-600">Last Updated</div>\n                                      <div className="mt-1 text-xs font-bold text-rose-600">{activeSelectedCase.lastUpdatedAt}</div>\n                                    </div>\n                                  ) : null}\n                                </div>`;

source = source.replace(compactCardPattern, newCard);
source = source.replace(
  "// evaluation-last-updated-v89-dashboard\n",
  "// evaluation-last-updated-v89-dashboard\n// selected-case-audit-inline-v90\n"
);

fs.writeFileSync(file, source, "utf8");
console.log(`${PATCH}: Audit Date now uses the exact Case Date card spacing and text sizing; Last Updated remains conditional inside the same card`);
