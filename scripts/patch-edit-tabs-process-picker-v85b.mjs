import fs from "node:fs";

function replaceRequired(source, pattern, replacement, label) {
  const next = source.replace(pattern, replacement);
  if (next === source) throw new Error(`v85b missing ${label}`);
  return next;
}

// 1) App: Edit Evaluation uses a dedicated internal workspace tab named Edit <Case ID>.
{
  const file = "src/App.tsx";
  let source = fs.readFileSync(file, "utf8");
  const marker = "// app-dedicated-edit-workspace-tabs-v85b";

  if (!source.includes(marker)) {
    if (!source.includes("// app-internal-case-edit-tabs-v83")) {
      throw new Error("v85b requires App internal tabs v83 first");
    }
    source = source.replace(
      "// app-internal-case-edit-tabs-v83\n",
      "// app-internal-case-edit-tabs-v83\n" + marker + "\n",
    );

    if (!source.includes("type EditWorkspaceTabKey")) {
      source = replaceRequired(
        source,
        /(type CaseWorkspaceTabKey\s*=\s*`case:\$\{string\}`;\s*\n)/,
        `$1type EditWorkspaceTabKey = \`edit:\${string}\`;\n`,
        "CaseWorkspaceTabKey type",
      );
      source = replaceRequired(
        source,
        /type WorkspaceTabKey\s*=\s*([^;]+);/,
        (match, union) => union.includes("EditWorkspaceTabKey")
          ? match
          : `type WorkspaceTabKey = ${String(union).trim()} | EditWorkspaceTabKey;`,
        "WorkspaceTabKey union",
      );
    }

    const normalizeAnchor = "function normalizeWorkspaceTabKey(value: unknown): WorkspaceTabKey | \"\" {";
    if (!source.includes("function isEditWorkspaceTabKey")) {
      const helpers = `function buildEditWorkspaceKey(caseId: string, agentName = ""): EditWorkspaceTabKey {
  const safeCaseId = String(caseId || "").trim().toUpperCase();
  const safeAgent = String(agentName || "").trim();
  return \`edit:\${encodeURIComponent(safeCaseId)}|\${encodeURIComponent(safeAgent)}\` as EditWorkspaceTabKey;
}

function parseEditWorkspaceKey(value: unknown) {
  const normalized = String(value || "");
  if (!normalized.startsWith("edit:")) return { caseId: "", agentName: "" };
  const payload = normalized.slice(5);
  const separatorIndex = payload.indexOf("|");
  const encodedCaseId = separatorIndex >= 0 ? payload.slice(0, separatorIndex) : payload;
  const encodedAgent = separatorIndex >= 0 ? payload.slice(separatorIndex + 1) : "";
  try {
    return { caseId: decodeURIComponent(encodedCaseId), agentName: decodeURIComponent(encodedAgent) };
  } catch {
    return { caseId: encodedCaseId, agentName: encodedAgent };
  }
}

function isEditWorkspaceTabKey(value: unknown): value is EditWorkspaceTabKey {
  return String(value || "").startsWith("edit:") && Boolean(parseEditWorkspaceKey(value).caseId);
}

`;
      if (!source.includes(normalizeAnchor)) throw new Error("v85b workspace normalize anchor missing");
      source = source.replace(normalizeAnchor, helpers + normalizeAnchor);
    }

    if (!source.includes("if (isEditWorkspaceTabKey(normalized))")) {
      source = replaceRequired(
        source,
        /(\s*if \(isCaseWorkspaceTabKey\(normalized\)\) return normalized as CaseWorkspaceTabKey;\s*\n)/,
        `$1  if (isEditWorkspaceTabKey(normalized)) return normalized as EditWorkspaceTabKey;\n`,
        "workspace normalization case line",
      );
    }

    if (!source.includes('isEditWorkspaceTabKey(workspaceKey)\n            ? "create-evaluation"')) {
      source = replaceRequired(
        source,
        /retained\.add\(\s*workspaceKey === "case-detail" \|\| isCaseWorkspaceTabKey\(workspaceKey\)\s*\? "dashboard"\s*:\s*workspaceKey\s*\);/,
        `retained.add(
        workspaceKey === "case-detail" || isCaseWorkspaceTabKey(workspaceKey)
          ? "dashboard"
          : isEditWorkspaceTabKey(workspaceKey)
            ? "create-evaluation"
            : workspaceKey as AppTab
      );`,
        "retained workspace mapping",
      );
    }

    if (!source.includes("const dedicatedEditRouteV85b")) {
      source = replaceRequired(
        source,
        /(const navigateToTab = useCallback\(\([\s\S]*?\n  \) => \{\n)(\s*const unifiedTab = tab === "summary" \? "dashboard" : tab;)/,
        `$1    const dedicatedEditRouteV85b = Boolean(options.workspaceKey && isEditWorkspaceTabKey(options.workspaceKey));
    if (!dedicatedEditRouteV85b) {
      options = { ...options, params: { ...(options.params || {}), editCaseId: "" } };
    }
$2`,
        "navigateToTab edit cleanup",
      );
    }

    if (!source.includes("legacyEditCaseIdV85b")) {
      source = replaceRequired(
        source,
        /(\s*const normalizedRouteWorkspaceTab = normalizeWorkspaceTabKey\(params\.get\("workspace"\)\);\s*\n\s*const routeWorkspaceTab = normalizedRouteWorkspaceTab === "summary" \|\| normalizedRouteWorkspaceTab === "case-detail"\s*\n\s*\? "dashboard"\s*\n\s*:\s*normalizedRouteWorkspaceTab;\s*\n)(\s*const nextWorkspaceTab: WorkspaceTabKey = blockedReason[\s\S]*?\n\s*:\s*nextTab\);)/,
        `$1    const legacyEditCaseIdV85b = nextTab === "create-evaluation" ? String(params.get("editCaseId") || "").trim().toUpperCase() : "";
    const inferredEditWorkspaceV85b: WorkspaceTabKey | "" = legacyEditCaseIdV85b
      ? buildEditWorkspaceKey(legacyEditCaseIdV85b, String(params.get("agent") || ""))
      : "";
    const nextWorkspaceTab: WorkspaceTabKey = blockedReason
      ? "dashboard"
      : routeWorkspaceTab || inferredEditWorkspaceV85b || (nextTab === "dashboard" && params.get("subTab") === "case-detail"
        ? "case-detail"
        : nextTab);`,
        "route edit workspace inference",
      );
    }

    if (!source.includes("if (isEditWorkspaceTabKey(workspaceKey))")) {
      source = replaceRequired(
        source,
        /(const activateWorkspaceTab = useCallback\(\(workspaceKey: WorkspaceTabKey\) => \{\n)(\s*if \(isCaseWorkspaceTabKey\(workspaceKey\)\) \{)/,
        `$1    if (isEditWorkspaceTabKey(workspaceKey)) {
      const { caseId, agentName } = parseEditWorkspaceKey(workspaceKey);
      if (agentName) {
        setSelectedAgentGlobal(agentName);
        setCaseSelectedAgent(agentName);
      }
      navigateToTab("create-evaluation", {
        workspaceKey,
        params: { editCaseId: caseId, agent: agentName, caseId: "", subTab: "" },
      });
      return;
    }

$2`,
        "activate edit workspace",
      );
    }

    if (!source.includes('if (workspaceKey === "create-evaluation") {\n      navigateToTab("create-evaluation"')) {
      source = replaceRequired(
        source,
        /(\s*)navigateToTab\(workspaceKey as AppTab, \{ workspaceKey \}\);\n(\s*\}, \[navigateToTab, selectedAgentGlobal, selectedDashboardCaseId\]\);)/,
        `$1if (workspaceKey === "create-evaluation") {
      navigateToTab("create-evaluation", {
        workspaceKey,
        params: { editCaseId: "", caseId: "", subTab: "" },
      });
      return;
    }

    navigateToTab(workspaceKey as AppTab, { workspaceKey });
$2`,
        "clean Evaluate activation",
      );
    }

    if (!source.includes("workspaceKey: buildEditWorkspaceKey(caseId")) {
      source = replaceRequired(
        source,
        /workspaceKey:\s*"create-evaluation",\s*\n\s*params:\s*\{\s*\n\s*editCaseId:\s*caseId,/,
        `workspaceKey: buildEditWorkspaceKey(caseId, agentName || ""),
                  params: {
                    editCaseId: caseId,`,
        "Dashboard Edit workspace key",
      );
    }

    if (!source.includes('`Edit ${parseEditWorkspaceKey(workspaceKey).caseId}`')) {
      source = replaceRequired(
        source,
        /const label = isCaseWorkspaceTabKey\(workspaceKey\)\s*\n\s*\? parseCaseWorkspaceKey\(workspaceKey\)\.caseId\s*\n\s*:\s*WORKSPACE_TAB_LABELS\[workspaceKey\];/,
        `const label = isEditWorkspaceTabKey(workspaceKey)
                ? \`Edit \${parseEditWorkspaceKey(workspaceKey).caseId}\`
                : isCaseWorkspaceTabKey(workspaceKey)
                  ? parseCaseWorkspaceKey(workspaceKey).caseId
                  : WORKSPACE_TAB_LABELS[workspaceKey];`,
        "Edit workspace label",
      );
    }

    if (!source.includes("onCancelEdit={() =>")) {
      source = replaceRequired(
        source,
        /<CreateEvaluationMockup\s*\n\s*agentOptions=\{qaEvaluationAgentOptions\}\s*\n\s*currentUser=\{currentUser\}\s*\n\s*editCaseId=\{typeof window !== "undefined" \? String\(new URL\(window\.location\.href\)\.searchParams\.get\("editCaseId"\) \|\| ""\) : ""\}\s*\n\s*onSubmitEvaluation=\{handleEvaluationSubmitted\}\s*\n\s*\/>/,
        `<CreateEvaluationMockup
            key={isEditWorkspaceTabKey(activeWorkspaceTab) ? activeWorkspaceTab : "create-evaluation-new"}
            agentOptions={qaEvaluationAgentOptions}
            currentUser={currentUser}
            editCaseId={isEditWorkspaceTabKey(activeWorkspaceTab) ? parseEditWorkspaceKey(activeWorkspaceTab).caseId : ""}
            onCancelEdit={() => {
              if (isEditWorkspaceTabKey(activeWorkspaceTab)) closeWorkspaceTab(activeWorkspaceTab);
            }}
            onSubmitEvaluation={handleEvaluationSubmitted}
          />`,
        "dedicated CreateEvaluation render",
      );
    }

    fs.writeFileSync(file, source);
    console.log("Applied dedicated Edit <Case ID> workspace tabs v85b");
  } else {
    console.log("Dedicated Edit workspace tabs v85b already applied");
  }
}

// 2) Evaluate: Edit tabs do not read/write the normal Evaluate tab memory.
{
  const file = "src/CreateEvaluationMockup.tsx";
  let source = fs.readFileSync(file, "utf8");
  const marker = "// evaluate-dedicated-edit-memory-v85b";

  if (!source.includes(marker)) {
    if (!source.includes("// evaluate-internal-edit-tab-v83")) {
      throw new Error("v85b requires Evaluate internal edit v83 first");
    }
    source = source.replace(
      "// evaluate-internal-edit-tab-v83\n",
      "// evaluate-internal-edit-tab-v83\n" + marker + "\n",
    );

    if (!source.includes("onCancelEdit,")) {
      source = replaceRequired(
        source,
        /export default function CreateEvaluationMockup\(\{\s*\n\s*agentOptions,\s*\n\s*currentUser,\s*\n\s*editCaseId,\s*\n\s*onSubmitEvaluation,\s*\n\}: \{\s*\n\s*agentOptions\?: EvaluationAgentOption\[\];\s*\n\s*currentUser\?: EvaluationCurrentUser \| null;\s*\n\s*editCaseId\?: string;\s*\n\s*onSubmitEvaluation\?: \(payload: EvaluationSubmitPayload\) => void \| Promise<void>;\s*\n\}\) \{\s*\n\s*const stickyNoteOwner = currentUser\?\.username \|\| currentUser\?\.email \|\| "anonymous";/,
        `export default function CreateEvaluationMockup({
  agentOptions,
  currentUser,
  editCaseId,
  onCancelEdit,
  onSubmitEvaluation,
}: {
  agentOptions?: EvaluationAgentOption[];
  currentUser?: EvaluationCurrentUser | null;
  editCaseId?: string;
  onCancelEdit?: () => void;
  onSubmitEvaluation?: (payload: EvaluationSubmitPayload) => void | Promise<void>;
}) {
  const stickyNoteOwner = currentUser?.username || currentUser?.email || "anonymous";
  const isDedicatedEditWorkspaceV85b = Boolean(String(editCaseId || "").trim());
  const evaluateMemoryV85b = isDedicatedEditWorkspaceV85b ? null : readEvaluateTabMemory();`,
        "Evaluate props",
      );
    }

    source = source.replace(
      "const restoredEvaluateTabMemoryRef = useRef(Boolean(readEvaluateTabMemory()));",
      "const restoredEvaluateTabMemoryRef = useRef(Boolean(evaluateMemoryV85b));",
    );
    source = source.split("readEvaluateTabMemory()?.").join("evaluateMemoryV85b?.");

    if (!source.includes("if (isDedicatedEditWorkspaceV85b) return;\n    writeEvaluateTabMemory")) {
      source = replaceRequired(
        source,
        /useEffect\(\(\) => \{\s*\n\s*writeEvaluateTabMemory\(\{/,
        `useEffect(() => {
    if (isDedicatedEditWorkspaceV85b) return;
    writeEvaluateTabMemory({`,
        "Evaluate memory write guard",
      );
    }

    source = replaceRequired(
      source,
      /  function cancelSubmittedEdit\(\) \{[\s\S]*?\n  \}\n/,
      `  function cancelSubmittedEdit() {
    const editingCaseId = caseId || "current case";
    setActiveSubmittedRecordId("");
    setSubmitPreview(null);
    if (isDedicatedEditWorkspaceV85b) {
      setDraftMessage(\`Edit cancelled for \${editingCaseId}. No changes were saved.\`);
      onCancelEdit?.();
      return;
    }
    setWorkspaceView("report");
    setDraftMessage(\`Edit cancelled for \${editingCaseId}. No changes were saved.\`);
  }
`,
      "Cancel Edit handler",
    );

    fs.writeFileSync(file, source);
    console.log("Applied isolated normal Evaluate vs Edit workspace memory v85b");
  } else {
    console.log("Evaluate dedicated edit memory v85b already applied");
  }
}

// 3) Process Library: show the Process File selector directly inside the Slide picker.
{
  const file = "src/processLibrary.tsx";
  let source = fs.readFileSync(file, "utf8");
  const marker = "// process-library-visible-file-picker-v85b";

  if (!source.includes(marker)) {
    if (!source.includes("// process-library-multi-file-v84")) {
      throw new Error("v85b requires Process Library multi-file v84 first");
    }
    source = source.replace(
      "// process-library-multi-file-v84\n",
      "// process-library-multi-file-v84\n" + marker + "\n",
    );

    source = source.replace(
      ">Process ที่ต้องการใช้</div>",
      ">Process Library ({processLibraryV84.length} ไฟล์)</div>",
    );

    if (!source.includes('aria-label="เลือก Process File ที่ต้องการดู Slide"')) {
      const pickerTitle = '<div className="text-lg font-black text-[#103d66]">เลือก Slide จาก Process</div>';
      if (!source.includes(pickerTitle)) throw new Error("v85b Process picker title missing");
      const pickerWithFileSelect = `${pickerTitle}
                <div className="mt-2 rounded-xl border border-sky-200 bg-sky-50/80 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#155B83]">Process File</div>
                    <div className="text-[10px] font-black text-slate-500">{processLibraryV84.length} ไฟล์ใน Library</div>
                  </div>
                  <select
                    value={active.id}
                    onChange={(event) => {
                      setSelectedProcessIdV84(event.target.value);
                      setPickerSlideNumber(0);
                      setSlideQuery("");
                    }}
                    className="mt-1.5 h-11 w-full rounded-xl border border-sky-200 bg-white px-3 text-sm font-black text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    aria-label="เลือก Process File ที่ต้องการดู Slide"
                  >
                    {processLibraryV84.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · Version {formatProcessVersionV78(item.versionLabel)} · {item.slideCount} Slides
                      </option>
                    ))}
                  </select>
                  <div className="mt-1.5 text-[11px] font-semibold text-slate-500">สลับไฟล์ได้โดยไม่ล้าง Slide ที่เลือกจาก Process อื่นในเคสนี้</div>
                </div>`;
      source = source.replace(pickerTitle, pickerWithFileSelect);
    }

    const globalArchive = 'if (entry.id !== id && row?.status === "current") batch.set(entry.ref, { status: "archived" }, { merge: true });';
    const scopedArchive = 'if (entry.id !== id && row?.status === "current" && processNameKeyV84(row?.name || row?.fileName || "Process") === processNameKeyV84(processName)) batch.set(entry.ref, { status: "archived" }, { merge: true });';
    source = source.split(globalArchive).join(scopedArchive);

    fs.writeFileSync(file, source);
    console.log("Applied visible multi-file Process selector inside Slide picker v85b");
  } else {
    console.log("Visible Process file picker v85b already applied");
  }
}
