function replaceOnce(context, code, search, replacement, label) {
  if (!code.includes(search)) context.error(`Team room observer patch could not find ${label}.`);
  return code.replace(search, replacement);
}

export function teamChatRoomsObserverPatch() {
  let typePatched = false;
  let storePatched = false;
  let appPatched = false;

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

      if (cleanId.endsWith("/src/App.tsx")) {
        let next = code;
        next = replaceOnce(
          this,
          next,
          `  const sendChatMessage = async (message: string, toUser?: OnlineUser, attachment?: ChatAttachment) => {`,
          `  const sendChatMessage = async (message: string, toUser?: OnlineUser, attachment?: ChatAttachment, teamName?: string) => {`,
          "App sendChatMessage signature"
        );

        const sendStart = next.indexOf(`  const sendChatMessage = async (`);
        const sendEnd = next.indexOf(`  const editChatMessage = async `, sendStart);
        if (sendStart < 0 || sendEnd < 0) this.error("Team room observer patch could not isolate sendChatMessage.");
        let sendSection = next.slice(sendStart, sendEnd);
        sendSection = replaceOnce(
          this,
          sendSection,
          `      room: toUser ? "private" : "team",\n      toUsername: toUser?.username || "",`,
          `      room: toUser ? "private" : "team",\n      teamName: toUser ? "" : String(teamName || "").trim(),\n      toUsername: toUser?.username || "",`,
          "optimistic teamName"
        );
        sendSection = replaceOnce(
          this,
          sendSection,
          `createStoredChatMessageV2(currentUser, message, toUser, attachment)`,
          `createStoredChatMessageV2(currentUser, message, toUser, attachment, teamName)`,
          "team room message persistence"
        );
        next = next.slice(0, sendStart) + sendSection + next.slice(sendEnd);

        next = replaceOnce(
          this,
          next,
          `  if (message.room === "team") return "team";`,
          `  if (message.room === "team") {\n    const scopedTeam = String(message.teamName || "").trim().toLowerCase();\n    return scopedTeam ? \`team:\${scopedTeam}\` : "team";\n  }`,
          "team room unread key"
        );

        next = replaceOnce(
          this,
          next,
          `        const nextMessages = rows.filter((message) => canCurrentUserSeeChatMessage(message, currentUser));`,
          `        const currentChatAccount = effectiveUserAccounts.find((account) =>\n          account.username.trim().toLowerCase() === currentUser.username.trim().toLowerCase()\n        );\n        const currentChatTeamName = String(currentChatAccount?.teamName || "").trim().toLowerCase();\n        const canObserveTeamRooms =\n          currentUser.username.trim().toLowerCase() === "songpon" ||\n          String(currentUser.role || "").trim().toLowerCase() === "quality assurance";\n        const nextMessages = rows.filter((message) => {\n          if (message.room === "team" && String(message.teamName || "").trim()) {\n            const messageTeamName = String(message.teamName || "").trim().toLowerCase();\n            return canObserveTeamRooms || (Boolean(currentChatTeamName) && messageTeamName === currentChatTeamName);\n          }\n          return canCurrentUserSeeChatMessage(message, currentUser);\n        });`,
          "team room visibility filter"
        );

        next = replaceOnce(
          this,
          next,
          `  }, [currentUser?.username, currentUser?.displayName, currentUser?.role, currentUser?.agentName, maintenanceBlocked, activeTab]);`,
          `  }, [currentUser?.username, currentUser?.displayName, currentUser?.role, currentUser?.agentName, maintenanceBlocked, activeTab, effectiveUserAccounts]);`,
          "team room visibility dependencies"
        );

        appPatched = true;
        return { code: next, map: null };
      }

      return null;
    },

    buildEnd(error) {
      if (error) return;
      if (!typePatched) this.error("Team room observer patch was not applied to ChatMessage type.");
      if (!storePatched) this.error("Team room observer patch was not applied to chat realtime store.");
      if (!appPatched) this.error("Team room observer patch was not applied to App.tsx.");
    },
  };
}
