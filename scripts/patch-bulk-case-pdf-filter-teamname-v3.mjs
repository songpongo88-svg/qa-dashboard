import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dashboardPath = path.resolve(__dirname, "../src/DashboardMockup.tsx");
const summaryPath = path.resolve(__dirname, "../src/SummaryMockup.tsx");
const pdfPath = path.resolve(__dirname, "../src/caseDetailOfficialPdf.ts");
const marker = "bulk-case-pdf-filter-teamname-v3";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing ${label} anchor`);
  return source.replace(before, after);
}

function patchSummary() {
  let source = fs.readFileSync(summaryPath, "utf8");
  if (source.includes(marker)) return;

  const anchor = '    window.sessionStorage.setItem("qa_analytics_team_v134", selectedTeam);';
  source = replaceOnce(
    source,
    anchor,
    `${anchor}\n    // ${marker}\n    window.dispatchEvent(new CustomEvent("qa-dashboard-team-filter-change", { detail: { team: selectedTeam } }));`,
    "Summary selected Team sync"
  );

  fs.writeFileSync(summaryPath, source, "utf8");
}

function patchDashboard() {
  let source = fs.readFileSync(dashboardPath, "utf8");
  if (source.includes(marker)) return;
  if (!source.includes("bulk-case-pdf-role-scopes-v2")) {
    throw new Error("Bulk PDF role scopes v2 must run before filter/team patch");
  }

  const stateAnchor = '  const [bulkCasePdfMode, setBulkCasePdfMode] = useState<"all" | "my" | "">("");';
  source = replaceOnce(
    source,
    stateAnchor,
    `${stateAnchor}\n  // ${marker}\n  const [bulkCasePdfSelectedTeam, setBulkCasePdfSelectedTeam] = useState(() =>\n    window.sessionStorage.getItem("qa_analytics_team_v134") || "all"\n  );\n\n  useEffect(() => {\n    const syncTeam = (event?: Event) => {\n      const detailTeam = String((event as CustomEvent)?.detail?.team || "").trim();\n      const storedTeam = window.sessionStorage.getItem("qa_analytics_team_v134") || "all";\n      setBulkCasePdfSelectedTeam(detailTeam || storedTeam);\n    };\n    window.addEventListener("qa-dashboard-team-filter-change", syncTeam);\n    return () => window.removeEventListener("qa-dashboard-team-filter-change", syncTeam);\n  }, []);`,
    "Dashboard Team filter state"
  );

  const oldLogic = `  const allCasePdfCases = useMemo(() => {\n    if (!qaCanGenerateAllCasePdf || !isMonthlyView || selectedMonthKey === "all") return [];\n    return allCases.filter((item) =>\n      item.monthKey === selectedMonthKey &&\n      Boolean(String(item.caseId || "").trim()) &&\n      !isTestCaseEvaluation(item)\n    );\n  }, [allCases, isMonthlyView, qaCanGenerateAllCasePdf, selectedMonthKey]);\n\n  const myCasePdfCases = useMemo(() => {\n    if (!qaCanGenerateAllCasePdf || !isSeniorBulkCasePdfRole || !isMonthlyView || selectedMonthKey === "all") return [];\n    const currentUsername = String(currentUser?.username || "").trim().toLowerCase();\n    const selfAgent = String(currentUser?.agentName || currentUser?.displayName || "").trim();\n    return allCasePdfCases.filter((item) => {\n      const targetUsername = String(item.targetUsername || "").trim().toLowerCase();\n      if (currentUsername && targetUsername) return currentUsername === targetUsername;\n      return Boolean(selfAgent) && isSameAgent(item.agent, selfAgent);\n    });\n  }, [\n    allCasePdfCases,\n    currentUser?.agentName,\n    currentUser?.displayName,\n    currentUser?.username,\n    isMonthlyView,\n    isSeniorBulkCasePdfRole,\n    qaCanGenerateAllCasePdf,\n    selectedMonthKey,\n  ]);`;

  const newLogic = `  const monthlyCasePdfCases = useMemo(() => {\n    if (!qaCanGenerateAllCasePdf || !isMonthlyView || selectedMonthKey === "all") return [];\n    return allCases\n      .filter((item) =>\n        item.monthKey === selectedMonthKey &&\n        Boolean(String(item.caseId || "").trim()) &&\n        !isTestCaseEvaluation(item)\n      )\n      .map((item) => {\n        const team = resolveCaseAgentTeam(item, caseAgentDirectory);\n        return { ...item, teamName: team.teamName || "" };\n      });\n  }, [allCases, caseAgentDirectory, isMonthlyView, qaCanGenerateAllCasePdf, selectedMonthKey]);\n\n  const allCasePdfCases = useMemo(() => {\n    let scopedCases = monthlyCasePdfCases;\n\n    if (selectedAgent && selectedAgent !== "all") {\n      scopedCases = scopedCases.filter((item) => isSameAgent(item.agent, selectedAgent));\n    }\n\n    if (bulkCasePdfSelectedTeam && bulkCasePdfSelectedTeam !== "all") {\n      scopedCases = scopedCases.filter((item) =>\n        normalizeText(item.teamName) === normalizeText(bulkCasePdfSelectedTeam)\n      );\n    }\n\n    return scopedCases;\n  }, [bulkCasePdfSelectedTeam, monthlyCasePdfCases, selectedAgent]);\n\n  const myCasePdfCases = useMemo(() => {\n    if (!qaCanGenerateAllCasePdf || !isSeniorBulkCasePdfRole || !isMonthlyView || selectedMonthKey === "all") return [];\n    const currentUsername = String(currentUser?.username || "").trim().toLowerCase();\n    const selfAgent = String(currentUser?.agentName || currentUser?.displayName || "").trim();\n    return monthlyCasePdfCases.filter((item) => {\n      const targetUsername = String(item.targetUsername || "").trim().toLowerCase();\n      if (currentUsername && targetUsername) return currentUsername === targetUsername;\n      return Boolean(selfAgent) && isSameAgent(item.agent, selfAgent);\n    });\n  }, [\n    currentUser?.agentName,\n    currentUser?.displayName,\n    currentUser?.username,\n    isMonthlyView,\n    isSeniorBulkCasePdfRole,\n    monthlyCasePdfCases,\n    qaCanGenerateAllCasePdf,\n    selectedMonthKey,\n  ]);`;

  source = replaceOnce(source, oldLogic, newLogic, "Bulk PDF Team + Agent filtering");

  source = source.replace(
    /caseItem=\{activeSelectedCase\}/g,
    'caseItem={{ ...activeSelectedCase, teamName: selectedCaseTeam.teamName || "" }}'
  );

  fs.writeFileSync(dashboardPath, source, "utf8");
}

