import fs from "node:fs";

const filePath = "src/CoachingMockup.tsx";
const marker = "// coaching-dashboard-source-parity-v27";
let source = fs.readFileSync(filePath, "utf8");

if (source.includes(marker)) {
  console.log("coaching dashboard parity v27 already applied");
  process.exit(0);
}

function replaceOnce(label, search, replacement) {
  if (!source.includes(search)) throw new Error(`Coaching v27 anchor not found: ${label}`);
  source = source.replace(search, replacement);
}

replaceOnce(
  "canonical import",
  'import { fetchHistoricalCoachingEvaluations } from "./coachingHistoricalStore";',
  `import { fetchHistoricalCoachingEvaluations } from "./coachingHistoricalStore";\nimport { fetchCanonicalCoachingEvaluations } from "./coachingCanonicalStore";\nimport { scoreToGrade } from "./lib/scoreIncentivePolicy";\n${marker}`
);

replaceOnce(
  "case month date precedence",
  `  return (\n    parseEvaluationDate(item.auditTimestamp) ||\n    parseEvaluationDate(item.auditDate) ||`,
  `  return (\n    // Dashboard groups a case by Case/Audit Date, not by the later submission timestamp.\n    parseEvaluationDate(item.auditDate) ||\n    parseEvaluationDate(item.auditTimestamp) ||`
);

const topicStart = source.indexOf("function topicKeyFromTopic(");
const topicEnd = source.indexOf("function summarizeTopics(", topicStart);
if (topicStart < 0 || topicEnd < 0) throw new Error("Coaching v27 topic classifier block not found");
source = source.slice(0, topicStart) + `function topicKeyFromTopic(\n  topic: StoredEvaluationTopic\n): TopicKey | null {\n  const code = normalizeText(topic.code);\n  const title = normalizeText(topic.title);\n\n  // Use rubric codes first so wording such as \"ขั้นตอน\" in Answer Quality\n  // cannot accidentally move a topic into Process Compliance.\n  if (/^\\d+$/.test(code)) {\n    if (code === \"1\") return Number(topic.max || 0) >= 20 ? \"process\" : \"communication\";\n    if (code === \"2\") return \"accuracy\";\n    if (code === \"3\") return Number(topic.max || 0) >= 20 ? \"process\" : \"handling\";\n    if (code === \"4\") return \"communication\";\n    if (code === \"5\") return \"communication\";\n    if (code === \"6\") return \"process\";\n  }\n\n  if (code === \"1.1\") return \"communication\";\n  if (code === \"1.2\") {\n    return /pdpa|policy|ข้อกำหนด/.test(title) ? \"process\" : \"accuracy\";\n  }\n  if (code === \"1.3\") return \"process\";\n  if (code.startsWith(\"2.\")) return \"accuracy\";\n  if (code.startsWith(\"3.\")) return \"handling\";\n  if (code.startsWith(\"4.\")) return \"communication\";\n  if (code.startsWith(\"5.\")) return \"process\";\n\n  const combined = \`${'${code} ${title}'}\`;\n  if (/process|procedure|workflow|compliance|ขั้นตอน|หลังบ้าน|case note|tag|refund|cancel|logging|status accuracy|sla|ระยะเวลา/.test(combined)) return \"process\";\n  if (/accuracy|verification|correct|information|ข้อมูล|ตรวจสอบ|ถูกต้อง|สถานะ|official source|completeness/.test(combined)) return \"accuracy\";\n  if (/handling|follow|ownership|root cause|resolution|next step|ดูแล|ติดตาม|รับผิดชอบ|ปิดเคส|ค้าง|วิเคราะห์|แก้ไข/.test(combined)) return \"handling\";\n  if (/communication|language|tone|empathy|structure|greeting|closing|adaptation|สื่อสาร|ภาษา|น้ำเสียง|ข้อความ|สุภาพ|ทักทาย|เปิด-ปิด/.test(combined)) return \"communication\";\n  return null;\n}\n\n` + source.slice(topicEnd);

replaceOnce(
  "topic matched case counter",
  `    let scoreTotal = 0;\n    let maxTotal = 0;\n    const deductedCaseIds = new Set<string>();`,
  `    let scoreTotal = 0;\n    let maxTotal = 0;\n    let matchedCaseCount = 0;\n    const deductedCaseIds = new Set<string>();`
);

replaceOnce(
  "topic matched case increment",
  `      );\n      if (!matchingTopics.length) return;\n\n      const score = matchingTopics.reduce(`,
  `      );\n      if (!matchingTopics.length) return;\n      matchedCaseCount += 1;\n\n      const score = matchingTopics.reduce(`
);

replaceOnce(
  "topic actual average",
  `    const percentage =\n      maxTotal > 0 ? (scoreTotal / maxTotal) * 100 : 0;\n    const averageScore =\n      maxTotal > 0\n        ? (percentage / 100) * definition.maxScore\n        : 0;`,
  `    const percentage =\n      maxTotal > 0 ? (scoreTotal / maxTotal) * 100 : 0;\n    const averageScore =\n      matchedCaseCount > 0 ? scoreTotal / matchedCaseCount : 0;\n    const averageMaxScore =\n      matchedCaseCount > 0 ? maxTotal / matchedCaseCount : 0;`
);

