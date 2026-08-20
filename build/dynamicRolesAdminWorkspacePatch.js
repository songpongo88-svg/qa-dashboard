function replaceOrThrow(context, code, search, replacement, label) {
  if (!code.includes(search)) {
    context.error(`Dynamic roles/admin workspace patch could not find ${label}.`);
  }
  return code.replace(search, replacement);
}

export function dynamicRolesAdminWorkspacePatch() {
  const patched = {
    app: false,
    userAdmin: false,
    corporateProfile: false,
    roleStore: false,
  };

  return {
    name: "dynamic-roles-admin-workspaces",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      let next = code;

      if (cleanId.endsWith("/src/userRoleStore.ts")) {
        next = replaceOrThrow(
          this,
          next,
          `  if (normalized === "quality assurance" || normalized === "qa") return "Quality Assurance";\n  return roleName;`,
          `  if (normalized === "quality assurance" || normalized === "qa") return "Quality Assurance";\n  if (\n    normalized === "head of operation and customer fulfillment" ||\n    normalized === "department head"\n  ) return "Department Head";\n  return roleName;`,
          "Department Head role normalization"
        );
        patched.roleStore = true;
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/CorporateUserDirectoryProfile.tsx")) {
        next = replaceOrThrow(
          this,
          next,
          `  rolePermissions: Record<string, Record<string, boolean>>;\n  statusView: DirectoryStatusView;`,
          `  rolePermissions: Record<string, Record<string, boolean>>;\n  roleOptions: string[];\n  statusView: DirectoryStatusView;`,
          "corporate roleOptions prop type"
        );

        next = replaceOrThrow(
          this,
          next,
          `  canManageTeams,\n  rolePermissions,\n  statusView,`,
          `  canManageTeams,\n  rolePermissions,\n  roleOptions,\n  statusView,`,
          "corporate roleOptions destructure"
        );

        next = replaceOrThrow(
          this,
          next,
          `  const roles = useMemo(\n    () =>\n      Array.from(\n        new Set(\n          rows\n            .map(\n              (row) =>\n                row.effectiveRole\n            )\n            .filter(Boolean)\n        )\n      ).sort((a, b) =>\n        a.localeCompare(b)\n      ),\n    [rows]\n  );`,
          `  const roles = useMemo(\n    () =>\n      Array.from(\n        new Set(\n          roleOptions\n            .map((role) => String(role || "").trim())\n            .filter(Boolean)\n        )\n      ).sort((a, b) => a.localeCompare(b)),\n    [roleOptions]\n  );`,
          "corporate active role source"
        );

        next = replaceOrThrow(
          this,
          next,
          `  const accountOptions = roles.map((role) => ({ value: role, label: role }));`,
          `  const accountOptions = Array.from(\n    new Set([\n      ...roles,\n      String(account?.role || "").trim(),\n    ].filter(Boolean))\n  )\n    .sort((a, b) => a.localeCompare(b))\n    .map((role) => ({ value: role, label: role }));`,
          "corporate role dropdown options"
        );

        patched.corporateProfile = true;
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/UserRoleAdminMockup.tsx")) {
        next = replaceOrThrow(
          this,
          next,
          `  rolePermissions: RolePermissionMap;\n  statusView: DirectoryTab;`,
          `  rolePermissions: RolePermissionMap;\n  roleOptions: UserRole[];\n  statusView: DirectoryTab;`,
          "directory wrapper roleOptions prop type"
        );

        next = replaceOrThrow(
          this,
          next,
          `  canManageTeams,\n  rolePermissions,\n  statusView,`,
          `  canManageTeams,\n  rolePermissions,\n  roleOptions,\n  statusView,`,
          "directory wrapper roleOptions destructure"
        );

        next = replaceOrThrow(
          this,
          next,
          `      rolePermissions={rolePermissions}\n      statusView={statusView}`,
          `      rolePermissions={rolePermissions}\n      roleOptions={roleOptions}\n      statusView={statusView}`,
          "corporate profile roleOptions pass-through"
        );

        next = replaceOrThrow(
          this,
          next,
          `                rolePermissions={rolePermissions}\n                statusView={directoryTab}`,
          `                rolePermissions={rolePermissions}\n                roleOptions={activeRoleOptions}\n                statusView={directoryTab}`,
          "active roles into directory wrapper"
        );

        patched.userAdmin = true;
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/App.tsx")) {
        next = replaceOrThrow(
          this,
          next,
          `  | "usage-log"\n  | "user-roles";`,
          `  | "usage-log"\n  | "admin-users"\n  | "admin-roles"\n  | "user-roles";`,
          "AppTab admin workspace keys"
        );

        next = replaceOrThrow(
          this,
          next,
          `  "usage-log",\n  "user-roles",\n]);`,
          `  "usage-log",\n  "admin-users",\n  "admin-roles",\n  "user-roles",\n]);`,
          "valid admin workspace tabs"
        );

        next = replaceOrThrow(
          this,
          next,
          `  "usage-log": "Login Log",\n  "user-roles": "Administration",`,
          `  "usage-log": "Login Log",\n  "admin-users": "Users",\n  "admin-roles": "Roles & Permissions",\n  "user-roles": "System Setup",`,
          "admin workspace labels"
        );

        next = replaceOrThrow(
          this,
          next,
          `    if (tab === "user-roles" && !roleAdminAllowed) return "missing user role admin permission";`,
          `    if (tab === "admin-users" && !userDirectoryAllowed) return "missing user directory permission";\n    if (tab === "admin-roles" && !roleManagementAllowed) return "missing manageRoles permission";\n    if (tab === "user-roles" && !roleAdminAllowed) return "missing user role admin permission";`,
          "admin workspace access checks"
        );

        next = replaceOrThrow(
          this,
          next,
          `    if (tab === "user-roles") {\n      setUserAdminSection(normalizeUserAdminSection(params.get("adminSection")));\n      return;\n    }`,
          `    if (tab === "admin-users") {\n      setUserAdminSection("users");\n      return;\n    }\n\n    if (tab === "admin-roles") {\n      setUserAdminSection("roles");\n      return;\n    }\n\n    if (tab === "user-roles") {\n      setUserAdminSection(normalizeUserAdminSection(params.get("adminSection")));\n      return;\n    }`,
          "admin workspace URL restore"
        );

        next = replaceOrThrow(
          this,
          next,
          `    if (activeTab === "user-roles" && !roleAdminAllowed) {\n      navigateToTab("dashboard", { replace: true });\n    }`,
          `    if (activeTab === "admin-users" && !userDirectoryAllowed) {\n      navigateToTab("dashboard", { replace: true });\n    }\n    if (activeTab === "admin-roles" && !roleManagementAllowed) {\n      navigateToTab("dashboard", { replace: true });\n    }\n    if (activeTab === "user-roles" && !roleAdminAllowed) {\n      navigateToTab("dashboard", { replace: true });\n    }`,
          "admin workspace permission redirect"
        );

        next = replaceOrThrow(
          this,
          next,
          `  const openUserAdminSection = (section: UserAdminSection) => {\n    setUserAdminSection(section);\n    navigateToTab("user-roles", { params: { adminSection: section } });\n  };`,
          `  const openUserAdminSection = (section: UserAdminSection) => {\n    setUserAdminSection(section);\n\n    if (section === "users") {\n      navigateToTab("admin-users");\n      return;\n    }\n\n    if (section === "roles") {\n      navigateToTab("admin-roles");\n      return;\n    }\n\n    navigateToTab("user-roles", { params: { adminSection: "maintenance" } });\n  };`,
          "separate admin workspace navigation"
        );

        next = replaceOrThrow(
          this,
          next,
          `active: activeWorkspaceTab === "user-roles" && userAdminSection === "users", onClick: () => openUserAdminSection("users")`,
          `active: activeWorkspaceTab === "admin-users", onClick: () => openUserAdminSection("users")`,
          "Users sidebar active state"
        );

        next = replaceOrThrow(
          this,
          next,
          `active: activeWorkspaceTab === "user-roles" && userAdminSection === "roles", onClick: () => openUserAdminSection("roles")`,
          `active: activeWorkspaceTab === "admin-roles", onClick: () => openUserAdminSection("roles")`,
          "Roles sidebar active state"
        );

        next = replaceOrThrow(
          this,
          next,
          `        ) : activeTab === "user-roles" && roleAdminAllowed ? (\n          <UserRoleAdminMockup\n            initialTab={userAdminSection}`,
          `        ) : (\n          (activeTab === "admin-users" && userDirectoryAllowed) ||\n          (activeTab === "admin-roles" && roleManagementAllowed) ||\n          (activeTab === "user-roles" && roleAdminAllowed)\n        ) ? (\n          <UserRoleAdminMockup\n            initialTab={\n              activeTab === "admin-users"\n                ? "users"\n                : activeTab === "admin-roles"\n                  ? "roles"\n                  : userAdminSection\n            }`,
          "separate admin workspace renderer"
        );

        patched.app = true;
        return { code: next, map: null };
      }

      return null;
    },

    buildEnd(error) {
      if (error) return;
      const missing = Object.entries(patched)
        .filter(([, value]) => !value)
        .map(([key]) => key);
      if (missing.length) {
        this.error(`Dynamic roles/admin workspace patch was not applied to: ${missing.join(", ")}.`);
      }
    },
  };
}
