import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appealPath = path.join(root, "src", "AppealMockup.tsx");
const marker = "appeal-two-column-mockup-v36";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Appeal two-column v36 anchor not found: ${label}`);
  }
  return source.replace(before, after);
}

let source = fs.readFileSync(appealPath, "utf8");

if (!source.includes(`// ${marker}`)) {
  source = replaceOnce(
    source,
    `  // appeal-detail-dashboard-link-v35\n  const [searchCaseId, setSearchCaseId] = useState("");`,
    `  // appeal-detail-dashboard-link-v35\n  // ${marker}\n  const [searchCaseId, setSearchCaseId] = useState("");`,
    "v36 marker"
  );

  // Remove the oversized summary / reviewed / current-view blocks so the page starts
  // with the case workspace, matching the approved mockup.
  const summaryStart = source.indexOf(
    `      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">`
  );
  const workspaceStart = source.indexOf(
    `      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(430px,0.85fr)]">`,
    Math.max(summaryStart, 0)
  );

  if (summaryStart >= 0 && workspaceStart > summaryStart) {
    source = source.slice(0, summaryStart) + source.slice(workspaceStart);
  }

  source = replaceOnce(
    source,
    `      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(430px,0.85fr)]">`,
    `      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.62fr)_minmax(440px,0.88fr)] xl:items-start">`,
    "two-column Appeal Cases workspace"
  );

  // Keep the right side as Appeal Case Detail. View only selects the appeal row;
  // Open Case Detail remains the separate action for the full Dashboard case record.
  source = source.replace(
    `                <PanelHeader\n                  title="Appeal Result"\n                  subtitle="สรุปผลอุทธรณ์ของเคสที่เลือก — รายละเอียดเคสจริงเปิดผ่าน Open Case Detail"\n                />`,
    `                <PanelHeader\n                  title="Appeal Case Detail"\n                  subtitle="Review the selected appeal result. Open Case Detail for the full case record."\n                />`
  );

  // Make the selected row visually obvious and keep the case table compact like Dashboard.
  source = source.replace(
    `              <div className="max-h-[720px] overflow-auto">`,
    `              <div className="max-h-[650px] overflow-auto">`
  );
  source = source.replace(
    `? "bg-sky-50 ring-1 ring-inset ring-sky-300"`,
    `? "bg-sky-50 ring-1 ring-inset ring-sky-400"`
  );

  fs.writeFileSync(appealPath, source, "utf8");
}

console.log("Patched Appeal Cases to match the approved two-column mockup: full case table on the left, selected Appeal Case Detail on the right, with Open Case Detail kept separate.");
