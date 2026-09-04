import fs from "node:fs";

const filePath = "src/SummaryMockup.tsx";
const marker = "// dashboard-coaching-status-v31";
let source = fs.readFileSync(filePath, "utf8");

if (source.includes(marker)) {
  console.log("dashboard coaching status v31 already applied");
  process.exit(0);
}

function replaceOnce(label, search, replacement) {
  if (!source.includes(search)) throw new Error(`Dashboard coaching v31 anchor not found: ${label}`);
  source = source.replace(search, replacement);
}

replaceOnce(
  "imports",
  `import { canonicalAgentIdentityKey, canonicalizeAgentName, isSameCanonicalAgent, JIRAPONG_AGENT_NAME } from "./lib/agentIdentity";`,
  `import { canonicalAgentIdentityKey, canonicalizeAgentName, isSameCanonicalAgent, JIRAPONG_AGENT_NAME } from "./lib/agentIdentity";\nimport { fetchStoredCoachingRecords } from "./coachingStore";\nimport { fetchStoredCoachingSchedules } from "./coachingScheduleStore";\n${marker}`
);

const stateAnchor = `  const [selectedMonth, setSelectedMonth] = useState<string>(externalSelectedMonth || "all");`;
replaceOnce(
  "states",
  stateAnchor,
  `  const [dashboardCoachingRecordsV31, setDashboardCoachingRecordsV31] = useState<any[]>([]);\n  const [dashboardCoachingSchedulesV31, setDashboardCoachingSchedulesV31] = useState<any[]>([]);\n${stateAnchor}`
);

const weekAnchor = `  const [selectedWeek, setSelectedWeek] = useState<string>(externalSelectedWeek || "all");`;
replaceOnce(
  "load effect",
  weekAnchor,
  `${weekAnchor}\n\n  useEffect(() => {\n    let active = true;\n    const loadCoachingStatus = async () => {\n      const [records, schedules] = await Promise.all([\n        fetchStoredCoachingRecords().catch(() => []),\n        fetchStoredCoachingSchedules().catch(() => []),\n      ]);\n      if (!active) return;\n      setDashboardCoachingRecordsV31(records);\n      setDashboardCoachingSchedulesV31(schedules);\n    };\n    void loadCoachingStatus();\n    if (typeof window !== "undefined") {\n      window.addEventListener("qa-coaching-refresh", loadCoachingStatus);\n    }\n    return () => {\n      active = false;\n      if (typeof window !== "undefined") {\n        window.removeEventListener("qa-coaching-refresh", loadCoachingStatus);\n      }\n    };\n  }, []);`
);

const metricStart = source.indexOf("  const metricItems = [");
if (metricStart < 0) throw new Error("Dashboard coaching v31 metricItems not found");
const metricEnd = source.indexOf("\n  ];", metricStart);
if (metricEnd < 0) throw new Error("Dashboard coaching v31 metricItems end not found");

const coachingStatusCode = String.raw`
  const dashboardCoachingStatusV31 = (() => {
    if (!effectiveSelectedAgent || effectiveSelectedAgent === "all" || !selectedMonth || selectedMonth === "all") {
      return null;
    }
    const coached = dashboardCoachingRecordsV31
      .filter((item) => item.monthKey === selectedMonth && isSameCanonicalAgent(item.agent, effectiveSelectedAgent))
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
      .find((item) => item.status === "Coached" || item.status === "Completed");
    if (coached) {
      return {
        value: "Coached",
        note: coached.coachingDate ? "Coached: " + coached.coachingDate : "Coaching completed",
        icon: "✓",
        tone: "bg-emerald-50 text-emerald-700",
        valueTone: "text-emerald-700",
      };
    }
    const scheduled = dashboardCoachingSchedulesV31
      .filter((item) => item.monthKey === selectedMonth && isSameCanonicalAgent(item.agent, effectiveSelectedAgent) && item.status !== "Coached")
      .sort((a, b) => (String(a.date || "") + String(a.time || "")).localeCompare(String(b.date || "") + String(b.time || "")))[0];
    if (scheduled) {
      return {
        value: "Scheduled",
        note: [scheduled.date, scheduled.time].filter(Boolean).join(" · "),
        icon: "◷",
        tone: "bg-amber-50 text-amber-700",
        valueTone: "text-amber-700",
      };
    }
    return {
      value: "Not Started",
      note: "ยังไม่มีการนัดหมายหรือ Coaching ในเดือนนี้",
      icon: "○",
      tone: "bg-slate-100 text-slate-500",
      valueTone: "text-slate-500",
    };
  })();

`;
source = source.slice(0, metricStart) + coachingStatusCode + source.slice(metricStart);

// metricStart moved after insertion; locate the array again and append the conditional card after it.
const metricStart2 = source.indexOf("  const metricItems = [", metricStart + coachingStatusCode.length);
const metricEnd2 = source.indexOf("\n  ];", metricStart2);
if (metricStart2 < 0 || metricEnd2 < 0) throw new Error("Dashboard coaching v31 metric array relocation failed");
const afterMetric = metricEnd2 + "\n  ];".length;
const appendCard = String.raw`
  if (dashboardCoachingStatusV31) {
    metricItems.push({
      title: "Coaching Status",
      value: dashboardCoachingStatusV31.value,
      note: dashboardCoachingStatusV31.note,
      icon: dashboardCoachingStatusV31.icon,
      tone: dashboardCoachingStatusV31.tone,
      valueTone: dashboardCoachingStatusV31.valueTone,
    });
  }
`;
source = source.slice(0, afterMetric) + appendCard + source.slice(afterMetric);

source = source.replace(
  `!hideSummaryCards ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">`,
  `!hideSummaryCards ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">`
);

fs.writeFileSync(filePath, source, "utf8");
console.log("Dashboard Agent + Month Coaching Status card v31 applied");
