function replaceUi(context, code, search, replacement, label) {
  if (!code.includes(search)) context.error(`Team room UI patch could not find ${label}.`);
  return code.replace(search, replacement);
}

export function teamChatRoomsUiPatch() {
  let patched = false;

  return {
    name: "team-chat-rooms-ui",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      if (!cleanId.endsWith("/src/TeamChatV2.tsx")) return null;

      let next = code;

      next = replaceUi(
        this,
        next,
        `  const [selectedUsername, setSelectedUsername] = useState("team");`,
        `  const [selectedUsername, setSelectedUsername] = useState("team");\n  const [selectedTeamName, setSelectedTeamName] = useState("");`,
        "selected team state"
      );

      next = replaceUi(
        this,
        next,
        `  onSendMessage: (message: string, toUser?: OnlineUser, attachment?: ChatAttachment) => Promise<void>;`,
        `  onSendMessage: (message: string, toUser?: OnlineUser, attachment?: ChatAttachment, teamName?: string) => Promise<void>;`,
        "send callback signature"
      );

      next = replaceUi(
        this,
        next,
        `  const myUsername = currentUser.username.trim().toLowerCase();`,
        `  const myUsername = currentUser.username.trim().toLowerCase();\n  const normalizeTeamKey = (value: unknown) => String(value || "").trim().toLowerCase();\n  const currentDirectoryUser = directoryUsers.find((user) => String(user.username || "").trim().toLowerCase() === myUsername);\n  const myTeamName = String(currentDirectoryUser?.teamName || "").trim();\n  const canObserveTeamRooms =\n    myUsername === "songpon" || String(currentUser.role || "").trim().toLowerCase() === "quality assurance";`,
        "current team identity"
      );

      const selectedAnchor = `  const selectedUser = contacts.find((user) => user.username.trim().toLowerCase() === selectedUsername.trim().toLowerCase());\n  const selectedRoom = selectedUser ? "private" : "team";\n  const selectedRoomKey = selectedUser ? \`private:\${selectedUser.username.toLowerCase()}\` : "team";`;
      const selectedReplacement = `  const availableTeamRooms = useMemo(() => {\n    const roomMap = new Map<string, { teamName: string; members: DirectoryUser[] }>();\n    directoryUsers.forEach((user) => {\n      if (String(user.status || "Active").toLowerCase().includes("suspend")) return;\n      const teamName = String(user.teamName || "").trim();\n      if (!teamName) return;\n      const key = normalizeTeamKey(teamName);\n      const room = roomMap.get(key) || { teamName, members: [] };\n      room.members.push(user);\n      roomMap.set(key, room);\n    });\n    return Array.from(roomMap.values())\n      .filter((room) => canObserveTeamRooms || normalizeTeamKey(room.teamName) === normalizeTeamKey(myTeamName))\n      .sort((a, b) => a.teamName.localeCompare(b.teamName, "th"));\n  }, [canObserveTeamRooms, directoryUsers, myTeamName]);\n\n  const selectedUser = contacts.find((user) => user.username.trim().toLowerCase() === selectedUsername.trim().toLowerCase());\n  const activeTeamName = selectedUsername === "team" ? selectedTeamName : "";\n  const selectedTeamRoom = activeTeamName\n    ? availableTeamRooms.find((room) => normalizeTeamKey(room.teamName) === normalizeTeamKey(activeTeamName)) || null\n    : null;\n  const isObserverMode = Boolean(\n    selectedTeamRoom && canObserveTeamRooms && normalizeTeamKey(selectedTeamRoom.teamName) !== normalizeTeamKey(myTeamName)\n  );\n  const selectedRoom = selectedUser ? "private" : selectedTeamRoom ? "team-group" : "team";\n  const selectedRoomKey = selectedUser\n    ? \`private:\${selectedUser.username.toLowerCase()}\`\n    : selectedTeamRoom\n      ? \`team:\${normalizeTeamKey(selectedTeamRoom.teamName)}\`\n      : "team";`;
      next = replaceUi(this, next, selectedAnchor, selectedReplacement, "team room selection model");

      const visibleAnchor = `  const visibleMessages = useMemo(() => {\n    if (selectedRoom === "team") return messages.filter((message) => message.room === "team");\n    const otherUsername = selectedUser?.username.toLowerCase() || "";\n    return messages.filter((message) => {\n      if (message.room !== "private") return false;\n      const fromMeToOther = message.username.toLowerCase() === myUsername && String(message.toUsername || "").toLowerCase() === otherUsername;\n      const fromOtherToMe = message.username.toLowerCase() === otherUsername && String(message.toUsername || "").toLowerCase() === myUsername;\n      return fromMeToOther || fromOtherToMe;\n    });\n  }, [messages, myUsername, selectedRoom, selectedUser?.username]);`;
      const visibleReplacement = `  const visibleMessages = useMemo(() => {\n    if (selectedTeamRoom) {\n      const teamKey = normalizeTeamKey(selectedTeamRoom.teamName);\n      return messages.filter((message) =>\n        message.room === "team" && normalizeTeamKey((message as ChatMessage & { teamName?: string }).teamName) === teamKey\n      );\n    }\n    if (selectedRoom === "team") {\n      return messages.filter((message) =>\n        message.room === "team" && !String((message as ChatMessage & { teamName?: string }).teamName || "").trim()\n      );\n    }\n    const otherUsername = selectedUser?.username.toLowerCase() || "";\n    return messages.filter((message) => {\n      if (message.room !== "private") return false;\n      const fromMeToOther = message.username.toLowerCase() === myUsername && String(message.toUsername || "").toLowerCase() === otherUsername;\n      const fromOtherToMe = message.username.toLowerCase() === otherUsername && String(message.toUsername || "").toLowerCase() === myUsername;\n      return fromMeToOther || fromOtherToMe;\n    });\n  }, [messages, myUsername, selectedRoom, selectedTeamRoom?.teamName, selectedUser?.username]);`;
      next = replaceUi(this, next, visibleAnchor, visibleReplacement, "team room messages");

      next = replaceUi(
        this,
        next,
        `  const roomTitle = selectedUser ? selectedUser.displayName : "All Team";\n  const roomSubtitle = selectedUser\n    ? \`\${selectedUser.online ? "Online" : "Offline"} · @\${selectedUser.username}\${selectedUser.teamName ? \` · \${selectedUser.teamName}\` : ""}\`\n    : \`\${onlineRoster.length} online · Messages visible to everyone in Team Chat\`;`,
        `  const roomTitle = selectedUser ? selectedUser.displayName : selectedTeamRoom ? selectedTeamRoom.teamName : "All Team";\n  const roomSubtitle = selectedUser\n    ? \`\${selectedUser.online ? "Online" : "Offline"} · @\${selectedUser.username}\${selectedUser.teamName ? \` · \${selectedUser.teamName}\` : ""}\`\n    : selectedTeamRoom\n      ? \`\${selectedTeamRoom.members.length} members · \${isObserverMode ? "Observer · Read only" : "Team Room"}\`\n      : \`\${onlineRoster.length} online · Messages visible to everyone in Team Chat\`;`,
        "room title"
      );

      next = replaceUi(
        this,
        next,
        `    const message = draft.trim();\n    if (!message && !attachment) return;`,
        `    const message = draft.trim();\n    if (isObserverMode) return;\n    if (!message && !attachment) return;`,
        "observer send guard"
      );

      next = replaceUi(
        this,
        next,
        `    void onSendMessage(message, recipient, outgoingAttachment).catch(() => {`,
        `    void onSendMessage(message, recipient, outgoingAttachment, activeTeamName || undefined).catch(() => {`,
        "team send target"
      );

      next = replaceUi(
        this,
        next,
        `onClick={() => setSelectedUsername("team")}`,
        `onClick={() => { setSelectedTeamName(""); setSelectedUsername("team"); }}`,
        "All Team navigation"
      );

      const teamListAnchor = `                {contactView === "teams" ? (\n                  <div className="space-y-4 pt-2">\n                    {teamGroups.map(([teamName, users]) => (\n                      <div key={teamName}>\n                        <div className="px-2 pb-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{teamName} · {users.length}</div>\n                        <div className="space-y-1">{users.map(renderContact)}</div>\n                      </div>\n                    ))}\n                  </div>\n                ) : (`;
      const teamListReplacement = `                {contactView === "teams" ? (\n                  <div className="space-y-4 pt-2">\n                    <div>\n                      <div className="px-2 pb-2 text-[10px] font-black uppercase tracking-[0.16em] text-violet-600">Team Rooms</div>\n                      <div className="space-y-1">\n                        {availableTeamRooms.map((room) => {\n                          const roomKey = \`team:\${normalizeTeamKey(room.teamName)}\`;\n                          const observing = canObserveTeamRooms && normalizeTeamKey(room.teamName) !== normalizeTeamKey(myTeamName);\n                          const active = Boolean(selectedTeamRoom && normalizeTeamKey(selectedTeamRoom.teamName) === normalizeTeamKey(room.teamName));\n                          return (\n                            <button key={room.teamName} type="button" onClick={() => { setSelectedUsername("team"); setSelectedTeamName(room.teamName); }} className={\`w-full rounded-2xl border px-3 py-3 text-left transition \${active ? "border-violet-300 bg-violet-50 shadow-sm" : "border-transparent bg-white hover:border-slate-200"}\`}>\n                              <div className="flex items-center gap-3">\n                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-700 to-fuchsia-600 text-[10px] font-black text-white">TEAM</div>\n                                <div className="min-w-0 flex-1">\n                                  <div className="flex items-center gap-2">\n                                    <div className="truncate text-sm font-bold text-slate-950">{room.teamName}</div>\n                                    {Number(unreadCounts[roomKey] || 0) ? <span className="ml-auto rounded-full bg-violet-700 px-2 py-0.5 text-[10px] font-black text-white">{unreadCounts[roomKey]}</span> : null}\n                                  </div>\n                                  <div className="mt-0.5 flex items-center gap-2 text-xs font-medium text-slate-500">\n                                    <span>{room.members.length} members</span>\n                                    {observing ? <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-white">Observer</span> : null}\n                                  </div>\n                                </div>\n                              </div>\n                            </button>\n                          );\n                        })}\n                        {!availableTeamRooms.length ? <div className="rounded-2xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs font-semibold text-slate-400">No team room available.</div> : null}\n                      </div>\n                    </div>\n\n                    <div>\n                      <div className="px-2 pb-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">People by Team</div>\n                      {teamGroups\n                        .filter(([teamName]) => canObserveTeamRooms || normalizeTeamKey(teamName) === normalizeTeamKey(myTeamName))\n                        .map(([teamName, users]) => (\n                          <div key={teamName} className="mt-3">\n                            <div className="px-2 pb-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{teamName} · {users.length}</div>\n                            <div className="space-y-1">{users.map(renderContact)}</div>\n                          </div>\n                        ))}\n                    </div>\n                  </div>\n                ) : (`;
      next = replaceUi(this, next, teamListAnchor, teamListReplacement, "Team Rooms navigation");

      next = replaceUi(
        this,
        next,
        `{selectedUser ? initials(selectedUser.displayName) : "ALL"}`,
        `{selectedUser ? initials(selectedUser.displayName) : selectedTeamRoom ? "TM" : "ALL"}`,
        "team room avatar"
      );

      const callButton = `<button type="button" onClick={() => void startVoiceCall()} className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:border-violet-200 hover:bg-violet-50">{selectedUser ? "Voice Call" : "Group Call Invite"}</button>`;
      next = replaceUi(
        this,
        next,
        callButton,
        `{!selectedTeamRoom ? <button type="button" onClick={() => void startVoiceCall()} className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:border-violet-200 hover:bg-violet-50">{selectedUser ? "Voice Call" : "Group Call Invite"}</button> : null}`,
        "team room call lock"
      );

      next = replaceUi(
        this,
        next,
        `<div className="border-t border-slate-200 bg-white px-4 py-4">`,
        `{isObserverMode ? (\n              <div className="border-t border-slate-200 bg-slate-950 px-5 py-4 text-white">\n                <div className="mx-auto flex max-w-[980px] items-center gap-3">\n                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-lg">◉</div>\n                  <div>\n                    <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-200">Observer Mode · Read only</div>\n                    <div className="mt-0.5 text-xs font-medium text-slate-300">กำลังดูห้อง {selectedTeamRoom?.teamName} แบบ Observer โดยบัญชีของคุณไม่ถูกเพิ่มเป็นสมาชิกห้องนี้</div>\n                  </div>\n                </div>\n              </div>\n            ) : null}\n            <div className="border-t border-slate-200 bg-white px-4 py-4">`,
        "observer banner"
      );

      next = replaceUi(
        this,
        next,
        `<textarea value={draft} onChange={(event) => setDraft(event.target.value)} onPaste={handlePaste} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void handleSubmit(); } }} placeholder={selectedUser ? \`Message \${selectedUser.displayName}...\` : "Message everyone..."} rows={1}`,
        `<textarea value={draft} disabled={isObserverMode} onChange={(event) => setDraft(event.target.value)} onPaste={handlePaste} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void handleSubmit(); } }} placeholder={isObserverMode ? "Observer mode is read only" : selectedUser ? \`Message \${selectedUser.displayName}...\` : selectedTeamRoom ? \`Message \${selectedTeamRoom.teamName}...\` : "Message everyone..."} rows={1}`,
        "observer composer"
      );

      next = replaceUi(
        this,
        next,
        `disabled={sending || (!draft.trim() && !attachment)}`,
        `disabled={isObserverMode || sending || (!draft.trim() && !attachment)}`,
        "observer send button"
      );

      next = replaceUi(
        this,
        next,
        `{selectedUser ? \`Send a private message to \${selectedUser.displayName}.\` : "Send a message to everyone in Team Chat."}`,
        `{selectedUser ? \`Send a private message to \${selectedUser.displayName}.\` : selectedTeamRoom ? (isObserverMode ? \`Read-only view of \${selectedTeamRoom.teamName}.\` : \`Send a message to \${selectedTeamRoom.teamName}.\`) : "Send a message to everyone in Team Chat."}`,
        "team room empty state"
      );

      patched = true;
      return { code: next, map: null };
    },

    buildEnd(error) {
      if (error) return;
      if (!patched) this.error("Team room UI patch was not applied to TeamChatV2.tsx.");
    },
  };
}
