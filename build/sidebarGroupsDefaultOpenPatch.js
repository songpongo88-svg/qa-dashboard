export function sidebarGroupsDefaultOpenPatch() {
  return {
    name: "sidebar-groups-default-open",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/src/App.tsx")) return null;

      const target = `  const [sidebarGroupsOpen, setSidebarGroupsOpen] = useState<Record<string, boolean>>(() => {\n    const defaults = { performance: true, qa: false, appeals: false, quality: false, tools: false, workspace: false, admin: false, system: false, account: false };\n    try {\n      const stored = JSON.parse(window.sessionStorage.getItem(SIDEBAR_GROUPS_SESSION_STORAGE_KEY) || "{}");\n      return { ...defaults, ...(stored && typeof stored === "object" ? stored : {}) };\n    } catch {\n      return defaults;\n    }\n  });`;

      const replacement = `  const [sidebarGroupsOpen, setSidebarGroupsOpen] = useState<Record<string, boolean>>(() => ({\n    performance: true,\n    qa: true,\n    appeals: true,\n    quality: true,\n    tools: true,\n    workspace: true,\n    admin: true,\n    system: true,\n    account: true,\n  }));`;

      if (!code.includes(target)) {
        throw new Error("Sidebar default-open patch target not found");
      }

      return { code: code.replace(target, replacement), map: null };
    },
  };
}
