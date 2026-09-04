import fs from "node:fs";

const filePath = "src/SummaryMockup.tsx";
const marker = "// dashboard-coaching-status-runtime-fix-v31b";
const requiredMarker = "// dashboard-coaching-status-v31";
let source = fs.readFileSync(filePath, "utf8");

if (source.includes(marker)) {
  console.log("dashboard coaching status runtime fix v31b already applied");
  process.exit(0);
}
if (!source.includes(requiredMarker)) {
  throw new Error("Dashboard coaching status v31 marker not found");
}

const statusStart = source.indexOf("  const dashboardCoachingStatusV31 = (() => {");
const metricStart = source.indexOf("  const metricItems = [", statusStart);
if (statusStart < 0 || metricStart < 0) {
  throw new Error("Dashboard coaching status v31 block not found");
}

const statusBlock = source.slice(statusStart, metricStart);
source = source.slice(0, statusStart) + source.slice(metricStart);

const appendCard = String.raw`  if (dashboardCoachingStatusV31) {
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

if (!source.includes(appendCard)) {
  throw new Error("Dashboard coaching status v31 metric append block not found");
}
source = source.replace(appendCard, "");

const effectiveAgentAnchor = `  const effectiveSelectedAgent =
    roleScopedAgentList.length
      ? roleScopedAgentList[0]
      : selectedAgent;
`;
if (!source.includes(effectiveAgentAnchor)) {
  throw new Error("effectiveSelectedAgent anchor not found");
}

const relocated = `${effectiveAgentAnchor}\n  ${marker}\n${statusBlock}${appendCard}`;
source = source.replace(effectiveAgentAnchor, relocated);

fs.writeFileSync(filePath, source, "utf8");
console.log("Dashboard Coaching Status runtime scope fix v31b applied");
