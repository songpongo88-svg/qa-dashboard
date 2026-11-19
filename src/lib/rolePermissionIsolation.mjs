// Pure permission utilities: never write untouched roles or replace unrelated cache rows.
export function buildRolePermissionPatches(roleNames, drafts, savedPermissions, permissionKeys, getDefaults, normalizeRoleName) {
  const changes = [];
  for (const rawName of roleNames) {
    const roleName = normalizeRoleName(rawName);
    if (!roleName) continue;
    const saved = {
      ...getDefaults(roleName),
      ...(savedPermissions[rawName] || {}),
      ...(savedPermissions[roleName] || {}),
    };
    const next = {
      ...saved,
      ...(drafts[rawName] || {}),
      ...(drafts[roleName] || {}),
    };
    if (roleName === "Quality Assurance") {
      next.viewUserDirectory = true;
      next.viewAllTeams = true;
      next.viewOwnTeam = true;
      next.qaEvaluationTarget = false;
      next.manageUsers = true;
      next.manageTeams = true;
      next.manageRoles = true;
      next.manageMaintenance = true;
    }
    if (next.manageUsers) next.viewUserDirectory = true;
    if (next.manageTeams) {
      next.viewUserDirectory = true;
      next.viewAllTeams = true;
      next.viewOwnTeam = true;
    }
    const permissions = {};
    for (const key of permissionKeys) {
      if (Boolean(next[key]) !== Boolean(saved[key])) permissions[key] = Boolean(next[key]);
    }
    if (Object.keys(permissions).length) {
      changes.push({ roleName, permissions, auditPermissions: next });
    }
  }
  return changes;
}

export function mergeCachedRolePermissionRows(cachedRows, changedRows, normalizeRoleName) {
  const merged = new Map();
  for (const row of cachedRows) {
    const roleName = normalizeRoleName(row.roleName);
    if (roleName) merged.set(roleName.toLowerCase(), { ...row, roleName });
  }
  for (const row of changedRows) {
    const roleName = normalizeRoleName(row.roleName);
    if (!roleName) continue;
    const prior = merged.get(roleName.toLowerCase());
    merged.set(roleName.toLowerCase(), {
      ...(prior || {}),
      ...row,
      roleName,
      permissions: {
        ...(prior?.permissions || {}),
        ...(row.permissions || {}),
      },
    });
  }
  return [...merged.values()];
}
