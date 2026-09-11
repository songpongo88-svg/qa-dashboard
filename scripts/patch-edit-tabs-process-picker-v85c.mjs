import fs from "node:fs";

// Normalize the retained workspace block because earlier workspace patches may use
// an equivalent implementation with different formatting.
{
  const file = "src/App.tsx";
  let source = fs.readFileSync(file, "utf8");
  const pattern = /  const retainedWorkspaceAppTabs = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[openWorkspaceTabs\]\);/;
  if (!pattern.test(source)) throw new Error("v85c retained workspace block not found");
  source = source.replace(pattern, `  const retainedWorkspaceAppTabs = useMemo(() => {
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
  fs.writeFileSync(file, source);
}

await import("./patch-edit-tabs-process-picker-v85b.mjs");
