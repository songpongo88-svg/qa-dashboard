import fs from "node:fs";

// Normalize workspace pieces because earlier workspace patches may use equivalent
// implementations with different formatting.
{
  const file = "src/App.tsx";
  let source = fs.readFileSync(file, "utf8");

  const retainedPattern = /  const retainedWorkspaceAppTabs = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[openWorkspaceTabs\]\);/;
  if (!retainedPattern.test(source)) throw new Error("v85c retained workspace block not found");
  source = source.replace(retainedPattern, `  const retainedWorkspaceAppTabs = useMemo(() => {
    const retained = new Set<AppTab>(["dashboard"]);
    openWorkspaceTabs.forEach((workspaceKey) => {
      retained.add(
        workspaceKey === "case-detail" || isCaseWorkspaceTabKey(workspaceKey)
          ? "dashboard"
          : workspaceKey
      );
    });
    return Array.from(retained);
  }, [openWorkspaceTabs]);`);

  if (!source.includes("if (isEditWorkspaceTabKey(workspaceKey))")) {
    const activateAnchor = "  const activateWorkspaceTab = useCallback((workspaceKey: WorkspaceTabKey) => {\n";
    if (!source.includes(activateAnchor)) throw new Error("v85c activateWorkspaceTab anchor not found");
    source = source.replace(activateAnchor, activateAnchor + `    if (isEditWorkspaceTabKey(workspaceKey)) {
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

`);
  }

  // Normalize the workspace-tab label expression; v85b will recognize the Edit branch
  // and leave it in place while preserving all surrounding tab UI.
  if (!source.includes('`Edit ${parseEditWorkspaceKey(workspaceKey).caseId}`')) {
    const labelPattern = /(\{openWorkspaceTabs\.map\(\(workspaceKey\) => \{\s*\n\s*const isActive = activeWorkspaceTab === workspaceKey;\s*\n)\s*const label = [\s\S]*?;\s*\n(\s*return <div)/;
    if (!labelPattern.test(source)) throw new Error("v85c workspace label block not found");
    source = source.replace(labelPattern, `$1              const label = isEditWorkspaceTabKey(workspaceKey)
                ? \`Edit \${parseEditWorkspaceKey(workspaceKey).caseId}\`
                : isCaseWorkspaceTabKey(workspaceKey)
                  ? parseCaseWorkspaceKey(workspaceKey).caseId
                  : WORKSPACE_TAB_LABELS[workspaceKey];
$2`);
  }

  fs.writeFileSync(file, source);
}

// Keep the original readEvaluateTabMemory() field initializers intact. Several Vite
// source transforms (including Investigation Findings) intentionally patch those exact
// anchors. Dedicated Edit tabs are isolated by the write guard + their own keyed mount,
// so rewriting every field initializer is unnecessary and breaks those transforms.
{
  const file = "scripts/patch-edit-tabs-process-picker-v85b.mjs";
  let source = fs.readFileSync(file, "utf8");
  const oldLine = '    source = source.split("readEvaluateTabMemory()?.").join("evaluateMemoryV85b?.");\n';
  if (source.includes(oldLine)) {
    source = source.replace(oldLine, '    // Preserve readEvaluateTabMemory() field initializer anchors for Vite transforms.\n');
    fs.writeFileSync(file, source);
  }
}

await import("./patch-edit-tabs-process-picker-v85b.mjs");
await import("./patch-process-no-support-v86.mjs");
