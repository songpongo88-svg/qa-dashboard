import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.resolve(__dirname, "../src/App.tsx");
const roleAdminPath = path.resolve(__dirname, "../src/UserRoleAdminMockup.tsx");
const dashboardPath = path.resolve(__dirname, "../src/DashboardMockup.tsx");
const marker = "bulk-case-pdf-permission-v1";

function addPermissionKey(source, label) {
  if (!source.includes('  | "generateAllCasePdf"')) {
    if (!source.includes('  | "exportPdf"\n')) throw new Error(`Missing ${label} permission type anchor`);
    source = source.replace('  | "exportPdf"\n', '  | "exportPdf"\n  | "generateAllCasePdf"\n');
  }

  source = source.replace(
    /^(\s*)exportPdf: (true|false),$/gm,
    (match, indent) => `${match}\n${indent}generateAllCasePdf: false,`
  );
  return source;
}

function patchApp() {
  let source = fs.readFileSync(appPath, "utf8");
  if (source.includes(marker)) return;
  source = addPermissionKey(source, "App");

  if (!source.includes('  "generateAllCasePdf",')) {
    if (!source.includes('  "exportPdf",\n')) throw new Error("Missing App permission list anchor");
    source = source.replace('  "exportPdf",\n', '  "exportPdf",\n  "generateAllCasePdf",\n');
  }

  source = source.replace(
    'type RolePermissions = Record<RolePermissionKey, boolean>;',
    `// ${marker}\ntype RolePermissions = Record<RolePermissionKey, boolean>;`
  );
  fs.writeFileSync(appPath, source, "utf8");
}

function patchRoleAdmin() {
  let source = fs.readFileSync(roleAdminPath, "utf8");
  if (source.includes(marker)) return;
  source = addPermissionKey(source, "Role Admin");

  const definitionAnchor = '  { key: "exportPdf", label: "Export PDF", category: "Account", description: "Generate PDF reports where available." },';
  const definition = `${definitionAnchor}\n  { key: "generateAllCasePdf", label: "Gen All Case PDF", category: "Account", description: "Show the monthly bulk Case Detail PDF button. Quality Assurance can export the full month; other enabled roles can export only their own cases." },`;
  if (!source.includes('key: "generateAllCasePdf"')) {
    if (!source.includes(definitionAnchor)) throw new Error("Missing Role Admin permission definition anchor");
    source = source.replace(definitionAnchor, definition);
  }

  const helpAnchor = '  exportPdf: "อนุญาตให้สร้างหรือดาวน์โหลดรายงาน PDF ในหน้าที่รองรับ",';
  if (!source.includes('generateAllCasePdf: "')) {
    if (!source.includes(helpAnchor)) throw new Error("Missing Role Admin Thai help anchor");
    source = source.replace(
      helpAnchor,
      `${helpAnchor}\n  generateAllCasePdf: "อนุญาตให้เห็นปุ่ม Gen All Case PDF รายเดือน โดย Quality Assurance ดึงได้ทุกเคส ส่วน Role อื่นที่เปิดสิทธิ์จะดึงได้เฉพาะเคสของตนเอง",`
    );
  }

  source = source.replace(
    'type RolePermissions = Record<RolePermissionKey, boolean>;',
    `// ${marker}\ntype RolePermissions = Record<RolePermissionKey, boolean>;`
  );
  fs.writeFileSync(roleAdminPath, source, "utf8");
}

