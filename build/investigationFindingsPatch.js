function replaceRequired(context, code, search, replacement, label) {
  if (!code.includes(search)) {
    context.error(`Investigation Findings patch could not find ${label}.`);
  }
  return code.replace(search, replacement);
}

function replaceAllRequired(context, code, search, replacement, label) {
  if (!code.includes(search)) {
    context.error(`Investigation Findings patch could not find ${label}.`);
  }
  return code.split(search).join(replacement);
}

export function investigationFindingsPatch() {
  let createEvaluationPatched = false;
  let dashboardPatched = false;
  let pdfPatched = false;

  return {
    name: "investigation-findings-v1",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];

      if (cleanId.endsWith("/src/CreateEvaluationMockup.tsx")) {
        let next = code;

        next = replaceAllRequired(
          this,
          next,
          "  caseDescription: string;\n  processReference",
          "  caseDescription: string;\n  investigationFindings: string;\n  processReference",
          "CreateEvaluation investigation type fields"
        );

        next = replaceRequired(
          this,
          next,
          '  const [caseDescription, setCaseDescription] = useState(() => readEvaluateTabMemory()?.caseDescription || "");\n  const [processReference, setProcessReference] = useState(() => readEvaluateTabMemory()?.processReference || "");',
          '  const [caseDescription, setCaseDescription] = useState(() => readEvaluateTabMemory()?.caseDescription || "");\n  // data-investigation-findings-v1\n  const [investigationFindings, setInvestigationFindings] = useState(() => readEvaluateTabMemory()?.investigationFindings || "");\n  const [processReference, setProcessReference] = useState(() => readEvaluateTabMemory()?.processReference || "");',
          "CreateEvaluation investigation state"
        );

        next = replaceAllRequired(
          this,
          next,
          "      caseDescription,\n      processReference,",
          "      caseDescription,\n      investigationFindings,\n      processReference,",
          "CreateEvaluation memory and draft payloads"
        );

        next = replaceAllRequired(
          this,
          next,
          '    setCaseDescription(normalizedDraft.caseDescription || "");\n    setProcessReference(normalizedDraft.processReference || "");',
          '    setCaseDescription(normalizedDraft.caseDescription || "");\n    setInvestigationFindings(normalizedDraft.investigationFindings || "");\n    setProcessReference(normalizedDraft.processReference || "");',
          "CreateEvaluation draft restore"
        );

        next = replaceAllRequired(
          this,
          next,
          '    setCaseDescription("");\n    setProcessReference("");',
          '    setCaseDescription("");\n    setInvestigationFindings("");\n    setProcessReference("");',
          "CreateEvaluation reset"
        );

        next = replaceAllRequired(
          this,
          next,
          '                        setCaseDescription("");\n                        setProcessReference("");',
          '                        setCaseDescription("");\n                        setInvestigationFindings("");\n                        setProcessReference("");',
          "CreateEvaluation no-case reset"
        );

        next = replaceAllRequired(
          this,
          next,
          '    setCaseDescription(record.caseDescription || "");\n    setProcessReference(record.processReference || "");',
          '    setCaseDescription(record.caseDescription || "");\n    setInvestigationFindings(record.investigationFindings || String(record.rawDataPreview?.["Investigation Findings"] || ""));\n    setProcessReference(record.processReference || "");',
          "CreateEvaluation submitted record edit restore"
        );

        next = replaceRequired(
          this,
          next,
          '      "Case Description": noCaseForMonth ? "Monthly zero-case result" : richTextToPlainText(caseDescription) || "-",\n      "Process Reference": noCaseForMonth ? "-" : richTextToPlainText(processReference) || "-",',
          '      "Case Description": noCaseForMonth ? "Monthly zero-case result" : richTextToPlainText(caseDescription) || "-",\n      "Investigation Findings": noCaseForMonth ? "-" : richTextToPlainText(investigationFindings) || "-",\n      "Process Reference": noCaseForMonth ? "-" : richTextToPlainText(processReference) || "-",',
          "CreateEvaluation RawData preview"
        );

        next = replaceAllRequired(
          this,
          next,
          '      caseDescription: noCaseForMonth ? "Monthly zero-case result" : caseDescription,\n      processReference: noCaseForMonth ? "" : processReference,',
          '      caseDescription: noCaseForMonth ? "Monthly zero-case result" : caseDescription,\n      investigationFindings: noCaseForMonth ? "" : investigationFindings,\n      processReference: noCaseForMonth ? "" : processReference,',
          "CreateEvaluation submit record"
        );

        next = replaceAllRequired(
          this,
          next,
          '        "Case Description": richTextToPlainText(record.caseDescription),\n        "Process Reference": richTextToPlainText(record.processReference),',
          '        "Case Description": richTextToPlainText(record.caseDescription),\n        "Investigation Findings": richTextToPlainText(record.investigationFindings) || "-",\n        "Process Reference": richTextToPlainText(record.processReference),',
          "CreateEvaluation export row"
        );

        next = replaceRequired(
          this,
          next,
          '      evaluationKey: item.evaluationKey,\n      pdfButtonLabel:',
          '      evaluationKey: item.evaluationKey,\n      investigationFindings: String(item.rawDataPreview?.["Investigation Findings"] || ""),\n      pdfButtonLabel:',
          "CreateEvaluation stored record mapping"
        );

        next = replaceAllRequired(
          this,
          next,
          "caseDescription, caseId,",
          "caseDescription, investigationFindings, caseId,",
          "CreateEvaluation memo dependency"
        );

        next = replaceRequired(
          this,
          next,
          `                    placeholder="สรุปรายละเอียดเคส และสิ่งที่ Agent ดำเนินการ..."\n                  />\n                </label>\n\n                <div className="block">\n                  <span className={labelClass}>Process ที่ใช้เทียบ</span>`,
          `                    placeholder="สรุปรายละเอียดเคส และสิ่งที่ Agent ดำเนินการ..."\n                  />\n                </label>\n\n                <label className="block">\n                  <span className={labelClass}>Investigation Findings</span>\n                  <RichTextEditor\n                    value={investigationFindings}\n                    onChange={setInvestigationFindings}\n                    editorLabel="Investigation Findings"\n                    minHeight={132}\n                    tone="emerald"\n                    placeholder="ระบุข้อมูลจากการตรวจสอบระบบหรือข้อมูลหลังบ้าน..."\n                  />\n                </label>\n\n                <div className="block">\n                  <span className={labelClass}>Process ที่ใช้เทียบ</span>`,
          "CreateEvaluation Investigation Findings editor"
        );

        next = replaceRequired(
          this,
          next,
          `                <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/60 px-4 py-3">\n                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-700">Process ที่ใช้เทียบ</div>`,
          `                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">\n                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Investigation Findings</div>\n                  <RichTextContent value={submitPreview.record.investigationFindings || "-"} className="mt-2 whitespace-pre-line text-sm font-semibold leading-6 text-slate-800" />\n                </div>\n\n                <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/60 px-4 py-3">\n                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-700">Process ที่ใช้เทียบ</div>`,
          "CreateEvaluation submit preview"
        );

        createEvaluationPatched = true;
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/DashboardMockup.tsx")) {
        let next = code;

        next = replaceAllRequired(
          this,
          next,
          "  caseDescription?: string;\n  processReference?: string;",
          "  caseDescription?: string;\n  investigationFindings?: string;\n  processReference?: string;",
          "Dashboard CaseItem investigation field"
        );

        next = replaceRequired(
          this,
          next,
          '        caseDescription: record.caseDescription || "",\n        processReference: record.processReference || "",',
          '        caseDescription: record.caseDescription || "",\n        investigationFindings: String(record.rawDataPreview?.["Investigation Findings"] || "").trim(),\n        processReference: record.processReference || "",',
          "Dashboard stored evaluation mapping"
        );

        next = replaceRequired(
          this,
          next,
          '              evaluatorName: existing.evaluatorName || item.evaluatorName,\n              processReference: existing.processReference || item.processReference,',
          '              evaluatorName: existing.evaluatorName || item.evaluatorName,\n              investigationFindings: existing.investigationFindings || item.investigationFindings,\n              processReference: existing.processReference || item.processReference,',
          "Dashboard merged case mapping"
        );

        next = replaceRequired(
          this,
          next,
          `              </div>\n              {String(caseItem.processReference || "").trim() ? (`,
          `              </div>\n              <div className="mb-5">\n                <div className="rounded-[18px] border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 px-4 py-4 shadow-[0_10px_24px_rgba(16,185,129,0.06)]">\n                  <div className="flex items-center gap-3">\n                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-base text-emerald-700 shadow-sm">{"\\u{1F50E}"}</span>\n                    <div>\n                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Investigation Findings</div>\n                      <div className="mt-1 text-xs text-slate-500">ข้อมูลจากการตรวจสอบระบบหรือข้อมูลหลังบ้าน</div>\n                    </div>\n                  </div>\n                  <div className="mt-3 rounded-[16px] border border-emerald-100 bg-white/95 px-4 py-3 shadow-sm">\n                    <RichTextContent value={caseItem.investigationFindings || "-"} className="whitespace-pre-line text-[14px] leading-6.5 text-slate-800" />\n                  </div>\n                </div>\n              </div>\n              {String(caseItem.processReference || "").trim() ? (`,
          "Dashboard Investigation Findings display"
        );

        dashboardPatched = true;
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/caseDetailOfficialPdf.ts")) {
        let next = code;

        next = replaceRequired(
          this,
          next,
          `    drawWideRichTextRow({\n      labelText: "Case\\nDescription",\n      text: caseItem.caseDescription || "-",\n      size: CASE_DESCRIPTION_TEXT_SIZE,\n      leading: CASE_DESCRIPTION_LINE_SPACING,\n      minH: 18,\n      padY: 5,\n    });`,
          `    drawWideRichTextRow({\n      labelText: "Case\\nDescription",\n      text: caseItem.caseDescription || "-",\n      size: CASE_DESCRIPTION_TEXT_SIZE,\n      leading: CASE_DESCRIPTION_LINE_SPACING,\n      minH: 18,\n      padY: 5,\n    });\n\n    drawWideRichTextRow({\n      labelText: "Investigation\\nFindings",\n      text: caseItem.investigationFindings || "-",\n      size: CASE_DESCRIPTION_TEXT_SIZE,\n      leading: CASE_DESCRIPTION_LINE_SPACING,\n      minH: 14,\n      padY: 4.5,\n    });`,
          "Original PDF Investigation Findings row"
        );

        next = replaceRequired(
          this,
          next,
          `    drawWideRichTextRow({\n      labelText: "Case\\nDescription",\n      text: caseItem.caseDescription || "Revised",\n      size: CASE_DESCRIPTION_TEXT_SIZE,\n      leading: CASE_DESCRIPTION_LINE_SPACING,\n      minH: 18,\n      padY: 5,\n    });`,
          `    drawWideRichTextRow({\n      labelText: "Case\\nDescription",\n      text: caseItem.caseDescription || "Revised",\n      size: CASE_DESCRIPTION_TEXT_SIZE,\n      leading: CASE_DESCRIPTION_LINE_SPACING,\n      minH: 18,\n      padY: 5,\n    });\n\n    drawWideRichTextRow({\n      labelText: "Investigation\\nFindings",\n      text: caseItem.investigationFindings || "-",\n      size: CASE_DESCRIPTION_TEXT_SIZE,\n      leading: CASE_DESCRIPTION_LINE_SPACING,\n      minH: 14,\n      padY: 4.5,\n    });`,
          "Appeal PDF Investigation Findings row"
        );

        pdfPatched = true;
        return { code: next, map: null };
      }

      return null;
    },

    buildEnd(error) {
      if (error) return;
      if (!createEvaluationPatched) this.error("Investigation Findings patch was not applied to CreateEvaluationMockup.tsx.");
      if (!dashboardPatched) this.error("Investigation Findings patch was not applied to DashboardMockup.tsx.");
      if (!pdfPatched) this.error("Investigation Findings patch was not applied to caseDetailOfficialPdf.ts.");
    },
  };
}
