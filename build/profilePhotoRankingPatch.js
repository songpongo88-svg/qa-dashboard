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
        next = next.replace(
          'className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[18px] border border-white/30 bg-white/15 text-base font-semibold shadow-[0_8px_20px_rgba(30,14,75,0.18)]" aria-label={"Profile. Deploy Version " + (shortBuildHash || (buildMeta.commitHash ? buildMeta.commitHash.slice(0, 7) : "pending"))}',
          'className="group relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-[18px] border border-white/30 bg-white/15 text-base font-semibold shadow-[0_8px_20px_rgba(30,14,75,0.18)]" title="Change Profile Photo" aria-label={"Change Profile Photo. Deploy Version " + (shortBuildHash || (buildMeta.commitHash ? buildMeta.commitHash.slice(0, 7) : "pending"))}'
        );

        next = next.replace(
          '{workspaceProfilePhoto ? <img src={workspaceProfilePhoto} alt={welcomeName ? welcomeName + " profile photo" : "Profile photo"} className="h-full w-full object-cover" /> : <span>{workspaceInitials}</span>}',
          '{workspaceProfilePhoto ? <img src={workspaceProfilePhoto} alt={welcomeName ? welcomeName + " profile photo" : "Profile photo"} className="h-full w-full object-cover" /> : <span>{workspaceInitials}</span>}<span className="pointer-events-none absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border border-white/80 bg-slate-950/70 text-white shadow-sm transition group-hover:scale-110" aria-hidden="true"><svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4l1.5 2H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l1.5-2z"/><circle cx="12" cy="12.5" r="3.5"/></svg></span>'
        );
      }

      return next === original ? null : { code: next, map: null };
    },
  };
}
