import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dashboardPath = path.resolve(__dirname, "../src/DashboardMockup.tsx");
const roleAdminPath = path.resolve(__dirname, "../src/UserRoleAdminMockup.tsx");
const marker = "bulk-case-pdf-role-scopes-v2";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing ${label} anchor`);
  return source.replace(before, after);
}

function patchDashboard() {
  let source = fs.readFileSync(dashboardPath, "utf8");
  if (source.includes(marker)) return;
  if (!source.includes("bulk-case-pdf-permission-v1")) {
    throw new Error("Bulk Case PDF permission patch must run before role scopes v2");
  }

  source = replaceOnce(
    source,
    '  const [bulkCasePdfProgress, setBulkCasePdfProgress] = useState("");\n  // bulk-case-pdf-permission-v1',
    `  const [bulkCasePdfProgress, setBulkCasePdfProgress] = useState("");\n  // ${marker}\n  const [bulkCasePdfMode, setBulkCasePdfMode] = useState<"all" | "my" | "">("");\n  // bulk-case-pdf-permission-v1`,
    "bulk PDF mode state"
  );

  const oldLogic = `  const qaCanGenerateAllCasePdf = bulkCasePdfPermissionEnabled;\n  const allCasePdfCases = useMemo(() => {\n    if (!qaCanGenerateAllCasePdf || !isMonthlyView || selectedMonthKey === "all") return [];\n    const monthlyCases = allCases.filter((item) =>\n      item.monthKey === selectedMonthKey &&\n      Boolean(String(item.caseId || "").trim()) &&\n      !isTestCaseEvaluation(item)\n    );\n    if (isQualityAssuranceRole(currentUser?.role)) return monthlyCases;\n\n    const selfAgent = String(currentUser?.agentName || currentUser?.displayName || "").trim();\n    if (!selfAgent) return [];\n    return monthlyCases.filter((item) => isSameAgent(item.agent, selfAgent));\n  }, [\n    allCases,\n    currentUser?.agentName,\n    currentUser?.displayName,\n    currentUser?.role,\n    isMonthlyView,\n    qaCanGenerateAllCasePdf,\n    selectedMonthKey,\n  ]);`;

  const newLogic = `  const qaCanGenerateAllCasePdf = bulkCasePdfPermissionEnabled;\n  const normalizedBulkCasePdfRole = String(currentUser?.role || "")\n    .trim()\n    .toLowerCase()\n    .replace(/[-_]+/g, " ")\n    .replace(/\\s+/g, " ");\n  const isSeniorBulkCasePdfRole = normalizedBulkCasePdfRole === "senior";\n\n  const allCasePdfCases = useMemo(() => {\n    if (!qaCanGenerateAllCasePdf || !isMonthlyView || selectedMonthKey === "all") return [];\n    return allCases.filter((item) =>\n      item.monthKey === selectedMonthKey &&\n      Boolean(String(item.caseId || "").trim()) &&\n      !isTestCaseEvaluation(item)\n    );\n  }, [allCases, isMonthlyView, qaCanGenerateAllCasePdf, selectedMonthKey]);\n\n  const myCasePdfCases = useMemo(() => {\n    if (!qaCanGenerateAllCasePdf || !isSeniorBulkCasePdfRole || !isMonthlyView || selectedMonthKey === "all") return [];\n    const currentUsername = String(currentUser?.username || "").trim().toLowerCase();\n    const selfAgent = String(currentUser?.agentName || currentUser?.displayName || "").trim();\n    return allCasePdfCases.filter((item) => {\n      const targetUsername = String(item.targetUsername || "").trim().toLowerCase();\n      if (currentUsername && targetUsername) return currentUsername === targetUsername;\n      return Boolean(selfAgent) && isSameAgent(item.agent, selfAgent);\n    });\n  }, [\n    allCasePdfCases,\n    currentUser?.agentName,\n    currentUser?.displayName,\n    currentUser?.username,\n    isMonthlyView,\n    isSeniorBulkCasePdfRole,\n    qaCanGenerateAllCasePdf,\n    selectedMonthKey,\n  ]);`;

  source = replaceOnce(source, oldLogic, newLogic, "bulk PDF role scope logic");

  const oldHandler = `  const handleGenerateAllCasePdf = async () => {\n    if (!qaCanGenerateAllCasePdf || bulkCasePdfBusy) return;\n    if (!isMonthlyView || selectedMonthKey === "all") {\n      alert("กรุณาเลือก Month ก่อน Gen All Case PDF");\n      return;\n    }\n    if (!allCasePdfCases.length) {\n      alert("ไม่พบ Case สำหรับเดือนที่เลือก");\n      return;\n    }\n\n    setBulkCasePdfBusy(true);\n    setBulkCasePdfProgress(\`0/\${allCasePdfCases.length}\`);\n    try {\n      const result = await generateBulkCaseDetailPdf({\n        cases: allCasePdfCases,\n        currentUser,\n        monthKey: selectedMonthKey,\n        onProgress: (done, total) => setBulkCasePdfProgress(\`\${done}/\${total}\`),\n      });\n      downloadGeneratedPdfFile(result);\n      setBulkCasePdfProgress(\`\${result.caseCount}/\${result.caseCount}\`);\n    } catch (error) {\n      console.error("Gen All Case PDF failed:", error);\n      alert(error instanceof Error ? error.message : "Gen All Case PDF ไม่สำเร็จ");\n    } finally {\n      setBulkCasePdfBusy(false);\n    }\n  };`;

  const newHandler = `  const handleGenerateCasePdf = async (mode: "all" | "my") => {\n    if (!qaCanGenerateAllCasePdf || bulkCasePdfBusy) return;\n    if (!isMonthlyView || selectedMonthKey === "all") {\n      alert("กรุณาเลือก Month ก่อน Gen PDF");\n      return;\n    }\n    if (mode === "my" && !isSeniorBulkCasePdfRole) return;\n\n    const targetCases = mode === "my" ? myCasePdfCases : allCasePdfCases;\n    if (!targetCases.length) {\n      alert(mode === "my" ? "ไม่พบ Case ของคุณสำหรับเดือนที่เลือก" : "ไม่พบ Case สำหรับเดือนที่เลือก");\n      return;\n    }\n\n    setBulkCasePdfMode(mode);\n    setBulkCasePdfBusy(true);\n    setBulkCasePdfProgress(\`0/\${targetCases.length}\`);\n    try {\n      const result = await generateBulkCaseDetailPdf({\n        cases: targetCases,\n        currentUser,\n        monthKey: selectedMonthKey,\n        onProgress: (done, total) => setBulkCasePdfProgress(\`\${done}/\${total}\`),\n      });\n      downloadGeneratedPdfFile(\n        mode === "my"\n          ? { ...result, fileName: result.fileName.replace(/_All_Cases\\.pdf$/i, "_My_Cases.pdf") }\n          : result\n      );\n      setBulkCasePdfProgress(\`\${result.caseCount}/\${result.caseCount}\`);\n    } catch (error) {\n      console.error(mode === "my" ? "Gen My Case PDF failed:" : "Gen All Case PDF failed:", error);\n      alert(error instanceof Error ? error.message : mode === "my" ? "Gen My Case PDF ไม่สำเร็จ" : "Gen All Case PDF ไม่สำเร็จ");\n    } finally {\n      setBulkCasePdfBusy(false);\n      setBulkCasePdfMode("");\n    }\n  };\n\n  const handleGenerateAllCasePdf = async () => handleGenerateCasePdf("all");\n  const handleGenerateMyCasePdf = async () => handleGenerateCasePdf("my");`;

  source = replaceOnce(source, oldHandler, newHandler, "bulk PDF handler");

  const oldButton = `                        {qaCanGenerateAllCasePdf && isMonthlyView && selectedMonthKey !== "all" ? (\n                          <button\n                            type="button"\n                            onClick={() => void handleGenerateAllCasePdf()}\n                            disabled={bulkCasePdfBusy || !allCasePdfCases.length}\n                            className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-700 px-3 py-2 text-[10px] font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"\n                            title={isQualityAssuranceRole(currentUser?.role) ? "รวม Case Detail ทั้งเดือนเป็น PDF ไฟล์เดียว โดยใช้ Appeal ล่าสุดแทน Original เมื่อมีอุทธรณ์" : "รวม Case Detail ของฉันในเดือนที่เลือกเป็น PDF ไฟล์เดียว"}\n                          >\n                            <span aria-hidden="true">▤</span>\n                            {bulkCasePdfBusy\n                              ? \`กำลัง Gen \${bulkCasePdfProgress}\`\n                              : \`Gen All Case PDF (\${allCasePdfCases.length})\`}\n                          </button>\n                        ) : null}`;

  const newButton = `                        {qaCanGenerateAllCasePdf && isMonthlyView && selectedMonthKey !== "all" ? (\n                          <>\n                            <button\n                              type="button"\n                              onClick={() => void handleGenerateAllCasePdf()}\n                              disabled={bulkCasePdfBusy || !allCasePdfCases.length}\n                              className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-700 px-3 py-2 text-[10px] font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"\n                              title="รวม Case Detail ทุกเคสของเดือนที่เลือกเป็น PDF ไฟล์เดียว โดยใช้ Appeal ล่าสุดแทน Original เมื่อมีอุทธรณ์"\n                            >\n                              <span aria-hidden="true">▤</span>\n                              {bulkCasePdfBusy && bulkCasePdfMode === "all"\n                                ? \`กำลัง Gen \${bulkCasePdfProgress}\`\n                                : \`Gen All Case PDF (\${allCasePdfCases.length})\`}\n                            </button>\n                            {isSeniorBulkCasePdfRole ? (\n                              <button\n                                type="button"\n                                onClick={() => void handleGenerateMyCasePdf()}\n                                disabled={bulkCasePdfBusy || !myCasePdfCases.length}\n                                className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-3 py-2 text-[10px] font-black text-violet-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"\n                                title="รวมเฉพาะ Case Detail ของฉันในเดือนที่เลือกเป็น PDF ไฟล์เดียว"\n                              >\n                                <span aria-hidden="true">▤</span>\n                                {bulkCasePdfBusy && bulkCasePdfMode === "my"\n                                  ? \`กำลัง Gen \${bulkCasePdfProgress}\`\n                                  : \`Gen My Case PDF (\${myCasePdfCases.length})\`}\n                              </button>\n                            ) : null}\n                          </>\n                        ) : null}`;

  source = replaceOnce(source, oldButton, newButton, "bulk PDF buttons");
  fs.writeFileSync(dashboardPath, source, "utf8");
}

