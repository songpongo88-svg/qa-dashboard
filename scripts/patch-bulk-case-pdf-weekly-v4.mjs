import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dashboardPath = path.resolve(__dirname, "../src/DashboardMockup.tsx");
const marker = "bulk-case-pdf-weekly-v4";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing ${label} anchor`);
  return source.replace(before, after);
}

let source = fs.readFileSync(dashboardPath, "utf8");
if (source.includes(marker)) {
  console.log("Weekly Gen All Case PDF patch already applied.");
  process.exit(0);
}
if (!source.includes("bulk-case-pdf-filter-teamname-v3")) {
  throw new Error("Bulk PDF Team/Agent filter patch v3 must run before weekly patch v4");
}

const oldPeriodCases = `  const monthlyCasePdfCases = useMemo(() => {\n    if (!qaCanGenerateAllCasePdf || !isMonthlyView || selectedMonthKey === "all") return [];\n    return allCases\n      .filter((item) =>\n        item.monthKey === selectedMonthKey &&\n        Boolean(String(item.caseId || "").trim()) &&\n        !isTestCaseEvaluation(item)\n      )\n      .map((item) => {\n        const team = resolveCaseAgentTeam(item, caseAgentDirectory);\n        return { ...item, teamName: team.teamName || "" };\n      });\n  }, [allCases, caseAgentDirectory, isMonthlyView, qaCanGenerateAllCasePdf, selectedMonthKey]);`;

const newPeriodCases = `  // ${marker}\n  const isWeeklyCasePdfView = selectedWeek !== "all";\n  const bulkCasePdfExportMonthKey = selectedMonthKey !== "all" ? selectedMonthKey : effectiveViewMonthKey;\n\n  const monthlyCasePdfCases = useMemo(() => {\n    if (!qaCanGenerateAllCasePdf || (!isMonthlyView && !isWeeklyCasePdfView)) return [];\n    return allCases\n      .filter((item) =>\n        Boolean(String(item.caseId || "").trim()) &&\n        !isTestCaseEvaluation(item) &&\n        (isWeeklyCasePdfView\n          ? item.weekLabel === selectedWeek\n          : item.monthKey === selectedMonthKey)\n      )\n      .map((item) => {\n        const team = resolveCaseAgentTeam(item, caseAgentDirectory);\n        return { ...item, teamName: team.teamName || "" };\n      });\n  }, [\n    allCases,\n    caseAgentDirectory,\n    isMonthlyView,\n    isWeeklyCasePdfView,\n    qaCanGenerateAllCasePdf,\n    selectedMonthKey,\n    selectedWeek,\n  ]);`;

source = replaceOnce(source, oldPeriodCases, newPeriodCases, "weekly period Case list");

const oldMyCaseGuard = `  const myCasePdfCases = useMemo(() => {\n    if (!qaCanGenerateAllCasePdf || !isSeniorBulkCasePdfRole || !isMonthlyView || selectedMonthKey === "all") return [];`;
const newMyCaseGuard = `  const myCasePdfCases = useMemo(() => {\n    if (!qaCanGenerateAllCasePdf || !isSeniorBulkCasePdfRole || (!isMonthlyView && !isWeeklyCasePdfView)) return [];`;
source = replaceOnce(source, oldMyCaseGuard, newMyCaseGuard, "Senior My Case weekly guard");

const oldMyDeps = `    isMonthlyView,\n    isSeniorBulkCasePdfRole,\n    monthlyCasePdfCases,\n    qaCanGenerateAllCasePdf,\n    selectedMonthKey,\n  ]);`;
const newMyDeps = `    isMonthlyView,\n    isSeniorBulkCasePdfRole,\n    isWeeklyCasePdfView,\n    monthlyCasePdfCases,\n    qaCanGenerateAllCasePdf,\n    selectedMonthKey,\n  ]);`;
source = replaceOnce(source, oldMyDeps, newMyDeps, "Senior My Case weekly dependencies");

const oldHandlerPeriodGuard = `    if (!isMonthlyView || selectedMonthKey === "all") {\n      alert("กรุณาเลือก Month ก่อน Gen PDF");\n      return;\n    }`;
const newHandlerPeriodGuard = `    if (!isMonthlyView && !isWeeklyCasePdfView) {\n      alert("กรุณาเลือก Month หรือ Week ก่อน Gen PDF");\n      return;\n    }`;
source = replaceOnce(source, oldHandlerPeriodGuard, newHandlerPeriodGuard, "weekly Gen handler guard");

source = replaceOnce(
  source,
  `        monthKey: selectedMonthKey,`,
  `        monthKey: bulkCasePdfExportMonthKey,`,
  "bulk PDF export month key"
);

source = replaceOnce(
  source,
  `{qaCanGenerateAllCasePdf && isMonthlyView && selectedMonthKey !== "all" ? (`,
  `{qaCanGenerateAllCasePdf && (isWeeklyCasePdfView || (isMonthlyView && selectedMonthKey !== "all")) ? (`,
  "weekly Gen button visibility"
);

source = source.replace(
  `title="รวม Case Detail ทุกเคสของเดือนที่เลือกเป็น PDF ไฟล์เดียว โดยใช้ Appeal ล่าสุดแทน Original เมื่อมีอุทธรณ์"`,
  `title={isWeeklyCasePdfView\n                                ? \`รวม Case Detail เฉพาะสัปดาห์ ${'${selectedWeek}'} เป็น PDF ไฟล์เดียว โดยใช้ Appeal ล่าสุดแทน Original เมื่อมีอุทธรณ์\`\n                                : "รวม Case Detail ทุกเคสของเดือนที่เลือกเป็น PDF ไฟล์เดียว โดยใช้ Appeal ล่าสุดแทน Original เมื่อมีอุทธรณ์"}`
);

fs.writeFileSync(dashboardPath, source, "utf8");
console.log("Patched Gen All Case PDF to follow selected Weekly View by Case Date week label.");
