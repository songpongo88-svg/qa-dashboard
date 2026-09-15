export function adminRoleDashboardScopePatch() {
  return {
    name: "admin-role-dashboard-scope",
    enforce: "pre",
    transform(code, id) {
      const normalized = id.replace(/\\/g, "/");
      let next = code;
      const original = code;

      if (normalized.endsWith("/src/App.tsx")) {
        const roleScopePattern = /  const roleScopedAgentNames = useMemo\(\(\) => \{\n    if \(!currentUser \|\| roleHasAllAgentScope\(currentUser\.role\)\) return \[\];\n    return \[currentUser\.agentName \|\| currentUser\.displayName \|\| currentUser\.username\]\.filter\(Boolean\);\n  \}, \[currentUser\]\);/;
        const adminScopedRoleBlock = `  const roleScopedAgentNames = useMemo(() => {\n    if (!currentUser) return [];\n\n    const normalizeScopeValue = (value: unknown) =>\n      String(value || \"\")\n        .trim()\n        .toLowerCase()\n        .replace(/[-_]+/g, \" \")\n        .replace(/\\s+/g, \" \");\n    const isAdminScopeRole = (value: unknown) => {\n      const roleKey = normalizeScopeValue(value);\n      return (\n        roleKey === \"admin\" ||\n        roleKey.startsWith(\"admin \") ||\n        roleKey.endsWith(\" admin\") ||\n        roleKey.includes(\"admin live chat\")\n      );\n    };\n\n    if (isAdminScopeRole(currentUser.role)) {\n      const currentIdentities = [\n        currentUser.username,\n        currentUser.displayName,\n        currentUser.agentName,\n        currentUser.email,\n      ]\n        .map(normalizeScopeValue)\n        .filter(Boolean);\n      const currentAccount = effectiveUserAccounts.find((account) =>\n        [account.username, account.displayName, account.agentName, account.email]\n          .map(normalizeScopeValue)\n          .filter(Boolean)\n          .some((identity) => currentIdentities.includes(identity))\n      );\n      const currentTeamKey = normalizeScopeValue(currentAccount?.teamName);\n      const selfAgent =\n        currentUser.agentName || currentUser.displayName || currentUser.username;\n\n      if (!currentTeamKey) {\n        return [selfAgent].filter(Boolean);\n      }\n\n      return Array.from(\n        new Set(\n          effectiveUserAccounts\n            .filter((account) => account.status !== \"Suspended\")\n            .filter((account) => normalizeScopeValue(account.teamName) === currentTeamKey)\n            .filter((account) => isAdminScopeRole(account.role))\n            .map((account) => account.agentName || account.displayName || account.username)\n            .filter(Boolean)\n        )\n      );\n    }\n\n    if (roleHasAllAgentScope(currentUser.role)) return [];\n    return [currentUser.agentName || currentUser.displayName || currentUser.username].filter(Boolean);\n  }, [currentUser, effectiveUserAccounts]);`;
        next = next.replace(roleScopePattern, adminScopedRoleBlock);
      }

      if (normalized.endsWith("/src/SummaryMockup.tsx")) {
        const agentScopeAnchor = `  const analyticsCanSelectAllAgents =\n    canViewAllAgents &&\n    !roleScopedAgentList.length;`;
        const adminAgentScope = `  const adminAgentScopeRoleKey = normalizeText(currentUser?.role);\n  const isAdminAgentScopeRole =\n    adminAgentScopeRoleKey === \"admin\" ||\n    adminAgentScopeRoleKey.startsWith(\"admin \") ||\n    adminAgentScopeRoleKey.endsWith(\" admin\") ||\n    adminAgentScopeRoleKey.includes(\"admin live chat\");\n  const analyticsCanSelectAllAgents =\n    canViewAllAgents &&\n    (!roleScopedAgentList.length || isAdminAgentScopeRole);`;
        next = next.replace(agentScopeAnchor, adminAgentScope);

        next = next.replace(
          `  const effectiveSelectedAgent =\n    roleScopedAgentList.length\n      ? roleScopedAgentList[0]\n      : selectedAgent;`,
          `  const effectiveSelectedAgent =\n    roleScopedAgentList.length && !isAdminAgentScopeRole\n      ? roleScopedAgentList[0]\n      : selectedAgent;`
        );

        next = next.replace(
          `    const agentNames = getUniqueNormalizedAgents(\n      [\n        ...periodScopedCases.map((item) => item.agent),`,
          `    const agentNames = getUniqueNormalizedAgents(\n      [\n        ...(isAdminAgentScopeRole ? roleScopedAgentList : []),\n        ...periodScopedCases.map((item) => item.agent),`
        );
        next = next.replace(
          `  }, [\n    periodScopedCases,\n    periodScopedNoCaseEvaluations,\n  ]);`,
          `  }, [\n    periodScopedCases,\n    periodScopedNoCaseEvaluations,\n    isAdminAgentScopeRole,\n    roleScopedAgentList,\n  ]);`
        );

        const statsAnchor = `  const performanceStatusBaseMonthKey = useMemo(() => {`;
        if (next.includes(statsAnchor) && !next.includes("const adminSelectedTeamStats = useMemo")) {
          const statsBlock = `  const adminSelectedTeamPeriodCases = useMemo(() => {\n    if (!isAdminRole || !currentUserTeamName) return [];\n\n    return allCases.filter((item) => {\n      if (\n        normalizeText(getCaseTeamName(item)) !==\n        normalizeText(currentUserTeamName)\n      ) {\n        return false;\n      }\n\n      if (!effectivePeriodKeys.length) return true;\n      if (analysisMode === \"weekly\") {\n        return effectivePeriodKeys.includes(item.weekLabel);\n      }\n      if (analysisMode === \"monthly\") {\n        return effectivePeriodKeys.includes(item.monthKey);\n      }\n      return effectivePeriodKeys.includes(item.yearKey);\n    });\n  }, [\n    isAdminRole,\n    currentUserTeamName,\n    allCases,\n    accountProfiles,\n    effectivePeriodKeys,\n    analysisMode,\n  ]);\n\n  const adminSelectedTeamStats = useMemo(() => {\n    if (!adminSelectedTeamPeriodCases.length) {\n      return { caseCount: 0, avgScore: null as number | null, kpiStatus: \"No Data\" };\n    }\n\n    const teamSummary = summarizeCases(adminSelectedTeamPeriodCases);\n    return {\n      caseCount: teamSummary.caseCount,\n      avgScore: teamSummary.avgScore,\n      kpiStatus:\n        teamSummary.avgScore >= PERFORMANCE_KPI_TARGET ? \"Passed\" : \"Not Passed\",\n    };\n  }, [adminSelectedTeamPeriodCases]);\n\n`;
          next = next.replace(statsAnchor, statsBlock + statsAnchor);
        }

        const currentViewSpan = `<span>{isComparisonMode ? \`Comparing: \${effectivePeriodLabels.join(\" · \")}\` : \`Current view: \${effectivePeriodLabels[0] || \"Current period\"}\`}</span>`;
        const adminTeamSummaryStrip = `{isAdminRole ? (\n                  <div className=\"flex flex-wrap items-center gap-2\">\n                    <span>{isComparisonMode ? \`Comparing: \${effectivePeriodLabels.join(\" · \")}\` : \`Current view: \${effectivePeriodLabels[0] || \"Current period\"}\`}</span>\n                    <span className=\"rounded-full border border-violet-200 bg-white px-2.5 py-1 font-bold text-violet-700\">My Team: {currentUserTeamName || \"Assigned Scope\"}</span>\n                    <span className=\"rounded-full border border-violet-200 bg-white px-2.5 py-1 font-bold text-violet-700\">Team Avg: {adminSelectedTeamStats.avgScore === null ? \"No Data\" : \`\${adminSelectedTeamStats.avgScore.toFixed(2)}%\`}</span>\n                    <span className={\`rounded-full border px-2.5 py-1 font-bold \${adminSelectedTeamStats.kpiStatus === \"Passed\" ? \"border-emerald-200 bg-emerald-50 text-emerald-700\" : adminSelectedTeamStats.kpiStatus === \"Not Passed\" ? \"border-rose-200 bg-rose-50 text-rose-700\" : \"border-slate-200 bg-slate-100 text-slate-600\"}\`}>Team KPI: {adminSelectedTeamStats.kpiStatus}</span>\n                    <span className=\"rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 font-bold text-sky-700\">Team Cases: {adminSelectedTeamStats.caseCount}</span>\n                  </div>\n                ) : (\n                  ${currentViewSpan}\n                )}`;
        next = next.replace(currentViewSpan, adminTeamSummaryStrip);
      }

      if (normalized.endsWith("/src/DashboardMockup.tsx")) {
        const dashboardRoleAnchor = `  const overviewCanSelectAgents =\n    dashboardSubTab === \"overview\" &&\n    canViewAgentsInOverview;`;
        const dashboardRoleBlock = `  const dashboardRoleKey = String(currentUser?.role || \"\")\n    .trim()\n    .toLowerCase()\n    .replace(/[-_]+/g, \" \")\n    .replace(/\\s+/g, \" \");\n  const isAdminDashboardRole =\n    dashboardRoleKey === \"admin\" ||\n    dashboardRoleKey.startsWith(\"admin \") ||\n    dashboardRoleKey.endsWith(\" admin\") ||\n    dashboardRoleKey.includes(\"admin live chat\");\n\n${dashboardRoleAnchor}`;
        next = next.replace(dashboardRoleAnchor, dashboardRoleBlock);

        const externalAgentEffect = `  useEffect(() => {\n    if (\n      !overviewAgentScopeList.length &&\n      typeof externalSelectedAgent === \"string\" &&\n      externalSelectedAgent !== selectedAgent\n    ) {\n      setSelectedAgent(externalSelectedAgent);\n      setSelectedWeek(\"all\");\n      onSelectedWeekChange?.(\"all\");\n      setCaseIdSearch(\"\");\n      setSelectedCaseKey(\"\");\n      setSlideOverOpen(false);\n    }\n  }, [\n    externalSelectedAgent,\n    selectedAgent,\n    overviewAgentScopeList.length,\n    onSelectedWeekChange,\n  ]);`;
        const adminAwareExternalAgentEffect = `  useEffect(() => {\n    const adminScopedExternalAgentAllowed =\n      isAdminDashboardRole &&\n      typeof externalSelectedAgent === \"string\" &&\n      (\n        !String(externalSelectedAgent || \"\").trim() ||\n        overviewAgentScopeList.some((agent) =>\n          isSameAgent(agent, externalSelectedAgent)\n        )\n      );\n\n    if (\n      (!overviewAgentScopeList.length || adminScopedExternalAgentAllowed) &&\n      typeof externalSelectedAgent === \"string\" &&\n      externalSelectedAgent !== selectedAgent\n    ) {\n      setSelectedAgent(externalSelectedAgent);\n      if (\n        isAdminDashboardRole &&\n        typeof externalSelectedWeek === \"string\" &&\n        externalSelectedWeek !== \"all\"\n      ) {\n        setSelectedWeek(externalSelectedWeek);\n      } else {\n        setSelectedWeek(\"all\");\n        onSelectedWeekChange?.(\"all\");\n      }\n      setCaseIdSearch(\"\");\n      setSelectedCaseKey(\"\");\n      setSlideOverOpen(false);\n    }\n  }, [\n    externalSelectedAgent,\n    externalSelectedWeek,\n    selectedAgent,\n    overviewAgentScopeList,\n    onSelectedWeekChange,\n    isAdminDashboardRole,\n  ]);`;
        next = next.replace(externalAgentEffect, adminAwareExternalAgentEffect);

        const invalidWeekEffect = `  useEffect(() => {\n    if (selectedWeek !== \"all\" && !weekLabels.includes(selectedWeek)) {\n      setSelectedWeek(\"all\");\n      onSelectedWeekChange?.(\"all\");\n    }\n  }, [selectedWeek, weekLabels, onSelectedWeekChange]);`;
        const adminAwareWeekEffect = `  useEffect(() => {\n    if (\n      !isAdminDashboardRole &&\n      selectedWeek !== \"all\" &&\n      !weekLabels.includes(selectedWeek)\n    ) {\n      setSelectedWeek(\"all\");\n      onSelectedWeekChange?.(\"all\");\n    }\n  }, [selectedWeek, weekLabels, onSelectedWeekChange, isAdminDashboardRole]);`;
        next = next.replace(invalidWeekEffect, adminAwareWeekEffect);

        const appealCountAnchor = `  const approvedAppealCount = dashboardCases.filter((item) => item.appealStatus === \"Approved\").length;`;
        next = next.replace(
          appealCountAnchor,
          `  const adminWeeklyNoData =\n    isAdminDashboardRole &&\n    selectedWeek !== \"all\" &&\n    metricCaseCount === 0;\n${appealCountAnchor}`
        );

        const performanceItemsAnchor = `  const performanceSummaryItems: PerformanceSummaryItem[] = [`;
        if (next.includes(performanceItemsAnchor) && !next.includes("adminWeeklyNoData) {\n    overviewKpiItemsV93[0]")) {
          const adminNoDataOverride = `  if (adminWeeklyNoData) {\n    overviewKpiItemsV93[0] = {\n      ...overviewKpiItemsV93[0],\n      value: \"—\",\n      note: \`0 case(s) in \${selectedWeek}\`,\n      icon: \"–\",\n      iconTone: \"bg-slate-100 text-slate-500\",\n      valueTone: \"text-slate-400\",\n    };\n    overviewKpiItemsV93[1] = {\n      ...overviewKpiItemsV93[1],\n      value: \"No Data\",\n      note: \`No evaluated cases · KPI Target \${kpiScoreTarget}%\`,\n      icon: \"–\",\n      iconTone: \"bg-slate-100 text-slate-500\",\n      valueTone: \"text-slate-500\",\n    };\n    overviewKpiItemsV93[2] = {\n      ...overviewKpiItemsV93[2],\n      value: \"0\",\n      note: \`0 case(s) evaluated in \${selectedWeek}\`,\n    };\n    overviewKpiItemsV93[3] = {\n      ...overviewKpiItemsV93[3],\n      value: \"0\",\n      note: \"0 Approved · 0 Rejected\",\n      iconTone: \"bg-slate-100 text-slate-500\",\n      valueTone: \"text-slate-600\",\n    };\n    overviewKpiItemsV93[4] = {\n      ...overviewKpiItemsV93[4],\n      value: \"—\",\n      note: \`No evaluated cases in \${selectedWeek}\`,\n      valueTone: \"text-slate-500\",\n    };\n  }\n\n`;
          next = next.replace(performanceItemsAnchor, adminNoDataOverride + performanceItemsAnchor);
        }

        const gradeGuideAnchor = `  const gradeGuideRows = getGradeGuideRows(effectiveViewMonthKey);`;
        if (next.includes(gradeGuideAnchor) && !next.includes("performanceSummaryItems[0] = {")) {
          const lowerSummaryOverride = `  if (adminWeeklyNoData) {\n    performanceSummaryItems[0] = {\n      ...performanceSummaryItems[0],\n      value: \"—\",\n      sub: \`0 case(s) in \${selectedWeek}\`,\n      valueClassName: \"text-slate-500\",\n    };\n    performanceSummaryItems[1] = {\n      ...performanceSummaryItems[1],\n      value: \"No Data\",\n      sub: \`No evaluated cases in \${selectedWeek}\`,\n      valueClassName: \"text-slate-500\",\n    };\n    performanceSummaryItems[2] = {\n      ...performanceSummaryItems[2],\n      value: \"0\",\n      sub: \`No evaluated cases in \${selectedWeek}\`,\n      valueClassName: \"text-slate-500\",\n    };\n    performanceSummaryItems[3] = {\n      ...performanceSummaryItems[3],\n      value: \"No Data\",\n      sub: \`No evaluated cases · KPI Target \${kpiScoreTarget}%\`,\n      valueClassName: \"text-slate-500\",\n      state: \"no-data\",\n    };\n  }\n\n`;
          next = next.replace(gradeGuideAnchor, lowerSummaryOverride + gradeGuideAnchor);
        }
      }

      return next === original ? null : { code: next, map: null };
    },
  };
}
