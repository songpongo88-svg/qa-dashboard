import fs from "node:fs";

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`v82 missing ${label}`);
  return source.replace(from, to);
}

// 1) Process Slide Viewer: remove the fullscreen/maximize button.
{
  const file = "src/processLibrary.tsx";
  let source = fs.readFileSync(file, "utf8");
  const marker = "// process-slide-viewer-no-fullscreen-v82";

  if (!source.includes(marker)) {
    if (!source.includes("// process-reference-case-title-repair-v81")) {
      throw new Error("v82 requires Process reference v81 first");
    }
    source = source.replace(
      "// process-reference-case-title-repair-v81\n",
      "// process-reference-case-title-repair-v81\n" + marker + "\n",
    );

    const maximizeButton = /\n\s*<button type="button" onClick=\{toggleMaximize\}[\s\S]*?\{maximized \? "❐" : "□"\}<\/button>/;
    if (!maximizeButton.test(source)) throw new Error("v82 Process Viewer maximize button not found");
    source = source.replace(maximizeButton, "");

    fs.writeFileSync(file, source);
    console.log("Applied Process Slide Viewer without fullscreen button v82");
  } else {
    console.log("Process Slide Viewer fullscreen removal v82 already applied");
  }
}

// 2) Dashboard: Open Full Case Detail in a real browser tab and add QA Edit Evaluation.
{
  const file = "src/DashboardMockup.tsx";
  let source = fs.readFileSync(file, "utf8");
  const marker = "// dashboard-case-browser-tabs-edit-v82";

  if (!source.includes(marker)) {
    const anchor = `function isQualityAssuranceRole(value: unknown) {
  const role = String(value || "").trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\\s+/g, " ");
  return role === "quality assurance" || role === "qa";
}
`;
    if (!source.includes(anchor)) throw new Error("v82 Dashboard QA role helper not found");

    const helpers = `${anchor}\n${marker}\nfunction openCaseDetailBrowserTabV82(caseId: string, agentName?: string) {\n  if (typeof window === "undefined" || !caseId) return;\n  const url = new URL(window.location.href);\n  url.searchParams.set("tab", "dashboard");\n  url.searchParams.set("subTab", "case-detail");\n  url.searchParams.set("caseId", caseId);\n  if (agentName) url.searchParams.set("agent", agentName);\n  else url.searchParams.delete("agent");\n  url.searchParams.delete("editCaseId");\n  url.searchParams.delete("adminSection");\n  const opened = window.open(url.toString(), "_blank", "noopener,noreferrer");\n  opened?.focus?.();\n}\n\nfunction openEvaluationEditBrowserTabV82(caseId: string, agentName?: string) {\n  if (typeof window === "undefined" || !caseId) return;\n  const url = new URL(window.location.href);\n  url.searchParams.set("tab", "create-evaluation");\n  url.searchParams.set("editCaseId", caseId);\n  if (agentName) url.searchParams.set("agent", agentName);\n  else url.searchParams.delete("agent");\n  url.searchParams.delete("subTab");\n  url.searchParams.delete("caseId");\n  url.searchParams.delete("workspace");\n  url.searchParams.delete("adminSection");\n  const opened = window.open(url.toString(), "_blank", "noopener,noreferrer");\n  opened?.focus?.();\n}\n`;
    source = source.replace(anchor, helpers);

    const oldButton = `                              <button
                                type="button"
                                onClick={() => setSlideOverOpen(true)}
                                className="mt-4 w-full cursor-pointer rounded-xl bg-violet-700 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-violet-800"
                              >
                                Open Full Case Detail →
                              </button>`;

    const newButtons = `                              <div className="mt-4 grid gap-2">
                                {isQualityAssuranceRole(currentUser?.role) ? (
                                  <button
                                    type="button"
                                    onClick={() => openEvaluationEditBrowserTabV82(activeSelectedCase.caseId, activeSelectedCase.agent)}
                                    className="w-full cursor-pointer rounded-xl border border-[#155B83] bg-[#F3F8FB] px-4 py-3 text-sm font-black text-[#155B83] shadow-sm transition hover:bg-[#E5F0F5]"
                                    title="เปิดแบบประเมินเคสนี้ในโหมดแก้ไขคะแนน"
                                  >
                                    Edit Evaluation
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => openCaseDetailBrowserTabV82(activeSelectedCase.caseId, activeSelectedCase.agent)}
                                  className="w-full cursor-pointer rounded-xl bg-[#155B83] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#104A6B]"
                                  title="เปิด Case Detail ใน Browser Tab ใหม่"
                                >
                                  Open Full Case Detail ↗
                                </button>
                              </div>`;
    source = replaceOnce(source, oldButton, newButtons, "Dashboard selected-case action button");

    fs.writeFileSync(file, source);
    console.log("Applied browser-tab Case Detail and QA Edit Evaluation button v82");
  } else {
    console.log("Dashboard browser-tab/edit actions v82 already applied");
  }
}

