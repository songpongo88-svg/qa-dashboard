import fs from "node:fs";

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`v85 missing ${label}`);
  return source.replace(from, to);
}

// 1) App: Edit Evaluation gets its own internal workspace tab: Edit <Case ID>.
{
  const file = "src/App.tsx";
  let source = fs.readFileSync(file, "utf8");
  const marker = "// app-dedicated-edit-workspace-tabs-v85";

  if (!source.includes(marker)) {
    if (!source.includes("// app-internal-case-edit-tabs-v83")) {
      throw new Error("v85 requires App internal tabs v83 first");
    }
    source = source.replace(
      "// app-internal-case-edit-tabs-v83\n",
      "// app-internal-case-edit-tabs-v83\n" + marker + "\n",
    );

    source = replaceOnce(
      source,
      'type CaseWorkspaceTabKey = `case:${string}`;\ntype WorkspaceTabKey = AppTab | "case-detail" | CaseWorkspaceTabKey;',
      'type CaseWorkspaceTabKey = `case:${string}`;\ntype EditWorkspaceTabKey = `edit:${string}`;\ntype WorkspaceTabKey = AppTab | "case-detail" | CaseWorkspaceTabKey | EditWorkspaceTabKey;',
      "workspace tab types",
    );

    const normalizeAnchor = "function normalizeWorkspaceTabKey(value: unknown): WorkspaceTabKey | \"\" {";
    const editHelpers = `function buildEditWorkspaceKey(caseId: string, agentName = ""): EditWorkspaceTabKey {
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
    if (!source.includes(normalizeAnchor)) throw new Error("v85 workspace normalize anchor missing");
    source = source.replace(normalizeAnchor, editHelpers + normalizeAnchor);
    source = replaceOnce(
      source,
      '  if (isCaseWorkspaceTabKey(normalized)) return normalized as CaseWorkspaceTabKey;\n',
      '  if (isCaseWorkspaceTabKey(normalized)) return normalized as CaseWorkspaceTabKey;\n  if (isEditWorkspaceTabKey(normalized)) return normalized as EditWorkspaceTabKey;\n',
      "dynamic edit workspace normalization",
    );

    source = replaceOnce(
      source,
      `      retained.add(
        workspaceKey === "case-detail" || isCaseWorkspaceTabKey(workspaceKey)
          ? "dashboard"
          : workspaceKey
      );`,
      `      retained.add(
        workspaceKey === "case-detail" || isCaseWorkspaceTabKey(workspaceKey)
          ? "dashboard"
          : isEditWorkspaceTabKey(workspaceKey)
            ? "create-evaluation"
            : workspaceKey as AppTab
      );`,
      "retained app tab mapping",
    );

    const navigateAnchor = `  const navigateToTab = useCallback((
    tab: AppTab,
    options: {
      replace?: boolean;
      params?: Record<string, string | undefined>;
      workspaceKey?: WorkspaceTabKey;
    } = {}
  ) => {
    const unifiedTab = tab === "summary" ? "dashboard" : tab;`;
    const navigateReplacement = `  const navigateToTab = useCallback((
    tab: AppTab,
    options: {
      replace?: boolean;
      params?: Record<string, string | undefined>;
      workspaceKey?: WorkspaceTabKey;
    } = {}
  ) => {
    const dedicatedEditRouteV85 = Boolean(options.workspaceKey && isEditWorkspaceTabKey(options.workspaceKey));
    if (!dedicatedEditRouteV85) {
      options = { ...options, params: { ...(options.params || {}), editCaseId: "" } };
    }
    const unifiedTab = tab === "summary" ? "dashboard" : tab;`;
    source = replaceOnce(source, navigateAnchor, navigateReplacement, "navigateToTab edit cleanup");

    const syncWorkspaceAnchor = `    const normalizedRouteWorkspaceTab = normalizeWorkspaceTabKey(params.get("workspace"));
    const routeWorkspaceTab = normalizedRouteWorkspaceTab === "summary" || normalizedRouteWorkspaceTab === "case-detail"
      ? "dashboard"
      : normalizedRouteWorkspaceTab;
    const nextWorkspaceTab: WorkspaceTabKey = blockedReason
      ? "dashboard"
      : routeWorkspaceTab || (nextTab === "dashboard" && params.get("subTab") === "case-detail"
        ? "case-detail"
        : nextTab);`;
    const syncWorkspaceReplacement = `    const normalizedRouteWorkspaceTab = normalizeWorkspaceTabKey(params.get("workspace"));
    const routeWorkspaceTab = normalizedRouteWorkspaceTab === "summary" || normalizedRouteWorkspaceTab === "case-detail"
      ? "dashboard"
      : normalizedRouteWorkspaceTab;
    const legacyEditCaseIdV85 = nextTab === "create-evaluation" ? String(params.get("editCaseId") || "").trim().toUpperCase() : "";
    const inferredEditWorkspaceV85: WorkspaceTabKey | "" = legacyEditCaseIdV85
      ? buildEditWorkspaceKey(legacyEditCaseIdV85, String(params.get("agent") || ""))
      : "";
    const nextWorkspaceTab: WorkspaceTabKey = blockedReason
      ? "dashboard"
      : routeWorkspaceTab || inferredEditWorkspaceV85 || (nextTab === "dashboard" && params.get("subTab") === "case-detail"
        ? "case-detail"
        : nextTab);`;
    source = replaceOnce(source, syncWorkspaceAnchor, syncWorkspaceReplacement, "route edit workspace inference");

    const activateAnchor = `  const activateWorkspaceTab = useCallback((workspaceKey: WorkspaceTabKey) => {
    if (isCaseWorkspaceTabKey(workspaceKey)) {`;
    const activateReplacement = `  const activateWorkspaceTab = useCallback((workspaceKey: WorkspaceTabKey) => {
    if (isEditWorkspaceTabKey(workspaceKey)) {
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

    if (isCaseWorkspaceTabKey(workspaceKey)) {`;
    source = replaceOnce(source, activateAnchor, activateReplacement, "activate edit workspace");

    source = replaceOnce(
      source,
      `    navigateToTab(workspaceKey as AppTab, { workspaceKey });
  }, [navigateToTab, selectedAgentGlobal, selectedDashboardCaseId]);`,
      `    if (workspaceKey === "create-evaluation") {
      navigateToTab("create-evaluation", {
        workspaceKey,
        params: { editCaseId: "", caseId: "", subTab: "" },
      });
      return;
    }

    navigateToTab(workspaceKey as AppTab, { workspaceKey });
  }, [navigateToTab, selectedAgentGlobal, selectedDashboardCaseId]);`,
      "activate clean Evaluate workspace",
    );

    source = replaceOnce(
      source,
      '                  workspaceKey: "create-evaluation",\n                  params: {\n                    editCaseId: caseId,',
      '                  workspaceKey: buildEditWorkspaceKey(caseId, agentName || ""),\n                  params: {\n                    editCaseId: caseId,',
      "Dashboard Edit Evaluation workspace key",
    );

    source = replaceOnce(
      source,
      `              const label = isCaseWorkspaceTabKey(workspaceKey)
                ? parseCaseWorkspaceKey(workspaceKey).caseId
                : WORKSPACE_TAB_LABELS[workspaceKey];`,
      `              const label = isEditWorkspaceTabKey(workspaceKey)
                ? \`Edit \${parseEditWorkspaceKey(workspaceKey).caseId}\`
                : isCaseWorkspaceTabKey(workspaceKey)
                  ? parseCaseWorkspaceKey(workspaceKey).caseId
                  : WORKSPACE_TAB_LABELS[workspaceKey];`,
      "workspace edit tab label",
    );

    const createEvalFinal = `          <CreateEvaluationMockup
            agentOptions={qaEvaluationAgentOptions}
            currentUser={currentUser}
            editCaseId={typeof window !== "undefined" ? String(new URL(window.location.href).searchParams.get("editCaseId") || "") : ""}
            onSubmitEvaluation={handleEvaluationSubmitted}
          />`;
    const createEvalV85 = `          <CreateEvaluationMockup
            key={isEditWorkspaceTabKey(activeWorkspaceTab) ? activeWorkspaceTab : "create-evaluation-new"}
            agentOptions={qaEvaluationAgentOptions}
            currentUser={currentUser}
            editCaseId={isEditWorkspaceTabKey(activeWorkspaceTab) ? parseEditWorkspaceKey(activeWorkspaceTab).caseId : ""}
            onCancelEdit={() => {
              if (isEditWorkspaceTabKey(activeWorkspaceTab)) closeWorkspaceTab(activeWorkspaceTab);
            }}
            onSubmitEvaluation={handleEvaluationSubmitted}
          />`;
    source = replaceOnce(source, createEvalFinal, createEvalV85, "dedicated Edit Evaluation render");

    fs.writeFileSync(file, source);
    console.log("Applied dedicated Edit <Case ID> workspace tabs v85");
  } else {
    console.log("Dedicated Edit workspace tabs v85 already applied");
  }
}

// 2) Evaluate: dedicated Edit tabs do not read/write the normal Evaluate tab memory.
{
  const file = "src/CreateEvaluationMockup.tsx";
  let source = fs.readFileSync(file, "utf8");
  const marker = "// evaluate-dedicated-edit-memory-v85";

  if (!source.includes(marker)) {
    if (!source.includes("// evaluate-internal-edit-tab-v83")) {
      throw new Error("v85 requires Evaluate internal edit v83 first");
    }
    source = source.replace(
      "// evaluate-internal-edit-tab-v83\n",
      "// evaluate-internal-edit-tab-v83\n" + marker + "\n",
    );

    source = replaceOnce(
      source,
      `export default function CreateEvaluationMockup({
  agentOptions,
  currentUser,
  editCaseId,
  onSubmitEvaluation,
}: {
  agentOptions?: EvaluationAgentOption[];
  currentUser?: EvaluationCurrentUser | null;
  editCaseId?: string;
  onSubmitEvaluation?: (payload: EvaluationSubmitPayload) => void | Promise<void>;
}) {
  const stickyNoteOwner = currentUser?.username || currentUser?.email || "anonymous";`,
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
  const isDedicatedEditWorkspaceV85 = Boolean(String(editCaseId || "").trim());
  const evaluateMemoryV85 = isDedicatedEditWorkspaceV85 ? null : readEvaluateTabMemory();`,
      "Evaluate dedicated edit props",
    );

    source = source.replace('const restoredEvaluateTabMemoryRef = useRef(Boolean(readEvaluateTabMemory()));', 'const restoredEvaluateTabMemoryRef = useRef(Boolean(evaluateMemoryV85));');
    source = source.split('readEvaluateTabMemory()?.').join('evaluateMemoryV85?.');

    source = replaceOnce(
      source,
      `  useEffect(() => {
    writeEvaluateTabMemory({`,
      `  useEffect(() => {
    if (isDedicatedEditWorkspaceV85) return;
    writeEvaluateTabMemory({`,
      "Evaluate memory write guard",
    );

    const cancelPattern = /  function cancelSubmittedEdit\(\) \{[\s\S]*?\n  \}\n/;
    if (!cancelPattern.test(source)) throw new Error("v85 Evaluate cancel handler missing");
    source = source.replace(cancelPattern, `  function cancelSubmittedEdit() {
    const editingCaseId = caseId || "current case";
    setActiveSubmittedRecordId("");
    setSubmitPreview(null);
    if (isDedicatedEditWorkspaceV85) {
      setDraftMessage(\`Edit cancelled for \${editingCaseId}. No changes were saved.\`);
      onCancelEdit?.();
      return;
    }
    setWorkspaceView("report");
    setDraftMessage(\`Edit cancelled for \${editingCaseId}. No changes were saved.\`);
  }
`);

    fs.writeFileSync(file, source);
    console.log("Applied isolated normal Evaluate vs Edit workspace memory v85");
  } else {
    console.log("Evaluate dedicated edit memory v85 already applied");
  }
}

// 3) Process Library: make file selection visible inside the Slide picker itself.
{
  const file = "src/processLibrary.tsx";
  let source = fs.readFileSync(file, "utf8");
  const marker = "// process-library-visible-file-picker-v85";

  if (!source.includes(marker)) {
    if (!source.includes("// process-library-multi-file-v84")) {
      throw new Error("v85 requires Process Library multi-file v84 first");
    }
    source = source.replace(
      "// process-library-multi-file-v84\n",
      "// process-library-multi-file-v84\n" + marker + "\n",
    );

    source = source.replace(
      '>Process ที่ต้องการใช้</div>',
      '>Process Library ({processLibraryV84.length} ไฟล์)</div>',
    );

    const pickerTitle = '<div className="text-lg font-black text-[#103d66]">เลือก Slide จาก Process</div>';
    const pickerWithFileSelect = `${pickerTitle}
                <div className="mt-2 rounded-xl border border-sky-200 bg-sky-50/80 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#155B83]">Process File</div>
                    <div className="text-[10px] font-black text-slate-500">\{processLibraryV84.length\} ไฟล์ใน Library</div>
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
    if (!source.includes(pickerTitle)) throw new Error("v85 Process Slide picker title anchor missing");
    source = source.replace(pickerTitle, pickerWithFileSelect);

    const archiveGlobalPattern = 'if (entry.id !== id && row?.status === "current") batch.set(entry.ref, { status: "archived" }, { merge: true });';
    const archiveScoped = 'if (entry.id !== id && row?.status === "current" && processNameKeyV84(row?.name || row?.fileName || "Process") === processNameKeyV84(processName)) batch.set(entry.ref, { status: "archived" }, { merge: true });';
    source = source.split(archiveGlobalPattern).join(archiveScoped);

    fs.writeFileSync(file, source);
    console.log("Applied visible multi-file Process selector inside Slide picker v85");
  } else {
    console.log("Visible Process file picker v85 already applied");
  }
}
