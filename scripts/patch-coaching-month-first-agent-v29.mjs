import fs from "node:fs";

const filePath = "src/CoachingMockup.tsx";
const marker = "// coaching-month-first-agent-v29";
const requiredMarker = "// coaching-case-evidence-v28";
let source = fs.readFileSync(filePath, "utf8");

if (source.includes(marker)) {
  console.log("coaching month-first agent filter v29 already applied");
  process.exit(0);
}
if (!source.includes(requiredMarker)) {
  throw new Error("Coaching v28 marker not found; run previous Coaching patches first");
}

function replaceOnce(label, search, replacement) {
  if (!source.includes(search)) {
    throw new Error(`Coaching v29 anchor not found: ${label}`);
  }
  source = source.replace(search, replacement);
}

replaceOnce(
  "remove team state",
  '  const [selectedTeam, setSelectedTeam] = useState("all");\n',
  `  ${marker}\n`
);

const teamOptionsStart = source.indexOf("  const teamOptions = useMemo(() => {");
const agentOptionsStart = source.indexOf("  const agentOptions = useMemo(() => {", teamOptionsStart);
if (teamOptionsStart < 0 || agentOptionsStart < 0) {
  throw new Error("Coaching v29 team/agent options block not found");
}
source = source.slice(0, teamOptionsStart) + source.slice(agentOptionsStart);

const oldAgentOptions = `  const agentOptions = useMemo(() => {\n    const rows = evaluations.filter(\n      (item) =>\n        selectedTeam === "all" ||\n        getTeamName(item) === selectedTeam\n    );\n    const names = [\n      ...new Set(\n        rows\n          .map((item) =>\n            titleCaseName(\n              item.agentName ||\n                item.targetDisplayName\n            )\n          )\n          .filter(Boolean)\n      ),\n    ].filter(\n      (name) =>\n        !allowedAgents.length ||\n        allowedAgents.some((allowed) =>\n          isSameAgent(allowed, name)\n        )\n    );\n    return names.sort((a, b) =>\n      a.localeCompare(b)\n    );\n  }, [evaluations, selectedTeam, allowedAgents]);`;

const newAgentOptions = `  const agentOptions = useMemo(() => {\n    const rows = evaluations.filter((item) => {\n      if (getMonthKey(getEvaluationDate(item)) !== selectedMonth) return false;\n      if (!allowedAgents.length) return true;\n      return allowedAgents.some((allowed) =>\n        isSameAgent(\n          allowed,\n          item.agentName || item.targetDisplayName\n        )\n      );\n    });\n    const names = [\n      ...new Set(\n        rows\n          .map((item) =>\n            titleCaseName(item.agentName || item.targetDisplayName)\n          )\n          .filter(Boolean)\n      ),\n    ];\n    return names.sort((a, b) => a.localeCompare(b));\n  }, [evaluations, selectedMonth, allowedAgents]);`;
replaceOnce("month-scoped agent options", oldAgentOptions, newAgentOptions);

const oldMonthOptions = `  const monthOptions = useMemo(() => {\n    return [\n      ...new Set(\n        [\n          getMonthKey(new Date()),\n          ...selectedAgentRows.map((item) =>\n            getMonthKey(getEvaluationDate(item))\n          ),\n        ].filter((key) => key !== "unknown")\n      ),\n    ].sort((a, b) => b.localeCompare(a));\n  }, [selectedAgentRows]);`;

const newMonthOptions = `  const monthOptions = useMemo(() => {\n    const scopedRows = evaluations.filter((item) => {\n      if (!allowedAgents.length) return true;\n      return allowedAgents.some((allowed) =>\n        isSameAgent(\n          allowed,\n          item.agentName || item.targetDisplayName\n        )\n      );\n    });\n    return [\n      ...new Set(\n        [\n          getMonthKey(new Date()),\n          ...scopedRows.map((item) => getMonthKey(getEvaluationDate(item))),\n        ].filter((key) => key !== "unknown")\n      ),\n    ].sort((a, b) => b.localeCompare(a));\n  }, [evaluations, allowedAgents]);`;
replaceOnce("agent-independent month options", oldMonthOptions, newMonthOptions);