// 3) Evaluate: allow QA deep links like ?tab=create-evaluation&editCaseId=AA123456.
{
  const file = "src/CreateEvaluationMockup.tsx";
  let source = fs.readFileSync(file, "utf8");
  const marker = "// evaluate-direct-edit-case-v82";

  if (!source.includes(marker)) {
    source = replaceOnce(
      source,
      "// process-library-v65\n",
      "// process-library-v65\n" + marker + "\n",
      "CreateEvaluation marker anchor",
    );

    const permissionAnchor = '  const canOpenExportReport = currentUser?.role === "Quality Assurance";\n';
    const permissionReplacement = `${permissionAnchor}  const directEditCaseIdV82 = useMemo(() => {\n    if (typeof window === "undefined") return "";\n    try {\n      return String(new URL(window.location.href).searchParams.get("editCaseId") || "").trim().toUpperCase();\n    } catch {\n      return "";\n    }\n  }, []);\n  const directEditHandledRefV82 = useRef("");\n`;
    source = replaceOnce(source, permissionAnchor, permissionReplacement, "CreateEvaluation QA permission anchor");

    const effectAnchor = `  useEffect(() => {
    if (workspaceView === "report") {
      void loadSubmittedRecords();
    }
  }, [workspaceView]);
`;
    const directEffect = `${effectAnchor}\n  useEffect(() => {\n    if (!directEditCaseIdV82 || !canOpenExportReport) return;\n    if (directEditHandledRefV82.current === directEditCaseIdV82) return;\n    directEditHandledRefV82.current = directEditCaseIdV82;\n    setSubmittedRecordsLoading(true);\n    setDraftMessage("กำลังโหลดเคส " + directEditCaseIdV82 + " สำหรับแก้ไข...");\n\n    void fetchStoredEvaluations(1000)\n      .then((records) => {\n        const target = records.find((record) => normalizeCaseId(record.caseId) === directEditCaseIdV82);\n        if (!target) {\n          setWorkspaceView("form");\n          setDraftMessage("ไม่พบเคส " + directEditCaseIdV82 + " ใน QA Evaluation Form จึงยังเปิด Edit Mode ไม่ได้");\n          return;\n        }\n        openSubmittedRecord(storedRecordToEvaluationRecord(target));\n        setWorkspaceView("form");\n      })\n      .catch((error) => {\n        directEditHandledRefV82.current = "";\n        setDraftMessage(error instanceof Error ? error.message : "โหลดเคสสำหรับแก้ไขไม่สำเร็จ");\n      })\n      .finally(() => setSubmittedRecordsLoading(false));\n  }, [directEditCaseIdV82, canOpenExportReport]);\n`;
    source = replaceOnce(source, effectAnchor, directEffect, "CreateEvaluation report effect anchor");

    fs.writeFileSync(file, source);
    console.log("Applied direct QA evaluation edit deep link v82");
  } else {
    console.log("Direct QA evaluation edit v82 already applied");
  }
}
