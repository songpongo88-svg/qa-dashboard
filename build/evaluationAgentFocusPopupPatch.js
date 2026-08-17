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
        `${stateAnchor}\n  const [selectedAgentProfilePhoto, setSelectedAgentProfilePhoto] = useState("");\n  const [agentFocusPopupOpen, setAgentFocusPopupOpen] = useState(false);\n  const agentFocusPopupTimerRef = useRef<number | null>(null);`
      );

      const selectedAgentPattern = /(  const selectedAgentOption = useMemo\([\s\S]*?\n  \);)\n  const selectedMonthKey/;
      if (!selectedAgentPattern.test(next)) {
        this.error("Agent focus popup patch could not find selectedAgentOption block.");
      }
      next = next.replace(
        selectedAgentPattern,
        `$1\n  const selectedAgentInitials = useMemo(() => {\n    const source = String(selectedAgentOption?.agentName || selectedAgentOption?.displayName || agentName || "").trim();\n    const parts = source.split(/\\s+/).filter(Boolean);\n    if (!parts.length) return "AG";\n    return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");\n  }, [agentName, selectedAgentOption]);\n\n  useEffect(() => {\n    let cancelled = false;\n    const username = String(selectedAgentOption?.username || "").trim();\n    setSelectedAgentProfilePhoto("");\n\n    if (!username) {\n      return () => {\n        cancelled = true;\n      };\n    }\n\n    const loadProfilePhoto = async () => {\n      const storedPhoto = await fetchStoredProfilePhoto(username);\n      if (!cancelled) setSelectedAgentProfilePhoto(storedPhoto?.photoDataUrl || "");\n    };\n\n    void loadProfilePhoto();\n\n    const handleProfilePhotoUpdated = (event: Event) => {\n      const detail = (event as CustomEvent<{ username?: string }>).detail;\n      const updatedUsername = String(detail?.username || "").trim().toLowerCase();\n      if (updatedUsername && updatedUsername === username.toLowerCase()) void loadProfilePhoto();\n    };\n\n    window.addEventListener("qa-profile-photo-updated", handleProfilePhotoUpdated);\n    return () => {\n      cancelled = true;\n      window.removeEventListener("qa-profile-photo-updated", handleProfilePhotoUpdated);\n    };\n  }, [selectedAgentOption?.username]);\n\n  useEffect(() => {\n    return () => {\n      if (agentFocusPopupTimerRef.current !== null) {\n        window.clearTimeout(agentFocusPopupTimerRef.current);\n      }\n    };\n  }, []);\n\n  const selectedMonthKey`
      );

      const selectAnchor = '<select value={agentName} onChange={(event) => setAgentName(event.target.value)} className={inputClass}>';
      if (!next.includes(selectAnchor)) {
        this.error("Agent focus popup patch could not find Agent dropdown.");
      }
      next = next.replace(
        selectAnchor,
        `<select\n                    value={agentName}\n                    onChange={(event) => {\n                      const nextAgentName = event.target.value;\n                      setAgentName(nextAgentName);\n                      if (agentFocusPopupTimerRef.current !== null) {\n                        window.clearTimeout(agentFocusPopupTimerRef.current);\n                        agentFocusPopupTimerRef.current = null;\n                      }\n                      if (nextAgentName) {\n                        setAgentFocusPopupOpen(true);\n                        agentFocusPopupTimerRef.current = window.setTimeout(() => {\n                          setAgentFocusPopupOpen(false);\n                          agentFocusPopupTimerRef.current = null;\n                        }, 3000);\n                      } else {\n                        setAgentFocusPopupOpen(false);\n                      }\n                    }}\n                    className={inputClass}\n                  >`
      );

      const statusAnchor = `                  ) : (\n                    <span className="mt-2 block text-xs font-semibold text-slate-500">\n                      เลือก Agent เพื่อดูจำนวนเคสที่ประเมินแล้วในเดือนนี้\n                    </span>\n                  )}\n                </label>`;
      if (!next.includes(statusAnchor)) {
        this.error("Agent focus popup patch could not find Agent quota status block.");
      }

      const focusUi = `                  ) : (\n                    <span className="mt-2 block text-xs font-semibold text-slate-500">\n                      เลือก Agent เพื่อดูจำนวนเคสที่ประเมินแล้วในเดือนนี้\n                    </span>\n                  )}\n\n                  {selectedAgentOption ? (\n                    <div className="mt-2 flex min-w-0 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-2.5 py-2 shadow-sm">\n                      <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full border border-emerald-200 bg-white">\n                        {selectedAgentProfilePhoto ? (\n                          <img\n                            src={selectedAgentProfilePhoto}\n                            alt={(selectedAgentOption.agentName || selectedAgentOption.displayName) + " profile"}\n                            className="h-full w-full object-cover"\n                          />\n                        ) : (\n                          <span className="flex h-full w-full items-center justify-center text-[10px] font-black text-emerald-700">\n                            {selectedAgentInitials}\n                          </span>\n                        )}\n                        <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border border-white bg-emerald-500" aria-hidden="true" />\n                      </div>\n                      <div className="min-w-0 flex-1">\n                        <div className="flex min-w-0 items-center gap-2">\n                          <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700">Current Evaluation</span>\n                          <span className="h-3 w-px shrink-0 bg-emerald-200" aria-hidden="true" />\n                          <span className="truncate text-[11px] font-extrabold text-slate-800">\n                            {selectedAgentOption.agentName || selectedAgentOption.displayName}\n                            {selectedAgentOption.role ? " · " + selectedAgentOption.role : ""}\n                          </span>\n                        </div>\n                      </div>\n                    </div>\n                  ) : null}\n                </label>\n\n                {agentFocusPopupOpen && selectedAgentOption ? (\n                  <>\n                    <style>{\`@keyframes evaluationAgentPopupIn { from { opacity: 0; transform: translate3d(14px,-8px,0) scale(.98); } to { opacity: 1; transform: translate3d(0,0,0) scale(1); } }\`}</style>\n                    <aside\n                      className="fixed right-6 top-24 z-[140] w-[340px] overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.22)]"\n                      style={{ animation: "evaluationAgentPopupIn 240ms ease-out" }}\n                      aria-live="polite"\n                    >\n                      <div className="h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500" />\n                      <div className="p-4">\n                        <div className="flex items-start gap-3">\n                          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 border-emerald-100 bg-emerald-50 shadow-sm">\n                            {selectedAgentProfilePhoto ? (\n                              <img\n                                src={selectedAgentProfilePhoto}\n                                alt={(selectedAgentOption.agentName || selectedAgentOption.displayName) + " profile"}\n                                className="h-full w-full object-cover"\n                              />\n                            ) : (\n                              <span className="flex h-full w-full items-center justify-center text-base font-black text-emerald-700">\n                                {selectedAgentInitials}\n                              </span>\n                            )}\n                            <span className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" aria-hidden="true" />\n                          </div>\n                          <div className="min-w-0 flex-1">\n                            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-600">\n                              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" aria-hidden="true" />\n                              กำลังประเมิน\n                            </div>\n                            <div className="mt-1 truncate text-base font-black text-slate-950">\n                              {selectedAgentOption.agentName || selectedAgentOption.displayName}\n                            </div>\n                            <div className="text-xs font-bold text-emerald-700">{selectedAgentOption.role || "Agent"}</div>\n                          </div>\n                          <button\n                            type="button"\n                            onClick={() => setAgentFocusPopupOpen(false)}\n                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"\n                            aria-label="Close agent evaluation popup"\n                          >\n                            ×\n                          </button>\n                        </div>\n\n                        <div className="mt-4 border-t border-slate-100 pt-3">\n                          <div className="text-sm font-bold text-slate-700">กำลังประเมินเคสของ Agent คนนี้</div>\n                          <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold leading-relaxed text-slate-600">\n                            {agentQuotaStatus?.text\n                              ? agentQuotaStatus.text.replace("สถานะการประเมิน:", "").trim()\n                              : "ประเมินแล้ว " + selectedAgentCaseCount + " เคสในเดือนนี้"}\n                          </div>\n                          <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-center text-xs font-black text-emerald-700">\n                            Case in Progress\n                          </div>\n                        </div>\n                      </div>\n                    </aside>\n                  </>\n                ) : null}`;

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
