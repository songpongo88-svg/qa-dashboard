import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dashboardPath = path.resolve(__dirname, "../src/DashboardMockup.tsx");
const pdfPath = path.resolve(__dirname, "../src/caseDetailOfficialPdf.ts");
const marker = "bulk-case-detail-pdf-v1";

function patchOfficialPdf() {
  let source = fs.readFileSync(pdfPath, "utf8");
  if (source.includes(marker)) return;

  const replaceOnce = (before, after, label) => {
    if (!source.includes(before)) throw new Error(`Missing Case Detail PDF patch anchor: ${label}`);
    source = source.replace(before, after);
  };

  replaceOnce(
    `type GenerateOfficialCaseDetailPdfInput = {\n  caseItem: any;\n  currentUser?: any;\n  pdfVariant?: PdfVariant;\n};`,
    `// ${marker}\ntype GenerateOfficialCaseDetailPdfInput = {\n  caseItem: any;\n  currentUser?: any;\n  pdfVariant?: PdfVariant;\n  pdfDoc?: jsPDF;\n  appendPage?: boolean;\n  suppressOutput?: boolean;\n};`,
    "input type"
  );

  replaceOnce(
    `export async function generateOfficialCaseDetailPdf({\n  caseItem,\n  currentUser,\n  pdfVariant = "original",\n}: GenerateOfficialCaseDetailPdfInput): Promise<GeneratedOfficialPdf> {`,
    `export async function generateOfficialCaseDetailPdf({\n  caseItem,\n  currentUser,\n  pdfVariant = "original",\n  pdfDoc,\n  appendPage = false,\n  suppressOutput = false,\n}: GenerateOfficialCaseDetailPdfInput): Promise<GeneratedOfficialPdf> {`,
    "function input"
  );

  replaceOnce(
    `  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });\n  registerTHSarabunNew(doc as any);`,
    `  const doc = pdfDoc || new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });\n  if (pdfDoc && appendPage) doc.addPage();\n  registerTHSarabunNew(doc as any);`,
    "shared document"
  );

  replaceOnce(
    `    blob: doc.output("blob"),`,
    `    blob: suppressOutput ? new Blob([], { type: "application/pdf" }) : doc.output("blob"),`,
    "suppressed intermediate output"
  );

  fs.writeFileSync(pdfPath, source, "utf8");
}

