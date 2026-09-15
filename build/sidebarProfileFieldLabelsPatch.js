export function sidebarProfileFieldLabelsPatch() {
  return {
    name: "sidebar-profile-field-labels",
    enforce: "pre",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/src/App.tsx")) return null;

      let next = code;
      const original = code;

      next = next.replace(
        `{workspaceAdminName ? <div className="mt-0.5 truncate text-[10px] font-semibold text-violet-100">{workspaceAdminName}</div> : null}`,
        `{workspaceAdminName ? <div className="mt-0.5 truncate text-[10px]"><span className="font-normal text-violet-300">Admin Name:</span> <span className="font-semibold text-white">{workspaceAdminName}</span></div> : null}`
      );

      next = next.replace(
        `<div className="mt-0.5 truncate text-[10px] font-normal text-violet-200">{currentUser.role}</div>`,
        `{String(currentUser.role || "").trim() ? <div className="mt-0.5 truncate text-[10px]"><span className="font-normal text-violet-300">Role:</span> <span className="font-semibold text-white">{currentUser.role}</span></div> : null}`
      );

      next = next.replace(
        `<div className="truncate text-[10px] font-normal text-violet-300">{workspaceTeamName}</div>`,
        `{workspaceTeamName && workspaceTeamName !== "-" ? <div className="truncate text-[10px]"><span className="font-normal text-violet-300">Team:</span> <span className="font-semibold text-white">{workspaceTeamName}</span></div> : null}`
      );

      next = next.replace(
        `<span className="shrink-0 text-violet-300">Work SIM</span><span className="truncate font-medium text-white">{workspaceWorkSim}</span>`,
        `<span className="shrink-0 text-violet-300">Work SIM:</span><span className="truncate font-semibold text-white">{workspaceWorkSim}</span>`
      );

      return next === original ? null : { code: next, map: null };
    },
  };
}
