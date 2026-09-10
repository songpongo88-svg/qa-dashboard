import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dashboardPath = path.join(root, "src", "DashboardMockup.tsx");
const marker = "selected-case-appeal-countdown-v64";

let source = fs.readFileSync(dashboardPath, "utf8");
if (source.includes(marker)) {
  console.log("Selected Case appeal countdown v64 already applied.");
  process.exit(0);
}

const helperAnchor = `function formatBangkokDateTime(value: Date | string | null) {`;
if (!source.includes(helperAnchor)) {
  throw new Error("Selected Case appeal countdown v64: helper anchor not found");
}

const helper = `// ${marker}\nfunction SelectedCaseAppealCountdownV64({ caseItem }: { caseItem: CaseItem }) {\n  const [nowMs, setNowMs] = useState(() => Date.now());\n  const deadline = getAppealDeadline(caseItem.auditDateObj);\n\n  useEffect(() => {\n    setNowMs(Date.now());\n    if (!deadline) return;\n    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);\n    return () => window.clearInterval(timer);\n  }, [caseItem.caseId, deadline?.getTime()]);\n\n  if (caseItem.hasAppealHistory || caseItem.appealStatus) {\n    return <div className=\"mt-1 text-[11px] font-extrabold text-sky-600\">Appeal · ใช้งานแล้ว</div>;\n  }\n\n  if (!deadline) {\n    return <div className=\"mt-1 text-[11px] font-bold text-slate-400\">Appeal · ไม่พบกำหนดเวลา</div>;\n  }\n\n  const remainingMs = deadline.getTime() - nowMs;\n  if (remainingMs <= 0) {\n    return <div className=\"mt-1 text-[11px] font-extrabold text-slate-500\">Appeal · หมดเวลาอุทธรณ์</div>;\n  }\n\n  const totalSeconds = Math.floor(remainingMs / 1000);\n  const days = Math.floor(totalSeconds / 86400);\n  const hours = Math.floor((totalSeconds % 86400) / 3600);\n  const minutes = Math.floor((totalSeconds % 3600) / 60);\n  const seconds = totalSeconds % 60;\n  const clock = [hours, minutes, seconds].map((value) => String(value).padStart(2, \"0\")).join(\":\");\n  const text = days > 0 ? \`เหลือ \${days} วัน \${clock}\` : \`เหลือ \${clock}\`;\n  const tone = remainingMs <= 24 * 60 * 60 * 1000\n    ? \"text-rose-600\"\n    : remainingMs <= 3 * 24 * 60 * 60 * 1000\n      ? \"text-amber-600\"\n      : \"text-teal-600\";\n\n  return <div className={\`mt-1 text-[11px] font-extrabold tabular-nums \${tone}\`}>Appeal · {text}</div>;\n}\n\n`;
source = source.replace(helperAnchor, helper + helperAnchor);

const cardAnchor = `                                  <div className=\"mt-1 truncate text-xl font-bold text-slate-950\">{activeSelectedCase.caseId}</div>\n                                  {isTestCaseEvaluation(activeSelectedCase) ? <TestCaseBadge /> : null}`;
const cardReplacement = `                                  <div className=\"mt-1 truncate text-xl font-bold text-slate-950\">{activeSelectedCase.caseId}</div>\n                                  <SelectedCaseAppealCountdownV64 caseItem={activeSelectedCase} />\n                                  {isTestCaseEvaluation(activeSelectedCase) ? <TestCaseBadge /> : null}`;

const matches = source.split(cardAnchor).length - 1;
if (matches < 1) {
  throw new Error("Selected Case appeal countdown v64: Selected Case card anchor not found");
}
source = source.split(cardAnchor).join(cardReplacement);

fs.writeFileSync(dashboardPath, source, "utf8");
console.log(`Selected Case appeal countdown v64 applied to ${matches} card block(s).`);