function patchDashboard() {
  let source = fs.readFileSync(dashboardPath, "utf8");
  if (source.includes(marker)) return;

  const replaceOnce = (before, after, label) => {
    if (!source.includes(before)) throw new Error(`Missing Dashboard bulk PDF patch anchor: ${label}`);
    source = source.replace(before, after);
  };

  replaceOnce(
    `import { generateOfficialCaseDetailPdf } from "./caseDetailOfficialPdf";`,
    `import { generateOfficialCaseDetailPdf } from "./caseDetailOfficialPdf";\nimport { generateBulkCaseDetailPdf } from "./bulkCaseDetailPdf";`,
    "bulk PDF import"
  );

  replaceOnce(
    `  const [selectedCaseKey, setSelectedCaseKey] = useState<string>("");\n  const [caseIdSearch, setCaseIdSearch] = useState<string>("");`,
    `  const [selectedCaseKey, setSelectedCaseKey] = useState<string>("");\n  // ${marker}\n  const [bulkCasePdfBusy, setBulkCasePdfBusy] = useState(false);\n  const [bulkCasePdfProgress, setBulkCasePdfProgress] = useState("");\n  const [caseIdSearch, setCaseIdSearch] = useState<string>("");`,
    "bulk PDF state"
  );

  replaceOnce(
    `  const monthlyKpiResult = useMemo(\n    () => calculateMonthlyKpi(monthlyKpiCases.map((item) => item.finalScore)),\n    [monthlyKpiCases]\n  );\n  const qaCanBrowseMonthlyKpiAgents =`,
    `  const monthlyKpiResult = useMemo(\n    () => calculateMonthlyKpi(monthlyKpiCases.map((item) => item.finalScore)),\n    [monthlyKpiCases]\n  );\n\n  const qaCanGenerateAllCasePdf = isQualityAssuranceRole(currentUser?.role);\n  const allCasePdfCases = useMemo(() => {\n    if (!qaCanGenerateAllCasePdf || !isMonthlyView || selectedMonthKey === "all") return [];\n    return allCases.filter((item) =>\n      item.monthKey === selectedMonthKey &&\n      Boolean(String(item.caseId || "").trim()) &&\n      !isTestCaseEvaluation(item)\n    );\n  }, [allCases, isMonthlyView, qaCanGenerateAllCasePdf, selectedMonthKey]);\n\n  const handleGenerateAllCasePdf = async () => {\n    if (!qaCanGenerateAllCasePdf || bulkCasePdfBusy) return;\n    if (!isMonthlyView || selectedMonthKey === "all") {\n      alert("กรุณาเลือก Month ก่อน Gen All Case PDF");\n      return;\n    }\n    if (!allCasePdfCases.length) {\n      alert("ไม่พบ Case สำหรับเดือนที่เลือก");\n      return;\n    }\n\n    setBulkCasePdfBusy(true);\n    setBulkCasePdfProgress(\`0/${'${allCasePdfCases.length}'}\`);\n    try {\n      const result = await generateBulkCaseDetailPdf({\n        cases: allCasePdfCases,\n        currentUser,\n        monthKey: selectedMonthKey,\n        onProgress: (done, total) => setBulkCasePdfProgress(\`${'${done}'}/${'${total}'}\`),\n      });\n      downloadGeneratedPdfFile(result);\n      setBulkCasePdfProgress(\`${'${result.caseCount}'}/${'${result.caseCount}'}\`);\n    } catch (error) {\n      console.error("Gen All Case PDF failed:", error);\n      alert(error instanceof Error ? error.message : "Gen All Case PDF ไม่สำเร็จ");\n    } finally {\n      setBulkCasePdfBusy(false);\n    }\n  };\n\n  const qaCanBrowseMonthlyKpiAgents =`,
    "bulk PDF logic"
  );

  replaceOnce(
    `                            : "รายการเคสที่ตรงกับตัวกรองปัจจุบัน · เลือกเคสเพื่อดูรายละเอียด"}\n                        </p>\n                      </div>\n                      <div className="flex flex-wrap items-center gap-2">`,
    `                            : "รายการเคสที่ตรงกับตัวกรองปัจจุบัน · เลือกเคสเพื่อดูรายละเอียด"}\n                        </p>\n                      </div>\n                      <div className="flex flex-wrap items-center gap-2">\n                        {qaCanGenerateAllCasePdf && isMonthlyView && selectedMonthKey !== "all" ? (\n                          <button\n                            type="button"\n                            onClick={() => void handleGenerateAllCasePdf()}\n                            disabled={bulkCasePdfBusy || !allCasePdfCases.length}\n                            className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-700 px-3 py-2 text-[10px] font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"\n                            title="รวม Case Detail ทั้งเดือนเป็น PDF ไฟล์เดียว โดยใช้ Appeal ล่าสุดแทน Original เมื่อมีอุทธรณ์"\n                          >\n                            <span aria-hidden="true">▤</span>\n                            {bulkCasePdfBusy\n                              ? \`กำลัง Gen ${'${bulkCasePdfProgress}'}\`\n                              : \`Gen All Case PDF (${'${allCasePdfCases.length}'})\`}\n                          </button>\n                        ) : null}`,
    "case list button"
  );

  fs.writeFileSync(dashboardPath, source, "utf8");
}

patchOfficialPdf();
patchDashboard();
console.log("Patched QA monthly Gen All Case PDF with latest Appeal replacement.");
