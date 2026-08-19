function replaceOnce(context, code, search, replacement, label) {
  if (!code.includes(search)) context.error(`Team room observer patch could not find ${label}.`);
  return code.replace(search, replacement);
}

export function teamChatRoomsObserverPatch() {
  let typePatched = false;
  let storePatched = false;

  return {
    name: "team-chat-rooms-observer",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];

      if (cleanId.endsWith("/src/TeamChatMockup.tsx")) {
        let next = code;
        next = replaceOnce(
          this,
          next,
          `  toDisplayName?: string;\n  attachment?: ChatAttachment;`,
          `  toDisplayName?: string;\n  teamName?: string;\n  attachment?: ChatAttachment;`,
          "ChatMessage teamName type"
        );
        typePatched = true;
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/chatRealtimeStore.ts")) {
        let next = code;
        next = replaceOnce(
          this,
          next,
          `    toDisplayName: clean(row.toDisplayName || row.to_display_name),\n    attachment,`,
          `    toDisplayName: clean(row.toDisplayName || row.to_display_name),\n    teamName: clean(row.teamName || row.team_name),\n    attachment,`,
          "chat store teamName parsing"
        );
        next = replaceOnce(
          this,
          next,
          `  toUser?: OnlineUser,\n  attachment?: ChatAttachment\n) {`,
          `  toUser?: OnlineUser,\n  attachment?: ChatAttachment,\n  teamName?: string\n) {`,
          "chat store create signature"
        );
        next = replaceOnce(
          this,
          next,
          `    toDisplayName: clean(toUser?.displayName),\n    attachment: attachment || null,`,
          `    toDisplayName: clean(toUser?.displayName),\n    teamName: toUser ? "" : clean(teamName),\n    attachment: attachment || null,`,
          "chat store teamName payload"
        );
        storePatched = true;
        return { code: next, map: null };
      }

      return null;
    },

    buildEnd(error) {
      if (error) return;
      if (!typePatched) this.error("Team room observer patch was not applied to ChatMessage type.");
      if (!storePatched) this.error("Team room observer patch was not applied to chat realtime store.");
    },
  };
}
