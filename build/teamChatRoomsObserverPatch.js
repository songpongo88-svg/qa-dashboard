function replaceOnce(context, code, search, replacement, label) {
  if (!code.includes(search)) context.error(`Team room observer patch could not find ${label}.`);
  return code.replace(search, replacement);
}

export function teamChatRoomsObserverPatch() {
  let typePatched = false;
  let storePatched = false;
  let appPatched = false;
  let uiPatched = false;

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

      if (!cleanId.endsWith("/src/TeamChatV2.tsx")) return null;

      let next = code;

      next = replaceOnce(
        this,
        next,
        `  const [selectedUsername, setSelectedUsername] = useState("team");`,
        `  const [selectedUsername, setSelectedUsername] = useState("team");\n  const [selectedTeamName, setSelectedTeamName] = useState("");`,
        "selected team room state"
      );

      next = replaceOnce(
        this,
        next,
        `  onSendMessage: (message: string, toUser?: OnlineUser, attachment?: ChatAttachment) => Promise<void>;`,
        `  onSendMessage: (message: string, toUser?: OnlineUser, attachment?: ChatAttachment, teamName?: string) => Promise<void>;`,
        "TeamChatV2 send prop"
      );

      next = replaceOnce(
        this,
        next,
        `  const myUsername = currentUser.username.trim().toLowerCase();`,
        `  const myUsername = currentUser.username.trim().toLowerCase();\n  const normalizeTeamKey = (value: unknown) => String(value || "").trim().toLowerCase();\n  const currentDirectoryUser = directoryUsers.find((user) => String(user.username || "").trim().toLowerCase() === myUsername);\n  const myTeamName = String(currentDirectoryUser?.teamName || "").trim();\n  const canObserveTeamRooms =\n    myUsername === "songpon" || String(currentUser.role || "").trim().toLowerCase() === "quality assurance";`,
        "team room identity"
      );

      const selectedUserAnchor = `  const selectedUser = contacts.find((user) => user.username.trim().toLowerCase() === selectedUsername.trim().toLowerCase());\n  const selectedRoom = selectedUser ? "private" : "team";\n  const selectedRoomKey = selectedUser ? \`private:\${selectedUser.username.toLowerCase()}\` : "team";`;
      const selectedUserReplacement = `  const availableTeamRooms = useMemo(() => {\n    const roomMap = new Map<string, { teamName: string; members: DirectoryUser[] }>();\n    directoryUsers.forEach((user) => {\n      if (String(user.status || "Active").toLowerCase().includes("suspend")) return;\n      const teamName = String(user.teamName || "").trim();\n      if (!teamName) return;\n      const key = normalizeTeamKey(teamName);\n      const existing = roomMap.get(key) || { teamName, members: [] };\n      existing.members.push(user);\n      roomMap.set(key, existing);\n    });\n    return Array.from(roomMap.values())\n      .filter((room) => canObserveTeamRooms || normalizeTeamKey(room.teamName) === normalizeTeamKey(myTeamName))\n      .sort((a, b) => a.teamName.localeCompare(b.teamName, "th"));\n  }, [canObserveTeamRooms, directoryUsers, myTeamName]);\n\n  const selectedUser = contacts.find((user) => user.username.trim().toLowerCase() === selectedUsername.trim().toLowerCase());\n  const activeTeamName = selectedUsername === "team" ? selectedTeamName : "";\n  const selectedTeamRoom = activeTeamName\n    ? availableTeamRooms.find((room) => normalizeTeamKey(room.teamName) === normalizeTeamKey(activeTeamName)) || null\n    : null;\n  const isObserverMode = Boolean(\n    selectedTeamRoom && canObserveTeamRooms && normalizeTeamKey(selectedTeamRoom.teamName) !== normalizeTeamKey(myTeamName)\n  );\n  const selectedRoom = selectedUser ? "private" : selectedTeamRoom ? "team-group" : "team";\n  const selectedRoomKey = selectedUser\n    ? \`private:\${selectedUser.username.toLowerCase()}\`\n    : selectedTeamRoom\n      ? \`team:\${normalizeTeamKey(selectedTeamRoom.teamName)}\`\n      : "team";`;
      next = replaceOnce(this, next, selectedUserAnchor, selectedUserReplacement, "team room selection model");

      const visibleBlock = `  const visibleMessages = useMemo(() => {\n    if (selectedRoom === "team") return messages.filter((message) => message.room === "team");\n    const otherUsername = selectedUser?.username.toLowerCase() || "";\n    return messages.filter((message) => {\n      if (message.room !== "private") return false;\n      const fromMeToOther = message.username.toLowerCase() === myUsername && String(message.toUsername || "").toLowerCase() === otherUsername;\n      const fromOtherToMe = message.username.toLowerCase() === otherUsername && String(message.toUsername || "").toLowerCase() === myUsername;\n      return fromMeToOther || fromOtherToMe;\n    });\n  }, [messages, myUsername, selectedRoom, selectedUser?.username]);`;
      const visibleReplacement = `  const visibleMessages = useMemo(() => {\n    if (selectedTeamRoom) {\n      const teamKey = normalizeTeamKey(selectedTeamRoom.teamName);\n      return messages.filter((message) =>\n        message.room === "team" && normalizeTeamKey(message.teamName) === teamKey\n      );\n    }\n    if (selectedRoom === "team") {\n      return messages.filter((message) => message.room === "team" && !String(message.teamName || "").trim());\n    }\n    const otherUsername = selectedUser?.username.toLowerCase() || "";\n    return messages.filter((message) => {\n      if (message.room !== "private") return false;\n      const fromMeToOther = message.username.toLowerCase() === myUsername && String(message.toUsername || "").toLowerCase() === otherUsername;\n      const fromOtherToMe = message.username.toLowerCase() === otherUsername && String(message.toUsername || "").toLowerCase() === myUsername;\n      return fromMeToOther || fromOtherToMe;\n    });\n  }, [messages, myUsername, selectedRoom, selectedTeamRoom?.teamName, selectedUser?.username]);`;
      next = replaceOnce(this, next, visibleBlock, visibleReplacement, "team room message filtering");

      next = replaceOnce(
        this,
        next,
        `  const roomTitle = selectedUser ? selectedUser.displayName : "All Team";\n  const roomSubtitle = selectedUser\n    ? \`\${selectedUser.online ? "Online" : "Offline"} · @\${selectedUser.username}\${selectedUser.teamName ? \` · \${selectedUser.teamName}\` : ""}\`\n    : \`\${onlineRoster.length} online · Messages visible to everyone in Team Chat\`;`,
        `  const roomTitle = selectedUser ? selectedUser.displayName : selectedTeamRoom ? selectedTeamRoom.teamName : "All Team";\n  const roomSubtitle = selectedUser\n    ? \`\${selectedUser.online ? "Online" : "Offline"} · @\${selectedUser.username}\${selectedUser.teamName ? \` · \${selectedUser.teamName}\` : ""}\`\n    : selectedTeamRoom\n      ? \`\${selectedTeamRoom.members.length} members · \${isObserverMode ? "Observer · Read only" : "Team Room"}\`\n      : \`\${onlineRoster.length} online · Messages visible to everyone in Team Chat\`;`,
        "team room title"
      );

      next = replaceOnce(
        this,
        next,
        `    const message = draft.trim();\n    if (!message && !attachment) return;`,
        `    const message = draft.trim();\n    if (isObserverMode) return;\n    if (!message && !attachment) return;`,
        "observer send guard"
      );
      next = replaceOnce(
        this,
        next,
        `    void onSendMessage(message, recipient, outgoingAttachment).catch(() => {`,
        `    void onSendMessage(message, recipient, outgoingAttachment, activeTeamName || undefined).catch(() => {`,
        "team room send target"
      );

      next = replaceOnce(
        this,
        next,
        `onClick={() => setSelectedUsername("team")}`,
        `onClick={() => { setSelectedTeamName(""); setSelectedUsername("team"); }}`,
        "All Team navigation"
      );

      const oldTeamsList = `                {contactView === "teams" ? (\n                  <div className="space-y-4 pt-2">\n                    {teamGroups.map(([teamName, users]) => (\n                      <div key={teamName}>\n                        <div className="px-2 pb-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{teamName} · {users.length}</div>\n                        <div className="space-y-1">{users.map(renderContact)}</div>\n                      </div>\n                    ))}\n                  </div>\n                ) : (`;
      const newTeamsList = `                {contactView === "teams" ? (\n                  <div className="space-y-4 pt-2">\n                    <div>\n                      <div className="px-2 pb-2 text-[10px] font-black uppercase tracking-[0.16em] text-violet-600">Team Rooms</div>\n                      <div className="space-y-1">\n                        {availableTeamRooms.map((room) => {\n                          const roomKey = \`team:\${normalizeTeamKey(room.teamName)}\`;\n                          const observing = canObserveTeamRooms && normalizeTeamKey(room.teamName) !== normalizeTeamKey(myTeamName);\n                          const active = selectedTeamRoom && normalizeTeamKey(selectedTeamRoom.teamName) === normalizeTeamKey(room.teamName);\n                          return (\n                            <button\n                              key={room.teamName}\n                              type="button"\n                              onClick={() => { setSelectedUsername("team"); setSelectedTeamName(room.teamName); }}\n                              className={\`w-full rounded-2xl border px-3 py-3 text-left transition \${active ? "border-violet-300 bg-violet-50 shadow-sm" : "border-transparent bg-white hover:border-slate-200"}\`}\n                            >\n                              <div className="flex items-center gap-3">\n                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-700 to-fuchsia-600 text-xs font-black text-white">TEAM</div>\n                                <div className="min-w-0 flex-1">\n                                  <div className="flex items-center gap-2">\n                                    <div className="truncate text-sm font-bold text-slate-950">{room.teamName}</div>\n                                    {Number(unreadCounts[roomKey] || 0) ? <span className="ml-auto rounded-full bg-violet-700 px-2 py-0.5 text-[10px] font-black text-white">{unreadCounts[roomKey]}</span> : null}\n                                  </div>\n                                  <div className="mt-0.5 flex items-center gap-2 text-xs font-medium text-slate-500">\n                                    <span>{room.members.length} members</span>\n                                    {observing ? <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-white">Observer</span> : null}\n                                  </div>\n                                </div>\n                              </div>\n                            </button>\n                          );\n                        })}\n                        {!availableTeamRooms.length ? <div className="rounded-2xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs font-semibold text-slate-400">No team room available.</div> : null}\n                      </div>\n                    </div>\n\n                    <div>\n                      <div className="px-2 pb-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">People by Team</div>\n                      {teamGroups\n                        .filter(([teamName]) => canObserveTeamRooms || normalizeTeamKey(teamName) === normalizeTeamKey(myTeamName))\n                        .map(([teamName, users]) => (\n                          <div key={teamName} className="mt-3">\n                            <div className="px-2 pb-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{teamName} · {users.length}</div>\n                            <div className="space-y-1">{users.map(renderContact)}</div>\n                          </div>\n                        ))}\n                    </div>\n                  </div>\n                ) : (`;
      next = replaceOnce(this, next, oldTeamsList, newTeamsList, "Team Rooms navigation");

      next = replaceOnce(
        this,
        next,
        `{selectedUser ? initials(selectedUser.displayName) : "ALL"}`,
        `{selectedUser ? initials(selectedUser.displayName) : selectedTeamRoom ? "TM" : "ALL"}`,
        "team room header avatar"
      );

      const callButton = `<button type="button" onClick={() => void startVoiceCall()} className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:border-violet-200 hover:bg-violet-50">{selectedUser ? "Voice Call" : "Group Call Invite"}</button>`;
      next = replaceOnce(
        this,
        next,
        callButton,
        `{!selectedTeamRoom ? <button type="button" onClick={() => void startVoiceCall()} className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:border-violet-200 hover:bg-violet-50">{selectedUser ? "Voice Call" : "Group Call Invite"}</button> : null}`,
        "team room call suppression"
      );

      next = replaceOnce(
        this,
        next,
        `<div className="border-t border-slate-200 bg-white px-4 py-4">`,
        `{isObserverMode ? (\n              <div className="border-t border-slate-200 bg-slate-950 px-5 py-4 text-white">\n                <div className="mx-auto flex max-w-[980px] items-center gap-3">\n                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-lg">◉</div>\n                  <div>\n                    <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-200">Observer Mode · Read only</div>\n                    <div className="mt-0.5 text-xs font-medium text-slate-300">คุณกำลังดูห้อง {selectedTeamRoom?.teamName} แบบ Observer และจะไม่ถูกเพิ่มเป็นสมาชิกของห้องนี้</div>\n                  </div>\n                </div>\n              </div>\n            ) : null}\n            <div className="border-t border-slate-200 bg-white px-4 py-4">`,
        "observer mode banner"
      );

      next = replaceOnce(
        this,
        next,
        `<label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-2xl text-lg font-bold text-slate-500 transition hover:bg-white hover:text-violet-700">＋<input type="file" className="hidden" onChange={handleFileChange} /></label>`,
        `<label className={\`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg font-bold transition \${isObserverMode ? "pointer-events-none cursor-not-allowed text-slate-300 opacity-40" : "cursor-pointer text-slate-500 hover:bg-white hover:text-violet-700"}\`}>＋<input type="file" disabled={isObserverMode} className="hidden" onChange={handleFileChange} /></label>`,
        "observer attachment lock"
      );

      next = replaceOnce(
        this,
        next,
        `<textarea value={draft} onChange={(event) => setDraft(event.target.value)} onPaste={handlePaste} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void handleSubmit(); } }} placeholder={selectedUser ? \`Message \${selectedUser.displayName}...\` : "Message everyone..."} rows={1}`,
        `<textarea value={draft} disabled={isObserverMode} onChange={(event) => setDraft(event.target.value)} onPaste={handlePaste} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void handleSubmit(); } }} placeholder={isObserverMode ? "Observer mode is read only" : selectedUser ? \`Message \${selectedUser.displayName}...\` : selectedTeamRoom ? \`Message \${selectedTeamRoom.teamName}...\` : "Message everyone..."} rows={1}`,
        "observer composer lock"
      );

      next = replaceOnce(
        this,
        next,
        `disabled={sending || (!draft.trim() && !attachment)}`,
        `disabled={isObserverMode || sending || (!draft.trim() && !attachment)}`,
        "observer send button lock"
      );

      next = replaceOnce(
        this,
        next,
        `{selectedUser ? \`Send a private message to \${selectedUser.displayName}.\` : "Send a message to everyone in Team Chat."}`,
        `{selectedUser ? \`Send a private message to \${selectedUser.displayName}.\` : selectedTeamRoom ? (isObserverMode ? \`Read-only view of \${selectedTeamRoom.teamName}.\` : \`Send a message to \${selectedTeamRoom.teamName}.\`) : "Send a message to everyone in Team Chat."}`,
        "team room empty state"
      );

      uiPatched = true;
      return { code: next, map: null };
    },

    buildEnd(error) {
      if (error) return;
      if (!typePatched) this.error("Team room observer patch was not applied to ChatMessage type.");
      if (!storePatched) this.error("Team room observer patch was not applied to chat realtime store.");
      if (!appPatched) this.error("Team room observer patch was not applied to App.tsx.");
      if (!uiPatched) this.error("Team room observer patch was not applied to TeamChatV2.tsx.");
    },
  };
}