replaceOnce(
  "topic actual max",
  `      maxScore: definition.maxScore,`,
  `      maxScore: Number(averageMaxScore.toFixed(2)),`
);

const gradeStart = source.indexOf("function buildGrade(score: number)");
const gradeEnd = source.indexOf("function buildDraft(", gradeStart);
if (gradeStart < 0 || gradeEnd < 0) throw new Error("Coaching v27 grade block not found");
source = source.slice(0, gradeStart) + `function buildGrade(score: number, monthKey?: string) {\n  return scoreToGrade(score, monthKey);\n}\n\n` + source.slice(gradeEnd);

replaceOnce(
  "draft grade month policy",
  `  const grade = buildGrade(average);`,
  `  const grade = buildGrade(average, monthKey);`
);

replaceOnce(
  "current grade month policy",
  `  const grade = monthlyRows.length\n    ? buildGrade(averageScore)\n    : "-";`,
  `  const grade = monthlyRows.length\n    ? buildGrade(averageScore, selectedMonth)\n    : "-";`
);

const loadOld = `        const [\n          currentRows,\n          historicalRows,\n          coachingRows,\n        ] = await Promise.all([\n          fetchStoredEvaluations(1000),\n          fetchHistoricalCoachingEvaluations().catch(() => []),\n          fetchStoredCoachingRecords().catch(() => []),\n        ]);\n\n        if (cancelled) return;\n        setEvaluations(\n          mergeEvaluationSources(excludeTestEvaluations(historicalRows), excludeTestEvaluations(currentRows))\n        );\n        setRecords(coachingRows);`;
const loadNew = `        const [canonicalRows, coachingRows] = await Promise.all([\n          fetchCanonicalCoachingEvaluations(),\n          fetchStoredCoachingRecords().catch(() => []),\n        ]);\n\n        if (cancelled) return;\n        setEvaluations(canonicalRows);\n        setRecords(coachingRows);`;
replaceOnce("canonical dashboard load", loadOld, loadNew);

replaceOnce(
  "refresh state",
  `  const [isSaving, setIsSaving] = useState(false);`,
  `  const [isSaving, setIsSaving] = useState(false);\n  const [coachingDataRefreshKey, setCoachingDataRefreshKey] = useState(0);`
);

const loadEffectAnchor = `  useEffect(() => {\n    let cancelled = false;\n\n    void (async () => {`;
replaceOnce(
  "refresh listener",
  loadEffectAnchor,
  `  useEffect(() => {\n    if (typeof window === \"undefined\") return;\n    const refresh = () => setCoachingDataRefreshKey(Date.now());\n    window.addEventListener(\"qa-dashboard-data-refresh\", refresh);\n    return () => window.removeEventListener(\"qa-dashboard-data-refresh\", refresh);\n  }, []);\n\n${loadEffectAnchor}`
);

replaceOnce(
  "canonical reload dependency",
  `    return () => {\n      cancelled = true;\n    };\n  }, []);\n\n  const allowedAgents`,
  `    return () => {\n      cancelled = true;\n    };\n  }, [coachingDataRefreshKey]);\n\n  const allowedAgents`
);

const regenerateAnchor = `  const generateCoaching = () => {`;
if (!source.includes(regenerateAnchor)) throw new Error("Coaching v27 generate anchor not found");
const regenerateEffect = `  // Saved Coaching records keep the human-entered follow-up fields, while\n  // Monthly Feedback is always rebuilt from the current Dashboard-canonical cases.\n  useEffect(() => {\n    if (!matchingRecord || !selectedAgent || !selectedMonth || !monthlyRows.length) return;\n    const generated = buildDraft(\n      selectedAgent,\n      selectedMonth,\n      monthlyRows,\n      topicSummaries,\n      priorities,\n      matchingRecord.coachedBy || currentUser?.displayName || currentUser?.agentName || currentUser?.username || \"\"\n    );\n    setDraft({\n      ...generated,\n      coachingDate: matchingRecord.coachingDate || generated.coachingDate,\n      coachedBy: matchingRecord.coachedBy || generated.coachedBy,\n      followUpDate: matchingRecord.followUpDate,\n      result: matchingRecord.result,\n      agentResponse: matchingRecord.agentResponse,\n      agreedActionPlan: matchingRecord.agreedActionPlan || generated.actionPlan,\n      additionalNote: matchingRecord.additionalNote,\n    });\n    setEditMode(false);\n  }, [\n    matchingRecord?.id,\n    matchingRecord?.updatedAt,\n    selectedAgent,\n    selectedMonth,\n    monthlyRows,\n    topicSummaries,\n    priorities,\n    currentUser?.displayName,\n    currentUser?.agentName,\n    currentUser?.username,\n  ]);\n\n`;
source = source.replace(regenerateAnchor, regenerateEffect + regenerateAnchor);

fs.writeFileSync(filePath, source, "utf8");
console.log("Coaching dashboard source parity, historical policy, appeal refresh, and Monthly Feedback v27 applied");
