export function adminSelfOnlyScopeFixPatch() {
  return {
    name: "admin-self-only-scope-fix",
    enforce: "pre",
    transform(code, id) {
      const normalized = id.replace(/\\/g, "/");
      let next = code;
      const original = code;

      if (normalized.endsWith("/src/App.tsx")) {
        next = next.replace(
          /    if \(isAdminScopeRole\(currentUser\.role\)\) \{[\s\S]*?\n    \}\n\n    if \(roleHasAllAgentScope/,
          `    if (isAdminScopeRole(currentUser.role)) {\n      const selfAgent =\n        currentUser.agentName || currentUser.displayName || currentUser.username;\n      return [selfAgent].filter(Boolean);\n    }\n\n    if (roleHasAllAgentScope`
        );
      }

      if (normalized.endsWith("/src/SummaryMockup.tsx")) {
        next = next.replace(
          `  const analyticsCanSelectAllAgents =\n    canViewAllAgents &&\n    (!roleScopedAgentList.length || isAdminAgentScopeRole);`,
          `  const analyticsCanSelectAllAgents =\n    canViewAllAgents &&\n    !roleScopedAgentList.length;`
        );

        next = next.replace(
          `  const effectiveSelectedAgent =\n    roleScopedAgentList.length && !isAdminAgentScopeRole\n      ? roleScopedAgentList[0]\n      : selectedAgent;`,
          `  const effectiveSelectedAgent =\n    roleScopedAgentList.length\n      ? roleScopedAgentList[0]\n      : selectedAgent;`
        );
      }

      if (normalized.endsWith("/src/DashboardMockup.tsx")) {
        next = next.replace(
          `  const effectiveSelectedAgent =\n    overviewSelfOnly && overviewAgentScopeList.length\n      ? overviewAgentScopeList[0]\n      : String(selectedAgent || \"\").trim();`,
          `  const effectiveSelectedAgent =\n    isAdminDashboardRole && overviewAgentScopeList.length\n      ? overviewAgentScopeList[0]\n      : overviewSelfOnly && overviewAgentScopeList.length\n        ? overviewAgentScopeList[0]\n        : String(selectedAgent || \"\").trim();`
        );
      }

      return next === original ? null : { code: next, map: null };
    },
  };
}
