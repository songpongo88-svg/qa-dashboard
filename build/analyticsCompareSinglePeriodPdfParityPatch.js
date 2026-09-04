function replaceOrThrow(context, code, search, replacement, label) {
  if (!code.includes(search)) {
    context.error(`Analytics single-period/PDF parity patch could not find ${label}.`);
  }
  return code.replace(search, replacement);
}

export function analyticsCompareSinglePeriodPdfParityPatch() {
  let patched = false;

  return {
    name: "analytics-compare-single-period-pdf-parity",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      if (!cleanId.endsWith("/src/SummaryMockup.tsx")) return null;
      if (!code.includes('data-analytics-compare-ppt-report-v1="true"')) {
        this.error("Analytics compare UI redesign must run before single-period/PDF parity patch.");
      }
      if (!code.includes("data-analytics-compare-inline-differences-v27")) {
        this.error("Analytics inline differences patch must run before single-period/PDF parity patch.");
      }

      let next = code;

      // html2canvas is already installed through jsPDF optional dependencies.
      if (!next.includes('import html2canvas from "html2canvas";')) {
        next = replaceOrThrow(
          this,
          next,
          'import { jsPDF } from "jspdf";',
          'import { jsPDF } from "jspdf";\nimport html2canvas from "html2canvas";',
          "html2canvas import"
        );
      }

      next = replaceOrThrow(
        this,
        next,
        `  const [analyticsCompareOpen, setAnalyticsCompareOpen] = useState(false);\n  const [compareDraftPeriods, setCompareDraftPeriods] = useState<string[]>([]);`,
        `  const [analyticsCompareOpen, setAnalyticsCompareOpen] = useState(false);\n  // data-analytics-compare-single-period-pdf-parity-v29\n  const [analyticsCompareViewActiveV29, setAnalyticsCompareViewActiveV29] = useState(false);\n  const [compareDraftPeriods, setCompareDraftPeriods] = useState<string[]>([]);`,
        "compare active state"
      );

      next = replaceOrThrow(
        this,
        next,
        `  const isComparisonMode = comparisonRows.length >= 2;`,
        `  const isComparisonMode =\n    comparisonRows.length >= 1 &&\n    (analyticsCompareViewActiveV29 || selectedPeriods.length >= 2);`,
        "comparison mode condition"
      );

      if (!next.includes("disabled={compareDraftPeriods.length < 2}")) {
        this.error("Analytics Compare Apply minimum-period anchor was not found.");
      }
      next = next.replaceAll(
        "disabled={compareDraftPeriods.length < 2}",
        "disabled={compareDraftPeriods.length < 1}"
      );

      next = replaceOrThrow(
        this,
        next,
        `                          const nextPeriods = sortCompareDraftPeriodKeys(compareDraftPeriods);`,
        `                          const nextPeriods = sortCompareDraftPeriodKeys(compareDraftPeriods);\n                          setAnalyticsCompareViewActiveV29(true);`,
        "Compare Apply activation"
      );

      if (!next.includes("const lastPeriod = effectivePeriodKeys[effectivePeriodKeys.length - 1];")) {
        this.error("Exit Compare anchor was not found.");
      }
      next = next.replaceAll(
        "const lastPeriod = effectivePeriodKeys[effectivePeriodKeys.length - 1];",
        "const lastPeriod = effectivePeriodKeys[effectivePeriodKeys.length - 1];\n                      setAnalyticsCompareViewActiveV29(false);"
      );

      next = replaceOrThrow(
        this,
        next,
        `  if (!Array.isArray(periodReports) || periodReports.length < 2) return null;`,
        `  if (!Array.isArray(periodReports) || periodReports.length < 1) return null;`,
        "compare dashboard one-period guard"
      );

      next = replaceOrThrow(
        this,
        next,
        `  const overallDelta = Number((lastScore - firstScore).toFixed(2));\n  const comparisonUnit = reportModeName === "Weekly" ? "Week" : reportModeName === "Monthly" ? "Month" : "Year";\n  const comparisonTitle = comparisonUnit + "-over-" + comparisonUnit;`,
        `  const overallDelta = periodReports.length > 1\n    ? Number((lastScore - firstScore).toFixed(2))\n    : null;\n  const comparisonUnit = reportModeName === "Weekly" ? "Week" : reportModeName === "Monthly" ? "Month" : "Year";\n  const comparisonTitle = periodReports.length > 1\n    ? comparisonUnit + "-over-" + comparisonUnit\n    : "Selected " + comparisonUnit;`,
        "single-period compare title and delta"
      );

      const pdfHelper = String.raw`
  async function generateComparisonViewPdfV29() {
    const reportElement = document.querySelector(
      '[data-analytics-compare-ppt-report-v1="true"]'
    ) as HTMLElement | null;
    if (!reportElement) {
      throw new Error("ไม่พบ Comparison Report บนหน้าจอ กรุณาเปิด Comparison ก่อน Export PDF");
    }

    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    const captureWidth = Math.max(reportElement.scrollWidth, reportElement.offsetWidth, 1100);
    const captureHeight = Math.max(reportElement.scrollHeight, reportElement.offsetHeight);
    const canvas = await html2canvas(reportElement, {
      backgroundColor: "#ffffff",
      scale: 1.5,
      useCORS: true,
      allowTaint: false,
      logging: false,
      width: captureWidth,
      height: captureHeight,
      windowWidth: Math.max(window.innerWidth, captureWidth + 40),
      windowHeight: Math.max(window.innerHeight, captureHeight),
      scrollX: 0,
      scrollY: -window.scrollY,
    });

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 6;
    const targetWidth = pageWidth - margin * 2;
    const targetHeight = pageHeight - margin * 2;
    const pixelsPerPage = Math.max(1, Math.floor((targetHeight / targetWidth) * canvas.width));
    let sourceY = 0;
    let pageIndex = 0;

    while (sourceY < canvas.height) {
      const sliceHeight = Math.min(pixelsPerPage, canvas.height - sourceY);
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;
      const context = pageCanvas.getContext("2d");
      if (!context) throw new Error("ไม่สามารถสร้าง Comparison PDF canvas ได้");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      context.drawImage(
        canvas,
        0,
        sourceY,
        canvas.width,
        sliceHeight,
        0,
        0,
        canvas.width,
        sliceHeight
      );

      if (pageIndex > 0) doc.addPage("a4", "landscape");
      const displayedHeight = (sliceHeight / canvas.width) * targetWidth;
      doc.addImage(
        pageCanvas.toDataURL("image/jpeg", 0.94),
        "JPEG",
        margin,
        margin,
        targetWidth,
        displayedHeight,
        undefined,
        "FAST"
      );
      sourceY += sliceHeight;
      pageIndex += 1;
    }

    const safePeriods = effectivePeriodLabels
      .join("_")
      .replace(/[^a-zA-Z0-9ก-๙_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 90) || "Selected_Period";
    doc.save(`QA_${reportModeName}_Comparison_${safePeriods}.pdf`);
  }

`;

      next = replaceOrThrow(
        this,
        next,
        `  async function generateSummaryReportPdf() {\n    await ensureSarabunPdfFont();`,
        `${pdfHelper}  async function generateSummaryReportPdf() {\n    if (isComparisonMode) {\n      await generateComparisonViewPdfV29();\n      setAnalyticsExportOpen(false);\n      return;\n    }\n    await ensureSarabunPdfFont();`,
        "Comparison PDF export branch"
      );

      patched = true;
      return { code: next, map: null };
    },

    buildEnd(error) {
      if (error) return;
      if (!patched) this.error("Analytics single-period/PDF parity patch was not applied.");
    },
  };
}
