export function reportProfileLayoutPatch() {
  return {
    name: "report-profile-layout",
    enforce: "pre",
    transform(code, id) {
      const path = id.replace(/\\\\/g, "/").split("?")[0];
      let next = code;
      const replace = (from, to) => {
        if (!next.includes(from)) this.error("Report/profile layout anchor missing: " + from.slice(0, 90));
        next = next.replace(from, to);
      };
      if (path.endsWith("/src/App.tsx")) {
        const start = next.indexOf('{!globalSidebarCollapsed ? <div className="qa-sidebar-label min-w-0 flex-1"><div className="truncate text-[15px] font-semibold">{welcomeName}');
        const end = next.indexOf('</div> : null}', next.indexOf('{workspaceWorkSim}</span>', start)) + '</div> : null}'.length;
        // Include the outer details wrapper after the conditional SIM row.
        const outerEnd = next.indexOf('</div> : null}', end) + '</div> : null}'.length;
        if (start < 0 || end < start || outerEnd < end) this.error("Sidebar details block missing");
        next = next.slice(0, start) + `{!globalSidebarCollapsed ? <SidebarProfileDetails name={welcomeName} adminName={workspaceAdminName} role={currentUser.role} team={workspaceTeamName} workSim={workspaceWorkSim} version={shortBuildHash || (buildMeta.commitHash ? buildMeta.commitHash.slice(0, 7) : "pending")} /> : null}` + next.slice(outerEnd);
        replace('className={`flex items-center ${globalSidebarCollapsed ? "justify-center" : "gap-3 pb-4"}`}', 'className={`flex ${globalSidebarCollapsed ? "items-center justify-center" : "flex-col items-start gap-7 pb-1"}`}');
        next = 'import SidebarProfileDetails from "./SidebarProfileDetails";\n' + next;
      }
      if (path.endsWith("/src/SummaryMockup.tsx")) {
        replace('if (isComparisonMode && topicDifferenceGroups.length) {\n      startNewPage();', 'if (isComparisonMode && topicDifferenceGroups.length) {\n      ensureSpace(80);');
        replace('if (managementScoreDriverReports.length) {\n        startNewPage();', 'if (managementScoreDriverReports.length) {\n        ensureSpace(65);');
        replace('if (scoreDriverReports.length) {\n        startNewPage();', 'if (scoreDriverReports.length) {\n        ensureSpace(65);');
        replace('if (reportIndex > 0 || y > 145) {\n        startNewPage();\n      }', 'ensureSpace(90);');
        replace('if (isComparisonMode) {\n      startNewPage();\n      drawSectionTitle(\n        "Performance Comparison Analytics",', 'if (isComparisonMode) {\n      ensureSpace(85);\n      drawSectionTitle(\n        "Performance Comparison Analytics",');
        replace('    drawSectionTitle(\n      "Summary Table",', '    ensureSpace(28 + Math.min(comparisonRowsWithDelta.length, 12) * 9);\n    drawSectionTitle(\n      "Summary Table",');
        replace('      const lowerCardHeight = 66;', '      const lowerCardHeight = 66;\n      ensureSpace(lowerCardHeight + 10);');
        replace('      ensureSpace(subtitle ? 18 : 12);', '      if (y > 43) y += 5;\n      ensureSpace(subtitle ? 24 : 18);');
      }
      return next === code ? null : { code: next, map: null };
    },
  };
}
