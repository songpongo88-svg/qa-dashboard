export function sidebarGroupsDefaultOpenPatch() {
  return {
    name: "sidebar-groups-default-open",
    enforce: "pre",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/src/App.tsx")) return null;

      const pattern = /  const \[sidebarGroupsOpen, setSidebarGroupsOpen\] = useState<Record<string, boolean>>\(\(\) => \{[\s\S]*?\n  \}\);/;
      const replacement = `  const [sidebarGroupsOpen, setSidebarGroupsOpen] = useState<Record<string, boolean>>(() => ({\n    performance: true,\n    qa: true,\n    appeals: true,\n    quality: true,\n    tools: true,\n    workspace: true,\n    admin: true,\n    system: true,\n    account: true,\n  }));`;

      if (!pattern.test(code)) return null;
      return { code: code.replace(pattern, replacement), map: null };
    },
  };
}