function patchPdf() {
  let source = fs.readFileSync(pdfPath, "utf8");
  if (source.includes(marker)) return;
  if (!source.includes("bulk-case-detail-pdf-v1")) {
    throw new Error("Bulk PDF shared-document patch must run before PDF team-name patch");
  }

  const safeTextAnchor = `function safeText(value: unknown, fallback = "-") {\n  const text = richTextToPlainText(value).replace(/\\s+/g, " ").trim();\n  return text || fallback;\n}`;
  source = replaceOnce(
    source,
    safeTextAnchor,
    `${safeTextAnchor}\n\n// ${marker}\nfunction agentSelectionText(caseItem: any) {\n  const agent = safeText(caseItem?.agent);\n  const team = safeText(caseItem?.teamName || caseItem?.team || "", "");\n  return team ? \`${'${agent}'}\\n(${'${team}'})\` : agent;\n}`,
    "PDF agent display helper"
  );

  const valueAnchor = `  const value = (col: number, yy: number, span: number, h: number, val: unknown, bg = LIGHT_PURPLE, opts: TextOptions = {}) => {\n    cell(col, yy, span, h, val, bg, {\n      bold: opts.bold ?? true,\n      size: opts.size ?? 7.2,\n      valign: opts.valign ?? "auto",\n      align: opts.align ?? "left",\n      maxLines: opts.maxLines ?? Math.max(1, Math.floor((h - 3) / 2.4)),\n      leading: opts.leading ?? 0.46,\n      color: opts.color,\n      link: opts.link,\n    });\n  };`;

  source = replaceOnce(
    source,
    valueAnchor,
    `${valueAnchor}\n\n  const agentValue = (col: number, yy: number, span: number, h: number, caseItemValue: any) => {\n    const x = xOf(col);\n    const w = wOf(col, span);\n    rect(x, yy, w, h, LIGHT_PURPLE);\n    const team = safeText(caseItemValue?.teamName || caseItemValue?.team || "", "");\n    if (!team) {\n      writeText(caseItemValue?.agent, x, yy, w, h, { bold: true, size: 6.8, align: "center", valign: "middle", maxLines: 2 });\n      return;\n    }\n    writeText(caseItemValue?.agent, x, yy + 0.4, w, Math.max(6, h * 0.57), { bold: true, size: 6.8, align: "center", valign: "middle", maxLines: 2 });\n    writeText(\`(${'${team}'})\`, x, yy + h * 0.52, w, Math.max(4.5, h * 0.4), { bold: false, size: 5.4, color: [105, 105, 105], align: "center", valign: "middle", maxLines: 1 });\n  };`,
    "PDF agent cell renderer"
  );

  source = source.replace(
    /\{ value: caseItem\.agent, w: wOf\(1, 2\), size: 6\.8, padY: 4 \}/g,
    '{ value: agentSelectionText(caseItem), w: wOf(1, 2), size: 6.8, padY: 5 }'
  );
  source = source.replace(
    /value\(1, y, 2, firstSelectionRowH, caseItem\.agent, LIGHT_PURPLE, \{ align: "center", valign: "middle", maxLines: 2, size: 6\.8 \}\);/g,
    'agentValue(1, y, 2, firstSelectionRowH, caseItem);'
  );
  source = source.replace(
    /value\(1, y, 2, appealSelectionRowH, caseItem\.agent, LIGHT_PURPLE, \{ align: "center", valign: "middle", maxLines: 2, size: 6\.8 \}\);/g,
    'agentValue(1, y, 2, appealSelectionRowH, caseItem);'
  );

  fs.writeFileSync(pdfPath, source, "utf8");
}

patchSummary();
patchDashboard();
patchPdf();
console.log("Patched Gen All PDF to follow Team/Agent filters and show Team below Agent in PDF.");
