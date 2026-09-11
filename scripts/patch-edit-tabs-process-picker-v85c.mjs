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

  fs.writeFileSync(file, source);
}

await import("./patch-edit-tabs-process-picker-v85b.mjs");
