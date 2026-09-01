import fs from "node:fs";

const appPath = "src/App.tsx";
const dashboardPath = "src/DashboardMockup.tsx";
const summaryPath = "src/SummaryMockup.tsx";
const marker = "// data-analytics-dashboard-case-source-v24";

function replaceRequired(source, anchor, replacement, label) {
  if (!source.includes(anchor)) throw new Error(`${label} anchor not found`);
  return source.replace(anchor, replacement);
}

function patchApp() {
  let source = fs.readFileSync(appPath, "utf8");
  if (source.includes(marker)) return;

  const stateAnchor = `  const [qaDataRefreshKey, setQaDataRefreshKey] = useState(() => {\n    const stored = Number(window.localStorage.getItem(QA_DATA_REFRESH_STORAGE_KEY) || 0);\n    return Number.isFinite(stored) ? stored : 0;\n  });`;
  source = replaceRequired(
    source,
    stateAnchor,
    `${stateAnchor}\n  ${marker}\n  const [dashboardEffectiveCases, setDashboardEffectiveCases] = useState<any[] | null>(null);`,
    "App effective-case state"
  );

  const dashboardAnchor = `              dataRefreshKey={qaDataRefreshKey}\n              analyticsContent={analyticsAllowed ? (`;
  source = replaceRequired(
    source,
    dashboardAnchor,
    `              dataRefreshKey={qaDataRefreshKey}\n              onEffectiveCasesChange={setDashboardEffectiveCases}\n              analyticsContent={analyticsAllowed ? (`,
    "App Dashboard callback"
  );

  const embeddedSummaryAnchor = `                  canExportAnalytics={analyticsExportAllowed}\n                  dataRefreshKey={qaDataRefreshKey}\n                  onSelectedAgentChange=`;
  source = replaceRequired(
    source,
    embeddedSummaryAnchor,
    `                  canExportAnalytics={analyticsExportAllowed}\n                  dataRefreshKey={qaDataRefreshKey}\n                  externalEffectiveCases={dashboardEffectiveCases}\n                  onSelectedAgentChange=`,
    "App embedded Summary source"
  );

  const standaloneSummaryAnchor = `            canExportAnalytics={analyticsExportAllowed}\n            dataRefreshKey={qaDataRefreshKey}\n            onSelectedAgentChange=`;
  source = replaceRequired(
    source,
    standaloneSummaryAnchor,
    `            canExportAnalytics={analyticsExportAllowed}\n            dataRefreshKey={qaDataRefreshKey}\n            externalEffectiveCases={dashboardEffectiveCases}\n            onSelectedAgentChange=`,
    "App standalone Summary source"
  );

  fs.writeFileSync(appPath, source, "utf8");
}

function patchDashboard() {
  let source = fs.readFileSync(dashboardPath, "utf8");
  if (source.includes(marker)) return;

  const propsAnchor = `  dataRefreshKey,\n  analyticsContent,\n  onSelectedAgentChange,`;
  source = replaceRequired(
    source,
    propsAnchor,
    `  dataRefreshKey,\n  analyticsContent,\n  onEffectiveCasesChange,\n  onSelectedAgentChange,`,
    "Dashboard prop"
  );

  const typeAnchor = `  dataRefreshKey?: number;\n  analyticsContent?: React.ReactNode;\n  onSelectedAgentChange?: (agentName: string) => void;`;
  source = replaceRequired(
    source,
    typeAnchor,
    `  dataRefreshKey?: number;\n  analyticsContent?: React.ReactNode;\n  onEffectiveCasesChange?: (cases: any[]) => void;\n  onSelectedAgentChange?: (agentName: string) => void;`,
    "Dashboard prop type"
  );

  const effectAnchor = `  const [analyticsTrendMode, setAnalyticsTrendMode] = useState<"weekly" | "monthly" | "yearly">("weekly");\n  const [slideOverOpen, setSlideOverOpen] = useState(false);`;
  source = replaceRequired(
    source,
    effectAnchor,
    `  const [analyticsTrendMode, setAnalyticsTrendMode] = useState<"weekly" | "monthly" | "yearly">("weekly");\n\n  ${marker}\n  useEffect(() => {\n    if (isLoading || loadError) return;\n    onEffectiveCasesChange?.(allCases);\n  }, [allCases, isLoading, loadError, onEffectiveCasesChange]);\n\n  const [slideOverOpen, setSlideOverOpen] = useState(false);`,
    "Dashboard effective-case publish effect"
  );

  fs.writeFileSync(dashboardPath, source, "utf8");
}

