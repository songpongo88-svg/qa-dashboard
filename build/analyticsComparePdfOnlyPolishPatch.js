function replaceOrThrow(context, code, search, replacement, label) {
  if (!code.includes(search)) {
    context.error(`Analytics PDF-only polish patch could not find ${label}.`);
  }
  return code.replace(search, replacement);
}

export function analyticsComparePdfOnlyPolishPatch() {
  let patched = false;

  return {
    name: "analytics-compare-pdf-only-polish",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      if (!cleanId.endsWith("/src/SummaryMockup.tsx")) return null;
      if (!code.includes("data-analytics-compare-single-period-pdf-parity-v29")) {
        this.error("Analytics single-period PDF parity patch must run before PDF-only polish patch.");
      }

      let next = code;

      // Add an invisible selector only. This does not change the web layout.
      next = replaceOrThrow(
        this,
        next,
        `            <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.3fr)_minmax(0,1fr)]">`,
        `            <div data-compare-report-meta-pdf-v31="true" className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.3fr)_minmax(0,1fr)]">`,
        "report metadata selector"
      );

      // Style only html2canvas's cloned document. Nothing below mutates the visible web page.
      next = replaceOrThrow(
        this,
        next,
        `      scrollX: 0,\n      scrollY: -window.scrollY,\n    });`,
        `      scrollX: 0,\n      scrollY: -window.scrollY,\n      removeContainer: true,\n      onclone: (clonedDocument) => {\n        const clonedReport = clonedDocument.querySelector(\n          '[data-analytics-compare-ppt-report-v1="true"]'\n        ) as HTMLElement | null;\n        if (!clonedReport) return;\n\n        const metaGrid = clonedReport.querySelector(\n          '[data-compare-report-meta-pdf-v31="true"]'\n        ) as HTMLElement | null;\n        if (metaGrid) {\n          metaGrid.style.gridTemplateColumns = "0.82fr 1.35fr 1fr";\n          metaGrid.style.gap = "12px";\n          Array.from(metaGrid.children).forEach((node, index) => {\n            const card = node as HTMLElement;\n            card.style.minHeight = "62px";\n            card.style.padding = "11px 14px";\n            card.style.border = index === 1 ? "1px solid #c4b5fd" : "1px solid #ddd6fe";\n            card.style.borderRadius = "12px";\n            card.style.background = index === 1 ? "#f5f3ff" : "#faf9ff";\n            card.style.boxShadow = "none";\n            const parts = Array.from(card.children) as HTMLElement[];\n            if (parts[0]) {\n              parts[0].style.fontSize = "9px";\n              parts[0].style.letterSpacing = "0.08em";\n            }\n            if (parts[1]) {\n              parts[1].style.marginTop = "7px";\n              parts[1].style.textAlign = "center";\n              parts[1].style.fontSize = index === 1 ? "13px" : "12px";\n              parts[1].style.lineHeight = "1.25";\n            }\n          });\n        }\n\n        const kpiGrid = clonedReport.querySelector(\n          '[data-compare-kpis="true"]'\n        ) as HTMLElement | null;\n        if (kpiGrid) {\n          Array.from(kpiGrid.children).forEach((node) => {\n            const card = node as HTMLElement;\n            card.style.minHeight = "112px";\n            card.style.padding = "12px 14px";\n            card.style.borderRadius = "12px";\n            card.style.boxShadow = "none";\n            const parts = Array.from(card.children) as HTMLElement[];\n            const header = parts[0];\n            const value = parts[1];\n            const helper = parts[2];\n            if (header) {\n              header.style.justifyContent = "center";\n              header.style.minHeight = "32px";\n              header.style.textAlign = "center";\n            }\n            if (value) {\n              value.style.display = "flex";\n              value.style.alignItems = "center";\n              value.style.justifyContent = "center";\n              value.style.flex = "1 1 auto";\n              value.style.margin = "4px 0";\n              value.style.padding = "5px 0";\n              value.style.textAlign = "center";\n              value.style.fontSize = "29px";\n              value.style.lineHeight = "1";\n            }\n            if (helper) {\n              helper.style.width = "100%";\n              helper.style.padding = "5px 8px";\n              helper.style.textAlign = "center";\n            }\n          });\n\n          const cards = Array.from(kpiGrid.children) as HTMLElement[];\n          const incentiveCard = cards.find((card) =>\n            String(card.textContent || "").toUpperCase().includes("TOTAL INCENTIVE")\n          );\n          if (incentiveCard) {\n            const value = incentiveCard.children[1] as HTMLElement | undefined;\n            if (value) {\n              const digits = String(value.textContent || "").replace(/[^0-9-]/g, "");\n              if (digits && Number.isFinite(Number(digits))) {\n                value.textContent = Number(digits).toLocaleString("en-US");\n              }\n            }\n          }\n        }\n      },\n    });`,
        "PDF clone-only visual polish"
      );

      // Surface a useful message instead of silently failing if browser PDF capture errors.
      next = replaceOrThrow(
        this,
        next,
        `    if (isComparisonMode) {\n      await generateComparisonViewPdfV29();\n      setAnalyticsExportOpen(false);\n      return;\n    }`,
        `    if (isComparisonMode) {\n      try {\n        await generateComparisonViewPdfV29();\n        setAnalyticsExportOpen(false);\n      } catch (error) {\n        console.error("Comparison PDF export failed", error);\n        window.alert("ไม่สามารถสร้าง Comparison PDF ได้ กรุณาลองใหม่อีกครั้ง");\n      }\n      return;\n    }`,
        "Comparison PDF error handling"
      );

      patched = true;
      return { code: next, map: null };
    },

    buildEnd(error) {
      if (error) return;
      if (!patched) this.error("Analytics PDF-only polish patch was not applied.");
    },
  };
}
