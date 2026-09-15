export function profilePhotoRankingPatch() {
  return {
    name: "profile-photo-ranking",
    enforce: "pre",
    transform(code, id) {
      const normalized = id.replace(/\\/g, "/");
      let next = code;
      const original = code;

      if (normalized.endsWith("/src/SummaryMockup.tsx")) {
        next = next.replace(
          'import PageHero from "./PageHero";',
          'import PageHero from "./PageHero";\nimport { fetchStoredProfilePhoto } from "./profilePhotoStore";'
        );

        next = next.replace(
          '  const [agentSortTab, setAgentSortTab] = useState<\n    "ranking" | "alphabetical"\n  >(() =>\n    window.sessionStorage.getItem("qa_analytics_agent_sort_tab_v134") === "alphabetical"\n      ? "alphabetical"\n      : "ranking"\n  );\n\n  useEffect(() => {',
          '  const [agentSortTab, setAgentSortTab] = useState<\n    "ranking" | "alphabetical"\n  >(() =>\n    window.sessionStorage.getItem("qa_analytics_agent_sort_tab_v134") === "alphabetical"\n      ? "alphabetical"\n      : "ranking"\n  );\n  const [agentProfilePhotos, setAgentProfilePhotos] = useState<Record<string, string>>({});\n\n  useEffect(() => {'
        );

        next = next.replace(
          '          displayName,\n          initials,',
          '          displayName,\n          username: String(profile?.username || "").trim(),\n          initials,'
        );

        const allAgentsAnchor = '  const allAgentsMode = selectedAgent === "all";';
        if (next.includes(allAgentsAnchor) && !next.includes('const handleProfilePhotoUpdated = (event: Event) =>')) {
          const photoEffect = `  useEffect(() => {\n    let cancelled = false;\n    const usernames = Array.from(\n      new Set(\n        rows\n          .map((row) => String(row.username || \"\").trim())\n          .filter(Boolean)\n      )\n    );\n\n    const refreshPhoto = async (username: string) => {\n      const photo = await fetchStoredProfilePhoto(username);\n      if (cancelled) return;\n      setAgentProfilePhotos((current) => ({\n        ...current,\n        [username.toLowerCase()]: String(photo?.photoDataUrl || \"\"),\n      }));\n    };\n\n    void Promise.all(usernames.map((username) => refreshPhoto(username)));\n\n    const handleProfilePhotoUpdated = (event: Event) => {\n      const username = String(\n        (event as CustomEvent<{ username?: string }>).detail?.username || \"\"\n      ).trim();\n      if (!username) return;\n      if (!usernames.some((item) => item.toLowerCase() === username.toLowerCase())) return;\n      void refreshPhoto(username);\n    };\n\n    window.addEventListener(\"qa-profile-photo-updated\", handleProfilePhotoUpdated as EventListener);\n    return () => {\n      cancelled = true;\n      window.removeEventListener(\"qa-profile-photo-updated\", handleProfilePhotoUpdated as EventListener);\n    };\n  }, [rows]);\n\n`;
          next = next.replace(allAgentsAnchor, photoEffect + allAgentsAnchor);
        }

        next = next.replace(
          '<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-semibold text-violet-700">\n                        {row.initials}\n                      </span>',
          '<span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-violet-100 text-[10px] font-semibold text-violet-700">\n                        {row.username && agentProfilePhotos[String(row.username).toLowerCase()] ? (\n                          <img\n                            src={agentProfilePhotos[String(row.username).toLowerCase()]}\n                            alt={`${row.displayName || row.agent} profile`}\n                            className="h-full w-full object-cover"\n                          />\n                        ) : (\n                          row.initials\n                        )}\n                      </span>'
        );
      }

      if (normalized.endsWith("/src/App.tsx")) {
        const oldProfileBlock = `<div className="relative shrink-0">\n                <button type="button" onClick={() => profilePhotoInputRef.current?.click()} disabled={workspaceProfilePhotoUploading} className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[18px] border border-white/30 bg-white/15 text-base font-semibold shadow-[0_8px_20px_rgba(30,14,75,0.18)]" aria-label={"Profile. Deploy Version " + (shortBuildHash || (buildMeta.commitHash ? buildMeta.commitHash.slice(0, 7) : "pending"))}>\n                  {workspaceProfilePhoto ? <img src={workspaceProfilePhoto} alt={welcomeName ? welcomeName + " profile photo" : "Profile photo"} className="h-full w-full object-cover" /> : <span>{workspaceInitials}</span>}\n                </button>\n                <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-violet-900 bg-emerald-400" aria-hidden="true" />\n              </div>`;

        const newProfileBlock = `<div className="flex shrink-0 flex-col items-center gap-1">\n                <div className="relative">\n                  <button type="button" onClick={() => profilePhotoInputRef.current?.click()} disabled={workspaceProfilePhotoUploading} className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[18px] border border-white/30 bg-white/15 text-base font-semibold shadow-[0_8px_20px_rgba(30,14,75,0.18)]" title="Change Profile Photo" aria-label={"Change Profile Photo. Deploy Version " + (shortBuildHash || (buildMeta.commitHash ? buildMeta.commitHash.slice(0, 7) : "pending"))}>\n                    {workspaceProfilePhoto ? <img src={workspaceProfilePhoto} alt={welcomeName ? welcomeName + " profile photo" : "Profile photo"} className="h-full w-full object-cover" /> : <span>{workspaceInitials}</span>}\n                  </button>\n                  <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-violet-900 bg-emerald-400" aria-hidden="true" />\n                </div>\n                {!globalSidebarCollapsed ? <button type="button" onClick={() => profilePhotoInputRef.current?.click()} disabled={workspaceProfilePhotoUploading} className="whitespace-nowrap rounded-md border border-white/25 bg-white/10 px-2 py-0.5 text-[8px] font-medium leading-4 text-violet-100 transition hover:bg-white/20 hover:text-white disabled:cursor-wait disabled:opacity-60">{workspaceProfilePhotoUploading ? "Uploading..." : "Change Photo"}</button> : null}\n              </div>`;

        next = next.replace(oldProfileBlock, newProfileBlock);
      }

      return next === original ? null : { code: next, map: null };
    },
  };
}
