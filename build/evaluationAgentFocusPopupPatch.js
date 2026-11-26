export function evaluationAgentFocusPopupPatch() {
  let patched = false;

  return {
    name: "evaluation-agent-focus-popup",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      if (!cleanId.endsWith("/src/CreateEvaluationMockup.tsx")) return null;

      let next = code;

      const importAnchor = 'import PageHero from "./PageHero";';
      if (!next.includes(importAnchor)) {
        this.error("Agent focus popup patch could not find PageHero import.");
      }
      if (!next.includes('from "./profilePhotoStore"')) {
        next = next.replace(
          importAnchor,
          `${importAnchor}\nimport { fetchStoredProfilePhoto } from "./profilePhotoStore";`
        );
      }

      const stateAnchor = '  const stickyNoteOwner = currentUser?.username || currentUser?.email || "anonymous";';
      if (!next.includes(stateAnchor)) {
        this.error("Agent focus popup patch could not find component state anchor.");
      }
      next = next.replace(
        stateAnchor,
        `${stateAnchor}\n  const [selectedAgentProfilePhoto, setSelectedAgentProfilePhoto] = useState("");`
      );

      const selectedAgentPattern = /(  const selectedAgentOption = useMemo\([\s\S]*?\n  \);)\n  const selectedMonthKey/;
      if (!selectedAgentPattern.test(next)) {
        this.error("Agent focus popup patch could not find selectedAgentOption block.");
      }
      next = next.replace(
        selectedAgentPattern,
        `$1\n  const selectedAgentInitials = useMemo(() => {\n    const source = String(selectedAgentOption?.agentName || selectedAgentOption?.displayName || agentName || "").trim();\n    const parts = source.split(/\\s+/).filter(Boolean);\n    if (!parts.length) return "AG";\n    return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");\n  }, [agentName, selectedAgentOption]);\n\n  useEffect(() => {\n    let cancelled = false;\n    const username = String(selectedAgentOption?.username || "").trim();\n    setSelectedAgentProfilePhoto("");\n\n    if (!username) {\n      return () => {\n        cancelled = true;\n      };\n    }\n\n    const loadProfilePhoto = async () => {\n      const storedPhoto = await fetchStoredProfilePhoto(username);\n      if (!cancelled) setSelectedAgentProfilePhoto(storedPhoto?.photoDataUrl || "");\n    };\n\n    void loadProfilePhoto();\n\n    const handleProfilePhotoUpdated = (event: Event) => {\n      const detail = (event as CustomEvent<{ username?: string }>).detail;\n      const updatedUsername = String(detail?.username || "").trim().toLowerCase();\n      if (updatedUsername && updatedUsername === username.toLowerCase()) void loadProfilePhoto();\n    };\n\n    window.addEventListener("qa-profile-photo-updated", handleProfilePhotoUpdated);\n    return () => {\n      cancelled = true;\n      window.removeEventListener("qa-profile-photo-updated", handleProfilePhotoUpdated);\n    };\n  }, [selectedAgentOption?.username]);\n\n  const selectedMonthKey`
      );

      const statusAnchor = `                  ) : (\n                    <span className="mt-2 block text-xs font-semibold text-slate-500">\n                      เลือก Agent เพื่อดูจำนวนเคสที่ประเมินแล้วในเดือนนี้\n                    </span>\n                  )}\n                </label>`;
      if (!next.includes(statusAnchor)) {
        this.error("Agent focus popup patch could not find Agent quota status block.");
      }

      const focusUi = `                  ) : (\n                    <span className="mt-2 block text-xs font-semibold text-slate-500">\n                      เลือก Agent เพื่อดูจำนวนเคสที่ประเมินแล้วในเดือนนี้\n                    </span>\n                  )}\n\n                  {selectedAgentOption ? (\n                    <div className="mt-2 flex min-w-0 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-2.5 py-2 shadow-sm">\n                      <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full border border-emerald-200 bg-white">\n                        {selectedAgentProfilePhoto ? (\n                          <img\n                            src={selectedAgentProfilePhoto}\n                            alt={(selectedAgentOption.agentName || selectedAgentOption.displayName) + " profile"}\n                            className="h-full w-full object-cover"\n                          />\n                        ) : (\n                          <span className="flex h-full w-full items-center justify-center text-[10px] font-black text-emerald-700">\n                            {selectedAgentInitials}\n                          </span>\n                        )}\n                        <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border border-white bg-emerald-500" aria-hidden="true" />\n                      </div>\n                      <div className="min-w-0 flex-1">\n                        <div className="flex min-w-0 items-center gap-2">\n                          <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700">Current Evaluation</span>\n                          <span className="h-3 w-px shrink-0 bg-emerald-200" aria-hidden="true" />\n                          <span className="truncate text-[11px] font-extrabold text-slate-800">\n                            {selectedAgentOption.agentName || selectedAgentOption.displayName}\n                            {selectedAgentOption.role ? " · " + selectedAgentOption.role : ""}\n                          </span>\n                        </div>\n                      </div>\n                    </div>\n                  ) : null}\n                </label>`;

      next = next.replace(statusAnchor, focusUi);

      if (next === code) {
        this.error("Agent focus popup patch made no change.");
      }

      patched = true;
      return { code: next, map: null };
    },

    buildEnd(error) {
      if (!error && !patched) {
        this.error("Agent focus popup patch was not applied during build.");
      }
    },
  };
}