replaceOnce(
  "selected team name fallback",
  `  const selectedTeamName = monthlyRows[0]\n    ? getTeamName(monthlyRows[0])\n    : selectedTeam === "all"\n    ? ""\n    : selectedTeam;`,
  `  const selectedTeamName = monthlyRows[0]\n    ? getTeamName(monthlyRows[0])\n    : "";`
);

const filterGridStart = source.indexOf('          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">');
const filterGridEndAnchor = '          <div className="mt-5 flex flex-wrap gap-3">';
const filterGridEnd = source.indexOf(filterGridEndAnchor, filterGridStart);
if (filterGridStart < 0 || filterGridEnd < 0) {
  throw new Error("Coaching v29 filter grid block not found");
}

const newFilterGrid = `          <div className="grid gap-4 md:grid-cols-3">\n            <label>\n              <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">\n                Month\n              </span>\n              <select\n                value={selectedMonth}\n                onChange={(event) => {\n                  const nextMonth = event.target.value;\n                  setSelectedMonth(nextMonth);\n                  onSelectedMonthChange?.(nextMonth);\n                }}\n                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"\n              >\n                {monthOptions.map((month) => (\n                  <option key={month} value={month}>\n                    {getMonthLabel(month)}\n                  </option>\n                ))}\n              </select>\n            </label>\n\n            <label>\n              <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">\n                Agent\n              </span>\n              <select\n                value={selectedAgent}\n                disabled={!agentOptions.length}\n                onChange={(event) => {\n                  setSelectedAgent(event.target.value);\n                  onSelectedAgentChange?.(event.target.value);\n                }}\n                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:opacity-60"\n              >\n                <option value="">\n                  {agentOptions.length ? "ยังไม่เลือก Agent" : "ไม่มี Agent ในเดือนนี้"}\n                </option>\n                {agentOptions.map((agent) => (\n                  <option key={agent} value={agent}>\n                    {agent}\n                  </option>\n                ))}\n              </select>\n            </label>\n\n            <label>\n              <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">\n                Coaching Status\n              </span>\n              <select\n                value={statusFilter}\n                onChange={(event) =>\n                  setStatusFilter(\n                    event.target.value as\n                      | "All"\n                      | CoachingRecordStatus\n                      | "Follow-up Due"\n                  )\n                }\n                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"\n              >\n                {STATUS_OPTIONS.map((status) => (\n                  <option key={status} value={status}>\n                    {status}\n                  </option>\n                ))}\n              </select>\n            </label>\n          </div>\n\n`;
source = source.slice(0, filterGridStart) + newFilterGrid + source.slice(filterGridEnd);

replaceOnce(
  "empty agent heading",
  `            <div className="text-xl font-black text-slate-900">\n              กรุณาเลือก Agent ที่ต้องการวิเคราะห์\n            </div>\n            <div className="mt-2 text-sm text-slate-500">\n              ระบบจะเริ่มจากเดือนปัจจุบันและยังไม่สร้าง Coaching จนกว่าจะเลือกชื่อ\n            </div>`,
  `            <div className="text-xl font-black text-slate-900">\n              {agentOptions.length\n                ? "กรุณาเลือก Agent ที่ต้องการวิเคราะห์"\n                : "ไม่มี Agent ในเดือนนี้"}\n            </div>\n            <div className="mt-2 text-sm text-slate-500">\n              {agentOptions.length\n                ? "เลือกรายชื่อ Agent ที่มี Case จริงในเดือนที่เลือก แล้วจึง Generate Coaching"\n                : "ไม่พบ Case ของ Agent ภายใต้สิทธิ์การมองเห็นของคุณในเดือนนี้"}\n            </div>`
);

fs.writeFileSync(filePath, source, "utf8");
console.log("Coaching month-first filter, month-scoped Agent list, and Team removal v29 applied");