function patchRoleAdmin() {
  let source = fs.readFileSync(roleAdminPath, "utf8");
  if (source.includes(marker)) return;
  if (!source.includes("bulk-case-pdf-permission-v1")) {
    throw new Error("Bulk Case PDF permission patch must run before Role Admin role scopes v2");
  }

  source = replaceOnce(
    source,
    'description: "Show the monthly bulk Case Detail PDF button. Quality Assurance can export the full month; other enabled roles can export only their own cases."',
    'description: "Show monthly bulk Case Detail PDF. Quality Assurance and enabled roles can export all cases; Senior also gets a separate My Case export. Team-only export is not provided."',
    "permission description"
  );
  source = replaceOnce(
    source,
    'generateAllCasePdf: "อนุญาตให้เห็นปุ่ม Gen All Case PDF รายเดือน โดย Quality Assurance ดึงได้ทุกเคส ส่วน Role อื่นที่เปิดสิทธิ์จะดึงได้เฉพาะเคสของตนเอง",',
    `// ${marker}\n  generateAllCasePdf: "อนุญาตให้ใช้ Gen All Case PDF รายเดือน โดย Role ที่เปิดสิทธิ์ดึงได้ทุกเคสของเดือน และ Senior จะมี Gen My Case PDF เพิ่มสำหรับเคสของตนเอง โดยไม่มีโหมด Gen ตามทีม",`,
    "permission Thai help"
  );
  fs.writeFileSync(roleAdminPath, source, "utf8");
}

patchDashboard();
patchRoleAdmin();
console.log("Patched bulk PDF scopes: Senior All + My, enabled other roles All only.");
