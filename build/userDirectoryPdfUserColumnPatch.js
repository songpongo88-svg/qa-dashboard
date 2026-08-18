export function userDirectoryPdfUserColumnPatch() {
  let patched = false;

  return {
    name: "user-directory-pdf-user-column",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      if (!cleanId.endsWith("/src/UserRoleAdminMockup.tsx")) return null;

      const oldBlock = `      drawTable(\n        ["User", "Email", "Team", "Role", "Status"],\n        [58, 82, 58, 48, 30],\n        visibleRows.map((row) => [\n          row.displayName || row.username,\n          row.email || "-",\n          row.teamName || "-",\n          row.effectiveRole,\n          row.status,\n        ])\n      );`;

      const newBlock = `      drawTable(\n        ["User", "User Name", "Email", "Team", "Role", "Status"],\n        [32, 55, 72, 50, 38, 22],\n        visibleRows.map((row) => [\n          row.username,\n          row.displayName || row.agentName || row.username,\n          row.email || "-",\n          row.teamName || "-",\n          row.effectiveRole,\n          row.status,\n        ])\n      );`;

      if (!code.includes(oldBlock)) {
        this.error("User Directory PDF column patch could not find the current table block.");
      }

      patched = true;
      return { code: code.replace(oldBlock, newBlock), map: null };
    },

    buildEnd(error) {
      if (error) return;
      if (!patched) {
        this.error("User Directory PDF column patch was not applied to UserRoleAdminMockup.tsx.");
      }
    },
  };
}
