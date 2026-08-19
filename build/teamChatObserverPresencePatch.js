function replacePresence(context, code, search, replacement, label) {
  if (!code.includes(search)) context.error(`Observer presence patch could not find ${label}.`);
  return code.replace(search, replacement);
}

export function teamChatObserverPresencePatch() {
  let appPatched = false;
  let uiPatched = false;

  return {
    name: "team-chat-observer-presence",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];

      if (cleanId.endsWith("/src/App.tsx")) {
        let next = code;

        next = replacePresence(
          this,
          next,
          `  const latestIncomingChatRef = useRef("");`,
          `  const latestIncomingChatRef = useRef("");\n  const chatObserverHiddenRef = useRef(false);`,
          "observer presence ref"
        );

        next = replacePresence(
          this,
          next,
          `  const sendPresence = async () => {\n    if (!currentUser) return;`,
          `  const sendPresence = async () => {\n    if (!currentUser || chatObserverHiddenRef.current) return;`,
          "presence suppression guard"
        );

        const loadChatAnchor = `  const loadChatData = async () => {`;
        const observerEffect = `  useEffect(() => {\n    const handleObserverMode = (event: Event) => {\n      const hidden = Boolean((event as CustomEvent<{ active?: boolean }>).detail?.active);\n      chatObserverHiddenRef.current = hidden;\n      if (!currentUser) return;\n\n      if (hidden) {\n        void markChatPresenceOfflineV2(currentUser).catch((error) =>\n          console.warn("Observer presence hide failed", error)\n        );\n      } else if (activeTab === "team-chat" || activeTab === "call-history") {\n        void touchChatPresenceV2(currentUser).catch((error) =>\n          console.warn("Observer presence restore failed", error)\n        );\n      }\n    };\n\n    window.addEventListener("qa-chat-observer-mode", handleObserverMode as EventListener);\n    return () => window.removeEventListener("qa-chat-observer-mode", handleObserverMode as EventListener);\n  }, [activeTab, currentUser?.username, currentUser?.displayName, currentUser?.role, currentUser?.agentName]);\n\n`;
        if (!next.includes(loadChatAnchor)) this.error("Observer presence patch could not find Chat load anchor.");
        next = next.replace(loadChatAnchor, observerEffect + loadChatAnchor);

        appPatched = true;
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/TeamChatV2.tsx")) {
        let next = code;
        const visibleAnchor = `  const visibleMessages = useMemo(() => {`;
        const observerDispatch = `  useEffect(() => {\n    window.dispatchEvent(new CustomEvent("qa-chat-observer-mode", { detail: { active: isObserverMode } }));\n    return () => {\n      if (isObserverMode) {\n        window.dispatchEvent(new CustomEvent("qa-chat-observer-mode", { detail: { active: false } }));\n      }\n    };\n  }, [isObserverMode]);\n\n`;
        if (!next.includes(visibleAnchor)) this.error("Observer presence patch could not find TeamChat visible message anchor.");
        next = next.replace(visibleAnchor, observerDispatch + visibleAnchor);
        uiPatched = true;
        return { code: next, map: null };
      }

      return null;
    },

    buildEnd(error) {
      if (error) return;
      if (!appPatched) this.error("Observer presence patch was not applied to App.tsx.");
      if (!uiPatched) this.error("Observer presence patch was not applied to TeamChatV2.tsx.");
    },
  };
}