function patchSummary() {
  let source = fs.readFileSync(summaryPath, "utf8");
  if (source.includes(marker)) return;

  const mergeKeyAnchor = `function buildCaseMergeKey(item: Pick<CaseItem, "caseId" | "agent" | "evaluationKey">) {\n  const caseId = normalizeEvaluationKeyPart(item.caseId).toUpperCase();\n  const agent = canonicalAgentIdentityKey(item.agent);\n  if (caseId && agent) return ["case", caseId, agent].join("|");\n  return item.evaluationKey;\n}`;
  const normalizer = `${mergeKeyAnchor}\n\n${marker}\nfunction normalizeDashboardEffectiveCases(items: readonly any[]): CaseItem[] {\n  return items\n    .filter((item) => item && !item.isTestCase)\n    .map((item, index) => {\n      const auditDateObj = item.auditDateObj instanceof Date\n        ? item.auditDateObj\n        : excelDateToJSDate(item.auditDate);\n      const finalScore = Number(item.finalScore ?? 0);\n      const safeFinalScore = Number.isFinite(finalScore) ? finalScore : 0;\n      const monthKey = String(item.monthKey || getMonthKey(auditDateObj));\n\n      return {\n        ...item,\n        key: String(item.key || item.evaluationKey || \`dashboard-case-\${index}\`),\n        evaluationKey: String(item.evaluationKey || item.key || \`dashboard-case-\${index}\`),\n        agent: String(item.agent || "").trim(),\n        auditDate: String(item.auditDate || ""),\n        auditDateObj,\n        monthKey,\n        monthLabel: String(item.monthLabel || getMonthLabel(auditDateObj)),\n        yearKey: String(item.yearKey || getYearKey(auditDateObj)),\n        weekLabel: String(item.weekLabel || "-").trim(),\n        caseId: String(item.caseId || "").trim(),\n        inquiryTh: String(item.inquiryTh || item.inquiryEn || "-"),\n        inquiryEn: String(item.inquiryEn || item.inquiryTh || "-"),\n        finalScore: Number(safeFinalScore.toFixed(2)),\n        previousScore: Number.isFinite(Number(item.previousScore))\n          ? Number(Number(item.previousScore).toFixed(2))\n          : Number(safeFinalScore.toFixed(2)),\n        grade: item.grade || scoreToGrade(safeFinalScore, monthKey),\n        reviewStatus: item.reviewStatus === "Revised" ? "Revised" : "Original",\n        topics: Array.isArray(item.topics) ? item.topics : [],\n        revisedTopics: Array.isArray(item.revisedTopics) && item.revisedTopics.length\n          ? item.revisedTopics\n          : null,\n        displayRevisedTopicCodes: Array.isArray(item.displayRevisedTopicCodes)\n          ? item.displayRevisedTopicCodes\n          : [],\n      } as CaseItem;\n    })\n    .filter((item) => item.agent && item.caseId && item.auditDateObj);\n}`;
  source = replaceRequired(source, mergeKeyAnchor, normalizer, "Summary case normalizer");

  source = replaceRequired(
    source,
    `  dataRefreshKey,\n  embedded = false,`,
    `  dataRefreshKey,\n  externalEffectiveCases = null,\n  embedded = false,`,
    "Summary prop"
  );
  source = replaceRequired(
    source,
    `  dataRefreshKey?: number;\n  embedded?: boolean;`,
    `  dataRefreshKey?: number;\n  externalEffectiveCases?: readonly any[] | null;\n  embedded?: boolean;`,
    "Summary prop type"
  );

  const stateAnchor = `  const [dashboardControlTarget, setDashboardControlTarget] = useState<HTMLElement | null>(null);`;
  source = replaceRequired(
    source,
    stateAnchor,
    `${stateAnchor}\n  const externalEffectiveCasesRef = useRef<readonly any[] | null>(externalEffectiveCases);\n  externalEffectiveCasesRef.current = externalEffectiveCases;\n\n  useEffect(() => {\n    if (externalEffectiveCases === null) return;\n    const canonicalCases = normalizeDashboardEffectiveCases(externalEffectiveCases);\n    setAllCases(canonicalCases);\n    setAppealMergeCount(canonicalCases.filter((item) => item.reviewStatus === "Revised").length);\n    setLoadError("");\n    setIsLoading(false);\n  }, [externalEffectiveCases]);`,
    "Summary canonical-case state"
  );

  source = replaceRequired(
    source,
    `    const loadWorkbook = async () => {\n      try {`,
    `    const loadWorkbook = async () => {\n      if (externalEffectiveCasesRef.current !== null) return;\n      try {`,
    "Summary loader guard"
  );

  source = replaceRequired(
    source,
    `        setAllCases([...latestByEvaluationKey.values()]);\n        setAppealMergeCount(appealMap.size);\n      } catch (error: any) {\n        setLoadError(error?.message || "เกิดข้อผิดพลาดในการโหลดข้อมูล");`,
    `        if (externalEffectiveCasesRef.current === null) {\n          setAllCases([...latestByEvaluationKey.values()]);\n          setAppealMergeCount(appealMap.size);\n        }\n      } catch (error: any) {\n        if (externalEffectiveCasesRef.current === null) {\n          setLoadError(error?.message || "เกิดข้อผิดพลาดในการโหลดข้อมูล");\n        }`,
    "Summary loader final source priority"
  );

  fs.writeFileSync(summaryPath, source, "utf8");
}

patchApp();
patchDashboard();
patchSummary();
console.log("Analytics now uses Dashboard effective cases directly (v24).");