function patchDashboard() {
  let source = fs.readFileSync(dashboardPath, "utf8");
  if (source.includes(marker)) return;
  if (!source.includes("bulk-case-detail-pdf-v1")) {
    throw new Error("Bulk Case PDF patch must run before permission patch");
  }

  const importAnchor = 'import MonthlyKpiNotice from "./MonthlyKpiNotice";';
  if (!source.includes('fetchStoredRolePermissions')) {
    if (!source.includes(importAnchor)) throw new Error("Missing Dashboard import anchor");
    source = source.replace(
      importAnchor,
      `${importAnchor}\nimport { fetchStoredRolePermissions } from "./userRoleStore";`
    );
  }

  const stateAnchor = '  const [bulkCasePdfProgress, setBulkCasePdfProgress] = useState("");';
  if (!source.includes(stateAnchor)) throw new Error("Missing bulk PDF state anchor");
  source = source.replace(
    stateAnchor,
    `${stateAnchor}\n  // ${marker}\n  const [bulkCasePdfPermissionEnabled, setBulkCasePdfPermissionEnabled] = useState(() =>\n    isQualityAssuranceRole(currentUser?.role)\n  );\n\n  useEffect(() => {\n    let active = true;\n    const fallback = isQualityAssuranceRole(currentUser?.role);\n    setBulkCasePdfPermissionEnabled(fallback);\n    const roleKey = String(currentUser?.role || "")\n      .trim()\n      .toLowerCase()\n      .replace(/[-_]+/g, " ")\n      .replace(/\\s+/g, " ");\n\n    void fetchStoredRolePermissions()\n      .then((rows) => {\n        if (!active) return;\n        const matched = rows.find((row) =>\n          String(row.roleName || "")\n            .trim()\n            .toLowerCase()\n            .replace(/[-_]+/g, " ")\n            .replace(/\\s+/g, " ") === roleKey\n        );\n        const storedValue = matched?.permissions?.generateAllCasePdf;\n        setBulkCasePdfPermissionEnabled(\n          typeof storedValue === "boolean" ? storedValue : fallback\n        );\n      })\n      .catch(() => {\n        if (active) setBulkCasePdfPermissionEnabled(fallback);\n      });\n\n    return () => {\n      active = false;\n    };\n  }, [currentUser?.role]);`
  );

  const oldLogic = `  const qaCanGenerateAllCasePdf = isQualityAssuranceRole(currentUser?.role);\n  const allCasePdfCases = useMemo(() => {\n    if (!qaCanGenerateAllCasePdf || !isMonthlyView || selectedMonthKey === "all") return [];\n    return allCases.filter((item) =>\n      item.monthKey === selectedMonthKey &&\n      Boolean(String(item.caseId || "").trim()) &&\n      !isTestCaseEvaluation(item)\n    );\n  }, [allCases, isMonthlyView, qaCanGenerateAllCasePdf, selectedMonthKey]);`;

  const newLogic = `  const qaCanGenerateAllCasePdf = bulkCasePdfPermissionEnabled;\n  const allCasePdfCases = useMemo(() => {\n    if (!qaCanGenerateAllCasePdf || !isMonthlyView || selectedMonthKey === "all") return [];\n    const monthlyCases = allCases.filter((item) =>\n      item.monthKey === selectedMonthKey &&\n      Boolean(String(item.caseId || "").trim()) &&\n      !isTestCaseEvaluation(item)\n    );\n    if (isQualityAssuranceRole(currentUser?.role)) return monthlyCases;\n\n    const selfAgent = String(currentUser?.agentName || currentUser?.displayName || "").trim();\n    if (!selfAgent) return [];\n    return monthlyCases.filter((item) => isSameAgent(item.agent, selfAgent));\n  }, [\n    allCases,\n    currentUser?.agentName,\n    currentUser?.displayName,\n    currentUser?.role,\n    isMonthlyView,\n    qaCanGenerateAllCasePdf,\n    selectedMonthKey,\n  ]);`;

  if (!source.includes(oldLogic)) throw new Error("Missing bulk PDF role-scope logic anchor");
  source = source.replace(oldLogic, newLogic);

  const oldTitle = 'title="รวม Case Detail ทั้งเดือนเป็น PDF ไฟล์เดียว โดยใช้ Appeal ล่าสุดแทน Original เมื่อมีอุทธรณ์"';
  if (source.includes(oldTitle)) {
    source = source.replace(
      oldTitle,
      'title={isQualityAssuranceRole(currentUser?.role) ? "รวม Case Detail ทั้งเดือนเป็น PDF ไฟล์เดียว โดยใช้ Appeal ล่าสุดแทน Original เมื่อมีอุทธรณ์" : "รวม Case Detail ของฉันในเดือนที่เลือกเป็น PDF ไฟล์เดียว"}'
    );
  }

  fs.writeFileSync(dashboardPath, source, "utf8");
}

patchApp();
patchRoleAdmin();
patchDashboard();
console.log("Patched Gen All Case PDF permission and self-only non-QA scope.");
