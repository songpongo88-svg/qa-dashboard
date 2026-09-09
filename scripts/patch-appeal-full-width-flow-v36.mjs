import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appealPath = path.join(root, "src", "AppealMockup.tsx");
const marker = "appeal-full-width-flow-v36";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Appeal full width v36 anchor not found: ${label}`);
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

  source = replaceOnce(
    source,
    `      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(430px,0.85fr)]">`,
    `      <div className="space-y-6">`,
    "stack Appeal Cases and selected Appeal Information"
  );

  source = replaceOnce(
    source,
    `                <PanelHeader\n                  title="Appeal Case Detail"\n                  subtitle="สรุปผลอุทธรณ์ล่าสุด — กด Open Case Detail เพื่อดูรายละเอียดเคสแบบเดียวกับ Cases in Current View"\n                />`,
    `                <PanelHeader\n                  title="Appeal Result"\n                  subtitle="สรุปผลอุทธรณ์ของเคสที่เลือก — รายละเอียดเคสจริงเปิดผ่าน Open Case Detail"\n                />`,
    "rename Appeal result panel"
  );

  fs.writeFileSync(appealPath, source, "utf8");
}

console.log("Patched Appeal Cases to use a full-width list first, then full-width Appeal Information below; Case Detail remains a separate Open Case Detail action.");
