function replaceSection(code, startMarker, endMarker, replacement, label) {
  const start = code.indexOf(startMarker);
  if (start < 0) throw new Error(`Chat realtime patch: ${label} start anchor not found.`);
  const end = code.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`Chat realtime patch: ${label} end anchor not found.`);
  return code.slice(0, start) + replacement + code.slice(end);
}

export function chatRealtimeBackendPatch() {
  let appPatched = false;

  return {
    name: "chat-realtime-backend",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      if (!cleanId.endsWith("/src/App.tsx")) return null;

      let next = code;
      const importAnchor = 'import { clearStoredProfilePhoto, fetchStoredProfilePhoto, upsertStoredProfilePhoto } from "./profilePhotoStore";';
      const importBlock = `${importAnchor}\nimport {\n  createStoredChatCallV2,\n  createStoredChatMessageV2,\n  deleteStoredChatMessageV2,\n  endStoredChatCallV2,\n  markChatPresenceOfflineV2,\n  respondStoredChatCallV2,\n  sendStoredWebRtcSignalV2,\n  subscribeChatMessagesV2,\n  subscribeChatPresenceV2,\n  subscribeChatSignalsV2,\n  touchChatPresenceV2,\n  updateStoredChatMessageV2,\n} from "./chatRealtimeStore";`;
      if (!next.includes(importAnchor)) throw new Error("Chat realtime patch: import anchor not found.");
      next = next.replace(importAnchor, importBlock);

      next = replaceSection(
        next,
        "  const loadChatData = async () => {",
        "  const sendPresence = async () => {",
        `  const loadChatData = async () => {\n    if (!currentUser) return;\n    try {\n      await touchChatPresenceV2(currentUser);\n    } catch (error) {\n      console.warn("Chat refresh/presence touch failed", error);\n    }\n  };\n\n`,
        "loadChatData"
      );

      next = replaceSection(
        next,
        "  const sendPresence = async () => {",
        "  const sendChatMessage = async ",
        `  const sendPresence = async () => {\n    if (!currentUser) return;\n    try {\n      await touchChatPresenceV2(currentUser);\n    } catch (error) {\n      console.warn("Chat presence update failed", error);\n    }\n  };\n\n`,
        "sendPresence"
      );

      next = replaceSection(
        next,
        "  const sendChatMessage = async ",
        "  const editChatMessage = async ",
        `  const sendChatMessage = async (message: string, toUser?: OnlineUser, attachment?: ChatAttachment) => {\n    if (!currentUser) throw new Error("User session is not available.");\n\n    const optimisticId = \`local-chat-\${currentUser.username}-\${Date.now()}-\${Math.random().toString(36).slice(2, 7)}\`;\n    const optimisticMessage = {\n      id: optimisticId,\n      createdAt: new Date().toISOString(),\n      username: currentUser.username,\n      displayName: currentUser.displayName || currentUser.username,\n      role: currentUser.role,\n      message,\n      room: toUser ? "private" : "team",\n      toUsername: toUser?.username || "",\n      toDisplayName: toUser?.displayName || "",\n      attachment,\n      kind: "message",\n      deliveryStatus: "sending",\n    } as ChatMessage & { deliveryStatus?: "sending" | "sent" | "failed" };\n\n    setChatMessages((current) => [...current, optimisticMessage]);\n\n    try {\n      const saved = await Promise.race([\n        createStoredChatMessageV2(currentUser, message, toUser, attachment),\n        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("Chat save timed out.")), 8000)),\n      ]);\n\n      setChatMessages((current) => {\n        const withoutLocal = current.filter((item) => item.id !== optimisticId && item.id !== saved.id);\n        return [...withoutLocal, ({ ...saved, deliveryStatus: "sent" } as ChatMessage & { deliveryStatus?: "sent" })]\n          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());\n      });\n      void sendPresence();\n    } catch (error) {\n      setChatMessages((current) => current.map((item) =>\n        item.id === optimisticId\n          ? ({ ...item, deliveryStatus: "failed" } as ChatMessage & { deliveryStatus?: "failed" })\n          : item\n      ));\n      throw error;\n    }\n  };\n\n`,
        "sendChatMessage"
      );

      next = replaceSection(
        next,
        "  const editChatMessage = async ",
        "  const deleteChatMessage = async ",
        `  const editChatMessage = async (message: ChatMessage, nextMessage: string) => {\n    if (!currentUser) return;\n    await updateStoredChatMessageV2(message, nextMessage);\n  };\n\n`,
        "editChatMessage"
      );

      next = replaceSection(
        next,
        "  const deleteChatMessage = async ",
        "  const startChatCall = async ",
        `  const deleteChatMessage = async (message: ChatMessage) => {\n    if (!currentUser) return;\n    await deleteStoredChatMessageV2(message);\n  };\n\n`,
        "deleteChatMessage"
      );

      next = replaceSection(
        next,
        "  const startChatCall = async ",
        "  const respondChatCall = async ",
        `  const startChatCall = async (toUser?: OnlineUser) => {\n    if (!currentUser) return undefined;\n    const call = await createStoredChatCallV2(currentUser, toUser);\n    void sendPresence();\n    return call.callId || call.id;\n  };\n\n`,
        "startChatCall"
      );

      next = replaceSection(
        next,
        "  const respondChatCall = async ",
        "  const endChatCall = async ",
        `  const respondChatCall = async (message: ChatMessage, response: "accepted" | "declined") => {\n    if (!currentUser) return;\n    await respondStoredChatCallV2(message, response, currentUser);\n  };\n\n`,
        "respondChatCall"
      );

      next = replaceSection(
        next,
        "  const endChatCall = async ",
        "  const sendWebRtcSignal = async ",
        `  const endChatCall = async (message: ChatMessage) => {\n    if (!currentUser) return;\n    await endStoredChatCallV2(message, currentUser);\n  };\n\n`,
        "endChatCall"
      );

      next = replaceSection(
        next,
        "  const sendWebRtcSignal = async ",
        "  const markChatRoomRead = useCallback",
        `  const sendWebRtcSignal = async (signal: Omit<WebRtcSignal, "id" | "createdAt" | "fromUsername">) => {\n    if (!currentUser) return;\n    await sendStoredWebRtcSignalV2(currentUser, signal);\n  };\n\n`,
        "sendWebRtcSignal"
      );

      const pollingStart = `  useEffect(() => {\n    if (!currentUser || maintenanceBlocked || !CHAT_SUPABASE_POLLING_ENABLED) {`;
      const buildMetaStart = `  useEffect(() => {\n    let isMounted = true;`;
      const realtimeEffect = `  useEffect(() => {\n    if (!currentUser || maintenanceBlocked) {\n      setChatMessages([]);\n      setOnlineUsers([]);\n      setWebRtcSignals([]);\n      return;\n    }\n\n    let disposed = false;\n\n    const stopMessages = subscribeChatMessagesV2(\n      (rows) => {\n        if (disposed) return;\n        const nextMessages = rows.filter((message) => canCurrentUserSeeChatMessage(message, currentUser));\n        const latestIncomingMessage = nextMessages\n          .filter((message) => message.username.toLowerCase() !== currentUser.username.toLowerCase())\n          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];\n\n        if (latestIncomingMessage) {\n          const latestKey = \`\${latestIncomingMessage.id}:\${latestIncomingMessage.createdAt}\`;\n          if (!latestIncomingChatRef.current) {\n            latestIncomingChatRef.current = latestKey;\n          } else if (latestIncomingChatRef.current !== latestKey) {\n            latestIncomingChatRef.current = latestKey;\n            playChatNotificationSound();\n          }\n        }\n        setChatMessages(nextMessages);\n      },\n      (error) => console.warn("Realtime chat messages unavailable", error)\n    );\n\n    const stopPresence = subscribeChatPresenceV2(\n      (users) => { if (!disposed) setOnlineUsers(users); },\n      (error) => console.warn("Realtime chat presence unavailable", error)\n    );\n\n    const stopSignals = subscribeChatSignalsV2(\n      (signals) => {\n        if (disposed) return;\n        setWebRtcSignals(signals.filter((signal) => canCurrentUserSeeWebRtcSignal(signal, currentUser)));\n      },\n      (error) => console.warn("Realtime chat signals unavailable", error)\n    );\n\n    void sendPresence();\n    const presenceTimer = window.setInterval(() => void sendPresence(), 4 * 60 * 1000);\n    const handleFocus = () => void sendPresence();\n    const handleVisibility = () => {\n      if (document.visibilityState === "visible") void sendPresence();\n    };\n    window.addEventListener("focus", handleFocus);\n    document.addEventListener("visibilitychange", handleVisibility);\n\n    return () => {\n      disposed = true;\n      stopMessages();\n      stopPresence();\n      stopSignals();\n      window.clearInterval(presenceTimer);\n      window.removeEventListener("focus", handleFocus);\n      document.removeEventListener("visibilitychange", handleVisibility);\n    };\n  }, [currentUser?.username, currentUser?.displayName, currentUser?.role, currentUser?.agentName, maintenanceBlocked]);\n\n`;
      next = replaceSection(next, pollingStart, buildMetaStart, realtimeEffect, "polling effect");

      const logoutAnchor = `    if (logoutUser && !maintenanceBlocked) {\n      void logUsageEvent(logoutUser, "logout", {`;
      const logoutReplacement = `    if (logoutUser) {\n      void markChatPresenceOfflineV2(logoutUser).catch(() => undefined);\n    }\n\n    if (logoutUser && !maintenanceBlocked) {\n      void logUsageEvent(logoutUser, "logout", {`;
      if (!next.includes(logoutAnchor)) throw new Error("Chat realtime patch: logout anchor not found.");
      next = next.replace(logoutAnchor, logoutReplacement);

      appPatched = true;
      return { code: next, map: null };
    },

    buildEnd(error) {
      if (error) return;
      if (!appPatched) throw new Error("Chat realtime backend patch was not applied to App.tsx.");
    },
  };
}
