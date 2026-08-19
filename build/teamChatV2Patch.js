export function teamChatV2Patch() {
  let patched = false;

  return {
    name: "team-chat-v2",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      if (!cleanId.endsWith("/src/App.tsx")) return null;

      const oldImport = 'import TeamChatMockup, { ChatAttachment, ChatMessage, OnlineUser, WebRtcSignal } from "./TeamChatMockup";';
      const newImport = 'import TeamChatMockup from "./TeamChatV2";\nimport { ChatAttachment, ChatMessage, OnlineUser, WebRtcSignal } from "./TeamChatMockup";';
      if (!code.includes(oldImport)) return null;

      let next = code.replace(oldImport, newImport);
      const oldProps = '            onlineUsers={onlineUsers}\n            unreadCounts={chatUnreadCounts}';
      const newProps = '            onlineUsers={onlineUsers}\n            directoryUsers={effectiveUserAccounts}\n            unreadCounts={chatUnreadCounts}';
      next = next.replace(oldProps, newProps);
      patched = next !== code;
      return { code: next, map: null };
    },

    buildEnd() {
      if (!patched) throw new Error("Chat V2 patch was not applied.");
    },
  };
}
